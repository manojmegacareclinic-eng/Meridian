import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ministriesTable } from "./ministries";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  ministryId: integer("ministry_id").notNull().references(() => ministriesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, createdAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;