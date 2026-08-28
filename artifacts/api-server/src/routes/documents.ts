import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, agreementsTable, countriesTable, documentsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateDocumentBody,
  CreateDocumentResponse,
  DeleteDocumentParams,
  DeleteDocumentResponse,
  DocumentInput,
  DocumentUpdate,
  ListDocumentsQueryParams,
  ListDocumentsResponseItem,
  UpdateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const parsed = ListDocumentsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(documentsTable.countryId, parsed.data.countryId));
  if (parsed.data.type) filters.push(eq(documentsTable.type, parsed.data.type));
  if (parsed.data.status) filters.push(eq(documentsTable.status, parsed.data.status));
  if (parsed.data.agreementId) filters.push(eq(documentsTable.agreementId, parsed.data.agreementId));
  const limit = Math.min(parsed.data.limit ?? 50, 200);
  const rows = await db.select({
    id: documentsTable.id,
    countryId: documentsTable.countryId,
    title: documentsTable.title,
    type: documentsTable.type,
    url: documentsTable.url,
    datedOn: documentsTable.datedOn,
    notes: documentsTable.notes,
    agreementId: documentsTable.agreementId,
    agreementName: agreementsTable.name,
    status: documentsTable.status,
    createdAt: documentsTable.createdAt,
  }).from(documentsTable).leftJoin(agreementsTable, eq(documentsTable.agreementId, agreementsTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(documentsTable.createdAt))
    .limit(limit);
  res.json(rows.map((r) => ListDocumentsResponseItem.parse(r)));
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [country] = await db.select({ id: countriesTable.id }).from(countriesTable).where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) { res.status(400).json({ error: "Country workspace not found." }); return; }
  if (parsed.data.agreementId) {
    const [agreement] = await db.select({ id: agreementsTable.id }).from(agreementsTable).where(eq(agreementsTable.id, parsed.data.agreementId));
    if (!agreement) { res.status(400).json({ error: "Agreement not found." }); return; }
  }
  const insertData = {
    ...parsed.data,
    datedOn: parsed.data.datedOn ? parsed.data.datedOn.toISOString().slice(0, 10) : null,
    status: parsed.data.status ?? "draft",
  };
  const [row] = await db.insert(documentsTable).values(insertData).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "document",
    entityId: String(row.id),
    kind: "document",
    title: "Document created",
    description: `${row.title} was added to the workspace.`,
    countryId: row.countryId,
    after: { id: row.id, title: row.title, type: row.type, status: row.status },
  });
  let agreementName: string | null = null;
  if (row.agreementId !== null) {
    const [agreement] = await db.select({ name: agreementsTable.name }).from(agreementsTable).where(eq(agreementsTable.id, row.agreementId));
    agreementName = agreement?.name ?? null;
  }
  res.status(201).json(CreateDocumentResponse.parse({ ...row, agreementName }));
});

router.patch("/:id", async (req, res): Promise<void> => {
  const params = UpdateDocumentParams.safeParse(req.params);
  const parsed = UpdateDocumentBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid document update." }); return; }
  const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Document not found." }); return; }
  if (parsed.data.agreementId !== undefined && parsed.data.agreementId !== null) {
    const [agreement] = await db.select({ id: agreementsTable.id }).from(agreementsTable).where(eq(agreementsTable.id, parsed.data.agreementId));
    if (!agreement) { res.status(400).json({ error: "Agreement not found." }); return; }
  }
  const updateData = {
    ...parsed.data,
    datedOn: parsed.data.datedOn === null ? null : parsed.data.datedOn?.toISOString().slice(0, 10),
  };
  const [row] = await db.update(documentsTable).set(updateData).where(eq(documentsTable.id, params.data.id)).returning();
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["title", "type", "status", "url", "datedOn", "notes", "agreementId"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "document",
    entityId: String(row.id),
    kind: "document",
    title: "Document updated",
    description: `${row.title} was updated in the workspace.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  let agreementName: string | null = null;
  if (row.agreementId !== null) {
    const [agreement] = await db.select({ name: agreementsTable.name }).from(agreementsTable).where(eq(agreementsTable.id, row.agreementId));
    agreementName = agreement?.name ?? null;
  }
  res.json(UpdateDocumentResponse.parse({ ...row, agreementName }));
});

router.delete("/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid document id." }); return; }
  const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Document not found." }); return; }
  await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "document",
    entityId: String(params.data.id),
    kind: "document",
    title: "Document removed",
    description: `${existing.title} was removed from the workspace.`,
    countryId: existing.countryId,
  });
  res.json(DeleteDocumentResponse.parse({ id: params.data.id }));
});

export default router;