import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { countriesTable } from "./countries";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  countryId: integer("country_id").references(() => countriesTable.id),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  action: text("action"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
});

export type Activity = typeof activityTable.$inferSelect;
export type ActivityInsert = typeof activityTable.$inferInsert;
