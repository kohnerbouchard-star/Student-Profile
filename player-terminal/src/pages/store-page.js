import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isResourceUnavailable } from "../api/resource-status.js";
import { resolveStoreItemImage } from "../features/store/store-artwork.js";

function ownedQuantity(inventoryItems, itemId) {
  const holding = (Array.isArray(inventoryItems) ? inventoryItems : []).find((item) =>
    String(item?.storeItemId || item?.itemKey || "") === String(itemId || "")
  );
  const quantity = Number(holding?.quantity ?? holding?.quantityOwned ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function renderStoreItem(item, inventoryItems) {
  const soldOut = item.stock <= 0;
  const owned = ownedQuantity(inventoryItems, item.id);
  const currencyCode = String(item.currencyCode || "").trim().toUpperCase() || "—";
  return `<article class="player-terminal-store-card${soldOut ? " is-sold-out" : ""}">
    <div class="player-terminal-store-image"><img src="${escapeHtml(resolveStoreItemImage(item))}" alt="" /><span>${escapeHtml(item.category)}</span></div>
    <div class="player-terminal-store-copy"><small>STOCK ${escapeHtml(item.stock)} · OWNED ${escapeHtml(owned)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-store-footer"><strong>${escapeHtml(formatCurrency(item.price, currencyCode))}</strong><button class="player-terminal-compact-button" type="button" data-player-purchase="${escapeHtml(item.id)}" ${soldOut ? "disabled" : ""}>${icon("cart")} ${soldOut ? "Sold out" : "Purchase"}</button></div>
  </article>`;
}

function checkingBalanceForCurrency(data, currencyCode) {
  const normalizedCurrency = String(currencyCode || "").trim().toUpperCase();
  const balances = Array.isArray(data?.banking?.balances) ? data.banking.balances : [];
  const row = balances.find((entry) => {
    const accountType = String(entry?.accountType || "").trim().toLowerCase();
    const code = String(entry?.currencyCode || "").trim().toUpperCase();
    return ["cash", "checking"].includes(accountType) && code === normalizedCurrency;
  });
  if (row) {
    const amount = Number(row.balance);
    return Number.isFinite(amount) ? amount : 0;
  }

  const checkingCode = String(data?.banking?.checking?.currencyCode || "").trim().toUpperCase();
  if (checkingCode === normalizedCurrency) {
    const amount = Number(data?.banking?.checking?.available);
    return Number.isFinite(amount) ? amount : 0;
  }
  return 0;
}

export function renderStorePage(data, ui) {
  const category = ui.storeCategory || "All";
  const items = data.store.items.filter((item) => category === "All" || item.category === category);
  const localCurrencyCode = String(data.session.currencyCode || "").trim().toUpperCase() || "ECO";
  const bankingUnavailable = isResourceUnavailable(data, "banking");
  const localBalance = checkingBalanceForCurrency(data, localCurrencyCode);
  const ecoBalance = checkingBalanceForCurrency(data, "ECO");
  const availableBalance = bankingUnavailable
    ? "Unavailable"
    : formatCurrency(localBalance, localCurrencyCode);
  const globalWallet = !bankingUnavailable && localCurrencyCode !== "ECO"
    ? `<small>GLOBAL SETTLEMENT WALLET ${escapeHtml(formatCurrency(ecoBalance, "ECO"))}</small>`
    : "";

  return `<section class="player-terminal-page player-terminal-store-page" data-page="store">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER COMMERCE NETWORK</small><h2>Store</h2><p>Catalog prices retain their authored currency. The authoritative quote converts the final amount into your ${escapeHtml(localCurrencyCode)} local wallet before purchase.</p></div>
      <div class="player-terminal-heading-balance"><small>LOCAL AVAILABLE BALANCE</small><strong>${escapeHtml(availableBalance)}</strong>${globalWallet}${renderStatusPill(bankingUnavailable ? "BALANCE UNAVAILABLE" : "LOCAL WALLET", bankingUnavailable ? "amber" : "purple")}</div>
    </header>

    <div class="player-terminal-store-toolbar">
      <div class="player-terminal-filter-row">${data.store.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-store-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
      <label class="player-terminal-search-field">${icon("eye")}<input type="search" placeholder="Search store" data-player-store-search /></label>
    </div>

    <div class="player-terminal-catalog-grid">${items.length ? items.map((item) => renderStoreItem(item, data.inventory.items)).join("") : renderEmptyState({ title: "No store items available", detail: "Choose another category or wait for the administrator to publish inventory.", iconName: "store" })}</div>

  </section>`;
}
