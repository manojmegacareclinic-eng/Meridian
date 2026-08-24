import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, activityTable, agreementsTable, contactsTable, countriesTable, meetingsTable } from "@workspace/db";
import {
  CreateAgreementBody,
  CreateContactBody,
  CreateCountryBody,
  CreateMeetingBody,
  CreateAgreementResponse,
  CreateContactResponse,
  CreateCountryResponse,
  CreateMeetingResponse,
  GetDashboardSummaryResponse,
  ListActivityResponse,
  ListAgreementsQueryParams,
  ListAgreementsResponse,
  ListContactsQueryParams,
  ListContactsResponse,
  ListCountriesQueryParams,
  ListCountriesResponse,
  ListMeetingsQueryParams,
  ListMeetingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const countryFields = {
  id: countriesTable.id,
  name: countriesTable.name,
  code: countriesTable.code,
  region: countriesTable.region,
  status: countriesTable.status,
  riskLevel: countriesTable.riskLevel,
};

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [countries, contacts, activeEngagements, meetingsThisMonth, agreements, pipeline] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(countriesTable),
    db.select({ count: sql<number>`count(*)` }).from(contactsTable),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(inArray(meetingsTable.status, ["scheduled", "follow_up"])),
    db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(sql`${meetingsTable.date} >= date_trunc('month', current_date) AND ${meetingsTable.date} < date_trunc('month', current_date) + interval '1 month'`),
    db.select({ count: sql<number>`count(*)` }).from(agreementsTable),
    db.select({ stage: meetingsTable.status, count: sql<number>`count(*)` }).from(meetingsTable).groupBy(meetingsTable.status),
  ]);
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
  res.json(ListCountriesResponse.parse(rows.map((row) => ({
    ...row,
    contactsCount: contactsByCountry.get(row.id) ?? 0,
    meetingsCount: meetingsByCountry.get(row.id) ?? 0,
  }))));
});

router.post("/countries", async (req, res): Promise<void> => {
  const parsed = CreateCountryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(countriesTable).values({ ...parsed.data, status: parsed.data.status ?? "leads" }).returning();
  await db.insert(activityTable).values({ kind: "country", title: "Country workspace created", description: `${row.name} was added to the diplomatic portfolio.`, countryId: row.id });
  res.status(201).json(CreateCountryResponse.parse({ ...row, contactsCount: 0, meetingsCount: 0 }));
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
  res.json(ListContactsResponse.parse(rows));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(contactsTable).values({ ...parsed.data, lastVerified: new Date().toISOString().slice(0, 10) }).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  await db.insert(activityTable).values({ kind: "contact", title: "Contact added", description: `${row.name} was added to the counterpart directory.`, countryId: row.countryId });
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
  await db.insert(activityTable).values({ kind: "meeting", title: "Meeting scheduled", description: `${row.title} was added to the engagement calendar.`, countryId: row.countryId });
  res.status(201).json(CreateMeetingResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.get("/agreements", async (req, res): Promise<void> => {
  const parsed = ListAgreementsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const filters = [];
  if (parsed.data.status) filters.push(eq(agreementsTable.status, parsed.data.status));
  if (parsed.data.search) filters.push(or(ilike(agreementsTable.name, `%${parsed.data.search}%`), ilike(agreementsTable.type, `%${parsed.data.search}%`)));
  const rows = await db.select({
    id: agreementsTable.id, name: agreementsTable.name, type: agreementsTable.type, countryName: countriesTable.name,
    status: agreementsTable.status, updatedAt: agreementsTable.updatedAt, renewalDate: agreementsTable.renewalDate,
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
  await db.insert(activityTable).values({ kind: "agreement", title: "Agreement recorded", description: `${row.name} was added to the agreement register.`, countryId: row.countryId });
  res.status(201).json(CreateAgreementResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.get("/activity", async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: activityTable.id, kind: activityTable.kind, title: activityTable.title, description: activityTable.description,
    occurredAt: activityTable.occurredAt, countryName: countriesTable.name,
  }).from(activityTable).leftJoin(countriesTable, eq(activityTable.countryId, countriesTable.id))
    .orderBy(desc(activityTable.occurredAt)).limit(12);
  res.json(ListActivityResponse.parse(rows));
});

export default router;