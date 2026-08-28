import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, userTable, memberTable, invitationTable, organizationTable } from "@workspace/db";
import { createAccount, ensureWorkspaceOrg, ORG_MEMBER_ROLE } from "@workspace/auth";
import { auth, BETTER_AUTH_SECRET } from "../lib/auth";
import {
  CreateAdminUserBody,
  UpdateAdminUserRoleBody,
  CreateAdminInvitationBody,
  ListAdminUsersResponse,
  ListAdminMembersResponse,
} from "@workspace/api-zod";
import { requireDataRole } from "../middlewares/guards";

const router: IRouter = Router();

router.use(requireDataRole("global_admin"));

router.get("/users", async (_req, res) => {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      emailVerified: userTable.emailVerified,
      memberId: memberTable.id,
    })
    .from(userTable)
    .leftJoin(memberTable, eq(memberTable.userId, userTable.id))
    .orderBy(asc(userTable.email));
  res.json(ListAdminUsersResponse.parse(rows));
});

router.post("/users", async (req, res) => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const created = await createAccount({
    auth,
    db,
    secret: BETTER_AUTH_SECRET,
    input: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      verify: false,
    },
  });
  await ensureWorkspaceOrg(db, created.user.id, ORG_MEMBER_ROLE);
  res.status(201).json({
    user: created.user,
    tempPassword: created.tempPassword,
    verificationToken: created.verificationToken,
  });
});

router.patch("/users/:id/role", async (req, res) => {
  const parsed = UpdateAdminUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(userTable)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(userTable.id, req.params.id))
    .returning({ id: userTable.id, role: userTable.role });
  if (!row) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json(row);
});

router.get("/members", async (_req, res) => {
  const members = await db
    .select({
      id: memberTable.id,
      organizationId: memberTable.organizationId,
      userId: memberTable.userId,
      role: memberTable.role,
      name: userTable.name,
      email: userTable.email,
    })
    .from(memberTable)
    .innerJoin(userTable, eq(userTable.id, memberTable.userId))
    .orderBy(asc(userTable.email));
  const invitations = await db
    .select({
      id: invitationTable.id,
      organizationId: invitationTable.organizationId,
      email: invitationTable.email,
      role: invitationTable.role,
      status: invitationTable.status,
      inviterId: invitationTable.inviterId,
      expiresAt: invitationTable.expiresAt,
    })
    .from(invitationTable)
    .orderBy(desc(invitationTable.expiresAt));
  res.json(ListAdminMembersResponse.parse({ members, invitations }));
});

router.post("/invitations", async (req, res) => {
  const parsed = CreateAdminInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [org] = await db.select({ id: organizationTable.id }).from(organizationTable).limit(1);
  if (!org) {
    res.status(500).json({ error: "Workspace org is not seeded." });
    return;
  }
  const [user] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, parsed.data.email));
  if (!user) {
    res.status(400).json({ error: "No account exists for that email. Create the user first, then invite." });
    return;
  }
  // Direct insert instead of auth.api.organization.createInvitation: the org
  // plugin's createInvitation requires the CALLER to be an org owner/admin,
  // but any global_admin is authorized here regardless of org role (org
  // membership is administrative/bookkeeping only, never a data-access gate).
  // The global_admin guard on this router is the authorization; the invitation
  // row is pure bookkeeping the invitee's org-plugin surface sees.
  const actor = (req as unknown as { actor: { id: string } }).actor;
  if (actor?.id === "passthrough") {
    // Dev-only AUTH_PASSTHROUGH can't be an inviter: invitation.inviter_id is
    // an FK to user. Refuse instead of crashing with a constraint violation.
    res.status(503).json({ error: "Cannot create invitations while AUTH_PASSTHROUGH is enabled." });
    return;
  }
  const [invitation] = await db
    .insert(invitationTable)
    .values({
      id: randomUUID(),
      organizationId: org.id,
      email: parsed.data.email,
      role: parsed.data.role ?? "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId: actor!.id,
    })
    .returning();
  res.status(201).json({ invitation });
});

export default router;