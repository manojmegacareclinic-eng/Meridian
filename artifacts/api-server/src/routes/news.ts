import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, countriesTable, newsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateNewsBody,
  CreateNewsResponse,
  DeleteNewsParams,
  DeleteNewsResponse,
  ListNewsQueryParams,
  ListNewsResponseItem,
  NewsInput,
  NewsUpdate,
  UpdateNewsBody,
  UpdateNewsParams,
  UpdateNewsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const parsed = ListNewsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(newsTable.countryId, parsed.data.countryId));
  const limit = Math.min(parsed.data.limit ?? 50, 200);
  const rows = await db.select().from(newsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(newsTable.publishedAt))
    .limit(limit);
  res.json(rows.map((r) => ListNewsResponseItem.parse(r)));
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateNewsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [country] = await db.select({ id: countriesTable.id }).from(countriesTable).where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) { res.status(400).json({ error: "Country workspace not found." }); return; }
  const [row] = await db.insert(newsTable).values({
    ...parsed.data,
    publishedAt: parsed.data.publishedAt,
  }).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "news",
    entityId: String(row.id),
    kind: "news",
    title: "News item created",
    description: `${row.title} was added to the workspace.`,
    countryId: row.countryId,
    after: { id: row.id, title: row.title, source: row.source },
  });
  res.status(201).json(CreateNewsResponse.parse(row));
});

router.patch("/:id", async (req, res): Promise<void> => {
  const params = UpdateNewsParams.safeParse(req.params);
  const parsed = UpdateNewsBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid news update." }); return; }
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "News item not found." }); return; }
  const [row] = await db.update(newsTable).set(parsed.data).where(eq(newsTable.id, params.data.id)).returning();
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["title", "source", "url", "summary", "publishedAt"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "news",
    entityId: String(row.id),
    kind: "news",
    title: "News item updated",
    description: `${row.title} was updated in the workspace.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateNewsResponse.parse(row));
});

router.delete("/:id", async (req, res): Promise<void> => {
  const params = DeleteNewsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid news id." }); return; }
  const [existing] = await db.select().from(newsTable).where(eq(newsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "News item not found." }); return; }
  await db.delete(newsTable).where(eq(newsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "news",
    entityId: String(params.data.id),
    kind: "news",
    title: "News item removed",
    description: `${existing.title} was removed from the workspace.`,
    countryId: existing.countryId,
  });
  res.json(DeleteNewsResponse.parse({ id: params.data.id }));
});

export default router;