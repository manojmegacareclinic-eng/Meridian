import { and, eq, gt, gte, inArray, isNotNull, lt, lte, notInArray, sql } from "drizzle-orm";
import type { Db } from "@workspace/db";
import {
  agreementsTable,
  countriesTable,
  meetingsTable,
  ministriesTable,
  notificationsTable,
  officeTermsTable,
  positionsTable,
  tasksTable,
  userTable,
} from "@workspace/db";
import { authPassthrough } from "../middlewares/guards";
import { findFindingCandidates } from "./intelligence";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);
const toISO = (value?: Date | string | null) => (value ? new Date(value).toISOString() : null);

export type NotificationCandidate = {
  kind: string;
  fingerprint: string;
  title: string;
  body: string;
  countryId: number | null;
  entityType: string;
  entityId: number;
};

const staffUserIds = async (db: Db): Promise<string[]> => {
  const rows = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.banned, false));
  return rows.map((r) => r.id);
};

/**
 * In AUTH_PASSTHROUGH demo mode the actor is the sentinel id "passthrough"
 * (see requireSession in middlewares/guards.ts). The reconcile must guarantee
 * that recipient row exists so the FK is satisfied and demo route-qa gets a
 * deterministic feed. No-op in real-auth mode.
 */
const ensureSentinelRecipient = async (db: Db): Promise<void> => {
  if (!authPassthrough()) return;
  await db
    .insert(userTable)
    .values({ id: "passthrough", name: "Demo", email: "passthrough@meridian.local" })
    .onConflictDoNothing();
};

const allRecipients = async (db: Db, includeSentinel = true): Promise<string[]> => {
  const [users, _sentinel] = await Promise.all([staffUserIds(db), includeSentinel ? ensureSentinelRecipient(db) : Promise.resolve()]);
  if (authPassthrough() && includeSentinel && !users.includes("passthrough")) users.push("passthrough");
  return users;
};

const countryAssigneesOrStaff = async (db: Db, countryId: number): Promise<string[]> => {
  const [country] = await db
    .select()
    .from(countriesTable)
    .where(eq(countriesTable.id, countryId));
  const assignees = [
    country?.primaryOwnerUserId,
    country?.secondaryOwnerUserId,
    country?.reviewerUserId,
    country?.regionalCoordinatorUserId,
  ].filter((id): id is string => id != null);
  if (assignees.length > 0) return assignees;
  return allRecipients(db);
};

function positionCandidates(db: Db): Promise<NotificationCandidate[]> {
  return db
    .select({
      id: officeTermsTable.id,
      personName: officeTermsTable.personName,
      positionTitle: positionsTable.title,
      ministryName: ministriesTable.name,
      countryId: ministriesTable.countryId,
      countryName: countriesTable.name,
    })
    .from(officeTermsTable)
    .innerJoin(positionsTable, eq(officeTermsTable.positionId, positionsTable.id))
    .innerJoin(ministriesTable, eq(positionsTable.ministryId, ministriesTable.id))
    .innerJoin(countriesTable, eq(ministriesTable.countryId, countriesTable.id))
    .where(eq(officeTermsTable.isCurrent, 1))
    .then((rows) =>
      rows.map((row) => ({
        kind: "position_change",
        fingerprint: `position_change:${row.id}`,
        title: `New position holder — ${row.positionTitle} — ${row.ministryName} — ${row.countryName}`,
        body: `${row.personName} is now the current holder of ${row.positionTitle}.`,
        countryId: row.countryId,
        entityType: "office_term",
        entityId: row.id,
      }))
    );
}

function meetingCandidates(db: Db): Promise<NotificationCandidate[]> {
  const now = Date.now();
  const windowEnd = now + 48 * HOUR_MS;
  return db
    .select({
      id: meetingsTable.id,
      title: meetingsTable.title,
      countryId: meetingsTable.countryId,
      countryName: countriesTable.name,
      date: meetingsTable.date,
      actionArea: meetingsTable.actionArea,
    })
    .from(meetingsTable)
    .innerJoin(countriesTable, eq(meetingsTable.countryId, countriesTable.id))
    .where(and(eq(meetingsTable.status, "scheduled"), gt(meetingsTable.date, new Date(now)), lte(meetingsTable.date, new Date(windowEnd))))
    .then((rows) =>
      rows.map((row) => ({
        kind: "meeting_upcoming",
        fingerprint: `meeting_upcoming:${row.id}`,
        title: `Upcoming meeting — ${row.title} — ${row.countryName}`,
        body: `Scheduled ${toISO(row.date)} · ${row.actionArea}.`,
        countryId: row.countryId,
        entityType: "meeting",
        entityId: row.id,
      }))
    );
}

function agreementCandidates(db: Db): Promise<NotificationCandidate[]> {
  const today = dayOnly(new Date());
  const horizon = dayOnly(new Date(Date.now() + 30 * DAY_MS));
  return db
    .select({
      id: agreementsTable.id,
      name: agreementsTable.name,
      type: agreementsTable.type,
      countryId: agreementsTable.countryId,
      countryName: countriesTable.name,
      renewalDate: agreementsTable.renewalDate,
    })
    .from(agreementsTable)
    .innerJoin(countriesTable, eq(agreementsTable.countryId, countriesTable.id))
    .where(
      and(
        inArray(agreementsTable.lifecycleState, ["approved", "signed"]),
        gte(agreementsTable.renewalDate, today as string),
        lte(agreementsTable.renewalDate, horizon as string),
        isNotNull(agreementsTable.renewalDate),
      )
    )
    .then((rows) =>
      rows.map((row) => ({
        kind: "agreement_expiring",
        fingerprint: `agreement_expiring:${row.id}`,
        title: `Agreement expiring — ${row.name} — ${row.countryName}`,
        body: `Renewal date ${row.renewalDate} · ${row.type}.`,
        countryId: row.countryId,
        entityType: "agreement",
        entityId: row.id,
      }))
    );
}

function taskCandidates(db: Db): Promise<NotificationCandidate[]> {
  const today = dayOnly(new Date());
  return db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      actionArea: tasksTable.actionArea,
      countryId: tasksTable.countryId,
      countryName: countriesTable.name,
      dueDate: tasksTable.dueDate,
    })
    .from(tasksTable)
    .innerJoin(countriesTable, eq(tasksTable.countryId, countriesTable.id))
    .where(
      and(
        eq(tasksTable.status, "active"),
        isNotNull(tasksTable.dueDate),
        lt(tasksTable.dueDate as any, today as string),
      )
    )
    .then((rows) =>
      rows.map((row) => ({
        kind: "follow_up_overdue",
        fingerprint: `follow_up_overdue:${row.id}`,
        title: `Overdue follow-up — ${row.title} — ${row.countryName}`,
        body: `Due ${row.dueDate} · ${row.actionArea}.`,
        countryId: row.countryId,
        entityType: "task",
        entityId: row.id,
      }))
    );
}

function electionCandidates(db: Db): Promise<NotificationCandidate[]> {
  const currentYear = new Date().getUTCFullYear();
  return db
    .select({ id: countriesTable.id, name: countriesTable.name, electionYear: countriesTable.electionYear })
    .from(countriesTable)
    .where(and(isNotNull(countriesTable.electionYear), gte(countriesTable.electionYear, currentYear), lte(countriesTable.electionYear, currentYear + 1)))
    .then((rows) =>
      rows.map((row) => ({
        kind: "election_approaching",
        fingerprint: `election_approaching:${row.id}:${row.electionYear}`,
        title: `Election approaching — ${row.name}`,
        body: `Election year ${row.electionYear}.`,
        countryId: row.id,
        entityType: "country",
        entityId: row.id,
      }))
    );
}

/**
 * Deterministic idempotent reconcile: bring the notifications table to equal
 * the current live alert set. Insert missing fingerprints, refresh changed
 * titles/bodies in place, retire rows whose signal no longer holds, and prune
 * rows whose recipient is no longer eligible.
 */
export async function reconcileNotifications(db: Db): Promise<void> {
  const [positions, meetings, agreements, tasks, elections, findings] = await Promise.all([
    positionCandidates(db),
    meetingCandidates(db),
    agreementCandidates(db),
    taskCandidates(db),
    electionCandidates(db),
    findFindingCandidates(db),
  ]);

  const staff = await allRecipients(db);

  const globalCandidates = [...positions, ...meetings, ...elections, ...findings];
  const countryScoped = [...agreements, ...tasks];

  const insertRows: (typeof notificationsTable.$inferInsert)[] = [];
  for (const candidate of [...globalCandidates, ...countryScoped]) {
    let recipients: string[];
    if (candidate.entityType === "agreement" || candidate.entityType === "task") {
      recipients = await countryAssigneesOrStaff(db, candidate.countryId as number);
    } else {
      recipients = staff;
    }
    for (const recipientUserId of recipients) {
      insertRows.push({ ...candidate, recipientUserId });
    }
  }

  if (insertRows.length > 0) {
    await db
      .insert(notificationsTable)
      .values(insertRows)
      .onConflictDoUpdate({
        target: [notificationsTable.recipientUserId, notificationsTable.fingerprint],
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          countryId: sql`excluded.country_id`,
          entityType: sql`excluded.entity_type`,
          entityId: sql`excluded.entity_id`,
        },
      });
  }

  const liveFingerprints = new Set(insertRows.map((row) => row.fingerprint as string));
  if (liveFingerprints.size > 0) {
    await db
      .delete(notificationsTable)
      .where(and(notInArray(notificationsTable.fingerprint, [...liveFingerprints])));
  }

  const recipients = await allRecipients(db);
  if (recipients.length > 0) {
    await db
      .delete(notificationsTable)
      .where(notInArray(notificationsTable.recipientUserId, recipients));
  }
}

export async function listNotifications(db: Db, userId: string, opts: { limit: number; unreadOnly: boolean }) {
  const filters = [eq(notificationsTable.recipientUserId, userId)];
  if (opts.unreadOnly) filters.push(eq(notificationsTable.isRead, false));
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...filters))
    .orderBy(sql`${notificationsTable.createdAt} desc, ${notificationsTable.id} desc`)
    .limit(opts.limit);
  const all = await db
    .select({ id: notificationsTable.id, isRead: notificationsTable.isRead })
    .from(notificationsTable)
    .where(eq(notificationsTable.recipientUserId, userId));
  const unreadCount = all.filter((r) => !r.isRead).length;
  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      countryId: row.countryId,
      entityType: row.entityType,
      entityId: row.entityId,
      isRead: row.isRead,
      readAt: toISO(row.readAt),
      createdAt: toISO(row.createdAt),
    })),
    unreadCount,
  };
}

export async function markNotificationRead(db: Db, userId: string, id: number): Promise<boolean> {
  const [row] = await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.recipientUserId, userId)))
    .returning({ id: notificationsTable.id });
  return row != null;
}

export async function markAllNotificationsRead(db: Db, userId: string): Promise<number> {
  const rows = await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notificationsTable.recipientUserId, userId), eq(notificationsTable.isRead, false)))
    .returning({ id: notificationsTable.id });
  return rows.length;
}