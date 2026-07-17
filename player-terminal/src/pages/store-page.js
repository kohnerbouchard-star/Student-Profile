import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isResourceUnavailable } from "../api/resource-status.js";

function renderStoreItem(item, currencyCode) {
  const soldOut = item.stock <= 0;
  return `<article class="player-terminal-store-card${soldOut ? " is-sold-out" : ""}">
    <div class="player-terminal-store-image"><img src="${escapeHtml(item.image)}" alt="" /><span>${escapeHtml(item.category)}</span></div>
    <div class="player-terminal-store-copy"><small>STOCK ${escapeHtml(item.stock)} · OWNED ${escapeHtml(item.owned)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-store-footer"><strong>${escapeHtml(formatCurrency(item.price, currencyCode))}</strong><button class="player-terminal-compact-button" type="button" data-player-purchase="${escapeHtml(item.id)}" ${soldOut ? "disabled" : ""}>${icon("cart")} ${soldOut ? "Sold out" : "Purchase"}</button></div>
  </article>`;
}

export function renderStorePage(data, ui) {
  const category = ui.storeCategory || "All";
  const items = data.store.items.filter((item) => category === "All" || item.category === category);
  const currencyCode = data.session.currencyCode;
  const bankingUnavailable = isResourceUnavailable(data, "banking");
  const availableBalance = bankingUnavailable
    ? "Unavailable"
    : formatCurrency(data.banking.checking.available, currencyCode);

  return `<section class="player-terminal-page player-terminal-store-page" data-page="store">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER COMMERCE NETWORK</small><h2>Store</h2><p>Review equipment, materials, consumables, and access items available to your player account.</p></div>
      <div class="player-terminal-heading-balance"><small>AVAILABLE BALANCE</small><strong>${escapeHtml(availableBalance)}</strong>${renderStatusPill(bankingUnavailable ? "BALANCE UNAVAILABLE" : "LIVE INVENTORY", bankingUnavailable ? "amber" : "purple")}</div>
    </header>

    <div class="player-terminal-store-toolbar">
      <div class="player-terminal-filter-row">${data.store.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-store-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
      <label class="player-terminal-search-field">${icon("eye")}<input type="search" placeholder="Search store" data-player-store-search /></label>
    </div>

    <div class="player-terminal-catalog-grid">${items.length ? items.map((item) => renderStoreItem(item, currencyCode)).join("") : renderEmptyState({ title: "No store items available", detail: "Choose another category or wait for the administrator to publish inventory.", iconName: "store" })}</div>

  </section>`;
}
