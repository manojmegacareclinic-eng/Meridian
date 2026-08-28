export const WORKSPACE_ROLES = [
  "global_admin",
  "regional_director",
  "country_lead",
  "research",
  "meeting_coordinator",
  "viewer",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

// Roles permitted to create, update, or delete records. `viewer` is read-only.
export const WRITE_ROLES: ReadonlySet<WorkspaceRole> = new Set(
  WORKSPACE_ROLES.filter((role) => role !== "viewer"),
);

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return (
    typeof role === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(role)
  );
}

export const WORKSPACE_ORG = { name: "Meridian", slug: "meridian" } as const;

export const ORG_OWNER_ROLE = "owner" as const;
export const ORG_MEMBER_ROLE = "member" as const;