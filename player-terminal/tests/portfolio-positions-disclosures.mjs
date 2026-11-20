import assert from "node:assert/strict";
import test from "node:test";
import { renderPortfolioPositions } from "../src/features/market/portfolio-positions-view.js";

const position = { ticker: "ECO", quantity: 2, averageCost: 100, costBasis: 200,
  marketValue: 220, unrealizedPnl: 20, currencyCode: "ECO" };
const render = (holdings, state = "ready") => renderPortfolioPositions({
  portfolio: { holdings }, resourceStatus: { portfolio: { state } },
});

test("valid positive-basis returns retain positive, negative, and true zero results", () => {
  for (const [gain, expected] of [[20, "+10.00%"], [-20, "-10.00%"], [0, "+0.00%"]]) {
    const html = render([{ ...position, unrealizedPnl: gain }]);
    assert.ok(html.includes(expected), expected);
    assert.ok(!html.includes("Return unavailable"));
  }
});
test("zero, negative, missing, or nonfinite bases do not fabricate a percentage", () => {
  for (const overrides of [
    { costBasis: 0 }, { costBasis: -1 }, { costBasis: NaN }, { costBasis: Infinity },
    { costBasis: undefined, averageCost: undefined }, { unrealizedPnl: NaN }, { costBasis: 1e-308, unrealizedPnl: 1e308 },
  ]) {
    const html = render([{ ...position, ...overrides }]);
    assert.ok(html.includes("Return unavailable"));
    assert.ok(!html.includes("+0.00%"));
  }
});
test("absent explicit basis retains a valid quantity-times-average-cost fallback", () => {
  assert.ok(render([{ ...position, costBasis: undefined }]).includes("+10.00%"));
});
test("empty successful holdings are distinguished from empty unavailable holdings", () => {
  assert.ok(render([]).includes("No active positions"));
  const failed = render([], "unavailable");
  assert.ok(failed.includes("Positions unavailable"));
  assert.ok(failed.includes("Refresh to confirm your current holdings"));
  assert.ok(failed.includes("0 last loaded holdings"));
  assert.ok(!failed.includes("No active positions"));
});
test("unavailable nonempty holdings retain values with last-loaded warnings", () => {
  const html = render([position], "unavailable");
  assert.ok(html.includes("LAST LOADED POSITIONS"));
  assert.ok(html.includes("1 last loaded holdings"));
  assert.ok(html.includes("+10.00%"));
});
