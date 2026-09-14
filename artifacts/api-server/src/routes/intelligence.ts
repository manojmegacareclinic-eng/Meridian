import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  changeEventsTable,
  countriesTable,
  db,
  intelligenceFindingsTable,
  intelligenceSourcesTable,
  sourceKinds,
} from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { applyFindingToOfficialRecord, tierForKind } from "../lib/intelligence";
import { getActor, requireWriteRole } from "../middlewares/guards";
import {
  ApproveIntelligenceFindingBody,
  ApproveIntelligenceFindingParams,
  ApproveIntelligenceFindingResponse,
  CreateIntelligenceFindingBody,
  CreateIntelligenceFindingResponse,
  CreateIntelligenceSourceBody,
  CreateIntelligenceSourceResponse,
  GetIntelligenceFindingParams,
  GetIntelligenceFindingResponse,
  ListChangeEventsQueryParams,
  ListChangeEventsResponse,
  ListIntelligenceFindingsQueryParams,
  ListIntelligenceFindingsResponse,
  ListIntelligenceSourcesResponse,
  RejectIntelligenceFindingBody,
  RejectIntelligenceFindingParams,
  RejectIntelligenceFindingResponse,
  UpdateIntelligenceSourceBody,
  UpdateIntelligenceSourceParams,
  UpdateIntelligenceSourceResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const writeRole: RequestHandler = requireWriteRole();

const toISO = (value?: Date | string | null) => (value ? new Date(value).toISOString() : null);

const serializeSource = (row: typeof intelligenceSourcesTable.$inferSelect) => ({
  ...row,
  notes: row.notes ?? null,
  createdAt: toISO(row.createdAt),
});

const serializeFinding = (row: typeof intelligenceFindingsTable.$inferSelect & {
  sourceName: string | null;
  sourceTier: number | null;
}) => ({
  id: row.id,
  sourceId: row.sourceId,
  sourceName: row.sourceName,
  sourceTier: row.sourceTier,
  topic: row.topic,
  headline: row.headline,
  url: row.url ?? null,
  summary: row.summary ?? null,
  confidence: row.confidence,
  targetType: row.targetType ?? null,
  targetId: row.targetId ?? null,
  field: row.field ?? null,
  value: row.value ?? null,
  stage: row.stage,
  reviewNote: row.reviewNote ?? null,
  applied: row.applied,
  reviewedByUserId: row.reviewedByUserId ?? null,
  reviewedAt: toISO(row.reviewedAt),
  createdAt: toISO(row.createdAt),
  deletedAt: toISO(row.deletedAt),
});

const findingFingerprint = (sourceId: number, url: string | null | undefined, headline: string): string =>
  url ? `${sourceId}:${url}` : `${sourceId}:${headline.trim().toLowerCase()}`;

const findingsWithSource = {
  id: intelligenceFindingsTable.id,
  sourceId: intelligenceFindingsTable.sourceId,
  topic: intelligenceFindingsTable.topic,
  headline: intelligenceFindingsTable.headline,
  url: intelligenceFindingsTable.url,
  summary: intelligenceFindingsTable.summary,
  confidence: intelligenceFindingsTable.confidence,
  targetType: intelligenceFindingsTable.targetType,
  targetId: intelligenceFindingsTable.targetId,
  field: intelligenceFindingsTable.field,
  value: intelligenceFindingsTable.value,
  stage: intelligenceFindingsTable.stage,
  reviewNote: intelligenceFindingsTable.reviewNote,
  applied: intelligenceFindingsTable.applied,
  reviewedByUserId: intelligenceFindingsTable.reviewedByUserId,
  reviewedAt: intelligenceFindingsTable.reviewedAt,
  createdAt: intelligenceFindingsTable.createdAt,
  deletedAt: intelligenceFindingsTable.deletedAt,
  fingerprint: intelligenceFindingsTable.fingerprint,
  sourceName: intelligenceSourcesTable.name,
  sourceTier: intelligenceSourcesTable.tier,
};

router.get("/sources", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(intelligenceSourcesTable)
    .orderBy(intelligenceSourcesTable.tier, intelligenceSourcesTable.name);
  res.json(ListIntelligenceSourcesResponse.parse({ items: rows.map(serializeSource) }));
});

router.post("/sources", writeRole, async (req, res): Promise<void> => {
  const parsed = CreateIntelligenceSourceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!(sourceKinds as readonly string[]).includes(parsed.data.kind)) { res.status(400).json({ error: "Unknown source kind." }); return; }
  const [row] = await db
    .insert(intelligenceSourcesTable)
    .values({ ...parsed.data, tier: parsed.data.tier ?? tierForKind(parsed.data.kind) })
    .returning();
  if (!row) { res.status(500).json({ error: "Source creation failed." }); return; }
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "intelligence_source",
    entityId: String(row.id),
    kind: "intelligence",
    title: "Intelligence source added",
    description: `Source ${row.name} (${row.kind}, tier ${row.tier}) was added.`,
    after: { id: row.id, name: row.name, kind: row.kind, tier: row.tier, baseUrl: row.baseUrl },
  });
  res.json(CreateIntelligenceSourceResponse.parse(serializeSource(row)));
});

router.patch("/sources/:id", writeRole, async (req, res): Promise<void> => {
  const params = UpdateIntelligenceSourceParams.safeParse(req.params);
  const parsed = UpdateIntelligenceSourceBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid source update." }); return; }
  if (parsed.data.kind && !(sourceKinds as readonly string[]).includes(parsed.data.kind)) { res.status(400).json({ error: "Unknown source kind." }); return; }
  const [existing] = await db.select().from(intelligenceSourcesTable).where(eq(intelligenceSourcesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Intelligence source not found." }); return; }
  const values = {
    ...parsed.data,
    tier: parsed.data.tier ?? (parsed.data.kind ? tierForKind(parsed.data.kind) : existing.tier),
  };
  const [row] = await db.update(intelligenceSourcesTable).set(values).where(eq(intelligenceSourcesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Intelligence source not found." }); return; }
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["name", "kind", "tier", "baseUrl", "notes", "status"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "intelligence_source",
    entityId: String(row.id),
    kind: "intelligence",
    title: "Intelligence source updated",
    description: `Source ${row.name} was updated.`,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateIntelligenceSourceResponse.parse(serializeSource(row)));
});

router.get("/findings", async (req, res): Promise<void> => {
  const parsed = ListIntelligenceFindingsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.topic) filters.push(eq(intelligenceFindingsTable.topic, parsed.data.topic));
  if (parsed.data.stage) filters.push(eq(intelligenceFindingsTable.stage, parsed.data.stage));
  if (parsed.data.sourceId) filters.push(eq(intelligenceFindingsTable.sourceId, parsed.data.sourceId));
  if (parsed.data.targetType) filters.push(eq(intelligenceFindingsTable.targetType, parsed.data.targetType));
  if (parsed.data.minConfidence) filters.push(gte(intelligenceFindingsTable.confidence, parsed.data.minConfidence));
  const limit = Math.min(parsed.data.limit ?? 200, 200);
  const rows = await db
    .select(findingsWithSource)
    .from(intelligenceFindingsTable)
    .innerJoin(intelligenceSourcesTable, eq(intelligenceFindingsTable.sourceId, intelligenceSourcesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(
      sql`CASE WHEN ${intelligenceFindingsTable.stage} = 'open' THEN 0 ELSE 1 END`,
      desc(intelligenceFindingsTable.createdAt)
    )
    .limit(limit);
  res.json(ListIntelligenceFindingsResponse.parse({ items: rows.map(serializeFinding) }));
});

router.get("/findings/:id", async (req, res): Promise<void> => {
  const params = GetIntelligenceFindingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid finding id." }); return; }
  const [row] = await db
    .select(findingsWithSource)
    .from(intelligenceFindingsTable)
    .innerJoin(intelligenceSourcesTable, eq(intelligenceFindingsTable.sourceId, intelligenceSourcesTable.id))
    .where(eq(intelligenceFindingsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Finding not found." }); return; }
  res.json(GetIntelligenceFindingResponse.parse(serializeFinding(row)));
});

router.post("/findings", writeRole, async (req, res): Promise<void> => {
  const parsed = CreateIntelligenceFindingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [source] = await db.select().from(intelligenceSourcesTable).where(eq(intelligenceSourcesTable.id, parsed.data.sourceId));
  if (!source) { res.status(404).json({ error: "Intelligence source not found." }); return; }
  const fingerprint = findingFingerprint(parsed.data.sourceId, parsed.data.url ?? null, parsed.data.headline);
  const existing = await db.select().from(intelligenceFindingsTable).where(eq(intelligenceFindingsTable.fingerprint, fingerprint));
  const actor = getActor(req);

  if (existing[0]) {
    if (existing[0].stage !== "open") {
      res.status(409).json({ error: "A decided finding with this source/fingerprint already exists.", id: existing[0].id });
      return;
    }
    const [updated] = await db
      .update(intelligenceFindingsTable)
      .set({
        topic: parsed.data.topic,
        headline: parsed.data.headline,
        url: parsed.data.url ?? null,
        summary: parsed.data.summary ?? null,
        confidence: parsed.data.confidence ?? existing[0].confidence,
        targetType: parsed.data.targetType ?? null,
        targetId: parsed.data.targetId ?? null,
        field: parsed.data.field ?? null,
        value: parsed.data.value ?? null,
      })
      .where(eq(intelligenceFindingsTable.id, existing[0].id))
      .returning();
    if (!updated) { res.status(500).json({ error: "Finding refresh failed." }); return; }
    await writeAudit({
      actor,
      action: "update",
      entityType: "intelligence_finding",
      entityId: String(updated.id),
      kind: "intelligence",
      title: "Finding refreshed",
      description: `Finding "${updated.headline}" was refreshed from the same fingerprint.`,
    });
    const joined = await db.select(findingsWithSource).from(intelligenceFindingsTable)
      .innerJoin(intelligenceSourcesTable, eq(intelligenceFindingsTable.sourceId, intelligenceSourcesTable.id))
      .where(eq(intelligenceFindingsTable.id, updated.id));
    res.json(CreateIntelligenceFindingResponse.parse(serializeFinding(joined[0])));
    return;
  }

  const [row] = await db
    .insert(intelligenceFindingsTable)
    .values({
      sourceId: parsed.data.sourceId,
      topic: parsed.data.topic,
      headline: parsed.data.headline,
      url: parsed.data.url ?? null,
      summary: parsed.data.summary ?? null,
      confidence: parsed.data.confidence ?? 50,
      targetType: parsed.data.targetType ?? null,
      targetId: parsed.data.targetId ?? null,
      field: parsed.data.field ?? null,
      value: parsed.data.value ?? null,
      fingerprint,
    })
    .returning();
  if (!row) { res.status(500).json({ error: "Finding creation failed." }); return; }
  const auditCountryId =
    row.targetType === "country" && row.targetId != null
      ? await db
          .select({ id: countriesTable.id })
          .from(countriesTable)
          .where(eq(countriesTable.id, row.targetId))
          .then((rows) => (rows[0] ? row.targetId : null))
      : null;
  await writeAudit({
    actor,
    action: "create",
    entityType: "intelligence_finding",
    entityId: String(row.id),
    kind: "intelligence",
    title: "Finding created",
    description: `Finding "${row.headline}" entered the review queue.`,
    countryId: auditCountryId,
    after: { id: row.id, topic: row.topic, headline: row.headline, confidence: row.confidence },
  });
  res.json(CreateIntelligenceFindingResponse.parse(serializeFinding({ ...row, sourceName: source.name, sourceTier: source.tier })));
});

router.post("/findings/:id/approve", writeRole, async (req, res): Promise<void> => {
  const params = ApproveIntelligenceFindingParams.safeParse(req.params);
  const parsed = ApproveIntelligenceFindingBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid approval request." }); return; }
  const [finding] = await db.select().from(intelligenceFindingsTable).where(eq(intelligenceFindingsTable.id, params.data.id));
  if (!finding) { res.status(404).json({ error: "Finding not found." }); return; }
  if (finding.stage !== "open") { res.status(409).json({ error: "Finding already decided." }); return; }

  const actor = getActor(req);
  const reviewedAt = new Date();
  let applied = false;
  let changeEventId: number | null = null;

  if (parsed.data.apply) {
    const result = await applyFindingToOfficialRecord(db, finding);
    if (!result.ok) {
      res.status(400).json({ error: result.reason });
      return;
    }
    applied = true;
    const [event] = await db
      .insert(changeEventsTable)
      .values({
        findingId: finding.id,
        entityType: result.entityType,
        entityId: result.entityId,
        field: finding.field,
        beforeValue: result.beforeValue,
        afterValue: result.afterValue,
        applied: true,
        sourceUrl: finding.url ?? null,
        reviewedByUserId: actor.id,
        reviewedAt,
      })
      .returning();
    changeEventId = event?.id ?? null;
    await writeAudit({
      actor,
      action: "update",
      entityType: result.entityType as "country" | "organization" | "contact",
      entityId: String(result.entityId),
      kind: "intelligence",
      title: "Intelligence-approved change applied",
      description: `Finding "${finding.headline}" was approved and its proposed change applied.`,
      countryId: result.entityType === "country" ? result.entityId : null,
      before: { [finding.field ?? "value"]: result.beforeValue },
      after: { [finding.field ?? "value"]: result.afterValue },
    });
  }

  await db
    .update(intelligenceFindingsTable)
    .set({
      stage: "approved",
      applied,
      reviewNote: parsed.data.reviewNote ?? null,
      reviewedByUserId: actor.id,
      reviewedAt,
    })
    .where(eq(intelligenceFindingsTable.id, finding.id));

  await writeAudit({
    actor,
    action: "update",
    entityType: "intelligence_finding",
    entityId: String(finding.id),
    kind: "intelligence",
    title: "Finding approved",
    description: `Finding "${finding.headline}" was approved by ${actor.name}.`,
    after: { stage: "approved", applied },
  });

  res.json(ApproveIntelligenceFindingResponse.parse({
    id: finding.id,
    stage: "approved",
    applied,
    changeEventId,
    reviewedByUserId: actor.id,
    reviewedAt: reviewedAt.toISOString(),
  }));
});

router.post("/findings/:id/reject", writeRole, async (req, res): Promise<void> => {
  const params = RejectIntelligenceFindingParams.safeParse(req.params);
  const parsed = RejectIntelligenceFindingBody.safeParse(req.body ?? {});
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid rejection request." }); return; }
  const [finding] = await db.select().from(intelligenceFindingsTable).where(eq(intelligenceFindingsTable.id, params.data.id));
  if (!finding) { res.status(404).json({ error: "Finding not found." }); return; }
  if (finding.stage !== "open") { res.status(409).json({ error: "Finding already decided." }); return; }

  const actor = getActor(req);
  const reviewedAt = new Date();
  await db
    .update(intelligenceFindingsTable)
    .set({
      stage: "rejected",
      applied: false,
      reviewNote: parsed.data.reviewNote ?? null,
      reviewedByUserId: actor.id,
      reviewedAt,
    })
    .where(eq(intelligenceFindingsTable.id, finding.id));

  await writeAudit({
    actor,
    action: "update",
    entityType: "intelligence_finding",
    entityId: String(finding.id),
    kind: "intelligence",
    title: "Finding rejected",
    description: `Finding "${finding.headline}" was rejected by ${actor.name}.`,
    after: { stage: "rejected", reviewNote: parsed.data.reviewNote ?? null },
  });

  res.json(RejectIntelligenceFindingResponse.parse({
    id: finding.id,
    stage: "rejected",
    reviewedByUserId: actor.id,
    reviewedAt: reviewedAt.toISOString(),
  }));
});

router.get("/change-events", async (req, res): Promise<void> => {
  const parsed = ListChangeEventsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.entityType) filters.push(eq(changeEventsTable.entityType, parsed.data.entityType));
  if (parsed.data.entityId) filters.push(eq(changeEventsTable.entityId, parsed.data.entityId));
  if (parsed.data.findingId) filters.push(eq(changeEventsTable.findingId, parsed.data.findingId));
  const rows = await db
    .select()
    .from(changeEventsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(changeEventsTable.reviewedAt));
  res.json(ListChangeEventsResponse.parse({
    items: rows.map((r) => ({
      ...r,
      entityType: r.entityType ?? null,
      entityId: r.entityId ?? null,
      field: r.field ?? null,
      beforeValue: r.beforeValue ?? null,
      afterValue: r.afterValue ?? null,
      sourceUrl: r.sourceUrl ?? null,
      reviewedByUserId: r.reviewedByUserId ?? null,
      reviewedAt: toISO(r.reviewedAt),
      createdAt: toISO(r.createdAt),
    })),
  }));
});

export default router;