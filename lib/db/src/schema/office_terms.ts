import { date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { positionsTable } from "./positions";

export const officeTermsTable = pgTable(
  "office_terms",
  {
    id: serial("id").primaryKey(),
    positionId: integer("position_id").notNull().references(() => positionsTable.id),
    personName: text("person_name").notNull(),
    personEmail: text("person_email"),
    personPhone: text("person_phone"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isCurrent: integer("is_current").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("office_terms_position_current_unique").on(table.positionId).where(sql`${table.isCurrent} = 1`),
  ]
);

export const insertOfficeTermSchema = createInsertSchema(officeTermsTable).omit({ id: true, createdAt: true });
export type InsertOfficeTerm = z.infer<typeof insertOfficeTermSchema>;
export type OfficeTerm = typeof officeTermsTable.$inferSelect;