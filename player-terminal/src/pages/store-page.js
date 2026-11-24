import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isResourceReady, isResourceUnavailable } from "../api/resource-status.js";
import { resolveStoreItemMedia } from "../features/store/store-artwork.js";
import {
  storeCheckingAccounts,
  storeFundingAvailability,
} from "../features/store/store-funding-intent.js";

function inventoryOwnershipKey(holding) {
  const key = holding?.storeItemId || holding?.itemKey;
  return typeof key === "string" && /^[a-z0-9][a-z0-9._-]{0,159}$/u.test(key) ? key : null;
}

function ownedQuantity(data, item) {
  const itemKeys = [item.storeItemKey || item.id, item.canonicalItemKey].filter(Boolean).map(String);
  const inventoryItems = data.inventory?.items;
  // Statusless render fixtures can still use their supplied Inventory snapshot.
  if (!Array.isArray(inventoryItems) || data.inventory.ownershipReadUnverified || !itemKeys.length
    || (data.resourceStatus != null && !isResourceReady(data, "inventory"))) return null;
  const holdings = inventoryItems.filter((holding) => itemKeys.includes(inventoryOwnershipKey(holding)));
  // An unattributable row prevents an authoritative absence claim.
  if (!holdings.length) return inventoryItems.every(inventoryOwnershipKey) ? 0 : null;
  if (holdings.length !== 1 || holdings[0].ownershipQuantityUnverified) return null;
  const raw = holdings[0].quantity ?? holdings[0].quantityOwned;
  const quantity = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

function sellerKindLabel(kind) {
  if (kind === "business") return "BUSINESS";
  if (kind === "npc") return "NPC";
  return "SEEDED STORE";
}

function renderStoreOffer(item, offer, data) {
  const available = Number(offer.availableQuantity);
  const purchaseMode = String(offer.purchasability || (offer.sellerKind === "business" ? "business_offer" : "system_offer"));
  const currencyCode = String(offer.currencyCode || item.currencyCode || "").trim().toUpperCase() || "—";
  const fundingReady = storeFundingAvailability(data, currencyCode).ready;
  const commerciallyAvailable = offer.status === "active" && available > 0 && offer.purchasable === true;
  const purchasable = commerciallyAvailable && fundingReady;
  const actionLabel = purchasable
    ? "Purchase"
    : available <= 0
      ? "Sold out"
      : commerciallyAvailable
        ? "Funding unavailable"
        : "Unavailable";
  const accessibleLabel = `${actionLabel} ${item.name} from ${offer.sellerName} at ${formatCurrency(offer.unitPrice, currencyCode)} per unit`;
  return `<div class="player-terminal-store-offer" role="listitem" data-player-store-offer-row="${escapeHtml(offer.offerKey)}">
    <div class="player-terminal-store-seller"><span class="is-${escapeHtml(offer.sellerKind)}">${escapeHtml(sellerKindLabel(offer.sellerKind))}</span><strong>${escapeHtml(offer.sellerName)}</strong><small>${escapeHtml(available)} available</small></div>
    <div class="player-terminal-store-offer-action"><span><small>UNIT PRICE</small><strong>${escapeHtml(formatCurrency(offer.unitPrice, currencyCode))}</strong></span><button class="player-terminal-compact-button" type="button" data-player-purchase="${escapeHtml(item.id)}" data-player-store-offer="${escapeHtml(offer.offerKey)}" data-player-store-purchase-mode="${escapeHtml(purchaseMode)}" aria-label="${escapeHtml(accessibleLabel)}" ${purchasable ? "" : "disabled"}>${icon("cart")} ${actionLabel}</button></div>
  </div>`;
}

function renderStoreItem(item, data) {
  const offers = Array.isArray(item.offers) ? item.offers : [];
  const purchasableOffers = offers.filter((offer) => offer.status === "active" && Number(offer.availableQuantity) > 0 && offer.purchasable === true);
  const soldOut = offers.length ? purchasableOffers.length === 0 : item.stock <= 0;
  const owned = ownedQuantity(data, item);
  const currencyCode = String(item.currencyCode || "").trim().toUpperCase() || "—";
  const offerCurrencies = new Set(purchasableOffers.map((offer) => String(offer.currencyCode || "").trim().toUpperCase()));
  const comparableCurrency = offerCurrencies.size === 1 ? [...offerCurrencies][0] : "";
  const bestPrice = offers.length && comparableCurrency
    ? Math.min(...purchasableOffers.map((offer) => Number(offer.unitPrice)))
    : offers.length
      ? null
      : item.price;
  const offerCount = Number.isSafeInteger(item.offerCount) ? item.offerCount : (offers.length || 1);
  const media = resolveStoreItemMedia(item);
  const summaryLabel = offerCurrencies.size > 1 ? "PRICES BY SELLER" : "BEST AVAILABLE";
  const summaryValue = offerCurrencies.size > 1
    ? `${offerCurrencies.size} currencies · compare offers`
    : bestPrice === null || bestPrice === undefined
      ? "Unavailable"
      : `From ${formatCurrency(bestPrice, comparableCurrency || currencyCode)}`;
  return `<article class="player-terminal-store-card${soldOut ? " is-sold-out" : ""}">
    <div class="player-terminal-store-image"><img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" width="160" height="160" loading="lazy" decoding="async" data-store-item-media="true" data-store-item-media-state="${escapeHtml(media.kind)}" /><span>${escapeHtml(item.category)}</span></div>
    <div class="player-terminal-store-copy"><small>TOTAL STOCK ${escapeHtml(item.totalAvailableQuantity ?? item.stock)} · ${escapeHtml(item.sellerCount ?? (soldOut ? 0 : 1))} SELLER${Number(item.sellerCount ?? 1) === 1 ? "" : "S"} · OWNED ${escapeHtml(owned ?? "UNAVAILABLE")}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-store-summary"><span><small>${escapeHtml(summaryLabel)}</small><strong>${escapeHtml(summaryValue)}</strong></span><small>${escapeHtml(offerCount)} OFFER${offerCount === 1 ? "" : "S"}</small></div>
    ${offers.length
      ? `<div class="player-terminal-store-offer-list" role="list" aria-label="Offers for ${escapeHtml(item.name)}">${offers.map((offer) => renderStoreOffer(item, offer, data)).join("")}</div>`
      : `<div class="player-terminal-store-footer"><strong>${escapeHtml(formatCurrency(item.price, currencyCode))}</strong><button class="player-terminal-compact-button" type="button" disabled>${icon("cart")} No active seller offer</button></div>`}
  </article>`;
}

export function renderStorePage(data, ui) {
  const category = ui.storeCategory || "All";
  const items = data.store.items.filter((item) => category === "All" || item.category === category);
  const checkingAccounts = storeCheckingAccounts(data);
  const fundingUnavailable = isResourceUnavailable(data, "bankingFx") || checkingAccounts.length === 0;
  const fundingSummary = fundingUnavailable
    ? "Unavailable"
    : `${checkingAccounts.length} Checking account${checkingAccounts.length === 1 ? "" : "s"}`;

  return `<section class="player-terminal-page player-terminal-store-page" data-page="store">
    <header class="player-terminal-page-heading">
      <div><small>PLAYER COMMERCE NETWORK</small><h2>Store</h2><p>Compare each seller's exact price and stock, then fund the authoritative bill from one to three canonical Checking accounts. Retail FX is disclosed before confirmation.</p></div>
      <div class="player-terminal-heading-balance"><small>CHECKING FUNDING</small><strong>${escapeHtml(fundingSummary)}</strong><small>${fundingUnavailable ? "Catalog remains available; checkout is disabled until Banking FX evidence loads." : "The final account receives the exact server-derived remainder."}</small>${renderStatusPill(fundingUnavailable ? "FUNDING UNAVAILABLE" : "FUNDING READY", fundingUnavailable ? "amber" : "purple")}</div>
    </header>

    <div class="player-terminal-store-toolbar">
      <div class="player-terminal-filter-row">${data.store.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-store-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
      <label class="player-terminal-search-field">${icon("eye")}<input type="search" placeholder="Search store" data-player-store-search /></label>
    </div>

    <div class="player-terminal-catalog-grid">${items.length ? items.map((item) => renderStoreItem(item, data)).join("") : renderEmptyState({ title: "No store items available", detail: "Choose another category or wait for the administrator to publish inventory.", iconName: "store" })}</div>

  </section>`;
}
