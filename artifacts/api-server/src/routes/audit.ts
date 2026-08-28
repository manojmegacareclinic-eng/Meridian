import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, activityTable, countriesTable } from "@workspace/db";
import { ListAuditQueryParams, ListAuditResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const parsed = ListAuditQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { action, entityType, entityId, actorId, limit } = parsed.data;
  const filters = [];
  if (action) filters.push(eq(activityTable.action, action));
  if (entityType) filters.push(eq(activityTable.entityType, entityType));
  if (entityId) filters.push(eq(activityTable.entityId, entityId));
  if (actorId) filters.push(eq(activityTable.actorId, actorId));
  const rows = await db
    .select({
      id: activityTable.id,
      kind: activityTable.kind,
      title: activityTable.title,
      description: activityTable.description,
      occurredAt: activityTable.occurredAt,
      countryName: countriesTable.name,
      actorId: activityTable.actorId,
      actorName: activityTable.actorName,
      action: activityTable.action,
      entityType: activityTable.entityType,
      entityId: activityTable.entityId,
      before: activityTable.before,
      after: activityTable.after,
    })
    .from(activityTable)
    .leftJoin(countriesTable, eq(activityTable.countryId, countriesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(activityTable.occurredAt))
    .limit(limit);
  res.json(ListAuditResponse.parse(rows));
});

export default router;