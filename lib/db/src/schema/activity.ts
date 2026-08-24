import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { countriesTable } from "./countries";

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  countryId: integer("country_id").references(() => countriesTable.id),
});

export type Activity = typeof activityTable.$inferSelect;
