// DB-backed verification of the Better Auth swap. Requires:
//   DATABASE_URL + BETTER_AUTH_SECRET (see artifacts/api-server/.env.example)
// Run: DATABASE_URL=... BETTER_AUTH_SECRET=... bun run --filter @workspace/scripts auth-qa
import http from "node:http";
import { once } from "node:events";
import { betterAuth } from "better-auth";
import { eq, inArray } from "drizzle-orm";
import { db, pool, activityTable, countriesTable, userTable } from "@workspace/db";
import {
  buildAuthOptions,
  createAccount,
  type CreateAccountAuth,
} from "@workspace/auth";
import app from "@workspace/api-server/src/app";

// Boot the REAL api-server app (pino + cors + auth handler + guards) over a
// local listener so every layer — mount order, session guard, write-role
// guard — is exercised exactly as in production. app.ts does not listen, only
// index.ts does, so importing it here is side-effect free.

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const QA_EMAILS = ["qa@meridian.local", "qa-viewer@meridian.local"];
// Unique per-run country code so a previously-aborted run can never collide
// (the insert schema constrains `code` to 3 chars).
const QA_CODE = `QA${Math.floor(1 + Math.random() * 9)}`;

// Minimal cookie jar: collects set-cookie from responses and replays them.
function cookieJar() {
  let jar = new Map<string, string>();
  const capture = (res: Response) => {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const header = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const clear = () => jar.clear();
  return { capture, header, clear, readonly: () => jar.size > 0 };
}

async function main() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET must be set");
  const auth = betterAuth(buildAuthOptions({ db, secret })) as CreateAccountAuth;

  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  // 1. healthz stays public
  const health = await fetch(`${origin}/api/healthz`);
  check("GET /api/healthz public -> 200", health.status === 200, `got ${health.status}`);

  // 2. Unauthenticated -> 401 on a protected route
  const anon = await fetch(`${origin}/api/countries`);
  check("GET /api/countries unauthenticated -> 401", anon.status === 401, `got ${anon.status}`);

  // 3. Unauthenticated mutating request is also rejected before touching data
  const anonPost = await fetch(`${origin}/api/countries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "QA", code: QA_CODE, region: "QA", status: "leads" }) });
  check("POST /api/countries unauthenticated -> 401", anonPost.status === 401, `got ${anonPost.status}`);

  // 4. Create an UNVERIFIED user via the shared account-creation module.
  //    `createAccount` mints a verification token (mailed via the console
  //    transport) and returns it.
  const qaUser = await createAccount({
    auth,
    db,
    secret,
    input: {
      email: QA_EMAILS[0],
      name: "QA User",
      role: "global_admin",
      verify: false,
    },
    baseURL: origin,
  });
  check(
    "createAccount (unverified) returns a verification token",
    Boolean(qaUser.verificationToken) && typeof qaUser.verificationToken === "string",
  );

  // 5. Unverified sign-in -> rejected (FORBIDDEN + EMAIL_NOT_VERIFIED); the
  //    console mail transport prints a fresh token (sendOnSignIn).
  const unverified = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: QA_EMAILS[0], password: qaUser.tempPassword }),
  });
  const unverifiedBody = (await unverified.json().catch(() => ({}))) as { code?: string };
  check(
    "unverified sign-in rejected with EMAIL_NOT_VERIFIED",
    unverified.status === 403 && unverifiedBody.code === "EMAIL_NOT_VERIFIED",
    `status=${unverified.status} body=${JSON.stringify(unverifiedBody)}`,
  );
  // 6. Verify with the token -> auto-signs-in and sets a session cookie.
  const qaJar = cookieJar();
  const verify = await fetch(
    `${origin}/api/auth/verify-email?token=${encodeURIComponent(qaUser.verificationToken!)}`,
  );
  qaJar.capture(verify);
  check("verify-email -> 200", verify.status === 200, `got ${verify.status}`);
  check(
    "verify-email auto-sign-in sets a session cookie",
    qaJar.readonly(),
  );

  // 7. Authenticated data access with the verified session.
  const qaCountries = await fetch(`${origin}/api/countries`, {
    headers: { cookie: qaJar.header() },
  });
  check("GET /api/countries authenticated -> 200", qaCountries.status === 200, `got ${qaCountries.status}`);

  // 8. Role enforcement: a `viewer` cannot write.
  const viewerAccount = await createAccount({
    auth,
    db,
    secret,
    input: {
      email: QA_EMAILS[1],
      name: "QA Viewer",
      role: "viewer",
      verify: true,
    },
    baseURL: origin,
  });
  const viewerJar = cookieJar();
  const viewerSignIn = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: QA_EMAILS[1], password: viewerAccount.tempPassword }),
  });
  viewerJar.capture(viewerSignIn);
  const viewerPost = await fetch(`${origin}/api/countries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: viewerJar.header() },
    body: JSON.stringify({ name: "QA", code: QA_CODE, region: "QA", status: "leads" }),
  });
  check("POST /api/countries as viewer -> 403", viewerPost.status === 403, `got ${viewerPost.status}`);

  // 9. A global_admin (verified) can write.
  const adminJar = cookieJar();
  const adminSignIn = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: QA_EMAILS[0], password: qaUser.tempPassword }),
  });
  adminJar.capture(adminSignIn);
  const adminPost = await fetch(`${origin}/api/countries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ name: "QA Land", code: QA_CODE, region: "QA", status: "leads", riskLevel: "medium" }),
  });
  const adminPostBody = (await adminPost.json().catch(() => ({}))) as { id?: number; code?: string };
  check(
    "POST /api/countries as global_admin -> 201",
    adminPost.status === 201 && adminPostBody.code === QA_CODE,
    `status=${adminPost.status} body=${JSON.stringify(adminPostBody).slice(0, 200)}`,
  );

  // 10. Cleanup: remove disposable users (cascades accounts/sessions/members)
  //     and the disposable country row (with its activity trail).
  await db.delete(userTable).where(inArray(userTable.email, QA_EMAILS));
  if (typeof adminPostBody.id === "number") {
    await db.delete(activityTable).where(eq(activityTable.countryId, adminPostBody.id));
  }
  await db.delete(countriesTable).where(eq(countriesTable.code, QA_CODE));
  const usersLeft = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(inArray(userTable.email, QA_EMAILS));
  const countryLeft = await db
    .select({ id: countriesTable.id })
    .from(countriesTable)
    .where(eq(countriesTable.code, QA_CODE));
  check("disposable users cleaned up", usersLeft.length === 0, JSON.stringify(usersLeft));
  check("disposable country cleaned up", countryLeft.length === 0, JSON.stringify(countryLeft));

  server.close();
  await pool.end();
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`} (${passed} passed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});