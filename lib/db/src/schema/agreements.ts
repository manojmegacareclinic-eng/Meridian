import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const agreementLifecycleStates = [
  "draft",
  "review",
  "approved",
  "signed",
  "archived",
] as const;

export const agreementsTable = pgTable("agreements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  status: text("status").notNull().default("draft"),
  lifecycleState: text("lifecycle_state").notNull().default("draft"),
  updatedAt: date("updated_at", { mode: "string" }).notNull(),
  renewalDate: date("renewal_date", { mode: "string" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedBy: text("signed_by"),
});

export const insertAgreementSchema = createInsertSchema(agreementsTable).omit({ id: true });
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type Agreement = typeof agreementsTable.$inferSelect;