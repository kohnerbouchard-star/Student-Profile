import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const businessProcurementSource = () => readFileSync("player-terminal/src/pages/business-procurement-view.js", "utf8");

export function installedBusinessPageSource(page, procurement) {
  assert.match(page, /^import \{ renderBusinessProcurementPanel \} from "\.\/business-procurement-view\.js";$/mu,
    "Business page must import the reviewed procurement renderer.");
  assert.ok(page.includes("${renderBusinessProcurementPanel(data, { businessMoney, businessDecimalStep, businessTimestamp, formatBusinessRatePercent, shortBusinessKey })}"),
    "Business page must render procurement with its existing formatting dependencies.");
  assert.match(procurement, /^export function renderBusinessProcurementPanel\(data, formatting\) \{$/mu,
    "The installed procurement leaf must export the reviewed renderer.");
  return `${page}\n${procurement}`;
}

export function readInstalledBusinessPageSource() {
  return installedBusinessPageSource(
    readFileSync("player-terminal/src/pages/business-page.js", "utf8"),
    businessProcurementSource(),
  );
}
