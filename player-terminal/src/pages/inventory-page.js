import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function redemptionTone(status) {
  if (status === "fulfilled") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "approved") return "cyan";
  return "amber";
}

function latestRequestFor(item, requests) {
  return requests.find((request) => request.inventoryHoldingId === item.id) || null;
}

function renderInventoryItem(item, currencyCode, requests) {
  const usable = Array.isArray(item.availableActions)
    ? item.availableActions.some((action) => ["use", "inventory.use"].includes(action))
    : false;
  const latestRequest = latestRequestFor(item, requests);
  const available = Number.isFinite(Number(item.quantityAvailable))
    ? Number(item.quantityAvailable)
    : item.quantity;
  return `<article class="player-terminal-inventory-card">
    <div class="player-terminal-inventory-image"><img src="${escapeHtml(item.image)}" alt="" /><span>${escapeHtml(item.quantity)}×</span></div>
    <div class="player-terminal-inventory-copy"><small>${escapeHtml(item.category)} · ${escapeHtml(item.state)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p>${latestRequest ? `<div><small>LATEST REQUEST</small>${renderStatusPill(latestRequest.status.toUpperCase(), redemptionTone(latestRequest.status))}</div>` : ""}</div>
    <div class="player-terminal-inventory-meta"><span><small>TOTAL VALUE</small><strong>${escapeHtml(formatCurrency(item.value, currencyCode))}</strong></span><span><small>AVAILABLE</small><strong>${escapeHtml(available)}</strong></span>${usable ? `<button class="player-terminal-compact-button" type="button" data-player-inventory-use="${escapeHtml(item.id)}">${icon("use")} Request use</button>` : renderStatusPill(item.state, item.state === "Equipped" ? "green" : "cyan")}</div>
  </article>`;
}

function renderRedemptionHistory(requests, items) {
  if (!requests.length) {
    return renderEmptyState({
      title: "No redemption requests",
      detail: "Requested item uses and their administrator review status will appear here.",
      iconName: "use"
    });
  }
  const itemByStoreId = new Map(items.map((item) => [item.storeItemId, item]));
  return requests.slice(0, 12).map((request) => {
    const item = itemByStoreId.get(request.storeItemId);
    return `<article class="player-terminal-transaction-row"><span>${icon("use")}</span><div><strong>${escapeHtml(item?.name || "Inventory item")}</strong><small>${escapeHtml(request.quantity)} requested · ${escapeHtml(new Date(request.requestedAt).toLocaleString())}</small>${request.resolutionNote ? `<small>${escapeHtml(request.resolutionNote)}</small>` : ""}</div><div>${renderStatusPill(String(request.status || "pending").toUpperCase(), redemptionTone(request.status))}</div></article>`;
  }).join("");
}

export function renderInventoryPage(data, ui) {
  const category = ui.inventoryCategory || "All";
  const items = data.inventory.items.filter((item) => category === "All" || item.category === category);
  const requests = Array.isArray(data.inventory.redemptionRequests)
    ? data.inventory.redemptionRequests
    : [];
  const currencyCode = data.session.currencyCode;
  const capacityUsed = Number(data.inventory.capacity?.used ?? data.inventory.capacityUsed);
  const capacityMax = Number(data.inventory.capacity?.max ?? data.inventory.capacityMax);
  const hasCapacityPolicy = Number.isFinite(capacityUsed) && Number.isFinite(capacityMax) && capacityMax > 0;
  const capacityPercent = hasCapacityPolicy ? Math.round((capacityUsed / capacityMax) * 100) : 0;

  return `<section class="player-terminal-page player-terminal-inventory-page" data-page="inventory">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER ASSET STORAGE</small><h2>Inventory</h2><p>Inspect owned items and request administrator-reviewed redemption or use.</p></div>
      ${hasCapacityPolicy ? `<div class="player-terminal-capacity-meter"><div><small>STORAGE CAPACITY</small><strong>${escapeHtml(capacityUsed)} / ${escapeHtml(capacityMax)}</strong></div><span><i style="width:${capacityPercent}%"></i></span></div>` : renderStatusPill("CAPACITY NOT CONFIGURED", "cyan")}
    </header>

    <div class="player-terminal-inventory-toolbar"><div class="player-terminal-filter-row">${data.inventory.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-inventory-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>${renderStatusPill(`${items.length} ITEM TYPES`, "cyan")}</div>

    <div class="player-terminal-inventory-grid">${items.length ? items.map((item) => renderInventoryItem(item, currencyCode, requests)).join("") : renderEmptyState({ title: "No items in this category", detail: "Choose another category or acquire items through contracts, the store, or the marketplace.", iconName: "inventory" })}</div>

    <section class="player-terminal-panel player-terminal-transactions-panel">
      <header class="player-terminal-panel-header"><div><span>REDEMPTION REQUESTS</span><strong>${escapeHtml(requests.length)} recorded</strong></div>${renderStatusPill(`${requests.filter((request) => ["pending", "approved"].includes(request.status)).length} OPEN`, "amber")}</header>
      <div class="player-terminal-transaction-list">${renderRedemptionHistory(requests, data.inventory.items)}</div>
    </section>
  </section>`;
}
