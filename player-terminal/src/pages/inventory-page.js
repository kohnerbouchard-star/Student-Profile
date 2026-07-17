import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function renderInventoryItem(item, currencyCode) {
  const usable = Array.isArray(item.availableActions)
    ? item.availableActions.some((action) => ["use", "inventory.use"].includes(action))
    : item.category === "Consumables" || item.category === "Access";
  return `<article class="player-terminal-inventory-card">
    <div class="player-terminal-inventory-image"><img src="${escapeHtml(item.image)}" alt="" /><span>${escapeHtml(item.quantity)}×</span></div>
    <div class="player-terminal-inventory-copy"><small>${escapeHtml(item.category)} · ${escapeHtml(item.state)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-inventory-meta"><span><small>TOTAL VALUE</small><strong>${escapeHtml(formatCurrency(item.value, currencyCode))}</strong></span>${usable ? `<button class="player-terminal-compact-button" type="button" data-player-inventory-use="${escapeHtml(item.id)}">${icon("use")} Use item</button>` : renderStatusPill(item.state, item.state === "Equipped" ? "green" : "cyan")}</div>
  </article>`;
}

export function renderInventoryPage(data, ui) {
  const category = ui.inventoryCategory || "All";
  const items = data.inventory.items.filter((item) => category === "All" || item.category === category);
  const currencyCode = data.session.currencyCode;
  const capacityUsed = Number(data.inventory.capacity?.used ?? data.inventory.capacityUsed);
  const capacityMax = Number(data.inventory.capacity?.max ?? data.inventory.capacityMax);
  const hasCapacityPolicy = Number.isFinite(capacityUsed) && Number.isFinite(capacityMax) && capacityMax > 0;
  const capacityPercent = hasCapacityPolicy ? Math.round((capacityUsed / capacityMax) * 100) : 0;

  return `<section class="player-terminal-page player-terminal-inventory-page" data-page="inventory">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER ASSET STORAGE</small><h2>Inventory</h2><p>Inspect owned materials, equipment, consumables, and access items assigned to your player profile.</p></div>
      ${hasCapacityPolicy ? `<div class="player-terminal-capacity-meter"><div><small>STORAGE CAPACITY</small><strong>${escapeHtml(capacityUsed)} / ${escapeHtml(capacityMax)}</strong></div><span><i style="width:${capacityPercent}%"></i></span></div>` : renderStatusPill("CAPACITY NOT CONFIGURED", "cyan")}
    </header>

    <div class="player-terminal-inventory-toolbar"><div class="player-terminal-filter-row">${data.inventory.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-inventory-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>${renderStatusPill(`${items.length} ITEM TYPES`, "cyan")}</div>

    <div class="player-terminal-inventory-grid">${items.length ? items.map((item) => renderInventoryItem(item, currencyCode)).join("") : renderEmptyState({ title: "No items in this category", detail: "Choose another category or acquire items through contracts, the store, or the marketplace.", iconName: "inventory" })}</div>
  </section>`;
}
