// DB-backed verification of the Better Auth swap. Requires:
//   DATABASE_URL + BETTER_AUTH_SECRET (see artifacts/api-server/.env.example)
// Run: DATABASE_URL=... BETTER_AUTH_SECRET=... bun run --filter @workspace/scripts auth-qa
import http from "node:http";
import { once } from "node:events";
import app from "@workspace/api-server/src/app";
import { pool } from "@workspace/db";

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

async function main() {
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
  const anonPost = await fetch(`${origin}/api/countries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "QA", code: "QA", region: "QA", status: "leads" }) });
  check("POST /api/countries unauthenticated -> 401", anonPost.status === 401, `got ${anonPost.status}`);

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