import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createWorldRouteHarness, worldModel } from "./fixtures/admin-world-route-harness.mjs";

function ready({ model = worldModel(), status = "ready", ...handlers } = {}) {
  const harness = createWorldRouteHarness();
  const route = harness.WorldManagementRoute({ state: { status, data: model }, ...handlers });
  return { ...harness, route, model };
}

test("World public module links and retains its sole route export", async () => {
  const module = await import("../admin/v2/src/routes/world-management/WorldManagementRoute.js");
  assert.deepEqual(Object.keys(module), ["WorldManagementRoute"]);
});

test("World extraction preserves every original function body", () => {
  // Frozen from unchanged main c616ece3. This supplements executed import and
  // callback characterization; it is not a replacement for browser acceptance.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-world-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/world-management";
  const actual = {};
  for (const file of readdirSync(directory).filter((name) => /^World(?:ManagementRoute|ViewHelpers|OverviewPanels|CampaignPanels|GeographyPanels)\.js$/.test(name))) {
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

for (const status of ["initial-loading", "failed", "ready", "empty", "refreshing", "stale"]) {
  test(`World ${status} preserves content, accessible state and refresh callbacks`, async () => {
    let refreshed = 0;
    const harness = createWorldRouteHarness();
    const error = { userMessage: "Unavailable", retryable: true, requestId: "request", retryAfterSeconds: 10 };
    const route = harness.WorldManagementRoute({
      state: { status, data: ["initial-loading", "failed"].includes(status) ? null : worldModel(), error },
      onRefresh: () => { refreshed += 1; },
    });
    const content = route.options.content;
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    assert.equal(route.options.title, "World Management");
    assert.equal(harness.button("refresh").attrs.disabled, status === "refreshing");
    await harness.button("refresh").dispatch("click");
    assert.equal(refreshed, 1);
    if (status === "initial-loading") assert.equal(content.children[0].kind, "skeleton");
    if (status === "failed") {
      assert.equal(content.children[0].options.message, error.userMessage);
      assert.equal(content.children[0].options.requestId, error.requestId);
      assert.equal(content.children[0].options.retryAfterSeconds, 10);
      await content.children[0].options.retry.onClick();
      assert.equal(refreshed, 2);
    }
    if (status === "empty") assert.equal(content.children[0].kind, "empty");
    if (status === "stale") {
      assert.equal(content.children[0].kind, "stale");
      assert.equal(content.children[0].options.message, error.userMessage);
      await content.children[0].options.retry.onClick();
      assert.equal(refreshed, 2);
    }
    if (status === "refreshing") assert.equal(content.children[0].attrs.role, "status");
    if (["ready", "stale", "refreshing"].includes(status)) {
      for (const action of ["campaign-pause", "campaign-emergency-disable", "effect-recover", "arrival-correct", "route-close"]) {
        assert.equal(harness.button(action).attrs.disabled, status !== "ready", action);
      }
      assert.equal(harness.nodes.find((node) => node.tag === "select").attrs.disabled, status !== "ready");
    }
    route.destroy();
    route.destroy();
    assert.ok(harness.reviews.every((review) => review.destroyed === 1));
  });
}

test("World failed nonretryable state exposes no retry action", () => {
  const harness = createWorldRouteHarness();
  const route = harness.WorldManagementRoute({ state: { status: "failed", error: { retryable: false } } });
  assert.equal(route.options.content.children[0].options.retry, null);
});

test("World panel order, section links, row identities and column order stay stable", () => {
  const h = ready();
  const panels = h.route.options.content.children[0].children;
  assert.deepEqual(panels.map((panel) => panel.attrs["aria-label"] || panel.attrs.id || panel.children[0]?.children?.[0]?.children?.[0]?.textContent), [
    "World summary", "World Management sections", "world-configuration", "Countries & regions", "Currency supervision",
    "world-campaign", "world-effects", "Arrival configuration", "world-geography", "world-travel", "Residency oversight",
  ]);
  assert.deepEqual(panels[1].children.map((link) => [link.textContent, link.attrs.href]), [
    ["Configuration", "#world-configuration"], ["Campaign", "#world-campaign"], ["Effects", "#world-effects"],
    ["Geography", "#world-geography"], ["Travel & residency", "#world-travel"],
  ]);
  const expected = [
    ["World countries", h.model.countries, ["countryId", "locationCount", "residencyCount", "pendingResidencyCount", "currencies"]],
    ["Authoritative World currencies", h.model.currencies, ["currencyCode", "residencyCount", "journeyCount", "journeyCostMinor"]],
    ["World campaign history", h.model.campaign.history, ["eventKey", "fromPhase", "sequence", "reason", "occurredAt"]],
    ["Durable World effects", h.model.effects, ["effectKind", "status", "attemptCount", "lastErrorCode", "actions"]],
    ["Arrival Class assignments", h.model.arrivals, ["countryId", "classId", "source", "revision", "actions"]],
    ["World locations", h.model.geography.locations, ["displayName", "countryId", "locationKind", "availability", "revision"]],
    ["World routes", h.model.geography.routes, ["fromLocationId", "mode", "status", "baseCostMinor", "baseDurationMinutes", "costMultiplierBasisPoints", "actions"]],
    ["World travel journeys", h.model.travel.journeys, ["fromLocationId", "status", "currencyCode", "totalCostMinor", "totalDurationMinutes", "arrivalAt"]],
    ["World residency states", h.model.residency, ["currentCountryId", "currencyCode", "pendingCountryId", "eligibleCountryIds", "revision", "updatedAt"]],
  ];
  assert.deepEqual(h.tables.map((table) => table.options.caption), expected.map(([caption]) => caption));
  for (const [caption, rows, keys] of expected) {
    const table = h.table(caption);
    assert.strictEqual(table.rows, rows);
    assert.equal(table.options.rowKey(rows[0]), rows[0].rowKey);
    assert.deepEqual(table.options.columns.map((column) => column.key), keys);
  }
  assert.equal(h.table("World routes").cells[0][0], "노스리치 북항 → 한강 국제 물류 관문");
  assert.equal(h.table("World routes").cells[0][5], "125%");
  assert.equal(h.table("World travel journeys").cells[0][3], "12,500 · NRC");
  assert.equal(h.table("World residency states").cells[0][3], "Hanseong Republic");
});

test("World partial availability remains visible alongside authoritative panels", () => {
  const model = worldModel();
  model.panels = { campaign: { status: "failed" }, geography: { status: "ready" }, travel: { status: "failed" } };
  const h = ready({ model });
  const notice = h.nodes.find((node) => node.attrs["aria-label"] === "Partial World data availability");
  assert.equal(notice.attrs.role, "status");
  assert.match(notice.children[1].children[1].textContent, /^Campaign, Travel could not be loaded/);
  assert.equal(h.tables.length, 9);
});

for (const [status, expected] of [["active", "campaign-pause"], ["paused", "campaign-resume"], ["emergency_disabled", null]]) {
  test(`World ${status} campaign exposes only its existing reviewed controls`, async () => {
    const model = worldModel();
    model.campaign.current.status = status;
    const calls = [];
    const h = ready({ model, onCampaignAction: async (action) => { calls.push(action); return { ok: true }; } });
    assert.equal(Boolean(h.button("campaign-pause")), status === "active");
    assert.equal(Boolean(h.button("campaign-resume")), status === "paused");
    assert.equal(Boolean(h.button("campaign-emergency-disable")), status !== "emergency_disabled");
    if (expected) {
      const opener = h.button(expected);
      await opener.dispatch("click");
      assert.deepEqual(calls, []);
      assert.strictEqual(h.reviews[0].opener, opener);
      await h.reviews[0].accept();
      assert.deepEqual(calls, [status === "active" ? "pause" : "resume"]);
    }
  });
}

test("World emergency disable and recovery preserve their review and callback identities", async () => {
  const calls = [];
  const h = ready({
    onCampaignAction: async (action) => { calls.push(action); return { ok: true }; },
    onRecoverEffect: async (effect) => { calls.push(effect); return { ok: true }; },
  });
  await h.button("campaign-emergency-disable").dispatch("click");
  assert.equal(h.reviews[0].title, "Emergency disable campaign");
  await h.reviews[0].accept();
  await h.button("effect-recover").dispatch("click");
  assert.equal(h.reviews[0].title, "Recover failed World effect");
  await h.reviews[0].accept();
  assert.equal(calls[0], "emergency_disable");
  assert.strictEqual(calls[1], h.model.effects[0]);
});

test("World arrival choices, unchanged-value guard and reviewed callback remain intact", async () => {
  const calls = [];
  const h = ready({ onCorrectArrival: async (...args) => { calls.push(args); return { ok: true }; } });
  const select = h.nodes.find((node) => node.tag === "select");
  assert.equal(select.attrs["aria-label"], "Arrival Class for North Reach");
  assert.deepEqual(select.children.map((option) => option.attrs.value), ["analyst", "builder", "maker", "mediator", "navigator", "operator", "steward", "trader"]);
  assert.deepEqual(select.children.filter((option) => option.selected).map((option) => option.attrs.value), ["navigator"]);
  for (const value of ["", "navigator"]) {
    select.value = value;
    await h.button("arrival-correct").dispatch("click");
    assert.equal(h.reviews[0].opens, 0);
  }
  select.value = " analyst ";
  await h.button("arrival-correct").dispatch("click");
  assert.match(h.reviews[0].detail, /row 1\./);
  assert.deepEqual(calls, []);
  await h.reviews[0].accept();
  assert.strictEqual(calls[0][0], h.model.arrivals[0]);
  assert.equal(calls[0][1], "analyst");
});

for (const status of ["open", "closed"]) {
  test(`World ${status} geography retains reviewed toggle and row identity`, async () => {
    const model = worldModel();
    model.geography.routes[0].status = status;
    const calls = [];
    const h = ready({ model, onToggleRoute: async (route) => { calls.push(route); return { ok: true }; } });
    const opener = h.button(status === "open" ? "route-close" : "route-reopen");
    assert.equal(opener.dataset.tone, status === "open" ? "danger" : null);
    await opener.dispatch("click");
    assert.match(h.reviews[0].message, /노스리치 북항 → 한강 국제 물류 관문/);
    assert.match(h.reviews[0].detail, status === "open" ? /war reason/ : /recovery reason/);
    assert.deepEqual(calls, []);
    await h.reviews[0].accept();
    assert.strictEqual(calls[0], model.geography.routes[0]);
  });
}

test("World missing action references and runtime preserve disabled controls and reasons", () => {
  const model = worldModel();
  model.campaign.current.campaignId = "";
  model.effects[0].effectId = "";
  model.arrivals[0].assignmentId = "";
  model.geography.routes[0].routeId = "";
  const h = ready({ model });
  for (const action of ["campaign-pause", "campaign-emergency-disable", "effect-recover", "arrival-correct", "route-close"]) {
    assert.equal(h.button(action).attrs.disabled, true);
  }
  assert.match(h.button("route-close").attrs["aria-label"], /no actionable reference/);
  model.runtime = null;
  const unavailable = ready({ model });
  assert.match(unavailable.button("route-close").attrs.title, /runtime metadata is unavailable/);
});

test("World cancellation clears pending commands and a fresh review can succeed", async () => {
  let calls = 0;
  const h = ready({ onCampaignAction: async () => { calls += 1; return { ok: true }; } });
  await h.button("campaign-pause").dispatch("click");
  h.reviews[0].cancel();
  await Promise.resolve();
  await assert.rejects(h.reviews[0].options.onConfirm(), /WORLD_MUTATION_FAILED/);
  assert.equal(calls, 0);
  await h.button("campaign-pause").dispatch("click");
  await h.reviews[0].accept();
  assert.equal(calls, 1);
  await assert.rejects(h.reviews[0].options.onConfirm(), /WORLD_MUTATION_FAILED/);
  assert.equal(calls, 1);
});

for (const failure of ["reported", "throw", "default"]) {
  test(`World ${failure} mutation failure retains pending review without claiming success`, async () => {
    let calls = 0;
    const handlers = failure === "default" ? {} : { onCampaignAction: async () => {
      calls += 1;
      if (failure === "throw") throw new Error("synthetic failure");
      return { ok: false };
    } };
    const h = ready(handlers);
    await h.button("campaign-pause").dispatch("click");
    for (let attempt = 0; attempt < 2; attempt += 1) await assert.rejects(h.reviews[0].accept());
    assert.equal(h.reviews[0].opened, true);
    assert.equal(calls, failure === "default" ? 0 : 2);
    assert.match(h.reviews[0].options.failureMessage, /Refresh authoritative state/);
    h.route.destroy();
    await assert.rejects(h.reviews[0].options.onConfirm(), /WORLD_MUTATION_FAILED/);
    assert.equal(calls, failure === "default" ? 0 : 2);
    h.route.destroy();
    assert.equal(h.reviews[0].destroyed, 1);
  });
}

test("World optional and empty panels preserve their no-action states", () => {
  const model = worldModel();
  model.campaign.current = null;
  model.effects[0].status = "completed";
  const h = ready({ model });
  assert.equal(h.button("campaign-pause"), undefined);
  assert.equal(h.button("campaign-emergency-disable"), undefined);
  assert.equal(h.button("effect-recover"), undefined);
  assert.equal(h.table("Durable World effects").cells[0].at(-1), "No action required");
  for (const key of ["countries", "currencies", "effects", "arrivals", "residency"]) model[key] = [];
  model.campaign.history = [];
  model.geography = { locations: [], routes: [] };
  model.travel = { states: [], journeys: [] };
  const empty = ready({ model });
  assert.ok(empty.tables.every((table) => table.rows.length === 0 && table.options.emptyState.kind === "empty"));
});
