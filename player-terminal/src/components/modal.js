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

function exactStoreAmount(currencyCode, value) {
  return `${escapeHtml(currencyCode || "—")} ${escapeHtml(typeof value === "string" ? value : "—")}`;
}

function renderStoreFundingLines(lines, kind) {
  return `<div class="player-terminal-store-funding-evidence-lines">${(Array.isArray(lines) ? lines : []).map((line) => `<article>
    <small>ALLOCATION ${escapeHtml(line.lineNumber)} · ${escapeHtml(line.sourceAccountKey)}</small>
    <strong>${exactStoreAmount(line.sourceCurrencyCode, line.sourceDebit)} → ${exactStoreAmount(line.targetCurrencyCode, line.targetContribution)}</strong>
    <dl><div><dt>REFERENCE RATE</dt><dd>${escapeHtml(line.referenceRate)}</dd></div><div><dt>CUSTOMER RATE</dt><dd>${escapeHtml(line.customerRate)}</dd></div><div><dt>EFFECTIVE RATE</dt><dd>${escapeHtml(line.effectiveRate)}</dd></div><div><dt>SPREAD</dt><dd>${escapeHtml(line.spreadRate)}</dd></div></dl>
    ${kind === "quote" ? `<p>${escapeHtml(line.roundingDisclosure)}</p>` : ""}
  </article>`).join("")}</div>`;
}

function renderStoreFundingQuote(quote) {
  if (!quote?.fundingQuote) return "";
  const funding = quote.fundingQuote;
  return `<section class="player-terminal-store-funding-evidence" aria-label="Immutable funding quote">
    <header><div><small>BANKING FX FUNDING QUOTE</small><strong>${exactStoreAmount(funding.targetCurrencyCode, funding.targetAmount)}</strong></div>${renderStatusPill(funding.requiresFx ? "RETAIL FX" : "SAME CURRENCY", funding.requiresFx ? "purple" : "green")}</header>
    <dl class="player-terminal-connector-meta"><div><dt>FUNDING QUOTE</dt><dd><code>${escapeHtml(funding.quoteKey)}</code></dd></div><div><dt>FIXING</dt><dd><code>${escapeHtml(funding.fixingKey)}</code></dd></div><div><dt>POLICY</dt><dd>${escapeHtml(funding.policyVersion)}</dd></div><div><dt>FUNDING EXPIRES</dt><dd>${escapeHtml(quoteExpiry(funding.expiresAt))}</dd></div></dl>
    ${renderStoreFundingLines(funding.lines, "quote")}
  </section>`;
}

function renderStoreFundingReceipt(receipt) {
  if (!receipt?.fundingReceipt) return "";
  const funding = receipt.fundingReceipt;
  return `<section class="player-terminal-store-funding-evidence" aria-label="Immutable funding receipt">
    <header><div><small>IMMUTABLE BANKING FUNDING RECEIPT</small><strong>${exactStoreAmount(funding.targetCurrencyCode, funding.targetAmount)}</strong></div>${renderStatusPill("SETTLED", "green")}</header>
    <dl class="player-terminal-connector-meta"><div><dt>FUNDING RECEIPT</dt><dd><code>${escapeHtml(funding.receiptKey)}</code></dd></div><div><dt>BANK TRANSACTION</dt><dd><code>${escapeHtml(funding.bankTransactionKey)}</code></dd></div><div><dt>TARGET ACCOUNT</dt><dd><code>${escapeHtml(funding.targetAccountKey)}</code></dd></div><div><dt>RESERVE DRAW</dt><dd>${exactStoreAmount(funding.targetCurrencyCode, funding.targetReserveDrawAmount)}</dd></div></dl>
    ${renderStoreFundingLines(funding.lines, "receipt")}
  </section>`;
}

function renderStoreFundingAllocation(modal) {
  const accounts = Array.isArray(modal.fundingAccounts) ? modal.fundingAccounts : [];
  const draft = Array.isArray(modal.allocationDraft) ? modal.allocationDraft : [];
  const targetCurrencyCode = modal.currencyCode || "—";
  const precision = Number.isSafeInteger(modal.targetPrecision) ? modal.targetPrecision : 2;
  const step = precision === 0 ? "1" : `0.${"0".repeat(Math.max(0, precision - 1))}1`;
  const rows = [0, 1, 2].map((index) => {
    const selected = String(draft[index]?.sourceAccountKey || "");
    const nextSelected = String(draft[index + 1]?.sourceAccountKey || "");
    const final = Boolean(selected && !nextSelected);
    const disabled = index > 0 && !draft[index - 1]?.sourceAccountKey;
    const options = accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}" ${selected === account.accountKey ? "selected" : ""}>${escapeHtml(account.currencyCode)} Checking · ${escapeHtml(formatCurrency(account.availableAmount, account.currencyCode))} available · ${escapeHtml(account.accountKey)}</option>`).join("");
    return `<div class="player-terminal-store-funding-row" data-player-store-funding-row="${index}"><label>ACCOUNT ${index + 1}<select name="sourceAccountKey" data-player-store-funding-account ${disabled ? "disabled" : ""}><option value="">${index === 0 ? "Choose Checking account" : "No additional account"}</option>${options}</select></label><label><span data-player-store-funding-allocation-label>${final ? `Final ${escapeHtml(targetCurrencyCode)} remainder is derived by the server` : selected ? `Fixed ${escapeHtml(targetCurrencyCode)} contribution` : "Optional additional Checking account"}</span><input name="targetAmount" data-player-store-funding-amount inputmode="decimal" step="${escapeHtml(step)}" value="${final ? "" : escapeHtml(draft[index]?.targetAmount || "")}" placeholder="${final ? "SERVER REMAINDER" : "Fixed target amount"}" ${!selected || final ? "disabled" : "required"} /></label></div>`;
  }).join("");
  return `<section class="player-terminal-store-funding-allocation" aria-labelledby="storeFundingAllocationTitle"><header><div><small>BANKING FX</small><strong id="storeFundingAllocationTitle">Checking allocation</strong></div>${renderStatusPill(accounts.length ? "EVIDENCE READY" : "UNAVAILABLE", accounts.length ? "cyan" : "amber")}</header><p>Choose one to three canonical Checking accounts in order. Enter fixed target-currency contributions for every non-final account; the server derives the final exact remainder.</p><div>${rows}</div><strong class="player-terminal-store-funding-fixed-total" data-player-store-funding-fixed-total>${escapeHtml(targetCurrencyCode)} 0 fixed · final remainder server-derived</strong></section>`;
}

function renderStorePurchaseModal(modal) {
  const item = modal.item || {};
  const offer = modal.offer || {};
  const stage = modal.stage || "select";
  const quote = modal.quote || {};
  const receipt = modal.receipt || {};
  const currencyCode = quote.buyerCurrencyCode || quote.currencyCode || receipt.currencyCode || offer.currencyCode || modal.currencyCode || "ECO";
  const sellerName = offer.sellerName || (modal.purchaseMode === "business_offer" ? "Player Business" : "Econovaria Store");
  const sellerKind = offer.sellerKind === "business" ? "Business seller" : offer.sellerKind === "npc" ? "NPC seller" : "Seeded Store";

  if (stage === "receipt") {
    const total = receipt.totalPrice ?? receipt.finalTotalPrice ?? quote.finalTotalPrice ?? 0;
    const remainingSellerQuantity = Number.isSafeInteger(receipt.remainingListedQuantity)
      ? receipt.remainingListedQuantity
      : receipt.remainingSellerQuantity;
    const refreshing = modal.refreshState === "refreshing";
    const replayed = receipt.replayed === true || receipt.alreadyCompleted === true;
    const statusLabel = modal.refreshWarning
      ? "COMPLETED · REFRESH PENDING"
      : refreshing
        ? "COMPLETED · REFRESHING"
        : replayed
          ? "ALREADY COMPLETED"
          : "COMPLETED";
    const statusTone = modal.refreshWarning || refreshing ? "amber" : "green";
    const receiptDetail = modal.refreshWarning || (refreshing
      ? "Settlement completed. Current Store, balance, and inventory data are refreshing now."
      : replayed
        ? "The Backend returned the original immutable receipt; the purchase was not settled twice."
        : "The authoritative Store purchase completed and current account data was refreshed.");
    const refreshRetry = modal.refreshState === "pending" || refreshing
      ? `<button class="player-terminal-secondary-button" type="button" data-player-store-refresh-retry ${refreshing ? "disabled" : ""}>${icon("refresh")} ${refreshing ? "Refreshing…" : "Retry refresh"}</button>`
      : "";
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle" aria-describedby="storePurchaseModalSummary" aria-busy="${refreshing ? "true" : "false"}">
        <header class="player-terminal-modal-head"><div><small>PURCHASE RECEIPT</small><h3 id="storePurchaseModalTitle">${escapeHtml(item.name || "Store purchase")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status" aria-live="polite">${renderStatusPill(statusLabel, statusTone)}<p id="storePurchaseModalSummary">${escapeHtml(receiptDetail)}</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>SELLER</dt><dd>${escapeHtml(sellerName)} · ${escapeHtml(sellerKind)}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(receipt.quantity || quote.quantity || modal.quantity || 1)}</dd></div>
            <div><dt>UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(receipt.unitPrice ?? quote.finalUnitPrice ?? 0, currencyCode))}</dd></div>
            <div><dt>TOTAL PAID</dt><dd>${escapeHtml(formatCurrency(total, currencyCode))}</dd></div>
            <div><dt>RECEIPT KEY</dt><dd><code>${escapeHtml(receipt.receiptKey || "Recorded")}</code></dd></div>
            <div><dt>QUOTE KEY</dt><dd><code>${escapeHtml(receipt.quoteKey || quote.quoteKey || "—")}</code></dd></div>
            ${receipt.offerKey ? `<div><dt>OFFER KEY</dt><dd><code>${escapeHtml(receipt.offerKey)}</code></dd></div>` : ""}
            ${receipt.inventoryTransactionKey ? `<div><dt>INVENTORY TRANSACTION</dt><dd><code>${escapeHtml(receipt.inventoryTransactionKey)}</code></dd></div>` : ""}
            ${Number.isSafeInteger(remainingSellerQuantity) ? `<div><dt>SELLER STOCK LEFT</dt><dd>${escapeHtml(remainingSellerQuantity)}</dd></div>` : ""}
          </dl>
          ${renderStoreFundingReceipt(receipt)}
        </div>
        <footer class="player-terminal-modal-footer">${refreshRetry}<button class="player-terminal-secondary-button" type="button" data-route="inventory" data-player-local-action="close-modal">${icon("inventory")} Open inventory</button><button class="player-terminal-primary-button" type="button" data-player-local-action="close-modal">Close receipt</button></footer>
      </section>
    </div>`;
  }

  if (stage === "review") {
    const processing = modal.processing === true;
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle" aria-describedby="storePurchaseModalSummary" aria-busy="${processing ? "true" : "false"}" ${processing ? 'tabindex="-1"' : ""}>
        <header class="player-terminal-modal-head"><div><small>AUTHORITATIVE QUOTE</small><h3 id="storePurchaseModalTitle">Review ${escapeHtml(item.name || "purchase")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close" ${processing ? "disabled" : ""}>${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status" aria-live="polite">${renderStatusPill(processing ? "SETTLEMENT IN PROGRESS" : "CONFIRMATION REQUIRED", processing ? "amber" : "cyan")}<p id="storePurchaseModalSummary">${processing ? "Keep this receipt window open while the authoritative settlement result is confirmed." : "This short-lived quote locks the selected seller, offer version, quantity, and price for review. It does not reserve stock, and no funds have moved."}</p></div>
          <dl class="player-terminal-connector-meta">
            <div><dt>ITEM</dt><dd>${escapeHtml(quote.itemName || item.name || "Store item")}</dd></div>
            <div><dt>SELLER</dt><dd>${escapeHtml(sellerName)} · ${escapeHtml(sellerKind)}</dd></div>
            <div><dt>QUANTITY</dt><dd>${escapeHtml(quote.quantity || modal.quantity || 1)}</dd></div>
            ${Number.isSafeInteger(quote.availableQuantityAtQuote) ? `<div><dt>SELLER STOCK AT QUOTE</dt><dd>${escapeHtml(quote.availableQuantityAtQuote)}</dd></div>` : ""}
            ${Number.isSafeInteger(quote.offerVersion) ? `<div><dt>OFFER VERSION</dt><dd>${escapeHtml(quote.offerVersion)}</dd></div>` : ""}
            <div><dt>UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(quote.unitPrice ?? quote.finalUnitPrice, currencyCode))}</dd></div>
            <div><dt>FINAL TOTAL</dt><dd>${escapeHtml(formatCurrency(quote.totalPrice ?? quote.finalTotalPrice, currencyCode))}</dd></div>
            <div><dt>QUOTE EXPIRES</dt><dd>${escapeHtml(quoteExpiry(quote.expiresAt))}</dd></div>
            <div><dt>QUOTE KEY</dt><dd><code>${escapeHtml(quote.quoteKey || "—")}</code></dd></div>
          </dl>
          ${renderStoreFundingQuote(quote)}
          ${modal.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(modal.error)}</p>` : ""}
        </div>
        <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-store-edit ${processing ? "disabled" : ""}>${icon("edit")} Change quantity</button><button class="player-terminal-primary-button" type="button" data-player-store-confirm ${processing ? "disabled" : ""}>${icon("cart")} ${processing ? "Completing purchase…" : "Confirm purchase"}</button></footer>
      </section>
    </div>`;
  }

  return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="storePurchaseModalTitle" aria-describedby="storePurchaseModalSummary">
      <header class="player-terminal-modal-head"><div><small>STORE PURCHASE</small><h3 id="storePurchaseModalTitle">${escapeHtml(item.name || "Review item")}</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
      <div class="player-terminal-modal-body">
        <div class="player-terminal-connector-status" aria-live="polite">${renderStatusPill("QUOTE REQUIRED", "amber")}<p id="storePurchaseModalSummary">Choose a quantity for this exact seller offer. The Backend will validate the current offer version, stock, price, currency, and expiration before confirmation.</p></div>
        <dl class="player-terminal-connector-meta">
          <div><dt>CATALOG ITEM</dt><dd>${escapeHtml(item.name || "Store item")}</dd></div>
          <div><dt>SELLER</dt><dd>${escapeHtml(sellerName)} · ${escapeHtml(sellerKind)}</dd></div>
          <div><dt>SELECTED UNIT PRICE</dt><dd>${escapeHtml(formatCurrency(offer.unitPrice ?? item.price, currencyCode))}</dd></div>
          <div><dt>SELLER STOCK</dt><dd>${escapeHtml(offer.availableQuantity ?? item.stock ?? "Unavailable")}</dd></div>
          <div><dt>OWNED</dt><dd>${escapeHtml(item.owned ?? 0)}</dd></div>
        </dl>
        <label>QUANTITY<input data-player-store-quantity type="number" min="1" max="${escapeHtml(Math.max(1, Number(offer.availableQuantity ?? item.stock) || 1))}" step="1" inputmode="numeric" value="${escapeHtml(modal.quantity || 1)}" required /></label>
        ${renderStoreFundingAllocation(modal)}
        ${modal.error ? `<p class="player-terminal-form-error" role="alert">${escapeHtml(modal.error)}</p>` : ""}
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-secondary-button" type="button" data-player-local-action="close-modal">Cancel</button><button class="player-terminal-primary-button" type="button" data-player-store-review ${modal.fundingReady === false || offer.purchasable === false ? "disabled" : ""}>${icon("cart")} Request funded quote</button></footer>
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
