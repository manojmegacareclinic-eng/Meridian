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
const qaEmail = process.env.ROUTE_QA_EMAIL ?? "admin@meridian.gov";
const qaPassword = process.env.ROUTE_QA_PASSWORD;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

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
  return { capture, header, readonly: () => jar.size > 0 };
}

const NAV_ROUTES = [
  { path: "/", testid: "link-nav-overview", title: "Overview" },
  { path: "/countries", testid: "link-nav-countries", title: "Countries" },
  { path: "/contacts", testid: "link-nav-contacts", title: "Contacts" },
  { path: "/meetings", testid: "link-nav-meetings", title: "Meetings" },
  { path: "/agreements", testid: "link-nav-agreements", title: "Agreements" },
  { path: "/audit", testid: "link-nav-audit", title: "Audit" },
  { path: "/settings", testid: "link-nav-settings", title: "Workspace" },
];

const COUNTRY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "meetings", label: "Meetings" },
  { id: "agreements", label: "Agreements" },
  { id: "documents", label: "Documents" },
  { id: "news", label: "News" },
  { id: "government", label: "Government" },
  { id: "organizations", label: "Organizations" },
  { id: "tasks", label: "Tasks" },
  { id: "analytics", label: "Analytics" },
] as const;

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

    if (qaPassword) {
      // Programmatic sign-in against the dev server proxy; hand the session cookie to the browser.
      const jar = cookieJar();
      const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ email: qaEmail, password: qaPassword }),
      });
      jar.capture(signIn);
      check("admin sign-in via API succeeds", signIn.status === 200, `got ${signIn.status}`);
      if (jar.readonly()) {
        const context = page.context();
        for (const [name, value] of jarMap(jar)) {
          await context.addCookies([{ name, value, url: baseURL }]);
        }
        await page.goto(`${baseURL}/`, { waitUntil: "load" });
        await page.waitForSelector('[data-testid="current-user-name"]', { timeout: 15000 });
        check("admin nav link visible", await page.isVisible('[data-testid="link-nav-admin"]'));

        await page.goto(`${baseURL}/admin`, { waitUntil: "load" });
        await page.waitForSelector('[data-testid="link-nav-admin"]', { timeout: 15000 });
        const h1 = ((await page.textContent("header h1")) ?? "").trim();
        check("admin page header title renders", h1 === "Administration", `got "${h1}"`);
        await page.waitForSelector('[data-testid^="admin-member-row-"]', { timeout: 15000 });
        const memberRows = await page.locator('[data-testid^="admin-member-row-"]').count();
        check("admin user rows listed", memberRows > 0, `got ${memberRows}`);
        check("manage-role select present", await page.locator('[data-testid^="admin-role-select-"]').first().isVisible());

        await page.goto(`${baseURL}/audit`, { waitUntil: "load" });
        await page.waitForSelector('[data-testid="audit-filter-action"]', { timeout: 15000 });
        const auditH1 = ((await page.textContent("header h1")) ?? "").trim();
        check("audit page header title renders", auditH1 === "Audit", `got "${auditH1}"`);
        check("audit nav link visible", await page.isVisible('[data-testid="link-nav-audit"]'));
        await page.waitForSelector('[data-testid^="audit-row-"]', { timeout: 15000 });
        check("audit rows render", (await page.locator('[data-testid^="audit-row-"]').count()) > 0);
      } else {
        console.log("  SKIP admin page flow (no session cookie from sign-in)");
      }
    } else {
      console.log("  SKIP admin page flow (set ROUTE_QA_PASSWORD to exercise the signed-in admin page)");
    }
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

    // Country workspace detail page (read-only tab checks)
    await page.goto(`${baseURL}/countries`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid^="card-country-"]', { timeout: 15000 });
    // Get the first country's ID from the card's testid
    const firstCountryTestId = await page.locator('[data-testid^="card-country-"]').first().getAttribute("data-testid");
    const countryId = firstCountryTestId?.replace("card-country-", "");
    console.log("DEBUG: Navigating to country detail page for ID:", countryId);
    // Check for console errors before navigation
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    // Navigate directly to the country detail URL instead of clicking
    await page.goto(`${baseURL}/country/${countryId}`, { waitUntil: "load" });
    // Wait for React to hydrate
    await page.waitForTimeout(5000);
    // Debug: dump page content to understand what's rendered
    const pageContent = await page.content();
    console.log("DEBUG: Country detail page content length:", pageContent.length);
    if (pageContent.includes("tab-overview")) {
      console.log("DEBUG: tab-overview found in page content");
    }
    if (pageContent.includes("loading-rows")) {
      console.log("DEBUG: loading-rows found in page content");
    }
    if (pageContent.includes("loading-state")) {
      console.log("DEBUG: loading-state found in page content");
    }
    if (pageContent.includes("ErrorState")) {
      console.log("DEBUG: ErrorState found in page content");
    }
    if (pageContent.includes("NotFound")) {
      console.log("DEBUG: NotFound found in page content");
    }
    if (pageContent.includes("button-add-country")) {
      console.log("DEBUG: button-add-country found - still on countries list");
    }
    if (pageContent.includes("current-user-name")) {
      console.log("DEBUG: current-user-name found - shell rendered");
    }
    // Check for common error patterns
    const testIds = pageContent.match(/data-testid="([^"]*)"/g);
    if (testIds) {
      console.log("DEBUG: data-testid elements found:", [...new Set(testIds)].slice(0, 40));
    }
    // Wait a bit for any async errors
    await page.waitForTimeout(2000);
    if (consoleErrors.length > 0) {
      console.log("DEBUG: Console errors:", consoleErrors);
    }
    // Now wait for the actual content
    await page.waitForSelector('[data-testid="tab-overview"], [data-testid="loading-state"], [data-testid="button-add-country"]', { timeout: 20000 });

    for (const tab of COUNTRY_TABS) {
      await page.click(`[data-testid="tab-${tab.id}"]`);
      await page.waitForTimeout(200); // allow tab panel to render
      const panelVisible = await page.locator(`[data-testid="tab-${tab.id}"]`).isVisible();
      check(`country detail tab "${tab.label}" clickable and visible`, panelVisible);
      if (tab.id === "overview") {
        await page.waitForSelector('[data-testid="button-country-edit"]', { timeout: 15000 });
        check('overview tab shows "Edit details" button', true);
      }
      if (tab.id === "documents") {
        await page.waitForSelector('[data-testid="button-add-doc"]', { timeout: 15000 });
        check('documents tab shows "Add document" button', true);
      }
      if (tab.id === "news") {
        await page.waitForSelector('[data-testid="button-add-news"]', { timeout: 15000 });
        check('news tab shows "Add news" button', true);
      }
    }

    // Phase 3 — relationship strategies pipeline page
    await page.goto(`${baseURL}/dr-strategies`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="select-dr-strategy-country"]', { timeout: 15000 });
    check("dr-strategies route renders country selector", await page.isVisible('[data-testid="select-dr-strategy-country"]'));
    const strategyCountrySelect = page.locator('[data-testid="select-dr-strategy-country"]');
    const strategyCountryOptions = await strategyCountrySelect.locator("option").count();
    check("dr-strategies country selector lists workspaces", strategyCountryOptions > 1, `got ${strategyCountryOptions} options`);
    const strategyNavClass = (await page.locator('[data-testid="link-nav-strategies"]').getAttribute("class")) ?? "";
    check("dr-strategies nav item highlighted as active", strategyNavClass.includes("bg-[hsl(var(--sidebar-accent))]"), "active class missing");
    if (strategyCountryOptions > 1) {
      await strategyCountrySelect.selectOption({ index: 1 });
      await page.waitForSelector('[data-testid="button-add-strategy"]', { timeout: 15000 });
      check("strategy pipeline renders new-strategy action", await page.isVisible('[data-testid="button-add-strategy"]'));
    }

    // Phase 3 — expanded meeting detail page
    await page.goto(`${baseURL}/meetings`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid^="card-meeting-"], [data-testid="button-empty-add-meeting"], [data-testid="button-add-meeting"]', { timeout: 15000 });
    const firstMeetingTestId = await page.locator('[data-testid^="card-meeting-"]').first().getAttribute("data-testid");
    const meetingId = firstMeetingTestId?.replace("card-meeting-", "");
    if (meetingId) {
      await page.goto(`${baseURL}/meeting/${meetingId}`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="link-back-to-meetings"]', { timeout: 15000 });
      check("meeting detail renders back-to-meetings link", await page.isVisible('[data-testid="link-back-to-meetings"]'));
      const meetingH1 = ((await page.textContent("header h1")) ?? "").trim();
      check("meeting detail header title renders", meetingH1.length > 0, `got "${meetingH1}"`);
      const detailTabs = ["Agenda", "Participants", "Transcripts", "Action Items", "Deliverables"] as const;
      const addActionByTab: Record<(typeof detailTabs)[number], string> = {
        Agenda: "button-add-agenda",
        Participants: "button-add-participant",
        Transcripts: "button-add-transcript",
        "Action Items": "button-add-action-item",
        Deliverables: "button-add-deliverable",
      };
      for (const tabLabel of detailTabs) {
        await page.getByRole("button", { name: tabLabel, exact: true }).click();
        await page.waitForSelector(`[data-testid="${addActionByTab[tabLabel]}"]`, { timeout: 15000 });
        check(`meeting detail "${tabLabel}" tab renders its add action`, await page.isVisible(`[data-testid="${addActionByTab[tabLabel]}"]`));
      }
    } else {
      console.log("  SKIP meeting detail flow (no meetings in view)");
    }

    // Phase 3 — agreement lifecycle (badge + allowed transitions)
    await page.goto(`${baseURL}/agreements`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid^="row-agreement-"], [data-testid="button-empty-add-agreement"]', { timeout: 15000 });
    const agreementRows = await page.locator('[data-testid^="row-agreement-"]').count();
    if (agreementRows > 0) {
      const lifecycleButtons = await page.locator('[data-testid^="button-agreement-lifecycle-"]').count();
      check("agreement lifecycle transition buttons render", lifecycleButtons > 0, `got ${lifecycleButtons}`);
      const rowText = (await page.locator('[data-testid^="row-agreement-"]').first().textContent()) ?? "";
      const lifecycleShown = /draft|review|approved|signed|archived/i.test(rowText);
      check("agreement row shows lifecycle state", lifecycleShown, "no lifecycle state text in row");
    } else {
      console.log("  SKIP agreement lifecycle flow (no agreements in view)");
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

function jarMap(jar: ReturnType<typeof cookieJar>): Map<string, string> {
  const result = new Map<string, string>();
  const header = jar.header();
  for (const pair of header.split("; ")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    result.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return result;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});