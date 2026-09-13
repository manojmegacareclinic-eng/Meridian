import type { Db } from "@workspace/db";
import {
  promptWorkflowTable,
  agentExecutionTable,
  agentOutputTable,
  type AgentExecution,
  type AgentOutput,
  type InsertAgentExecution,
  type InsertAgentOutput,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

export type AgentType =
  | "research"
  | "contact_discovery"
  | "verification"
  | "meeting_assistant"
  | "report_writer"
  | "news"
  | "translation"
  | "relationship_scoring"
  | "document_generation";

export type AgentExecutionStatus = "pending" | "running" | "completed" | "failed" | "reviewed";
export type AgentReviewDecision = "approved" | "rejected" | "needs_revision";

export interface AgentInput {
  [key: string]: unknown;
}

export interface AgentOutputData {
  [key: string]: unknown;
}

export interface Citation {
  sourceId: string;
  sourceType: string;
  url?: string;
  title?: string;
  snippet?: string;
  confidence?: number;
}

export interface AgentResult {
  output: AgentOutputData;
  confidence: number;
  citations: Citation[];
  sourceReferences: string[];
}

export interface Agent {
  type: AgentType;
  name: string;
  description: string;
  execute(input: AgentInput, context: ExecutionContext): Promise<AgentResult>;
}

export interface ExecutionContext {
  db: Db;
  executionId: number;
  userId: string;
  countryId?: number;
}

export async function createExecution(
  db: Db,
  data: InsertAgentExecution,
): Promise<AgentExecution> {
  const [execution] = await db
    .insert(agentExecutionTable)
    .values(data)
    .returning();
  return execution;
}

export async function updateExecution(
  db: Db,
  id: number,
  data: Partial<AgentExecution>,
): Promise<AgentExecution | null> {
  const [execution] = await db
    .update(agentExecutionTable)
    .set(data)
    .where(eq(agentExecutionTable.id, id))
    .returning();
  return execution ?? null;
}

export async function getExecution(
  db: Db,
  id: number,
): Promise<AgentExecution | null> {
  const [execution] = await db
    .select()
    .from(agentExecutionTable)
    .where(eq(agentExecutionTable.id, id))
    .limit(1);
  return execution ?? null;
}

export async function listExecutions(
  db: Db,
  filters: {
    workflowId?: number;
    status?: string;
    countryId?: number;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AgentExecution[]> {
  const conditions = [];
  if (filters.workflowId) conditions.push(eq(agentExecutionTable.workflowId, filters.workflowId));
  if (filters.status) conditions.push(eq(agentExecutionTable.status, filters.status));
  if (filters.countryId) conditions.push(eq(agentExecutionTable.countryId, filters.countryId));
  if (filters.userId) conditions.push(eq(agentExecutionTable.executedByUserId, filters.userId));

  return db
    .select()
    .from(agentExecutionTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(agentExecutionTable.startedAt))
    .limit(filters.limit ?? 50)
    .offset(filters.offset ?? 0);
}

export async function createOutput(
  db: Db,
  data: InsertAgentOutput,
): Promise<AgentOutput> {
  const [output] = await db
    .insert(agentOutputTable)
    .values(data)
    .returning();
  return output;
}

export async function getOutputs(
  db: Db,
  executionId: number,
): Promise<AgentOutput[]> {
  return db
    .select()
    .from(agentOutputTable)
    .where(eq(agentOutputTable.executionId, executionId))
    .orderBy(agentOutputTable.createdAt);
}

export async function completeExecution(
  db: Db,
  id: number,
  result: AgentResult,
): Promise<AgentExecution | null> {
  return updateExecution(db, id, {
    status: "completed",
    outputData: result.output,
    confidence: result.confidence,
    citations: result.citations,
    completedAt: new Date(),
  });
}

export async function failExecution(
  db: Db,
  id: number,
  error: string,
): Promise<AgentExecution | null> {
  return updateExecution(db, id, {
    status: "failed",
    errorMessage: error,
    completedAt: new Date(),
  });
}

export async function reviewExecution(
  db: Db,
  id: number,
  review: {
    decision: "approved" | "rejected" | "needs_revision";
    note?: string;
    userId: string;
  },
): Promise<AgentExecution | null> {
  return updateExecution(db, id, {
    status: "reviewed",
    reviewedAt: new Date(),
    reviewedByUserId: review.userId,
    reviewDecision: review.decision,
    reviewNote: review.note ?? null,
  });
}