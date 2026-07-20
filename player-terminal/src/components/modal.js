import { escapeHtml, formatCurrency, formatPercent } from "../core/format.js";
import { icon } from "./icons.js";
import { renderStatusPill } from "./ui.js";

function quoteExpiry(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Expiration unavailable";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

function renderStorePurchaseModal(modal) {
  const item = modal.item || {};
  const stage = modal.stage || "select";
  const quote = modal.quote || {};
  const receipt = modal.receipt || {};
  const currencyCode = quote.currencyCode || receipt.currencyCode || modal.currencyCode || "ECO";

  if (stage === "receipt") {
    const total = receipt.finalTotalPrice ?? quote.finalTotalPrice ?? 0;
    const receiptDetail = modal.refreshWarning
      ? modal.refreshWarning
      : "The authoritative Store purchase completed and current account data was refreshed.";
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle">
        <header class="player-terminal-modal-head"><div><small>PURCHASE RECEIPT</small><h3 id="storePurchaseModalTitle">${escapeHtml(item.name || "Store purchase")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill(modal.refreshWarning ? "COMPLETED · REFRESH PENDING" : "COMPLETED", modal.refreshWarning ? "amber" : "green")}<p>${escapeHtml(receiptDetail)}</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>QUANTITY</dt><dd>${escapeHtml(quote.quantity || modal.quantity || 1)}</dd></div>
            <div><dt>TOTAL PAID</dt><dd>${escapeHtml(formatCurrency(total, currencyCode))}</dd></div>
            <div><dt>RECEIPT KEY</dt><dd><code>${escapeHtml(receipt.receiptKey || "Recorded")}</code></dd></div>
            <div><dt>QUOTE KEY</dt><dd><code>${escapeHtml(receipt.quoteKey || quote.quoteKey || "—")}</code></dd></div>
          </dl>
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-route="inventory" data-player-local-action="close-modal">${icon("inventory")} Open inventory</button><button class="player-terminal-primary-button" type="button" data-player-local-action="close-modal">Close receipt</button></footer>
      </section>
    </div>`;
  }

  if (stage === "review") {
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle">
        <header class="player-terminal-modal-head"><div><small>AUTHORITATIVE QUOTE</small><h3 id="storePurchaseModalTitle">Review ${escapeHtml(item.name || "purchase")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill("CONFIRMATION REQUIRED", "cyan")}<p>The backend has reserved the current price for this quote. No funds have moved yet.</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>ITEM</dt><dd>${escapeHtml(quote.itemName || item.name || "Store item")}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(quote.quantity || modal.quantity || 1)}</dd></div>
            <div><dt>UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(quote.finalUnitPrice, currencyCode))}</dd></div>
            <div><dt>FINAL TOTAL</dt><dd>${escapeHtml(formatCurrency(quote.finalTotalPrice, currencyCode))}</dd></div>
            <div><dt>QUOTE EXPIRES</dt><dd>${escapeHtml(quoteExpiry(quote.expiresAt))}</dd></div>
            <div><dt>QUOTE KEY</dt><dd><code>${escapeHtml(quote.quoteKey || "—")}</code></dd></div>
          </dl>
          ${modal.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(modal.error)}</p>` : ""}
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-store-edit>${icon("edit")} Change quantity</button><button class="player-terminal-primary-button" type="button" data-player-store-confirm>${icon("cart")} Confirm purchase</button></footer>
      </section>
    </div>`;
  }

  return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle">
      <header class="player-terminal-modal-head"><div><small>STORE PURCHASE</small><h3 id="storePurchaseModalTitle">${escapeHtml(item.name || "Review item")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
      <div class="player-terminal-modal-body">
        <div class="player-terminal-connector-status">${renderStatusPill("QUOTE REQUIRED", "amber")}<p>Choose a quantity. The backend will return the authoritative price, currency, stock validation, and quote expiration before confirmation.</p></div>
        <dl class="player-terminal-connector-meta">
          <div><dt>CATALOG ITEM</dt><dd>${escapeHtml(item.name || "Store item")}</dd></div>
          <div><dt>CATALOG PRICE</dt><dd>${escapeHtml(formatCurrency(item.price, modal.currencyCode || "ECO"))}</dd></div>
          <div><dt>AVAILABLE STOCK</dt><dd>${escapeHtml(item.stock ?? "Unavailable")}</dd></div>
          <div><dt>OWNED</dt><dd>${escapeHtml(item.owned ?? 0)}</dd></div>
        </dl>
        <label>QUANTITY<input data-player-store-quantity type="number" min="1" max="${escapeHtml(Math.max(1, Number(item.stock) || 1))}" step="1" value="${escapeHtml(modal.quantity || 1)}" required /></label>
        ${modal.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(modal.error)}</p>` : ""}
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-local-action="close-modal">Cancel</button><button class="player-terminal-primary-button" type="button" data-player-store-review>${icon("cart")} Request quote</button></footer>
    </section>
  </div>`;
}


function storyAssetUrl(config, key) {
  const value = config?.storyMediaAssets?.[key];
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return /^(?:\.\.?\/|\/)[A-Za-z0-9_./-]+$/.test(clean) ? clean : "";
}

function renderStoryCutsceneModal(modal, config) {
  const delivery = modal.delivery || {};
  const content = delivery.content || {};
  const videoUrl = storyAssetUrl(config, content.videoAssetKey);
  const posterUrl = storyAssetUrl(config, content.posterAssetKey);
  const chapter = [
    Number.isSafeInteger(content.act) ? `ACT ${content.act}` : String(delivery.category || "story").toUpperCase(),
    Number.isSafeInteger(content.sequence) ? `SEQUENCE ${content.sequence}` : "",
  ].filter(Boolean).join(" · ");
  const media = videoUrl
    ? `<video class="player-story-cutscene-media" controls preload="metadata" playsinline aria-label="Story briefing video" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ""}><source src="${escapeHtml(videoUrl)}" /></video>`
    : `<div class="player-story-cutscene-fallback" role="img" aria-label="Story briefing transmission"><span>${icon("news")}</span><small>${escapeHtml(chapter)}</small><strong>${escapeHtml(delivery.title || "Story briefing")}</strong></div>`;
  const close = delivery.requiresAcknowledgement
    ? ""
    : `<button class="player-terminal-icon-button" type="button" data-player-story-action="dismissed" aria-label="Dismiss story briefing" ${modal.processing ? "disabled" : ""}>${icon("close")}</button>`;
  const action = delivery.requiresAcknowledgement ? "acknowledged" : "dismissed";
  const actionLabel = delivery.requiresAcknowledgement ? "Acknowledge and continue" : "Continue";
  return `<div class="player-terminal-modal-backdrop player-story-cutscene-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-story-cutscene-modal" role="dialog" aria-modal="true" aria-labelledby="storyCutsceneTitle" aria-describedby="storyCutsceneSummary">
      <header class="player-terminal-modal-head"><div><small>${escapeHtml(chapter)}</small><h3 id="storyCutsceneTitle">${escapeHtml(delivery.title || "Story briefing")}</h3></div>${close}</header>
      <div class="player-terminal-modal-body">
        ${media}
        <p id="storyCutsceneSummary" class="player-story-cutscene-summary">${escapeHtml(delivery.summary || "A new story development is available.")}</p>
        ${delivery.requiresAcknowledgement ? `<p class="player-story-cutscene-requirement">This briefing requires acknowledgement before you continue.</p>` : ""}
        ${modal.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(modal.error)}</p>` : ""}
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-primary-button" type="button" data-player-story-action="${action}" ${modal.processing ? "disabled" : ""}>${modal.processing ? "Saving…" : actionLabel}</button></footer>
    </section>
  </div>`;
}

export function renderModal(modal, config = {}) {
  if (!modal) return "";

  if (modal.type === "storePurchase") return renderStorePurchaseModal(modal);
  if (modal.type === "storyCutscene") return renderStoryCutsceneModal(modal, config);

  if (modal.type === "connection") {
    const diagnostics = modal.developerDiagnostics === true && config.environment === "development";
    const payload = diagnostics ? JSON.stringify(modal.payload || {}, null, 2) : "";
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="connectorModalTitle">
        <header class="player-terminal-modal-head"><div><small>ACTION UNAVAILABLE</small><h3 id="connectorModalTitle">This action is not connected yet</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill("NOT AVAILABLE", "amber")}<p>No transaction was completed. This feature will become available after the game service enables it.</p></div>
          ${diagnostics ? `<dl class="player-terminal-connector-meta"><div><dt>ENDPOINT KEY</dt><dd>${escapeHtml(modal.endpointKey)}</dd></div><div><dt>METHOD</dt><dd>${escapeHtml(modal.method)}</dd></div><div><dt>PATH</dt><dd><code>${escapeHtml(modal.path)}</code></dd></div></dl><div class="player-terminal-payload-preview"><small>DEVELOPMENT PAYLOAD</small><pre>${escapeHtml(payload)}</pre></div>` : ""}
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-primary-button" type="button" data-player-local-action="close-modal">Acknowledge</button></footer>
      </section>
    </div>`;
  }

  if (modal.type === "country") {
    const country = modal.country;
    const relatedAssets = modal.relatedAssets || [];
    const relatedNews = modal.relatedNews || [];
    const relatedContracts = modal.relatedContracts || [];
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-country-modal" role="dialog" aria-modal="true" aria-labelledby="countryModalTitle">
        <header class="player-terminal-modal-head"><div><small>WORLD INTELLIGENCE</small><h3 id="countryModalTitle">${escapeHtml(country.name)}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-country-hero"><span class="is-${escapeHtml(country.tone)}">${icon("globe")}</span><div><small>CAPITAL</small><h4>${escapeHtml(country.capital)}</h4><p>${escapeHtml(country.market)} economy · ${escapeHtml(country.condition)} · ${escapeHtml(country.risk)} risk</p></div>${renderStatusPill(`${country.index.toFixed(1)} INDEX`, country.tone)}</div>
          <div class="player-terminal-country-indicators">
            <span><small>GROWTH</small><strong class="${country.growth >= 0 ? "is-good" : "is-bad"}">${escapeHtml(formatPercent(country.growth))}</strong></span>
            <span><small>INFLATION</small><strong>${escapeHtml(country.inflation.toFixed(1))}%</strong></span>
            <span><small>UNEMPLOYMENT</small><strong>${escapeHtml(country.unemployment.toFixed(1))}%</strong></span>
            <span><small>BASE RATE</small><strong>${escapeHtml(country.baseRate.toFixed(2))}%</strong></span>
            <span><small>CURRENCY</small><strong class="${country.currencyTrend >= 0 ? "is-good" : "is-bad"}">${escapeHtml(formatPercent(country.currencyTrend))}</strong></span>
            <span><small>STABILITY</small><strong>${escapeHtml(country.stability)}/100</strong></span>
          </div>
          <div class="player-terminal-country-intel-grid">
            <section><small>POLICY SIGNAL</small><p>${escapeHtml(country.policy)}</p></section>
            <section><small>KEY RESOURCES</small><div>${country.resources.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>
            <section><small>MAJOR EXPORTS</small><div>${country.exports.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>
            <section><small>TRADE PARTNERS</small><div>${country.tradePartners.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>
          </div>
          <div class="player-terminal-country-related">
            <section><small>RELATED ASSETS</small><div>${relatedAssets.map((asset) => `<button type="button" data-player-market-link="${escapeHtml(asset.id)}">${icon("market")}<span>${escapeHtml(asset.symbol)}</span><b>${escapeHtml(asset.change > 0 ? "+" : "")}${escapeHtml(asset.change.toFixed(2))}%</b></button>`).join("") || "<p>No listed assets.</p>"}</div></section>
            <section><small>ACTIVE EVENTS</small><div>${relatedNews.map((item) => `<button type="button" data-player-news-link="${escapeHtml(item.id)}">${icon("news")}<span>${escapeHtml(item.title)}</span></button>`).join("") || "<p>No active country-specific events.</p>"}</div></section>
            <section><small>ELIGIBLE CONTRACTS</small><div>${relatedContracts.map((item) => `<button type="button" data-route="contracts" data-player-local-action="close-modal">${icon("contracts")}<span>${escapeHtml(item.title)}</span><b>${escapeHtml(item.status)}</b></button>`).join("") || "<p>No current contracts.</p>"}</div></section>
          </div>
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-route="news" data-player-local-action="close-modal">${icon("news")} Open intelligence</button><button class="player-terminal-primary-button" type="button" data-player-local-action="close-modal">Close</button></footer>
      </section>
    </div>`;
  }

  return "";
}
