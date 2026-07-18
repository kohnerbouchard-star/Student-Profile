import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

const INTENDED_USE_CATEGORIES = new Set(["consumable", "consumables", "access"]);

function itemTone(item) {
  if (item.state === "Available") return "green";
  if (item.state.includes("Reserved")) return "amber";
  if (item.state === "Unavailable") return "red";
  return "cyan";
}

function renderItemAction(item) {
  const availableActions = Array.isArray(item.availableActions) ? item.availableActions : [];
  const canUse = availableActions.some((action) => ["use", "inventory.use"].includes(action))
    && Number(item.quantityAvailable) > 0;
  const intendedUseControl = canUse || INTENDED_USE_CATEGORIES.has(String(item.category || "").toLowerCase());
  if (!intendedUseControl) return renderStatusPill(item.state, itemTone(item));
  if (canUse) {
    return `<button class="player-terminal-compact-button" type="button" data-player-inventory-use="${escapeHtml(item.id)}">${icon("use")} Request use</button>`;
  }
  return `<button class="player-terminal-compact-button" type="button" data-player-inventory-use="${escapeHtml(item.id)}" data-capability-status="integration-pending" disabled aria-disabled="true" title="This item action is not enabled for the current game.">${icon("use")} Request use · Pending</button>`;
}

function renderInventoryItem(item, fallbackCurrencyCode) {
  const currencyCode = item.currencyCode || fallbackCurrencyCode;
  return `<article class="player-terminal-inventory-card">
    <div class="player-terminal-inventory-image"><img src="${escapeHtml(item.image)}" alt="" /><span>${escapeHtml(item.quantityOwned ?? item.quantity)}×</span></div>
    <div class="player-terminal-inventory-copy"><small>${escapeHtml(item.category)} · ${escapeHtml(item.state)} · ${escapeHtml(item.itemVisibility || "player")}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-inventory-meta">
      <span><small>AVAILABLE</small><strong>${escapeHtml(item.quantityAvailable ?? item.quantity ?? 0)}</strong></span>
      <span><small>RESERVED</small><strong>${escapeHtml(item.quantityReserved ?? 0)}</strong></span>
      <span><small>TOTAL VALUE</small><strong>${escapeHtml(formatCurrency(item.totalOwnedValue ?? item.value, currencyCode))}</strong></span>
      ${renderItemAction(item)}
    </div>
  </article>`;
}

function renderCapacity(inventory) {
  const used = Number(inventory.capacityUsed);
  const max = Number(inventory.capacityMax);
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) {
    return `<div class="player-terminal-capacity-meter"><div><small>STORAGE CAPACITY</small><strong>Server managed</strong></div>${renderStatusPill("NO PLAYER LIMIT", "cyan")}</div>`;
  }
  const percent = Math.max(0, Math.min(100, Math.round((used / max) * 100)));
  return `<div class="player-terminal-capacity-meter"><div><small>STORAGE CAPACITY</small><strong>${escapeHtml(used)} / ${escapeHtml(max)}</strong></div><span><i style="width:${percent}%"></i></span></div>`;
}

export function renderInventoryPage(data, ui) {
  const category = ui.inventoryCategory || "All";
  const inventory = data.inventory;
  const items = inventory.items.filter((item) => category === "All" || item.category === category);
  const summary = inventory.summary || {};
  const itemTypes = Number.isFinite(Number(summary.itemTypes)) ? Number(summary.itemTypes) : inventory.items.length;
  const owned = Number.isFinite(Number(summary.quantityOwned)) ? Number(summary.quantityOwned) : inventory.items.reduce((total, item) => total + Number(item.quantityOwned ?? item.quantity ?? 0), 0);
  const reserved = Number.isFinite(Number(summary.quantityReserved)) ? Number(summary.quantityReserved) : inventory.items.reduce((total, item) => total + Number(item.quantityReserved || 0), 0);
  const available = Number.isFinite(Number(summary.quantityAvailable)) ? Number(summary.quantityAvailable) : Math.max(0, owned - reserved);

  return `<section class="player-terminal-page player-terminal-inventory-page" data-page="inventory">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER ASSET STORAGE</small><h2>Inventory</h2><p>Inspect authoritative owned, reserved, and available quantities. Item actions execute only when the backend publishes a supported policy.</p></div>
      ${renderCapacity(inventory)}
    </header>

    <div class="player-terminal-command-metrics">
      <article class="is-cyan"><span>${icon("inventory")}</span><div><small>ITEM TYPES</small><strong>${escapeHtml(itemTypes)}</strong><em>Distinct holdings</em></div></article>
      <article class="is-green"><span>${icon("check")}</span><div><small>AVAILABLE UNITS</small><strong>${escapeHtml(available)}</strong><em>Unreserved quantity</em></div></article>
      <article class="is-amber"><span>${icon("lock")}</span><div><small>RESERVED UNITS</small><strong>${escapeHtml(reserved)}</strong><em>Committed to another workflow</em></div></article>
    </div>

    <div class="player-terminal-inventory-toolbar"><div class="player-terminal-filter-row">${inventory.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-inventory-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>${renderStatusPill(`${items.length} ITEM TYPES`, "cyan")}</div>

    <div class="player-terminal-inventory-grid">${items.length ? items.map((item) => renderInventoryItem(item, data.session.currencyCode)).join("") : renderEmptyState({ title: "No items in this category", detail: "Choose another category or acquire items through contracts, the store, or the marketplace.", iconName: "inventory" })}</div>
  </section>`;
}
