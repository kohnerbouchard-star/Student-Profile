import { escapeHtml, formatCurrency, formatPercent, formatNumber, toneFromChange } from "../core/format.js";
import { icon } from "./icons.js";

function cleanTone(tone) {
  const value = String(tone || "cyan").toLowerCase();
  return new Set(["cyan", "amber", "purple", "green", "red", "neutral"]).has(value) ? value : "cyan";
}

function safeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
  return text || fallback;
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

export function renderLiveIndicator(live = {}) {
  const status = String(live.status || "connected").toLowerCase();
  const tone = status === "offline" || status === "error"
    ? "red"
    : status === "reconnecting" || status === "updating"
      ? "amber"
      : "green";
  const label = status === "offline"
    ? "OFFLINE"
    : status === "reconnecting"
      ? "RECONNECTING"
      : status === "updating"
        ? "UPDATING"
        : "LIVE";
  const updatedAt = Number(live.updatedAt || 0);
  const ageSeconds = updatedAt > 0 ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : null;
  const detail = status === "offline"
    ? "Cached information"
    : ageSeconds === null
      ? "Connected"
      : ageSeconds < 2
        ? "Updated now"
        : `Updated ${ageSeconds}s ago`;
  return `<span class="player-terminal-live-indicator is-${tone}" data-player-live-status="${escapeHtml(status)}" role="status" aria-live="polite"><i aria-hidden="true"></i><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>`;
}

export function renderSectionHeader({ eyebrow = "", title, detail = "", actionHtml = "", live = null } = {}) {
  return `<header class="player-terminal-v2-section-header"><div>${eyebrow ? `<small>${escapeHtml(eyebrow)}</small>` : ""}<h3>${escapeHtml(title || "")}</h3>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div><div class="player-terminal-v2-section-actions">${live ? renderLiveIndicator(live) : ""}${actionHtml || ""}</div></header>`;
}

export function renderDelta(value, { suffix = "%", label = "", inverse = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const tone = toneFromChange(inverse ? -number : number);
  const sign = number > 0 ? "+" : "";
  return `<span class="player-terminal-v2-delta ${escapeHtml(tone)}"><strong>${escapeHtml(`${sign}${formatNumber(number)}${suffix}`)}</strong>${label ? `<small>${escapeHtml(label)}</small>` : ""}</span>`;
}

export function renderActionCard({ title, detail = "", meta = "", iconName = "chevronRight", tone = "cyan", action = "", route = "", disabled = false, badge = "" } = {}) {
  const attr = action ? ` ${action}` : route ? ` data-route="${escapeHtml(route)}"` : "";
  return `<button class="player-terminal-v2-action-card is-${cleanTone(tone)}" type="button"${attr}${disabled ? " disabled aria-disabled=\"true\"" : ""}><span class="player-terminal-v2-action-icon">${icon(iconName)}</span><span class="player-terminal-v2-action-copy">${badge ? `<small>${escapeHtml(badge)}</small>` : ""}<strong>${escapeHtml(title || "")}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}${meta ? `<em>${escapeHtml(meta)}</em>` : ""}</span><span class="player-terminal-v2-action-chevron" aria-hidden="true">${icon("chevronRight")}</span></button>`;
}

export function renderChoiceQuestion(question, { namePrefix = "contractChoice", selected = {} } = {}) {
  const questionId = safeText(question?.id || question?.questionId || question?.key);
  const prompt = safeText(question?.prompt || question?.question || question?.title, "Choose an answer");
  const detail = safeText(question?.detail || question?.description);
  const options = safeList(question?.options || question?.choices);
  const name = `${namePrefix}-${questionId || "question"}`;
  return `<fieldset class="player-terminal-v2-choice-question" data-player-choice-question="${escapeHtml(questionId)}"><legend>${escapeHtml(prompt)}</legend>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}<div class="player-terminal-v2-choice-grid">${options.map((option, index) => {
    const optionObject = option && typeof option === "object" && !Array.isArray(option) ? option : { label: option };
    const optionId = safeText(optionObject.id || optionObject.optionId || optionObject.value || String.fromCharCode(65 + index));
    const label = safeText(optionObject.label || optionObject.text || optionObject.title || optionId);
    const explanation = safeText(optionObject.detail || optionObject.description);
    const checked = String(selected?.[questionId] || "") === optionId;
    return `<label class="player-terminal-v2-choice-card"><input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(optionId)}" data-player-contract-question-id="${escapeHtml(questionId)}" ${checked ? "checked" : ""} required /><span class="player-terminal-v2-choice-key">${escapeHtml(String.fromCharCode(65 + index))}</span><span class="player-terminal-v2-choice-copy"><strong>${escapeHtml(label)}</strong>${explanation ? `<small>${escapeHtml(explanation)}</small>` : ""}</span><span class="player-terminal-v2-choice-check" aria-hidden="true">${icon("check")}</span></label>`;
  }).join("")}</div></fieldset>`;
}

export function renderChoiceSet(questions, options = {}) {
  return `<div class="player-terminal-v2-choice-set">${safeList(questions).map((question) => renderChoiceQuestion(question, options)).join("")}</div>`;
}

export function renderAccountCard({ label, balance, available = null, currencyCode = "ECO", meta = "", tone = "cyan", iconName = "wallet", actionHtml = "" } = {}) {
  const hasAvailable = Number.isFinite(Number(available));
  return `<article class="player-terminal-v2-account-card is-${cleanTone(tone)}"><header><span>${icon(iconName)}</span><div><small>${escapeHtml(label || "Account")}</small><strong>${escapeHtml(formatCurrency(balance, currencyCode))}</strong></div></header>${hasAvailable ? `<div class="player-terminal-v2-account-available"><small>AVAILABLE</small><strong>${escapeHtml(formatCurrency(available, currencyCode))}</strong></div>` : ""}${meta ? `<p>${escapeHtml(meta)}</p>` : ""}${actionHtml ? `<footer>${actionHtml}</footer>` : ""}</article>`;
}

export function renderItemIdentity(item = {}, { quantity = null, meta = "", status = "", tone = "cyan", actionHtml = "" } = {}) {
  const image = safeText(item.imageUrl || item.image || item.artworkUrl);
  const name = safeText(item.name || item.title, "Item");
  const category = safeText(item.category || item.type, "Item");
  const qty = quantity ?? item.quantity ?? item.owned;
  return `<article class="player-terminal-v2-item-card is-${cleanTone(tone)}"><div class="player-terminal-v2-item-media">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : icon("inventory")}${status ? `<small>${escapeHtml(status)}</small>` : ""}</div><div class="player-terminal-v2-item-copy"><small>${escapeHtml(category)}</small><strong>${escapeHtml(name)}</strong>${meta ? `<p>${escapeHtml(meta)}</p>` : ""}${qty !== null && qty !== undefined ? `<em>${escapeHtml(`Owned ${formatNumber(qty)}`)}</em>` : ""}</div>${actionHtml ? `<div class="player-terminal-v2-item-actions">${actionHtml}</div>` : ""}</article>`;
}

export function renderReceipt({ title = "Completed", tone = "green", summary = "", rows = [], actionHtml = "" } = {}) {
  return `<section class="player-terminal-v2-receipt is-${cleanTone(tone)}" role="status"><header><span>${icon(tone === "red" ? "close" : "check")}</span><div><small>COMMITTED RESULT</small><h3>${escapeHtml(title)}</h3>${summary ? `<p>${escapeHtml(summary)}</p>` : ""}</div></header><dl>${safeList(rows).map((row) => `<div><dt>${escapeHtml(safeText(row?.label))}</dt><dd>${escapeHtml(safeText(row?.value))}</dd></div>`).join("")}</dl>${actionHtml ? `<footer>${actionHtml}</footer>` : ""}</section>`;
}

export function renderActivityFeed(items, { empty = "No recent activity." } = {}) {
  const normalized = safeList(items);
  if (!normalized.length) return `<p class="player-terminal-inline-empty">${escapeHtml(empty)}</p>`;
  return `<ol class="player-terminal-v2-activity-feed">${normalized.map((item) => {
    const tone = cleanTone(item?.tone || "cyan");
    return `<li class="is-${tone}"><span aria-hidden="true">${icon(item?.iconName || "clock")}</span><div><strong>${escapeHtml(safeText(item?.title, "Activity"))}</strong>${item?.detail ? `<p>${escapeHtml(safeText(item.detail))}</p>` : ""}<small>${escapeHtml(safeText(item?.time || item?.timestamp))}</small></div>${item?.value ? `<em>${escapeHtml(safeText(item.value))}</em>` : ""}</li>`;
  }).join("")}</ol>`;
}

export function renderAttentionStrip(items = []) {
  const list = safeList(items).filter(Boolean).slice(0, 4);
  if (!list.length) return "";
  return `<section class="player-terminal-v2-attention" aria-label="What needs your attention"><header><span>${icon("bell")}</span><div><small>WHAT NEEDS YOUR ATTENTION</small><strong>${escapeHtml(`${list.length} ${list.length === 1 ? "item" : "items"}`)}</strong></div></header><div>${list.map((item) => renderActionCard(item)).join("")}</div></section>`;
}

export function renderProgressRail({ value = 0, label = "Progress", detail = "" } = {}) {
  const numeric = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="player-terminal-v2-progress-rail"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(`${Math.round(numeric)}%`)}</strong></div><div class="player-terminal-v2-progress-track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(Math.round(numeric))}"><i style="width:${numeric}%"></i></div>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

export function renderMoney(value, currencyCode) {
  return formatCurrency(value, currencyCode);
}

export function renderPercent(value) {
  return formatPercent(value);
}
