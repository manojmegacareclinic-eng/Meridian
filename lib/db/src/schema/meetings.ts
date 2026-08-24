import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  participants: integer("participants").notNull().default(1),
  actionArea: text("action_area").notNull(),
  owner: text("owner"),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
