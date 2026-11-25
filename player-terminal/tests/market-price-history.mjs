import assert from "node:assert/strict";
import test from "node:test";
import { previewData } from "../src/data/preview-data.js";
import { installLocalControlsFlow } from "../src/features/local-controls/local-controls-flow.js";
import { marketHistoryChart, normalizeMarketObservations } from "../src/features/market/price-history.js";
import { renderMarketPage } from "../src/pages/market-page.js";

const start = Date.parse("2026-07-18T00:00:00.000Z");
const point = (tickIndex, ms, price = tickIndex + 10) => ({
  tickIndex, price, createdAt: new Date(start + ms).toISOString(),
});
const observations = (spacing) => Array.from({ length: 40 }, (_, index) => point(index, index * spacing));

test("equal observation counts over 39 minutes and 78 days report different actual UTC coverage", () => {
  const short = marketHistoryChart(normalizeMarketObservations(observations(60_000)));
  const long = marketHistoryChart(normalizeMarketObservations(observations(172_800_000)));
  assert.equal(short.count, 40);
  assert.equal(long.count, 40);
  assert.equal(short.coverage, "40 recorded observations · 2026-07-18 00:00:00 UTC to 2026-07-18 00:39:00 UTC");
  assert.equal(long.coverage, "40 recorded observations · 2026-07-18 00:00:00 UTC to 2026-10-04 00:00:00 UTC");
  const irregular = marketHistoryChart(normalizeMarketObservations([point(1, 0), point(2, 1_000), point(3, 10_000)]));
  assert.match(irregular.line, /^M18\.00,242\.00 L86\.40,130\.00 L702\.00,18\.00$/);
});

test("a real zero is not absence; one or simultaneous ticks have truthful geometry", () => {
  const single = marketHistoryChart(normalizeMarketObservations([point(1, 127, 0)]));
  assert.equal(single.count, 1);
  assert.equal(single.coverage, "1 recorded observation · 2026-07-18 00:00:00.127 UTC");
  assert.equal(single.line, "");
  assert.equal(single.area, "");
  assert.deepEqual(single.dot, { x: 360, y: 130 });
  assert.equal(single.latestPrice, 0);
  const simultaneous = marketHistoryChart(normalizeMarketObservations([point(2, 0, 3), point(1, 0, 1)]));
  assert.equal(simultaneous.count, 2);
  assert.equal(simultaneous.line, "M360.00,242.00 L360.00,18.00");
  assert.equal(simultaneous.area, "");
});

test("Market rejects undated, malformed, duplicate and noncanonical history rather than plotting a quote", () => {
  const valid = point(1, 1);
  for (const invalid of [
    [12, 15], [{ ...valid, price: null }], [{ ...valid, price: "3" }],
    [{ ...valid, createdAt: "2026-07-18" }], [{ ...valid, createdAt: "2026-02-30T00:00:00.000Z" }],
    [valid, { ...valid, price: 5 }],
  ]) {
    assert.equal(marketHistoryChart(normalizeMarketObservations(invalid)), null);
  }
  const html = renderMarketPage(previewData, {});
  assert.match(html, /No recorded price history is loaded for this asset/);
  assert.doesNotMatch(html, /class="player-terminal-chart-line"|data-player-local-action="chart-range"|1M SERIES/);
  assert.match(html, /data-player-market-order-form="buy-quote"/);
});

function renderRecorded(history, listingCurrencyCode = "ECO", historyStatus = "last-loaded") {
  const base = previewData.market.assets[0];
  const asset = { ...base, history, listingCurrencyCode, historyStatus };
  const market = { ...previewData.market, assets: [asset] };
  return renderMarketPage({ ...previewData, market }, { marketAssetId: asset.id });
}

test("one recorded price renders a dot, acknowledges missing listing currency, and exposes no range control", () => {
  const html = renderRecorded([point(1, 0, 25)], "");
  assert.match(html, /Listing currency not reported/);
  assert.match(html, /Recorded price: 25/);
  assert.match(html, /data-player-market-chart-dot cx="360" cy="130" r="4"/);
  assert.match(html, /Last loaded history/);
  assert.doesNotMatch(html, /data-player-local-action="chart-range"/);
});

test("first paint, active control, last 24 observations and return all share the same chart model", (t) => {
  const raw = observations(60_000);
  const allChart = marketHistoryChart(normalizeMarketObservations(raw));
  const html = renderRecorded(raw);
  assert.match(html, /data-range="all" aria-pressed="true">All observations/);
  assert.match(html, /data-range="recent" aria-pressed="false">Last 24 observations/);
  assert.ok(html.includes(`class="player-terminal-chart-line" d="${allChart.line}"`));
  assert.ok(html.includes(allChart.coverage));

  function node() {
    const attributes = new Map();
    return {
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key),
      classList: { toggle() {} },
    };
  }
  const line = node(), area = node(), dot = node(), coverage = node();
  const frame = {
    dataset: { playerMarketChartHistory: JSON.stringify(raw) },
    querySelector: (key) => ({
      ".player-terminal-chart-line": line, ".player-terminal-chart-area": area, "[data-player-market-chart-dot]": dot,
    })[key],
  };
  const controls = ["all", "recent"].map((range) => ({ ...node(), dataset: { playerLocalAction: "chart-range", range } }));
  const listeners = new Map();
  class Mount {
    querySelector(key) {
      return { "[data-player-market-chart-history]": frame, "[data-player-market-chart-coverage]": coverage }[key];
    }
    querySelectorAll() { return controls; }
    addEventListener(type, callback) { listeners.set(type, callback); }
    removeEventListener(type) { listeners.delete(type); }
  }
  const original = globalThis.HTMLElement;
  globalThis.HTMLElement = Mount;
  t.after(() => { globalThis.HTMLElement = original; });
  const flow = installLocalControlsFlow({
    mount: new Mount(),
    terminal: { getState() { throw new Error("chart should not read the terminal/API"); }, showToast() {} },
  });
  const click = (button) => listeners.get("click")({
    target: { closest: () => button }, preventDefault() {}, stopImmediatePropagation() {},
  });
  click(controls[0]);
  assert.equal(line.getAttribute("d"), allChart.line);
  assert.equal(coverage.textContent, allChart.coverage);
  click(controls[1]);
  const recent = marketHistoryChart(normalizeMarketObservations(raw), "recent");
  assert.deepEqual(controls.map((button) => button.getAttribute("aria-pressed")), ["false", "true"]);
  assert.equal(line.getAttribute("d"), recent.line);
  assert.equal(area.getAttribute("d"), recent.area);
  assert.equal(coverage.textContent, "24 recorded observations · 2026-07-18 00:16:00 UTC to 2026-07-18 00:39:00 UTC");
  click(controls[0]);
  assert.equal(line.getAttribute("d"), allChart.line);
  assert.equal(coverage.textContent, allChart.coverage);
  flow.destroy();
  assert.equal(listeners.size, 0);
});
