import { Router, type IRouter } from "express";
import { db, type Db } from "@workspace/db";
import { countriesTable, contactsTable, organizationsTable, agreementsTable, meetingsTable } from "@workspace/db";
import { like, or, eq, and, ilike } from "drizzle-orm";

const router: IRouter = Router();

type SearchType = "all" | "countries" | "contacts" | "organizations" | "agreements" | "meetings";

interface SearchResultItem {
  type: SearchType;
  id: number;
  title: string;
  subtitle: string;
  url: string;
}

async function searchCountries(db: Db, q: string, limit: number): Promise<SearchResultItem[]> {
  const rows = await db
    .select({ id: countriesTable.id, name: countriesTable.name, code: countriesTable.code, region: countriesTable.region })
    .from(countriesTable)
    .where(or(ilike(countriesTable.name, `%${q}%`), ilike(countriesTable.code, `%${q}%`), ilike(countriesTable.region, `%${q}%`)))
    .limit(limit);
  return rows.map((r) => ({
    type: "countries",
    id: r.id,
    title: r.name,
    subtitle: `${r.code} · ${r.region}`,
    url: `/country/${r.id}`,
  }));
}

async function searchContacts(db: Db, q: string, limit: number): Promise<SearchResultItem[]> {
  const rows = await db
    .select({ id: contactsTable.id, name: contactsTable.name, title: contactsTable.title, institution: contactsTable.institution, countryId: contactsTable.countryId })
    .from(contactsTable)
    .where(or(ilike(contactsTable.name, `%${q}%`), ilike(contactsTable.institution, `%${q}%`), ilike(contactsTable.title, `%${q}%`)))
    .limit(limit);
  return rows.map((r) => ({
    type: "contacts",
    id: r.id,
    title: r.name,
    subtitle: `${r.title} · ${r.institution}`,
    url: `/contacts`,
  }));
}

async function searchOrganizations(db: Db, q: string, limit: number, orgType?: string): Promise<SearchResultItem[]> {
  const conditions = [ilike(organizationsTable.name, `%${q}%`)];
  if (orgType) {
    conditions.push(eq(organizationsTable.type, orgType as typeof organizationsTable.$inferSelect.type));
  }
  const rows = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, type: organizationsTable.type, countryId: organizationsTable.countryId })
    .from(organizationsTable)
    .where(or(...conditions))
    .limit(limit);
  return rows.map((r) => ({
    type: "organizations",
    id: r.id,
    title: r.name,
    subtitle: r.type,
    url: `/organizations`,
  }));
}

async function searchAgreements(db: Db, q: string, limit: number): Promise<SearchResultItem[]> {
  const rows = await db
    .select({ id: agreementsTable.id, name: agreementsTable.name, type: agreementsTable.type, countryId: agreementsTable.countryId })
    .from(agreementsTable)
    .where(or(ilike(agreementsTable.name, `%${q}%`), ilike(agreementsTable.type, `%${q}%`)))
    .limit(limit);
  return rows.map((r) => ({
    type: "agreements",
    id: r.id,
    title: r.name,
    subtitle: r.type,
    url: `/agreements`,
  }));
}

async function searchMeetings(db: Db, q: string, limit: number): Promise<SearchResultItem[]> {
  const rows = await db
    .select({ id: meetingsTable.id, title: meetingsTable.title, actionArea: meetingsTable.actionArea, countryId: meetingsTable.countryId })
    .from(meetingsTable)
    .where(or(ilike(meetingsTable.title, `%${q}%`), ilike(meetingsTable.actionArea, `%${q}%`)))
    .limit(limit);
  return rows.map((r) => ({
    type: "meetings",
    id: r.id,
    title: r.title,
    subtitle: r.actionArea,
    url: `/meeting/${r.id}`,
  }));
}

const VALID_TYPES: SearchType[] = ["all", "countries", "contacts", "organizations", "agreements", "meetings"];

router.get("/", async (req, res): Promise<void> => {
  const rawQ = (req.query.q as string) ?? "";
  const q = rawQ.trim();
  if (!q) {
    res.json({ results: [], total: 0 });
    return;
  }
  const rawType = (req.query.type as string) ?? "all";
  const type = VALID_TYPES.includes(rawType as SearchType) ? (rawType as SearchType) : "all";
  const limit = Math.min(Number((req.query.limit as string) ?? 10), 50);

  const results: SearchResultItem[] = [];

  const searchFns: Array<(db: Db, q: string, limit: number) => Promise<SearchResultItem[]>> = [];
  if (type === "all" || type === "countries") searchFns.push(searchCountries);
  if (type === "all" || type === "contacts") searchFns.push(searchContacts);
  if (type === "all" || type === "organizations") searchFns.push((db, q, l) => searchOrganizations(db, q, l));
  if (type === "all" || type === "agreements") searchFns.push(searchAgreements);
  if (type === "all" || type === "meetings") searchFns.push(searchMeetings);

  const promises = searchFns.map((fn) => fn(db, q, type === "all" ? Math.ceil(limit / searchFns.length) : limit));
  const partials = await Promise.all(promises);

  for (const partial of partials) {
    results.push(...partial);
  }

  results.sort((a, b) => a.title.localeCompare(b.title));

  res.json({ results: results.slice(0, limit), total: results.length });
});

export default router;