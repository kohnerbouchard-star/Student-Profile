import { escapeHtml, formatCurrency, formatNumber } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderStatusPill } from "../components/ui.js";

function listingCard(listing, code, isSelected) {
  return `<button class="player-terminal-marketplace-card${isSelected ? " active" : ""}" type="button" data-player-marketplace-select="${escapeHtml(listing.id)}">
    <span class="player-terminal-marketplace-image"><img src="${escapeHtml(listing.image)}" alt="" /></span>
    <div><small>${escapeHtml(listing.category)} · ${escapeHtml(listing.country)}</small><strong>${escapeHtml(listing.name)}</strong><p>${escapeHtml(listing.description)}</p><span aria-label="Seller ${escapeHtml(listing.seller)}, rated ${escapeHtml(listing.rating.toFixed(1))} out of 5">Seller ${escapeHtml(listing.seller)} · ${escapeHtml(listing.rating.toFixed(1))} ${icon("star")}</span></div>
    <div><strong>${escapeHtml(formatCurrency(listing.unitPrice, code))}</strong><small>${escapeHtml(formatNumber(listing.quantity))} available</small></div>
  </button>`;
}

export function renderMarketplacePage(data, ui) {
  const market = data.marketplace;
  const category = ui.marketplaceCategory || "All";
  const filtered = market.listings.filter((item) => category === "All" || item.category === category);
  const selected = market.listings.find((item) => item.id === ui.marketplaceListingId) || filtered[0] || market.listings[0];
  const code = data.session.currencyCode;
  return `<section class="player-terminal-page player-terminal-marketplace-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER COMMERCE</small><h2>Marketplace</h2><p>Buy from other players or publish a fixed-price listing. Auctions and negotiation remain outside this MVP.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`${market.listings.length} LISTINGS`, "cyan")}</div></div>

    <div class="player-terminal-marketplace-summary">
      <article><small>MARKET VOLUME</small><strong>${escapeHtml(formatCurrency(market.volume, code))}</strong><span>Current cycle</span></article>
      <article><small>ACTIVE SELLERS</small><strong>${escapeHtml(formatNumber(market.activeSellers))}</strong><span>Verified players</span></article>
      <article><small>TRANSACTION FEE</small><strong>${escapeHtml(market.feeRate.toFixed(1))}%</strong><span>Applied on purchase</span></article>
      <article><small>YOUR LISTINGS</small><strong>${escapeHtml(formatNumber(market.myListings.length))}</strong><span>${escapeHtml(formatNumber(market.myListings.reduce((sum, item) => sum + item.quantity, 0)))} units offered</span></article>
    </div>

    <div class="player-terminal-filter-row">${market.categories.map((item) => `<button class="${item === category ? "active" : ""}" type="button" data-player-marketplace-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>

    <div class="player-terminal-marketplace-layout">
      <section class="player-terminal-panel player-terminal-marketplace-list">
        <header class="player-terminal-panel-header"><div><span>OPEN LISTINGS</span><strong>${escapeHtml(filtered.length)} results</strong></div>${renderStatusPill("FIXED PRICE", "purple")}</header>
        <div>${filtered.length ? filtered.map((item) => listingCard(item, code, item.id === selected?.id)).join("") : renderEmptyState({ title: "No open listings", detail: "Choose another category or return after players publish inventory.", iconName: "marketplace" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-marketplace-detail">
        ${selected ? `<header class="player-terminal-panel-header"><div><span>LISTING REVIEW</span><strong>${escapeHtml(selected.name)}</strong></div>${renderStatusPill(selected.condition, selected.condition === "New" ? "green" : "amber")}</header>
        <div class="player-terminal-marketplace-detail-hero"><span><img src="${escapeHtml(selected.image)}" alt="" /></span><div><small>${escapeHtml(selected.category)} · ${escapeHtml(selected.country)}</small><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.description)}</p></div></div>
        <dl class="player-terminal-marketplace-facts"><div><dt>UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(selected.unitPrice, code))}</dd></div><div><dt>AVAILABLE</dt><dd>${escapeHtml(selected.quantity)}</dd></div><div><dt>SELLER</dt><dd>${escapeHtml(selected.seller)}</dd></div><div><dt>RATING</dt><dd>${escapeHtml(selected.rating.toFixed(1))} / 5</dd></div></dl>
        <form data-player-form="marketplace-purchase" data-endpoint="marketplacePurchase" data-listing-id="${escapeHtml(selected.id)}">
          <label>QUANTITY<input name="quantity" type="number" min="1" max="${escapeHtml(selected.quantity)}" value="1" required /></label>
          <div class="player-terminal-marketplace-total"><small>ESTIMATED TOTAL</small><strong data-player-marketplace-estimated-total>${escapeHtml(formatCurrency(selected.unitPrice * (1 + market.feeRate / 100), code))}</strong><span>Includes ${escapeHtml(market.feeRate.toFixed(1))}% fee for one unit</span></div>
          <button class="player-terminal-primary-button" type="submit">${icon("cart")} Buy listing</button>
        </form>` : renderEmptyState({ title: "No listing selected", detail: filtered.length ? "Select a listing to review its seller, price, and purchase terms." : "No listings are available in this category.", iconName: "marketplace" })}
      </section>

      <section class="player-terminal-panel player-terminal-marketplace-create">
        <header class="player-terminal-panel-header"><div><span>SELL INVENTORY</span><strong>Create a listing</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header>
        <details class="player-terminal-disclosure"><summary><span>${icon("tag")}</span><div><strong>List an inventory item</strong><small>Set quantity, price, and expiry</small></div>${icon("chevronRight")}</summary><form data-player-form="marketplace-listing" data-endpoint="marketplaceListing">
          <label>INVENTORY ITEM<select name="inventoryItemId" required ${data.inventory.items.length ? "" : "disabled"}>${data.inventory.items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.quantity)} owned</option>`).join("") || `<option value="">No inventory available</option>`}</select></label>
          <label>QUANTITY<input name="quantity" type="number" min="1" value="1" required ${data.inventory.items.length ? "" : "disabled"} /></label>
          <label>UNIT PRICE<input name="unitPrice" type="number" min="1" step="1" required placeholder="0" /></label>
          <label>EXPIRY<select name="durationHours"><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label>
          <button class="player-terminal-secondary-button" type="submit" ${data.inventory.items.length ? "" : "disabled"}>${icon("tag")} Publish listing</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-marketplace-mine">
        <header class="player-terminal-panel-header"><div><span>YOUR LISTINGS</span><strong>${escapeHtml(market.myListings.length)} active</strong></div></header>
        <div>${market.myListings.length ? market.myListings.map((listing) => `<article><div><strong>${escapeHtml(listing.name)}</strong><small>${escapeHtml(listing.quantity)} units · ${escapeHtml(formatCurrency(listing.unitPrice, code))}</small></div>${renderStatusPill(listing.status, listing.status === "Active" ? "green" : "amber")}<button class="player-terminal-compact-button" type="button" data-player-marketplace-cancel="${escapeHtml(listing.id)}">Cancel</button></article>`).join("") : renderEmptyState({ title: "No active listings", detail: "Items you publish will appear here for management.", iconName: "tag" })}</div>
      </section>
    </div>
  </section>`;
}
