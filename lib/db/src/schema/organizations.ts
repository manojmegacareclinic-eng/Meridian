import { integer, pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const organizationTypes = [
  "ministry",
  "embassy",
  "city",
  "university",
  "ngo",
  "party",
  "religious",
] as const;

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  address: text("address"),
  website: text("website"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({ id: true, createdAt: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;