import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  countriesTable,
  notificationsTable,
  ministriesTable,
  positionsTable,
  officeTermsTable,
  meetingsTable,
  agreementsTable,
  tasksTable,
  ACTION_AREAS,
} from "@workspace/db";

const day = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split("T")[0];
};

const meetingDateInWindow = () => new Date(Date.now() + 34 * 3_600_000);

async function ensureCountry(code: string, name: string) {
  const existing = await db.select().from(countriesTable).where(eq(countriesTable.code, code));
  if (existing[0]) {
    const electionYear = new Date().getUTCFullYear();
    if (existing[0].electionYear !== electionYear) {
      await db.update(countriesTable).set({ electionYear }).where(eq(countriesTable.id, existing[0].id));
    }
    return existing[0];
  }
  const [created] = await db
    .insert(countriesTable)
    .values({ name, code, region: "QA", status: "leads", riskLevel: "medium", electionYear: new Date().getUTCFullYear() })
    .returning();
  if (!created) throw new Error(`failed to create country ${code}`);
  return created;
}

async function main() {
  const oldCountry = await ensureCountry("POSN", "Position Demo");

  const ministry =
    (await db.select().from(ministriesTable).where(and(eq(ministriesTable.countryId, oldCountry.id), eq(ministriesTable.name, "QA Notify Ministry"))))[0] ??
    (await db.insert(ministriesTable).values({ countryId: oldCountry.id, name: "QA Notify Ministry", type: "Government" }).returning())[0];
  if (!ministry) throw new Error("failed to create ministry");

  const position =
    (await db.select().from(positionsTable).where(and(eq(positionsTable.ministryId, ministry.id), eq(positionsTable.title, "QA Notify Ambassador"))))[0] ??
    (await db.insert(positionsTable).values({ ministryId: ministry.id, title: "QA Notify Ambassador", description: "Seeded position for notifications QA." }).returning())[0];
  if (!position) throw new Error("failed to create position");

  const currentTerm = (await db.select().from(officeTermsTable).where(and(eq(officeTermsTable.positionId, position.id), eq(officeTermsTable.isCurrent, 1))))[0];
  const term = currentTerm
    ? ((await db.update(officeTermsTable).set({ personName: "Notify Holder", startDate: day(-30) }).where(eq(officeTermsTable.id, currentTerm.id)).returning())[0] ?? currentTerm)
    : (await db.insert(officeTermsTable).values({ positionId: position.id, personName: "Notify Holder", personEmail: "notify@meridian.local", startDate: day(-30), endDate: day(300), isCurrent: 1 }).returning())[0];
  if (!term) throw new Error("failed to create office term");

  const MEETING_TITLE = "QA Notify · POSN Sync";
  let meeting = (await db.select().from(meetingsTable).where(and(eq(meetingsTable.countryId, oldCountry.id), eq(meetingsTable.title, MEETING_TITLE))))[0];
  if (meeting) {
    meeting = (await db.update(meetingsTable).set({ date: meetingDateInWindow(), status: "scheduled" }).where(eq(meetingsTable.id, meeting.id)).returning())[0] ?? meeting;
  } else {
    meeting = (await db.insert(meetingsTable).values({ title: MEETING_TITLE, countryId: oldCountry.id, date: meetingDateInWindow(), status: "scheduled", participants: 4, actionArea: ACTION_AREAS[0], owner: "Demo" }).returning())[0];
  }
  if (!meeting) throw new Error("failed to create meeting");

  const AGREEMENT_NAME = "QA Notify · POSN MoU";
  let agreement = (await db.select().from(agreementsTable).where(and(eq(agreementsTable.countryId, oldCountry.id), eq(agreementsTable.name, AGREEMENT_NAME))))[0];
  if (agreement) {
    agreement = (await db.update(agreementsTable).set({ lifecycleState: "signed", status: "signed", updatedAt: day(0), renewalDate: day(20) }).where(eq(agreementsTable.id, agreement.id)).returning())[0] ?? agreement;
  } else {
    agreement = (await db.insert(agreementsTable).values({ name: AGREEMENT_NAME, type: "MoU", countryId: oldCountry.id, status: "signed", lifecycleState: "signed", updatedAt: day(0), renewalDate: day(20) }).returning())[0];
  }
  if (!agreement) throw new Error("failed to create agreement");

  const TASK_TITLE = "QA Notify · POSN overdue";
  let task = (await db.select().from(tasksTable).where(and(eq(tasksTable.countryId, oldCountry.id), eq(tasksTable.title, TASK_TITLE))))[0];
  if (task) {
    task = (await db.update(tasksTable).set({ dueDate: day(-1), status: "active" }).where(eq(tasksTable.id, task.id)).returning())[0] ?? task;
  } else {
    task = (await db.insert(tasksTable).values({ countryId: oldCountry.id, actionArea: ACTION_AREAS[0], cadence: "weekly", title: TASK_TITLE, description: "Overdue follow-up seeded for notifications QA.", owner: "Demo", status: "active", dueDate: day(-1) }).returning())[0];
  }
  if (!task) throw new Error("failed to create task");

  const fingerprints = [
    `position_change:${term.id}`,
    `meeting_upcoming:${meeting.id}`,
    `agreement_expiring:${agreement.id}`,
    `follow_up_overdue:${task.id}`,
    `election_approaching:${oldCountry.id}:${new Date().getUTCFullYear()}`,
  ];
  await db
    .update(notificationsTable)
    .set({ isRead: false, readAt: null })
    .where(inArray(notificationsTable.fingerprint, fingerprints));

  console.log(`POSN (Position Demo) id=${oldCountry.id}`);
  console.log(`office term id=${term.id} (position_change) stable fingerprint`);
  console.log(`meeting id=${meeting.id} (meeting_upcoming, +34h)`);
  console.log(`signed agreement id=${agreement.id} (agreement_expiring, renewal ${day(20)})`);
  console.log(`overdue task id=${task.id} (follow_up_overdue, due ${day(-1)})`);
  console.log(`election_approaching on POSN (electionYear ${new Date().getUTCFullYear()})`);
  console.log(`reset ${fingerprints.length} fingerprints to unread for all recipients (deterministic feed)`);
  console.log("seed-notify complete — run GET /api/notifications to reconcile the feed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });