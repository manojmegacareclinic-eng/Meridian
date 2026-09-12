import { and, eq, gte } from "drizzle-orm";
import type { Db } from "@workspace/db";
import {
  contactsTable,
  countriesTable,
  intelligenceFindingsTable,
  intelligenceSourcesTable,
  organizationsTable,
} from "@workspace/db";

export const SOURCE_KIND_TIER: Record<string, number> = {
  government_site: 1,
  parliament_directory: 2,
  embassy_site: 3,
  government_gazette: 4,
  linkedin: 5,
  facebook_x: 6,
  other: 7,
};

export const tierForKind = (kind: string): number => SOURCE_KIND_TIER[kind] ?? SOURCE_KIND_TIER.other;

export const TOPIC_LABELS: Record<string, string> = {
  government_change: "Government change",
  election: "Election",
  diplomatic_news: "Diplomatic news",
  religious_affairs: "Religious affairs",
  ngo_news: "NGO news",
  university_news: "University news",
  other: "Other",
};

const DAY_MS = 86_400_000;

const APPLY_ALLOWLIST: Record<string, Record<string, "string" | "int">> = {
  country: { governmentType: "string", electionYear: "int", status: "string", language: "string" },
  organization: { name: "string", type: "string", website: "string", address: "string", notes: "string" },
  contact: { title: "string", institution: "string", verificationStatus: "string" },
};

type ApplyResult =
  | { ok: true; entityType: string; entityId: number; beforeValue: string | null; afterValue: string }
  | { ok: false; reason: string };

/**
 * Best-effort-and-explicit apply of a finding's proposed change to the official
 * record. The field must be in the allowlist, the value must validate, and the
 * target row must still exist. Never mutates unless the reviewer chose apply.
 */
export async function applyFindingToOfficialRecord(db: Db, finding: {
  targetType: string | null;
  targetId: number | null;
  field: string | null;
  value: string | null;
}): Promise<ApplyResult> {
  if (finding.targetType == null || finding.targetId == null || finding.field == null || finding.value == null) {
    return { ok: false, reason: "Finding proposes no target change." };
  }
  const allowed = APPLY_ALLOWLIST[finding.targetType];
  if (!allowed || !(finding.field in allowed)) {
    return { ok: false, reason: `Field '${finding.field}' is not in the apply allowlist for ${finding.targetType}.` };
  }
  const kind = allowed[finding.field as keyof typeof allowed];
  if (kind === "int" && !/^\d{4}$/.test(finding.value)) {
    return { ok: false, reason: `Invalid value for ${finding.field}: expected a four-digit year.` };
  }

  const setValue = kind === "int" ? Number(finding.value) : finding.value;
  const table =
    finding.targetType === "country"
      ? countriesTable
      : finding.targetType === "organization"
        ? organizationsTable
        : contactsTable;

  const [row] = await db.select().from(table).where(eq(table.id, finding.targetId));
  if (!row) return { ok: false, reason: `Target ${finding.targetType} no longer exists.` };

  const beforeValue = String((row as unknown as Record<string, unknown>)[finding.field] ?? "");
  /** values are allowlisted and validated above; the dynamic key is safe here. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [updated] = await db
    .update(table)
    .set({ [finding.field as never]: setValue } as any)
    .where(eq(table.id, finding.targetId))
    .returning();
  if (!updated) return { ok: false, reason: `Could not apply change to target ${finding.targetType}.` };

  return {
    ok: true,
    entityType: finding.targetType,
    entityId: finding.targetId,
    beforeValue,
    afterValue: finding.value,
  };
}

export type FindingCandidate = {
  kind: string;
  fingerprint: string;
  title: string;
  body: string;
  countryId: number | null;
  entityType: string;
  entityId: number;
};

/**
 * Findings created within the last 7 days and still open feed a `new_finding`
 * alert for all staff; the row retires once a decision closes the finding.
 */
export async function findFindingCandidates(db: Db): Promise<FindingCandidate[]> {
  const cutoff = new Date(Date.now() - 7 * DAY_MS);
  const rows = await db
    .select({
      id: intelligenceFindingsTable.id,
      headline: intelligenceFindingsTable.headline,
      topic: intelligenceFindingsTable.topic,
      confidence: intelligenceFindingsTable.confidence,
      targetType: intelligenceFindingsTable.targetType,
      targetId: intelligenceFindingsTable.targetId,
      sourceName: intelligenceSourcesTable.name,
    })
    .from(intelligenceFindingsTable)
    .innerJoin(intelligenceSourcesTable, eq(intelligenceFindingsTable.sourceId, intelligenceSourcesTable.id))
    .where(and(eq(intelligenceFindingsTable.stage, "open"), gte(intelligenceFindingsTable.createdAt, cutoff)));

  return rows.map((row) => ({
    kind: "new_finding",
    fingerprint: `new_finding:${row.id}`,
    title: `New intelligence finding — ${row.headline}`,
    body: `${TOPIC_LABELS[row.topic] ?? row.topic} · confidence ${row.confidence}% · via ${row.sourceName}`,
    countryId: row.targetType === "country" ? row.targetId : null,
    entityType: "intelligence_finding",
    entityId: row.id,
  }));
}