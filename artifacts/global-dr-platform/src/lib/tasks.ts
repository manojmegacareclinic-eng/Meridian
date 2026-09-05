export const ACTION_AREAS = [
  "Trade & investment",
  "Security dialogue",
  "Climate & energy",
  "Humanitarian affairs",
  "Protocol & access",
] as const;

export const TASK_CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

export const TASK_STATUSES = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
] as const;

export const CADENCE_LABEL = Object.fromEntries(TASK_CADENCES.map((c) => [c.value, c.label])) as Record<string, string>;
export const STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label])) as Record<string, string>;