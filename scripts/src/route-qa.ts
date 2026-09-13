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
  { path: "/intelligence", testid: "link-nav-intelligence", title: "Intelligence" },
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

    // Phase 4.3 — overview scorecard strip (requires prior seed-scorecard run)
    const demoCountries = (await fetch(`${baseURL}/api/countries`, { headers: { accept: "application/json" } }).then((r) => (r.ok ? r.json() : [])).catch(() => [])) as { id: number; code: string; name: string }[];
    const scor = demoCountries.find((c) => c.code === "SCOR");
    const scer = demoCountries.find((c) => c.code === "SCER");

    if (scor && scer) {
      await page.goto(`${baseURL}/`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="overview-scorecard-strip"]', { timeout: 15000 });
      check("overview scorecard strip visible", await page.isVisible('[data-testid="overview-scorecard-strip"]'));
      const statCard = page.locator('[data-testid="metric-countries"]');
      if (await statCard.count()) {
        const stripBox = await page.locator('[data-testid="overview-scorecard-strip"]').boundingBox();
        const metricBox = await statCard.boundingBox();
        const stripAbove = stripBox && metricBox && stripBox.y < metricBox.y && stripBox.y + stripBox.height <= metricBox.y + 1;
        check("scorecard strip renders above stat cards", stripAbove === true, `strip.y=${stripBox?.y} metric.y=${metricBox?.y}`);
      }

      const scorCard = page.locator('[data-testid^="scorecard-card-"]').filter({ hasText: "Scorecards Demo" }).first();
      await scorCard.waitFor({ state: "visible", timeout: 15000 });
      const scorCardText = (await scorCard.textContent()) ?? "";
      check("SCOR card shows score 49", /49/.test(scorCardText), `got "${scorCardText.replaceAll("\n", " ").trim()}"`);
      await scorCard.click();
      await page.waitForURL(`**/country/${scor.id}?tab=analytics`, { timeout: 15000 });
      check("strip click deep-links to ?tab=analytics", true);
      await page.waitForSelector('[data-testid="tab-analytics"]', { timeout: 15000 });
      const tabClass = (await page.locator('[data-testid="tab-analytics"]').getAttribute("class")) ?? "";
      check("analytics tab active after deep-link", tabClass.includes("bg-[hsl(var(--primary))]"), "active class missing");
      await page.waitForSelector('[data-testid="analytics-score-ring"]', { timeout: 15000 });
      check("analytics score ring renders", await page.isVisible('[data-testid="analytics-score-ring"]'));

      // Country analytics assertions on SCOR
      const scorPct = ((await page.locator('[data-testid="analytics-completion-pct"]').textContent()) ?? "").trim();
      const scorSla = ((await page.locator('[data-testid="analytics-sla-rate"]').textContent()) ?? "").trim();
      const scorFailure = ((await page.locator('[data-testid="analytics-failure-index"]').textContent()) ?? "").trim();
      check("SCOR completion 64.3", scorPct === "64.3%", `got "${scorPct}"`);
      check("SCOR sla 37.5", scorSla === "37.5%", `got "${scorSla}"`);
      check("SCOR failure index 57.1", scorFailure === "57.1%", `got "${scorFailure}"`);
      const failureRows = await page.locator('[data-testid^="analytics-failure-row-"]').count();
      check("SCOR failure board has >= 8 rows", failureRows >= 8, `got ${failureRows}`);
      const clusterCount = await page.locator('[data-testid^="analytics-cluster-"]').count();
      check("SCOR clustering rail renders", clusterCount > 0, `got ${clusterCount}`);

      // SCER (empty) shows No data
      await page.goto(`${baseURL}/country/${scer.id}?tab=analytics`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="scorecard-no-data"]', { timeout: 15000 });
      check("SCER renders No data badge", await page.isVisible('[data-testid="scorecard-no-data"]'));
    } else {
      console.log("  SKIP scorecard strip flow (run seed-scorecard first)");
    }

    // Phase 5 — intelligence source verification (requires prior seed-intelligence run)
    type IntelFinding = {
      id: number;
      topic: string;
      headline: string;
      confidence: number;
      stage: string;
      applied: boolean;
      reviewNote: string | null;
      sourceTier: number | null;
      targetId: number | null;
      field: string | null;
      value: string | null;
    };
    type IntelSourceRow = { id: number; name: string; kind: string; tier: number; baseUrl: string; status: string };
    type IntelFeedItem = { id: number; kind: string; title: string; entityType: string | null; entityId: number | null; isRead: boolean };
    const intelFindings = (await fetch(`${baseURL}/api/intelligence/findings`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { items: IntelFinding[] } | null;
    const intelSources = (await fetch(`${baseURL}/api/intelligence/sources`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { items: IntelSourceRow[] } | null;
    const govChange = intelFindings?.items.find((f) => f.stage === "open" && f.topic === "government_change");
    const election = intelFindings?.items.find((f) => f.stage === "open" && f.topic === "election");
    const diplomatic = intelFindings?.items.find((f) => f.stage === "open" && f.topic === "diplomatic_news");
    const rejected = intelFindings?.items.find((f) => f.stage === "rejected");

    if (intelFindings && intelSources && govChange && election && diplomatic && rejected) {
      const waitFindingStage = async (id: number, stage: string) => {
        for (let i = 0; i < 30; i++) {
          const row = (await fetch(`${baseURL}/api/intelligence/findings/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)) as IntelFinding | null;
          if (row && row.stage === stage) return true;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
      };

      // Render checks
      await page.goto(`${baseURL}/intelligence`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="sources-table"]', { timeout: 15000 });
      const intelH1 = ((await page.textContent("header h1")) ?? "").trim();
      check("intelligence header title renders", intelH1 === "Intelligence", `got "${intelH1}"`);
      const intelNavClass = (await page.locator('[data-testid="link-nav-intelligence"]').getAttribute("class")) ?? "";
      check("intelligence nav item highlighted as active", intelNavClass.includes("bg-[hsl(var(--sidebar-accent))]"), "active class missing");
      const tierOrder = intelSources.items.map((s) => s.tier);
      check("intelligence sources tier-sorted 1→5", tierOrder.every((t, i) => i === 0 || t >= tierOrder[i - 1]), `got ${tierOrder.join(",")}`);
      const sourceRowCount = await page.locator('[data-testid^="source-row-"]').count();
      check("sources table lists every registered source", sourceRowCount === intelSources.items.length, `got ${sourceRowCount}`);
      const domTiers: number[] = [];
      for (const s of intelSources.items) {
        const raw = (await page.locator(`[data-testid="source-tier-${s.id}"]`).textContent()) ?? "";
        domTiers.push(Number(raw.replace(/\D/g, "")));
      }
      check("sources table renders rows ordered tier 1→5", domTiers.every((t, i) => i === 0 || t >= domTiers[i - 1]), `got ${domTiers.join(",")}`);

      const govCard = page.locator(`[data-testid="finding-card-${govChange.id}"]`);
      await govCard.waitFor({ state: "visible", timeout: 15000 });
      const govText = (await govCard.textContent()) ?? "";
      check("open queue shows the government_change finding", govText.includes("Cabinet reshuffle"), govText.slice(0, 80));
      check("finding card shows topic chip", govText.includes("Government change"), govText.slice(0, 80));
      check("finding card shows tier chip", govText.includes("Tier 1"), govText.slice(0, 80));
      check("finding card shows confidence gauge", /80%/.test(govText), govText.slice(0, 80));
      check("open finding shows approve action", await page.locator(`[data-testid="button-approve-${govChange.id}"]`).isVisible());
      check("open finding shows reject action", await page.locator(`[data-testid="button-reject-${govChange.id}"]`).isVisible());
      const applyChecked = await page.locator(`[data-testid="checkbox-apply-${govChange.id}"]`).isChecked();
      check("apply checkbox pre-checked when applicable", applyChecked, "expected checked");

      const dipCard = page.locator(`[data-testid="finding-card-${diplomatic.id}"]`);
      await dipCard.waitFor({ state: "visible", timeout: 15000 });
      check("non-applicable finding shows no apply checkbox", (await page.locator(`[data-testid="checkbox-apply-${diplomatic.id}"]`).count()) === 0, "checkbox unexpectedly rendered");

      await page.click('[data-testid="button-tab-rejected"]');
      const rejCard = page.locator(`[data-testid="finding-card-${rejected.id}"]`);
      await rejCard.waitFor({ state: "visible", timeout: 15000 });
      check("rejected finding visible under Rejected tab", await rejCard.isVisible());
      check("rejected finding shows review note", ((await rejCard.textContent()) ?? "").includes("Unable to confirm"), "no note text");
      await page.click('[data-testid="button-tab-open"]');

      // Bell deep-link: new_finding → /intelligence?focus=<id> with highlight
      const intelFeed = (await fetch(`${baseURL}/api/notifications`, { headers: { accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { unreadCount: number; items: IntelFeedItem[] } | null;
      const newFindingItem = intelFeed?.items?.find((i) => i.kind === "new_finding" && !i.isRead);
      if (intelFeed && newFindingItem && newFindingItem.entityId != null) {
        await page.goto(`${baseURL}/`, { waitUntil: "load" });
        await page.waitForSelector('[data-testid="button-notifications"]', { timeout: 15000 });
        const badge = page.locator('[data-testid="notifications-unread-badge"]');
        await badge.waitFor({ state: "visible", timeout: 15000 });
        const badgeText = ((await badge.textContent()) ?? "").trim();
        check("bell unread badge reflects reconciled feed", badgeText === String(intelFeed.unreadCount), `got "${badgeText}" want ${intelFeed.unreadCount}`);
        await page.click('[data-testid="button-notifications"]');
        await page.waitForSelector(`[data-testid="notifications-item-${newFindingItem.id}"]`, { timeout: 15000 });
        await page.click(`[data-testid="notifications-item-${newFindingItem.id}"]`);
        await page.waitForURL(`**/intelligence?focus=${newFindingItem.entityId}`, { timeout: 15000 });
        check("new_finding click deep-links to /intelligence?focus=<id>", true);
        await page.waitForSelector(`[data-testid="finding-card-${newFindingItem.entityId}"]`, { timeout: 15000 });
        const focusedClass = (await page.locator(`[data-testid="finding-card-${newFindingItem.entityId}"]`).getAttribute("class")) ?? "";
        check("focused finding is ring-highlighted", focusedClass.includes("ring-2"), "ring class missing");
      } else {
        console.log("  SKIP new_finding bell deep-link flow (run seed-intelligence first)");
      }

      // Direct-navigation highlight
      await page.goto(`${baseURL}/intelligence?focus=${election.id}`, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="finding-card-${election.id}"]`, { timeout: 15000 });
      const directClass = (await page.locator(`[data-testid="finding-card-${election.id}"]`).getAttribute("class")) ?? "";
      check("?focus=<id> highlight works on direct navigation", directClass.includes("ring-2"), "ring class missing");

      // Approve & apply the government_change finding
      await page.goto(`${baseURL}/intelligence`, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="button-approve-${govChange.id}"]`, { timeout: 15000 });
      await page.click(`[data-testid="button-approve-${govChange.id}"]`);
      check("approve & apply reaches approved stage", await waitFindingStage(govChange.id, "approved"));
      await page.getByTestId(`finding-card-${govChange.id}`).filter({ hasText: "Applied" }).waitFor({ state: "visible", timeout: 15000 });
      check("approved finding shows Applied badge", true);
      const countriesAfter = (await fetch(`${baseURL}/api/countries`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])) as { code: string; governmentType: string | null }[];
      const scorAfter = countriesAfter.find((c) => c.code === "SCOR");
      check("SCOR governmentType applied to parliamentary", scorAfter?.governmentType === "parliamentary republic", `got "${scorAfter?.governmentType}"`);
      const appliedEvents = (await fetch(`${baseURL}/api/intelligence/change-events?findingId=${govChange.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { items: { field: string; beforeValue: string | null; afterValue: string | null; applied: boolean }[] } | null;
      check("change event recorded for applied finding", appliedEvents?.items?.length === 1, `got ${appliedEvents?.items?.length}`);
      const firstEvent = appliedEvents?.items?.[0];
      check(
        "change event carries field + before/after",
        firstEvent?.field === "governmentType" && firstEvent.beforeValue === "presidential republic" && firstEvent.afterValue === "parliamentary republic",
        JSON.stringify(firstEvent),
      );

      // Approve without apply (non-applicable finding)
      await page.click(`[data-testid="button-approve-${diplomatic.id}"]`);
      check("non-applicable approve reaches approved stage", await waitFindingStage(diplomatic.id, "approved"));
      const dipEvents = (await fetch(`${baseURL}/api/intelligence/change-events?findingId=${diplomatic.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { items: unknown[] } | null;
      check("non-applicable approve records no change event", (dipEvents?.items?.length ?? 0) === 0, `got ${dipEvents?.items?.length}`);
    } else {
      console.log("  SKIP intelligence verification flow (run seed-intelligence first)");
    }

    // Phase 4.4 — header bell notifications panel (requires prior seed-notify run)
    type FeedItem = { id: number; kind: string; title: string; countryId: number | null; isRead: boolean };
    const notifFeed = (await fetch(`${baseURL}/api/notifications`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { unreadCount: number; items: FeedItem[] } | null;
    const posItem = notifFeed?.items?.find((i) => i.kind === "position_change" && i.title.includes("Position Demo"));
    const metItem = notifFeed?.items?.find((i) => i.kind === "meeting_upcoming");

    if (notifFeed && posItem) {
      await page.goto(`${baseURL}/`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="button-notifications"]', { timeout: 15000 });
      const badge = page.locator('[data-testid="notifications-unread-badge"]');
      if (notifFeed.unreadCount > 0) {
        await badge.waitFor({ state: "visible", timeout: 15000 });
        const badgeText = ((await badge.textContent()) ?? "").trim();
        check("bell unread badge shows reconciled count", badgeText === String(notifFeed.unreadCount), `got "${badgeText}"`);
      } else {
        check("bell unread badge hidden when count is zero", (await badge.count()) === 0, "badge unexpectedly shown");
      }

      await page.click('[data-testid="button-notifications"]');
      await page.waitForSelector('[data-testid="notifications-panel"]', { timeout: 15000 });
      check("bell opens notifications panel", await page.isVisible('[data-testid="notifications-panel"]'));
      const itemCount = await page.locator('[data-testid^="notifications-item-"]').count();
      check("notifications rows render", itemCount > 0, `got ${itemCount}`);
      const panelText = (await page.locator('[data-testid="notifications-panel"]').textContent()) ?? "";
      check("seeded position_change title present", panelText.includes("Position Demo"), panelText.slice(0, 140));
      check("seeded meeting_upcoming title present", Boolean(metItem) && panelText.includes("Upcoming meeting"), panelText.slice(0, 140));

      const posCountry = posItem.countryId ?? ((await fetch(`${baseURL}/api/countries`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])) as { code: string; id: number }[]).find((c) => c.code === "POSN")?.id;
      if (metItem && posCountry) {
        await page.click(`[data-testid="notifications-item-${posItem.id}"]`);
        await page.waitForURL(`**/country/${posCountry}?tab=government`, { timeout: 15000 });
        check("notification click deep-links to ?tab=government", true);
        await page.waitForSelector('[data-testid="tab-government"]', { timeout: 15000 });
        const govClass = (await page.locator('[data-testid="tab-government"]').getAttribute("class")) ?? "";
        check("government tab active after deep-link", govClass.includes("bg-[hsl(var(--primary))]"), "active class missing");
      } else {
        console.log("  SKIP notification deep-link flow (missing posItem country or meeting seed)");
      }

      await page.goto(`${baseURL}/`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="button-notifications"]', { timeout: 15000 });
      await page.click('[data-testid="button-notifications"]');
      await page.waitForSelector('[data-testid="notifications-panel"]', { timeout: 15000 });
      const markAll = page.locator('[data-testid="notifications-mark-all-read"]');
      if (await markAll.count()) {
        await markAll.click();
        await page.waitForTimeout(900);
        const feedAfter = (await fetch(`${baseURL}/api/notifications`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as { unreadCount: number; items: FeedItem[] } | null;
        check("mark-all-read clears unread count", feedAfter?.unreadCount === 0, `got ${feedAfter?.unreadCount}`);
        const openBadge = await page.locator('[data-testid="notifications-unread-badge"]').count();
        check("unread badge hidden after mark-all-read", openBadge === 0, `got ${openBadge}`);
        if (feedAfter && feedAfter.items.length === 0 && feedAfter.unreadCount === 0) {
          await page.click('[data-testid="button-notifications"]');
          await page.waitForSelector('[data-testid="notifications-empty"]', { timeout: 15000 });
          check("empty state shown when no alerts remain", await page.isVisible('[data-testid="notifications-empty"]'));
        } else {
          check("read rows remain listed after mark-all-read", (feedAfter?.items.length ?? 0) > 0, "no rows after mark-all-read");
        }
      } else {
        console.log("  SKIP mark-all-read flow (mark-all button not rendered)");
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      check("Escape closes the panel", (await page.locator('[data-testid="notifications-panel"]').count()) === 0, "panel still open after Escape");
    } else {
      console.log("  SKIP notifications panel flow (run seed-notify first)");
    }

    // Country workspace detail page (read-only tab checks)
    await page.goto(`${baseURL}/countries`, { waitUntil: "load" });
    await page.waitForSelector('[data-testid^="card-country-"]', { timeout: 15000 });
    // Get the first country's ID from the card's testid
    const firstCountryTestId = await page.locator('[data-testid^="card-country-"]').first().getAttribute("data-testid");
    const countryId = firstCountryTestId?.replace("card-country-", "");
    const ownerChips = await page.locator('[data-testid="country-primary-owner"]').count();
    check("no primary-owner chip when unassigned (demo)", ownerChips === 0, `got ${ownerChips}`);
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
        await page.waitForSelector('[data-testid="assignments-block"]', { timeout: 15000 });
        check('overview tab shows "Assignments" block', true);
        const roleRows = await page.locator('[data-testid^="assignment-role-"]').count();
        check("assignments block shows four assignee roles", roleRows === 4, `got ${roleRows}`);
        const unassignedText = ((await page.locator('[data-testid="assignments-block"]').textContent()) ?? "");
        check("each unassigned role shows a placeholder", (unassignedText.match(/Unassigned/g) ?? []).length >= 4, `got "${unassignedText.slice(0, 120)}"`);
      }
      if (tab.id === "documents") {
        await page.waitForSelector('[data-testid="button-add-doc"]', { timeout: 15000 });
        check('documents tab shows "Add document" button', true);
      }
      if (tab.id === "news") {
        await page.waitForSelector('[data-testid="button-add-news"]', { timeout: 15000 });
        check('news tab shows "Add news" button', true);
      }
      if (tab.id === "tasks") {
        await page.waitForSelector('[data-testid="button-add-task"]', { timeout: 15000 });
        check('tasks tab shows "Add task" button', true);
        await page.click('[data-testid="button-add-task"]');
        await page.waitForSelector('[data-testid="select-task-action-area"]', { timeout: 15000 });
        const taskAreaOptions = await page.locator('[data-testid="select-task-action-area"] option').count();
        check("task modal action-area select lists five areas", taskAreaOptions === 5, `got ${taskAreaOptions}`);
        const taskCadenceOptions = await page.locator('[data-testid="select-task-cadence"] option').count();
        check("task modal cadence select lists daily + weekly", taskCadenceOptions === 2, `got ${taskCadenceOptions}`);
        const taskStatusOptions = await page.locator('[data-testid="select-task-status"] option').count();
        check("task modal status select lists three statuses", taskStatusOptions === 3, `got ${taskStatusOptions}`);
        await page.click('[data-testid="button-cancel-task"]');
        await page.waitForTimeout(200);
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