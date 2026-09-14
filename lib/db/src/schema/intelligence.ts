import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const sourceKinds = [
  "government_site",
  "parliament_directory",
  "embassy_site",
  "government_gazette",
  "linkedin",
  "facebook_x",
  "other",
] as const;

export const findingTopics = [
  "government_change",
  "election",
  "diplomatic_news",
  "religious_affairs",
  "ngo_news",
  "university_news",
  "other",
] as const;

export const findingStages = ["open", "approved", "rejected"] as const;

export const targetTypes = ["country", "organization", "contact"] as const;

export const intelligenceSourcesTable = pgTable("intelligence_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  tier: integer("tier").notNull(),
  baseUrl: text("base_url").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const intelligenceFindingsTable = pgTable(
  "intelligence_findings",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => intelligenceSourcesTable.id),
    topic: text("topic").notNull(),
    headline: text("headline").notNull(),
    url: text("url"),
    summary: text("summary"),
    confidence: integer("confidence").notNull().default(50),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    field: text("field"),
    value: text("value"),
    stage: text("stage").notNull().default("open"),
    reviewNote: text("review_note"),
    applied: boolean("applied").notNull().default(false),
    reviewedByUserId: text("reviewed_by_user_id").references(() => userTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("intelligence_findings_fingerprint_unique").on(table.fingerprint)]
);

export const changeEventsTable = pgTable("change_events", {
  id: serial("id").primaryKey(),
  findingId: integer("finding_id")
    .notNull()
    .references(() => intelligenceFindingsTable.id),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  field: text("field"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  applied: boolean("applied").notNull().default(false),
  sourceUrl: text("source_url"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => userTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertIntelligenceSourceSchema = createInsertSchema(intelligenceSourcesTable).omit({ id: true, createdAt: true, deletedAt: true });
export const insertIntelligenceFindingSchema = createInsertSchema(intelligenceFindingsTable).omit({ id: true, reviewedAt: true, createdAt: true, deletedAt: true });
export const insertChangeEventSchema = createInsertSchema(changeEventsTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertIntelligenceSource = z.infer<typeof insertIntelligenceSourceSchema>;
export type IntelligenceSource = typeof intelligenceSourcesTable.$inferSelect;
export type InsertIntelligenceFinding = z.infer<typeof insertIntelligenceFindingSchema>;
export type IntelligenceFinding = typeof intelligenceFindingsTable.$inferSelect;
export type InsertChangeEvent = z.infer<typeof insertChangeEventSchema>;
export type ChangeEvent = typeof changeEventsTable.$inferSelect;