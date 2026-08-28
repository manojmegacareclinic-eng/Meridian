import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const countriesTable = pgTable("countries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  region: text("region").notNull(),
  status: text("status").notNull().default("leads"),
  riskLevel: text("risk_level").notNull().default("medium"),
  language: text("language"),
  governmentType: text("government_type"),
  electionYear: integer("election_year"),
  team: text("team"),
  priority: text("priority"),
  strategy: text("strategy"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCountrySchema = createInsertSchema(countriesTable).omit({ id: true, createdAt: true });
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Country = typeof countriesTable.$inferSelect;
