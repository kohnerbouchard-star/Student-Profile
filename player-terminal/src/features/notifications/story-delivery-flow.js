import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";

const DELIVERY_ID = /^ndl_[0-9a-f]{32}$/;
const NOTIFICATION_ID = /^ntf_[0-9a-f]{32}$/;
const ASSET_KEY = /^[a-z0-9][a-z0-9._-]{0,159}$/;
const DISPLAY_MODES = new Set(["modal_immediate", "modal_on_next_login"]);
const PRIORITIES = new Set(["critical", "major", "normal", "low"]);
const ACTIONS = new Set(["seen", "dismissed", "acknowledged"]);

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function requiredIso(value) {
  const normalized = text(value, 80);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : "";
}

function optionalIso(value) {
  if (value === null || value === undefined || value === "") return "";
  return requiredIso(value);
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const deliveryId = text(item.deliveryId, 64).toLowerCase();
  const notificationId = text(item.notificationId, 64).toLowerCase();
  const content = item.content && typeof item.content === "object" && !Array.isArray(item.content) ? item.content : {};
  const videoAssetKey = text(content.videoAssetKey, 160).toLowerCase();
  const posterAssetKey = text(content.posterAssetKey, 160).toLowerCase();
  const displayMode = text(item.displayMode, 40).toLowerCase();
  const publishedAt = requiredIso(item.publishedAt);
  const deliveredAt = requiredIso(item.deliveredAt);
  if (
    !DELIVERY_ID.test(deliveryId) || !NOTIFICATION_ID.test(notificationId) ||
    !ASSET_KEY.test(videoAssetKey) || (posterAssetKey && !ASSET_KEY.test(posterAssetKey)) ||
    !DISPLAY_MODES.has(displayMode) || !publishedAt || !deliveredAt
  ) return null;
  const priority = text(item.priority, 32).toLowerCase();
  return Object.freeze({
    deliveryId,
    notificationId,
    category: "story",
    title: text(item.title, 180) || "Story briefing",
    summary: text(item.summary, 1200),
    priority: PRIORITIES.has(priority) ? priority : "normal",
    displayMode,
    publishedAt,
    deliveredAt,
    seenAt: optionalIso(item.seenAt),
    acknowledgedAt: optionalIso(item.acknowledgedAt),
    requiresAcknowledgement: item.requiresAcknowledgement === true,
    content: Object.freeze({
      videoAssetKey,
      posterAssetKey: posterAssetKey || null,
      tone: text(content.tone, 64).toLowerCase() || null,
      act: Number.isSafeInteger(content.act) && content.act >= 0 && content.act <= 1000 ? content.act : null,
      sequence: Number.isSafeInteger(content.sequence) && content.sequence >= 0 && content.sequence <= 100000 ? content.sequence : null,
    }),
  });
}

export function normalizeStoryDeliveryList(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.items)) {
    throw new TypeError("Story delivery response is invalid.");
  }
  return Object.freeze(body.items.map(normalizeItem).filter(Boolean).slice(0, 10));
}

function normalizeCommittedState(body, expectedDeliveryId, expectedAction) {
  const delivery = body?.delivery;
  const action = text(body?.action, 32).toLowerCase();
  const deliveryId = text(delivery?.deliveryId, 64).toLowerCase();
  if (!ACTIONS.has(action) || action !== expectedAction || deliveryId !== expectedDeliveryId) {
    throw new TypeError("Story delivery state response is invalid.");
  }
  return Object.freeze({
    seenAt: optionalIso(delivery.seenAt),
    dismissedAt: optionalIso(delivery.dismissedAt),
    acknowledgedAt: optionalIso(delivery.acknowledgedAt),
  });
}

function invalidSessionDetail(error) {
  return Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: String(error?.code || "SESSION_INVALID"),
    requestId: String(error?.requestId || ""),
  });
}

function errorCode(error) {
  return String(error?.code || error?.body?.error?.code || "").toLowerCase();
}

export function installStoryDeliveryFlow({ mount, terminal, config, api: suppliedApi = null, runtime = globalThis }) {
  if (!(mount instanceof HTMLElement) || config.usePreviewData === true) return { destroy() {} };
  const api = suppliedApi || new PlayerApi(config);
  let queue = [];
  let current = null;
  let loadingList = false;
  let transitioning = false;
  let sessionKey = "";
  let destroyed = false;
  let version = 0;
  let opener = null;
  let pendingDismissal = false;

  function enabled() {
    return isEndpointEnabled(terminal.getState()?.data?.capabilities, "storyDeliveries");
  }

  function activeStoryModal() {
    return terminal.getState()?.modal?.type === "storyCutscene";
  }

  function closeOwnedModal() {
    if (activeStoryModal()) terminal.closeModal();
  }

  function clearState() {
    version += 1;
    queue = [];
    current = null;
    opener = null;
    loadingList = false;
    transitioning = false;
    pendingDismissal = false;
    closeOwnedModal();
  }

  function dispatchInvalidSession(error) {
    if (Number(error?.status) !== 401) return false;
    const detail = invalidSessionDetail(error);
    clearState();
    try { config.onSessionInvalid?.(detail); } catch { /* Safe exit continues. */ }
    runtime.dispatchEvent?.(new runtime.CustomEvent(
      String(config.sessionInvalidEvent || "econovaria:player-session-invalid"),
      { detail },
    ));
    return true;
  }

  function renderCurrent({ error = "", processing = false, rememberOpener = false } = {}) {
    current = queue[0] || null;
    if (!current) {
      closeOwnedModal();
      opener = null;
      return;
    }
    if (rememberOpener && !opener) {
      const candidate = runtime.document?.activeElement;
      opener = candidate instanceof HTMLElement && !candidate.closest?.(".player-terminal-modal")
        ? candidate
        : mount.querySelector?.("#player-main-content");
    }
    terminal.openModal(
      { type: "storyCutscene", delivery: current, error, processing },
      rememberOpener ? opener : null,
    );
  }

  async function load({ force = true } = {}) {
    if (destroyed || loadingList || transitioning || !enabled()) return;
    const loadVersion = ++version;
    loadingList = true;
    try {
      api.setSession?.(config);
      const body = await api.request("storyDeliveries", { force });
      if (destroyed || loadVersion !== version) return;
      queue = [...normalizeStoryDeliveryList(body)];
    } catch (error) {
      if (destroyed || loadVersion !== version) return;
      if (!dispatchInvalidSession(error)) {
        terminal.showToast("Story briefings are temporarily unavailable.", "amber");
      }
      return;
    } finally {
      if (loadVersion === version) loadingList = false;
    }
    if (destroyed || loadVersion !== version) return;
    renderCurrent({ rememberOpener: true });
    if (current && !current.seenAt) void updateState("seen", { keepOpen: true });
  }

  function removeCurrentAndContinue(message = "") {
    pendingDismissal = false;
    queue.shift();
    current = null;
    closeOwnedModal();
    if (message) terminal.showToast(message, "amber");
    renderCurrent({ rememberOpener: false });
    if (current && !current.seenAt) void updateState("seen", { keepOpen: true });
  }

  async function reconcileConflict() {
    pendingDismissal = false;
    queue = [];
    current = null;
    closeOwnedModal();
    transitioning = false;
    await load({ force: true });
  }

  async function updateState(action, { keepOpen = false } = {}) {
    if (!ACTIONS.has(action) || !current || loadingList || transitioning || destroyed) return;
    const target = current;
    const transitionVersion = version;
    transitioning = true;
    renderCurrent({ processing: true });

    let operation;
    try {
      api.setSession?.(config);
      operation = await api.execute("storyDeliveryState", { action }, { deliveryId: target.deliveryId });
    } catch (error) {
      if (destroyed || transitionVersion !== version) return;
      transitioning = false;
      pendingDismissal = false;
      if (dispatchInvalidSession(error)) return;
      const code = errorCode(error);
      if (Number(error?.status) === 404 || code === "player_story_delivery_not_found") {
        removeCurrentAndContinue("That story briefing is no longer available.");
        return;
      }
      if (Number(error?.status) === 409 || code === "player_story_delivery_conflict") {
        await reconcileConflict();
        return;
      }
      renderCurrent({
        error: keepOpen
          ? "This briefing remains open, but its seen status could not be synchronized."
          : "The story response could not be saved. Try again.",
      });
      return;
    }

    if (destroyed || transitionVersion !== version) return;
    let committed;
    try {
      committed = normalizeCommittedState(operation?.result, target.deliveryId, action);
    } catch {
      transitioning = false;
      await reconcileConflict();
      return;
    }

    transitioning = false;
    if (action === "seen" && keepOpen) {
      current = Object.freeze({ ...target, ...committed });
      queue[0] = current;
      renderCurrent();
      if (pendingDismissal) {
        pendingDismissal = false;
        void updateState("dismissed");
      }
      return;
    }
    removeCurrentAndContinue();
  }

  function handleClick(event) {
    const button = event.target.closest?.("[data-player-story-action]");
    if (!button) return;
    event.preventDefault();
    void updateState(String(button.dataset.playerStoryAction || "").toLowerCase());
  }

  function handleCloseRequest(event) {
    if (!current || event.detail?.deliveryId !== current.deliveryId) return;
    if (current.requiresAcknowledgement) {
      renderCurrent({
        error: "Acknowledge this briefing before continuing.",
        processing: transitioning,
      });
      return;
    }
    if (transitioning) {
      pendingDismissal = true;
      return;
    }
    void updateState("dismissed");
  }

  function handleSessionInvalid() {
    clearState();
  }

  const unsubscribe = terminal.subscribe((state) => {
    if (destroyed) return;
    if (state.status !== "ready") {
      if (state.status === "error") clearState();
      return;
    }
    const token = String(config.playerSessionToken || "");
    const game = String(config.gameSessionId || state.data?.session?.gameSessionId || "");
    const playerSession = String(config.playerSessionId || state.data?.session?.playerSessionId || "");
    const nextSessionKey = token && game ? `${game}:${playerSession}:${token}` : "";
    if (!nextSessionKey || nextSessionKey === sessionKey) return;
    clearState();
    sessionKey = nextSessionKey;
    void load();
  });
  mount.addEventListener("click", handleClick);
  mount.addEventListener("econovaria:player-story-close-request", handleCloseRequest);
  runtime.addEventListener?.(String(config.sessionInvalidEvent || "econovaria:player-session-invalid"), handleSessionInvalid);
  const initial = terminal.getState();
  if (initial?.status === "ready") {
    const token = String(config.playerSessionToken || "");
    const game = String(config.gameSessionId || initial.data?.session?.gameSessionId || "");
    if (token && game) {
      sessionKey = `${game}:${String(config.playerSessionId || "")}:${token}`;
      void load();
    }
  }

  return {
    destroy() {
      destroyed = true;
      clearState();
      unsubscribe();
      mount.removeEventListener("click", handleClick);
      mount.removeEventListener("econovaria:player-story-close-request", handleCloseRequest);
      runtime.removeEventListener?.(String(config.sessionInvalidEvent || "econovaria:player-session-invalid"), handleSessionInvalid);
    },
  };
}
