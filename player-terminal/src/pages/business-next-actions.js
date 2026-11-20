import { escapeHtml } from "../core/format.js";

const rows = (value) => Array.isArray(value) ? value : [];
const ready = (data, resource) => data?.resourceStatus?.[resource]?.state === "ready";
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

// Navigation advice only: existing forms and the server remain the write authority.
export function businessNextActions(data) {
  if (!ready(data, "business") || data.business?.configured !== true) return [];
  const business = data.business;
  const actions = [];
  const add = (section, title, detail) => actions.push({ section, title, detail });
  const readiness = rows(business.productionReadiness);
  const blocked = readiness.filter((row) => row.nextRunReady !== true);
  if (blocked.some((row) => row.materialReady === false)) {
    add("procurement", "Source missing materials", "Review the server's material requirements before buying inputs for this Business.");
  }
  if (blocked.some((row) => row.laborReady === false)) {
    add("workforce", "Review available labor", "Check required roles, available minutes and payroll before hiring.");
  }
  if (blocked.some((row) => row.equipmentReady === false)) {
    add("equipment", "Review production equipment", "Check installed equipment capacity and warehouse equipment before buying another machine.");
  } else if (ready(data, "businessEquipment") && rows(data.businessEquipment?.availableEquipment).length) {
    add("equipment", "Install warehouse equipment", "Eligible machines are waiting in this Business warehouse. Review them before installation.");
  }
  const products = new Set(rows(business.products).map((row) => row.id));
  if (readiness.some((row) => row.nextRunReady === true && products.has(row.productKey) && positive(row.maxRunnableUnits))) {
    add("production", "Start a ready production run", "Choose a server-evaluated product and quantity. Availability is checked again when you confirm.");
  }
  if (ready(data, "businessStockroom") && rows(data.businessStockroom?.items).some((row) => row.locationKey === "finished_goods" && positive(row.quantityAvailable))) {
    add("sales", "Move finished goods toward a sale", "Review existing offers to add stock, or create a draft for an eligible unlisted product. Stocking is not publication.");
  }
  if (rows(business.salesOffers).some((row) => ["draft", "paused"].includes(row.status) && positive(row.quantityAvailable))) {
    add("sales", "Review stocked offers for publication", "Check the price and quantity, then explicitly publish. No offer is published automatically.");
  }
  if (rows(business.salesOffers).some((row) => row.status === "active" && row.purchaseAllowed === true && positive(row.quantityAvailable))) {
    add("sales", "Monitor published offers", "Available listings still need a buyer. Listing stock is not earned revenue.");
  }
  if (positive(business.storeSales?.recentReceiptCount)) {
    add("sales", "Review committed sales receipts", "Reconcile actual seller receipts and revenue. Production and listing alone do not create sales.");
  }
  if (!actions.length) add("production", "Review production readiness", "Check the current products, requirements and jobs. No next action can be inferred from the available evidence.");
  return actions;
}

export function renderBusinessNextActions(data) {
  const actions = businessNextActions(data);
  if (!actions.length) return "";
  return `<section class="player-terminal-panel" data-business-next-actions aria-label="Business next actions"><header class="player-terminal-panel-header"><div><span>PRODUCTION TO SALE</span><strong>What to work on next</strong></div></header><p>Based on the latest loaded Business reads. These links do not submit commands; review the live requirements and confirm each action separately.</p><div>${actions.map(({section, title, detail}) => `<article class="player-terminal-business-product"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div><a class="player-terminal-compact-button" href="#business-workspace-${section}" data-business-workspace-link="${section}">Review ${escapeHtml(section)}</a></article>`).join("")}</div></section>`;
}
