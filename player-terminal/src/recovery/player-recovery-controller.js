import {
  classifyPlayerRecoverySignal,
  restoredPlayerRecoveryState,
  retrySeconds,
} from "./recovery-policy.js";

const MUTATION_CONTROL_SELECTOR = [
  "[data-player-form][data-endpoint] input",
  "[data-player-form][data-endpoint] select",
  "[data-player-form][data-endpoint] textarea",
  "[data-player-form][data-endpoint] button",
  "[data-player-marketplace-cancel]",
  "[data-player-skill-unlock]",
  "[data-player-reward-claim]",
  "[data-player-market-watchlist]",
  "[data-player-purchase]",
  "[data-player-contract-accept]",
  "[data-player-inventory-use]",
  "[data-player-action=\"notifications-read\"]",
].join(",");

const LIFECYCLE_STATE_KINDS = new Set(["game-paused", "game-ended"]);
const ACTIVE_LIFECYCLE_CODES = new Set(["GAME_ACTIVE", "GAME_RESUMED", "MUTATIONS_RESUMED"]);

function safeDocument(mount, runtime) {
  return mount?.ownerDocument || runtime?.document || null;
}

function createTextElement(documentLike, tagName, text, className = "") {
  const element = documentLike.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function ensureRecoveryRegion(mount, runtime) {
  let region = mount.querySelector?.("[data-player-recovery-region]");
  if (region) return region;

  const documentLike = safeDocument(mount, runtime);
  if (!documentLike?.createElement) return null;

  region = documentLike.createElement("section");
  region.className = "player-terminal-route-error player-terminal-recovery-state";
  region.dataset.playerRecoveryRegion = "true";
  region.hidden = true;
  region.setAttribute?.("aria-live", "polite");
  region.setAttribute?.("aria-atomic", "true");
  mount.append?.(region);
  return region;
}

function recoverySignalFromToast(toast, runtime) {
  const message = String(toast?.textContent || "").trim();
  if (!message) return null;
  return classifyPlayerRecoverySignal({
    message,
    online: runtime?.navigator?.onLine !== false,
  });
}

function restoreControl(control) {
  if (!control?.dataset || control.dataset.playerRecoveryDisabled !== "true") return;
  if ("disabled" in control) control.disabled = false;
  control.removeAttribute?.("aria-disabled");
  const originalTitle = control.dataset.playerRecoveryOriginalTitle;
  if (originalTitle) control.setAttribute?.("title", originalTitle);
  else control.removeAttribute?.("title");
  delete control.dataset.playerRecoveryDisabled;
  delete control.dataset.playerRecoveryOriginalTitle;
}

function lockControl(control, reason) {
  if (!control || control.disabled || control.getAttribute?.("aria-disabled") === "true") return;
  if (!control.dataset) control.dataset = {};
  control.dataset.playerRecoveryDisabled = "true";
  control.dataset.playerRecoveryOriginalTitle = String(control.getAttribute?.("title") || "");
  if ("disabled" in control) control.disabled = true;
  control.setAttribute?.("aria-disabled", "true");
  control.setAttribute?.("title", reason);
}

function dispatchRecoveryState(runtime, state) {
  if (typeof runtime?.CustomEvent !== "function") return;
  runtime.dispatchEvent?.(new runtime.CustomEvent("econovaria:player-recovery-state-changed", {
    detail: { kind: state.kind, lockMutations: state.lockMutations },
  }));
}

function lifecycleRecoveryFromTerminal(terminal) {
  const session = terminal?.getState?.()?.data?.session || {};
  const code = String(
    session.gameLifecycleStatus ||
    session.lifecycleStatus ||
    session.gameStatus ||
    session.gameState ||
    "",
  ).trim().toUpperCase();
  if (session.mutationsPaused === true && !code) {
    return classifyPlayerRecoverySignal({ code: "GAME_MUTATIONS_PAUSED" });
  }
  if (!code || ACTIVE_LIFECYCLE_CODES.has(code)) return null;
  return classifyPlayerRecoverySignal({ code });
}

export function installPlayerRecoveryController({
  terminal,
  config = {},
  mount,
  runtime = globalThis,
} = {}) {
  if (!terminal || typeof terminal.refresh !== "function" || typeof terminal.getState !== "function") {
    throw new TypeError("A Player Terminal instance with refresh and getState is required.");
  }
  if (!mount || typeof mount.addEventListener !== "function") {
    throw new TypeError("A Player Terminal mount is required.");
  }

  const recoveryEvent = String(config.playerRecoveryEvent || "econovaria:player-recovery-signal");
  const sessionInvalidEvent = String(config.sessionInvalidEvent || "econovaria:player-session-invalid");
  const sessionReadyEvent = String(config.sessionReadyEvent || "econovaria:player-session-ready");
  const processedToasts = new WeakSet();

  let currentState = null;
  let lifecycleState = null;
  let countdownTimer = 0;
  let autoDismissTimer = 0;
  let retryStartedAt = 0;
  let destroyed = false;
  let lastRouteErrorText = "";

  function region() {
    return ensureRecoveryRegion(mount, runtime);
  }

  function clearTimer(name) {
    const value = name === "countdown" ? countdownTimer : autoDismissTimer;
    if (!value) return;
    if (name === "countdown") runtime.clearInterval?.(value);
    else runtime.clearTimeout?.(value);
    if (name === "countdown") countdownTimer = 0;
    else autoDismissTimer = 0;
  }

  function mutationControls() {
    return [...(mount.querySelectorAll?.(MUTATION_CONTROL_SELECTOR) || [])];
  }

  function unlockMutations() {
    mutationControls().forEach(restoreControl);
  }

  function lockMutations(reason) {
    mutationControls().forEach((control) => lockControl(control, reason));
  }

  function updateMutationLock() {
    if (currentState?.lockMutations) lockMutations(currentState.message);
    else unlockMutations();
  }

  function dismiss() {
    if (!currentState?.canDismiss) return false;
    clearTimer("countdown");
    clearTimer("dismiss");
    currentState = null;
    retryStartedAt = 0;
    lastRouteErrorText = "";
    unlockMutations();
    const activeRegion = mount.querySelector?.("[data-player-recovery-region]");
    if (activeRegion) {
      activeRegion.hidden = true;
      activeRegion.dataset.playerRecoveryState = "";
      activeRegion.replaceChildren?.();
    }
    return true;
  }

  async function retry() {
    if (!currentState || currentState.canRetry === false) return false;
    try {
      await terminal.refresh();
      const lifecycle = lifecycleRecoveryFromTerminal(terminal);
      if (lifecycle) {
        lifecycleState = lifecycle;
        show(lifecycle);
      } else {
        lifecycleState = null;
        show(restoredPlayerRecoveryState());
      }
      return true;
    } catch (error) {
      const next = classifyPlayerRecoverySignal({
        status: error?.status,
        code: error?.code,
        message: error?.message,
        retryAfterMs: error?.retryAfterMs,
        online: runtime?.navigator?.onLine !== false,
      });
      if (next) show(next);
      return false;
    }
  }

  function render() {
    if (!currentState) return;
    const activeRegion = region();
    if (!activeRegion) return;
    const documentLike = safeDocument(mount, runtime);
    if (!documentLike?.createElement) return;

    const eyebrow = createTextElement(documentLike, "small", currentState.eyebrow);
    const title = createTextElement(documentLike, "h2", currentState.title);
    const message = createTextElement(documentLike, "p", currentState.message);
    const actions = documentLike.createElement("div");
    actions.className = "player-terminal-recovery-actions";

    const remaining = currentState.kind === "rate-limited"
      ? retrySeconds(currentState.retryAfterMs, Date.now() - retryStartedAt)
      : 0;

    if (currentState.canRetry || currentState.kind === "rate-limited") {
      const retryButton = createTextElement(
        documentLike,
        "button",
        remaining > 0 ? `Retry in ${remaining}s` : "Refresh terminal",
        "player-terminal-primary-button",
      );
      retryButton.type = "button";
      retryButton.dataset.playerRecoveryAction = "retry";
      retryButton.disabled = remaining > 0 || currentState.canRetry === false;
      retryButton.addEventListener?.("click", () => { void retry(); });
      actions.append?.(retryButton);
    }

    if (currentState.canDismiss) {
      const dismissButton = createTextElement(
        documentLike,
        "button",
        "Dismiss",
        "player-terminal-secondary-button",
      );
      dismissButton.type = "button";
      dismissButton.dataset.playerRecoveryAction = "dismiss";
      dismissButton.addEventListener?.("click", dismiss);
      actions.append?.(dismissButton);
    }

    activeRegion.replaceChildren?.(eyebrow, title, message, actions);
    activeRegion.hidden = false;
    activeRegion.dataset.playerRecoveryState = currentState.kind;
    activeRegion.setAttribute?.("role", currentState.tone === "red" ? "alert" : "status");
    activeRegion.setAttribute?.("aria-live", currentState.tone === "red" ? "assertive" : "polite");
    updateMutationLock();
  }

  function startCountdown() {
    clearTimer("countdown");
    if (currentState?.kind !== "rate-limited") return;
    retryStartedAt = Date.now();
    countdownTimer = runtime.setInterval?.(() => {
      if (!currentState || currentState.kind !== "rate-limited") {
        clearTimer("countdown");
        return;
      }
      const remaining = retrySeconds(currentState.retryAfterMs, Date.now() - retryStartedAt);
      if (remaining <= 0) {
        currentState = Object.freeze({ ...currentState, canRetry: true, lockMutations: false });
        clearTimer("countdown");
      }
      render();
    }, 1000) || 0;
  }

  function show(state) {
    if (destroyed || !state) return null;
    clearTimer("dismiss");
    currentState = state;
    if (LIFECYCLE_STATE_KINDS.has(state.kind)) lifecycleState = state;
    retryStartedAt = state.kind === "rate-limited" ? Date.now() : 0;
    render();
    startCountdown();
    if (!state.persistent) {
      autoDismissTimer = runtime.setTimeout?.(() => dismiss(), 4000) || 0;
    }
    dispatchRecoveryState(runtime, state);
    return state;
  }

  function inspectMount() {
    if (destroyed) return;
    const activeRegion = mount.querySelector?.("[data-player-recovery-region]");
    if (currentState && !activeRegion) render();
    else if (currentState?.lockMutations) updateMutationLock();

    for (const toast of mount.querySelectorAll?.(".player-terminal-toast") || []) {
      if (processedToasts.has(toast)) continue;
      processedToasts.add(toast);
      const state = recoverySignalFromToast(toast, runtime);
      if (state) show(state);
    }

    const routeError = mount.querySelector?.(".player-terminal-route-error:not([data-player-recovery-region])");
    const routeErrorText = String(routeError?.textContent || "").trim();
    if (routeErrorText && routeErrorText !== lastRouteErrorText) {
      lastRouteErrorText = routeErrorText;
      const state = classifyPlayerRecoverySignal({
        code: "ROUTE_DATA_UNAVAILABLE",
        message: routeErrorText,
        online: runtime?.navigator?.onLine !== false,
      });
      if (state) show(state);
    } else if (!routeErrorText) {
      lastRouteErrorText = "";
    }
  }

  function handleOffline() {
    show(classifyPlayerRecoverySignal({ online: false }));
  }

  function handleOnline() {
    if (lifecycleState) show(lifecycleState);
    else show(restoredPlayerRecoveryState());
  }

  function handleRecoveryEvent(event) {
    const detail = event?.detail || {};
    const code = String(detail.code || "").trim().toUpperCase();
    if (ACTIVE_LIFECYCLE_CODES.has(code)) {
      lifecycleState = null;
      show(restoredPlayerRecoveryState());
      return;
    }
    const state = classifyPlayerRecoverySignal({
      ...detail,
      online: runtime?.navigator?.onLine !== false,
    });
    if (state) show(state);
  }

  function handleSessionInvalid() {
    clearTimer("countdown");
    clearTimer("dismiss");
    unlockMutations();
    currentState = null;
    lifecycleState = null;
    const activeRegion = mount.querySelector?.("[data-player-recovery-region]");
    if (activeRegion) activeRegion.hidden = true;
  }

  function handleSessionReady() {
    const lifecycle = lifecycleRecoveryFromTerminal(terminal);
    if (lifecycle) show(lifecycle);
    else inspectMount();
  }

  const Observer = runtime.MutationObserver;
  const observer = typeof Observer === "function"
    ? new Observer(inspectMount)
    : null;
  observer?.observe?.(mount, { childList: true, subtree: true });

  runtime.addEventListener?.("offline", handleOffline);
  runtime.addEventListener?.("online", handleOnline);
  runtime.addEventListener?.(recoveryEvent, handleRecoveryEvent);
  runtime.addEventListener?.(sessionInvalidEvent, handleSessionInvalid);
  runtime.addEventListener?.(sessionReadyEvent, handleSessionReady);

  if (runtime?.navigator?.onLine === false) handleOffline();
  else {
    const lifecycle = lifecycleRecoveryFromTerminal(terminal);
    if (lifecycle) show(lifecycle);
    else inspectMount();
  }

  return Object.freeze({
    dismiss,
    inspect: inspectMount,
    retry,
    show,
    getState() {
      return currentState;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer("countdown");
      clearTimer("dismiss");
      observer?.disconnect?.();
      runtime.removeEventListener?.("offline", handleOffline);
      runtime.removeEventListener?.("online", handleOnline);
      runtime.removeEventListener?.(recoveryEvent, handleRecoveryEvent);
      runtime.removeEventListener?.(sessionInvalidEvent, handleSessionInvalid);
      runtime.removeEventListener?.(sessionReadyEvent, handleSessionReady);
      unlockMutations();
      mount.querySelector?.("[data-player-recovery-region]")?.remove?.();
    },
  });
}
