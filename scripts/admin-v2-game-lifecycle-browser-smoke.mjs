import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ADMIN_V2_FIXTURE_GAME_ID as GAME, ADMIN_V2_FIXTURE_CSRF as CSRF,
  createAdminV2FixtureSession, startAdminV2FixtureServer } from "./admin-v2-browser-fixture-server.mjs";

const OUT = process.env.ADMIN_V2_LIFECYCLE_EVIDENCE_DIR || "/tmp/admin-v2-lifecycle-evidence";
mkdirSync(OUT, { recursive: true });
const fixture = await startAdminV2FixtureServer({ repositoryRoot: process.env.ADMIN_V2_STATIC_ROOT });
const browser = await chromium.launch({ headless: true });
const results = [];
const actions = { draft: ["start", "revoke_sessions"], active: ["pause", "end", "revoke_sessions"], paused: ["resume", "end", "revoke_sessions"], ended: ["archive", "revoke_sessions"], archived: [] };
const nextState = { start: "active", pause: "paused", resume: "active", end: "ended", archive: "archived" };
const json = (route, status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

async function runtime({ initial = "active", mode = "ready", permissions, mobile = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, reducedMotion: "reduce", colorScheme: "dark" });
  const session = createAdminV2FixtureSession("ready");
  if (permissions) session.permissions = permissions;
  await context.addCookies([{ name: "admin-v2-scenario", value: "ready", url: fixture.origin }, { name: "admin-v2-run", value: randomUUID(), url: fixture.origin }]);
  await context.addInitScript(({ session }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(session));
    localStorage.setItem("econovaria.device.v1", "a0000000-0000-4000-8000-00000000000a");
  }, { session });
  const page = await context.newPage(); const errors = []; const writes = []; const reads = []; let state = initial; let version = 1; let activeSessions = 2; let rejected = false;
  let release; const gate = new Promise((r) => { release = r; }); const applied = new Map();
  const model = () => ({ state, operationalStatus: state === "active" ? "active" : ["ended", "archived"].includes(state) ? "archived" : "disabled", version, joinCodeStatus: state === "draft" ? "pending" : ["ended", "archived"].includes(state) ? "revoked" : "active", allowedActions: actions[state], activePlayerSessions: activeSessions, privateOwnerId: GAME, serverCredential: "private-lifecycle-canary" });
  page.on("pageerror", (e) => errors.push(e.message));
  if (permissions) await page.route("**/functions/v1/web-session-api/proxy/session/bootstrap", (route) => json(route, 200, { data: { admin: session.user, activeGame: session.activeGameSessions[0], games: session.activeGameSessions, permissions: session.permissions, roles: session.roles, adminRole: session.adminRole } }));
  await page.route("**/functions/v1/web-session-api/proxy/games/*/**", async (route) => {
    const req = route.request(); const suffix = new URL(req.url()).pathname.split(`/games/${GAME}/`)[1];
    if (!(suffix === "lifecycle" || suffix?.startsWith("lifecycle/") || suffix === "sessions/revoke")) return route.fallback();
    if (req.method() === "GET") {
      reads.push(suffix);
      return json(route, 200, { data: { lifecycle: mode === "malformed" ? { ...model(), version: 0 } : model() } });
    }
    const action = suffix === "sessions/revoke" ? "revoke_sessions" : suffix.split("/").at(-1);
    const body = req.postDataJSON(); const headers = req.headers(); writes.push({ action, body, headers });
    assert.equal(headers["x-econovaria-csrf-token"], CSRF); assert.equal(headers["x-econovaria-game-id"], GAME);
    assert.equal(headers.authorization, undefined); assert.equal(headers["idempotency-key"], body.idempotencyKey);
    assert.deepEqual(Object.keys(body).sort(), ["expectedVersion", "idempotencyKey"]);
    if (mode === "hold") await gate;
    if (mode === "denied") return json(route, 403, { error: { code: "PERMISSION_DENIED", message: "private SQL diagnostic" } });
    if (mode === "conflict" && !rejected) {
      rejected = true; version += 1;
      return json(route, 409, { error: { code: "game_lifecycle_version_conflict", message: "private SQL lifecycle diagnostic" } });
    }
    if (applied.has(body.idempotencyKey)) return json(route, 200, { data: { ...applied.get(body.idempotencyKey), outcome: "replayed" } });
    assert.equal(body.expectedVersion, version); assert(actions[state].includes(action));
    state = nextState[action] || state; version += 1;
    if (["end", "revoke_sessions"].includes(action)) activeSessions = 0;
    const data = { action, outcome: "applied", lifecycle: model() }; applied.set(body.idempotencyKey, data);
    if (mode === "ambiguous" && !rejected) { rejected = true; return json(route, 503, { error: { code: "UPSTREAM_UNAVAILABLE", message: "private SQL lifecycle diagnostic" } }); }
    return json(route, 200, { data });
  });
  await page.goto(`${fixture.origin}/admin/v2.html?game=${GAME}#overview`, { waitUntil: "domcontentloaded" });
  if (!permissions || permissions.includes("game.read")) await page.getByRole("heading", { name: "Overview", exact: true, level: 1 }).waitFor();
  else await page.getByText("Overview access restricted", { exact: true }).waitFor();
  const panel = page.getByRole("region", { name: "Game lifecycle", exact: true });
  if (!permissions || permissions.includes("game.read")) await panel.locator('[aria-label="Lifecycle actions"]').waitFor({ state: "attached" });
  const ready = () => page.waitForFunction(() => document.querySelector('[aria-label="Game lifecycle"]')?.dataset.lifecycleState === "ready");
  if (mode !== "malformed" && (!permissions || permissions.includes("game.read"))) await ready();
  return { page, panel, writes, reads, errors, release, ready, async close() { release(); await context.close(); } };
}
async function check(name, callback) {
  try { await callback(); results.push({ name, status: "pass" }); }
  catch (e) { results.push({ name, status: "fail", error: e.stack }); throw e; }
}
async function perform(r, label, phrase) {
  await r.panel.getByRole("button", { name: label, exact: true }).click();
  const dialog = r.page.getByRole("alertdialog", { name: label.replace(/^Retry: /, ""), exact: true });
  const confirm = dialog.getByRole("button", { name: label.replace(/^Retry: /, ""), exact: true });
  if (phrase) {
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByLabel(`Type ${phrase} to confirm`, { exact: true }).fill("wrong"); assert.equal(await confirm.isDisabled(), true);
    await dialog.getByLabel(`Type ${phrase} to confirm`, { exact: true }).fill(phrase);
  }
  await confirm.click(); await dialog.waitFor({ state: "detached" });
}
try {
  await check("start, pause and resume use reviewed server versions; Cancel and Escape send nothing", async () => {
    const r = await runtime({ initial: "draft" });
    try {
      await r.page.screenshot({ path: path.join(OUT, "lifecycle-desktop.png"), fullPage: false });
      await r.panel.getByRole("button", { name: "Start game", exact: true }).click();
      await r.page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(r.writes.length, 0);
      await r.panel.getByRole("button", { name: "Start game", exact: true }).click(); await r.page.keyboard.press("Escape");
      assert.equal(await r.page.getByRole("alertdialog").count(), 0); assert.equal(r.writes.length, 0);
      await perform(r, "Start game"); await perform(r, "Pause mutations"); await perform(r, "Resume game");
      assert.deepEqual(r.writes.map((w) => w.action), ["start", "pause", "resume"]);
      assert.deepEqual(r.writes.map((w) => w.body.expectedVersion), [1, 2, 3]); assert.deepEqual(r.errors, []);
    } finally { await r.close(); }
  });
  await check("destructive controls require phrases and terminal state exposes no new transitions", async () => {
    const r = await runtime(); try {
      await perform(r, "Revoke Player sessions", "REVOKE"); await perform(r, "End game", "END"); await perform(r, "Archive game", "ARCHIVE");
      assert.deepEqual(r.writes.map((w) => w.action), ["revoke_sessions", "end", "archive"]);
      assert.equal(await r.panel.locator('[aria-label="Lifecycle actions"] button').count(), 0);
      assert.match(await r.panel.innerText(), /Archived/);
      assert(!/private-lifecycle-canary|10000000-0000/.test(await r.panel.innerText()));
    } finally { await r.close(); }
  });
  await check("lost acknowledgment retries one exact idempotent transition after renewed review", async () => {
    const r = await runtime({ mode: "ambiguous" }); try {
      await perform(r, "Revoke Player sessions", "REVOKE");
      assert.match(await r.panel.innerText(), /result could not be confirmed/);
      assert.equal(await r.panel.getByRole("button", { name: "End game", exact: true }).count(), 0);
      await perform(r, "Retry: Revoke Player sessions", "REVOKE");
      assert.deepEqual(r.writes[0].body, r.writes[1].body);
      assert.match(await r.panel.innerText(), /previously requested change is confirmed/);
      assert(!/private SQL/.test(await r.page.locator("body").innerText()));
    } finally { await r.close(); }
  });
  await check("version conflict blocks stale actions until refresh and new review", async () => {
    const r = await runtime({ mode: "conflict" }); try {
      await perform(r, "Pause mutations"); assert.match(await r.panel.innerText(), /game changed/);
      assert.equal(await r.panel.locator('[aria-label="Lifecycle actions"] button').count(), 0);
      await r.panel.getByRole("button", { name: "Refresh lifecycle", exact: true }).click(); await r.ready();
      await perform(r, "Pause mutations");
      assert.equal(r.writes[1].body.expectedVersion, 2);
      assert.notEqual(r.writes[0].body.idempotencyKey, r.writes[1].body.idempotencyKey);
    } finally { await r.close(); }
  });
  await check("pending write serializes clicks and survives route departure without leaving an orphan dialog", async () => {
    const r = await runtime({ mode: "hold" }); try {
      await r.panel.getByRole("button", { name: "Pause mutations", exact: true }).click();
      await r.page.getByRole("alertdialog").getByRole("button", { name: "Pause mutations", exact: true }).evaluate((b) => { b.click(); b.click(); });
      await r.page.waitForFunction(() => document.querySelector('[aria-label="Game lifecycle"]')?.dataset.lifecycleState === "saving");
      assert.equal(r.writes.length, 1);
      await r.page.evaluate(() => { location.hash = "players"; });
      await r.page.getByRole("alertdialog").waitFor({ state: "detached" });
      await r.page.goBack(); await r.panel.waitFor();
      assert.equal(await r.panel.getByRole("button", { name: "Refresh lifecycle", exact: true }).isDisabled(), true);
      r.release(); await r.ready(); assert.match(await r.panel.innerText(), /Paused/); assert.equal(r.writes.length, 1);
      await r.page.goForward(); await r.page.getByRole("heading", { level: 1, name: "Players", exact: true }).waitFor();
      assert.equal(await r.page.getByRole("alertdialog").count(), 0);
    } finally { await r.close(); }
  });
  await check("navigation dismisses an unsubmitted review without sending a transition", async () => {
    const r = await runtime(); try {
      await r.panel.getByRole("button", { name: "End game", exact: true }).click();
      await r.page.evaluate(() => { location.hash = "players"; }); await r.page.getByRole("alertdialog").waitFor({ state: "detached" });
      await r.page.goBack(); await r.panel.waitFor(); assert.equal(r.writes.length, 0);
      assert.equal(await r.page.locator("[inert]").count(), 0);
    } finally { await r.close(); }
  });
  await check("read-only permission displays state without write controls", async () => {
    const r = await runtime({ permissions: ["account.read", "game.read"] }); try {
      assert.match(await r.panel.innerText(), /cannot change/); assert.equal(await r.panel.locator('[aria-label="Lifecycle actions"] button').count(), 0); assert.equal(r.writes.length, 0);
    } finally { await r.close(); }
  });
  await check("missing read authority never requests lifecycle state", async () => {
    const r = await runtime({ permissions: ["account.read"] }); try {
      assert.equal(r.reads.length, 0); assert.equal(r.writes.length, 0); assert.equal(await r.panel.count(), 0);
    } finally { await r.close(); }
  });
  await check("server write denial clears available actions and shows only safe diagnostics", async () => {
    const r = await runtime({ mode: "denied" }); try {
      await perform(r, "Pause mutations");
      assert.match(await r.panel.innerText(), /do not have permission/);
      assert.equal(await r.panel.locator('[aria-label="Lifecycle actions"] button').count(), 0);
      assert(!/private SQL/.test(await r.panel.innerText())); assert.equal(r.writes.length, 1);
    } finally { await r.close(); }
  });
  await check("invalid lifecycle response fails closed without revealing payload fields", async () => {
    const r = await runtime({ mode: "malformed" }); try {
      await r.panel.getByRole("alert").waitFor(); assert.equal(await r.panel.locator('[aria-label="Lifecycle actions"] button').count(), 0);
      assert(!/private-lifecycle-canary|10000000-0000/.test(await r.panel.innerText()));
    } finally { await r.close(); }
  });
  await check("mobile layout and keyboard confirmation preserve the accepted Admin shell", async () => {
    const r = await runtime({ mobile: true }); try {
      await r.panel.screenshot({ path: path.join(OUT, "lifecycle-mobile.png") });
      assert.equal(await r.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await r.panel.getByRole("button", { name: "End game", exact: true }).click();
      await r.page.getByRole("alertdialog").screenshot({ path: path.join(OUT, "lifecycle-confirm-mobile.png") });
      for (let i = 0; i < 10; i += 1) { await r.page.keyboard.press("Tab"); assert.equal(await r.page.evaluate(() => Boolean(document.activeElement.closest('[role="alertdialog"]'))), true); }
      await r.page.keyboard.press("Escape"); assert.equal(r.writes.length, 0); assert.deepEqual(r.errors, []);
    } finally { await r.close(); }
  });
} finally {
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await browser.close(); await fixture.close();
}
console.log(JSON.stringify({ status: "pass", checks: results.length, evidence: OUT }));
