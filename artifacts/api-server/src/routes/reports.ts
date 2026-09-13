import { Router, type IRouter } from "express";
import type { Request } from "express";
import { db, type Db } from "@workspace/db";
import { countriesTable, contactsTable, organizationsTable, agreementsTable, meetingsTable, tasksTable, actionItemsTable, positionsTable, officeTermsTable, ministriesTable } from "@workspace/db";
import { eq, and, or, gte, lte, desc, asc, count, sql, inArray, isNotNull } from "drizzle-orm";

type QueryParams = Record<string, string | undefined>;

const router: IRouter = Router();

// Helper: get date range from query params
function getDateRange(req: Request): { from: Date; to: Date } {
  const query = req.query as QueryParams;
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  return { from, to };
}

// GET /api/reports/country-performance
router.get("/country-performance", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);
  const countryId = req.query.countryId ? Number(req.query.countryId) : undefined;

  const countriesQuery = db
    .select({
      id: countriesTable.id,
      name: countriesTable.name,
      code: countriesTable.code,
      region: countriesTable.region,
      status: countriesTable.status,
      riskLevel: countriesTable.riskLevel,
      contactsCount: sql<number>`(
        select count(*) from contacts c where c.country_id = countries.id
      )`.mapWith(Number),
      meetingsCount: sql<number>`(
        select count(*) from meetings m where m.country_id = countries.id and m.date >= ${from.toISOString()} and m.date <= ${to.toISOString()}
      )`.mapWith(Number),
      agreementsCount: sql<number>`(
        select count(*) from agreements a where a.country_id = countries.id
      )`.mapWith(Number),
    })
    .from(countriesTable);

  if (countryId) {
    countriesQuery.where(eq(countriesTable.id, countryId));
  }

  const countries = await countriesQuery;

  // Get meeting details for each country
  const countryIds = countries.map((c) => c.id);
  const meetings = await db
    .select({
      countryId: meetingsTable.countryId,
      status: meetingsTable.status,
      actionArea: meetingsTable.actionArea,
    })
    .from(meetingsTable)
    .where(and(inArray(meetingsTable.countryId, countryIds), gte(meetingsTable.date, from), lte(meetingsTable.date, to)));

  const tasks = await db
    .select({
      countryId: tasksTable.countryId,
      status: tasksTable.status,
      actionArea: tasksTable.actionArea,
      cadence: tasksTable.cadence,
    })
    .from(tasksTable)
    .where(and(inArray(tasksTable.countryId, countryIds)));

  const actionItems = await db
    .select({
      countryId: meetingsTable.countryId,
      status: actionItemsTable.status,
    })
    .from(actionItemsTable)
    .innerJoin(meetingsTable, eq(actionItemsTable.meetingId, meetingsTable.id))
    .where(and(inArray(meetingsTable.countryId, countryIds)));

  res.json({ countries, meetings, tasks, actionItems });
});

// GET /api/reports/dr-funnel
router.get("/dr-funnel", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);

  // Pipeline: Leads -> Scheduled -> Active -> Agreement -> Inactive
  const pipeline = await db
    .select({
      status: countriesTable.status,
      count: count(),
    })
    .from(countriesTable)
    .groupBy(countriesTable.status);

  // Meetings by action area and status
  const meetingsByArea = await db
    .select({
      actionArea: meetingsTable.actionArea,
      status: meetingsTable.status,
      count: count(),
    })
    .from(meetingsTable)
    .where(and(gte(meetingsTable.date, from), lte(meetingsTable.date, to)))
    .groupBy(meetingsTable.actionArea, meetingsTable.status);

  // Agreements by lifecycle
  const agreements = await db
    .select({
      lifecycleState: agreementsTable.lifecycleState,
      count: count(),
    })
    .from(agreementsTable)
    .groupBy(agreementsTable.lifecycleState);

  // Tasks by cadence
  const tasksByCadence = await db
    .select({
      cadence: tasksTable.cadence,
      status: tasksTable.status,
      count: count(),
    })
    .from(tasksTable)
    .groupBy(tasksTable.cadence, tasksTable.status);

  res.json({ pipeline, meetingsByArea, agreements, tasksByCadence });
});

// GET /api/reports/meetings-analytics
router.get("/meetings-analytics", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);

  const meetings = await db
    .select({
      id: meetingsTable.id,
      title: meetingsTable.title,
      date: meetingsTable.date,
      status: meetingsTable.status,
      actionArea: meetingsTable.actionArea,
      countryId: meetingsTable.countryId,
      countryName: countriesTable.name,
      countryCode: countriesTable.code,
    })
    .from(meetingsTable)
    .innerJoin(countriesTable, eq(meetingsTable.countryId, countriesTable.id))
    .where(and(gte(meetingsTable.date, from), lte(meetingsTable.date, to)))
    .orderBy(desc(meetingsTable.date));

  // Monthly breakdown
  const monthly = await db
    .select({
      month: sql<string>`to_char(${meetingsTable.date}, 'YYYY-MM')`.mapWith(String),
      count: count(),
    })
    .from(meetingsTable)
    .where(and(gte(meetingsTable.date, from), lte(meetingsTable.date, to)))
    .groupBy(sql`to_char(${meetingsTable.date}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${meetingsTable.date}, 'YYYY-MM')`);

  // By action area
  const byActionArea = await db
    .select({
      actionArea: meetingsTable.actionArea,
      count: count(),
    })
    .from(meetingsTable)
    .where(and(gte(meetingsTable.date, from), lte(meetingsTable.date, to)))
    .groupBy(meetingsTable.actionArea);

  res.json({ meetings, monthly, byActionArea });
});

// GET /api/reports/lead-conversion
router.get("/lead-conversion", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);

  // Countries by status transition
  const statusTransitions = await db
    .select({
      fromStatus: countriesTable.status,
      count: count(),
    })
    .from(countriesTable)
    .groupBy(countriesTable.status);

  // Meetings leading to agreements
  const meetingToAgreement = await db
    .select({
      meetingId: meetingsTable.id,
      meetingTitle: meetingsTable.title,
      meetingDate: meetingsTable.date,
      agreementCount: count(agreementsTable.id),
    })
    .from(meetingsTable)
    .leftJoin(agreementsTable, and(eq(agreementsTable.countryId, meetingsTable.countryId)))
    .where(and(gte(meetingsTable.date, from), lte(meetingsTable.date, to)))
    .groupBy(meetingsTable.id, meetingsTable.title, meetingsTable.date);

  // Tasks completed vs created
  const tasksCreated = await db
    .select({
      month: sql<string>`to_char(${tasksTable.createdAt}, 'YYYY-MM')`.mapWith(String),
      count: count(),
    })
    .from(tasksTable)
    .groupBy(sql`to_char(${tasksTable.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${tasksTable.createdAt}, 'YYYY-MM')`);

  const tasksCompleted = await db
    .select({
      month: sql<string>`to_char(${tasksTable.updatedAt}, 'YYYY-MM')`.mapWith(String),
      count: count(),
    })
    .from(tasksTable)
    .where(eq(tasksTable.status, "done"))
    .groupBy(sql`to_char(${tasksTable.updatedAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${tasksTable.updatedAt}, 'YYYY-MM')`);

  res.json({ statusTransitions, meetingToAgreement, tasksCreated, tasksCompleted });
});

// GET /api/reports/contact-coverage
router.get("/contact-coverage", async (req, res): Promise<void> => {
  const countryId = req.query.countryId ? Number(req.query.countryId) : undefined;

  const contactsQuery = db
    .select({
      id: contactsTable.id,
      name: contactsTable.name,
      title: contactsTable.title,
      institution: contactsTable.institution,
      email: contactsTable.email,
      phone: contactsTable.phone,
      verificationStatus: contactsTable.verificationStatus,
      relationship: contactsTable.relationship,
      countryId: contactsTable.countryId,
      countryName: countriesTable.name,
      countryCode: countriesTable.code,
      lastVerified: contactsTable.lastVerified,
    })
    .from(contactsTable)
    .innerJoin(countriesTable, eq(contactsTable.countryId, countriesTable.id));

  if (countryId) {
    contactsQuery.where(eq(contactsTable.countryId, countryId));
  }

  const contacts = await contactsQuery;

  // By country
  const byCountry = await db
    .select({
      countryId: contactsTable.countryId,
      countryName: countriesTable.name,
      countryCode: countriesTable.code,
      count: count(),
    })
    .from(contactsTable)
    .innerJoin(countriesTable, eq(contactsTable.countryId, countriesTable.id))
    .groupBy(contactsTable.countryId, countriesTable.name, countriesTable.code)
    .orderBy(desc(count()));

  // By verification status
  const byVerification = await db
    .select({
      verificationStatus: contactsTable.verificationStatus,
      count: count(),
    })
    .from(contactsTable)
    .groupBy(contactsTable.verificationStatus);

  // By relationship
  const byRelationship = await db
    .select({
      relationship: contactsTable.relationship,
      count: count(),
    })
    .from(contactsTable)
    .groupBy(contactsTable.relationship);

  // With phone
  const withPhone = await db
    .select({ count: count() })
    .from(contactsTable)
    .where(and(sql`${contactsTable.phone} IS NOT NULL`, sql`${contactsTable.phone} <> ''`));

  // With email
  const withEmail = await db
    .select({ count: count() })
    .from(contactsTable)
    .where(and(sql`${contactsTable.email} IS NOT NULL`, sql`${contactsTable.email} <> ''`));

  res.json({ contacts, byCountry, byVerification, byRelationship, withPhone: withPhone[0]?.count ?? 0, withEmail: withEmail[0]?.count ?? 0 });
});

// GET /api/reports/position-changes
router.get("/position-changes", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);
  const countryId = req.query.countryId ? Number(req.query.countryId) : undefined;

  const positionsQuery = db
    .select({
      id: positionsTable.id,
      title: positionsTable.title,
      type: ministriesTable.type,
      countryId: countriesTable.id,
      countryName: countriesTable.name,
      countryCode: countriesTable.code,
    })
    .from(positionsTable)
    .innerJoin(ministriesTable, eq(positionsTable.ministryId, ministriesTable.id))
    .innerJoin(countriesTable, eq(ministriesTable.countryId, countriesTable.id));

  if (countryId) {
    positionsQuery.where(eq(countriesTable.id, countryId));
  }

  const positions = await positionsQuery;

  // Office terms in range
  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];

  const terms = await db
    .select({
      id: officeTermsTable.id,
      personName: officeTermsTable.personName,
      startDate: officeTermsTable.startDate,
      endDate: officeTermsTable.endDate,
      isCurrent: officeTermsTable.isCurrent,
      positionId: officeTermsTable.positionId,
      positionTitle: positionsTable.title,
      countryId: countriesTable.id,
      countryName: countriesTable.name,
    })
    .from(officeTermsTable)
    .innerJoin(positionsTable, eq(officeTermsTable.positionId, positionsTable.id))
    .innerJoin(ministriesTable, eq(positionsTable.ministryId, ministriesTable.id))
    .innerJoin(countriesTable, eq(ministriesTable.countryId, countriesTable.id))
    .where(and(gte(officeTermsTable.startDate, fromStr), lte(officeTermsTable.startDate, toStr)));

  // By type (using ministries table for position types)
  const byType = await db
    .select({
      type: ministriesTable.type,
      count: count(),
    })
    .from(positionsTable)
    .innerJoin(ministriesTable, eq(positionsTable.ministryId, ministriesTable.id))
    .groupBy(ministriesTable.type);

  // Current holders
  const currentHolders = await db
    .select({ count: count() })
    .from(officeTermsTable)
    .where(eq(officeTermsTable.isCurrent, 1));

  res.json({ positions, terms, byType, currentHolders: currentHolders[0]?.count ?? 0 });
});

// GET /api/reports/engagement-health
router.get("/engagement-health", async (req, res): Promise<void> => {
  const { from, to } = getDateRange(req);

  // Scorecard health from scorecard lib
  const scorecardRows = await db
    .select({
      countryId: countriesTable.id,
      countryName: countriesTable.name,
      countryCode: countriesTable.code,
      status: countriesTable.status,
      riskLevel: countriesTable.riskLevel,
    })
    .from(countriesTable);

  const countryIds = scorecardRows.map((r) => r.countryId);

  const meetings = await db
    .select({ countryId: meetingsTable.countryId, status: meetingsTable.status, date: meetingsTable.date })
    .from(meetingsTable)
    .where(and(inArray(meetingsTable.countryId, countryIds), gte(meetingsTable.date, from), lte(meetingsTable.date, to)));

  const tasks = await db
    .select({ countryId: tasksTable.countryId, status: tasksTable.status, dueDate: tasksTable.dueDate })
    .from(tasksTable)
    .where(inArray(tasksTable.countryId, countryIds));

  const actionItems = await db
    .select({ countryId: meetingsTable.countryId, status: actionItemsTable.status })
    .from(actionItemsTable)
    .innerJoin(meetingsTable, eq(actionItemsTable.meetingId, meetingsTable.id))
    .where(inArray(meetingsTable.countryId, countryIds));

  // Compute health per country
  const today = new Date().toISOString().split("T")[0];
  const DAY_MS = 86_400_000;
  const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);
  const daysBetween = (later: string, earlier: string) => Math.round((Date.parse(later) - Date.parse(earlier)) / DAY_MS);

  const health = scorecardRows.map((country) => {
    const cMeetings = meetings.filter((m) => m.countryId === country.countryId);
    const cTasks = tasks.filter((t) => t.countryId === country.countryId);
    const cActionItems = actionItems.filter((a) => a.countryId === country.countryId);

    const pool = [...cMeetings, ...cTasks, ...cActionItems].filter((r) => r.status !== "cancelled" && r.status !== "paused");
    const completed = pool.filter((r) => r.status === "completed" || r.status === "done");
    const completionPct = pool.length ? Math.round((completed.length / pool.length) * 100) : null;

    const slaScoped = completed.filter((r) => "due" in r && (r as { due?: string | null }).due != null);
    const onTimeCount = slaScoped.filter((r) => {
      const due = (r as { due?: string | null }).due;
      const evidence = "evidence" in r ? (r as { evidence?: string | null }).evidence : dayOnly((r as { completedAt?: Date | string | null }).completedAt);
      return due != null && evidence != null && evidence <= due;
    }).length;
    const slaRate = slaScoped.length ? Math.round((onTimeCount / slaScoped.length) * 100) : null;

    const failures = pool.filter((r) => {
      const due = "due" in r ? (r as { due?: string | null }).due : null;
      const evidence = "evidence" in r ? (r as { evidence?: string | null }).evidence : dayOnly((r as { completedAt?: Date | string | null }).completedAt);
      if (r.status !== "completed" && due && due < today) return true;
      if (r.status === "completed" && due && (evidence == null || evidence > due)) return true;
      return false;
    });
    const failureCount = failures.length;
    const failureRate = pool.length ? Math.round((failureCount / pool.length) * 100) : null;

    const score = completionPct == null || slaRate == null || failureRate == null
      ? null
      : Math.round(0.4 * completionPct + 0.4 * slaRate + 0.2 * (100 - failureRate));

    return {
      countryId: country.countryId,
      countryName: country.countryName,
      countryCode: country.countryCode,
      score,
      completionPct,
      slaRate,
      failureRate,
      riskLevel: country.riskLevel,
      status: country.status,
      poolCount: pool.length,
      completedCount: completed.length,
    };
  });

  // Sort by score descending
  health.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  res.json({ health });
});

// GET /api/reports/heat-map
router.get("/heat-map", async (req, res): Promise<void> => {
  // Activity heat map by region and action area
  const activity = await db
    .select({
      region: countriesTable.region,
      actionArea: meetingsTable.actionArea,
      count: count(),
    })
    .from(meetingsTable)
    .innerJoin(countriesTable, eq(meetingsTable.countryId, countriesTable.id))
    .groupBy(countriesTable.region, meetingsTable.actionArea);

  // Agreement density by region
  const agreements = await db
    .select({
      region: countriesTable.region,
      lifecycleState: agreementsTable.lifecycleState,
      count: count(),
    })
    .from(agreementsTable)
    .innerJoin(countriesTable, eq(agreementsTable.countryId, countriesTable.id))
    .groupBy(countriesTable.region, agreementsTable.lifecycleState);

  // Contact density by region
  const contacts = await db
    .select({
      region: countriesTable.region,
      count: count(),
    })
    .from(contactsTable)
    .innerJoin(countriesTable, eq(contactsTable.countryId, countriesTable.id))
    .groupBy(countriesTable.region);

  res.json({ activity, agreements, contacts });
});

export default router;