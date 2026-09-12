import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  countriesTable,
  notificationsTable,
  intelligenceSourcesTable,
  intelligenceFindingsTable,
} from "@workspace/db";

const nowMinus = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const findYear = () => new Date().getUTCFullYear() + 1;

function findingFingerprint(sourceId: number, url: string | null, headline: string): string {
  return url ? `${sourceId}:${url}` : `${sourceId}:${headline.trim().toLowerCase()}`;
}

type FindingSpec = {
  topic: string;
  headline: string;
  url: string | null;
  summary: string | null;
  confidence: number;
  targetType: "country" | "organization" | "contact" | null;
  targetId: number | null;
  field: string | null;
  value: string | null;
  stage: "open" | "approved" | "rejected";
  reviewNote: string | null;
};

async function ensureSource(name: string, kind: string, tier: number, baseUrl: string) {
  const existing = await db.select().from(intelligenceSourcesTable).where(eq(intelligenceSourcesTable.baseUrl, baseUrl));
  if (existing[0]) {
    if (existing[0].name !== name || existing[0].tier !== tier) {
      await db.update(intelligenceSourcesTable).set({ name, tier }).where(eq(intelligenceSourcesTable.id, existing[0].id));
    }
    return existing[0];
  }
  const [created] = await db
    .insert(intelligenceSourcesTable)
    .values({ name, kind, tier, baseUrl })
    .returning();
  if (!created) throw new Error(`failed to create intelligence source ${name}`);
  return created;
}

async function ensureFinding(sourceId: number, spec: FindingSpec, fprint: string) {
  const existing = await db.select().from(intelligenceFindingsTable).where(eq(intelligenceFindingsTable.fingerprint, fprint));
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(intelligenceFindingsTable)
    .values({
      sourceId,
      topic: spec.topic,
      headline: spec.headline,
      url: spec.url,
      summary: spec.summary,
      confidence: spec.confidence,
      targetType: spec.targetType,
      targetId: spec.targetId,
      field: spec.field,
      value: spec.value,
      stage: spec.stage,
      reviewNote: spec.reviewNote,
      fingerprint: fprint,
    })
    .returning();
  if (!created) throw new Error(`failed to create finding ${spec.headline}`);
  return created;
}

async function main() {
  const [scor] = await db
    .select()
    .from(countriesTable)
    .where(eq(countriesTable.code, "SCOR"));
  if (!scor) throw new Error("SCOR country missing — run seed-scorecard first");

  const gov = await ensureSource("SCOR Government Portal", "government_site", 1, "https://portal.example-gov.org/qa");
  const gazette = await ensureSource("SCOR Government Gazette", "government_gazette", 4, "https://gazette.example-gov.org/qa");
  const linkedin = await ensureSource("SCOR MFA LinkedIn", "linkedin", 5, "https://linkedin.com/company/sco-mfa");

  const findings: { sourceId: number; spec: FindingSpec; fprint: string }[] = [
    {
      sourceId: gov.id,
      fprint: findingFingerprint(gov.id, "https://portal.example-gov.org/qa/reshuffle", "Cabinet reshuffle confirms new government type"),
      spec: {
        topic: "government_change",
        headline: "Cabinet reshuffle confirms new government type",
        url: "https://portal.example-gov.org/qa/reshuffle",
        summary: "Populated cabinet sworn in; gazette to follow.",
        confidence: 80,
        targetType: "country",
        targetId: scor.id,
        field: "governmentType",
        value: "parliamentary",
        stage: "open",
        reviewNote: null,
      },
    },
    {
      sourceId: gazette.id,
      fprint: findingFingerprint(gazette.id, "https://gazette.example-gov.org/qa/election-announcement", "Election announcement for next year"),
      spec: {
        topic: "election",
        headline: "Election announcement for next year",
        url: "https://gazette.example-gov.org/qa/election-announcement",
        summary: "General election proclaimed for next calendar year.",
        confidence: 62,
        targetType: "country",
        targetId: scor.id,
        field: "electionYear",
        value: String(findYear()),
        stage: "open",
        reviewNote: null,
      },
    },
    {
      sourceId: linkedin.id,
      fprint: findingFingerprint(linkedin.id, "https://linkedin.com/company/sco-mfa/posts/visit", "Foreign minister visit announced"),
      spec: {
        topic: "diplomatic_news",
        headline: "Foreign minister visit announced",
        url: "https://linkedin.com/company/sco-mfa/posts/visit",
        summary: "Official visit confirmed via the ministry's verified LinkedIn page.",
        confidence: 48,
        targetType: null,
        targetId: null,
        field: null,
        value: null,
        stage: "open",
        reviewNote: null,
      },
    },
    {
      sourceId: gazette.id,
      fprint: findingFingerprint(gazette.id, "https://gazette.example-gov.org/qa/religious-affairs", "Religious affairs committee formed"),
      spec: {
        topic: "religious_affairs",
        headline: "Religious affairs committee formed",
        url: "https://gazette.example-gov.org/qa/religious-affairs",
        summary: "Committee formation published in the gazette.",
        confidence: 55,
        targetType: null,
        targetId: null,
        field: null,
        value: null,
        stage: "rejected",
        reviewNote: "Unable to confirm via an independent secondary source; no follow-up official record.",
      },
    },
  ];

  const ids: number[] = [];
  for (const { sourceId, spec, fprint } of findings) {
    const row = await ensureFinding(sourceId, spec, fprint);
    ids.push(row.id);
  }

  await db.update(countriesTable).set({ governmentType: "presidential" }).where(eq(countriesTable.id, scor.id));

  const openFindings = findings.filter((f) => f.spec.stage === "open");
  const openIds = openFindings
    .map((f) => ids[findings.indexOf(f)])
    .filter((id): id is number => id != null);

  await db
    .update(notificationsTable)
    .set({ isRead: false, readAt: null })
    .where(inArray(notificationsTable.fingerprint, openIds.map((id) => `new_finding:${id}`)));

  console.log(`sources: ${gov.name} (tier ${gov.tier}), ${gazette.name} (tier ${gazette.tier}), ${linkedin.name} (tier ${linkedin.tier})`);
  console.log(`findings: ${ids.length} seeded (3 open + 1 rejected), ids=${ids.join(",")}`);
  console.log(`baseline: SCOR governmentType restored to presidential; ${openIds.length} new_finding notifications reset to unread`);
  console.log("seed-intelligence complete — run GET /api/notifications to reconcile the feed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });