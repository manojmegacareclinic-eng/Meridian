import { pgTable, serial, text, timestamp, integer, jsonb, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";
import { countriesTable } from "./countries";

export const agentTypes = [
  "research",
  "contact_discovery",
  "verification",
  "meeting_assistant",
  "report_writer",
  "news",
  "translation",
  "relationship_scoring",
  "document_generation",
] as const;

export const promptWorkflowTable = pgTable(
  "prompt_workflows",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    agentType: text("agent_type").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    inputSchema: jsonb("input_schema").notNull().default({}),
    outputSchema: jsonb("output_schema").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prompt_workflows_agent_type_idx").on(table.agentType),
    index("prompt_workflows_created_by_idx").on(table.createdByUserId),
  ],
);

export const agentExecutionTable = pgTable(
  "agent_executions",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => promptWorkflowTable.id),
    inputData: jsonb("input_data").notNull(),
    outputData: jsonb("output_data"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    confidence: integer("confidence"),
    citations: jsonb("citations").default([]),
    executionTimeMs: integer("execution_time_ms"),
    executedByUserId: text("executed_by_user_id")
      .notNull()
      .references(() => userTable.id),
    countryId: integer("country_id").references(() => countriesTable.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => userTable.id),
    reviewDecision: text("review_decision"),
    reviewNote: text("review_note"),
  },
  (table) => [
    index("agent_executions_workflow_idx").on(table.workflowId),
    index("agent_executions_status_idx").on(table.status),
    index("agent_executions_country_idx").on(table.countryId),
    index("agent_executions_user_idx").on(table.executedByUserId),
  ],
);

export const agentOutputTable = pgTable(
  "agent_outputs",
  {
    id: serial("id").primaryKey(),
    executionId: integer("execution_id")
      .notNull()
      .references(() => agentExecutionTable.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    content: text("content").notNull(),
    confidence: integer("confidence"),
    citations: jsonb("citations").default([]),
    sourceReferences: jsonb("source_references").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_outputs_execution_idx").on(table.executionId),
  ],
);

export const insertPromptWorkflowSchema = createInsertSchema(promptWorkflowTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPromptWorkflow = z.infer<typeof insertPromptWorkflowSchema>;
export type PromptWorkflow = typeof promptWorkflowTable.$inferSelect;

export const insertAgentExecutionSchema = createInsertSchema(agentExecutionTable).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewDecision: true,
  reviewNote: true,
});
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;
export type AgentExecution = typeof agentExecutionTable.$inferSelect;

export const insertAgentOutputSchema = createInsertSchema(agentOutputTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentOutput = z.infer<typeof insertAgentOutputSchema>;
export type AgentOutput = typeof agentOutputTable.$inferSelect;

export type AgentType = typeof agentTypes[number];
export type AgentExecutionStatus = "pending" | "running" | "completed" | "failed" | "reviewed";
export type AgentReviewDecision = "approved" | "rejected" | "needs_revision";