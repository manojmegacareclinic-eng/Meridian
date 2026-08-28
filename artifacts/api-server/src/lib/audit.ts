import { db, activityTable } from "@workspace/db";
import type { ActivityInsert } from "@workspace/db";

export type AuditAction = "create" | "update" | "read";
export type AuditEntityType =
  | "country"
  | "contact"
  | "meeting"
  | "agreement"
  | "admin_user"
  | "admin_invitation"
  | "dashboard_summary";

export interface AuditActor {
  id: string;
  name: string;
}

export interface WriteAuditInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  title: string;
  description: string;
  kind: string;
  countryId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Append an audit row. Never throws to the caller: an audit failure must not
 * break the primary request path, so write errors are surfaced to the logs.
 */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const row: ActivityInsert = {
    actorId: input.actor.id,
    actorName: input.actor.name,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    countryId: input.countryId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  };
  try {
    await db.insert(activityTable).values(row);
  } catch (err) {
    console.error("writeAudit failed", err);
  }
}

/**
 * Compact diff for before/after snapshots. Produces `{ before, after }` objects
 * limited to the given keys, only for fields whose value changed. Omits
 * sensitive body fields (email/phone) that never change.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  let changed = false;
  for (const key of keys) {
    const vBefore = before[key];
    const vAfter = after[key];
    if (JSON.stringify(vBefore) !== JSON.stringify(vAfter)) {
      b[key] = vBefore ?? null;
      a[key] = vAfter ?? null;
      changed = true;
    }
  }
  return changed ? { before: b, after: a } : null;
}