import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, drStrategiesTable, drStrategyStagesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateDrStrategyBody,
  CreateDrStrategyResponse,
  DeleteDrStrategyParams,
  DeleteDrStrategyResponse,
  DrStrategy,
  DrStrategyStage,
  ListDrStrategiesQueryParams,
  ListDrStrategiesResponse,
  UpdateDrStrategyBody,
  UpdateDrStrategyParams,
  UpdateDrStrategyResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dr-strategies", async (req, res): Promise<void> => {
  const parsed = ListDrStrategiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(drStrategiesTable.countryId, parsed.data.countryId));
  if (parsed.data.isActive !== undefined) filters.push(eq(drStrategiesTable.isActive, parsed.data.isActive));
  const rows = await db
    .select()
    .from(drStrategiesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(drStrategiesTable.updatedAt));

  // Fetch stages for each strategy
  const strategyIds = rows.map((r) => r.id);
  let stagesMap = new Map<number, typeof drStrategyStagesTable.$inferSelect[]>();
  if (strategyIds.length > 0) {
    const stages = await db
      .select()
      .from(drStrategyStagesTable)
      .where(sql`${drStrategyStagesTable.strategyId} IN (${strategyIds.join(",")})`)
      .orderBy(asc(drStrategyStagesTable.position));
    stagesMap = new Map(stages.reduce((acc, s) => {
      if (!acc.has(s.strategyId)) acc.set(s.strategyId, []);
      acc.get(s.strategyId)!.push(s);
      return acc;
    }, new Map<number, typeof drStrategyStagesTable.$inferSelect[]>()));
  }

  const result = rows.map((r) => ({
    ...r,
    stages: stagesMap.get(r.id) ?? [],
  }));

  res.json(ListDrStrategiesResponse.parse(result));
});

router.post("/dr-strategies", async (req, res): Promise<void> => {
  const parsed = CreateDrStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(drStrategiesTable).values(parsed.data).returning();
  
  // Create default stages if no custom stages provided
  if (!parsed.data.customStages) {
    const defaultStages = getDefaultStages(parsed.data.type);
    if (defaultStages.length > 0) {
      await db.insert(drStrategyStagesTable).values(
        defaultStages.map((s, i) => ({ ...s, strategyId: row.id, position: i }))
      );
    }
  } else if (parsed.data.customStages && Array.isArray(parsed.data.customStages)) {
    await db.insert(drStrategyStagesTable).values(
      parsed.data.customStages.map((s, i) => ({ ...s, strategyId: row.id, position: i }))
    );
  }

  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "dr_strategy",
    entityId: String(row.id),
    kind: "dr_strategy",
    title: "DR strategy created",
    description: `${row.name} strategy was created.`,
    countryId: row.countryId,
    after: { id: row.id, name: row.name, type: row.type },
  });
  res.status(201).json(CreateDrStrategyResponse.parse(row));
});

router.get("/dr-strategies/:id", async (req, res): Promise<void> => {
  const params = { id: Number(req.params.id) };
  const [row] = await db.select().from(drStrategiesTable).where(eq(drStrategiesTable.id, params.id));
  if (!row) {
    res.status(404).json({ error: "DR strategy not found." });
    return;
  }
  const stages = await db
    .select()
    .from(drStrategyStagesTable)
    .where(eq(drStrategyStagesTable.strategyId, row.id))
    .orderBy(asc(drStrategyStagesTable.position));
  res.json({ ...row, stages });
});

router.patch("/dr-strategies/:id", async (req, res): Promise<void> => {
  const params = UpdateDrStrategyParams.safeParse({ id: Number(req.params.id) });
  const parsed = UpdateDrStrategyBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid DR strategy update." });
    return;
  }
  const [existing] = await db.select().from(drStrategiesTable).where(eq(drStrategiesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "DR strategy not found." });
    return;
  }
  const [row] = await db.update(drStrategiesTable).set(parsed.data).where(eq(drStrategiesTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["name", "type", "isActive"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "dr_strategy",
    entityId: String(row.id),
    kind: "dr_strategy",
    title: "DR strategy updated",
    description: `${row.name} strategy was updated.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/dr-strategies/:id", async (req, res): Promise<void> => {
  const params = DeleteDrStrategyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid DR strategy id." });
    return;
  }
  const [existing] = await db.select().from(drStrategiesTable).where(eq(drStrategiesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "DR strategy not found." });
    return;
  }
  await db.delete(drStrategiesTable).where(eq(drStrategiesTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "dr_strategy",
    entityId: String(params.data.id),
    kind: "dr_strategy",
    title: "DR strategy deleted",
    description: `${existing.name} strategy was removed.`,
    countryId: existing.countryId,
  });
  res.json({ id: params.data.id });
});

function getDefaultStages(type: string): { label: string; description: string; position: number; slaDays?: number }[] {
  const stages: Record<string, { label: string; description: string; position: number; slaDays?: number }[]> = {
    uskdr: [
      { label: "Scoping", description: "Define scope and objectives", position: 0, slaDays: 30 },
      { label: "Negotiation", description: "Negotiate terms", position: 1, slaDays: 60 },
      { label: "Approval", description: "Internal approval process", position: 2, slaDays: 30 },
      { label: "Implementation", description: "Execute agreed actions", position: 3, slaDays: 90 },
      { label: "Monitoring", description: "Ongoing monitoring and reporting", position: 4, slaDays: 365 },
    ],
    hq_agreement: [
      { label: "Drafting", description: "Draft agreement text", position: 0, slaDays: 30 },
      { label: "Negotiation", description: "Negotiate with counterpart", position: 1, slaDays: 60 },
      { label: "Legal Review", description: "Legal team review", position: 2, slaDays: 30 },
      { label: "Signature", description: "Sign agreement", position: 3, slaDays: 15 },
      { label: "Ratification", description: "Formal ratification", position: 4, slaDays: 60 },
    ],
    host_country: [
      { label: "Negotiation", description: "Negotiate terms", position: 0, slaDays: 60 },
      { label: "Legal Review", description: "Legal review", position: 1, slaDays: 30 },
      { label: "Approval", description: "Government approval", position: 2, slaDays: 30 },
      { label: "Signature", description: "Sign agreement", position: 3, slaDays: 15 },
      { label: "Implementation", description: "Implement agreement", position: 4, slaDays: 90 },
    ],
    sister_city: [
      { label: "Proposal", description: "Propose partnership", position: 0, slaDays: 30 },
      { label: "Agreement", description: "Sign agreement", position: 1, slaDays: 30 },
      { label: "Exchange Programs", description: "Launch exchange programs", position: 2, slaDays: 180 },
      { label: "Review", description: "Periodic review", position: 3, slaDays: 365 },
    ],
    proclamation: [
      { label: "Drafting", description: "Draft proclamation text", position: 0, slaDays: 15 },
      { label: "Review", description: "Internal review", position: 1, slaDays: 15 },
      { label: "Approval", description: "Leadership approval", position: 2, slaDays: 15 },
      { label: "Publication", description: "Official publication", position: 3, slaDays: 7 },
    ],
    ngo_partnership: [
      { label: "Scoping", description: "Define partnership scope", position: 0, slaDays: 30 },
      { label: "MOA Drafting", description: "Draft MOA", position: 1, slaDays: 30 },
      { label: "Review", description: "Stakeholder review", position: 2, slaDays: 30 },
      { label: "Signing", description: "Sign MOA", position: 3, slaDays: 15 },
      { label: "Implementation", description: "Implement partnership", position: 4, slaDays: 90 },
    ],
    refugee_partnership: [
      { label: "Assessment", description: "Needs assessment", position: 0, slaDays: 30 },
      { label: "Agreement", description: "Negotiate agreement", position: 1, slaDays: 60 },
      { label: "Implementation", description: "Implement programs", position: 2, slaDays: 180 },
      { label: "Monitoring", description: "Ongoing monitoring", position: 3, slaDays: 365 },
    ],
    university_partnership: [
      { label: "Proposal", description: "Submit proposal", position: 0, slaDays: 30 },
      { label: "MOU", description: "Sign MOU", position: 1, slaDays: 30 },
      { label: "Program Design", description: "Design programs", position: 2, slaDays: 90 },
      { label: "Launch", description: "Launch programs", position: 3, slaDays: 60 },
      { label: "Evaluation", description: "Evaluate outcomes", position: 4, slaDays: 365 },
    ],
  };
  return stages[type] ?? [];
}

export default router;