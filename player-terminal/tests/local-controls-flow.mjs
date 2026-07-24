import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bankingTransactionsCsv,
  historyForMarketRange,
  marketChartPath,
  marketRowMatchesQuery,
} from "../src/features/local-controls/local-controls-flow.js";

const history = Array.from({ length: 400 }, (_, index) => index + 1);
assert.deepEqual(historyForMarketRange(history, "1D"), history.slice(-24));
assert.deepEqual(historyForMarketRange(history, "1M"), history.slice(-30));
assert.deepEqual(historyForMarketRange(history, "3M"), history.slice(-90));
assert.deepEqual(historyForMarketRange(history, "1Y"), history.slice(-365));
assert.deepEqual(historyForMarketRange(history, "ALL"), history);
assert.deepEqual(historyForMarketRange([], "1D"), [0, 0]);
assert.equal(historyForMarketRange([1, "bad", 3], "ALL").join(","), "1,3");

const path = marketChartPath([10, 20, 15]);
assert.match(path, /^M\d+\.\d{2},\d+\.\d{2} L\d+\.\d{2},\d+\.\d{2} L\d+\.\d{2},\d+\.\d{2}$/);
assert.equal(marketRowMatchesQuery("FROSTMIN Frostgate Mining Materials", "mining"), true);
assert.equal(marketRowMatchesQuery("FROSTMIN Frostgate Mining Materials", "energy"), false);
assert.equal(marketRowMatchesQuery("Any asset", ""), true);

const csv = bankingTransactionsCsv([
  {
    date: "2026-07-24",
    description: 'Market order, "FROSTMIN"',
    category: "Markets",
    amount: -125.5,
    currencyCode: "ECO",
    status: "Posted",
  },
]);
assert.equal(
  csv,
  'Date,Description,Category,Amount,Currency,Status\r\n2026-07-24,"Market order, ""FROSTMIN""",Markets,-125.5,ECO,Posted\r\n',
);

const [mainSource, capabilitySource, marketSource, bankingSource] = await Promise.all([
  readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  readFile(new URL("../src/api/capabilities.js", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/market-page.js", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/banking-page.js", import.meta.url), "utf8"),
]);

assert.match(mainSource, /installLocalControlsFlow/);
assert.match(mainSource, /localControls\.destroy\(\)/);
for (const capability of ["bankingExport", "chartRange", "marketSearch"]) {
  assert.match(capabilitySource, new RegExp(`"${capability}"`));
}
assert.match(marketSource, /data-player-market-search-panel/);
assert.match(marketSource, /data-player-market-chart-history/);
assert.match(marketSource, /aria-pressed="true"/);
assert.match(bankingSource, /data-player-local-action="download-transactions"/);

console.log("Player local control wiring tests passed.");
