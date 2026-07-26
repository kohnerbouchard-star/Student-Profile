import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { markResourceInvalidations } from "../../api/invalidation-registry.js";

const MESSAGE_UNREAD_CONTROL = '[data-player-message-unread="true"]';
const MESSAGE_THREAD_CONTROL = "[data-player-message-thread]";
const MESSAGE_SURFACE = ".player-terminal-messages-page";
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function publicThreadId(control) {
  const value = String(control?.dataset?.playerMessageThread || "").trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(value) ? value : "";
}

function nextFrame() {
  return new Promise((resolve) => globalThis.requestAnimationFrame?.(resolve) ?? globalThis.setTimeout(resolve, 0));
}

function lockMessageSurface(control) {
  const surface = control.closest(MESSAGE_SURFACE);
  if (!(surface instanceof HTMLElement)) return () => {};
  surface.setAttribute("aria-busy", "true");
  const controls = [...surface.querySelectorAll("button, input, textarea, select")];
  for (const item of controls) {
    if (!(item instanceof HTMLButtonElement || item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement)) continue;
    if (item.disabled) continue;
    item.dataset.messageRefreshLock = "true";
    item.disabled = true;
  }
  return () => {
    if (surface.isConnected) surface.removeAttribute("aria-busy");
    for (const item of controls) {
      if (!item.isConnected || item.dataset.messageRefreshLock !== "true") continue;
      delete item.dataset.messageRefreshLock;
      item.disabled = false;
    }
  };
}

function selectThread(mount, threadId, { requireReadCommitted = false } = {}) {
  const refreshed = mount.querySelector(
    `${MESSAGE_THREAD_CONTROL}[data-player-message-thread="${CSS.escape(threadId)}"]`,
  );
  if (!(refreshed instanceof HTMLElement)) {
    throw new Error("The committed conversation could not be restored after refresh.");
  }
  if (requireReadCommitted && refreshed.matches(MESSAGE_UNREAD_CONTROL)) {
    throw new Error("The conversation remained unread after it was opened.");
  }
  refreshed.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
  return refreshed;
}

export function installMessageReadController({ mount, terminal, config, api: injectedApi = null }) {
  if (!(mount instanceof HTMLElement)) {
    throw new TypeError("Messaging flow requires the Player Terminal mount.");
  }
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refresh !== "function") {
    throw new TypeError("Messaging flow requires the live Player Terminal.");
  }

  const api = injectedApi || new PlayerApi(config);
  const pending = new Set();
  let destroyed = false;

  async function refreshCommittedThread(threadId, options = {}) {
    markResourceInvalidations(options.invalidatedResources || ["messages", "notifications", "dashboard"]);
    await terminal.refresh();
    if (destroyed) return null;
    await nextFrame();
    return selectThread(mount, threadId, options);
  }

  async function commitRead(control, threadId) {
    const operationKey = `read:${threadId}`;
    pending.add(operationKey);
    control.dataset.messageReadSubmitting = "true";
    control.setAttribute("aria-busy", "true");
    const releaseSurface = lockMessageSurface(control);

    try {
      api.setSession?.(config);
      const operation = await api.execute("messageRead", { threadId }, { threadId });
      if (destroyed) return;
      await refreshCommittedThread(threadId, {
        requireReadCommitted: true,
        invalidatedResources: operation?.invalidatedResources,
      });
      mount.dispatchEvent(new CustomEvent("econovaria:player-message-read-committed", {
        bubbles: true,
        detail: Object.freeze({ threadId, mode: "opened" }),
      }));
      terminal.showToast?.("Conversation opened and marked read.", "green");
    } catch (error) {
      if (!destroyed) terminal.showToast?.(error?.message || "The conversation could not be marked read.", "red");
    } finally {
      pending.delete(operationKey);
      releaseSurface();
      if (control.isConnected) {
        delete control.dataset.messageReadSubmitting;
        control.removeAttribute("aria-busy");
      }
    }
  }

  function handleUnreadThreadClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(MESSAGE_THREAD_CONTROL);
    if (!(control instanceof HTMLButtonElement) || !control.matches(MESSAGE_UNREAD_CONTROL)) return;

    const threadId = publicThreadId(control);
    if (!threadId) return;

    const capabilities = terminal.getState()?.data?.capabilities;
    if (!isEndpointEnabled(capabilities, "messageRead")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const operationKey = `read:${threadId}`;
    if (pending.has(operationKey) || control.dataset.messageReadSubmitting === "true") return;
    void commitRead(control, threadId);
  }

  mount.addEventListener("click", handleUnreadThreadClick, true);

  return Object.freeze({
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleUnreadThreadClick, true);
      pending.clear();
    },
  });
}
