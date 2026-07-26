import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";
import { markResourceInvalidations } from "../../api/invalidation-registry.js";

const MESSAGE_READ_FORM = 'form[data-endpoint="messageRead"]';
const MESSAGE_THREAD_CONTROL = "[data-player-message-thread]";
const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function publicThreadId(control, form) {
  const value = String(
    control?.dataset?.playerMessageThread ||
      form?.elements?.namedItem("threadId")?.value ||
      "",
  ).trim().toLowerCase();
  return PUBLIC_THREAD_ID.test(value) ? value : "";
}

function nextFrame() {
  return new Promise((resolve) => globalThis.requestAnimationFrame?.(resolve) ?? globalThis.setTimeout(resolve, 0));
}

export function installMessageReadController({ mount, terminal, config, api: injectedApi = null }) {
  if (!(mount instanceof HTMLElement)) {
    throw new TypeError("Message read flow requires the Player Terminal mount.");
  }
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.refresh !== "function") {
    throw new TypeError("Message read flow requires the live Player Terminal.");
  }

  const api = injectedApi || new PlayerApi(config);
  const pending = new Set();
  let destroyed = false;

  async function commitRead(form, control, threadId) {
    const capabilities = terminal.getState()?.data?.capabilities;
    if (!isEndpointEnabled(capabilities, "messageRead")) {
      terminal.showToast?.("Message read receipts are not enabled for this game.", "amber");
      return;
    }

    pending.add(threadId);
    form.dataset.messageReadSubmitting = "true";
    control.disabled = true;
    control.setAttribute("aria-busy", "true");

    try {
      api.setSession?.(config);
      const operation = await api.execute("messageRead", { threadId }, { threadId });
      if (destroyed) return;

      markResourceInvalidations(operation?.invalidatedResources || ["messages", "notifications", "dashboard"]);
      await terminal.refresh();
      if (destroyed) return;
      await nextFrame();

      const refreshed = mount.querySelector(
        `${MESSAGE_THREAD_CONTROL}[data-player-message-thread="${CSS.escape(threadId)}"]`,
      );
      if (!(refreshed instanceof HTMLElement)) {
        throw new Error("The committed conversation could not be restored after refresh.");
      }
      if (refreshed.closest(MESSAGE_READ_FORM)) {
        throw new Error("The conversation remained unread after the server committed the read receipt.");
      }

      refreshed.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
      terminal.showToast?.("Conversation marked read and refreshed.", "green");
    } catch (error) {
      if (!destroyed) {
        terminal.showToast?.(error?.message || "The conversation could not be marked read.", "red");
      }
    } finally {
      pending.delete(threadId);
      if (form.isConnected) delete form.dataset.messageReadSubmitting;
      if (control.isConnected) {
        control.disabled = false;
        control.removeAttribute("aria-busy");
      }
    }
  }

  function handleUnreadThreadClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(MESSAGE_THREAD_CONTROL);
    const form = control?.closest(MESSAGE_READ_FORM);
    if (!(control instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement)) return;

    const threadId = publicThreadId(control, form);
    if (!threadId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending.has(threadId) || form.dataset.messageReadSubmitting === "true") return;
    void commitRead(form, control, threadId);
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
