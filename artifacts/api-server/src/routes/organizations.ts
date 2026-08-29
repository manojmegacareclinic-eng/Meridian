import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db, organizationsTable, countriesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateOrganizationBody,
  CreateOrganizationResponse,
  DeleteOrganizationParams,
  DeleteOrganizationResponse,
  GetOrganizationParams,
  GetOrganizationResponse,
  ListOrganizationsQueryParams,
  ListOrganizationsResponseItem,
  Organization,
  OrganizationUpdate,
  UpdateOrganizationBody,
  UpdateOrganizationParams,
  UpdateOrganizationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/organizations", async (req, res): Promise<void> => {
  const parsed = ListOrganizationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [eq(organizationsTable.countryId, parsed.data.countryId)];
  if (parsed.data.type) {
    filters.push(eq(organizationsTable.type, parsed.data.type));
  }
  const rows = await db
    .select()
    .from(organizationsTable)
    .where(and(...filters))
    .orderBy(asc(organizationsTable.name));
  res.json(rows);
});

router.post("/organizations", async (req, res): Promise<void> => {
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [country] = await db.select({ id: countriesTable.id }).from(countriesTable).where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) {
    res.status(400).json({ error: "Country workspace not found." });
    return;
  }
  const [row] = await db.insert(organizationsTable).values(parsed.data).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "organization",
    entityId: String(row.id),
    kind: "organization",
    title: "Organization created",
    description: `${row.name} (${row.type}) was added to the directory.`,
    countryId: row.countryId,
    after: { id: row.id, name: row.name, type: row.type },
  });
  res.status(201).json(CreateOrganizationResponse.parse(row));
});

router.get("/organizations/:id", async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid organization id." });
    return;
  }
  const [row] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }
  res.json(GetOrganizationResponse.parse(row));
});

router.patch("/organizations/:id", async (req, res): Promise<void> => {
  const params = UpdateOrganizationParams.safeParse(req.params);
  const parsed = UpdateOrganizationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid organization update." });
    return;
  }
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }
  const [row] = await db.update(organizationsTable).set(parsed.data).where(eq(organizationsTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["name", "type", "address", "website", "notes", "metadata"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "organization",
    entityId: String(row.id),
    kind: "organization",
    title: "Organization updated",
    description: `${row.name} organization was updated.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateOrganizationResponse.parse(row));
});

router.delete("/organizations/:id", async (req, res): Promise<void> => {
  const params = DeleteOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid organization id." });
    return;
  }
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }
  await db.delete(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "organization",
    entityId: String(params.data.id),
    kind: "organization",
    title: "Organization deleted",
    description: `${existing.name} organization was removed from the directory.`,
    countryId: existing.countryId,
  });
  res.json(DeleteOrganizationResponse.parse({ id: params.data.id }));
});

export default router;