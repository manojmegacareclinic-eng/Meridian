import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, officeTermsTable, positionsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateOfficeTermBody,
  CreateOfficeTermParams,
  CreateOfficeTermResponse,
  DeleteOfficeTermParams,
  DeleteOfficeTermResponse,
  ListOfficeTermsParams,
  ListOfficeTermsResponseItem,
  OfficeTerm,
  OfficeTermUpdate,
  UpdateOfficeTermBody,
  UpdateOfficeTermParams,
  UpdateOfficeTermResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/positions/:id/terms", async (req, res): Promise<void> => {
  const params = ListOfficeTermsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid position id." });
    return;
  }
  const [existingPosition] = await db.select({ id: positionsTable.id }).from(positionsTable).where(eq(positionsTable.id, params.data.id));
  if (!existingPosition) {
    res.status(404).json({ error: "Position not found." });
    return;
  }
  const rows = await db
    .select()
    .from(officeTermsTable)
    .where(eq(officeTermsTable.positionId, params.data.id))
    .orderBy(desc(officeTermsTable.startDate));
  res.json(rows);
});

router.post("/positions/:id/terms", async (req, res): Promise<void> => {
  const params = CreateOfficeTermParams.safeParse(req.params);
  const parsed = CreateOfficeTermBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid office term creation." });
    return;
  }
  const [existingPosition] = await db.select().from(positionsTable).where(eq(positionsTable.id, params.data.id));
  if (!existingPosition) {
    res.status(404).json({ error: "Position not found." });
    return;
  }
  // Close any existing current term for this position
  const startDateStrForUpdate = parsed.data.startDate.toISOString().slice(0, 10);
  await db
    .update(officeTermsTable)
    .set({ endDate: startDateStrForUpdate, isCurrent: 0 })
    .where(and(eq(officeTermsTable.positionId, params.data.id), eq(officeTermsTable.isCurrent, 1)));
  const startDateStr = parsed.data.startDate.toISOString().slice(0, 10);
  const endDateStr = parsed.data.endDate ? parsed.data.endDate.toISOString().slice(0, 10) : null;
  const [row] = await db
    .insert(officeTermsTable)
    .values({
      ...parsed.data,
      positionId: params.data.id,
      isCurrent: 1,
      startDate: startDateStr,
      endDate: endDateStr,
    })
    .returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "office_term",
    entityId: String(row.id),
    kind: "office_term",
    title: "Office term created",
    description: `${row.personName} started as ${existingPosition.title}.`,
    countryId: null,
    after: { id: row.id, personName: row.personName, startDate: row.startDate, isCurrent: row.isCurrent },
  });
  res.status(201).json(CreateOfficeTermResponse.parse(row));
});

router.patch("/terms/:id", async (req, res): Promise<void> => {
  const params = UpdateOfficeTermParams.safeParse(req.params);
  const parsed = UpdateOfficeTermBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid office term update." });
    return;
  }
  const [existing] = await db.select().from(officeTermsTable).where(eq(officeTermsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Office term not found." });
    return;
  }
  const updateData = {
    ...parsed.data,
    startDate: parsed.data.startDate ? parsed.data.startDate.toISOString().slice(0, 10) : undefined,
    endDate: parsed.data.endDate ? parsed.data.endDate.toISOString().slice(0, 10) : parsed.data.endDate === null ? null : undefined,
    isCurrent: parsed.data.endDate === undefined ? existing.isCurrent : parsed.data.endDate === null ? 1 : 0,
  };
  // If setting a new current term (endDate cleared or set to null), close other current terms for same position
  if (updateData.isCurrent === 1) {
    await db
      .update(officeTermsTable)
      .set({ endDate: existing.startDate, isCurrent: 0 })
      .where(and(eq(officeTermsTable.positionId, existing.positionId), eq(officeTermsTable.isCurrent, 1), sql`${officeTermsTable.id} != ${params.data.id}`));
  }
  const [row] = await db.update(officeTermsTable).set(updateData).where(eq(officeTermsTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["personName", "personEmail", "personPhone", "startDate", "endDate", "isCurrent"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "office_term",
    entityId: String(row.id),
    kind: "office_term",
    title: "Office term updated",
    description: `Office term for position ${existing.positionId} was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateOfficeTermResponse.parse(row));
});

router.delete("/terms/:id", async (req, res): Promise<void> => {
  const params = DeleteOfficeTermParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid office term id." });
    return;
  }
  const [existing] = await db.select().from(officeTermsTable).where(eq(officeTermsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Office term not found." });
    return;
  }
  await db.delete(officeTermsTable).where(eq(officeTermsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "office_term",
    entityId: String(params.data.id),
    kind: "office_term",
    title: "Office term deleted",
    description: `Office term for ${existing.personName} was removed.`,
    countryId: null,
  });
  res.json(DeleteOfficeTermResponse.parse({ id: params.data.id }));
});

export default router;