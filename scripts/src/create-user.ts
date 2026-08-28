#!/usr/bin/env node
//
// Bootstrap a user in the Meridian workspace.
//
// Usage:
//   DATABASE_URL=... BETTER_AUTH_SECRET=... \
//     bun run --filter @workspace/scripts create-user <email> <name> [--role global_admin] [--verify]
//
// Without --verify: account is created unverified, a verification token is
// minted and mailed (console/SMTP), and the temp password is printed once —
// sign-in is blocked until verified.
// With --verify: the account is marked verified immediately (bootstrap escape
// for the first admin on networks where email cannot arrive), the token is
// skipped, and the temp password is printed.
import { betterAuth } from "better-auth";
import {
  db,
  pool,
} from "@workspace/db";
import {
  buildAuthOptions,
  createAccount,
  ensureWorkspaceOrg,
  isWorkspaceRole,
  ORG_MEMBER_ROLE,
  ORG_OWNER_ROLE,
} from "@workspace/auth";
import type { CreateAccountAuth } from "@workspace/auth";

function fail(message: string): never {
  console.error(`error: ${message}`);
  console.error(usage);
  process.exit(1);
}

const usage = `Usage: create-user <email> <name> [--role ROLE] [--verify]`;

const args = process.argv.slice(2);
const emailArg = args.find((a) => !a.startsWith("--"));
const nameArg = args.slice(1).find((a) => !a.startsWith("--"));
const roleArg = (() => {
  const i = args.indexOf("--role");
  return i >= 0 ? args[i + 1] : "global_admin";
})();
const verify = args.includes("--verify");

// `?? fail(...)` narrows from module scope (a bare guard would not narrow
// into `main` below).
const email: string = emailArg ?? fail("email and name are required.");
const name: string = nameArg ?? fail("email and name are required.");
const secret: string =
  process.env.BETTER_AUTH_SECRET ??
  fail("BETTER_AUTH_SECRET must be set (see artifacts/api-server/.env.example).");
const role = isWorkspaceRole(roleArg)
  ? roleArg
  : fail("role must be one of: global_admin, regional_director, country_lead, research, meeting_coordinator, viewer");

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email looks invalid.");

  const auth = betterAuth(buildAuthOptions({ db, secret })) as CreateAccountAuth;
  const created = await createAccount({
    auth,
    db,
    secret,
    input: { email: email.trim().toLowerCase(), name: name.trim(), role, verify },
  });
  const memberRole = role === "global_admin" && verify ? ORG_OWNER_ROLE : ORG_MEMBER_ROLE;
  const orgId = await ensureWorkspaceOrg(db, created.user.id, memberRole);

  console.log(`\nCreated user:`);
  console.log(`  email:    ${created.user.email}`);
  console.log(`  name:     ${created.user.name}`);
  console.log(`  role:     ${created.user.role}`);
  console.log(`  org:      Meridian (${orgId})`);
  console.log(`  verified: ${verify ? "yes (bootstrap)" : "no — token issued"}`);
  console.log(`  temp password (shown once, rotate after sign-in):`);
  console.log(`    ${created.tempPassword}`);
  if (!verify && created.verificationToken) {
    console.log(`  verification token (also mailed):`);
    console.log(`    ${created.verificationToken}`);
  }
  console.log(``);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});