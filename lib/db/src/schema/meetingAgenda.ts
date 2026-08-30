import { integer, pgTable, serial, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { meetingsTable } from "./meetings";
import { contactsTable } from "./contacts";

export const meetingAgendaTable = pgTable("meeting_agenda", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes"),
  presenter: text("presenter"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingParticipantsTable = pgTable("meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role"),
  organization: text("organization"),
  attended: boolean("attended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meetingTranscriptsTable = pgTable("meeting_transcripts", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMeetingAgendaSchema = createInsertSchema(meetingAgendaTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMeetingParticipantSchema = createInsertSchema(meetingParticipantsTable).omit({ id: true, createdAt: true });
export const insertMeetingTranscriptSchema = createInsertSchema(meetingTranscriptsTable).omit({ id: true, createdAt: true });

export type InsertMeetingAgenda = z.infer<typeof insertMeetingAgendaSchema>;
export type InsertMeetingParticipant = z.infer<typeof insertMeetingParticipantSchema>;
export type InsertMeetingTranscript = z.infer<typeof insertMeetingTranscriptSchema>;

export type MeetingAgenda = typeof meetingAgendaTable.$inferSelect;
export type MeetingParticipant = typeof meetingParticipantsTable.$inferSelect;
export type MeetingTranscript = typeof meetingTranscriptsTable.$inferSelect;