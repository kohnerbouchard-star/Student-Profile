import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { escapeHtml } from "../../core/format.js";

const PUBLIC_DELIVERY_ID = /^ndl_[0-9a-f]{32}$/;
const CATEGORY_LABELS = Object.freeze({ attendance: "Attendance", contract: "Contracts", economy: "Economy", general: "General", inventory: "Inventory", market: "Market", security: "Security", store: "Store", story: "Story", system: "System" });

function boundedText(value, fallback = "", limit = 500) { const text = typeof value === "string" ? value.trim() : ""; return (text || fallback).slice(0, limit); }
export function resolvePlayerNotificationCategory(item = {}) {
  const combined = `${boundedText(item.sourceType).toLowerCase()} ${boundedText(item.notificationType).toLowerCase()}`;
  const category = /security|authentication|session|credential/.test(combined) ? "security" : /attendance|clock/.test(combined) ? "attendance" : /contract|assignment|submission/.test(combined) ? "contract" : /inventory|redemption|item|equipment|craft/.test(combined) ? "inventory" : /store|purchase|quote|receipt/.test(combined) ? "store" : /stock|market|portfolio|trade|exchange/.test(combined) ? "market" : /story|campaign|cutscene|briefing|war|event/.test(combined) ? "story" : /economy|ledger|bank|cash|reward|currency/.test(combined) ? "economy" : /system|admin|settings|game/.test(combined) ? "system" : "general";
  return Object.freeze({ key: category, label: CATEGORY_LABELS[category] });
}
function toneForPriority(value) { const priority = boundedText(value).toLowerCase(); if (["critical", "high", "urgent"].includes(priority)) return "warn"; if (priority === "low") return "cyan"; return "purple"; }
function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const id = boundedText(item.deliveryId || item.id).toLowerCase();
  if (!PUBLIC_DELIVERY_ID.test(id)) return null;
  const category = resolvePlayerNotificationCategory(item);
  const status = boundedText(item.status).toLowerCase();
  if (!["unread", "read", "dismissed"].includes(status)) return null;
  return Object.freeze({ id, notificationId: boundedText(item.notificationId).toLowerCase(), title: boundedText(item.title, "Notification", 180), detail: boundedText(item.summary || item.detail, "A new player update is available.", 1000), category, tone: toneForPriority(item.priority), status, deliveredAt: boundedText(item.deliveredAt, "", 80) });
}
export function normalizeNotificationPage(body, previousItems = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError("Notification page response must be an object.");
  if (!Array.isArray(body.items)) throw new TypeError("Notification deliveries are missing.");
  const rawItems = body.items;
  const page = body.page && typeof body.page === "object" && !Array.isArray(body.page) ? body.page : {};
  const summary = body.summary && typeof body.summary === "object" && !Array.isArray(body.summary) ? body.summary : {};
  const unreadCount = summary.unreadCount;
  const returned = page.returned;
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) throw new TypeError("Notification unread count is invalid.");
  if (!Number.isSafeInteger(returned) || returned < 0 || returned !== rawItems.length || typeof page.hasMore !== "boolean") throw new TypeError("Notification page metadata is invalid.");
  const nextCursor = page.nextCursor;
  const validCursor = typeof nextCursor === "string" && /^[A-Za-z0-9_-]{1,256}$/u.test(nextCursor);
  if (page.hasMore ? !validCursor || returned === 0 : nextCursor !== null) {
    throw new TypeError("Notification continuation cursor is invalid.");
  }
  const items = rawItems.map(normalizeItem);
  if (items.some(item => !item) || new Set(items.map(item => item.id)).size !== items.length) {
    throw new TypeError("Notification page contains invalid deliveries.");
  }
  const merged = new Map(); for (const item of [...previousItems, ...items]) merged.set(item.id, item);
  return Object.freeze({ items: Object.freeze([...merged.values()]), unreadCount, hasMore: page.hasMore, nextCursor });
}
function safeErrorMessage(error) { if (Number(error?.status) === 429) return "Notifications are being checked too quickly. Try again shortly."; if (Number(error?.status) >= 500 || error?.code === "NETWORK_ERROR" || error?.code === "OFFLINE") return "Notifications are temporarily unavailable. Existing alerts remain visible."; return "Notifications could not be loaded safely."; }
function dispatchInvalidSession(error, config, runtime = globalThis) { if (Number(error?.status) !== 401) return false; const detail = Object.freeze({ reason: "invalid_player_session", terminal: "player", status: 401, code: String(error?.code || "SESSION_INVALID"), requestId: String(error?.requestId || "") }); try { config.onSessionInvalid?.(detail); } catch {} runtime.dispatchEvent?.(new runtime.CustomEvent(String(config.sessionInvalidEvent || "econovaria:player-session-invalid"), { detail })); return true; }

const READ_BATCH_LIMIT = 50;
const DRAWER_ACTIONS = [
  "[data-player-notification-refresh]",
  "[data-player-notification-load-more]",
  "[data-player-notification-mark-read]",
];
const PUBLIC_NOTIFICATION_ID = /^ntf_[0-9a-f]{32}$/u;
const emptyModel = () => ({ items: [], unreadCount: null, hasMore: false, nextCursor: null });

function confirmedDeliveries(result, requested) {
  const ids = new Set(requested);
  if (result?.ok !== true || result.requestedCount !== ids.size ||
    !Number.isSafeInteger(result.newlyReadCount) || result.newlyReadCount < 0 ||
    !Number.isSafeInteger(result.alreadyReadCount) || result.alreadyReadCount < 0 ||
    result.newlyReadCount + result.alreadyReadCount !== ids.size ||
    typeof result.processedAt !== "string" || !Number.isFinite(Date.parse(result.processedAt)) ||
    !Array.isArray(result.deliveries) || result.deliveries.length !== ids.size) return false;
  return result.deliveries.every(row => ids.delete(row?.deliveryId) &&
    PUBLIC_NOTIFICATION_ID.test(row?.notificationId || "") &&
    typeof row?.seenAt === "string" && Number.isFinite(Date.parse(row.seenAt)));
}

function paintDrawer(host, markup) {
  if (host.innerHTML === markup) return;
  const active = globalThis.document?.activeElement;
  const focusedAction = host.contains(active) && DRAWER_ACTIONS.find(selector => active.closest?.(selector));
  host.innerHTML = markup;
  if (focusedAction) {
    const replacement = host.querySelector(focusedAction);
    (replacement && !replacement.disabled ? replacement : host).focus({ preventScroll: true });
  }
}

export function installNotificationInboxFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement) || config.usePreviewData === true) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") throw new TypeError("The notification inbox flow requires an active player terminal.");
  const api = new PlayerApi(config);
  const invalidEvent = config.sessionInvalidEvent || "econovaria:player-session-invalid";
  const readyEvent = config.sessionReadyEvent || "econovaria:player-session-ready";
  let model = emptyModel(), read = null, write = null, owner = "", route = "", open = false;
  let paged = false, countStale = false, unconfirmed = false, destroyed = false, canLoad = false;
  let generation = 0, readError = "", actionMessage = "";
  let sessionBlocked = false, renderedHost = null, renderedMarkup = "";
  let readOperation = null, retiredRead = null;
  const usedCursors = new Set();
  const confirmedReadIds = new Set();
  const drawer = () => mount.querySelector("[data-player-notification-drawer]");
  const capabilityEnabled = key => {
    const capabilities = terminal.getState()?.data?.capabilities;
    // The canonical GET is a manifest descriptor, not a write action. The
    // paged client alias must not require a synthetic action grant.
    return key === "notifications"
      ? capabilities?.endpointKeys?.notifications === true
      : isEndpointEnabled(capabilities, key);
  };
  const busy = () => Boolean(read || write);
  const canAutoRead = () => globalThis.document?.visibilityState !== "hidden" && globalThis.navigator?.onLine !== false;
  const retireRead = () => {
    if (!read) return;
    read.abort();
    if (readOperation) retiredRead = readOperation.catch(() => {});
    read = readOperation = null;
  };

  function retireOwner() {
    generation++;
    retireRead();
    write?.abort();
    write = null;
    model = emptyModel();
    paged = countStale = unconfirmed = false;
    readError = actionMessage = "";
    usedCursors.clear();
    confirmedReadIds.clear();
  }

  function updateBell() {
    const bell = mount.querySelector('[data-player-local-action="toggle-notifications"]');
    const badge = bell?.querySelector("small");
    const count = model.unreadCount;
    if (badge) badge.textContent = count === null ? "" : String(count);
    if (bell) bell.setAttribute("aria-label", `${bell.getAttribute("aria-expanded") === "true" ? "Close" : "Open"} notifications, ${count === null ? "unread count unavailable" : `${count} unread${countStale ? " (last checked)" : ""}`}`);
  }

  function render() {
    if (destroyed) return;
    updateBell();
    const host = drawer();
    if (!host || !open) return;
    const notices = !canLoad ? '<p class="player-terminal-inline-empty">Notifications are unavailable for this session.</p>'
      : model.items.length ? model.items.map(item => `<article class="player-terminal-notice is-${escapeHtml(item.tone)}" data-player-notification-id="${escapeHtml(item.id)}"><span></span><div><small>${escapeHtml(item.category.label)}</small><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div></article>`).join("")
      : `<p class="player-terminal-inline-empty">${read ? "Loading notifications…" : model.unreadCount === 0 ? "No unread notifications." : "No unread alerts loaded."}</p>`;
    const names = model.items.filter(item => item.status === "unread");
    const markLabel = names.length > READ_BATCH_LIMIT ? "Mark first 50 loaded alerts read" : "Mark loaded alerts read";
    const loadMore = model.hasMore ? `<button class="player-terminal-drawer-action" type="button" data-player-notification-load-more aria-disabled="${busy() || unconfirmed}">Load more</button>` : "";
    const count = model.unreadCount === null ? "Unread count unavailable" : `${model.unreadCount} Unread${countStale ? " (last checked)" : ""}`;
    const error = readError ? `<p class="player-terminal-inline-error" role="status">${escapeHtml(readError)}</p>` : "";
    const paging = paged ? '<p>Automatic refresh is paused while older alerts are loaded.</p>' : "";
    const status = actionMessage ? `<p role="status">${escapeHtml(actionMessage)}</p>` : "";
    const markup = `<div class="player-terminal-drawer-head"><div><span>PLAYER ALERTS</span><strong>${escapeHtml(count)}</strong></div><small>${model.items.length} loaded</small></div><div class="player-terminal-notice-list">${notices}</div>${error}${status}${paging}${loadMore}<button class="player-terminal-drawer-action" type="button" data-player-notification-refresh aria-disabled="${busy()}" ${capabilityEnabled("notifications") ? "" : "disabled"}>Refresh newest alerts</button><button class="player-terminal-drawer-action" type="button" data-player-notification-mark-read aria-disabled="${busy() || unconfirmed}" ${canLoad && names.length && capabilityEnabled("notificationsRead") ? "" : "disabled"}>${write ? "Marking read…" : markLabel}</button>`;
    if (renderedHost === host && renderedMarkup === markup) return;
    renderedHost = host;
    renderedMarkup = markup;
    paintDrawer(host, markup);
  }

  function synchronize() {
    if (destroyed) return;
    api.setSession(config);
    const state = terminal.getState();
    const session = state?.data?.session;
    const nextOwner = JSON.stringify([api.sessionVersion, session?.gameSessionId, session?.playerId, session?.playerSessionId]);
    const changedOwner = nextOwner !== owner;
    const nextOpen = !sessionBlocked && state?.status === "ready" && state.ui?.notificationsOpen === true;
    const nextCanLoad = capabilityEnabled("notifications");
    const newlyOpen = nextOpen && (!open || changedOwner || route !== state.route || (!canLoad && nextCanLoad));
    if (changedOwner || (canLoad && !nextCanLoad)) { retireOwner(); owner = nextOwner; }
    canLoad = nextCanLoad;
    if (write && !capabilityEnabled("notificationsRead")) {
      write.abort();
      write = null;
      unconfirmed = true;
      countStale = model.unreadCount !== null;
      actionMessage = "Mark read outcome not confirmed. Refresh newest alerts before trying again.";
    }
    if (!nextOpen || route !== state?.route) retireRead();
    route = state?.route;
    open = nextOpen;
    render();
    if (newlyOpen && canAutoRead() && !paged && !unconfirmed && !busy()) void loadPage();
  }

  async function loadPage({ append = false, explicit = false } = {}) {
    if (!open || busy() || !canLoad || (unconfirmed && !explicit)) return;
    const cursor = append ? model.nextCursor : undefined;
    if (append && (!model.hasMore || !cursor || usedCursors.has(cursor) || unconfirmed)) return;
    const controller = new AbortController(), token = generation;
    read = controller;
    readError = "";
    render();
    try {
      // The API may briefly coalesce requests for the same page after aborting.
      // Wait for the retired operation to release its slot before a new read.
      if (retiredRead) await retiredRead;
      if (token !== generation || read !== controller) return;
      readOperation = api.request("notificationsPage", { payload: { status: "unread", limit: 20, cursor }, signal: controller.signal, force: true });
      const body = await readOperation;
      synchronize();
      if (token !== generation || read !== controller) return;
      const next = normalizeNotificationPage(body, append ? model.items : []);
      if (append && next.hasMore && (next.nextCursor === cursor || usedCursors.has(next.nextCursor))) throw new TypeError("Invalid notification continuation.");
      const items = next.items.filter(item => !confirmedReadIds.has(item.id));
      model = { ...next, items };
      // A newly returned page can still lag an already confirmed write.
      countStale = items.length !== next.items.length;
      if (append) {
        paged = true;
        usedCursors.add(cursor);
      } else {
        paged = false;
        usedCursors.clear();
        unconfirmed = false;
        actionMessage = "";
      }
    } catch (requestError) {
      synchronize();
      if (token !== generation || read !== controller || dispatchInvalidSession(requestError, config)) return;
      readError = safeErrorMessage(requestError);
      countStale = model.unreadCount !== null;
    } finally {
      if (read === controller) { read = readOperation = null; render(); }
    }
  }

  async function markLoadedRead() {
    if (!open || !canLoad || busy() || unconfirmed || !capabilityEnabled("notificationsRead")) return;
    const deliveryIds = model.items.filter(item => item.status === "unread").slice(0, READ_BATCH_LIMIT).map(item => item.id);
    if (!deliveryIds.length) return;
    const controller = new AbortController(), token = generation;
    write = controller;
    actionMessage = "";
    render();
    try {
      const { result } = await api.execute("notificationsRead", { deliveryIds }, {}, { signal: controller.signal });
      synchronize();
      if (token !== generation || write !== controller) return;
      if (!confirmedDeliveries(result, deliveryIds)) throw new TypeError("Mark read response was not confirmed.");
      const delivered = new Set(deliveryIds);
      for (const id of delivered) confirmedReadIds.add(id);
      model = { ...model, items: model.items.filter(item => !delivered.has(item.id)) };
      countStale = true;
      actionMessage = `${deliveryIds.length} loaded alerts confirmed read. The total is from the last check.`;
    } catch (requestError) {
      synchronize();
      if (token !== generation || write !== controller || dispatchInvalidSession(requestError, config)) return;
      // A 409 (and some other failures) can occur after the update, so
      // nothing but a validated receipt can establish which rows changed.
      unconfirmed = true;
      countStale = model.unreadCount !== null;
      actionMessage = "Mark read outcome not confirmed. Refresh newest alerts before trying again.";
    } finally {
      if (write === controller) { write = null; render(); }
    }
  }

  function handleClick(event) {
    if (event.target.closest?.('[data-player-local-action="toggle-notifications"]')) {
      queueMicrotask(synchronize);
      return;
    }
    const action = DRAWER_ACTIONS.find(selector => event.target.closest?.(selector));
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    synchronize();
    if (action === DRAWER_ACTIONS[2]) void markLoadedRead();
    else if (action === DRAWER_ACTIONS[1]) void loadPage({ append: true });
    else void loadPage({ explicit: true });
  }

  function pollVisibleDrawer() {
    synchronize();
    if (destroyed || !open || paged || unconfirmed || !canAutoRead()) return;
    void loadPage();
  }

  const sessionInvalid = () => {
    sessionBlocked = true;
    retireOwner();
    open = false;
    const host = drawer();
    if (host) host.innerHTML = "";
    renderedHost = null;
    updateBell();
  };
  const sessionReady = () => { sessionBlocked = false; synchronize(); };
  // Use the shell's explicit post-render seam, including requestRender(),
  // rather than adding a second observer of the shared mount.
  const unsubscribe = terminal.subscribeShellRender?.(synchronize) ?? terminal.subscribe?.(synchronize);
  const pollTimer = globalThis.setInterval(pollVisibleDrawer, 15_000);
  globalThis.addEventListener?.(invalidEvent, sessionInvalid);
  globalThis.addEventListener?.(readyEvent, sessionReady);
  mount.addEventListener("click", handleClick, true);
  synchronize();
  return { destroy() {
    destroyed = true;
    retireOwner();
    unsubscribe?.();
    globalThis.clearInterval(pollTimer);
    globalThis.removeEventListener?.(invalidEvent, sessionInvalid);
    globalThis.removeEventListener?.(readyEvent, sessionReady);
    mount.removeEventListener("click", handleClick, true);
  } };
}
