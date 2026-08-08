import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import {
  createAdminErrorEnvelope,
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../../core/error-envelope.js";
import { MessagesRoute } from "./MessagesRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const THREAD_PATTERN = /^thr_[0-9a-f]{32}$/;
const MESSAGE_PATTERN = /^msg_[0-9a-f]{32}$/;
const THREAD_STATUSES = new Set(["active", "disabled", "closed"]);
const THREAD_TYPES = new Set(["announcement", "system", "player", "contract"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value, maximum = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().replace(UUID_IN_TEXT_PATTERN, "[private identifier hidden]").slice(0, maximum);
}

function publicId(value, pattern) {
  const normalized = String(value || "").trim().toLowerCase();
  return pattern.test(normalized) ? normalized : "";
}

function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  return new Date(value).toISOString();
}

function normalizeParticipant(value) {
  if (!isRecord(value)) return null;
  const displayName = cleanText(value.displayName, 160) || "Player";
  const reference = cleanText(value.reference, 160);
  const rosterLabel = cleanText(value.rosterLabel, 160);
  return Object.freeze({ displayName, reference, rosterLabel, lastReadAt: timestamp(value.lastReadAt) });
}

function normalizeMessage(value) {
  if (!isRecord(value)) return null;
  const id = publicId(value.id, MESSAGE_PATTERN);
  if (!id) return null;
  return Object.freeze({
    id,
    senderType: cleanText(value.senderType, 40),
    senderName: cleanText(value.senderName, 160) || "Unknown sender",
    body: cleanText(value.body, 1000),
    hidden: value.hidden === true,
    hiddenReason: cleanText(value.hiddenReason, 1000),
    createdAt: timestamp(value.createdAt),
  });
}

function normalizeThread(value, index) {
  if (!isRecord(value)) return null;
  const id = publicId(value.id, THREAD_PATTERN);
  const type = String(value.type || "").trim().toLowerCase();
  const status = String(value.status || "").trim().toLowerCase();
  if (!id || !THREAD_TYPES.has(type) || !THREAD_STATUSES.has(status)) return null;
  const participants = Array.isArray(value.participants)
    ? value.participants.slice(0, 500).map(normalizeParticipant).filter(Boolean)
    : [];
  const messages = Array.isArray(value.messages)
    ? value.messages.slice(0, 100).map(normalizeMessage).filter(Boolean)
    : [];
  return Object.freeze({
    id,
    rowKey: `message-thread-${index + 1}`,
    type,
    title: cleanText(value.title, 160) || "Untitled conversation",
    contractKey: cleanText(value.contractKey, 160),
    allowPlayerReplies: value.allowPlayerReplies === true,
    status,
    moderationReason: cleanText(value.moderationReason, 1000),
    retentionUntil: timestamp(value.retentionUntil),
    expired: value.expired === true,
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
    participants: Object.freeze(participants),
    messages: Object.freeze(messages),
  });
}

function dataObject(result) {
  const candidates = [result?.data, result?.value?.data, result?.payload?.data, result].filter(isRecord);
  return candidates.find((candidate) => Array.isArray(candidate.threads)) || null;
}

function safePagination(value, fallbackReturned) {
  const source = isRecord(value) ? value : {};
  const limit = Number(source.limit);
  const offset = Number(source.offset);
  const returned = Number(source.returned);
  return Object.freeze({
    limit: Number.isSafeInteger(limit) && limit >= 1 && limit <= 50 ? limit : 25,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    returned: Number.isSafeInteger(returned) && returned >= 0 ? returned : fallbackReturned,
    hasMore: source.hasMore === true,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function normalizeMessagesReadModel(result) {
  const data = dataObject(result);
  if (!data) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const threads = data.threads.slice(0, 50).map(normalizeThread).filter(Boolean);
  const messages = threads.flatMap((thread) => thread.messages);
  const hiddenMessages = messages.filter((message) => message.hidden).length;
  const model = {
    threads,
    summary: {
      returned: threads.length,
      active: threads.filter((thread) => thread.status === "active").length,
      restricted: threads.filter((thread) => thread.status !== "active").length,
      hiddenMessages,
    },
    pagination: safePagination(data.pagination, threads.length),
    isEmpty: threads.length === 0,
  };
  return deepFreeze(model);
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function validReason(reason, required) {
  const normalized = typeof reason === "string" ? reason.trim() : "";
  if (normalized.length > 1000) return null;
  if (required && !normalized) return null;
  return normalized;
}

export function createMessagesController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readMessages", "moderateThread", "moderateMessage", "deleteExpiredThread"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Messages API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", limit: 25, offset: 0 });
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  let refreshTimer = null;
  const activeMutations = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  function setFilters(next = {}) {
    const status = String(next.status ?? filters.status).trim().toLowerCase();
    const limit = Number(next.limit ?? filters.limit);
    const offset = Number(next.offset ?? filters.offset);
    filters = Object.freeze({
      query: String(next.query ?? filters.query).trim().slice(0, 100),
      status: ["all", "active", "disabled", "closed"].includes(status) ? status : "all",
      limit: Number.isSafeInteger(limit) && limit >= 1 && limit <= 50 ? limit : 25,
      offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= 10_000 ? offset : 0,
    });
  }

  async function load(nextFilters = null) {
    if (destroyed || !hasPermission("messaging.moderate")) return state;
    if (nextFilters) setFilters(nextFilters);
    api.cancelMessagesRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readMessages({ gameId: selectedGameId, ...filters });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeMessagesReadModel(result);
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextIdempotencyKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.messages.${action}.${uuid}.${mutationSequence}`.slice(0, 127);
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) return;
    refreshTimer = globalThis.setTimeout(() => {
      refreshTimer = null;
      if (!destroyed) void load();
    }, 0);
  }

  async function mutate({ fingerprint, action, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("messaging.moderate")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    activeMutations.add(fingerprint);
    try {
      const idempotencyKey = nextIdempotencyKey(action);
      const result = await request(idempotencyKey);
      notify({ tone: "success", title: successTitle, message: successMessage });
      scheduleRefresh();
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      notify({ tone: "error", title: "Moderation action failed", message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function moderateThread(thread, action, reason = "") {
    const restrictive = ["disable", "close"].includes(action);
    const safeReason = validReason(reason, restrictive);
    if (!thread?.id || safeReason === null) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `thread:${thread.id}:${action}`,
      action: `thread.${action}`,
      request: (idempotencyKey) => api.moderateThread({
        gameId: selectedGameId,
        threadId: thread.id,
        action,
        reason: safeReason,
        idempotencyKey,
      }),
      successTitle: "Conversation moderation updated",
      successMessage: `${thread.title} is now ${action === "enable" ? "active" : action === "disable" ? "disabled" : "closed"}.`,
    });
  }

  function moderateMessage(thread, message, action, reason = "") {
    const safeReason = validReason(reason, action === "hide");
    if (!thread?.id || !message?.id || safeReason === null) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `message:${message.id}:${action}`,
      action: `message.${action}`,
      request: (idempotencyKey) => api.moderateMessage({
        gameId: selectedGameId,
        threadId: thread.id,
        messageId: message.id,
        action,
        reason: safeReason,
        idempotencyKey,
      }),
      successTitle: action === "hide" ? "Message hidden" : "Message restored",
      successMessage: action === "hide" ? "The message is hidden from Player messaging." : "The message is visible again.",
    });
  }

  function deleteExpiredThread(thread, reason = "") {
    const safeReason = validReason(reason, true);
    if (!thread?.id || thread.expired !== true || safeReason === null) {
      return Promise.resolve({ ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) });
    }
    return mutate({
      fingerprint: `retention:${thread.id}`,
      action: "retention.delete",
      request: (idempotencyKey) => api.deleteExpiredThread({
        gameId: selectedGameId,
        threadId: thread.id,
        reason: safeReason,
        idempotencyKey,
      }),
      successTitle: "Expired messages deleted",
      successMessage: `Expired retained content for ${thread.title} was deleted using the authoritative retention contract.`,
    });
  }

  function render() {
    if (destroyed) throw new Error("Messages controller has been destroyed.");
    currentView?.destroy?.();
    currentView = MessagesRoute({
      state,
      filters,
      onApplyFilters: (next) => load({ ...filters, ...next, offset: 0 }),
      onPage: (offset) => load({ ...filters, offset }),
      onRefresh: () => load(),
      onModerateThread: moderateThread,
      onModerateMessage: moderateMessage,
      onDeleteExpiredThread: deleteExpiredThread,
    });
    return currentView;
  }

  function deactivate() {
    if (api.cancelMessagesRequest?.() === true) {
      requestVersion += 1;
      if (!state.hasResolved) {
        requestVersion = 0;
        state = createAdminDataState();
      } else if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        state = createAdminDataState({
          status: state.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
          data: state.data,
          hasResolved: true,
          requestVersion,
          updatedAt: state.updatedAt,
        });
      }
    }
    currentView?.destroy?.();
    currentView = null;
  }

  return Object.freeze({
    getState: () => state,
    getFilters: () => filters,
    load,
    setFilters,
    moderateThread,
    moderateMessage,
    deleteExpiredThread,
    render,
    deactivate,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      api.cancelMessagesRequest?.();
      if (refreshTimer !== null) globalThis.clearTimeout(refreshTimer);
      refreshTimer = null;
      activeMutations.clear();
      currentView?.destroy?.();
      currentView = null;
    },
  });
}
