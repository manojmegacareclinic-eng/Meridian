import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, ministriesTable, positionsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreatePositionBody,
  CreatePositionParams,
  CreatePositionResponse,
  DeletePositionParams,
  DeletePositionResponse,
  ListPositionsParams,
  ListPositionsResponseItem,
  Position,
  UpdatePositionBody,
  UpdatePositionParams,
  UpdatePositionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ministries/:id/positions", async (req, res): Promise<void> => {
  const params = ListPositionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ministry id." });
    return;
  }
  const [existingMinistry] = await db.select({ id: ministriesTable.id }).from(ministriesTable).where(eq(ministriesTable.id, params.data.id));
  if (!existingMinistry) {
    res.status(404).json({ error: "Ministry not found." });
    return;
  }
  const rows = await db
    .select()
    .from(positionsTable)
    .where(eq(positionsTable.ministryId, params.data.id))
    .orderBy(asc(positionsTable.sortOrder), asc(positionsTable.title));
  res.json(rows);
});

router.post("/ministries/:id/positions", async (req, res): Promise<void> => {
  const params = CreatePositionParams.safeParse(req.params);
  const parsed = CreatePositionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid position creation." });
    return;
  }
  const [existingMinistry] = await db.select().from(ministriesTable).where(eq(ministriesTable.id, params.data.id));
  if (!existingMinistry) {
    res.status(404).json({ error: "Ministry not found." });
    return;
  }
  const [row] = await db.insert(positionsTable).values({ ...parsed.data, ministryId: params.data.id }).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "position",
    entityId: String(row.id),
    kind: "position",
    title: "Position created",
    description: `${row.title} position was added to the ministry.`,
    countryId: existingMinistry.countryId ?? null,
    after: { id: row.id, title: row.title, ministryId: row.ministryId },
  });
  res.status(201).json(CreatePositionResponse.parse(row));
});

router.patch("/positions/:id", async (req, res): Promise<void> => {
  const params = UpdatePositionParams.safeParse(req.params);
  const parsed = UpdatePositionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid position update." });
    return;
  }
  const [existing] = await db.select().from(positionsTable).where(eq(positionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Position not found." });
    return;
  }
  const [row] = await db.update(positionsTable).set(parsed.data).where(eq(positionsTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["title", "description", "sortOrder"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "position",
    entityId: String(row.id),
    kind: "position",
    title: "Position updated",
    description: `${row.title} position was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdatePositionResponse.parse(row));
});

router.delete("/positions/:id", async (req, res): Promise<void> => {
  const params = DeletePositionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid position id." });
    return;
  }
  const [existing] = await db.select().from(positionsTable).where(eq(positionsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Position not found." });
    return;
  }
  await db.delete(positionsTable).where(eq(positionsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "position",
    entityId: String(params.data.id),
    kind: "position",
    title: "Position deleted",
    description: `${existing.title} position was removed.`,
    countryId: null,
  });
  res.json(DeletePositionResponse.parse({ id: params.data.id }));
});

export default router;