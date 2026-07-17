import { escapeHtml, formatPercent } from "../core/format.js";
import { icon } from "./icons.js";
import { renderStatusPill } from "./ui.js";

export function renderModal(modal) {
  if (!modal) return "";

  if (modal.type === "connection") {
    const payload = JSON.stringify(modal.payload || {}, null, 2);
    return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
      <section class="player-terminal-modal player-terminal-connector-modal" role="dialog" aria-modal="true" aria-labelledby="connectorModalTitle">
        <header class="player-terminal-modal-head"><div><small>BACKEND CONNECTION POINT</small><h3 id="connectorModalTitle">Frontend request is ready</h3></div><button class="player-terminal-icon-button" type="button" data-player-local-action="close-modal" aria-label="Close">${icon("close")}</button></header>
        <div class="player-terminal-modal-body">
          <div class="player-terminal-connector-status">${renderStatusPill("AWAITING API", "amber")}<p>The interface reached the defined action boundary. No fake transaction was completed because a backend adapter is not connected.</p></div>
          <dl class="player-terminal-connector-meta"><div><dt>ENDPOINT KEY</dt><dd>${escapeHtml(modal.endpointKey)}</dd></div><div><dt>METHOD</dt><dd>${escapeHtml(modal.method)}</dd></div><div><dt>PATH</dt><dd><code>${escapeHtml(modal.path)}</code></dd></div></dl>
          <div class="player-terminal-payload-preview"><small>TYPED PAYLOAD</small><pre>${escapeHtml(payload)}</pre></div>
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
