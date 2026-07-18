import { escapeHtml, formatCurrency, formatPercent, toneFromChange } from "../core/format.js";
import { icon } from "./icons.js";
import { playerSafeErrorMessage } from "../api/errors.js";
import { renderRouteSkeleton } from "./route-skeletons.js";

export function renderStatusPill(label, tone = "cyan") {
  return `<span class="player-terminal-status-pill is-${escapeHtml(tone)}"><i aria-hidden="true"></i>${escapeHtml(label)}</span>`;
}

export function renderMetric({ label, value, meta = "", tone = "cyan", iconName = "chart" }) {
  return `<article class="player-terminal-metric-card is-${escapeHtml(tone)}">
    <span class="player-terminal-metric-icon">${icon(iconName)}</span>
    <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${meta ? `<em>${escapeHtml(meta)}</em>` : ""}</div>
  </article>`;
}

export function renderMoneyMetric(label, value, currencyCode, meta, tone = "cyan") {
  return renderMetric({ label, value: formatCurrency(value, currencyCode), meta, tone, iconName: "wallet" });
}

export function renderChange(value) {
  return `<span class="player-terminal-market-change ${toneFromChange(value)}">${escapeHtml(formatPercent(value))}</span>`;
}

export function renderEmptyState({ title, detail, iconName = "globe" }) {
  return `<section class="player-terminal-empty-state">
    <span>${icon(iconName)}</span>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(detail)}</p>
  </section>`;
}

export function renderSkeletonPage(route) {
  return renderRouteSkeleton(route);
}

export function renderConnectionError(error) {
  return `<section class="player-terminal-page player-terminal-error-page">
    <span class="player-terminal-error-icon">!</span>
    <small>GAME SERVICE UNAVAILABLE</small>
    <h2>Connection could not be established</h2>
    <p>${escapeHtml(playerSafeErrorMessage(error))}</p>
    <button class="player-terminal-primary-button" type="button" data-player-action="refresh-data">${icon("refresh")} Retry connection</button>
  </section>`;
}