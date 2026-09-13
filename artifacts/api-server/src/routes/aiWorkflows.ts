import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  promptWorkflowTable,
  agentExecutionTable,
  agentOutputTable,
  type PromptWorkflow,
  type AgentExecution,
  type AgentOutput,
} from "@workspace/db";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { requireSession, requireWriteRole, getActor } from "../middlewares/guards";
import { writeAudit } from "../lib/audit";
import { createExecution, updateExecution, getExecution, listExecutions, completeExecution, failExecution, reviewExecution, createOutput, getOutputs } from "../lib/aiWorkflows";
import { createAgent } from "../lib/aiAgents";

const router: IRouter = Router();

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  agentType: z.enum([
    "research",
    "contact_discovery",
    "verification",
    "meeting_assistant",
    "report_writer",
    "news",
    "translation",
    "relationship_scoring",
    "document_generation",
  ]),
  promptTemplate: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

const updateWorkflowSchema = createWorkflowSchema.partial();

const executeWorkflowSchema = z.object({
  workflowId: z.number().int().positive(),
  inputData: z.record(z.string(), z.unknown()),
  countryId: z.number().int().positive().optional(),
});

const reviewExecutionSchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_revision"]),
  note: z.string().optional(),
});

// GET /api/ai-workflows - List workflows
router.get("/", requireSession(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const { agentType, isActive, limit = 50, offset = 0 } = req.query;

  const conditions = [];
  if (agentType) conditions.push(eq(promptWorkflowTable.agentType, agentType as string));
  if (isActive !== undefined) conditions.push(eq(promptWorkflowTable.isActive, isActive === "true"));

  const workflows = await db
    .select()
    .from(promptWorkflowTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(promptWorkflowTable.updatedAt))
    .limit(Number(limit))
    .offset(Number(offset));

  const total = await db
    .select({ count: count() })
    .from(promptWorkflowTable)
    .where(conditions.length ? and(...conditions) : undefined);

  res.json({ workflows, total: total[0]?.count ?? 0 });
});

// POST /api/ai-workflows - Create workflow
router.post("/", requireSession(), requireWriteRole(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [workflow] = await db
    .insert(promptWorkflowTable)
    .values({
      ...parsed.data,
      createdByUserId: actor.id,
    })
    .returning();

  await writeAudit({
      actor: { id: actor.id, name: actor.name },
      action: "create",
      entityType: "intelligence_source",
      entityId: String(workflow.id),
      title: `Created AI workflow: ${workflow.name}`,
      description: workflow.description ?? "AI workflow created",
      kind: "ai_workflow",
      countryId: null,
    });
  res.status(201).json(workflow);
});

// GET /api/ai-workflows/:id - Get workflow
router.get("/:id", requireSession(), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  const [workflow] = await db
    .select()
    .from(promptWorkflowTable)
    .where(eq(promptWorkflowTable.id, id))
    .limit(1);

  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  res.json(workflow);
});

// PATCH /api/ai-workflows/:id - Update workflow
router.patch("/:id", requireSession(), requireWriteRole(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  const parsed = updateWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [workflow] = await db
    .update(promptWorkflowTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(promptWorkflowTable.id, id))
    .returning();

  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  await writeAudit({
      actor: { id: actor.id, name: actor.name },
      action: "update",
      entityType: "intelligence_source",
      entityId: String(workflow.id),
      title: `Updated AI workflow: ${workflow.name}`,
      description: "AI workflow updated",
      kind: "ai_workflow",
      countryId: null,
    });
  res.json(workflow);
});

// POST /api/ai-workflows/execute - Execute a workflow
router.post("/execute", requireSession(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const parsed = executeWorkflowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { workflowId, inputData, countryId } = parsed.data;

  const [workflow] = await db
    .select()
    .from(promptWorkflowTable)
    .where(eq(promptWorkflowTable.id, workflowId))
    .limit(1);

  if (!workflow) {
    res.status(404).json({ error: "Workflow not found" });
    return;
  }

  if (!workflow.isActive) {
    res.status(400).json({ error: "Workflow is not active" });
    return;
  }

  // Create execution record
  const execution = await createExecution(db, {
    workflowId,
    inputData,
    status: "running",
    executedByUserId: actor.id,
    countryId,
  });

  // Execute asynchronously (fire and forget with error handling)
  const agent = createAgent(workflow.agentType as any);
  const context = {
    db,
    executionId: execution.id,
    userId: actor.id,
    countryId,
  };

  // Run agent in background
  (async () => {
    try {
      const result = await agent.execute(workflow.promptTemplate ? { ...inputData, prompt: workflow.promptTemplate } : inputData, {
        db,
        executionId: execution.id,
        userId: actor.id,
        countryId,
      });

      await completeExecution(db, execution.id, result);
      await writeAudit({
        actor: { id: actor.id, name: actor.name },
        action: "execute",
        entityType: "intelligence_finding",
        entityId: String(execution.id),
        title: `AI workflow execution completed`,
        description: `Workflow ${workflowId} executed successfully`,
        kind: "ai_execution",
        countryId: null,
      });
    } catch (error) {
      await failExecution(db, execution.id, error instanceof Error ? error.message : "Unknown error");
      await writeAudit({
        actor: { id: actor.id, name: actor.name },
        action: "execute",
        entityType: "intelligence_finding",
        entityId: String(execution.id),
        title: `AI workflow execution failed`,
        description: error instanceof Error ? error.message : "Unknown error",
        kind: "ai_execution",
        countryId: null,
      });
    }
  })();

  res.status(202).json({ executionId: execution.id, status: "running" });
});

// GET /api/ai-workflows/executions - List executions
router.get("/executions/list", requireSession(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const { workflowId, status, countryId, userId, limit = 50, offset = 0 } = req.query;

  const executions = await listExecutions(db, {
    workflowId: workflowId ? Number(workflowId) : undefined,
    status: status as string,
    countryId: countryId ? Number(countryId) : undefined,
    userId: userId as string,
    limit: Number(limit),
    offset: Number(offset),
  });

  const total = await db
    .select({ count: count() })
    .from(agentExecutionTable);

  res.json({ executions, total: total[0]?.count ?? 0 });
});

// GET /api/ai-workflows/executions/:id - Get execution with outputs
router.get("/executions/:id", requireSession(), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid execution ID" });
    return;
  }

  const execution = await getExecution(db, id);
  if (!execution) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }

  const outputs = await getOutputs(db, id);

  res.json({ execution, outputs });
});

// POST /api/ai-workflows/executions/:id/review - Review execution
router.post("/executions/:id/review", requireSession(), requireWriteRole(), async (req, res): Promise<void> => {
  const actor = getActor(req);
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid execution ID" });
    return;
  }

  const parsed = reviewExecutionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const execution = await reviewExecution(db, id, {
    decision: parsed.data.decision,
    note: parsed.data.note,
    userId: actor.id,
  });

  if (!execution) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }

  await writeAudit({
      actor: { id: actor.id, name: actor.name },
      action: "review",
      entityType: "intelligence_finding",
      entityId: String(execution.id),
      title: `AI execution reviewed: ${parsed.data.decision}`,
      description: parsed.data.note ?? "AI execution reviewed",
      kind: "ai_execution",
      countryId: null,
    });
  res.json(execution);
});

// GET /api/ai-workflows/agents - List available agent types
router.get("/agents/list", requireSession(), async (_req, res): Promise<void> => {
  const agents = [
    { type: "research", name: "Research Agent", description: "Conducts structured research with citations" },
    { type: "contact_discovery", name: "Contact Discovery Agent", description: "Discovers and verifies diplomatic contacts" },
    { type: "verification", name: "Verification Agent", description: "Verifies contact info and institutional affiliations" },
    { type: "meeting_assistant", name: "Meeting Assistant Agent", description: "Prepares briefings, agendas, and follow-ups" },
    { type: "report_writer", name: "Report Writer Agent", description: "Drafts structured reports with citations" },
    { type: "news", name: "News Agent", description: "Monitors and summarizes relevant news" },
    { type: "translation", name: "Translation Agent", description: "Translates diplomatic documents" },
    { type: "relationship_scoring", name: "Relationship Scoring Agent", description: "Scores diplomatic relationship strength" },
    { type: "document_generation", name: "Document Generation Agent", description: "Generates diplomatic documents from templates" },
  ];

  res.json({ agents });
});

export default router;