import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { organizationTable, memberTable, type Db } from "@workspace/db";
import { ORG_MEMBER_ROLE, ORG_OWNER_ROLE, WORKSPACE_ORG } from "./roles";

/**
 * Idempotently seed the single workspace org and, when a user is given,
 * grant them membership. Same function serves the CLI bootstrap (owner) and
 * admin-created accounts (member).
 */
export async function ensureWorkspaceOrg(
  db: Db,
  userId?: string,
  role: string = ORG_MEMBER_ROLE,
): Promise<string> {
  const [org] = await db
    .insert(organizationTable)
    .values({ id: randomUUID(), name: WORKSPACE_ORG.name, slug: WORKSPACE_ORG.slug })
    .onConflictDoNothing()
    .returning();
  const orgId =
    org?.id ??
    (
      await db
        .select({ id: organizationTable.id })
        .from(organizationTable)
        .where(eq(organizationTable.slug, WORKSPACE_ORG.slug))
    )[0]?.id;
  if (!orgId) throw new Error("Workspace org could not be found or created.");
  if (!userId) return orgId;
  await db
    .insert(memberTable)
    .values({ id: randomUUID(), organizationId: orgId, userId, role })
    .onConflictDoNothing();
  return orgId;
}