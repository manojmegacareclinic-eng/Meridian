import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";
import { countriesTable } from "./countries";

export const notificationKinds = [
  "position_change",
  "meeting_upcoming",
  "agreement_expiring",
  "follow_up_overdue",
  "election_approaching",
] as const;

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientUserId: text("recipient_user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    countryId: integer("country_id").references(() => countriesTable.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fingerprint: text("fingerprint").notNull(),
  },
  (table) => [
    uniqueIndex("notifications_recipient_fingerprint_unique").on(table.recipientUserId, table.fingerprint),
  ]
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;