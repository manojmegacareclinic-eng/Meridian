import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  institution: text("institution").notNull(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  email: text("email").notNull(),
  phone: text("phone"),
  verificationStatus: text("verification_status").notNull().default("review"),
  lastVerified: date("last_verified", { mode: "string" }).notNull(),
  relationship: text("relationship").notNull(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
