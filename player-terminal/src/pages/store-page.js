import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { isResourceUnavailable } from "../api/resource-status.js";
import { resolveStoreItemMedia } from "../features/store/store-artwork.js";

function ownedQuantity(inventoryItems, itemId) {
  const holding = (Array.isArray(inventoryItems) ? inventoryItems : []).find((item) =>
    String(item?.storeItemId || item?.itemKey || "") === String(itemId || "")
  );
  const quantity = Number(holding?.quantity ?? holding?.quantityOwned ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function sellerKindLabel(kind) {
  if (kind === "business") return "BUSINESS";
  if (kind === "npc") return "NPC";
  return "SEEDED STORE";
}

function renderStoreOffer(item, offer) {
  const available = Number(offer.availableQuantity);
  const purchaseMode = String(offer.purchasability || (offer.sellerKind === "business" ? "business_offer" : "seeded_offer"));
  const purchasable = offer.status === "active" && available > 0 && offer.purchasable === true && purchaseMode !== "unsupported";
  const currencyCode = String(offer.currencyCode || item.currencyCode || "").trim().toUpperCase() || "—";
  const actionLabel = purchasable ? "Purchase" : available <= 0 ? "Sold out" : "Unavailable";
  const accessibleLabel = `${actionLabel} ${item.name} from ${offer.sellerName} at ${formatCurrency(offer.unitPrice, currencyCode)} per unit`;
  return `<div class="player-terminal-store-offer" role="listitem" data-player-store-offer-row="${escapeHtml(offer.offerKey)}">
    <div class="player-terminal-store-seller"><span class="is-${escapeHtml(offer.sellerKind)}">${escapeHtml(sellerKindLabel(offer.sellerKind))}</span><strong>${escapeHtml(offer.sellerName)}</strong><small>${escapeHtml(available)} available</small></div>
    <div class="player-terminal-store-offer-action"><span><small>UNIT PRICE</small><strong>${escapeHtml(formatCurrency(offer.unitPrice, currencyCode))}</strong></span><button class="player-terminal-compact-button" type="button" data-player-purchase="${escapeHtml(item.id)}" data-player-store-offer="${escapeHtml(offer.offerKey)}" data-player-store-purchase-mode="${escapeHtml(purchaseMode)}" aria-label="${escapeHtml(accessibleLabel)}" ${purchasable ? "" : "disabled"}>${icon("cart")} ${actionLabel}</button></div>
  </div>`;
}

function renderStoreItem(item, inventoryItems) {
  const offers = Array.isArray(item.offers) ? item.offers : [];
  const purchasableOffers = offers.filter((offer) => offer.status === "active" && Number(offer.availableQuantity) > 0 && offer.purchasable === true && offer.purchasability !== "unsupported");
  const soldOut = offers.length ? purchasableOffers.length === 0 : item.stock <= 0;
  const owned = ownedQuantity(inventoryItems, item.storeItemKey || item.id);
  const currencyCode = String(item.currencyCode || "").trim().toUpperCase() || "—";
  const bestPrice = offers.length
    ? (purchasableOffers.length ? Math.min(...purchasableOffers.map((offer) => Number(offer.unitPrice))) : null)
    : item.price;
  const offerCount = Number.isSafeInteger(item.offerCount) ? item.offerCount : (offers.length || 1);
  const media = resolveStoreItemMedia(item);
  return `<article class="player-terminal-store-card${soldOut ? " is-sold-out" : ""}">
    <div class="player-terminal-store-image"><img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" width="160" height="160" loading="lazy" decoding="async" data-store-item-media="true" data-store-item-media-state="${escapeHtml(media.kind)}" /><span>${escapeHtml(item.category)}</span></div>
    <div class="player-terminal-store-copy"><small>TOTAL STOCK ${escapeHtml(item.totalAvailableQuantity ?? item.stock)} · ${escapeHtml(item.sellerCount ?? (soldOut ? 0 : 1))} SELLER${Number(item.sellerCount ?? 1) === 1 ? "" : "S"} · OWNED ${escapeHtml(owned)}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>
    <div class="player-terminal-store-summary"><span><small>BEST AVAILABLE</small><strong>${bestPrice === null || bestPrice === undefined ? "Unavailable" : `From ${escapeHtml(formatCurrency(bestPrice, currencyCode))}`}</strong></span><small>${escapeHtml(offerCount)} OFFER${offerCount === 1 ? "" : "S"}</small></div>
    ${offers.length
      ? `<div class="player-terminal-store-offer-list" role="list" aria-label="Offers for ${escapeHtml(item.name)}">${offers.map((offer) => renderStoreOffer(item, offer)).join("")}</div>`
      : `<div class="player-terminal-store-footer"><strong>${escapeHtml(formatCurrency(item.price, currencyCode))}</strong><button class="player-terminal-compact-button" type="button" data-player-purchase="${escapeHtml(item.id)}" data-player-store-purchase-mode="seeded_offer" ${soldOut ? "disabled" : ""}>${icon("cart")} ${soldOut ? "Sold out" : "Purchase"}</button></div>`}
  </article>`;
}

function checkingBalanceForCurrency(data, currencyCode) {
  const normalizedCurrency = String(currencyCode || "").trim().toUpperCase();
  const balances = Array.isArray(data?.banking?.balances) ? data.banking.balances : [];
  const matchingRows = balances.filter((entry) => {
    const accountType = String(entry?.accountType || "").trim().toLowerCase();
    const code = String(entry?.currencyCode || "").trim().toUpperCase();
    return accountType === "checking" && code === normalizedCurrency;
  });
  if (matchingRows.length) {
    const total = matchingRows.reduce((sum, entry) => {
      const amount = Number(entry?.balance);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
    return Math.round(total * 100) / 100;
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
      <div><small>PLAYER COMMERCE NETWORK</small><h2>Store</h2><p>Compare each seller's exact unit price and available stock. A short-lived authoritative quote confirms the selected offer before any same-currency purchase settles.</p></div>
      <div class="player-terminal-heading-balance"><small>LOCAL AVAILABLE BALANCE</small><strong>${escapeHtml(availableBalance)}</strong>${globalWallet}${renderStatusPill(bankingUnavailable ? "BALANCE UNAVAILABLE" : "LOCAL WALLET", bankingUnavailable ? "amber" : "purple")}</div>
    </header>

    <div class="player-terminal-store-toolbar">
      <div class="player-terminal-filter-row">${data.store.categories.map((item) => `<button type="button" class="${item === category ? "active" : ""}" data-player-store-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
      <label class="player-terminal-search-field">${icon("eye")}<input type="search" placeholder="Search store" data-player-store-search /></label>
    </div>

    <div class="player-terminal-catalog-grid">${items.length ? items.map((item) => renderStoreItem(item, data.inventory.items)).join("") : renderEmptyState({ title: "No store items available", detail: "Choose another category or wait for the administrator to publish inventory.", iconName: "store" })}</div>

  </section>`;
}
