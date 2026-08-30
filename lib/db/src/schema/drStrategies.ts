import { integer, pgTable, serial, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const drStrategyTypes = [
  "uskdr",
  "hq_agreement",
  "host_country",
  "sister_city",
  "proclamation",
  "ngo_partnership",
  "refugee_partnership",
  "university_partnership",
  "custom",
] as const;

export const drStrategiesTable = pgTable("dr_strategies", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  customStages: jsonb("custom_stages"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drStrategyStagesTable = pgTable("dr_strategy_stages", {
  id: serial("id").primaryKey(),
  strategyId: integer("strategy_id").notNull().references(() => drStrategiesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  slaDays: integer("sla_days"),
  requiredFields: jsonb("required_fields"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDrStrategySchema = createInsertSchema(drStrategiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDrStrategyStageSchema = createInsertSchema(drStrategyStagesTable).omit({ id: true, createdAt: true });

export type InsertDrStrategy = z.infer<typeof insertDrStrategySchema>;
export type InsertDrStrategyStage = z.infer<typeof insertDrStrategyStageSchema>;
export type DrStrategy = typeof drStrategiesTable.$inferSelect;
export type DrStrategyStage = typeof drStrategyStagesTable.$inferSelect;