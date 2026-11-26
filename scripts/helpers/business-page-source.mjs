import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(`player-terminal/src/${path}`, "utf8");
export const businessProcurementSource = () => read("pages/business-procurement-view.js");

export function installedBusinessPageSource(sections, procurement, topology = {
  route: read("core/route-renderer.js"),
  workspace: read("pages/business-workspace.js"),
  page: read("pages/business-workspace-page.js"),
  shared: read("pages/business-page.js"),
}) {
  assert.match(topology.route, /import \{ renderPhase12BusinessPage \} from "\.\.\/pages\/business-workspace\.js"/u);
  assert.match(topology.route, /business: renderBusinessWorkspacePage/u);
  assert.match(topology.route, /if \(data\?\.business\?\.configured !== true\) return renderBusinessFormationPage\(data\)/u);
  assert.match(topology.route, /return renderPhase12BusinessPage\(data\)/u);
  assert.match(topology.workspace, /renderBusinessWorkspacePage as renderPhase12BusinessPage/u);
  assert.match(topology.workspace, /from "\.\/business-workspace-page\.js"/u);
  assert.match(topology.page, /renderBusinessWorkspacePage as renderBusinessWorkspaceSections/u);
  assert.match(topology.page, /from "\.\/business-workspace-sections\.js"/u);
  assert.match(topology.page, /renderBusinessWorkspaceSections\(data\)/u);
  assert.match(sections, /import \{ renderProcurementFundingLines \} from "\.\/business-procurement-view\.js"/u);
  assert.ok(sections.includes("${renderProcurementFundingLines(quote.fundingQuote.lines, { businessMoney: money, formatBusinessRatePercent })}"));
  assert.match(procurement, /export function renderProcurementFundingLines\(/u);
  assert.match(sections, /import \{ businessTreasuryPanel, formatBusinessRatePercent, renderBusinessPage as renderBusinessFormationPage \} from "\.\.\/pages\/business-page\.js"/u);
  assert.ok(sections.includes("${businessTreasuryPanel(data)}"));
  assert.match(topology.shared, /export function businessTreasuryPanel\(data\)/u);
  return [topology.route, topology.workspace, topology.page, sections, topology.shared, procurement].join("\n");
}

export function readInstalledBusinessPageSource() {
  return installedBusinessPageSource(read("pages/business-workspace-sections.js"), businessProcurementSource());
}
