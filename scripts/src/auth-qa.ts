// DB-backed verification of the Better Auth swap. Requires:
//   DATABASE_URL + BETTER_AUTH_SECRET (see artifacts/api-server/.env.example)
// Run: DATABASE_URL=... BETTER_AUTH_SECRET=... bun run --filter @workspace/scripts auth-qa
import http from "node:http";
import { once } from "node:events";
import { betterAuth } from "better-auth";
import { eq, inArray } from "drizzle-orm";
import { db, pool, activityTable, countriesTable, documentsTable, newsTable, userTable } from "@workspace/db";
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

const QA_EMAILS = ["qa@meridian.local", "qa-viewer@meridian.local", "qa-admin2@meridian.local"];
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

  // 10-16. Admin endpoints: global_admin only; any global_admin may invite.
  const viewerAdmUsers = await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: viewerJar.header() },
  });
  check("GET /api/admin/users as viewer -> 403", viewerAdmUsers.status === 403, `got ${viewerAdmUsers.status}`);

  const viewerAdmPost = await fetch(`${origin}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: viewerJar.header() },
    body: JSON.stringify({ email: "qa-nope@meridian.local", name: "Nope", role: "viewer" }),
  });
  check("POST /api/admin/users as viewer -> 403", viewerAdmPost.status === 403, `got ${viewerAdmPost.status}`);

  const admUsers = await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: adminJar.header() },
  });
  const admUsersBody = (await admUsers.json().catch(() => [])) as unknown[];
  check(
    "GET /api/admin/users as global_admin -> 200 lists qa user",
    admUsers.status === 200 &&
      admUsersBody.some((u) => (u as { email?: string }).email === QA_EMAILS[0]),
    `status=${admUsers.status} count=${admUsersBody.length}`,
  );

  const admCreate = await fetch(`${origin}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ email: QA_EMAILS[2], name: "QA Admin Two", role: "global_admin" }),
  });
  const admCreateBody = (await admCreate.json().catch(() => ({}))) as {
    tempPassword?: string;
    verificationToken?: string | null;
  };
  check(
    "POST /api/admin/users (global_admin) -> 201 with temp password + token",
    admCreate.status === 201 && typeof admCreateBody.tempPassword === "string" && !!admCreateBody.verificationToken,
    `status=${admCreate.status} body=${JSON.stringify(admCreateBody).slice(0, 120)}`,
  );

  // Verify the second admin's token so it can sign in.
  const admin2Jar = cookieJar();
  const admin2Verify = await fetch(
    `${origin}/api/auth/verify-email?token=${encodeURIComponent(admCreateBody.verificationToken ?? "")}`,
  );
  admin2Jar.capture(admin2Verify);
  check("verify-email (second admin) -> 200", admin2Verify.status === 200, `got ${admin2Verify.status}`);

  // Any global_admin can invite, regardless of org membership role.
  const invite = await fetch(`${origin}/api/admin/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin2Jar.header() },
    body: JSON.stringify({ email: QA_EMAILS[1] }),
  });
  const inviteBody = (await invite.json().catch(() => ({}))) as { invitation?: { status?: string } };
  check(
    "POST /api/admin/invitations as second (non-owner) global_admin -> 201",
    invite.status === 201 && inviteBody.invitation?.status === "pending",
    `status=${invite.status} body=${JSON.stringify(inviteBody).slice(0, 120)}`,
  );

  const inviteUnknown = await fetch(`${origin}/api/admin/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: admin2Jar.header() },
    body: JSON.stringify({ email: "no-such-account@meridian.local" }),
  });
  check("invite for unknown email -> 400", inviteUnknown.status === 400, `got ${inviteUnknown.status}`);

  // 17-24. Audit trail: every mutation and sensitive read leaves a row with the
  //        actor; any signed-in session may query the trail; unauthenticated
  //        queries are rejected.
  const auditAnon = await fetch(`${origin}/api/audit`);
  check("GET /api/audit unauthenticated -> 401", auditAnon.status === 401, `got ${auditAnon.status}`);

  const auditViewer = await fetch(`${origin}/api/audit`, { headers: { cookie: viewerJar.header() } });
  check("GET /api/audit as viewer -> 200", auditViewer.status === 200, `got ${auditViewer.status}`);

  // Country create (from the admin write above) leaves a create row keyed to the
  // disposable country, carrying the actor id and an `after` snapshot.
  const auditCountry = await fetch(`${origin}/api/audit?entityType=country&entityId=${adminPostBody.id}`, { headers: { cookie: adminJar.header() } });
  const auditCountryBody = (await auditCountry.json().catch(() => [])) as { action?: string; entityType?: string; actorId?: string; after?: unknown }[];
  check(
    "country create leaves a create audit row with actor and after",
    auditCountry.status === 200 &&
      auditCountryBody.length >= 1 &&
      auditCountryBody.every((r) => r.action === "create" && r.entityType === "country" && r.actorId === qaUser.user.id) &&
      Boolean(auditCountryBody[0]?.after),
    `status=${auditCountry.status} rows=${auditCountryBody.length}`,
  );

  // Admin user create (second admin) leaves a create/audit row for the target.
  const auditUser = await fetch(`${origin}/api/audit?entityType=admin_user&action=create&actorId=${qaUser.user.id}`, { headers: { cookie: adminJar.header() } });
  const auditUserBody = (await auditUser.json().catch(() => [])) as { action?: string; after?: { email?: string } }[];
  check(
    "admin user create leaves a create audit row for the target email",
    auditUser.status === 200 && auditUserBody.some((r) => r.after?.email === QA_EMAILS[2]),
    `status=${auditUser.status} rows=${auditUserBody.length}`,
  );

  // Admin user read (the directory read above) leaves a read row with the actor.
  const auditRead = await fetch(`${origin}/api/audit?entityType=admin_user&action=read&actorId=${qaUser.user.id}`, { headers: { cookie: adminJar.header() } });
  const auditReadBody = (await auditRead.json().catch(() => [])) as unknown[];
  check(
    "admin user read leaves a read audit row with actor",
    auditRead.status === 200 && auditReadBody.length >= 1,
    `status=${auditRead.status} rows=${auditReadBody.length}`,
  );

  // Invitation create (from the second admin) leaves a row for the invitee.
  const auditInvite = await fetch(`${origin}/api/audit?entityType=admin_invitation`, { headers: { cookie: adminJar.header() } });
  const auditInviteBody = (await auditInvite.json().catch(() => [])) as { action?: string; after?: { email?: string } }[];
  check(
    "invitation create leaves a create audit row for the invitee",
    auditInvite.status === 200 && auditInviteBody.some((r) => r.action === "create" && r.after?.email === QA_EMAILS[1]),
    `status=${auditInvite.status} rows=${auditInviteBody.length}`,
  );

  // 25-37. Country workspace foundation: detail, documents, news, and audit.
  const countryId = adminPostBody.id as number;

  // 25. GET /api/countries/:id
  const getCountry = await fetch(`${origin}/api/countries/${countryId}`, { headers: { cookie: adminJar.header() } });
  const getCountryBody = (await getCountry.json().catch(() => ({}))) as { contactsCount: number; meetingsCount: number };
  check("GET /api/countries/:id -> 200 with counts", getCountry.status === 200 && typeof getCountryBody.contactsCount === "number" && typeof getCountryBody.meetingsCount === "number", `status=${getCountry.status}`);

  // 26. PATCH /api/countries/:id (valid update)
  const patchCountry = await fetch(`${origin}/api/countries/${countryId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ language: "English", governmentType: "presidential republic", electionYear: 2024, team: "QA desk", priority: "high", strategy: "Test strategy" }) });
  const patchCountryBody = (await patchCountry.json().catch(() => ({}))) as { language?: string; priority?: string };
  check("PATCH /api/countries/:id -> 200 echoes values", patchCountry.status === 200 && patchCountryBody.language === "English" && patchCountryBody.priority === "high", `status=${patchCountry.status}`);

  // 27. PATCH with invalid enum -> 400
  const patchBad = await fetch(`${origin}/api/countries/${countryId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ governmentType: "bogus" }) });
  check("PATCH /api/countries/:id invalid enum -> 400", patchBad.status === 400, `got ${patchBad.status}`);

  // 28. PATCH non-existent -> 404
  const patch404 = await fetch(`${origin}/api/countries/999999`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ language: "English" }) });
  check("PATCH /api/countries/999999 -> 404", patch404.status === 404, `got ${patch404.status}`);

  // 29. POST /api/documents
  const createDoc = await fetch(`${origin}/api/documents`, { method: "POST", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ countryId, title: "QA protocol review", type: "report" }) });
  const createDocBody = (await createDoc.json().catch(() => ({}))) as { status?: string; agreementId?: number | null; agreementName?: string | null; id: number };
  check("POST /api/documents -> 201 draft", createDoc.status === 201 && createDocBody.status === "draft" && createDocBody.agreementId === null && createDocBody.agreementName === null, `status=${createDoc.status}`);
  const docId = createDocBody.id;

  // 30. GET /api/documents?countryId
  const listDocs = await fetch(`${origin}/api/documents?countryId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const listDocsBody = (await listDocs.json().catch(() => ([]))) as { id: number }[];
  check("GET /api/documents?countryId -> exactly 1 row", listDocs.status === 200 && listDocsBody.length === 1, `status=${listDocs.status} count=${listDocsBody.length}`);

  // 31. PATCH /api/documents/:id
  const patchDoc = await fetch(`${origin}/api/documents/${docId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ status: "approved" }) });
  const patchDocBody = (await patchDoc.json().catch(() => ({}))) as { status?: string };
  check("PATCH /api/documents/:id -> 200 approved", patchDoc.status === 200 && patchDocBody.status === "approved", `status=${patchDoc.status}`);

  // 32. PATCH document 404 + POST bad countryId
  const patchDoc404 = await fetch(`${origin}/api/documents/999999`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ status: "approved" }) });
  check("PATCH /api/documents/999999 -> 404", patchDoc404.status === 404, `got ${patchDoc404.status}`);
  const createDocBad = await fetch(`${origin}/api/documents`, { method: "POST", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ countryId: 999999, title: "bad" }) });
  check("POST /api/documents bad countryId -> 400", createDocBad.status === 400, `got ${createDocBad.status}`);

  // 33. POST /api/news
  const createNews = await fetch(`${origin}/api/news`, { method: "POST", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ countryId, title: "QA briefing", source: "Reuters", publishedAt: new Date().toISOString() }) });
  const createNewsBody = (await createNews.json().catch(() => ({}))) as { publishedAt?: string; id: number };
  check("POST /api/news -> 201 echoes publishedAt", createNews.status === 201 && typeof createNewsBody.publishedAt === "string", `status=${createNews.status}`);
  const newsId = createNewsBody.id;

  // 34. GET /api/news?countryId
  const listNews = await fetch(`${origin}/api/news?countryId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const listNewsBody = (await listNews.json().catch(() => ([]))) as { id: number }[];
  check("GET /api/news?countryId -> exactly 1 row", listNews.status === 200 && listNewsBody.length === 1, `status=${listNews.status} count=${listNewsBody.length}`);

  // 35. PATCH /api/news/:id
  const patchNews = await fetch(`${origin}/api/news/${newsId}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: adminJar.header() }, body: JSON.stringify({ summary: "updated" }) });
  const patchNewsBody = (await patchNews.json().catch(() => ({}))) as { summary?: string };
  check("PATCH /api/news/:id -> 200", patchNews.status === 200 && patchNewsBody.summary === "updated", `status=${patchNews.status}`);

  // 36. GET /api/activity?countryId includes our writes
  const activityByCountry = await fetch(`${origin}/api/activity?countryId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const activityByCountryBody = (await activityByCountry.json().catch(() => ([]))) as { kind?: string; title?: string }[];
  check("GET /api/activity?countryId includes country/doc/news writes", activityByCountry.status === 200 && activityByCountryBody.some((r) => r.kind === "country" && r.title === "Country workspace updated") && activityByCountryBody.some((r) => r.kind === "document" && r.title === "Document created") && activityByCountryBody.some((r) => r.kind === "news" && r.title === "News item created"), `status=${activityByCountry.status} rows=${activityByCountryBody.length}`);

  // 37. Audit-specific assertions
  const auditDocCreate = await fetch(`${origin}/api/audit?entityType=document&entityId=${docId}`, { headers: { cookie: adminJar.header() } });
  const auditDocCreateBody = (await auditDocCreate.json().catch(() => ([]))) as { action?: string; after?: { status?: string } }[];
  check("audit document create row with status draft", auditDocCreate.status === 200 && auditDocCreateBody.some((r) => r.action === "create" && r.after?.status === "draft"), `status=${auditDocCreate.status}`);

  const auditDocUpdate = await fetch(`${origin}/api/audit?entityType=document&action=update&entityId=${docId}`, { headers: { cookie: adminJar.header() } });
  const auditDocUpdateBody = (await auditDocUpdate.json().catch(() => ([]))) as { action?: string }[];
  check("audit document update row", auditDocUpdate.status === 200 && auditDocUpdateBody.length >= 1, `status=${auditDocUpdate.status}`);

  const auditNewsCreate = await fetch(`${origin}/api/audit?entityType=news&entityId=${newsId}`, { headers: { cookie: adminJar.header() } });
  const auditNewsCreateBody = (await auditNewsCreate.json().catch(() => ([]))) as { action?: string }[];
  check("audit news create row", auditNewsCreate.status === 200 && auditNewsCreateBody.some((r) => r.action === "create"), `status=${auditNewsCreate.status}`);

  const auditCountryUpdate = await fetch(`${origin}/api/audit?entityType=country&action=update&entityId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const auditCountryUpdateBody = (await auditCountryUpdate.json().catch(() => ([]))) as { before?: { language?: string | null }; after?: { language?: string } }[];
  check("audit country update with before/after language", auditCountryUpdate.status === 200 && auditCountryUpdateBody.some((r) => r.before?.language === null && r.after?.language === "English"), `status=${auditCountryUpdate.status}`);

  // 25 (renumbered). Cleanup: remove disposable users (cascades accounts/sessions/members)
  //     and the disposable country row (with its activity trail).
  await db.delete(userTable).where(inArray(userTable.email, QA_EMAILS));
  if (typeof adminPostBody.id === "number") {
    // Delete news and documents first (FK to countries, no cascade)
    await db.delete(newsTable).where(eq(newsTable.countryId, adminPostBody.id));
    await db.delete(documentsTable).where(eq(documentsTable.countryId, adminPostBody.id));
    // Activity sweep removes every audit row referencing the disposable country
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
  if (typeof adminPostBody.id === "number") {
    const auditLeft = await db
      .select({ id: activityTable.id })
      .from(activityTable)
      .where(eq(activityTable.countryId, adminPostBody.id));
    check("disposable audit rows cleaned up", auditLeft.length === 0, JSON.stringify(auditLeft));
  }

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