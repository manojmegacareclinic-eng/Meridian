import { date, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const agreementsTable = pgTable("agreements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  status: text("status").notNull().default("draft"),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  renewalDate: date("renewal_date", { mode: "string" }),
});

export const insertAgreementSchema = createInsertSchema(agreementsTable).omit({ id: true });
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type Agreement = typeof agreementsTable.$inferSelect;
