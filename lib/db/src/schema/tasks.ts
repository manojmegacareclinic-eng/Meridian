import { integer, pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const ACTION_AREAS = [
  "Trade & investment",
  "Security dialogue",
  "Climate & energy",
  "Humanitarian affairs",
  "Protocol & access",
] as const;

export const TASK_CADENCES = ["daily", "weekly"] as const;
export const TASK_STATUSES = ["active", "paused", "done"] as const;

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id, { onDelete: "cascade" }),
  actionArea: text("action_area").notNull(),
  cadence: text("cadence").notNull().default("weekly"),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  status: text("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  lastDoneAt: date("last_done_at", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;