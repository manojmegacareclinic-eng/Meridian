import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, activityTable, agreementsTable, contactsTable, countriesTable, documentsTable, meetingsTable, newsTable, userTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import { WRITE_ROLES } from "@workspace/auth";
import {
  CreateAgreementBody,
  CreateAgreementResponse,
  CreateContactBody,
  CreateContactResponse,
  CreateCountryBody,
  CreateCountryResponse,
  CreateDocumentBody,
  CreateMeetingBody,
  CreateMeetingResponse,
  DeleteDocumentResponse,
  DeleteNewsResponse,
  DocumentInput,
  DocumentUpdate,
  GetCountryParams,
  GetCountryResponse,
  ListActivityQueryParams,
  ListAssignableUsersResponse,
  ListAgreementsQueryParams,
  ListAgreementsResponse,
  ListContactsQueryParams,
  ListContactsResponse,
  ListCountriesQueryParams,
  ListCountriesResponse,
  ListDocumentsQueryParams,
  ListMeetingsQueryParams,
  ListMeetingsResponse,
  NewsInput,
  NewsUpdate,
  UpdateAgreementBody,
  UpdateAgreementParams,
  UpdateAgreementResponse,
  UpdateCountryBody,
  UpdateCountryParams,
  UpdateCountryResponse,
  UpdateMeetingBody,
  UpdateMeetingParams,
  UpdateMeetingResponse,
  CountryUpdate,
  GetDashboardSummaryResponse,
  ListActivityResponse,
  ListDocumentsResponseItem,
  ListNewsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

const countryFields = {
  id: countriesTable.id,
  name: countriesTable.name,
  code: countriesTable.code,
  region: countriesTable.region,
  status: countriesTable.status,
  riskLevel: countriesTable.riskLevel,
  language: countriesTable.language,
  governmentType: countriesTable.governmentType,
  electionYear: countriesTable.electionYear,
  team: countriesTable.team,
  priority: countriesTable.priority,
  strategy: countriesTable.strategy,
  primaryOwnerUserId: countriesTable.primaryOwnerUserId,
  secondaryOwnerUserId: countriesTable.secondaryOwnerUserId,
  reviewerUserId: countriesTable.reviewerUserId,
  regionalCoordinatorUserId: countriesTable.regionalCoordinatorUserId,
};

type AssigneeRow = {
  primaryOwnerUserId: string | null;
  secondaryOwnerUserId: string | null;
  reviewerUserId: string | null;
  regionalCoordinatorUserId: string | null;
};

async function attachAssignees<T extends AssigneeRow>(rows: T[]) {
  const ids = [
    ...new Set(
      rows.flatMap((r) => [
        r.primaryOwnerUserId,
        r.secondaryOwnerUserId,
        r.reviewerUserId,
        r.regionalCoordinatorUserId,
      ].filter((x): x is string => Boolean(x))),
    ),
  ];
  const users = ids.length
    ? await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids))
    : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));
  const pick = (id: string | null) => (id && byId.has(id) ? { userId: id, name: byId.get(id)! } : null);
  return rows.map((r) => ({
    ...r,
    primaryOwner: pick(r.primaryOwnerUserId),
    secondaryOwner: pick(r.secondaryOwnerUserId),
    reviewer: pick(r.reviewerUserId),
    regionalCoordinator: pick(r.regionalCoordinatorUserId),
  }));
}

async function resolveAssignees<T extends AssigneeRow>(row: T) {
  const [resolved] = await attachAssignees([row]);
  return resolved;
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [countries, contacts, activeEngagements, meetingsThisMonth, agreements, pipeline] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(countriesTable),
    db.select({ count: sql<number>`count(*)` }).from(contactsTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(inArray(meetingsTable.status, ["scheduled", "follow_up"])),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(sql`${meetingsTable.date} >= date_trunc('month', current_date) AND ${meetingsTable.date} < date_trunc('month', current_date) + interval '1 month'`),
    db.select({ count: sql<number>`count(*)` }).from(agreementsTable),
    db.select({ stage: meetingsTable.status, count: sql<number>`count(*)` }).from(meetingsTable).groupBy(meetingsTable.status),
  ]);
  const actor = getActor(req);
  await writeAudit({
    actor,
    action: "read",
    entityType: "dashboard_summary",
    kind: "dashboard",
    title: "Dashboard summary read",
    description: `${actor.name} viewed the executive summary.`,
  });
  const data = {
    countries: Number(countries[0]?.count ?? 0),
    contacts: Number(contacts[0]?.count ?? 0),
    activeEngagements: Number(activeEngagements[0]?.count ?? 0),
    meetingsThisMonth: Number(meetingsThisMonth[0]?.count ?? 0),
    agreements: Number(agreements[0]?.count ?? 0),
    pipeline: pipeline.map((item) => ({ stage: item.stage, count: Number(item.count) })),
  };
  res.json(GetDashboardSummaryResponse.parse(data));
});

router.get("/countries", async (req, res): Promise<void> => {
  const parsed = ListCountriesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.search) filters.push(or(ilike(countriesTable.name, `%${parsed.data.search}%`), ilike(countriesTable.code, `%${parsed.data.search}%`)));
  if (parsed.data.region) filters.push(eq(countriesTable.region, parsed.data.region));
  const rows = await db.select(countryFields).from(countriesTable).where(filters.length ? and(...filters) : undefined).orderBy(asc(countriesTable.name));
  const [contactCounts, meetingCounts] = await Promise.all([
    db.select({ countryId: contactsTable.countryId, count: sql<number>`count(*)` }).from(contactsTable).groupBy(contactsTable.countryId),
    db.select({ countryId: meetingsTable.countryId, count: sql<number>`count(*)` }).from(meetingsTable).groupBy(meetingsTable.countryId),
  ]);
  const contactsByCountry = new Map(contactCounts.map((row) => [row.countryId, Number(row.count)]));
  const meetingsByCountry = new Map(meetingCounts.map((row) => [row.countryId, Number(row.count)]));
  const mapped = await attachAssignees(
    rows.map((row) => ({
      ...row,
      contactsCount: contactsByCountry.get(row.id) ?? 0,
      meetingsCount: meetingsByCountry.get(row.id) ?? 0,
    })),
  );
  res.json(ListCountriesResponse.parse(mapped));
});

router.post("/countries", async (req, res): Promise<void> => {
  const parsed = CreateCountryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const insertData = {
    name: parsed.data.name,
    code: parsed.data.code,
    region: parsed.data.region,
    status: parsed.data.status ?? "leads",
  };
  const [row] = await db.insert(countriesTable).values(insertData).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "country",
    entityId: String(row.id),
    kind: "country",
    title: "Country workspace created",
    description: `${row.name} was added to the diplomatic portfolio.`,
    countryId: row.id,
    after: { id: row.id, name: row.name, status: row.status },
  });
  res.status(201).json(CreateCountryResponse.parse({ ...row, contactsCount: 0, meetingsCount: 0 }));
});

router.get("/countries/:id", async (req, res): Promise<void> => {
  const params = GetCountryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid country id." }); return; }
  const [row] = await db.select(countryFields).from(countriesTable).where(eq(countriesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Country not found." }); return; }
  const [contactCounts, meetingCounts] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.countryId, row.id)),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.countryId, row.id)),
  ]);
  const resolved = await resolveAssignees({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) });
  res.json(GetCountryResponse.parse(resolved));
});

router.patch("/countries/:id", async (req, res): Promise<void> => {
  const params = GetCountryParams.safeParse(req.params);
  const parsed = UpdateCountryBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid country update." }); return; }
  const [existing] = await db.select(countryFields).from(countriesTable).where(eq(countriesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Country not found." }); return; }
  const assignmentIds = [
    parsed.data.primaryOwnerUserId,
    parsed.data.secondaryOwnerUserId,
    parsed.data.reviewerUserId,
    parsed.data.regionalCoordinatorUserId,
  ].filter((x): x is string => typeof x === "string");
  if (assignmentIds.length) {
    const found = await db.select({ id: userTable.id }).from(userTable).where(inArray(userTable.id, assignmentIds));
    if (found.length !== assignmentIds.length) {
      res.status(400).json({ error: "Unknown user id in country assignment." });
      return;
    }
  }
  const [row] = await db.update(countriesTable).set(parsed.data).where(eq(countriesTable.id, params.data.id)).returning();
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["name", "region", "status", "riskLevel", "language", "governmentType", "electionYear", "team", "priority", "strategy", "primaryOwnerUserId", "secondaryOwnerUserId", "reviewerUserId", "regionalCoordinatorUserId"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "country",
    entityId: String(row.id),
    kind: "country",
    title: "Country workspace updated",
    description: `${row.name} was updated in the portfolio.`,
    countryId: row.id,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  const [contactCounts, meetingCounts] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.countryId, row.id)),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.countryId, row.id)),
  ]);
  const resolved = await resolveAssignees({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) });
  res.json(UpdateCountryResponse.parse(resolved));
});

// Write-role gated inside the handler: the requireWriteRole mount middleware
// bypasses GET, so this route checks the role itself.
router.get("/users/assignable", async (req, res): Promise<void> => {
  const actor = getActor(req);
  if (actor.role === null || !WRITE_ROLES.has(actor.role)) {
    res.status(403).json({ error: "forbidden", message: "Viewers have read-only access to the workspace." });
    return;
  }
  const rows = await db
    .select({ userId: userTable.id, name: userTable.name, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.banned, false))
    .orderBy(asc(userTable.name));
  res.json(ListAssignableUsersResponse.parse(rows));
});

router.get("/contacts", async (req, res): Promise<void> => {
  const parsed = ListContactsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(contactsTable.countryId, parsed.data.countryId));
  if (parsed.data.status) filters.push(eq(contactsTable.verificationStatus, parsed.data.status));
  if (parsed.data.search) filters.push(or(ilike(contactsTable.name, `%${parsed.data.search}%`), ilike(contactsTable.institution, `%${parsed.data.search}%`)));
  const rows = await db.select({
    id: contactsTable.id, name: contactsTable.name, title: contactsTable.title, institution: contactsTable.institution,
    countryId: contactsTable.countryId, countryName: countriesTable.name, email: contactsTable.email, phone: contactsTable.phone,
    verificationStatus: contactsTable.verificationStatus, lastVerified: contactsTable.lastVerified, relationship: contactsTable.relationship,
  }).from(contactsTable).innerJoin(countriesTable, eq(contactsTable.countryId, countriesTable.id))
    .where(filters.length ? and(...filters) : undefined).orderBy(asc(contactsTable.name));
  const actor = getActor(req);
  await writeAudit({
    actor,
    action: "read",
    entityType: "contact",
    kind: "contact",
    title: "Contact directory read",
    description: `${actor.name} read the contact directory (including verification state).`,
  });
  res.json(ListContactsResponse.parse(rows));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(contactsTable).values({ ...parsed.data, lastVerified: new Date().toISOString().slice(0, 10) }).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "contact",
    entityId: String(row.id),
    kind: "contact",
    title: "Contact added",
    description: `${row.name} was added to the counterpart directory.`,
    countryId: row.countryId,
    after: { id: row.id, name: row.name, verificationStatus: row.verificationStatus },
  });
  res.status(201).json(CreateContactResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.get("/meetings", async (req, res): Promise<void> => {
  const parsed = ListMeetingsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(meetingsTable.countryId, parsed.data.countryId));
  if (parsed.data.status) filters.push(eq(meetingsTable.status, parsed.data.status));
  const rows = await db.select({
    id: meetingsTable.id, title: meetingsTable.title, countryName: countriesTable.name, date: meetingsTable.date,
    status: meetingsTable.status, participants: meetingsTable.participants, actionArea: meetingsTable.actionArea, owner: meetingsTable.owner,
  }).from(meetingsTable).innerJoin(countriesTable, eq(meetingsTable.countryId, countriesTable.id))
    .where(filters.length ? and(...filters) : undefined).orderBy(asc(meetingsTable.date));
  res.json(ListMeetingsResponse.parse(rows));
});

router.post("/meetings", async (req, res): Promise<void> => {
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(meetingsTable).values({
    ...parsed.data, date: new Date(parsed.data.date), status: "scheduled", participants: 1,
  }).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "meeting",
    entityId: String(row.id),
    kind: "meeting",
    title: "Meeting scheduled",
    description: `${row.title} was added to the engagement calendar.`,
    countryId: row.countryId,
    after: { id: row.id, title: row.title, status: row.status },
  });
  res.status(201).json(CreateMeetingResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.patch("/meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateMeetingParams.safeParse(req.params);
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid meeting update." }); return; }
  const values = {
    ...parsed.data,
    date: parsed.data.date ? new Date(parsed.data.date) : undefined,
  };
  const [existing] = await db.select({
    id: meetingsTable.id, title: meetingsTable.title, status: meetingsTable.status, date: meetingsTable.date,
    actionArea: meetingsTable.actionArea, owner: meetingsTable.owner,
  }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Meeting not found." }); return; }
  const [row] = await db.update(meetingsTable).set(values).where(eq(meetingsTable.id, params.data.id)).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  const diff = diffFields(existing as unknown as Record<string, unknown>, { ...row, date: row.date }, ["title", "status", "date", "actionArea", "owner"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "meeting",
    entityId: String(row.id),
    kind: "meeting",
    title: "Meeting updated",
    description: `${row.title} was updated in the engagement calendar.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateMeetingResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.get("/agreements", async (req, res): Promise<void> => {
  const parsed = ListAgreementsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.status) filters.push(eq(agreementsTable.status, parsed.data.status));
  if (parsed.data.search) filters.push(or(ilike(agreementsTable.name, `%${parsed.data.search}%`), ilike(agreementsTable.type, `%${parsed.data.search}%`)));
  if (parsed.data.countryId) filters.push(eq(agreementsTable.countryId, parsed.data.countryId));
  const rows = await db.select({
    id: agreementsTable.id, name: agreementsTable.name, type: agreementsTable.type, countryName: countriesTable.name,
    status: agreementsTable.status, updatedAt: agreementsTable.updatedAt, renewalDate: agreementsTable.renewalDate,
    lifecycleState: agreementsTable.lifecycleState,
  }).from(agreementsTable).innerJoin(countriesTable, eq(agreementsTable.countryId, countriesTable.id))
    .where(filters.length ? and(...filters) : undefined).orderBy(desc(agreementsTable.updatedAt));
  res.json(ListAgreementsResponse.parse(rows));
});

router.post("/agreements", async (req, res): Promise<void> => {
  const parsed = CreateAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(agreementsTable).values({
    ...parsed.data,
    status: parsed.data.status ?? "draft",
    renewalDate: parsed.data.renewalDate?.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
  }).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "agreement",
    entityId: String(row.id),
    kind: "agreement",
    title: "Agreement recorded",
    description: `${row.name} was added to the agreement register.`,
    countryId: row.countryId,
    after: { id: row.id, name: row.name, status: row.status },
  });
  res.status(201).json(CreateAgreementResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.patch("/agreements/:id", async (req, res): Promise<void> => {
  const params = UpdateAgreementParams.safeParse(req.params);
  const parsed = UpdateAgreementBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid agreement update." }); return; }
  const [existing] = await db.select({
    id: agreementsTable.id, name: agreementsTable.name, type: agreementsTable.type,
    status: agreementsTable.status, renewalDate: agreementsTable.renewalDate,
    lifecycleState: agreementsTable.lifecycleState, reviewedAt: agreementsTable.reviewedAt,
    reviewedBy: agreementsTable.reviewedBy, approvedAt: agreementsTable.approvedAt,
    approvedBy: agreementsTable.approvedBy, signedAt: agreementsTable.signedAt,
    signedBy: agreementsTable.signedBy,
  }).from(agreementsTable).where(eq(agreementsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Agreement not found." }); return; }
  const updateData = {
    ...parsed.data,
    renewalDate: parsed.data.renewalDate === null ? null : parsed.data.renewalDate?.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  const [row] = await db.update(agreementsTable).set(updateData).where(eq(agreementsTable.id, params.data.id)).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["name", "type", "status", "renewalDate", "lifecycleState", "reviewedAt", "reviewedBy", "approvedAt", "approvedBy", "signedAt", "signedBy"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "agreement",
    entityId: String(row.id),
    kind: "agreement",
    title: "Agreement updated",
    description: `${row.name} was updated in the agreement register.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateAgreementResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.get("/activity", async (req, res): Promise<void> => {
  const parsed = ListActivityQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(activityTable.countryId, parsed.data.countryId));
  const rows = await db.select({
    id: activityTable.id, kind: activityTable.kind, title: activityTable.title, description: activityTable.description,
    occurredAt: activityTable.occurredAt, countryName: countriesTable.name,
    actorId: activityTable.actorId, actorName: activityTable.actorName,
  }).from(activityTable).leftJoin(countriesTable, eq(activityTable.countryId, countriesTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(activityTable.occurredAt)).limit(12);
  res.json(ListActivityResponse.parse(rows));
});

export default router;