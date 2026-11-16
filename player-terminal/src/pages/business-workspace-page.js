import { isEndpointEnabled } from "../api/capabilities.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { escapeHtml, formatNumber } from "../core/format.js";
import { renderBusinessWorkspacePage as renderBusinessWorkspaceSections } from "./business-workspace-sections.js";

function runnableUnitLimit(value) {
  const limit = Math.floor(Number(value));
  return Number.isSafeInteger(limit) && limit >= 1 ? limit : null;
}

export function renderBusinessProductionIntents(data) {
  const business = data?.business;
  const products = new Map(
    (Array.isArray(business?.products) ? business.products : [])
      .map((product) => [String(product?.id || ""), product]),
  );
  const readiness = Array.isArray(business?.productionReadiness)
    ? business.productionReadiness
    : [];
  const runnable = readiness.flatMap((row) => {
    const productKey = String(row?.productKey || "");
    const product = products.get(productKey);
    const maxRunnableUnits = runnableUnitLimit(row?.maxRunnableUnits);
    if (row?.nextRunReady !== true || !product || maxRunnableUnits === null) return [];
    return [{ product, row, maxRunnableUnits }];
  });
  const endpointReady = isEndpointEnabled(data?.capabilities, "businessManufacturingStart");

  if (!runnable.length) {
    return `<details class="player-terminal-disclosure" open data-business-production-intent="blocked"><summary><span>${icon("factory")}</span><div><strong>Start manufacturing</strong><small>No product currently satisfies the authoritative material, labor, and equipment constraints</small></div>${icon("chevronRight")}</summary>${renderEmptyState({ title: "No runnable production intent", detail: "Blocked products remain visible in the readiness evidence above. Manufacturing controls unlock only when nextRunReady is true and maxRunnableUnits is at least one.", iconName: "warning" })}</details>`;
  }

  return `<details class="player-terminal-disclosure" open data-business-production-intent="ready"><summary><span>${icon("factory")}</span><div><strong>Start manufacturing</strong><small>Each product is bounded by its current server-derived runnable maximum</small></div>${icon("chevronRight")}</summary><div class="player-terminal-business-production-intents" data-business-manufacturing-ready-products>${runnable.map(({ product, row, maxRunnableUnits }) => {
    const initialQuantity = Math.min(10, maxRunnableUnits);
    const productName = String(product.name || row.productName || "Product");
    return `<article class="player-terminal-business-product" data-business-production-product="${escapeHtml(product.id)}"><div><small>READY TO RUN · MAX ${formatNumber(maxRunnableUnits)}</small><strong>${escapeHtml(productName)}</strong><p>${escapeHtml(String(row.recipeKey || "Canonical recipe"))}</p></div>${renderStatusPill("READY", "green")}<form data-player-form="business-manufacturing-start" data-endpoint="businessManufacturingStart" data-business-id="${escapeHtml(business.company.id)}"><input name="productKey" type="hidden" value="${escapeHtml(product.id)}"/><label>RUN SIZE<input name="quantity" type="number" min="1" max="${escapeHtml(maxRunnableUnits)}" value="${escapeHtml(initialQuantity)}" required/></label><label>PRIORITY<select name="priority"><option value="standard">Standard</option><option value="expedite">Expedite</option></select></label><button class="player-terminal-primary-button" type="submit" ${endpointReady ? "" : "disabled"}>${icon("factory")} Start ${escapeHtml(productName)}</button></form></article>`;
  }).join("")}</div></details>`;
}

export function renderBusinessWorkspacePage(data) {
  const html = renderBusinessWorkspaceSections(data);
  if (data?.business?.configured !== true) return html;

  const productionSection = html.indexOf('id="business-workspace-production"');
  const intentStart = html.indexOf('<details class="player-terminal-disclosure" open>', productionSection);
  const jobsStart = html.indexOf('<div data-business-manufacturing-jobs>', intentStart);
  if (productionSection < 0 || intentStart < 0 || jobsStart < 0 || jobsStart <= intentStart) {
    throw new Error("The Business production intent boundary is unavailable.");
  }

  return `${html.slice(0, intentStart)}${renderBusinessProductionIntents(data)}${html.slice(jobsStart)}`;
}
