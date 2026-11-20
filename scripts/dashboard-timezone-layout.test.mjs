import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reconcileDashboardMarketStatus } from "./helpers/dashboard-timezone-layout.mjs";

const read = (name) => readFileSync(new URL(`../backend/src/domains/game-dashboard/infrastructure/${name}.ts`, import.meta.url), "utf8");
const repository = read("supabasePlayerGameDashboardRepository");
const projection = read("dashboardPanelProjection");
const current = 'marketStatus: gameSession.status === "active" && marketOpen\n          ? "open"\n          : "closed",';
const historical = 'marketStatus: gameSession.status === "active"\n          ? evaluateStockMarketSession(\n            DEFAULT_STOCK_EXCHANGE_CODE,\n            this.now(),\n          ).status\n          : "closed",';

test("retains exact installed projection delegation and authoritative closed predicate", () => {
  assert.equal(reconcileDashboardMarketStatus(repository, projection), repository);
});
test("legacy current inline projection is retained byte-for-byte", () => {
  assert.equal(reconcileDashboardMarketStatus(current), current);
});
for (const legacy of [historical, 'marketStatus: gameSession.status === "active" ? "open" : "closed",']) {
  test(`historical inline layout is upgraded once: ${legacy.slice(0, 70)}`, () => {
    const result = reconcileDashboardMarketStatus(legacy);
    assert.equal(result, current);
    assert.equal(reconcileDashboardMarketStatus(result), result);
  });
}
for (const [label, repo, leaf] of [
  ["missing leaf", repository, ""],
  ["wrong import owner", repository.replace('./dashboardPanelProjection.ts', './otherProjection.ts'), projection],
  ["missing return delegation", repository.replace('return projectDashboardPanels', 'return otherProjection'), projection],
  ["marketOpen not passed", repository.replace('input, gameSession, marketOpen,', 'input, gameSession, marketOpen: true,'), projection],
  ["duplicate delegate", repository + '\nprojectDashboardPanels({});', projection],
  ["inline and leaf ownership", repository + current, projection],
  ["missing export", repository, projection.replace('export function projectDashboardPanels', 'function projectDashboardPanels')],
  ["wrong leaf input", repository, projection.replace('input, gameSession, marketOpen,', 'input, gameSession, alternate,')],
  ["missing predicate", repository, projection.replace('&& marketOpen', '')],
  ["wrong inactive state", repository, projection.replace(': "closed",', ': "open",')],
  ["duplicate predicate", repository, projection + current],
  ["unknown inline predicate", 'marketStatus: gameSession.status === "active" && alternate ? "open" : "closed",', ""],
  ["duplicate inline predicate", current + current, ""],
  ["missing status", "return {};", ""],
]) {
  test(`rejects ${label}`, () => assert.throws(() => reconcileDashboardMarketStatus(repo, leaf), /Unsupported Dashboard/));
}
test("replay script and both workflow gates retain explicit layout validation", () => {
  const script = readFileSync(new URL('./apply-configurable-stock-market-timezone-v1.mjs', import.meta.url), 'utf8');
  assert.ok(script.includes('expected = reconcileDashboardMarketStatus(expected, dashboardPanelProjectionSource);'));
  for (const file of ['configurable-stock-market-timezone-v1.yml', 'exchange-calendar-runtime-v1.yml']) {
    const source = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
    assert.ok(source.includes('run: node --test scripts/dashboard-timezone-layout.test.mjs'));
    assert.ok(source.includes('- scripts/helpers/dashboard-timezone-layout.mjs'));
    assert.ok(source.includes('git diff --exit-code'));
    assert.ok(source.includes('node scripts/apply-configurable-stock-market-timezone-v1.mjs'));
  }
});
