import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { markResourceInvalidations } from "../../api/invalidation-registry.js";

const MESSAGE_SEND_FORM = 'form[data-endpoint="messageSend"]';
const MESSAGE_SEND_CONTROL = "[data-player-message-send]";
const MESSAGE_UNREAD_CONTROL = '[data-player-message-unread="true"]';
const MESSAGE_THREAD_CONTROL = "[data-player-message-thread]";
const MESSAGE_SURFACE = ".player-terminal-messages-page";
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function publicThreadId(control, form = null) {
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

function lockMessageSurface(source) {
  const surface = source.closest(MESSAGE_SURFACE);
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
  const eventRoot = mount.ownerDocument || mount;
  const pending = new Set();
  const replyDrafts = new Map();
  const boundForms = new Set();
  const boundButtons = new Set();
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

  async function commitSend(form, button, threadId, body) {
    const operationKey = `send:${threadId}`;
    pending.add(operationKey);
    form.dataset.messageSendSubmitting = "true";
    button?.setAttribute("aria-busy", "true");
    const releaseSurface = lockMessageSurface(form);

    try {
      api.setSession?.(config);
      const operation = await api.execute("messageSend", { body }, { threadId });
      if (destroyed) return;
      replyDrafts.delete(threadId);
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
    const currentBody = String(bodyField?.value || "").trim();
    const body = currentBody || String(replyDrafts.get(threadId) || "").trim();
    if (!threadId || !body) {
      bodyField?.setCustomValidity?.("Enter a message before sending.");
      bodyField?.focus?.();
      terminal.showToast?.("Enter a message before sending.", "red");
      return;
    }

    const operationKey = `send:${threadId}`;
    if (pending.has(operationKey) || form.dataset.messageSendSubmitting === "true") return;
    if (bodyField && !currentBody) bodyField.value = body;
    bodyField?.setCustomValidity?.("");
    replyDrafts.set(threadId, body);
    void commitSend(form, button, threadId, body);
  }

  function bindSendForm(form) {
    if (!(form instanceof HTMLFormElement) || boundForms.has(form)) return;
    const button = form.querySelector(MESSAGE_SEND_CONTROL);
    if (!(button instanceof HTMLButtonElement)) return;

    const submit = (event) => beginSend(event, form, button);
    const click = (event) => beginSend(event, form, button);
    form.addEventListener("submit", submit, true);
    button.addEventListener("click", click, true);
    boundForms.add(form);
    boundButtons.add(button);
    form.__econovariaMessageSubmit = submit;
    button.__econovariaMessageClick = click;
  }

  function bindCurrentSendForms() {
    mount.querySelectorAll(MESSAGE_SEND_FORM).forEach(bindSendForm);
  }

  function handleMessagingInput(event) {
    const field = event.target instanceof HTMLTextAreaElement ? event.target : null;
    const form = field?.closest(MESSAGE_SEND_FORM);
    if (!(form instanceof HTMLFormElement) || !mount.contains(form) || field.name !== "body") return;
    const threadId = publicThreadId(null, form);
    if (!threadId) return;
    const body = String(field.value || "").slice(0, 1000);
    if (body) replyDrafts.set(threadId, body);
    else replyDrafts.delete(threadId);
  }

  function handleUnreadThreadClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(MESSAGE_THREAD_CONTROL);
    if (!(control instanceof HTMLButtonElement) || !mount.contains(control) || !control.matches(MESSAGE_UNREAD_CONTROL)) return;

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

  const observer = new MutationObserver(() => bindCurrentSendForms());
  observer.observe(mount, { childList: true, subtree: true });
  bindCurrentSendForms();
  eventRoot.addEventListener("input", handleMessagingInput, true);
  eventRoot.addEventListener("click", handleUnreadThreadClick, true);

  return Object.freeze({
    destroy() {
      destroyed = true;
      observer.disconnect();
      eventRoot.removeEventListener("input", handleMessagingInput, true);
      eventRoot.removeEventListener("click", handleUnreadThreadClick, true);
      for (const form of boundForms) {
        if (form.__econovariaMessageSubmit) form.removeEventListener("submit", form.__econovariaMessageSubmit, true);
      }
      for (const button of boundButtons) {
        if (button.__econovariaMessageClick) button.removeEventListener("click", button.__econovariaMessageClick, true);
      }
      boundForms.clear();
      boundButtons.clear();
      pending.clear();
      replyDrafts.clear();
    },
  });
}
