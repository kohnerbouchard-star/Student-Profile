import { PlayerApi } from "../../api/player-api.js";
import { isEndpointEnabled } from "../../api/capabilities.js";

const PUBLIC_THREAD_ID = /^thr_[0-9a-f]{32}$/;

function dispatchInvalidSession(error, config, runtime = globalThis) {
  if (Number(error?.status) !== 401) return false;
  const detail = Object.freeze({ reason: "invalid_player_session", terminal: "player", status: 401, code: String(error?.code || "SESSION_INVALID"), requestId: String(error?.requestId || "") });
  try { config.onSessionInvalid?.(detail); } catch { /* Safe exit continues. */ }
  const eventName = String(config.sessionInvalidEvent || "econovaria:player-session-invalid");
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail }));
  return true;
}

function dispatchResourceRefresh(config, resources, runtime = globalThis) {
  const eventName = String(config.resourceInvalidationEvent || "econovaria:player-resources-invalidated");
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail: { gameSessionId: config.gameSessionId || "", resources } }));
}

function safeReadError(error) {
  if (Number(error?.status) === 429) return "That conversation is being updated too quickly. Try again shortly.";
  if (Number(error?.status) >= 500 || error?.code === "NETWORK_ERROR" || error?.code === "OFFLINE") return "The conversation opened, but its read status could not be updated yet.";
  return "The conversation opened, but its read status could not be updated.";
}

export function installMessageReadFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement) || config.usePreviewData === true) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") throw new TypeError("The message read flow requires an active player terminal.");
  const api = new PlayerApi(config);
  const pending = new Set();
  let destroyed = false;

  function capabilityEnabled() { return isEndpointEnabled(terminal.getState()?.data?.capabilities, "messageRead"); }

  async function markThreadRead(threadId) {
    if (destroyed || pending.has(threadId) || !PUBLIC_THREAD_ID.test(threadId) || !capabilityEnabled()) return;
    pending.add(threadId);
    try {
      api.setSession(config);
      await api.execute("messageRead", { threadId }, { threadId });
      if (!destroyed) dispatchResourceRefresh(config, ["messages", "notifications"]);
    } catch (error) {
      if (!dispatchInvalidSession(error, config) && !destroyed) terminal.showToast?.(safeReadError(error), "amber");
    } finally {
      pending.delete(threadId);
    }
  }

  function handleClick(event) {
    const control = event.target.closest?.('[data-player-message-thread][data-player-message-unread="true"]');
    if (!control) return;
    const threadId = String(control.dataset.playerMessageThread || "").trim().toLowerCase();
    if (!PUBLIC_THREAD_ID.test(threadId)) return;
    queueMicrotask(() => void markThreadRead(threadId));
  }

  mount.addEventListener("click", handleClick, true);
  return { destroy() { destroyed = true; pending.clear(); mount.removeEventListener("click", handleClick, true); } };
}
