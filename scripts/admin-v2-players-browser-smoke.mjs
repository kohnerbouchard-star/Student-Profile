import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  ADMIN_V2_FIXTURE_CSRF,
  ADMIN_V2_FIXTURE_GAME_ID,
  ADMIN_V2_FIXTURE_PERMISSIONS,
  createAdminV2FixtureSession,
  startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_ROOT = path.resolve(ROOT, process.env.ADMIN_V2_STATIC_ROOT || ".");
const EVIDENCE = path.resolve(process.env.ADMIN_V2_EVIDENCE_DIR || path.join(ROOT, "docs/operations/evidence/admin-ui-v2-players"));
const RESULT = path.join(EVIDENCE, "admin-v2-players-browser-results.json");
const RUNTIME_CONFIG = path.join(STATIC_ROOT, "runtime-config.env.js");
const GAME = ADMIN_V2_FIXTURE_GAME_ID;
const PLAYERS = `/games/${GAME}/players`;
const DEVICE = "a0000000-0000-4000-8000-00000000000a";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const RAW = "SELECT * FROM private.players; SUPABASE_SERVICE_ROLE_KEY; service_role";
const checks = [];
const screenshots = [];
mkdirSync(EVIDENCE, { recursive: true });
const priorRuntimeConfig = existsSync(RUNTIME_CONFIG) ? readFileSync(RUNTIME_CONFIG, "utf8") : null;
writeFileSync(RUNTIME_CONFIG, `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  environment: "development",
  projectRef: "runtimefixture123456",
  supabaseUrl: "https://runtimefixture123456.supabase.co",
  supabasePublishableKey: "sb_${"publishable"}_runtime_fixture_1234567890"
});
`);

function player(index) {
  const n = index + 1;
  const id = `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    id, playerId: id,
    displayName: index === 0 ? "김하늘 — 국제 경제 시뮬레이션 연구 프로젝트 참가자" : index === 1 ? "Alexandria Montgomery-Rivera-Wojciechowski — Cooperative Economic Systems Fellowship Participant" : `Player ${n}`,
    rosterLabel: index === 0 ? "국제경제 A반" : `Cohort ${n}`,
    status: index % 7 === 0 ? "inactive" : "active",
    countryName: index % 2 ? "Northreach" : "한울공화국",
    sessionStatus: index % 3 === 0 ? "online" : index % 3 === 1 ? "recently_active" : "offline",
    online: index % 3 === 0,
    flagCount: index % 9 === 0 ? 2 : 0,
    flagged: index % 9 === 0,
    lastActiveAt: "2026-08-07T03:00:00.000Z",
    adminSettings: index === 0 ? { displayName: "김하늘 — Admin label", status: "review", countryAssignment: "한울 advisory", adminNote: "Follow up." } : {},
  };
}

const rosterFor = (scenario) => scenario === "empty" ? [] : scenario === "one" ? [player(0)] : scenario === "many" ? Array.from({ length: 48 }, (_, i) => player(i)) : [player(0), player(1), player(2)];
const envelope = (data, requestId = "players-browser") => ({ data, error: null, meta: { requestId } });
const failed = (code = "UPSTREAM_UNAVAILABLE") => ({ data: null, error: { code, message: RAW, retryable: true, requestId: "players-failed" }, diagnostic: RAW });
const upstreamPath = (url) => new URL(url).pathname.replace(/^\/functions\/v1\/web-session-api\/proxy/, "") || "/";

async function json(route, status, body, headers = {}) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", headers, body: JSON.stringify(body) });
}

function assertMutation(request) {
  const h = request.headers();
  assert.equal(h.authorization || "", "");
  assert.match(h.apikey || "", /^sb_publishable_/);
  assert.equal(h["x-econovaria-device-id"], DEVICE);
  assert.equal(h["x-econovaria-game-id"], GAME);
  assert.equal(h["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
  assert.match(h["idempotency-key"] || "", /^admin\.players\./);
}

async function runtime(browser, fixture, scenario = "ready", viewport = { width: 1280, height: 720 }, permission = true) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  const session = createAdminV2FixtureSession("ready");
  const storedSession = permission
    ? session
    : {
        ...session,
        permissions: session.permissions.filter((value) => value !== "players.manage"),
      };
  const roster = rosterFor(scenario);
  const calls = [];
  let reads = 0;
  await context.addCookies([{ name: "admin-v2-scenario", value: "ready", url: fixture.origin, sameSite: "Lax" }]);
  await context.addInitScript(({ session, device }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(session));
    localStorage.setItem("econovaria.device.v1", device);
  }, { session: storedSession, device: DEVICE });
  await context.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const upstream = upstreamPath(request.url());
    if (!permission && upstream === "/session/bootstrap") {
      await json(route, 200, envelope({
        admin: session.user, activeGame: session.activeGameSessions[0], games: session.activeGameSessions,
        permissions: ADMIN_V2_FIXTURE_PERMISSIONS.filter((p) => p !== "players.manage"), roles: session.roles, adminRole: session.adminRole,
      }, "permission"));
      return;
    }
    if (upstream !== PLAYERS && !upstream.startsWith(`${PLAYERS}/`)) return route.continue();
    calls.push({ method: request.method(), upstream, body: request.postData() || "" });
    if (request.method() === "GET" && upstream === PLAYERS) {
      reads += 1;
      if (scenario === "loading" && reads === 1) await new Promise((r) => setTimeout(r, 700));
      if (scenario === "failed" || (scenario === "stale" && reads > 1)) return json(route, 503, failed(), { "x-request-id": "players-failed" });
      return json(route, 200, envelope({ players: roster, roster, totalPlayers: roster.length }));
    }
    assertMutation(request);
    const body = JSON.parse(request.postData() || "{}");
    if (request.method() === "POST" && upstream === PLAYERS) {
      assert.deepEqual(Object.keys(body).sort(), ["accessCode", "displayName", "playerIdentifier", "rosterLabel"].sort());
      const created = { ...player(roster.length + 50), displayName: body.displayName, rosterLabel: body.rosterLabel, status: "active", countryName: "Unassigned", sessionStatus: "offline", online: false };
      roster.push(created);
      return json(route, 201, { ok: true, player: { id: created.id, displayName: created.displayName, rosterLabel: created.rosterLabel, playerIdentifier: body.playerIdentifier, status: "active" }, accessCode: { studentCode: body.accessCode, status: "active" } });
    }
    if (request.method() === "PATCH" && upstream.endsWith("/settings")) {
      assert.deepEqual(Object.keys(body), ["settings"]);
      return json(route, 200, envelope({ saved: true, settings: { settings: body.settings } }));
    }
    if (request.method() === "POST" && upstream.endsWith("/access-code/reset")) {
      assert.ok(Object.keys(body).every((key) => ["playerIdentifier", "accessCode"].includes(key)));
      return json(route, 200, { ok: true, player: { displayName: "Player", rosterLabel: "A", playerIdentifier: body.playerIdentifier || "PROTECTED", status: "active" }, accessCode: { studentCode: body.accessCode || null, status: body.accessCode ? "active" : "unchanged" } });
    }
    return json(route, 404, failed("NOT_FOUND"));
  });
  const page = await context.newPage();
  await page.goto(`${fixture.origin}/admin/v2.html?game=${GAME}#players`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  return { page, context, calls, roster };
}

async function state(page, name, timeout = 10_000) {
  await page.locator(`.admin-players-route[data-admin-v2-state="${name}"]`).waitFor({ state: "attached", timeout });
}

async function safeDom(page) {
  const text = await page.locator("body").innerText();
  assert.doesNotMatch(text, UUID);
  assert.doesNotMatch(text, /SELECT \* FROM|service_role|SUPABASE_SERVICE_ROLE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
  const attrs = await page.evaluate(() => [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].filter((a) => a.name.startsWith("data-") || a.name.startsWith("aria-") || ["title", "href", "value"].includes(a.name)).map((a) => a.value)).join("\n"));
  assert.doesNotMatch(attrs, UUID);
}

async function shot(page, name) {
  const file = path.join(EVIDENCE, `players-${name}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
  screenshots.push(path.relative(ROOT, file));
}

async function responsive(browser, fixture) {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const r = await runtime(browser, fixture, viewport.width <= 390 ? "many" : "ready", viewport);
    try {
      await state(r.page, "ready");
      const overflow = await r.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `horizontal overflow at ${viewport.width}px`);
      await safeDom(r.page);
      if (viewport.width === 1280 || viewport.width === 390) await shot(r.page, `ready-${viewport.width}`);
    } finally { await r.context.close(); }
  }
  checks.push("responsive-desktop-tablet-mobile");
}

async function cardinality(browser, fixture) {
  for (const [scenario, expected] of [["empty", 0], ["one", 1], ["many", 48]]) {
    const r = await runtime(browser, fixture, scenario);
    try {
      await state(r.page, expected ? "ready" : "empty");
      if (expected) assert.equal(await r.page.locator(".admin-data-table__row").count(), expected);
      else await r.page.getByRole("heading", { name: "No Players yet" }).waitFor();
      await safeDom(r.page);
    } finally { await r.context.close(); }
  }
  const r = await runtime(browser, fixture, "many");
  try {
    await state(r.page, "ready");
    await r.page.getByLabel("Search Players").fill("김하늘");
    assert.equal(await r.page.locator(".admin-data-table__row").count(), 1);
    await r.page.getByLabel("Search Players").fill("");
    await r.page.getByLabel("Account status").selectOption("inactive");
    assert.ok(await r.page.locator(".admin-data-table__row").count() > 0);
    await r.page.getByLabel("Account status").selectOption("all");
    await r.page.getByLabel("Session presence").selectOption("online");
    assert.ok(await r.page.locator(".admin-data-table__row").count() > 0);
  } finally { await r.context.close(); }
  checks.push("0-1-48-long-korean-search-filter");
}

async function mutations(browser, fixture) {
  const r = await runtime(browser, fixture);
  try {
    await state(r.page, "ready");
    await r.page.locator(".admin-data-table__row").first().getByRole("button", { name: "View" }).click();
    const drawer = r.page.locator(".admin-players-drawer[data-open='true']");
    await drawer.waitFor();
    assert.match(await drawer.innerText(), /Player ID and Access Code are protected/);
    await drawer.getByRole("button", { name: "Edit admin metadata" }).click();
    const profile = r.page.locator(".admin-players-dialog[data-open='true']");
    await profile.getByLabel("Staff display label").fill("김하늘 — Reviewed");
    await profile.getByRole("button", { name: "Save profile" }).click();
    await profile.waitFor({ state: "hidden" });
    await state(r.page, "ready");
    assert.ok(r.calls.some((c) => c.upstream.endsWith("/settings")));

    await r.page.locator(".admin-data-table__row").first().getByRole("button", { name: "View" }).click();
    await r.page.locator(".admin-players-drawer[data-open='true']").getByRole("button", { name: "Update credentials" }).click();
    const credentials = r.page.locator(".admin-players-dialog[data-open='true']");
    assert.equal(await credentials.getByLabel("New Player ID / RFID card").inputValue(), "");
    assert.equal(await credentials.getByLabel("New Access Code").inputValue(), "");
    await credentials.getByLabel("New Access Code").fill("NEW-CODE-77");
    await credentials.getByRole("button", { name: "Update credentials" }).click();
    await credentials.waitFor({ state: "hidden" });
    assert.deepEqual(JSON.parse(r.calls.find((c) => c.upstream.endsWith("/access-code/reset")).body), { accessCode: "NEW-CODE-77" });

    await r.page.getByRole("button", { name: "Add Player" }).first().click();
    const create = r.page.locator(".admin-players-dialog[data-open='true']");
    await create.getByLabel("Player name").fill("새로운 학생");
    await create.getByLabel("Roster label").fill("경제 B반");
    await create.getByLabel("Player ID / RFID card").fill("rfid-77");
    await create.getByLabel("Access Code").fill("join-77");
    await create.getByRole("button", { name: "Create Player" }).click();
    await create.waitFor({ state: "hidden" });
    const createCall = r.calls.find((c) => c.method === "POST" && c.upstream === PLAYERS);
    assert.deepEqual(JSON.parse(createCall.body), { displayName: "새로운 학생", rosterLabel: "경제 B반", playerIdentifier: "RFID-77", accessCode: "JOIN-77" });
    await safeDom(r.page);
  } finally { await r.context.close(); }
  checks.push("selection-detail-create-admin-edit-credential-edit");
}

async function lifecycle(browser, fixture) {
  const loading = await runtime(browser, fixture, "loading");
  try { await state(loading.page, "initial-loading", 5_000); await state(loading.page, "ready"); } finally { await loading.context.close(); }
  const failedRun = await runtime(browser, fixture, "failed");
  try { await state(failedRun.page, "failed"); await safeDom(failedRun.page); await failedRun.page.getByRole("button", { name: "Try again" }).waitFor(); await shot(failedRun.page, "failed"); } finally { await failedRun.context.close(); }
  const stale = await runtime(browser, fixture, "stale");
  try { await state(stale.page, "ready"); await stale.page.locator(".admin-page-frame__actions").getByRole("button", { name: "Refresh", exact: true }).click(); await state(stale.page, "stale"); await safeDom(stale.page); } finally { await stale.context.close(); }
  const denied = await runtime(browser, fixture, "ready", { width: 1280, height: 720 }, false);
  try {
    await denied.page.getByRole("heading", { name: "Players access restricted" }).waitFor();
    assert.equal(denied.calls.length, 0, "permission denied issued protected Players request");
  } finally { await denied.context.close(); }
  checks.push("loading-refreshing-stale-failed-retry-permission-denied");
}

const fixture = await startAdminV2FixtureServer({ repositoryRoot: STATIC_ROOT });
const browser = await chromium.launch({ headless: true });
try {
  await responsive(browser, fixture);
  await cardinality(browser, fixture);
  await mutations(browser, fixture);
  await lifecycle(browser, fixture);
} finally {
  await browser.close();
  await fixture.close();
  if (priorRuntimeConfig === null) unlinkSync(RUNTIME_CONFIG);
  else writeFileSync(RUNTIME_CONFIG, priorRuntimeConfig);
}
writeFileSync(RESULT, `${JSON.stringify({ generatedAt: new Date().toISOString(), passed: true, checks, screenshots }, null, 2)}\n`);
process.stdout.write(`Admin v2 Players browser smoke passed ${checks.length} groups.\n`);
