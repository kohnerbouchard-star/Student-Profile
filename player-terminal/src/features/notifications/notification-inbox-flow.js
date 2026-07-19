import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { escapeHtml } from "../../core/format.js";
import { setButtonProcessing } from "../../core/dom.js";

const PUBLIC_DELIVERY_ID = /^ndl_[0-9a-f]{32}$/;
const CATEGORY_LABELS = Object.freeze({
  attendance: "Attendance",
  contract: "Contracts",
  economy: "Economy",
  general: "General",
  inventory: "Inventory",
  market: "Market",
  security: "Security",
  store: "Store",
  story: "Story",
  system: "System"
});

function boundedText(value, fallback = "", limit = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, limit);
}

export function resolvePlayerNotificationCategory(item = {}) {
  const source = boundedText(item.sourceType).toLowerCase();
  const type = boundedText(item.notificationType).toLowerCase();
  const combined = `${source} ${type}`;
  const category =
    /security|authentication|session|credential/.test(combined) ? "security" :
    /attendance|clock/.test(combined) ? "attendance" :
    /contract|assignment|submission/.test(combined) ? "contract" :
    /inventory|redemption|item|equipment|craft/.test(combined) ? "inventory" :
    /store|purchase|quote|receipt/.test(combined) ? "store" :
    /stock|market|portfolio|trade|exchange/.test(combined) ? "market" :
    /story|campaign|cutscene|briefing|war|event/.test(combined) ? "story" :
    /economy|ledger|bank|cash|reward|currency/.test(combined) ? "economy" :
    /system|admin|settings|game/.test(combined) ? "system" :
    "general";
  return Object.freeze({ key: category, label: CATEGORY_LABELS[category] });
}

function toneForPriority(value) {
  const priority = boundedText(value).toLowerCase();
  if (["critical", "high", "urgent"].includes(priority)) return "warn";
  if (priority === "low") return "cyan";
  return "purple";
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const id = boundedText(item.deliveryId || item.id).toLowerCase();
  if (!PUBLIC_DELIVERY_ID.test(id)) return null;
  const category = resolvePlayerNotificationCategory(item);
  return Object.freeze({
    id,
    notificationId: boundedText(item.notificationId).toLowerCase(),
    title: boundedText(item.title, "Notification", 180),
    detail: boundedText(item.summary || item.detail, "A new player update is available.", 1000),
    category,
    tone: toneForPriority(item.priority),
    status: ["unread", "read", "dismissed"].includes(boundedText(item.status).toLowerCase())
      ? boundedText(item.status).toLowerCase()
      : "unread",
    deliveredAt: boundedText(item.deliveredAt, "", 80)
  });
}

export function normalizeNotificationPage(body, previousItems = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Notification page response must be an object.");
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const page = body.page && typeof body.page === "object" && !Array.isArray(body.page) ? body.page : {};
  const summary = body.summary && typeof body.summary === "object" && !Array.isArray(body.summary) ? body.summary : {};
  const unreadCount = Number(summary.unreadCount);
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) {
    throw new TypeError("Notification unread count is invalid.");
  }
  const returned = Number(page.returned);
  if (!Number.isSafeInteger(returned) || returned < 0 || returned !== rawItems.length || typeof page.hasMore !== "boolean") {
    throw new TypeError("Notification page metadata is invalid.");
  }
  const nextCursor = page.nextCursor === null ? null : boundedText(page.nextCursor, "", 1000);
  if (page.hasMore && !nextCursor) throw new TypeError("Notification continuation cursor is missing.");

  const merged = new Map();
  for (const item of [...previousItems, ...rawItems.map(normalizeItem).filter(Boolean)]) merged.set(item.id, item);
  return Object.freeze({
    items: Object.freeze([...merged.values()]),
    unreadCount,
    hasMore: page.hasMore,
    nextCursor
  });
}

function safeErrorMessage(error) {
  if (Number(error?.status) === 429) return "Notifications are being checked too quickly. Try again shortly.";
  if (Number(error?.status) >= 500 || error?.code === "NETWORK_ERROR" || error?.code === "OFFLINE") {
    return "Notifications are temporarily unavailable. Existing alerts remain visible.";
  }
  return "Notifications could not be loaded safely.";
}

function dispatchInvalidSession(error, config, runtime = globalThis) {
  if (Number(error?.status) !== 401) return false;
  const detail = Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: String(error?.code || "SESSION_INVALID"),
    requestId: String(error?.requestId || "")
  });
  try { config.onSessionInvalid?.(detail); } catch { /* Host callbacks cannot block safe exit. */ }
  const eventName = String(config.sessionInvalidEvent || "econovaria:player-session-invalid");
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail }));
  return true;
}

export function installNotificationInboxFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement) || config.usePreviewData === true) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("The notification inbox flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let model = { items: [], unreadCount: 0, hasMore: false, nextCursor: null };
  let loading = false;
  let error = "";
  let destroyed = false;

  function drawer() {
    return mount.querySelector("[data-player-notification-drawer]");
  }

  function capabilityEnabled(endpointKey) {
    return isEndpointEnabled(terminal.getState()?.data?.capabilities, endpointKey);
  }

  function updateBell() {
    const bell = mount.querySelector('[data-player-local-action="toggle-notifications"]');
    const badge = bell?.querySelector("small");
    if (badge) badge.textContent = String(model.unreadCount);
    if (bell) bell.setAttribute("aria-label", `${bell.getAttribute("aria-expanded") === "true" ? "Close" : "Open"} notifications, ${model.unreadCount} unread`);
  }

  function render() {
    if (destroyed) return;
    const host = drawer();
    if (!host) return;
    const notices = model.items.length
      ? model.items.map((item) => `<article class="player-terminal-notice is-${escapeHtml(item.tone)}" data-player-notification-id="${escapeHtml(item.id)}"><span></span><div><small>${escapeHtml(item.category.label)}</small><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div></article>`).join("")
      : `<p class="player-terminal-inline-empty">${loading ? "Loading notifications…" : error ? escapeHtml(error) : "No unread notifications."}</p>`;
    const loadMore = model.hasMore
      ? `<button class="player-terminal-drawer-action" type="button" data-player-notification-load-more ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Load more"}</button>`
      : "";
    const markDisabled = loading || !model.items.some((item) => item.status === "unread") || !capabilityEnabled("notificationsRead");
    host.innerHTML = `<div class="player-terminal-drawer-head"><div><span>PLAYER ALERTS</span><strong>${escapeHtml(model.unreadCount)} Unread</strong></div><small>${escapeHtml(model.items.length)} loaded</small></div><div class="player-terminal-notice-list">${notices}</div>${loadMore}<button class="player-terminal-drawer-action" type="button" data-player-notification-mark-read ${markDisabled ? "disabled" : ""}>Mark loaded alerts read</button>`;
    updateBell();
  }

  async function loadPage({ append = false } = {}) {
    if (loading || !capabilityEnabled("notifications")) return;
    loading = true;
    error = "";
    render();
    try {
      api.setSession(config);
      const body = await api.request("notificationsPage", {
        payload: {
          status: "unread",
          limit: 20,
          cursor: append ? model.nextCursor : undefined
        },
        force: true
      });
      model = normalizeNotificationPage(body, append ? model.items : []);
    } catch (requestError) {
      if (dispatchInvalidSession(requestError, config)) return;
      error = safeErrorMessage(requestError);
    } finally {
      loading = false;
      render();
    }
  }

  async function markLoadedRead(button) {
    if (loading || !capabilityEnabled("notificationsRead")) return;
    const deliveryIds = model.items.filter((item) => item.status === "unread").map((item) => item.id);
    if (!deliveryIds.length) return;
    const restore = setButtonProcessing(button, "Marking read");
    loading = true;
    try {
      api.setSession(config);
      await api.execute("notificationsRead", { deliveryIds });
      model = { items: [], unreadCount: Math.max(0, model.unreadCount - deliveryIds.length), hasMore: false, nextCursor: null };
      await loadPage();
      restore("Completed");
      setTimeout(() => restore(), 900);
    } catch (requestError) {
      restore();
      loading = false;
      if (dispatchInvalidSession(requestError, config)) return;
      error = safeErrorMessage(requestError);
      render();
    }
  }

  function handleClick(event) {
    const toggle = event.target.closest?.('[data-player-local-action="toggle-notifications"]');
    if (toggle) {
      const opening = terminal.getState()?.ui?.notificationsOpen !== true;
      if (opening) queueMicrotask(() => void loadPage());
      return;
    }
    const loadMore = event.target.closest?.("[data-player-notification-load-more]");
    if (loadMore) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void loadPage({ append: true });
      return;
    }
    const markRead = event.target.closest?.("[data-player-notification-mark-read]");
    if (markRead) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void markLoadedRead(markRead);
    }
  }

  mount.addEventListener("click", handleClick, true);
  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleClick, true);
    }
  };
}
