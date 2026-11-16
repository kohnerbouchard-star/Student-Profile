import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createCraftingRouteHarness, craftingModel } from "./fixtures/admin-crafting-route-harness.mjs";

function ready(options = {}) {
  const harness = createCraftingRouteHarness();
  const model = craftingModel();
  const route = harness.CraftingRoute({ state: { status: "ready", data: model }, ...options });
  return { ...harness, route, model };
}

function formOf(harness) { return harness.dialogs.at(-1).options.content; }
function setFields(harness, values) {
  Object.entries(values).forEach(([name, value]) => { harness.fields.get(name).value = value; });
}

test("Crafting public module links and keeps its sole route export", async () => {
  const module = await import("../admin/v2/src/routes/crafting/CraftingRoute.js");
  assert.deepEqual(Object.keys(module), ["CraftingRoute"]);
});

test("Crafting extraction retains every original function body", () => {
  // Recorded on unchanged main a29f4439 before extraction. Import/export wiring
  // is exercised separately; these hashes prohibit incidental behavior edits.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-crafting-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/crafting";
  const actual = {};
  for (const file of readdirSync(directory).filter((name) => /^Crafting(?:Route|Dialogs|JobsPanel|OversightPanels|ViewHelpers)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8");
    const matches = [...source.matchAll(/^(?:export )?function (\w+)\(/gm)];
    for (const match of matches) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      const body = source.slice(match.index, end).replace(/^export /, "");
      assert.equal(actual[match[1]], undefined, `Duplicate function ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(body).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
});

for (const status of ["initial-loading", "failed", "ready", "empty", "refreshing", "stale"]) {
  test(`Crafting ${status} preserves state content and refresh ownership`, async () => {
    let refreshed = 0;
    const harness = createCraftingRouteHarness();
    const error = { userMessage: "Unavailable", retryable: true, requestId: "request", retryAfterSeconds: 10 };
    const route = harness.CraftingRoute({
      state: { status, data: ["initial-loading", "failed"].includes(status) ? null : craftingModel(), error },
      onRefresh: () => { refreshed += 1; },
    });
    const content = route.options.content;
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    assert.equal(route.options.title, "Crafting Operations");
    assert.equal(harness.button("refresh").attrs.disabled, status === "refreshing");
    await harness.button("refresh").dispatch("click");
    assert.equal(refreshed, 1);
    if (status === "initial-loading") assert.equal(content.children[0].kind, "skeleton");
    if (status === "failed") {
      assert.equal(content.children[0].options.message, error.userMessage);
      assert.equal(content.children[0].options.requestId, error.requestId);
      await content.children[0].options.retry.onClick();
      assert.equal(refreshed, 2);
    }
    if (status === "stale") {
      assert.equal(content.children[0].kind, "stale");
      assert.equal(content.children[0].options.message, error.userMessage);
    }
    if (status === "refreshing") assert.equal(content.children[0].attrs.role, "status");
    route.destroy();
  });
}

test("Crafting failed nonretryable state has no retry action", () => {
  const harness = createCraftingRouteHarness();
  const route = harness.CraftingRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(route.options.content.children[0].options.retry, null);
});

test("Crafting oversight panel order, tables and row identities stay unchanged", () => {
  const { route, tables, model } = ready();
  const panels = route.options.content.children[0].children;
  assert.deepEqual(panels.map((panel) => panel.attrs["aria-labelledby"] || panel.attrs["aria-label"]), [
    "Crafting summary", "admin-crafting-boundary-title", "Crafting content pack", "admin-crafting-recipes-title",
    "admin-crafting-jobs-title", "admin-crafting-supply-title", "admin-crafting-effects-title", "admin-crafting-integrity-title",
  ]);
  assert.deepEqual(tables.map((table) => table.rows.length), [1, 2, 1, 1]);
  assert.strictEqual(tables[0].rows, model.recipes);
  assert.strictEqual(tables[2].rows, model.supply);
  assert.strictEqual(tables[3].rows, model.effects);
  assert.equal(tables[1].options.rowKey(model.jobs[0]), "failed");
  assert.deepEqual(panels.at(-1).children[1].children.map((node) => node.dataset.state), ["clear", "attention", "clear", "attention", "clear"]);
});

test("Crafting filters preserve initial notification, raw query and case-insensitive matching", async () => {
  const changes = [];
  const harness = ready({ filters: { query: " sensor ", status: "all" }, onFiltersChange: (value) => changes.push(value) });
  const table = harness.table("Crafting job records");
  assert.deepEqual(changes, [{ query: " sensor ", status: "all" }]);
  assert.strictEqual(table.rows[0], harness.model.jobs[0]);
  harness.fields.get("crafting-search").value = " ZED ";
  await harness.fields.get("crafting-search").control.dispatch("input");
  assert.strictEqual(table.rows[0], harness.model.jobs[1]);
  harness.fields.get("crafting-status").value = "failed";
  await harness.fields.get("crafting-status").control.dispatch("change");
  assert.equal(table.rows.length, 0);
  assert.deepEqual(changes.at(-1), { query: " ZED ", status: "failed" });
});

test("Crafting recovery keeps job, outcome, opener and deferred dialog cleanup", async () => {
  const calls = [];
  const harness = ready({ onRecover: async (...args) => { calls.push(args); return { ok: true }; } });
  const opener = harness.button("requeue");
  await opener.dispatch("click");
  const dialog = harness.dialogs[0];
  assert.strictEqual(dialog.opener, opener);
  assert.strictEqual(dialog.options.initialFocus(), harness.fields.get("reason").control);
  harness.fields.get("reason").value = "  Safe retry  ";
  await formOf(harness).dispatch("submit");
  assert.strictEqual(calls[0][0], harness.model.jobs[0]);
  assert.deepEqual(calls[0][1], { outcome: "requeue", reason: "Safe retry" });
  assert.deepEqual(dialog.closes, ["committed"]);
  assert.equal(dialog.destroyed, 0);
  harness.flush();
  assert.equal(dialog.destroyed, 1);
  harness.route.destroy();
  assert.equal(dialog.destroyed, 1);
});

for (const reason of ["ab", "x".repeat(1001)]) {
  test(`Crafting recovery rejects reason length ${reason.length} without mutation`, async () => {
    let called = false;
    const harness = ready({ onRecover: async () => { called = true; } });
    await harness.button("release-and-fail").dispatch("click");
    harness.fields.get("reason").value = reason;
    await formOf(harness).dispatch("submit");
    assert.equal(called, false);
    assert.match(harness.fields.get("reason").error, /3 through 1000/);
    assert.equal(harness.fields.get("reason").control.focusCount, 1);
    assert.deepEqual(harness.dialogs[0].busy, []);
  });
}

for (const failure of ["reported", "throw"]) {
  test(`Crafting recovery ${failure} failure retains dialog and clears busy`, async () => {
    const harness = ready({ onRecover: async () => {
      if (failure === "throw") throw new Error("private diagnostic");
      return { ok: false, error: { userMessage: "Denied" } };
    } });
    await harness.button("release-and-fail").dispatch("click");
    harness.fields.get("reason").value = "Reason";
    await formOf(harness).dispatch("submit");
    assert.equal(harness.dialogs[0].isOpen(), true);
    assert.deepEqual(harness.dialogs[0].busy, [true, false]);
    assert.equal(formOf(harness).children.at(-1).textContent, failure === "throw" ? "The recovery operation could not be committed." : "Denied");
  });
}

test("Crafting supply edit preserves read-only identity, numeric defaults and focus", async () => {
  const harness = ready();
  const opener = harness.button("adjust-supply");
  await opener.dispatch("click");
  assert.equal(harness.fields.get("itemKey").readOnly, true);
  assert.equal(harness.fields.get("itemKey").value, "sensor");
  assert.equal(harness.fields.get("availableQuantity").value, 4);
  assert.equal(harness.fields.get("eventMultiplier").control.min, "0.5");
  assert.equal(harness.fields.get("routeMultiplier").control.max, "4");
  assert.strictEqual(harness.dialogs[0].options.initialFocus(), harness.fields.get("scarcityBand").control);
  assert.strictEqual(harness.dialogs[0].opener, opener);
});

const invalidSupply = [
  ["itemKey", "<unsafe>"], ["countryCode", "US"], ["availableQuantity", "1.5"],
  ["availableQuantity", "-1"], ["availableQuantity", "9007199254740992"],
  ["eventMultiplier", ""], ["eventMultiplier", "0.49"], ["routeMultiplier", "4.01"],
  ["sourceEventKey", "bad/key"], ["expiresAt", "not-a-date"],
];
for (const [field, value] of invalidSupply) {
  test(`Crafting invalid supply ${field}=${value} stops before review and command`, async () => {
    let called = false;
    const harness = ready({ onApplySupply: async () => { called = true; } });
    await harness.button("supply").dispatch("click");
    setFields(harness, { itemKey: "sensor", [field]: value });
    await formOf(harness).dispatch("submit");
    assert.ok(harness.fields.get(field).error);
    assert.equal(harness.reviews.length, 0);
    assert.equal(called, false);
  });
}

test("Crafting supply review requires confirmation and preserves normalized command payload", async () => {
  const calls = [];
  const harness = ready({ onApplySupply: async (...args) => { calls.push(args); return { ok: true }; } });
  await harness.button("supply").dispatch("click");
  assert.strictEqual(harness.dialogs[0].options.initialFocus(), harness.fields.get("itemKey").control);
  setFields(harness, { itemKey: " SENSOR ", countryCode: " lum ", sourceEventKey: " event.001 " });
  const pending = formOf(harness).dispatch("submit");
  assert.equal(calls.length, 0);
  const review = harness.reviews[0];
  assert.equal(review.options.changes[0].before, "No existing override");
  await review.accept();
  await pending;
  assert.deepEqual(calls, [["sensor", { countryCode: "LUM", scarcityBand: "available", availableQuantity: null, eventMultiplier: 1, routeMultiplier: 1, sourceEventKey: "event.001", expiresAt: null }]]);
  assert.equal(review.destroyed, 1);
  assert.deepEqual(harness.dialogs[0].closes, ["committed"]);
});

test("Crafting cancelled supply review leaves editor open and never writes", async () => {
  let called = false;
  const harness = ready({ onApplySupply: async () => { called = true; } });
  await harness.button("adjust-supply").dispatch("click");
  const pending = formOf(harness).dispatch("submit");
  harness.reviews[0].cancel();
  await pending;
  assert.equal(called, false);
  assert.equal(harness.dialogs[0].isOpen(), true);
  assert.match(harness.reviews[0].options.changes[0].before, /Scarcity: Constrained/);
});

test("Crafting failed supply command preserves confirmation failure contract", async () => {
  const harness = ready({ onApplySupply: async () => ({ ok: false }) });
  await harness.button("adjust-supply").dispatch("click");
  const pending = formOf(harness).dispatch("submit");
  await assert.rejects(harness.reviews[0].accept(), /CRAFTING_SUPPLY_FAILED/);
  assert.equal(harness.dialogs[0].isOpen(), true);
  harness.reviews[0].cancel();
  await pending;
});

test("Crafting destruction is idempotent, clears owned dialogs and prevents reopening", async () => {
  const harness = ready();
  await harness.button("supply").dispatch("click");
  await harness.button("requeue").dispatch("click");
  harness.route.destroy();
  harness.route.destroy();
  assert.deepEqual(harness.dialogs.map((dialog) => dialog.destroyed), [1, 1]);
  await harness.button("supply").dispatch("click");
  await harness.button("requeue").dispatch("click");
  assert.equal(harness.dialogs.length, 2);
});
