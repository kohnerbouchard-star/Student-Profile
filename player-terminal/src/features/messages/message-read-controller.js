import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { markResourceInvalidations } from "../../api/invalidation-registry.js";

const MESSAGE_READ_FORM = 'form[data-endpoint="messageRead"]';
const MESSAGE_SEND_FORM = 'form[data-endpoint="messageSend"]';
const MESSAGE_SEND_CONTROL = "[data-player-message-send]";
const MESSAGE_THREAD_CONTROL = "[data-player-message-thread]";
const MESSAGE_SURFACE = ".player-terminal-messages-page";
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function publicThreadId(control, form) {
  const value = String(
    control?.dataset?.playerMessageThread ||
      form?.dataset?.threadId ||
      form?.elements?.namedItem("threadId")?.value ||
      "",
  ).trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(value) ? value : "";
}

function nextFrame() {
  return new Promise((resolve) => globalThis.requestAnimationFrame?.(resolve) ?? globalThis.setTimeout(resolve, 0));
}

function lockMessageSurface(form) {
  const surface = form.closest(MESSAGE_SURFACE);
  if (!(surface instanceof HTMLElement)) return () => {};
  surface.setAttribute("aria-busy", "true");
  const controls = [...surface.querySelectorAll("button, input, textarea, select")];
  for (const control of controls) {
    if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
    if (control.disabled) continue;
    control.dataset.messageRefreshLock = "true";
    control.disabled = true;
  }
  return () => {
    if (surface.isConnected) surface.removeAttribute("aria-busy");
    for (const control of controls) {
      if (!control.isConnected || control.dataset.messageRefreshLock !== "true") continue;
      delete control.dataset.messageRefreshLock;
      control.disabled = false;
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
  if (requireReadCommitted && refreshed.closest(MESSAGE_READ_FORM)) {
    throw new Error("The conversation remained unread after the server committed the read receipt.");
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

  async function commitRead(form, control, threadId) {
    const capabilities = terminal.getState()?.data?.capabilities;
    if (!isEndpointEnabled(capabilities, "messageRead")) {
      terminal.showToast?.("Message read receipts are not enabled for this game.", "amber");
      return;
    }

    const operationKey = `read:${threadId}`;
    pending.add(operationKey);
    form.dataset.messageReadSubmitting = "true";
    control.setAttribute("aria-busy", "true");
    const releaseSurface = lockMessageSurface(form);

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
        detail: Object.freeze({ threadId }),
      }));
      terminal.showToast?.("Conversation marked read and refreshed.", "green");
    } catch (error) {
      if (!destroyed) terminal.showToast?.(error?.message || "The conversation could not be marked read.", "red");
    } finally {
      pending.delete(operationKey);
      releaseSurface();
      if (form.isConnected) delete form.dataset.messageReadSubmitting;
      if (control.isConnected) control.removeAttribute("aria-busy");
    }
  }

  async function commitSend(form, button, threadId, body) {
    const capabilities = terminal.getState()?.data?.capabilities;
    if (!isEndpointEnabled(capabilities, "messageSend")) {
      terminal.showToast?.("Message replies are not enabled for this game.", "amber");
      return;
    }

    const operationKey = `send:${threadId}`;
    pending.add(operationKey);
    form.dataset.messageSendSubmitting = "true";
    button?.setAttribute("aria-busy", "true");
    const releaseSurface = lockMessageSurface(form);

    try {
      api.setSession?.(config);
      const operation = await api.execute("messageSend", { body }, { threadId });
      if (destroyed) return;
      await refreshCommittedThread(threadId, {
        invalidatedResources: operation?.invalidatedResources,
      });
      await nextFrame();
      const persisted = [...mount.querySelectorAll(".player-terminal-message-log p")]
        .some((node) => String(node.textContent || "").trim() === body);
      if (!persisted) {
        throw new Error("The committed reply was not present after authoritative refresh.");
      }
      mount.dispatchEvent(new CustomEvent("econovaria:player-message-send-committed", {
        bubbles: true,
        detail: Object.freeze({ threadId }),
      }));
      terminal.showToast?.("Reply sent and refreshed.", "green");
    } catch (error) {
      if (!destroyed) terminal.showToast?.(error?.message || "The reply could not be sent.", "red");
    } finally {
      pending.delete(operationKey);
      releaseSurface();
      if (form.isConnected) delete form.dataset.messageSendSubmitting;
      if (button?.isConnected) button.removeAttribute("aria-busy");
    }
  }

  function beginSend(event, form, button) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const threadId = publicThreadId(null, form);
    const bodyField = form.elements.namedItem("body");
    const body = String(bodyField?.value || "").trim();
    if (!threadId || !body) {
      bodyField?.setCustomValidity?.("Enter a message before sending.");
      bodyField?.focus?.();
      terminal.showToast?.("Enter a message before sending.", "red");
      return;
    }

    const operationKey = `send:${threadId}`;
    if (pending.has(operationKey) || form.dataset.messageSendSubmitting === "true") return;
    bodyField?.setCustomValidity?.("");
    void commitSend(form, button, threadId, body);
  }

  function handleMessagingClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const sendButton = target?.closest(MESSAGE_SEND_CONTROL);
    const sendForm = sendButton?.closest(MESSAGE_SEND_FORM);
    if (sendButton instanceof HTMLButtonElement && sendForm instanceof HTMLFormElement && mount.contains(sendForm)) {
      beginSend(event, sendForm, sendButton);
      return;
    }

    const control = target?.closest(MESSAGE_THREAD_CONTROL);
    const form = control?.closest(MESSAGE_READ_FORM);
    if (!(control instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement)) return;

    const threadId = publicThreadId(control, form);
    if (!threadId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const operationKey = `read:${threadId}`;
    if (pending.has(operationKey) || form.dataset.messageReadSubmitting === "true") return;
    void commitRead(form, control, threadId);
  }

  function handleMessageSendSubmit(event) {
    const target = event.target instanceof Element ? event.target : null;
    const form = target?.closest(MESSAGE_SEND_FORM);
    if (!(form instanceof HTMLFormElement) || !mount.contains(form)) return;
    beginSend(event, form, form.querySelector(MESSAGE_SEND_CONTROL));
  }

  mount.addEventListener("click", handleMessagingClick, true);
  mount.addEventListener("submit", handleMessageSendSubmit, true);

  return Object.freeze({
    destroy() {
      destroyed = true;
      mount.removeEventListener("click", handleMessagingClick, true);
      mount.removeEventListener("submit", handleMessageSendSubmit, true);
      pending.clear();
    },
  });
}
