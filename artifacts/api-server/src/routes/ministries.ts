import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, ministriesTable, countriesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateMinistryBody,
  CreateMinistryResponse,
  DeleteMinistryParams,
  DeleteMinistryResponse,
  ListMinistriesQueryParams,
  ListMinistriesResponseItem,
  Ministry,
  UpdateMinistryBody,
  UpdateMinistryParams,
  UpdateMinistryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ministries", async (req, res): Promise<void> => {
  const parsed = ListMinistriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(ministriesTable)
    .where(eq(ministriesTable.countryId, parsed.data.countryId))
    .orderBy(asc(ministriesTable.name));
  res.json(ListMinistriesResponseItem.array().parse(rows));
});

router.post("/ministries", async (req, res): Promise<void> => {
  const parsed = CreateMinistryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [country] = await db
    .select({ id: countriesTable.id })
    .from(countriesTable)
    .where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) {
    res.status(400).json({ error: "Country workspace not found." });
    return;
  }
  const [row] = await db.insert(ministriesTable).values(parsed.data).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "ministry",
    entityId: String(row.id),
    kind: "ministry",
    title: "Ministry created",
    description: `${row.name} ministry was added to the government structure.`,
    countryId: row.countryId,
    after: { id: row.id, name: row.name, type: row.type },
  });
  res.status(201).json(CreateMinistryResponse.parse(row));
});

router.patch("/ministries/:id", async (req, res): Promise<void> => {
  const params = UpdateMinistryParams.safeParse(req.params);
  const parsed = UpdateMinistryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid ministry update." });
    return;
  }
  const [existing] = await db.select().from(ministriesTable).where(eq(ministriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Ministry not found." });
    return;
  }
  const [row] = await db.update(ministriesTable).set(parsed.data).where(eq(ministriesTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["name", "type"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "ministry",
    entityId: String(row.id),
    kind: "ministry",
    title: "Ministry updated",
    description: `${row.name} ministry was updated.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateMinistryResponse.parse(row));
});

router.delete("/ministries/:id", async (req, res): Promise<void> => {
  const params = DeleteMinistryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ministry id." });
    return;
  }
  const [existing] = await db.select().from(ministriesTable).where(eq(ministriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Ministry not found." });
    return;
  }
  await db.delete(ministriesTable).where(eq(ministriesTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "ministry",
    entityId: String(params.data.id),
    kind: "ministry",
    title: "Ministry deleted",
    description: `${existing.name} ministry was removed from the government structure.`,
    countryId: existing.countryId,
  });
  res.json(DeleteMinistryResponse.parse({ id: params.data.id }));
});

export default router;