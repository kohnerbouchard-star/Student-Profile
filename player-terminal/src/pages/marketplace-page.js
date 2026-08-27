import { escapeHtml, formatCurrency, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";
import { resolveLegacyMarketplaceItemImage } from "../features/store/store-artwork.js";

function statusTone(status) {
  if (["active", "completed", "resolved_buyer", "resolved_seller"].includes(status)) return "green";
  if (["moderation_hold", "draft", "reserved", "settling", "disputed", "open"].includes(status)) return "amber";
  if (["rejected", "cancelled", "expired", "released", "refunded"].includes(status)) return "red";
  return "cyan";
}
function localDate(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unavailable";
}
function decimalInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}
function listingCard(listing, selected) {
  const rating = Number(listing.rating);
  const sellerContext = Number.isFinite(rating)
    ? `<span aria-label="Seller ${escapeHtml(listing.seller)}, rated ${escapeHtml(rating.toFixed(1))} out of 5">Seller ${escapeHtml(listing.seller)} · ${escapeHtml(rating.toFixed(1))} ${icon("star")}</span>`
    : `<span>Seller ${escapeHtml(listing.seller)}${listing.sellerReference ? ` · ${escapeHtml(listing.sellerReference)}` : ""}</span>`;
  return `<button class="player-terminal-marketplace-card${selected ? " active" : ""}" type="button" data-player-marketplace-select="${escapeHtml(listing.id)}">
    <span class="player-terminal-marketplace-image"><img src="${escapeHtml(resolveLegacyMarketplaceItemImage(listing.image))}" alt="" /></span>
    <div><small>${escapeHtml(listing.category)} · ${escapeHtml(listing.country)}</small><strong>${escapeHtml(listing.name)}</strong><p>${escapeHtml(listing.description)}</p>${sellerContext}</div>
    <div><strong>${escapeHtml(formatCurrency(listing.unitPrice, listing.currencyCode))}</strong><small>${escapeHtml(formatNumber(listing.quantity))} available</small></div>
  </button>`;
}
function listingControls(listing) {
  const activate = listing.status === "draft" ? `<form data-player-form="marketplace-activate-${escapeHtml(listing.id)}" data-endpoint="marketplaceActivate"><input name="listingId" type="hidden" value="${escapeHtml(listing.id)}" /><input name="expectedVersion" type="hidden" value="${escapeHtml(listing.version)}" /><button class="player-terminal-compact-button" type="submit">Activate</button></form>` : "";
  const cancel = ["draft", "active", "moderation_hold"].includes(listing.status) ? `<form data-player-form="marketplace-cancel-${escapeHtml(listing.id)}" data-endpoint="marketplaceCancel"><input name="listingId" type="hidden" value="${escapeHtml(listing.id)}" /><input name="expectedVersion" type="hidden" value="${escapeHtml(listing.version)}" /><button class="player-terminal-compact-button" type="submit">Cancel</button></form>` : "";
  return `${activate}${cancel}`;
}
function disputePanel(market) {
  const disputed = new Set(market.disputes.map((item) => item.orderId));
  const eligible = market.orders.filter((order) => order.role === "buyer" && order.status === "completed" && !disputed.has(order.id));
  return `<section class="player-terminal-panel player-terminal-marketplace-mine"><header class="player-terminal-panel-header"><div><span>ORDER SUPPORT</span><strong>Disputes and refunds</strong></div>${renderStatusPill(market.disputesEnabled ? `${market.disputeWindowDays} DAY WINDOW` : "DISABLED", market.disputesEnabled ? "cyan" : "amber")}</header><div>${market.disputes.length ? market.disputes.map((item) => `<article><div><strong>${escapeHtml(item.id)}</strong><small>${escapeHtml(item.reason)}</small>${item.resolutionNote ? `<small>${escapeHtml(item.resolutionNote)}</small>` : ""}</div>${renderStatusPill(item.status.replaceAll("_", " "), statusTone(item.status))}</article>`).join("") : renderEmptyState({ title: "No Marketplace disputes", detail: "Completed purchases remain eligible for administrator review during the dispute window.", iconName: "marketplace" })}</div>${market.disputesEnabled && eligible.length ? `<details class="player-terminal-disclosure"><summary><span>${icon("alert")}</span><div><strong>Open a dispute</strong><small>Administrator review is required for a refund</small></div>${icon("chevronRight")}</summary><form data-player-form="marketplace-dispute" data-endpoint="marketplaceDispute"><label>ORDER<select name="orderId" required>${eligible.map((order) => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.itemName)} · ${escapeHtml(formatCurrency(order.total, order.currencyCode))}</option>`).join("")}</select></label><label>REASON<textarea name="reason" minlength="10" maxlength="1000" required placeholder="Describe the problem with this completed order."></textarea></label><button class="player-terminal-secondary-button" type="submit">${icon("alert")} Submit dispute</button></form></details>` : ""}</section>`;
}
function checkingAccounts(data) {
  const balances = Array.isArray(data?.bankingFx?.balances) ? data.bankingFx.balances : [];
  return balances.filter((account) =>
    account?.accountKind === "checking" &&
    /^bac_[0-9a-f]{32}$/u.test(String(account.accountKey || "")) &&
    /^[A-Z0-9_]{3,16}$/u.test(String(account.currencyCode || "")) &&
    Number.isFinite(Number(account.availableAmount))
  );
}
function accountOptions(accounts, selectedKey = "") {
  return `<option value="">Choose Checking account</option>${accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}" ${account.accountKey === selectedKey ? "selected" : ""}>${escapeHtml(account.currencyCode)} · ${escapeHtml(formatCurrency(account.availableAmount, account.currencyCode))} available</option>`).join("")}`;
}
function fundingAccountRows(accounts, estimatedTotal) {
  return [0, 1, 2].map((index) => {
    const first = index === 0 ? accounts[0] : null;
    return `<fieldset data-player-marketplace-funding-row><legend>ACCOUNT ${index + 1}</legend><label>CHECKING ACCOUNT<select name="sourceAccountKey" ${index === 0 ? "required" : ""}>${accountOptions(accounts, first?.accountKey || "")}</select></label><label>LISTING-CURRENCY ALLOCATION<input name="targetAmount" type="number" min="0.0001" step="0.0001" value="${index === 0 ? escapeHtml(decimalInput(estimatedTotal)) : ""}" ${index === 0 ? "required" : ""} /></label></fieldset>`;
  }).join("");
}
function quoteLine(line, targetCurrencyCode) {
  const treatment = line.requiresFx
    ? `${line.sourceCurrencyCode} → ${targetCurrencyCode} retail FX`
    : `${targetCurrencyCode} same currency`;
  return `<article><div><strong>Account ${escapeHtml(line.lineNumber)} · ${escapeHtml(treatment)}</strong><small>${escapeHtml(formatCurrency(line.sourceDebit, line.sourceCurrencyCode))} debited for ${escapeHtml(formatCurrency(line.targetContribution, targetCurrencyCode))}</small><small>Reference ${escapeHtml(formatNumber(line.referenceRate))} · Customer ${escapeHtml(formatNumber(line.customerRate))} · Effective ${escapeHtml(formatNumber(line.effectiveRate))}</small><small>${escapeHtml(line.roundingDisclosure)}</small></div>${renderStatusPill(line.requiresFx ? "1.00% RETAIL FX" : "RATE 1", line.requiresFx ? "purple" : "green")}</article>`;
}
function fundingQuotePanel(quote) {
  if (!quote) return "";
  const expired = !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now();
  return `<section class="player-terminal-marketplace-funding-quote" data-player-marketplace-funding-quote><header><div><small>IMMUTABLE FUNDING QUOTE</small><strong>${escapeHtml(formatCurrency(quote.buyerTotal, quote.currencyCode))} total</strong><span>Expires ${escapeHtml(localDate(quote.expiresAt))}</span></div>${renderStatusPill(expired ? "EXPIRED" : quote.fundingQuote.requiresFx ? "RETAIL FX" : "SAME CURRENCY", expired ? "red" : quote.fundingQuote.requiresFx ? "purple" : "green")}</header><dl class="player-terminal-marketplace-facts"><div><dt>ITEM SUBTOTAL</dt><dd>${escapeHtml(formatCurrency(quote.subtotal, quote.currencyCode))}</dd></div><div><dt>MARKETPLACE FEE</dt><dd>${escapeHtml(formatCurrency(quote.feeAmount, quote.currencyCode))}</dd></div><div><dt>TAX</dt><dd>${escapeHtml(formatCurrency(quote.taxAmount, quote.currencyCode))}</dd></div><div><dt>SELLER PROCEEDS</dt><dd>${escapeHtml(formatCurrency(quote.sellerProceeds, quote.currencyCode))}</dd></div></dl><div class="player-terminal-marketplace-mine">${quote.fundingQuote.lines.map((line) => quoteLine(line, quote.currencyCode)).join("")}</div><p>Funding, seller credit, fee/tax distribution, listing mutation, and item delivery commit together. No reusable foreign-currency balance is created.</p><form data-player-marketplace-funding-form="settlement" data-reservation-id="${escapeHtml(quote.reservationKey)}"><button class="player-terminal-primary-button" type="submit" ${expired ? "disabled" : ""}>${icon("cart")} Confirm quoted purchase</button></form></section>`;
}
function purchasePanel(data, market, selected, enabled) {
  if (!selected) return renderEmptyState({ title: "No listing selected", detail: "No active Marketplace listing is available.", iconName: "marketplace" });
  const accounts = checkingAccounts(data);
  const feeRate = Number.isFinite(Number(market.feeRate)) ? Number(market.feeRate) : 0;
  const estimatedTotal = selected.unitPrice * (1 + feeRate / 100);
  const currentQuote = market.currentFundingQuote?.listingKey === selected.id
    ? market.currentFundingQuote
    : null;
  const accountForm = accounts.length
    ? `<form data-player-marketplace-funding-form="quote" data-listing-id="${escapeHtml(selected.id)}"><label>QUANTITY<input name="quantity" type="number" min="1" max="${escapeHtml(selected.quantity)}" value="1" required /></label><div class="player-terminal-marketplace-funding-accounts">${fundingAccountRows(accounts, estimatedTotal)}</div><div class="player-terminal-marketplace-total"><small>ESTIMATED LISTING-CURRENCY BILL</small><strong data-player-marketplace-estimated-total>${escapeHtml(formatCurrency(estimatedTotal, selected.currencyCode))}</strong><span>Allocated <strong data-player-marketplace-allocated-total>${escapeHtml(formatCurrency(estimatedTotal, selected.currencyCode))}</strong> · Remaining <strong data-player-marketplace-remaining-total>${escapeHtml(formatCurrency(0, selected.currencyCode))}</strong></span></div><button class="player-terminal-primary-button" type="submit" ${enabled ? "" : "disabled"}>${icon("eye")} Review exact funding quote</button></form>`
    : `<div class="player-terminal-route-error" role="status"><small>CHECKING ACCOUNTS REQUIRED</small><p>Open Banking and provision an active Checking account before purchasing from Marketplace.</p></div>`;
  return `<header class="player-terminal-panel-header"><div><span>LISTING REVIEW</span><strong>${escapeHtml(selected.name)}</strong></div>${renderStatusPill(selected.condition, selected.condition === "New" ? "green" : "amber")}</header><div class="player-terminal-marketplace-detail-hero"><span><img src="${escapeHtml(resolveLegacyMarketplaceItemImage(selected.image))}" alt="" /></span><div><small>${escapeHtml(selected.category)} · ${escapeHtml(selected.country)}</small><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description)}</p></div></div><dl class="player-terminal-marketplace-facts"><div><dt>UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(selected.unitPrice, selected.currencyCode))}</dd></div><div><dt>AVAILABLE</dt><dd>${escapeHtml(selected.quantity)}</dd></div><div><dt>SELLER</dt><dd>${escapeHtml(selected.seller)}</dd></div><div><dt>EXPIRES</dt><dd>${escapeHtml(localDate(selected.expiresAt))}</dd></div></dl><p class="player-terminal-form-error" data-player-marketplace-funding-error role="alert" tabindex="-1" hidden></p>${accountForm}${fundingQuotePanel(currentQuote)}`;
}

export function renderMarketplacePage(data, ui) {
  const source = data.marketplace && typeof data.marketplace === "object" ? data.marketplace : {};
  const market = {
    ...source,
    categories: Array.isArray(source.categories) ? source.categories : ["All"],
    listings: Array.isArray(source.listings) ? source.listings : [],
    myListings: Array.isArray(source.myListings) ? source.myListings : [],
    reservations: Array.isArray(source.reservations) ? source.reservations : [],
    orders: Array.isArray(source.orders) ? source.orders : [],
    disputes: Array.isArray(source.disputes) ? source.disputes : [],
    disputesEnabled: source.disputesEnabled !== false,
    disputeWindowDays: Number.isFinite(Number(source.disputeWindowDays)) ? Number(source.disputeWindowDays) : 7,
    listingDurationHours: Number.isFinite(Number(source.listingDurationHours)) ? Number(source.listingDurationHours) : 168,
    volume: Number.isFinite(Number(source.volume)) ? Number(source.volume) : 0,
    activeSellers: Number.isFinite(Number(source.activeSellers)) ? Number(source.activeSellers) : 0,
  };
  const category = ui.marketplaceCategory || "All";
  const filtered = market.listings.filter((item) => category === "All" || item.category === category);
  const selected = market.listings.find((item) => item.id === ui.marketplaceListingId) || filtered[0] || market.listings[0];
  const currencyCode = data.session.currencyCode || "ECO";
  const platformFeeRate = Number.isFinite(Number(market.platformFeeRate)) ? Number(market.platformFeeRate) : 0;
  const taxRate = Number.isFinite(Number(market.taxRate)) ? Number(market.taxRate) : 0;
  const totalRate = Number.isFinite(Number(market.feeRate)) ? Number(market.feeRate) : platformFeeRate + taxRate;
  const listableItems = data.inventory.items.filter((item) => Number(item.quantityAvailable ?? item.quantity) > 0 && item.itemKey);
  const enabled = market.enabled !== false;
  return `<section class="player-terminal-page player-terminal-marketplace-page"><div class="player-terminal-page-heading"><div><small>PLAYER COMMERCE</small><h2>Marketplace</h2><p>Buy from other players or publish a fixed-price listing. Listing currency, Inventory reservation, split Checking funding, retail FX, settlement, fees, disputes, and refunds are server-authoritative.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(enabled ? `${market.listings.length} LISTINGS` : "MARKETPLACE DISABLED", enabled ? "cyan" : "red")}</div></div>
    <div class="player-terminal-marketplace-summary"><article><small>MARKET VOLUME</small><strong>${escapeHtml(formatCurrency(market.volume, currencyCode))}</strong><span>Committed orders</span></article><article><small>ACTIVE SELLERS</small><strong>${escapeHtml(formatNumber(market.activeSellers))}</strong><span>Current game</span></article><article><small>FEES + TAX</small><strong>${escapeHtml(totalRate.toFixed(1))}%</strong><span>${escapeHtml(platformFeeRate.toFixed(1))}% fee · ${escapeHtml(taxRate.toFixed(1))}% tax</span></article><article><small>YOUR LISTINGS</small><strong>${escapeHtml(formatNumber(market.myListings.length))}</strong><span>${escapeHtml(formatNumber(market.myListings.reduce((sum, item) => sum + item.quantity, 0)))} unpurchased units</span></article></div>
    <div class="player-terminal-filter-row">${market.categories.map((item) => `<button class="${item === category ? "active" : ""}" type="button" data-player-marketplace-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
    <div class="player-terminal-marketplace-layout"><section class="player-terminal-panel player-terminal-marketplace-list"><header class="player-terminal-panel-header"><div><span>OPEN LISTINGS</span><strong>${escapeHtml(filtered.length)} results</strong></div>${renderStatusPill("LISTING CURRENCY", "purple")}</header><div>${filtered.length ? filtered.map((item) => listingCard(item, item.id === selected?.id)).join("") : renderEmptyState({ title: "No open listings", detail: enabled ? "Choose another category or return after players activate listings." : "Marketplace policy is currently disabled.", iconName: "marketplace" })}</div></section>
      <section class="player-terminal-panel player-terminal-marketplace-detail">${purchasePanel(data, market, selected, enabled)}</section>
      <section class="player-terminal-panel player-terminal-marketplace-create"><header class="player-terminal-panel-header"><div><span>SELL INVENTORY</span><strong>Create a draft listing</strong></div>${renderStatusPill("RESERVES INVENTORY", "amber")}</header><details class="player-terminal-disclosure"><summary><span>${icon("tag")}</span><div><strong>List an inventory item</strong><small>Draft first, then activate or submit for moderation</small></div>${icon("chevronRight")}</summary><form data-player-form="marketplace-listing" data-endpoint="marketplaceListing"><label>INVENTORY ITEM<select name="itemKey" required ${enabled && listableItems.length ? "" : "disabled"}>${listableItems.map((item) => `<option value="${escapeHtml(item.itemKey)}">${escapeHtml(item.name)} · ${escapeHtml(item.quantityAvailable ?? item.quantity)} available</option>`).join("") || `<option value="">No inventory available</option>`}</select></label><label>QUANTITY<input name="quantity" type="number" min="1" value="1" required ${enabled && listableItems.length ? "" : "disabled"} /></label><label>UNIT PRICE<input name="unitPrice" type="number" min="0.0001" step="0.0001" required placeholder="0" /></label><label>CONDITION<select name="condition"><option value="New">New</option><option value="Like New">Like New</option><option value="Used" selected>Used</option><option value="Damaged">Damaged</option></select></label><label>EXPIRY<select name="durationHours"><option value="24">24 hours</option><option value="72">3 days</option><option value="${escapeHtml(market.listingDurationHours)}" selected>Policy default · ${escapeHtml(market.listingDurationHours)} hours</option></select></label><input name="currencyCode" type="hidden" value="${escapeHtml(currencyCode)}" /><button class="player-terminal-secondary-button" type="submit" ${enabled && listableItems.length ? "" : "disabled"}>${icon("tag")} Create draft</button></form></details></section>
      <section class="player-terminal-panel player-terminal-marketplace-mine"><header class="player-terminal-panel-header"><div><span>YOUR LISTINGS</span><strong>${escapeHtml(market.myListings.length)} total</strong></div></header><div>${market.myListings.length ? market.myListings.map((listing) => `<article><div><strong>${escapeHtml(listing.name)}</strong><small>${escapeHtml(listing.quantity)} units · ${escapeHtml(formatCurrency(listing.unitPrice, listing.currencyCode))} · v${escapeHtml(listing.version)}</small>${listing.moderationReason ? `<small>${escapeHtml(listing.moderationReason)}</small>` : ""}</div>${renderStatusPill(listing.status.replaceAll("_", " "), statusTone(listing.status))}<div>${listingControls(listing)}</div></article>`).join("") : renderEmptyState({ title: "No Marketplace listings", detail: "Draft listings will appear here for activation or cancellation.", iconName: "tag" })}</div></section>${disputePanel(market)}</div></section>`;
}
