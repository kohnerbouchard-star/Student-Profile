import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ADMIN_V2_FIXTURE_GAME_ID, createAdminV2FixtureSession, startAdminV2FixtureServer } from "./admin-v2-browser-fixture-server.mjs";

// Real application, controller and shared components; Banking BFF responses are
// synthetic and intercepted locally. This does not certify a hosted ledger.
const GAME = ADMIN_V2_FIXTURE_GAME_ID;
const PLAYER = "b1000000-0000-4000-8000-000000000001";
const DEVICE = "a0000000-0000-4000-8000-00000000000a";
const BASE = `/functions/v1/web-session-api/proxy/games/${GAME}/banking/players`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const output = path.resolve(process.env.ADMIN_V2_EVIDENCE_DIR || "/tmp/admin-v2-banking-evidence");
const results = [];
mkdirSync(output, { recursive: true });
const players = [
  { id: PLAYER, displayName: "가상 학생", rosterLabel: "Class A", countryName: "Northreach", status: "active", balances: [
    { accountType: "checking", currencyCode: "LOC", balance: 1250.5 },
    { accountType: "savings", currencyCode: "LOC", balance: 0 },
  ] },
  { id: "b2000000-0000-4000-8000-000000000002", displayName: "Sample Student", countryName: "Southreach", status: "inactive", balances: [
    { accountType: "checking", currencyCode: "ALT", balance: -12 },
  ] },
];
const ledgerEntries = [{ account_type: "checking", amount: -25, currency_code: "LOC", entry_type: "debit", source_domain: "banking", source_action: "savings_transfer", created_at: "2026-11-10T02:00:00Z" }];
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
async function until(predicate, message) {
  const end = Date.now() + 10_000;
  while (!await predicate()) { assert.ok(Date.now() < end, message); await new Promise((resolve) => setTimeout(resolve, 20)); }
}
async function state(page, status) { await page.locator(`.admin-banking-route[data-admin-v2-state="${status}"]`).waitFor(); }
async function correction(page) {
  await page.getByRole("button", { name: "Correct balance", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Correct 가상 학생's balance", exact: true });
  await dialog.waitFor(); return dialog;
}
async function review(page, amount = "-10.5") {
  const dialog = page.getByRole("dialog", { name: "Correct 가상 학생's balance", exact: true });
  await dialog.locator('[name="banking-adjustment-amount"]').fill(amount);
  await dialog.locator('[name="banking-adjustment-reason"]').fill("Synthetic browser correction");
  await dialog.locator('[data-banking-action="submit-adjustment"]').click();
  const confirm = page.getByRole("alertdialog", { name: "Confirm balance correction", exact: true });
  await confirm.waitFor(); return confirm;
}
async function assertPresentation(page, fixture) {
  assert.equal(await page.locator('.admin-route-boundary[data-route="banking"][data-mode="source"]').count(), 1);
  assert.equal(await page.locator('[data-route="banking"][aria-current="page"]').count(), 1);
  await page.getByRole("heading", { level: 1, name: "Banking", exact: true }).waitFor();
  assert.equal(await page.locator('.admin-legacy-route, .admin-planned-route').count(), 0);
  const url = new URL(page.url());
  assert.equal(url.origin, fixture.origin); assert.equal(url.pathname, "/admin/v2.html");
  assert.equal(url.searchParams.get("game"), GAME); assert.equal(url.hash, "#banking");
  const exposure = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.body.querySelectorAll("*")].flatMap((node) => [...node.attributes].filter((a) => /^(?:aria-|data-)|^(?:title|href|src|action)$/.test(a.name)).map((a) => a.value)).join("\n"),
    viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
  }));
  assert.doesNotMatch(exposure.text, UUID); assert.doesNotMatch(exposure.attributes, UUID);
  assert.doesNotMatch(exposure.text, /service_role|SELECT \* FROM|backend\/supabase|\[object Object\]|\bNaN\b|\bInfinity\b/);
  assert.ok(exposure.document <= exposure.viewport + 1, "Document must not overflow horizontally");
  assert.ok(exposure.body <= exposure.viewport + 1, "Body must not overflow horizontally");
}

const fixture = await startAdminV2FixtureServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "dark" });
    const runId = randomUUID();
    await context.addCookies([{ name: "admin-v2-scenario", value: "ready", url: fixture.origin }, { name: "admin-v2-run", value: runId, url: fixture.origin }]);
    await context.addInitScript(({ session, device }) => {
      sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(session));
      localStorage.setItem("econovaria.device.v1", device);
    }, { session: createAdminV2FixtureSession("ready"), device: DEVICE });
    const page = await context.newPage();
    const requests = [], errors = [], httpFailures = [], failedRequests = [], resources = [];
    const mode = { read: "ready", holdRead: deferred(), holdMutation: null, failMutation: false };
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/^Failed to load resource: the server responded with a status of 503 /.test(message.text())) errors.push(message.text());
      else if (/content security policy|trusted\s*types?|refused to (?:execute|load|apply|connect)/i.test(message.text())) errors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (/\.(?:js|mjs|css)$/.test(pathname)) resources.push({ pathname, status: response.status(), mime: response.headers()["content-type"] || "" });
      if (response.status() >= 400) httpFailures.push({ pathname, status: response.status() });
    });
    await page.route(`${fixture.origin}${BASE}**`, async (route) => {
      const request = route.request(), url = new URL(request.url());
      const record = { method: request.method(), pathname: url.pathname, headers: request.headers(), body: request.postDataJSON() };
      requests.push(record);
      assert.equal(url.origin, fixture.origin); assert.equal(url.search, "");
      const respond = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === BASE && request.method() === "GET") {
        if (mode.holdRead) await mode.holdRead.promise;
        if (mode.read === "failed") return respond({ error: { code: "UPSTREAM_UNAVAILABLE", retryable: true, message: "SELECT * FROM private.accounts; service_role" } }, 503);
        return respond({ data: { players: mode.read === "empty" ? [] : players } });
      }
      if (url.pathname === `${BASE}/${PLAYER}/history-audit` && request.method() === "GET") return respond({ data: { ledgerEntries } });
      if (url.pathname === `${BASE}/${PLAYER}/ledger-adjustments` && request.method() === "POST") {
        if (mode.holdMutation) await mode.holdMutation.promise;
        return mode.failMutation
          ? respond({ error: { code: "UPSTREAM_UNAVAILABLE", retryable: true } }, 503)
          : respond({ data: { adjusted: true, outcome: "applied" } });
      }
      throw new Error(`Unexpected Banking request: ${record.method} ${record.pathname}`);
    });
    try {
      await page.goto(`${fixture.origin}/admin/v2.html?game=${GAME}#banking`);
      await until(() => requests.some((request) => request.method === "GET" && request.pathname === BASE), "Initial Banking read reaches the held BFF fixture");
      await state(page, "initial-loading");
      mode.holdRead.resolve(); mode.holdRead = null;
      await state(page, "ready");
      const gate = page.locator("#adminSessionGate"); if (await gate.count()) await gate.waitFor({ state: "detached" });
      await assertPresentation(page, fixture);
      assert.equal(await page.getByRole("button", { name: "Correct balance", exact: true }).nth(1).isDisabled(), true);
      await page.getByLabel("Search students", { exact: true }).fill("Class A");
      assert.equal(await page.locator('.admin-banking-route__catalog tbody tr').count(), 1);
      await page.getByLabel("Search students", { exact: true }).fill("");
      await page.getByLabel("Currency", { exact: true }).selectOption("alt");
      assert.equal(await page.locator('.admin-banking-route__catalog tbody tr').count(), 1);
      await page.getByLabel("Currency", { exact: true }).selectOption("all");
      await page.getByRole("button", { name: "Activity", exact: true }).first().click();
      await page.getByRole("table", { name: "Checking and Savings activity", exact: true }).waitFor();
      await page.locator('[data-banking-action="close-activity"]').click();
      assert.equal(await page.locator('.admin-banking-route__activity-panel').count(), 0);
      const posts = () => requests.filter((r) => r.method === "POST");
      let dialog = await correction(page);
      await until(() => dialog.locator('[name="banking-account"]').evaluate((node) => node === document.activeElement), "Initial account focus");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" }); assert.equal(posts().length, 0);
      await until(() => page.getByRole("button", { name: "Correct balance", exact: true }).first().evaluate((node) => node === document.activeElement), "Cancel restores opener focus");
      dialog = await correction(page);
      await dialog.locator('[data-banking-action="submit-adjustment"]').click();
      await dialog.getByText("Enter a non-zero amount.", { exact: true }).first().waitFor();
      assert.equal(await page.getByRole("alertdialog").count(), 0); assert.equal(posts().length, 0);
      let confirm = await review(page);
      await until(() => confirm.getByRole("button", { name: "Cancel", exact: true }).evaluate((node) => node === document.activeElement), "Danger confirmation starts on Cancel");
      assert.match(await confirm.innerText(), /1,250\.5 LOC → 1,240 LOC/);
      assert.equal(posts().length, 0);
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      await confirm.waitFor({ state: "hidden" });
      assert.equal(await dialog.locator('[name="banking-adjustment-amount"]').inputValue(), "-10.5");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      const discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?", exact: true });
      await discard.waitFor(); await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
      assert.equal(await dialog.locator('[name="banking-adjustment-amount"]').inputValue(), "-10.5");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
      await dialog.waitFor({ state: "hidden" }); assert.equal(posts().length, 0);
      await correction(page); confirm = await review(page);
      mode.failMutation = true; mode.holdMutation = deferred();
      await confirm.getByRole("button", { name: "Apply correction", exact: true }).evaluate((button) => { button.click(); button.click(); });
      await until(() => posts().length === 1, "One pending adjustment request");
      assert.equal(await confirm.getByRole("button", { name: "Apply correction", exact: true }).isDisabled(), true);
      mode.holdMutation.resolve(); mode.holdMutation = null;
      await until(() => confirm.getByRole("button", { name: "Apply correction", exact: true }).isEnabled(), "Failed correction keeps review available");
      assert.equal(posts().length, 1); assert.equal(await confirm.isVisible(), true);
      mode.failMutation = false;
      await confirm.getByRole("button", { name: "Apply correction", exact: true }).click();
      await confirm.waitFor({ state: "hidden" }); await state(page, "ready");
      assert.equal(posts().length, 2);
      assert.deepEqual(posts()[0].body, posts()[1].body, "Retry retains exact request/idempotency ownership");
      const { idempotencyKey, ...payload } = posts()[1].body;
      assert.match(idempotencyKey, /^admin\.banking\.adjust\./);
      assert.deepEqual(payload, { amount: -10.5, reason: "Synthetic browser correction", accountType: "checking", currencyCode: "LOC" });
      await correction(page);
      await page.evaluate(() => { location.hash = "overview"; });
      await page.locator('.admin-route-boundary[data-route="overview"][data-mode="source"]').waitFor();
      assert.equal(await page.locator('[data-admin-v2-layer="dialog"][data-open="true"]').count(), 0);
      assert.equal(await page.locator(".admin-banking-adjustment-form").count(), 0);
      await page.goBack(); await state(page, "ready");
      mode.holdRead = deferred();
      await page.locator('[data-banking-action="refresh"]').click(); await state(page, "refreshing");
      mode.read = "failed"; mode.holdRead.resolve(); mode.holdRead = null; await state(page, "stale");
      await assertPresentation(page, fixture);
      mode.read = "empty"; await page.locator('[data-banking-action="refresh"]').click(); await state(page, "empty");
      await page.getByRole("heading", { name: "No students available", exact: true }).waitFor();
      mode.read = "failed"; await page.reload(); await state(page, "failed");
      mode.read = "ready"; await page.getByRole("button", { name: "Try again", exact: true }).click(); await state(page, "ready");
      await assertPresentation(page, fixture);
      for (const request of requests) {
        assert.equal(request.headers.authorization || "", "", "No browser-readable bearer token");
        assert.equal(request.headers["x-econovaria-device-id"], DEVICE);
        if (request.method === "GET") assert.equal(request.body, null);
      }
      assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
      assert.ok(httpFailures.length >= 3, "Expected controlled mutation/read failure coverage");
      assert.ok(httpFailures.every((r) => r.status === 503 && [BASE, `${BASE}/${PLAYER}/ledger-adjustments`].includes(r.pathname)));
      assert.ok(resources.some((r) => r.pathname.endsWith("BankingRoute.js")));
      assert.ok(resources.some((r) => r.pathname.endsWith("banking.css")));
      assert.ok(resources.every((r) => r.status >= 200 && r.status < 400 && (/\.css$/.test(r.pathname) ? /^text\/css/.test(r.mime) : /^(?:application|text)\/javascript/.test(r.mime))));
      await page.screenshot({ path: path.join(output, `banking-${viewport.width}.png`), fullPage: false });
      results.push({ viewport, status: "passed", bankingRequests: requests.length, simulatedAdjustments: posts().length });
    } finally { mode.holdRead?.resolve(); mode.holdMutation?.resolve(); await context.close(); }
  }
  writeFileSync(path.join(output, "banking-browser-results.json"), `${JSON.stringify({ passed: true, results }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ passed: true, results })}\n`);
} finally { await browser?.close(); await fixture.close(); }
