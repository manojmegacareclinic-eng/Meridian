import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const ministriesTable = pgTable("ministries", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMinistrySchema = createInsertSchema(ministriesTable).omit({ id: true, createdAt: true });
export type InsertMinistry = z.infer<typeof insertMinistrySchema>;
export type Ministry = typeof ministriesTable.$inferSelect;