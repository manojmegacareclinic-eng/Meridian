import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";
import { agreementsTable } from "./agreements";

export const documentStatuses = ["draft", "review", "approved", "signed", "archived"] as const;

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  title: text("title").notNull(),
  type: text("type").notNull().default("other"),
  url: text("url"),
  datedOn: date("dated_on", { mode: "string" }),
  notes: text("notes"),
  agreementId: integer("agreement_id").references(() => agreementsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;