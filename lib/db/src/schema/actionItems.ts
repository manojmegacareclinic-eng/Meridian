import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { meetingsTable } from "./meetings";
import { contactsTable } from "./contacts";

export const actionItemsTable = pgTable("action_items", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  assignee: text("assignee").notNull(),
  assigneeContactId: integer("assignee_contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  dueDate: date("due_date", { mode: "string" }),
  status: text("status").notNull().default("pending"),
  deliverableId: integer("deliverable_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliverablesTable = pgTable("deliverables", {
  id: serial("id").primaryKey(),
  actionItemId: integer("action_item_id").notNull().references(() => actionItemsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date", { mode: "string" }),
  status: text("status").notNull().default("pending"),
  url: text("url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionItemSchema = createInsertSchema(actionItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDeliverableSchema = createInsertSchema(deliverablesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type InsertDeliverable = z.infer<typeof insertDeliverableSchema>;
export type ActionItem = typeof actionItemsTable.$inferSelect;
export type Deliverable = typeof deliverablesTable.$inferSelect;