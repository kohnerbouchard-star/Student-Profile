import assert from "node:assert/strict";
import { test } from "node:test";
import { resourcesForRoute } from "../src/api/resource-plan.js";
import { normalizeTerminalBootstrap, mergeTerminalRead } from "../src/api/read-model.js";
import { renderDashboardPage } from "../src/pages/dashboard-page.js";

const seed = () => normalizeTerminalBootstrap({}, null);
const ready = (arrival) => ({ ...seed(), resourceStatus: { worldRuntime: { state: "ready" } }, worldRuntime: { arrival } });
const actions = (html) => html.match(/<div class="player-terminal-next-actions">(.*?)<\/div><\/section>/s)?.[1] || "";
test("Dashboard requests World runtime once as an optional resource", () => {
  const plan = resourcesForRoute("dashboard");
  assert.equal(plan.optional.filter((key) => key === "worldRuntime").length, 1);
  assert.ok(!plan.required.includes("worldRuntime"));
});
test("required Arrival is the first action, with no economic lockout", () => {
  const html = renderDashboardPage(ready({ required: true, questionnaire: { version: 1, questions: [] }, assignment: null }));
  assert.match(actions(html), /^<button[^>]*data-route="world"/);
  assert.match(html, /Complete Arrival Class/);
  assert.match(html, /No class permanently blocks economic activity/);
  assert.match(html, /data-route="contracts"/);
});
test("missing questionnaire directs to configuration rather than inventing a ready form", () => {
  const html = renderDashboardPage(ready({ required: true, questionnaire: null, assignment: null }));
  assert.match(actions(html), /^<button[^>]*data-route="world"/);
  assert.match(html, /Arrival questionnaire unavailable/);
  assert.doesNotMatch(html, /Complete Arrival Class/);
});
for (const arrival of [{ required: false }, { required: true, assignment: { classId: "analyst" } }]) {
  test(`confirmed Arrival does not replace the core loop: ${JSON.stringify(arrival)}`, () => {
    const html = renderDashboardPage(ready(arrival));
    assert.match(actions(html), /^<button[^>]*data-route="contracts"/);
    assert.doesNotMatch(html, /Complete Arrival Class/);
  });
}
for (const [status, expected] of [[{ state: "unknown" }, "Arrival status unknown"], [{ state: "loading" }, "Checking Arrival status"], [{ state: "unavailable" }, "Arrival status unavailable"], [{ state: "unavailable", code: "CAPABILITY_UNAVAILABLE" }, "Arrival runtime not supported"]]) {
  test(`readiness distinguishes ${JSON.stringify(status)} and ignores cached Arrival`, () => {
    const data = ready({ required: true, questionnaire: {} });
    data.resourceStatus.worldRuntime = status;
    const html = renderDashboardPage(data);
    assert.match(html, new RegExp(expected));
    assert.doesNotMatch(html, /Complete Arrival Class/);
  });
}
test("country-only fallback cannot certify Arrival", () => {
  const data = ready({ required: false });
  data.worldRuntime.runtimeAvailable = false;
  assert.match(renderDashboardPage(data), /Arrival status unavailable/);
});
for (const economy of [null, {}, { gdpGrowthRate: null, inflationRate: "", politicalStabilityIndex: false }]) {
  test(`missing country metrics stay unknown: ${JSON.stringify(economy)}`, () => {
    const data = mergeTerminalRead(seed(), "countries", { items: [{ countryCode: "AB", isPlayerCountry: true, economy }] });
    assert.deepEqual([data.countries[0].growth, data.countries[0].inflation, data.countries[0].stability], [null, null, null]);
    const footer = renderDashboardPage(data).match(/<footer.*?<\/footer>/s)[0];
    assert.equal((footer.match(/<dd[^>]*>Unavailable<\/dd>/g) || []).length, 3);
  });
}
test("measured zero country metrics remain measured zero", () => {
  const data = mergeTerminalRead(seed(), "countries", { items: [{ countryCode: "AB", isPlayerCountry: true, economy: { gdpGrowthRate: 0, inflationRate: 0, politicalStabilityIndex: 0 } }] });
  assert.deepEqual([data.countries[0].growth, data.countries[0].inflation, data.countries[0].stability], [0, 0, 0]);
  data.resourceStatus = { countries: { state: "ready" } };
  assert.match(renderDashboardPage(data), /0\/100/);
});
test("empty and partial Dashboard snapshots preserve unknown financial metrics", () => {
  for (const data of [seed(), normalizeTerminalBootstrap({}, { gameSession: {}, me: {}, public: {} })]) {
    assert.equal(data.dashboard.netWorth, null);
    assert.equal(data.dashboard.dailyChange, null);
    assert.equal(data.dashboard.portfolioValue, null);
    assert.doesNotThrow(() => renderDashboardPage(data));
    assert.doesNotMatch(renderDashboardPage(data), /0\.00% today|Ready to deploy/);
  }
});
test("failed resources mask previously loaded metrics and guidance", () => {
  const data = seed();
  data.dashboard = { ...data.dashboard, netWorth: 123456, dailyChange: 17, contractsActive: 9, contractsDueSoon: 8, liquidBalance: 200, savingsBalance: 100, portfolioValue: 333, inventoryValue: 444 };
  data.banking.checking.available = 123456;
  data.messages.unread = 22;
  data.resourceStatus = Object.fromEntries(["dashboard", "banking", "messages", "contracts", "portfolio", "news", "market", "countries"].map((key) => [key, { state: "unavailable" }]));
  const html = renderDashboardPage(data);
  assert.doesNotMatch(html, /123,456|17\.00%|8 due soon|22 unread|No world signals require attention|Other dashboard information remains current/);
});

test("ready Dashboard retains measured zeros without inventing a daily return", () => {
  const data = normalizeTerminalBootstrap({}, { gameSession: {}, me: { netWorth: 0, cash: { totalBalance: 0 }, stocks: { portfolio: { holdingsMarketValue: 0 } }, store: { inventory: [] } }, public: {} });
  assert.equal(data.dashboard.netWorth, 0);
  assert.equal(data.dashboard.portfolioValue, 0);
  assert.equal(data.dashboard.inventoryValue, 0);
  data.resourceStatus = { dashboard: { state: "ready" } };
  assert.match(renderDashboardPage(data), /Daily change unavailable/);
});
test("missing inventory prices are unknown rather than valued as zero", () => {
  const data = normalizeTerminalBootstrap({}, { gameSession: {}, me: { store: { inventory: [{ itemId: "item", quantityOwned: 2 }], listings: [] } }, public: {} });
  assert.equal(data.dashboard.inventoryValue, null);
});
test("country modal remains usable for missing home-market indicators", async () => {
  const { renderModal } = await import("../src/components/modal.js");
  const data = mergeTerminalRead(seed(), "countries", { items: [{ countryCode: "AB", economy: null }] });
  const html = renderModal({ type: "country", country: data.countries[0] });
  assert.match(html, /GROWTH<\/small><strong[^>]*>Unavailable/);
  assert.match(html, /INFLATION<\/small><strong>Unavailable/);
  assert.match(html, /STABILITY<\/small><strong>Unavailable/);
});
for (const mode of ["ready", "missing", "timeout", "failed", "malformed"]) {
  test(`production API route preserves optional World semantics: ${mode}`, async () => {
    const { PlayerApi } = await import("../src/api/player-api.js");
    const { previewData } = await import("../src/data/preview-data.js");
    const calls = [];
    const api = new PlayerApi({
      usePreviewData: false, requestTimeoutMs: 40,
      apiCall: async (context) => {
        calls.push([context.endpointKey, context.method]);
        if (context.endpointKey === "session") return { displayName: "Test", gameSessionId: "game", currencyCode: "ECO", capabilityEndpointKeys: ["dashboard", "countries", ...(mode === "missing" ? [] : ["worldRuntime"])] };
        if (context.endpointKey === "worldRuntime") {
          if (mode === "timeout") return new Promise(() => {});
          if (mode === "failed") throw new Error("service unavailable");
          if (mode === "malformed") return { arrival: { required: false } };
          return { arrival: { required: false, questionnaire: null, assignment: null }, travel: { state: null, activeJourney: null }, campaign: null, residency: null, world: null };
        }
        return structuredClone(previewData[context.endpointKey]);
      }
    });
    await api.bootstrap();
    const result = await api.loadRoute("dashboard", { force: true });
    assert.equal(result.resourceStatus.dashboard.state, "ready");
    assert.equal(result.resourceStatus.countries.state, "ready");
    assert.equal(calls.filter(([key]) => key === "worldRuntime").length, mode === "missing" ? 0 : 1);
    assert.ok(calls.every(([, method]) => method === "GET"));
    assert.equal(result.resourceStatus.worldRuntime.state, mode === "ready" ? "ready" : "unavailable");
    if (mode === "timeout") assert.equal(result.errors.worldRuntime.code, "REQUEST_TIMEOUT");
    if (mode === "missing") assert.equal(result.resourceStatus.worldRuntime.code, "CAPABILITY_UNAVAILABLE");
  });
}
