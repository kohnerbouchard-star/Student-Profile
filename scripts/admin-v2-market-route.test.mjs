import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createMarketRouteHarness, marketModel } from "./fixtures/admin-market-route-harness.mjs";

function ready({ model = marketModel(), status = "ready", ...options } = {}) {
  const h = createMarketRouteHarness();
  const route = h.MarketRoute({ state: { status, data: model }, ...options });
  return { ...h, route, model };
}
function detailButton(h, index = 0) { return h.tables[0].cells[index].at(-1); }

test("Market public module links and retains its sole route export", async () => {
  const module = await import("../admin/v2/src/routes/market/MarketRoute.js");
  assert.deepEqual(Object.keys(module), ["MarketRoute"]);
});

test("Market extraction retains all original functions and private-ID/public-symbol guards", () => {
  // Digests recorded on unchanged main c616ece3 before extraction.
  const expected = JSON.parse(readFileSync("scripts/fixtures/admin-market-function-hashes.json", "utf8"));
  const directory = "admin/v2/src/routes/market";
  const actual = {};
  let combined = "";
  for (const file of readdirSync(directory).filter((name) => /^Market(?:Route|InstrumentDirectory|ActivityPanels|ViewHelpers)\.js$/.test(name))) {
    const source = readFileSync(`${directory}/${file}`, "utf8");
    combined += source;
    for (const match of source.matchAll(/^(?:export )?function (\w+)\(/gm)) {
      const end = match.index + source.slice(match.index).match(/^}$/m).index + 1;
      const body = source.slice(match.index, end).replace(/^export /, "");
      assert.equal(actual[match[1]], undefined, `Duplicate function ${match[1]}`);
      actual[match[1]] = createHash("sha256").update(body).digest("hex");
    }
  }
  assert.deepEqual(actual, expected);
  assert.equal(combined.match(/const UUID_IN_TEXT_PATTERN = .*;/g)?.length, 1);
  assert.ok(combined.includes('const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;'));
  assert.ok(combined.includes('const PUBLIC_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,15}$/;'));
});

for (const status of ["initial-loading", "failed", "ready", "empty", "refreshing", "stale"]) {
  test(`Market ${status} keeps accessible state, content and refresh ownership`, async () => {
    const h = createMarketRouteHarness();
    let refreshed = 0;
    const error = { userMessage: "Unavailable", retryable: true, retryAfterSeconds: 10 };
    const model = marketModel();
    if (status === "empty") { model.isEmpty = true; model.instruments = []; }
    const route = h.MarketRoute({
      state: { status, data: ["initial-loading", "failed"].includes(status) ? null : model, error },
      onRefresh: () => { refreshed += 1; },
    });
    const content = route.options.content;
    assert.equal(content.dataset.adminV2State, status);
    assert.equal(content.attrs["aria-busy"], ["initial-loading", "refreshing"].includes(status));
    assert.equal(route.options.title, "Market Monitor");
    assert.match(route.options.description, /read-only/);
    assert.equal(h.button("refresh").attrs.disabled, status === "refreshing");
    await h.button("refresh").dispatch("click");
    assert.equal(refreshed, 1);
    if (status === "initial-loading") assert.equal(content.children[0].kind, "skeleton");
    if (status === "failed") {
      assert.equal(content.children[0].kind, "error");
      assert.equal(content.children[0].options.message, "Unavailable");
      assert.equal(content.children[0].options.retryAfterSeconds, 10);
      await content.children[0].options.retry.onClick();
      assert.equal(refreshed, 2);
    }
    if (status === "stale") {
      assert.equal(content.children[0].kind, "stale");
      await content.children[0].options.retry.onClick();
      assert.equal(refreshed, 2);
    }
    if (status === "empty") assert.equal(content.children[0].children[2].children[2].kind, "empty");
    if (status === "refreshing") assert.equal(content.children[0].attrs.role, "status");
    assert.equal(h.drawers.length, 0);
    route.destroy(); route.destroy();
  });
}

test("Market panel/column order, Unicode and public row keys stay intact", () => {
  const h = ready();
  const panels = h.route.options.content.children[0].children;
  assert.deepEqual(panels.map((p) => p.className), ["admin-market-route__summary", "admin-market-route__session-note", "admin-market-route__catalog", "admin-market-route__activity-grid"]);
  assert.equal(panels[1].attrs.role, "note");
  assert.equal(panels[1].attrs["aria-label"], "Market session contract");
  assert.equal(panels[2].attrs["aria-labelledby"], "admin-market-instrument-directory");
  const table = h.tables[0];
  assert.equal(table.options.caption, "Listed financial Market instruments");
  assert.deepEqual(table.options.columns.map((c) => c.key), ["name", "type", "sector", "countryCode", "currentPrice", "change", "status", "detail"]);
  assert.strictEqual(table.rows[0], h.model.instruments[0]);
  assert.equal(table.options.rowKey({ symbol: "fgrm" }, 1), "FGRM");
  assert.equal(table.options.rowKey({ symbol: "invalid/symbol" }, 4), "market-instrument-5");
  assert.equal(table.cells[0][0].children[1].textContent, "서리문 희토류 광업");
  assert.equal(table.cells[0][5].textContent, "Up +2.5 (+3.04%)");
  assert.equal(table.cells[1][4].children[0].textContent, "0.00456");
  assert.equal(table.cells[1][5].dataset.tone, "negative");
});

test("Market initial filters normalize and deduplicate options without publishing", () => {
  const calls = [];
  const h = ready({ filters: { query: "  FGRM  ", sector: "RARE MINERALS", country: "not-present", type: "unsafe", status: "ACTIVE" }, onFiltersChange: (value) => calls.push(value) });
  assert.deepEqual(calls, []);
  assert.equal(h.fields.get("market-search").value, "FGRM");
  assert.equal(h.fields.get("market-country").value, "all");
  assert.equal(h.fields.get("market-type").value, "all");
  assert.equal(h.fields.get("market-sector").value, "rare-minerals");
  assert.equal(h.fields.get("market-sector").options.options.length, 3);
  assert.strictEqual(h.tables[0].rows[0], h.model.instruments[0]);
});

for (const [field, value, expected] of [["search", "  technology ", "TECH"], ["sector", "technology", "TECH"], ["country", "northreach", "FGRM"], ["type", "unknown", null], ["status", "inactive", "TECH"]]) {
  test(`Market ${field} filtering preserves exact selection and callback publication`, async () => {
    const calls = [];
    const h = ready({ onFiltersChange: (filters) => calls.push(filters) });
    h.fields.get(`market-${field}`).value = value;
    await h.fields.get(`market-${field}`).control.dispatch(field === "search" ? "input" : "change");
    assert.deepEqual(h.tables[0].rows.map((row) => row.symbol), expected ? [expected] : []);
    assert.equal(calls.length, 1);
    assert.equal(Object.isFrozen(calls[0]), true);
    assert.equal(calls[0][field === "search" ? "query" : field], field === "search" ? "technology " : value);
  });
}

test("Market programmatic filter updates do not publish and reset invalid values", () => {
  let calls = 0;
  const h = ready({ onFiltersChange: () => { calls += 1; } });
  h.route.updateFilters({ query: " TECHNOLOGY ", sector: "Technology", country: "HANSEONG", type: "stock", status: "inactive" });
  assert.equal(calls, 0);
  assert.deepEqual(h.tables[0].rows.map((row) => row.symbol), ["TECH"]);
  h.route.updateFilters({ sector: "missing", status: "missing" });
  assert.equal(h.tables[0].rows.length, 2);
  assert.equal(calls, 0);
});

test("Market detail drawer preserves selection, opener, profile updates and mismatch guards", async () => {
  const calls = [];
  const h = ready({ loadDetail: (...args) => calls.push(args) });
  const opener = detailButton(h);
  await opener.dispatch("click");
  const drawer = h.drawers[0];
  assert.equal(drawer.element.dataset.marketDrawer, "instrument-detail");
  assert.equal(drawer.panel.dataset.open, "true");
  assert.equal(drawer.options.closeLabel, "Close instrument detail");
  assert.strictEqual(drawer.opens[0], opener);
  assert.strictEqual(h.details[0].instrument, h.model.instruments[0]);
  assert.equal(h.details[0].detailState.status, "initial-loading");
  assert.deepEqual(calls[0], ["FGRM", opener]);
  const next = { status: "ready", data: { rowKey: "FGRM", profile: { ...h.model.instruments[0], name: "Updated" } } };
  h.route.updateDetail(next, "FGRM");
  assert.strictEqual(h.details.at(-1).instrument, next.data.profile);
  assert.strictEqual(h.details.at(-1).detailState, next);
  const count = h.details.length;
  h.route.updateDetail({ status: "ready", data: { rowKey: "TECH" } }, "TECH");
  assert.equal(h.details.length, count);
  drawer.close();
  assert.equal(drawer.panel.dataset.open, "false");
  h.route.updateDetail(next, "FGRM");
  assert.equal(h.details.length, count);
  await detailButton(h, 1).dispatch("click");
  assert.equal(h.drawers.length, 1);
  assert.equal(drawer.title, "TECH instrument detail");
  assert.equal(h.details.at(-1).detailState.status, "initial-loading");
  assert.equal(calls.at(-1)[0], "TECH");
});

test("Market loadDetail takes precedence and retry preserves the current public row key", async () => {
  const calls = [];
  const h = ready({ loadDetail: (...args) => calls.push(args), onSelect: () => { throw new Error("Wrong callback"); } });
  await detailButton(h).dispatch("click");
  await h.details.at(-1).onRetry();
  assert.equal(calls[1].length, 1);
  assert.equal(calls[1][0], "FGRM");
});

for (const mode of ["fallback", "missing", "throw", "reject"]) {
  test(`Market detail ${mode} request behavior remains controller-owned`, async () => {
    const calls = [];
    const options = mode === "missing" ? {} : mode === "fallback"
      ? { onSelect: (...args) => calls.push(args) }
      : { loadDetail: () => { if (mode === "throw") throw new Error("Synthetic failure"); return Promise.reject(new Error("Synthetic failure")); } };
    const h = ready(options);
    await detailButton(h).dispatch("click");
    await Promise.resolve();
    assert.equal(h.drawers[0].isOpen(), true);
    if (mode === "fallback") assert.equal(calls[0][0], "FGRM");
    if (mode === "missing") assert.equal(h.details[0].onRetry, null);
    if (mode === "throw" || mode === "reject") assert.equal(h.details[0].detailState.status, "initial-loading");
    h.route.destroy(); h.route.destroy();
    assert.equal(h.drawers[0].destroyed, 1);
    const count = h.details.length;
    await detailButton(h).dispatch("click");
    h.route.updateDetail({ status: "ready" }, "FGRM");
    assert.equal(h.details.length, count);
    assert.equal(h.drawers.length, 1);
  });
}

test("Market empty data, missing values and failed feeds keep read-only fallback states", async () => {
  const model = marketModel();
  model.trades = []; model.events = [];
  Object.assign(model.instruments[0], { currentPrice: null, change: null, changePct: null, status: "invalid" });
  let refreshed = 0;
  const h = ready({ model, onRefresh: () => { refreshed += 1; } });
  assert.equal(h.tables[0].cells[0][4].children[0].textContent, "Not available");
  assert.equal(h.tables[0].cells[0][4].children.length, 1);
  assert.equal(h.tables[0].cells[0][5].dataset.tone, "unknown");
  assert.equal(h.tables[0].cells[0][6].dataset.status, "unknown");
  const activity = h.route.options.content.children[0].children[3];
  assert.deepEqual(activity.children.map((panel) => panel.children[1].kind), ["empty", "empty"]);
  model.panels = { trades: { status: "failed", error: { userMessage: "Temporarily unavailable", retryable: true, retryAfterSeconds: 30 } }, events: { status: "failed", error: { retryable: false, retryAfterSeconds: 1.5 } } };
  const failed = ready({ model, onRefresh: () => { refreshed += 1; } });
  const errors = failed.route.options.content.children[0].children[3].children.map((panel) => panel.children[1]);
  assert.deepEqual(errors.map((error) => error.kind), ["error", "error"]);
  assert.equal(errors[0].options.retryAfterSeconds, 30);
  assert.equal(errors[1].options.retryAfterSeconds, null);
  assert.equal(errors[1].options.retry, null);
  await errors[0].options.retry.onClick();
  assert.equal(refreshed, 1);
});

test("Market feeds retain eight-record bounds, text-only data and private-ID suppression", () => {
  const privateId = "40000000-0000-4000-8000-000000000004";
  const model = marketModel();
  model.instruments[0].symbol = privateId;
  model.instruments[0].name = `private ${privateId}`;
  model.instruments[0].description = "<img src=x onerror=alert(1)>";
  model.trades = Array.from({ length: 10 }, (_, i) => ({ ...model.trades[0], assetName: i === 0 ? privateId : `Trade ${i}` }));
  model.events = Array.from({ length: 10 }, (_, i) => ({ ...model.events[0], headline: i === 0 ? privateId : `Event ${i}` }));
  const h = ready({ model });
  assert.equal(h.tables[0].options.rowKey(model.instruments[0], 0), "market-instrument-1");
  const copy = h.tables[0].cells[0][0];
  assert.equal(copy.children[0].textContent, "Symbol unavailable");
  assert.equal(copy.children[1].textContent, "Instrument name unavailable");
  assert.equal(copy.children[2].textContent, "<img src=x onerror=alert(1)>");
  for (const node of h.nodes) assert.equal(String(node.textContent).includes(privateId), false);
  const activity = h.route.options.content.children[0].children[3];
  assert.deepEqual(activity.children.map((panel) => panel.children[1].children.length), [8, 8]);
});

test("Market safe failure text and no-data branches preserve fail-closed rendering", () => {
  const h = createMarketRouteHarness();
  const failed = h.MarketRoute({ state: { status: "failed", error: { userMessage: "40000000-0000-4000-8000-000000000004", retryable: false, retryAfterSeconds: 1.5 } } });
  const error = failed.options.content.children[0];
  assert.equal(error.options.message, "Authoritative Market data is temporarily unavailable.");
  assert.equal(error.options.retry, null);
  assert.equal(error.options.retryAfterSeconds, null);
  const noData = h.MarketRoute({ state: { status: "ready", data: null } });
  assert.equal(noData.options.content.children.length, 0);
  noData.updateFilters({});
  noData.updateDetail(null);
  noData.destroy();
});

test("Market browser gate uses the accepted source heading and native Marketplace boundary", () => {
  const route = readFileSync("admin/v2/src/routes/market/MarketRoute.js", "utf8");
  const browser = readFileSync("scripts/admin-v2-market-browser-smoke.mjs", "utf8");
  const marketplace = readFileSync("admin/v2/src/routes/marketplace/MarketplaceRoute.js", "utf8");
  const title = route.match(/title: "(Market Monitor)",/)?.[1];
  assert.equal(title, "Market Monitor");
  assert.ok(browser.includes(`name: "${title}", exact: true`));
  assert.doesNotMatch(browser, /Market Management|marketplace-separate-planned/);
  assert.match(marketplace, /title: "Marketplace Moderation"/);
  assert.match(browser, /marketplace-separate-native/);
  assert.ok(browser.includes('.admin-marketplace-route[data-admin-v2-state="empty"]'));
  assert.match(browser, /Market Monitor access restricted/);
  assert.ok(browser.includes('.admin-route-boundary[data-route="marketplace"][data-mode="source"]'));
  assert.match(browser, /Marketplace navigation issued a financial-Market request/);
  assert.match(browser, /Marketplace navigation changed the selected game/);
  assert.match(browser, /assertNoPrivateIdsOrRawDetails\(runtime.page, "Marketplace native boundary"\)/);
});

test("Market workflow adds exact-head contract and retained browser qualification without write access", () => {
  const workflow = readFileSync(".github/workflows/admin-v2-market.yml", "utf8");
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: "22\.23\.1"/);
  assert.match(workflow, /npm install --global npm@10\.9\.8/);
  assert.match(workflow, /npm run test:admin-v2\n/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:admin-v2:market-browser/);
  assert.doesNotMatch(workflow, /continue-on-error|contents: write|pull-requests: write/);
});

// DTO edge cases stay on the existing registered Market test path so test-only
// changes still select Market CI without new filters.
const marketReadModel = await import("../admin/v2/src/routes/market/MarketReadModel.js");
const marketController = await import("../admin/v2/src/routes/market/MarketController.js");
const MARKET_PRIVATE_ID = "20000000-0000-4000-8000-000000000002";
const fulfilledPanel = (data) => ({ status: "fulfilled", value: { data } });
const modelBatch = (assets = [], panels = {}) => ({ panels: { assets: fulfilledPanel({ assets }), ...panels } });
const modelAsset = (extra = {}) => ({ ticker: "ABC", id: MARKET_PRIVATE_ID, type: "stock", currentPrice: 0, ...extra });

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(assertDeepFrozen);
}

test("Market extraction retains the public entry point and keeps the pure model independent", () => {
  assert.deepEqual(Object.keys(marketController), ["createMarketController", "normalizeMarketReadModel"]);
  assert.strictEqual(marketController.normalizeMarketReadModel, marketReadModel.normalizeMarketReadModel);
  const source = readFileSync("admin/v2/src/routes/market/MarketReadModel.js", "utf8");
  assert.doesNotMatch(source, /\b(?:window|document|fetch|localStorage|sessionStorage)\b|MarketController|MarketRoute/);
  assert.deepEqual([...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]), ["../../core/error-envelope.js"]);
});

test("Market batch keeps resource identifiers separate, per-call and first-valid-wins", () => {
  const nextId = "30000000-0000-4000-8000-000000000003";
  const source = modelBatch([modelAsset({ id: "invalid" }), modelAsset(), modelAsset({ id: nextId })]);
  const copy = structuredClone(source);
  const first = marketReadModel.normalizeMarketBatch(source);
  const second = marketReadModel.normalizeMarketBatch(source);
  assert.equal(first.resourceIds.get("ABC"), MARKET_PRIVATE_ID);
  assert.notStrictEqual(first.resourceIds, second.resourceIds);
  first.resourceIds.clear();
  assert.equal(second.resourceIds.get("ABC"), MARKET_PRIVATE_ID);
  assert.equal(first.model.instruments.length, 3);
  assert.doesNotMatch(JSON.stringify(first.model), /20000000-0000|30000000-0000|resourceIds|assetId/);
  assertDeepFrozen(first.model);
  assert.throws(() => { first.model.instruments[0].name = "changed"; }, TypeError);
  assert.deepEqual(source, copy);
});

test("Market batch preserves required-panel errors, aliases and optional failure envelopes", () => {
  for (const result of [null, {}, { panels: { assets: fulfilledPanel([]) } }]) {
    assert.throws(() => marketReadModel.normalizeMarketReadModel(result), (error) => error.code === "INVALID_RESPONSE");
  }
  const result = modelBatch([], {
    assets: fulfilledPanel({ marketplaceSecurities: [modelAsset()] }),
    events: { status: "rejected", reason: new Error(`SQL secret ${MARKET_PRIVATE_ID}`) },
    trades: fulfilledPanel({ marketplaceTrades: [{ symbol: "abc", side: "buy", quantity: "0" }] }),
  });
  const model = marketReadModel.normalizeMarketReadModel(result);
  assert.equal(model.instruments[0].symbol, "ABC");
  assert.equal(model.trades[0].quantity, 0);
  assert.equal(model.panels.events.status, "failed");
  assert.doesNotMatch(JSON.stringify(model), /SQL|secret|20000000-0000/);
  const empty = marketReadModel.normalizeMarketReadModel(modelBatch([], { assets: fulfilledPanel({ assets: [], marketplaceSecurities: [modelAsset()] }) }));
  assert.equal(empty.isEmpty, true, "the first array alias remains authoritative even when empty");
});

test("Market batch preserves input bounds, zero values and finite-number guards", () => {
  const assets = Array.from({ length: 1_001 }, (_, index) => modelAsset({ ticker: `T${index}`, history: Array.from({ length: 501 }, (_, tickIndex) => ({ tickIndex, price: tickIndex })) }));
  const result = modelBatch(assets, {
    events: fulfilledPanel({ news: Array.from({ length: 101 }, (_, i) => ({ title: `Event ${i}`, isActive: i === 0 })) }),
    trades: fulfilledPanel({ trades: Array.from({ length: 101 }, () => ({ ticker: "ABC", quantity: 0, price: 0 })) }),
  });
  const model = marketReadModel.normalizeMarketReadModel(result);
  assert.equal(model.instruments.length, 1_000);
  assert.equal(model.events.length, 100);
  assert.equal(model.trades.length, 100);
  assert.equal(model.instruments[0].history.length, 500);
  assert.equal(model.instruments[0].history[0].tickIndex, 1);
  assert.equal(model.summary.markedActiveEventCount, 1);
  const invalid = marketReadModel.normalizeMarketReadModel(modelBatch([modelAsset({
    currentPrice: -1, previousClose: "Infinity", change: "-1.5", changePct: {},
    marketCap: true, beta: "0", fundamentals: { revenueGrowth: 0, profitMargin: [] },
  })])).instruments[0];
  assert.deepEqual([invalid.currentPrice, invalid.previousClose, invalid.change, invalid.changePct, invalid.marketCap, invalid.beta], [null, null, -1.5, null, null, 0]);
  assert.equal(invalid.fundamentals.revenueGrowth, 0);
  assert.equal(invalid.fundamentals.profitMargin, null);
});

test("Market detail preserves fallback identity and partial availability without inventing data", () => {
  const fallback = marketReadModel.normalizeMarketReadModel(modelBatch([modelAsset()])).instruments[0];
  const result = { panels: {
    profile: fulfilledPanel({ profile: modelAsset({ ticker: "OTHER", companyName: "Wrong instrument" }) }),
    chart: { status: "rejected", reason: new Error("private backend trace") },
    financials: fulfilledPanel({ financials: { revenueGrowth: "0.25", cashReserves: 0 } }),
  } };
  const detail = marketReadModel.normalizeMarketDetail(result, "ABC", fallback);
  assert.strictEqual(detail.profile, fallback);
  assert.deepEqual(detail.chart, []);
  assert.equal(detail.fundamentals.revenueGrowth, 0.25);
  assert.equal(detail.fundamentals.cashReserves, 0);
  assert.equal(detail.fundamentals.profitMargin, null);
  assert.equal(detail.panels.chart.status, "failed");
  assert.doesNotMatch(JSON.stringify(detail), /private backend trace|Wrong instrument|20000000-0000/);
  assertDeepFrozen(detail);
  assert.throws(() => marketReadModel.normalizeMarketDetail({}, "ABC", fallback), (error) => error.code === "REQUEST_FAILED");
});

test("Market chart preserves trailing bounds and filters invalid prices without private labels", () => {
  const chart = Array.from({ length: 503 }, (_, tickIndex) => ({ tickIndex, close: tickIndex, timestamp: `t${tickIndex}` }));
  chart[3].close = -1;
  chart[4].close = null;
  chart[5].timestamp = MARKET_PRIVATE_ID;
  const result = { panels: { chart: fulfilledPanel({ chart }) } };
  const detail = marketReadModel.normalizeMarketDetail(result, "ABC", null);
  assert.equal(detail.profile, null);
  assert.equal(detail.chart.length, 498);
  assert.equal(detail.chart[0].tickIndex, 5);
  assert.equal(detail.chart[0].timestamp, "");
  assert.equal(detail.chart[0].rowKey, "history-5-unknown");
  assert.equal(detail.chart.at(-1).close, 502);
  assertDeepFrozen(detail);
});
