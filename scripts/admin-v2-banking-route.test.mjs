import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createBankingRouteHarness, bankingModel, bankingHistory } from "./fixtures/admin-banking-route-harness.mjs";

function ready({ model = bankingModel(), status = "ready", ...options } = {}) {
  const h = createBankingRouteHarness();
  const route = h.BankingRoute({ state: { status, data: model }, ...options });
  return { ...h, route, model };
}
function rowButton(h, action, row = 0) { return h.tables[0].cells[row].at(-1).children.find((node) => node.dataset.bankingAction === action); }
async function correction(options = {}) {
  const h = ready(options);
  await rowButton(h, "adjust").dispatch("click");
  return h;
}
async function review(h, { amount = "-10.5", reason = "  Synthetic correction  ", account = "0" } = {}) {
  h.fields.get("banking-account").value = account;
  h.fields.get("banking-adjustment-amount").value = amount;
  h.fields.get("banking-adjustment-reason").value = reason;
  await h.button("submit-adjustment").dispatch("click");
}

test("Banking public module links with its sole route export", async () => {
  assert.deepEqual(Object.keys(await import("../admin/v2/src/routes/banking/BankingRoute.js")), ["BankingRoute"]);
});

test("Banking extraction retains every original complete function including nested correction ownership", () => {
  // Recorded on unchanged main b77c9610 before any runtime extraction.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-banking-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/banking";
  const actual = {};
  for (const file of readdirSync(directory).filter((name) => /^Banking(?:Route|AccountCatalog|ActivityPanel|ViewHelpers)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8");
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      const body = source.slice(match.index, end).replace(/^export /, "");
      assert.equal(actual[match[1]], undefined, `Duplicate function ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(body).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
});

for (const status of ["initial-loading", "failed", "empty", "ready", "refreshing", "stale"]) {
  test(`Banking ${status} preserves accessible state and refresh ownership`, async () => {
    let calls = 0;
    const h = createBankingRouteHarness();
    h.BankingRoute({ state: { status, data: bankingModel(), error: { userMessage: "Unavailable", requestId: "safe-request", retryAfterSeconds: 9 } }, onRefresh: () => { calls += 1; } });
    const frame = h.frames[0], content = frame.options.content;
    assert.equal(frame.options.title, "Banking");
    assert.match(frame.options.description, /reason and confirmation/);
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    assert.equal(h.button("refresh").attrs.disabled, status === "refreshing");
    await h.button("refresh").dispatch("click");
    assert.equal(calls, 1);
    if (status === "initial-loading") assert.deepEqual(content.children[0].children.map((node) => node.kind), ["skeleton", "skeleton"]);
    if (status === "failed") {
      const error = content.children[0];
      assert.equal(error.kind, "error"); assert.equal(error.options.message, "Unavailable");
      assert.equal(error.options.requestId, "safe-request"); assert.equal(error.options.retryAfterSeconds, 9);
      await error.options.retry.onClick(); assert.equal(calls, 2);
    }
    if (status === "empty") { assert.equal(content.children[0].tag, "aside"); assert.equal(content.children[1].kind, "empty"); }
    if (status === "refreshing") assert.equal(content.children[0].children[0].attrs.role, "status");
    if (status === "stale") { assert.equal(content.children[0].kind, "stale"); await content.children[0].options.retry.onClick(); assert.equal(calls, 2); }
  });
}

test("Banking non-retryable failures offer no retry callback", () => {
  const h = createBankingRouteHarness();
  h.BankingRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(h.frames[0].options.content.children[0].options.retry, null);
});

test("Banking table, metrics, account formatting and public row keys remain intact", () => {
  const h = ready();
  const panels = h.frames[0].options.content.children[0].children;
  assert.deepEqual(panels.map((node) => node.className), ["admin-banking-route__summary", "admin-banking-route__contract-note", "admin-banking-route__controls", "admin-banking-route__catalog"]);
  assert.equal(panels[0].attrs["aria-label"], "Banking summary");
  assert.equal(panels[2].attrs["aria-label"], "Banking filters");
  assert.equal(panels[3].attrs["aria-label"], "Student bank accounts");
  const table = h.tables[0];
  assert.equal(table.options.caption, "Student Checking and Savings accounts");
  assert.deepEqual(table.options.columns.map((c) => c.key), ["displayName", "countryName", "status", "checking", "savings", "actions"]);
  assert.equal(table.options.columns[0].rowHeader, true);
  assert.equal(table.options.rowKey(h.model.players[0]), h.model.players[0].rowKey);
  assert.equal(table.cells[0][0].children[0].textContent, "가상 학생");
  assert.equal(table.cells[0][3].children[0].children[0].textContent, "1,250.5 LOC");
  assert.equal(table.cells[0][4].children[0].children[0].textContent, "0 LOC");
  assert.equal(table.cells[1][3].children[0].children[0].textContent, "−12 ALT");
  assert.match(table.cells[1][4].textContent, /Savings not available/);
});

test("Banking invalid initial currency resets and search/currency changes preserve callback values", async () => {
  const calls = [];
  const h = ready({ filters: { query: "", currency: "missing" }, onFiltersChange: (filters) => calls.push(filters) });
  assert.deepEqual(calls, [{ query: "", currency: "all" }, { query: "", currency: "all" }]);
  h.fields.get("banking-search").value = "  class A  ";
  await h.fields.get("banking-search").control.dispatch("input");
  assert.deepEqual(h.tables[0].rows, [h.model.players[0]]);
  assert.equal(calls.at(-1).query, "  class A  ");
  h.fields.get("banking-search").value = "";
  h.fields.get("banking-currency").value = "alt";
  await h.fields.get("banking-currency").control.dispatch("change");
  assert.deepEqual(h.tables[0].rows, [h.model.players[1]]);
  assert.deepEqual(calls.at(-1), { query: "", currency: "alt" });
});

test("Banking row actions preserve callback identity, availability and explanatory titles", async () => {
  const model = structuredClone(bankingModel());
  model.players.push({ ...model.players[0], rowKey: "missing-reference", resourceId: null });
  model.players.push({ ...model.players[0], rowKey: "missing-account", accounts: [] });
  const calls = []; const h = ready({ model, onSelectPlayer: (...args) => calls.push(args) });
  await rowButton(h, "activity").dispatch("click"); assert.deepEqual(calls, [[model.players[0]]]);
  assert.equal(rowButton(h, "adjust").attrs.disabled, false);
  assert.equal(rowButton(h, "adjust", 1).attrs.disabled, true);
  assert.match(rowButton(h, "adjust", 1).attrs.title, /only for active players/);
  assert.equal(rowButton(h, "activity", 2).attrs.disabled, true);
  assert.match(rowButton(h, "adjust", 2).attrs.title, /no public banking reference/);
  assert.match(rowButton(h, "adjust", 3).attrs.title, /no Checking or Savings account/);
});

for (const status of ["initial-loading", "failed", "empty", "ready", "refreshing", "stale"]) {
  test(`Banking ${status} activity keeps data, accessibility and close/retry callbacks`, async () => {
    const model = bankingModel(); let refreshed = 0, closed = 0;
    const h = ready({ model, selectedPlayer: model.players[0], historyState: { status, data: bankingHistory(), error: { userMessage: "Try later", retryAfterSeconds: 8 } }, onRefreshHistory: () => { refreshed += 1; }, onClosePlayer: () => { closed += 1; } });
    const panel = h.frames[0].options.content.children.at(-1), body = panel.children[1];
    assert.equal(panel.attrs["aria-label"], "가상 학생 banking activity");
    assert.equal(h.button("refresh-activity").attrs.disabled, status === "refreshing");
    await h.button("refresh-activity").dispatch("click"); await h.button("close-activity").dispatch("click");
    assert.equal(refreshed, 1); assert.equal(closed, 1);
    if (status === "initial-loading") assert.equal(body.children[0].kind, "skeleton");
    if (status === "failed") { assert.equal(body.children[0].options.retryAfterSeconds, 8); await body.children[0].options.retry.onClick(); assert.equal(refreshed, 2); }
    if (status === "empty") assert.equal(body.children[0].kind, "empty");
    if (["ready", "refreshing", "stale"].includes(status)) {
      const table = h.tables[1];
      assert.equal(table.options.caption, "Checking and Savings activity");
      assert.deepEqual(table.options.columns.map((c) => c.key), ["createdAt", "description", "accountType", "amount", "entryType"]);
      assert.equal(table.cells[0][3].textContent, "−25 LOC"); assert.equal(table.cells[1][3].textContent, "+25 LOC");
      assert.equal(table.cells[0][3].dataset.direction, "debit"); assert.equal(table.cells[1][3].dataset.direction, "credit");
    }
    if (status === "stale") { assert.equal(body.children[0].kind, "stale"); await body.children[0].options.retry.onClick(); assert.equal(refreshed, 2); }
  });
}

test("Banking correction dialog preserves form constraints, opener, initial focus and review-only submission", async () => {
  let writes = 0; const h = await correction({ onAdjust: () => { writes += 1; } });
  const dialog = h.dialogs[0];
  assert.equal(dialog.options.title, "Correct 가상 학생's balance");
  assert.strictEqual(dialog.opens[0], rowButton(h, "adjust"));
  assert.strictEqual(dialog.options.initialFocus(), h.fields.get("banking-account").control);
  assert.equal(h.fields.get("banking-adjustment-amount").control.attrs.step, "0.01");
  assert.equal(h.fields.get("banking-adjustment-reason").control.attrs.maxlength, "300");
  await review(h); assert.equal(writes, 0); assert.equal(h.confirmations.length, 1);
  assert.strictEqual(h.confirmations[0].opens[0], h.button("submit-adjustment"));
});

for (const [label, values, fields] of [
  ["empty", { amount: "", reason: "" }, ["Amount", "Reason"]],
  ["zero", { amount: "0" }, ["Amount"]],
  ["nonfinite", { amount: "Infinity" }, ["Amount"]],
  ["invalid account", { account: "99" }, ["Account"]],
  ["fractional index", { account: "0.5" }, ["Account"]],
  ["long reason", { reason: "X".repeat(301) }, ["Reason"]],
]) {
  test(`Banking correction rejects ${label} before confirmation or mutation`, async () => {
    let writes = 0; const h = await correction({ onAdjust: () => { writes += 1; } });
    await review(h, values);
    assert.deepEqual(h.validations[0].errors.map((error) => error.label), fields);
    assert.equal(h.validations[0].options.focus, true);
    assert.equal(h.confirmations.length, 0); assert.equal(writes, 0);
  });
}

for (const ok of [true, false]) {
  test(`Banking explicit confirmation preserves amount, account, trimmed reason and ${ok ? "success" : "failure"} ownership`, async () => {
    const calls = []; const h = await correction({ onAdjust: (...args) => { calls.push(args); return { ok }; } });
    await review(h);
    const confirm = h.confirmations[0];
    assert.equal(confirm.options.tone, "danger");
    assert.equal(confirm.options.confirmLabel, "Apply correction");
    assert.equal(confirm.options.message, "Apply −10.5 LOC to 가상 학생's Checking?");
    assert.equal(confirm.options.detail, "1,250.5 LOC → 1,240 LOC · Synthetic correction");
    assert.equal(await confirm.options.onConfirm(), ok);
    assert.deepEqual(calls, [[h.model.players[0], h.model.players[0].accounts[0], { amount: -10.5, reason: "Synthetic correction" }]]);
    await Promise.resolve();
    assert.deepEqual(h.dialogs[0].closes, ok ? ["saved"] : []);
    assert.equal(h.dialogs[0].destroyed, ok ? 1 : 0);
  });
}

test("Banking correction rejection stays with shared confirmation and never closes the form", async () => {
  const error = new Error("Synthetic failure"); const h = await correction({ onAdjust: async () => { throw error; } });
  await review(h);
  await assert.rejects(h.confirmations[0].options.onConfirm(), (value) => value === error);
  assert.deepEqual(h.dialogs[0].closes, []);
  assert.match(h.confirmations[0].options.failureMessage, /could not be applied/);
});

test("Banking cancellation, re-review, replacement and idempotent route destruction retain dialog ownership", async () => {
  let writes = 0; const h = await correction({ onAdjust: () => { writes += 1; } });
  await review(h); await review(h, { amount: "5", account: "1" });
  assert.equal(h.confirmations[0].destroyed, 1);
  assert.equal(h.confirmations[1].options.message, "Apply +5 LOC to 가상 학생's Savings?");
  await h.dialogs[0].options.footer.children[0].dispatch("click"); await Promise.resolve();
  assert.deepEqual(h.dialogs[0].closes, ["cancelled"]); assert.equal(h.confirmations[1].destroyed, 1);
  await rowButton(h, "adjust").dispatch("click");
  await rowButton(h, "adjust").dispatch("click");
  assert.equal(h.dialogs[1].destroyed, 1); assert.equal(h.dialogs[2].destroyed, 0);
  h.route.destroy(); h.route.destroy(); assert.equal(h.dialogs[2].destroyed, 1); assert.equal(writes, 0);
});

test("Banking delayed close cleanup cannot destroy a newer correction dialog", async () => {
  const h = await correction(); const first = h.dialogs[0];
  first.close("cancelled"); rowButton(h, "adjust").dispatch("click");
  await Promise.resolve();
  assert.equal(first.destroyed, 1); assert.equal(h.dialogs[1].destroyed, 0);
  h.route.destroy(); assert.equal(h.dialogs[1].destroyed, 1);
});

test("Banking browser qualification stays exact-head, pinned, read-only and mandatory", () => {
  const workflow = readFileSync(".github/workflows/admin-v2-banking.yml", "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: "22\.23\.1"/);
  assert.match(workflow, /npm@10\.9\.8/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /run: npm run test:admin-v2/);
  assert.match(workflow, /run: npx playwright install --with-deps chromium/);
  assert.match(workflow, /run: node scripts\/admin-v2-banking-browser-smoke\.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error|pull_request_target|workflow_dispatch|contents: write|secrets\./);
});

test("Banking browser correction controls accommodate the shared required-label annotation", () => {
  const runner = readFileSync("scripts/admin-v2-banking-browser-smoke.mjs", "utf8");
  for (const name of ["banking-account", "banking-adjustment-amount", "banking-adjustment-reason"]) {
    assert.ok(runner.includes(`dialog.locator('[name="${name}"]')`));
  }
  assert.ok(runner.includes('[data-admin-v2-layer="dialog"][data-open="true"]'));
  assert.ok(runner.includes('page.locator(".admin-banking-adjustment-form").count(), 0'));
  assert.doesNotMatch(runner, /getByLabel\("(?:Account|Correction amount|Teacher reason)", \{ exact: true \}\)/);
});

test("Banking browser fixture intercepts the configured HttpOnly BFF transport path", async () => {
  const { runInNewContext } = await import("node:vm");
  const { startAdminV2FixtureServer, ADMIN_V2_FIXTURE_GAME_ID: game } = await import("./admin-v2-browser-fixture-server.mjs");
  const { createAdminBffTransport } = await import("../admin/v2/src/api/admin-bff-transport.js");
  const { createBankingApiClient } = await import("../admin/v2/src/routes/banking/BankingApi.js");
  const fixture = await startAdminV2FixtureServer();
  try {
    const window = { location: new URL(`${fixture.origin}/admin/v2.html`) };
    const configuration = await (await fetch(`${fixture.origin}/runtime-config.env.js`)).text();
    runInNewContext(configuration, { window, URL });
    runInNewContext(readFileSync("frontend/src/core/runtime-config.js", "utf8"), { window, URL });
    let requestedUrl;
    const transport = createAdminBffTransport({
      selectedGameId: game,
      runtimeConfig: window.EconovariaRuntimeConfig,
      locationLike: window.location,
      storage: { getItem: () => "a0000000-0000-4000-8000-00000000000a" },
      fetchImpl: async (url) => {
        requestedUrl = new URL(url);
        return new Response(JSON.stringify({ data: { players: [] } }), { status: 200 });
      },
    });
    await createBankingApiClient({ fetchImpl: transport }).readBanking({ gameId: game });
    const runner = readFileSync("scripts/admin-v2-banking-browser-smoke.mjs", "utf8");
    const fixturePath = runner.match(/^const BASE = `([^`]+)`;/m)?.[1].replace("${GAME}", game);
    assert.equal(requestedUrl.origin, fixture.origin);
    assert.equal(fixturePath, requestedUrl.pathname, "Intercept the real configured BFF URL, not the API client's pre-transport alias");
  } finally {
    await fixture.close();
  }
});
