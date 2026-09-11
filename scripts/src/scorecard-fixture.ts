import { actionItemsTable, meetingsTable, tasksTable } from "@workspace/db";

type TaskInsert = typeof tasksTable.$inferInsert;
type ActionItemInsert = typeof actionItemsTable.$inferInsert;
type MeetingInsert = typeof meetingsTable.$inferInsert;

export type FixtureTask = { key: string; payload: Omit<TaskInsert, "countryId"> };
export type FixtureActionItem = { key: string; payload: Omit<ActionItemInsert, "meetingId"> };
export type FixtureMeeting = { key: string; payload: Omit<MeetingInsert, "countryId"> };

export type FixtureExpected = {
  poolCount: number;
  completedCount: number;
  completionPct: number;
  onTimeCount: number;
  slaRate: number;
  failureCount: number;
  failureRate: number;
  score: number;
  slaByType: Record<"task" | "actionItem" | "meeting", number>;
  completionByType: Record<"task" | "actionItem" | "meeting", number>;
  completionByActionArea: Record<string, number>;
  failures: { key: string; kind: "task" | "actionItem" | "meeting"; daysOver: number | null }[];
  byActionArea: [string, number, number][];
  byCadence: [string, number, number][];
  byType: [string, number, number][];
};

export type ScorecardFixture = {
  tasks: FixtureTask[];
  actionItems: FixtureActionItem[];
  meetings: FixtureMeeting[];
  hostMeetingKey: string;
  expected: FixtureExpected;
};

const DAY_MS = 86_400_000;
const addDays = (iso: string, offset: number) =>
  new Date(Date.parse(iso + "T00:00:00.000Z") + offset * DAY_MS).toISOString();
const dayOf = (iso: string) => iso.split("T")[0];
const ts = (iso: string, offset: number) => addDays(dayOf(iso), offset).split("T")[0];

export function scorecardFixture(today: string): ScorecardFixture {
  const SECURITY = "Security dialogue";
  const TRADE = "Trade & investment";

  const tasks: FixtureTask[] = [
    { key: "t1", payload: { actionArea: SECURITY, cadence: "weekly", title: "QA scorecard t1", status: "done", dueDate: ts(today, -2), lastDoneAt: ts(today, -3) } },
    { key: "t2", payload: { actionArea: SECURITY, cadence: "daily", title: "QA scorecard t2", status: "done", dueDate: ts(today, -2), lastDoneAt: ts(today, -1) } },
    { key: "t3", payload: { actionArea: SECURITY, cadence: "weekly", title: "QA scorecard t3", status: "done", dueDate: ts(today, -1), lastDoneAt: null } },
    { key: "t4", payload: { actionArea: SECURITY, cadence: "weekly", title: "QA scorecard t4", status: "active", dueDate: ts(today, -3), lastDoneAt: null } },
    { key: "t5", payload: { actionArea: SECURITY, cadence: "weekly", title: "QA scorecard t5", status: "done", dueDate: null, lastDoneAt: ts(today, -1) } },
    { key: "t6", payload: { actionArea: SECURITY, cadence: "weekly", title: "QA scorecard t6", status: "paused", dueDate: null, lastDoneAt: null } },
  ];

  const meetings: FixtureMeeting[] = [
    { key: "m1", payload: { title: "QA scorecard m1", date: new Date(addDays(today, -3)), status: "completed", completedAt: new Date(addDays(today, -3)), actionArea: SECURITY } },
    { key: "m2", payload: { title: "QA scorecard m2", date: new Date(addDays(today, -2)), status: "completed", completedAt: new Date(addDays(today, -1)), actionArea: SECURITY } },
    { key: "m3", payload: { title: "QA scorecard m3", date: new Date(addDays(today, -2)), status: "completed", completedAt: null, actionArea: SECURITY } },
    { key: "m4", payload: { title: "QA scorecard m4", date: new Date(addDays(today, -4)), status: "scheduled", actionArea: SECURITY } },
    { key: "m5", payload: { title: "QA scorecard m5 host", date: new Date(addDays(today, 5)), status: "scheduled", actionArea: TRADE } },
    { key: "m6", payload: { title: "QA scorecard m6", date: new Date(addDays(today, -5)), status: "cancelled", actionArea: SECURITY } },
  ];

  const actionItems: FixtureActionItem[] = [
    { key: "a1", payload: { description: "QA scorecard a1", assignee: "QA User", status: "completed", dueDate: ts(today, -1), updatedAt: new Date(addDays(today, -2)) } },
    { key: "a2", payload: { description: "QA scorecard a2", assignee: "QA User", status: "completed", dueDate: ts(today, -2), updatedAt: new Date(addDays(today, -1)) } },
    { key: "a3", payload: { description: "QA scorecard a3", assignee: "QA User", status: "pending", dueDate: ts(today, -4), updatedAt: new Date(addDays(today, -5)) } },
    { key: "a4", payload: { description: "QA scorecard a4", assignee: "QA User", status: "pending", dueDate: null, updatedAt: new Date(addDays(today, -5)) } },
  ];

  const expected: FixtureExpected = {
    poolCount: 14,
    completedCount: 9,
    completionPct: 64.3,
    onTimeCount: 3,
    slaRate: 37.5,
    failureCount: 8,
    failureRate: 57.1,
    score: 49,
    slaByType: { task: 33.3, actionItem: 50.0, meeting: 33.3 },
    completionByType: { task: 80.0, actionItem: 50.0, meeting: 60.0 },
    completionByActionArea: { [SECURITY]: 77.8, [TRADE]: 40.0 },
    failures: [
      { key: "t2", kind: "task", daysOver: 1 },
      { key: "t3", kind: "task", daysOver: null },
      { key: "t4", kind: "task", daysOver: 3 },
      { key: "a2", kind: "actionItem", daysOver: 1 },
      { key: "a3", kind: "actionItem", daysOver: 4 },
      { key: "m2", kind: "meeting", daysOver: 1 },
      { key: "m3", kind: "meeting", daysOver: null },
      { key: "m4", kind: "meeting", daysOver: 4 },
    ],
    byActionArea: [[SECURITY, 6, 75.0], [TRADE, 2, 25.0]],
    byCadence: [["weekly", 2, 25.0], ["daily", 1, 12.5]],
    byType: [["meeting", 3, 37.5], ["task", 3, 37.5], ["actionItem", 2, 25.0]],
  };

  return { tasks, actionItems, meetings, hostMeetingKey: "m5", expected };
}