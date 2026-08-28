// Playwright route QA for the SPA.
// Modes:
//   default       — demo mode (VITE_AUTH_DEMO=1 on the SPA; API in
//                   AUTH_PASSTHROUGH). Asserts shell + nav + demo user, 404.
//   --mode real-auth — no demo flag; asserts the sign-in shell shows and the
//                   application shell stays hidden until signed in.
// Run:
//   bun run --filter @workspace/scripts route-qa
//   ROUTE_QA_MODE=real-auth bun run --filter @workspace/scripts route-qa
import { chromium } from "playwright";

const mode = process.env.ROUTE_QA_MODE === "real-auth" ? "real-auth" : "demo";
const baseURL = process.env.ROUTE_QA_BASE_URL ?? "http://localhost:5173";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

const NAV_ROUTES = [
  { path: "/", testid: "link-nav-overview", title: "Overview" },
  { path: "/countries", testid: "link-nav-countries", title: "Countries" },
  { path: "/contacts", testid: "link-nav-contacts", title: "Contacts" },
  { path: "/meetings", testid: "link-nav-meetings", title: "Meetings" },
  { path: "/agreements", testid: "link-nav-agreements", title: "Agreements" },
  { path: "/settings", testid: "link-nav-settings", title: "Workspace" },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  if (mode === "real-auth") {
    await page.goto(`${baseURL}/`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="button-sign-in"]', { timeout: 15000 });
    check("sign-in button visible", await page.isVisible('[data-testid="button-sign-in"]'));
    const shellCount = await page.locator('[data-testid="current-user-name"]').count();
    check("application shell hidden until signed in", shellCount === 0, `got ${shellCount} user markers`);
  } else {
    // Demo session resolves synchronously; confirm the shell arrives.
    await page.goto(`${baseURL}/`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="current-user-name"]', { timeout: 15000 });
    check(
      "demo user name in header",
      ((await page.textContent('[data-testid="current-user-name"]')) ?? "").trim() === "Demo Analyst",
      "Demo Analyst not found",
    );
    const signOutCount = await page.locator('[data-testid="button-sign-out"]').count();
    check("sign-out hidden in demo mode", signOutCount === 0, `got ${signOutCount}`);

    for (const { path, testid, title } of NAV_ROUTES) {
      await page.goto(`${baseURL}${path}`, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="${testid}"]`, { timeout: 15000 });
      const h1 = ((await page.textContent("header h1")) ?? "").trim();
      check(`${path} header title renders`, h1 === title, `got "${h1}"`);
      const link = page.locator(`[data-testid="${testid}"]`);
      const className = (await link.getAttribute("class")) ?? "";
      check(`${path} nav item highlighted as active`, className.includes("bg-[hsl(var(--sidebar-accent))]"), "active class missing");
    }

    await page.goto(`${baseURL}/definitely-not-a-route`, { waitUntil: "load" });
    await page.waitForSelector("text=This room does not exist.", { timeout: 15000 });
    check("unknown route shows 404 page", true);
  }

  const unexpected = consoleErrors.filter((e) => !/dashboard|query|aborted/i.test(e));
  check("zero unexpected console errors", unexpected.length === 0, unexpected.join(" | "));

  await browser.close();
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`} (${passed} passed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});