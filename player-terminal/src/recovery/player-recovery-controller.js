import { PLAYER_OPERATION_EVENT, WRITE_CONTROL_SELECTOR } from "./player-operation-instrumentation.js";
export { PLAYER_OPERATION_EVENT, installPlayerRecoveryInstrumentation } from "./player-operation-instrumentation.js";



import {
  buildPlayerRecoveryPresentation,
  classifyPlayerRecovery
} from "./player-recovery-contract.js";

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function elementForSelector(mount, selector) {
  if (!selector) return null;
  try {
    return mount.querySelector(selector);
  } catch {
    return null;
  }
}

function safeState(terminal) {
  try {
    return terminal.getState?.() || null;
  } catch {
    return null;
  }
}

export function installPlayerRecoveryController({ mount, terminal, config = {}, runtime = globalThis }) {
  if (!(mount instanceof runtime.HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refresh !== "function") {
    throw new TypeError("The Player recovery controller requires an active Player Terminal.");
  }

  let destroyed = false;
  let online = runtime.navigator?.onLine !== false;
  let operationRecovery = null;
  let committedRecovery = null;
  let restoredUntil = 0;
  let noticeSignature = "";
  let renderScheduled = false;
  let countdownTimer = 0;
  const toastHost = runtime.document?.querySelector?.("[data-player-terminal-toast-host]") || null;

  function currentPresentation() {
    if (!online) {
      return {
        presentation: buildPlayerRecoveryPresentation({ code: "OFFLINE" }, { online: false }),
        retryTargetSelector: "",
        retryAvailableAt: 0
      };
    }
    if (operationRecovery) return operationRecovery;
    if (committedRecovery) return committedRecovery;
    if (restoredUntil > Date.now()) {
      return {
        presentation: Object.freeze({
          kind: "connection_restored",
          eyebrow: "CONNECTION RESTORED",
          title: "Player actions are available again",
          detail: "Current information remains visible. Retry only actions that did not receive a confirmed result.",
          tone: "green",
          action: "dismiss",
          actionLabel: "Dismiss",
          preserveData: true
        }),
        retryTargetSelector: "",
        retryAvailableAt: 0
      };
    }
    return null;
  }

  function restoreOfflineControls() {
    mount.querySelectorAll("[data-player-recovery-disabled]").forEach((control) => {
      const wasDisabled = control.dataset.playerRecoveryWasDisabled === "true";
      if (!wasDisabled && "disabled" in control) control.disabled = false;
      if (control.dataset.playerRecoveryAddedAria === "true") control.removeAttribute("aria-disabled");
      if (control.dataset.playerRecoveryPreviousTitle) control.setAttribute("title", control.dataset.playerRecoveryPreviousTitle);
      else if (control.dataset.playerRecoveryAddedTitle === "true") control.removeAttribute("title");
      delete control.dataset.playerRecoveryDisabled;
      delete control.dataset.playerRecoveryWasDisabled;
      delete control.dataset.playerRecoveryAddedAria;
      delete control.dataset.playerRecoveryPreviousTitle;
      delete control.dataset.playerRecoveryAddedTitle;
    });
  }

  function applyOfflineControls() {
    if (online) {
      restoreOfflineControls();
      return;
    }
    mount.querySelectorAll(WRITE_CONTROL_SELECTOR).forEach((control) => {
      if (control.dataset.playerRecoveryDisabled === "true") return;
      control.dataset.playerRecoveryDisabled = "true";
      control.dataset.playerRecoveryWasDisabled = String(Boolean(control.disabled));
      if (!control.hasAttribute("aria-disabled")) control.dataset.playerRecoveryAddedAria = "true";
      if (control.hasAttribute("title")) control.dataset.playerRecoveryPreviousTitle = control.getAttribute("title") || "";
      else control.dataset.playerRecoveryAddedTitle = "true";
      if ("disabled" in control) control.disabled = true;
      control.setAttribute("aria-disabled", "true");
      control.setAttribute("title", "Offline: economic actions are paused until the connection returns.");
    });
  }

  function ensureNoticeRegion() {
    let region = mount.querySelector("[data-player-recovery-region]");
    if (!region) {
      region = runtime.document.createElement("section");
      region.className = "player-terminal-recovery-notice";
      region.dataset.playerRecoveryRegion = "true";
      mount.append(region);
    }
    return region;
  }

  function renderNotice() {
    const current = currentPresentation();
    if (!current) {
      mount.querySelector("[data-player-recovery-region]")?.remove();
      noticeSignature = "";
      return;
    }

    const { presentation, retryTargetSelector = "", retryAvailableAt = 0 } = current;
    const remainingSeconds = retryAvailableAt > Date.now()
      ? Math.max(1, Math.ceil((retryAvailableAt - Date.now()) / 1000))
      : 0;
    const actionDisabled = presentation.action === "wait_online" || remainingSeconds > 0;
    const actionLabel = remainingSeconds > 0 ? `Retry in ${remainingSeconds}s` : presentation.actionLabel;
    const signature = JSON.stringify([
      presentation.kind,
      presentation.eyebrow,
      presentation.title,
      presentation.detail,
      presentation.tone,
      presentation.action,
      actionLabel,
      actionDisabled,
      retryTargetSelector
    ]);
    if (signature === noticeSignature && mount.querySelector("[data-player-recovery-region]")) return;
    noticeSignature = signature;

    const region = ensureNoticeRegion();
    region.className = `player-terminal-recovery-notice is-${presentation.tone}`;
    region.dataset.recoveryKind = presentation.kind;
    region.setAttribute("role", presentation.tone === "red" ? "alert" : "status");
    region.setAttribute("aria-live", presentation.tone === "red" ? "assertive" : "polite");
    region.replaceChildren();

    const copy = runtime.document.createElement("div");
    const eyebrow = runtime.document.createElement("small");
    const title = runtime.document.createElement("strong");
    const detail = runtime.document.createElement("p");
    eyebrow.textContent = presentation.eyebrow;
    title.textContent = presentation.title;
    detail.textContent = presentation.detail;
    copy.append(eyebrow, title, detail);
    region.append(copy);

    if (presentation.action && presentation.action !== "session_handoff") {
      const button = runtime.document.createElement("button");
      button.type = "button";
      button.className = "player-terminal-secondary-button";
      button.dataset.playerRecoveryAction = presentation.action;
      button.dataset.retryTargetSelector = retryTargetSelector;
      button.textContent = actionLabel;
      button.disabled = actionDisabled;
      button.setAttribute("aria-disabled", String(actionDisabled));
      region.append(button);
    }
  }

  function enhanceErrorSurface() {
    const state = safeState(terminal);
    if (!state) return;
    const errorPage = mount.querySelector(".player-terminal-error-page");
    if (state.status === "error" && errorPage) {
      const presentation = buildPlayerRecoveryPresentation(state.error, {
        online,
        scope: "read",
        operationLabel: "the Player Terminal connection"
      });
      setText(errorPage.querySelector("small"), presentation.eyebrow);
      setText(errorPage.querySelector("h2"), presentation.title);
      setText(errorPage.querySelector("p"), presentation.detail);
      const button = errorPage.querySelector("button");
      if (button) {
        setText(button, presentation.actionLabel || "Retry connection");
        const blocked = !online || presentation.action === "wait_online";
        button.disabled = blocked;
        button.setAttribute("aria-disabled", String(blocked));
      }
    }

    const routeError = state.routeErrors?.[state.route];
    const routePage = mount.querySelector(".player-terminal-route-error");
    if (routeError && routePage) {
      const presentation = buildPlayerRecoveryPresentation(routeError, {
        online,
        scope: "read",
        operationLabel: "this section"
      });
      setText(routePage.querySelector("small"), presentation.eyebrow);
      setText(routePage.querySelector("h2"), presentation.title);
      setText(routePage.querySelector("p"), presentation.detail);
      const button = routePage.querySelector("button");
      if (button) {
        setText(button, presentation.actionLabel || "Retry this section");
        const blocked = !online || presentation.action === "wait_online";
        button.disabled = blocked;
        button.setAttribute("aria-disabled", String(blocked));
      }
    }
  }

  function detectCommittedRefreshWarning() {
    const selector = ".player-terminal-toast.is-amber, .player-terminal-connector-status p, .player-terminal-form-error";
    const roots = toastHost && toastHost !== mount ? [mount, toastHost] : [mount];
    const warningNodes = roots.flatMap((root) => [...root.querySelectorAll(selector)]);
    for (const node of warningNodes) {
      const text = String(node.textContent || "").toLowerCase();
      const confirmed = text.includes("action completed. some information")
        || text.includes("completed, but current")
        || text.includes("completed successfully") && text.includes("could not be refreshed");
      if (!confirmed) continue;
      committedRecovery = {
        presentation: buildPlayerRecoveryPresentation({}, {
          committed: true,
          operationLabel: "The confirmed action",
          scope: "write"
        }),
        retryTargetSelector: "",
        retryAvailableAt: 0
      };
      break;
    }
  }

  function refreshDom() {
    if (destroyed) return;
    renderScheduled = false;
    applyOfflineControls();
    enhanceErrorSurface();
    detectCommittedRefreshWarning();
    renderNotice();
  }

  function scheduleRender() {
    if (destroyed || renderScheduled) return;
    renderScheduled = true;
    runtime.queueMicrotask?.(refreshDom) || Promise.resolve().then(refreshDom);
  }

  function handleOperation(event) {
    const detail = event?.detail || {};
    if (detail.phase === "succeeded") {
      if (operationRecovery?.endpointKey === detail.endpointKey) operationRecovery = null;
      scheduleRender();
      return;
    }
    if (detail.phase !== "failed") return;
    const error = detail.error || {};
    const kind = classifyPlayerRecovery(error, {
      idempotentWrite: detail.idempotentWrite === true,
      online,
      scope: "write"
    });
    if (["session_invalid", "invalid_request", "forbidden", "not_found", "cancelled", "write_failed"].includes(kind)) return;
    const presentation = buildPlayerRecoveryPresentation(error, {
      idempotentWrite: detail.idempotentWrite === true,
      online,
      operationLabel: detail.operationLabel,
      scope: "write"
    });
    operationRecovery = {
      endpointKey: detail.endpointKey,
      presentation,
      retryTargetSelector: String(detail.retryTargetSelector || ""),
      retryAvailableAt: presentation.retryAfterMs > 0 ? Date.now() + presentation.retryAfterMs : 0
    };
    scheduleRender();
  }

  async function retryOrRefresh(action, selector) {
    if (!online) return;
    if (action === "dismiss") {
      operationRecovery = null;
      committedRecovery = null;
      restoredUntil = 0;
      scheduleRender();
      return;
    }
    if (action === "retry_same") {
      const target = elementForSelector(mount, selector);
      if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") {
        target.focus?.({ preventScroll: true });
        target.click?.();
        return;
      }
    }
    const routeRetry = mount.querySelector('[data-player-action="retry-route"]');
    if (action === "retry" && routeRetry && !routeRetry.disabled) {
      routeRetry.click();
      return;
    }
    try {
      await terminal.refresh();
      committedRecovery = null;
      if (action !== "retry_same") operationRecovery = null;
    } catch {
      // The terminal or operation instrumentation will publish the bounded recovery state.
    }
    scheduleRender();
  }

  function handleClick(event) {
    const button = event.target.closest?.("[data-player-recovery-action]");
    if (!button) return;
    event.preventDefault();
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
    void retryOrRefresh(button.dataset.playerRecoveryAction, button.dataset.retryTargetSelector || "");
  }

  function handleOffline() {
    online = false;
    restoredUntil = 0;
    scheduleRender();
  }

  function handleOnline() {
    online = true;
    restoredUntil = Date.now() + 5000;
    scheduleRender();
    runtime.setTimeout?.(() => {
      if (restoredUntil <= Date.now()) {
        restoredUntil = 0;
        scheduleRender();
      }
    }, 5100);
  }

  function handleSessionInvalid() {
    operationRecovery = null;
    committedRecovery = null;
    restoredUntil = 0;
    scheduleRender();
  }

  const observer = typeof runtime.MutationObserver === "function"
    ? new runtime.MutationObserver(scheduleRender)
    : null;
  observer?.observe(mount, { childList: true, subtree: true });
  if (toastHost && toastHost !== mount) observer?.observe(toastHost, { childList: true, subtree: true });
  runtime.addEventListener?.(PLAYER_OPERATION_EVENT, handleOperation);
  runtime.addEventListener?.("offline", handleOffline);
  runtime.addEventListener?.("online", handleOnline);
  runtime.addEventListener?.(config.sessionInvalidEvent || "econovaria:player-session-invalid", handleSessionInvalid);
  mount.addEventListener("click", handleClick, true);
  countdownTimer = runtime.setInterval?.(scheduleRender, 1000) || 0;
  scheduleRender();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      if (countdownTimer) runtime.clearInterval?.(countdownTimer);
      runtime.removeEventListener?.(PLAYER_OPERATION_EVENT, handleOperation);
      runtime.removeEventListener?.("offline", handleOffline);
      runtime.removeEventListener?.("online", handleOnline);
      runtime.removeEventListener?.(config.sessionInvalidEvent || "econovaria:player-session-invalid", handleSessionInvalid);
      mount.removeEventListener("click", handleClick, true);
      restoreOfflineControls();
      mount.querySelector("[data-player-recovery-region]")?.remove();
    }
  };
}
