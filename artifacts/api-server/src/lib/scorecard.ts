import { inArray, eq } from "drizzle-orm";
import type { Db } from "@workspace/db";
import { actionItemsTable, meetingsTable, tasksTable } from "@workspace/db";

export type ScorecardKind = "task" | "actionItem" | "meeting";

export type ScorecardRow = {
  countryId: number;
  kind: ScorecardKind;
  id: number;
  title: string;
  actionArea: string;
  cadence: string | null; // tasks only
  completed: boolean; // task "done" / action item "completed" / meeting "completed"
  pool: boolean; // pool member (paused tasks / cancelled rows excluded by the loader)
  due: string | null; // date-only: task.dueDate, actionItem.dueDate, dayOnly(meeting.date)
  evidence: string | null; // date-only: task.lastDoneAt, dayOnly(updatedAt), dayOnly(completedAt)
  evidenceRaw: string | null; // raw value for the failure row's completedAt
  scheduledAt: string | null; // meeting's full date timestamp; null for tasks/action items
};

const DAY_MS = 86_400_000;
const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);
export const today: string = dayOnly(new Date()) ?? "";
const daysBetween = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / DAY_MS);
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function loadScorecardRows(db: Db): Promise<ScorecardRow[]> {
  const tasks = await db
    .select({
      id: tasksTable.id,
      countryId: tasksTable.countryId,
      actionArea: tasksTable.actionArea,
      cadence: tasksTable.cadence,
      title: tasksTable.title,
      due: tasksTable.dueDate,
      evidenceRaw: tasksTable.lastDoneAt,
      status: tasksTable.status,
    })
    .from(tasksTable)
    .where(inArray(tasksTable.status, ["active", "done"]));

  const actionItems = await db
    .select({
      id: actionItemsTable.id,
      countryId: meetingsTable.countryId,
      actionArea: meetingsTable.actionArea,
      title: actionItemsTable.description,
      due: actionItemsTable.dueDate,
      evidenceRaw: actionItemsTable.updatedAt,
      status: actionItemsTable.status,
    })
    .from(actionItemsTable)
    .innerJoin(meetingsTable, eq(actionItemsTable.meetingId, meetingsTable.id))
    .where(inArray(actionItemsTable.status, ["pending", "in_progress", "completed"]));

  const meetings = await db
    .select({
      id: meetingsTable.id,
      countryId: meetingsTable.countryId,
      actionArea: meetingsTable.actionArea,
      title: meetingsTable.title,
      due: meetingsTable.date,
      evidenceRaw: meetingsTable.completedAt,
      status: meetingsTable.status,
    })
    .from(meetingsTable)
    .where(inArray(meetingsTable.status, ["scheduled", "completed", "follow_up"]));

  const rows: ScorecardRow[] = [];
  for (const t of tasks) {
    rows.push({
      countryId: t.countryId,
      kind: "task",
      id: t.id,
      title: t.title,
      actionArea: t.actionArea,
      cadence: t.cadence,
      completed: t.status === "done",
      pool: true,
      due: t.due,
      evidence: dayOnly(t.evidenceRaw),
      evidenceRaw: t.evidenceRaw,
      scheduledAt: null,
    });
  }
  for (const a of actionItems) {
    rows.push({
      countryId: a.countryId,
      kind: "actionItem",
      id: a.id,
      title: a.title,
      actionArea: a.actionArea,
      cadence: null,
      completed: a.status === "completed",
      pool: true,
      due: a.due,
      evidence: dayOnly(a.evidenceRaw),
      evidenceRaw: a.evidenceRaw ? new Date(a.evidenceRaw).toISOString() : null,
      scheduledAt: null,
    });
  }
  for (const m of meetings) {
    rows.push({
      countryId: m.countryId,
      kind: "meeting",
      id: m.id,
      title: m.title,
      actionArea: m.actionArea,
      cadence: null,
      completed: m.status === "completed",
      pool: true,
      due: dayOnly(m.due),
      evidence: dayOnly(m.evidenceRaw),
      evidenceRaw: m.evidenceRaw ? new Date(m.evidenceRaw).toISOString() : null,
      scheduledAt: m.due ? new Date(m.due).toISOString() : null,
    });
  }
  return rows;
}

export type ScorecardFailureRowPayload = {
  id: number;
  type: ScorecardKind;
  title: string;
  actionArea: string;
  cadence: string | null;
  dueDate: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  daysOver: number | null;
};

const poolRows = (rows: ScorecardRow[], countryId: number) => rows.filter((r) => r.countryId === countryId && r.pool);

function classifyFailures(pool: ScorecardRow[], today: string): { row: ScorecardRow; daysOver: number | null }[] {
  const failures: { row: ScorecardRow; daysOver: number | null }[] = [];
  for (const row of pool) {
    if (!row.completed && row.due && row.due < today) {
      failures.push({ row, daysOver: daysBetween(today, row.due) });
    } else if (row.completed && row.due && (row.evidence == null || row.evidence > row.due)) {
      failures.push({ row, daysOver: row.evidence ? daysBetween(row.evidence, row.due) : null });
    }
  }
  return failures;
}

function toFailureRow(failure: { row: ScorecardRow; daysOver: number | null }): ScorecardFailureRowPayload {
  const { row, daysOver } = failure;
  return {
    id: row.id,
    type: row.kind,
    title: row.title,
    actionArea: row.actionArea,
    cadence: row.kind === "task" ? row.cadence : null,
    dueDate: row.due,
    scheduledAt: row.scheduledAt,
    completedAt: row.evidenceRaw,
    daysOver,
  };
}

function sortClusters<T extends { key: string; count: number; id: number }>(clusters: T[]): T[] {
  return clusters.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key) || a.id - b.id);
}

export function computeSummary(countryId: number, rows: ScorecardRow[], today: string) {
  const pool = poolRows(rows, countryId);
  const poolCount = pool.length;
  const completed = pool.filter((r) => r.completed);
  const completedCount = completed.length;
  const completionPct = poolCount ? round1((completedCount / poolCount) * 100) : null;

  const slaScoped = completed.filter((r) => r.due != null);
  const onTimeCount = slaScoped.filter((r) => r.evidence != null && r.evidence <= (r.due as string)).length;
  const slaRate = slaScoped.length ? round1((onTimeCount / slaScoped.length) * 100) : null;

  const failureCount = classifyFailures(pool, today).length;
  const failureRate = poolCount ? round1((failureCount / poolCount) * 100) : null;

  const score =
    completionPct == null || slaRate == null || failureRate == null
      ? null
      : Math.round(0.4 * completionPct + 0.4 * slaRate + 0.2 * (100 - failureRate));

  return { score, completionPct, slaRate, failureRate, poolCount, completedCount, onTimeCount, failureCount };
}

export function computeBreakdown(countryId: number, rows: ScorecardRow[], today: string) {
  const pool = poolRows(rows, countryId);
  const poolCount = pool.length;
  const completed = pool.filter((r) => r.completed);
  const completedCount = completed.length;
  const overallPct = poolCount ? round1((completedCount / poolCount) * 100) : null;

  const slaScoped = completed.filter((r) => r.due != null);
  const onTimeCount = slaScoped.filter((r) => r.evidence != null && r.evidence <= (r.due as string)).length;
  const overallRate = slaScoped.length ? round1((onTimeCount / slaScoped.length) * 100) : null;

  const kinds: ScorecardKind[] = ["task", "actionItem", "meeting"];
  const byType = kinds.map((type) => {
    const typed = pool.filter((r) => r.kind === type);
    const done = typed.filter((r) => r.completed).length;
    return { type, done, total: typed.length, pct: typed.length ? round1((done / typed.length) * 100) : null };
  });

  const byActionAreaKeys = [...new Set(pool.map((r) => r.actionArea))].sort();
  const byActionArea = byActionAreaKeys.map((actionArea) => {
    const typed = pool.filter((r) => r.actionArea === actionArea);
    const done = typed.filter((r) => r.completed).length;
    return { actionArea, done, total: typed.length, pct: typed.length ? round1((done / typed.length) * 100) : null };
  });

  const slaByType = kinds.map((type) => {
    const typed = slaScoped.filter((r) => r.kind === type);
    const onTime = typed.filter((r) => r.evidence != null && r.evidence <= (r.due as string)).length;
    return { type, onTime, completed: typed.length, rate: typed.length ? round1((onTime / typed.length) * 100) : null };
  });

  const failures = classifyFailures(pool, today).map(toFailureRow);
  const failureCount = failures.length;
  const failureRate = poolCount ? round1((failureCount / poolCount) * 100) : null;

  const byActionAreaClusters = failureCount
    ? sortClusters(
        Object.values(
          failures.reduce<Record<string, { key: string; actionArea: string; count: number; id: number }>>((acc, f) => {
            const entry = acc[f.actionArea] ?? { key: f.actionArea, actionArea: f.actionArea, count: 0, id: 0 };
            entry.count += 1;
            acc[f.actionArea] = entry;
            return acc;
          }, {}),
        ).map((c) => ({ ...c, rate: round1((c.count / failureCount) * 100) })),
      ).map(({ key: _key, id: _id, ...rest }) => rest)
    : [];

  const byCadenceClusters = failureCount
    ? sortClusters(
        Object.values(
          failures
            .filter((f) => f.type === "task" && f.cadence != null)
            .reduce<Record<string, { key: string; cadence: string; count: number; id: number }>>((acc, f) => {
              const entry = acc[f.cadence as string] ?? { key: f.cadence as string, cadence: f.cadence as string, count: 0, id: 0 };
              entry.count += 1;
              acc[f.cadence as string] = entry;
              return acc;
            }, {}),
        ).map((c) => ({ ...c, rate: round1((c.count / failureCount) * 100) })),
      ).map(({ key: _key, id: _id, ...rest }) => rest)
    : [];

  const byTypeClusters = failureCount
    ? sortClusters(
        Object.values(
          failures.reduce<Record<string, { key: string; type: string; count: number; id: number }>>((acc, f) => {
            const entry = acc[f.type] ?? { key: f.type, type: f.type, count: 0, id: 0 };
            entry.count += 1;
            acc[f.type] = entry;
            return acc;
          }, {}),
        ).map((c) => ({ ...c, rate: round1((c.count / failureCount) * 100) })),
      ).map(({ key: _key, id: _id, ...rest }) => rest)
    : [];

  return {
    completion: { overallPct, byType, byActionArea },
    sla: { overallRate, byType: slaByType },
    failures: { count: failureCount, rate: failureRate, rows: failures, byActionArea: byActionAreaClusters, byCadence: byCadenceClusters, byType: byTypeClusters },
  };
}