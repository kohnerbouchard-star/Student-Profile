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
import { PlayersRoute } from "./PlayersRoute.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value, maximum = 500) {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeResourceId(row) {
  const value = String(row?.id || row?.playerId || "").trim().toLowerCase();
  return UUID_PATTERN.test(value) ? value : null;
}

function playerArray(result) {
  if (Array.isArray(result)) return result;
  const candidates = [
    result,
    result?.value,
    result?.data,
    result?.data?.data,
    result?.payload,
    result?.result,
  ].filter(isRecord);
  for (const candidate of candidates) {
    if (Array.isArray(candidate.players)) return candidate.players;
    if (Array.isArray(candidate.roster)) return candidate.roster;
  }
  return null;
}

function normalizeAdminProfile(value) {
  const source = isRecord(value) ? value : {};
  return Object.freeze({
    displayName: safeText(source.displayName, 240),
    status: safeText(source.status, 80).toLowerCase(),
    countryAssignment: safeText(source.countryAssignment, 240),
    adminNote: safeText(source.adminNote, 2_000),
  });
}

function normalizePlayer(row, index) {
  if (!isRecord(row)) return null;
  const resourceId = safeResourceId(row);
  if (!resourceId) return null;
  const status = safeText(row.status, 80).toLowerCase();
  const sessionStatus = safeText(row.sessionStatus, 80).toLowerCase();
  const adminProfile = normalizeAdminProfile(row.adminSettings);
  const displayName = safeText(row.displayName || row.name, 240) || "Unnamed Player";
  return Object.freeze({
    resourceId,
    rowKey: `player-row-${index + 1}`,
    displayName,
    rosterLabel: safeText(row.rosterLabel, 240),
    status,
    countryName: safeText(row.countryName || row.location, 240) || "Unassigned",
    countryCode: safeText(row.countryCode, 32).toUpperCase(),
    sessionStatus: ["online", "recently_active", "offline"].includes(sessionStatus)
      ? sessionStatus
      : "offline",
    online: row.online === true || sessionStatus === "online",
    lastActiveAt: safeText(row.lastActiveAt, 80),
    flagCount: safeInteger(row.flagCount),
    flagged: row.flagged === true || safeInteger(row.flagCount) > 0,
    adminProfile,
    createdAt: safeText(row.createdAt, 80),
    updatedAt: safeText(row.updatedAt, 80),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

/** Normalizes the authoritative Players roster without exposing private Player UUIDs to presentation fields. */
export function normalizePlayersReadModel(result) {
  const rows = playerArray(result);
  if (!rows) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }
  const players = rows.slice(0, 2_000).map(normalizePlayer).filter(Boolean);
  const statuses = [...new Set(players.map((player) => player.status).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return deepFreeze({
    players,
    statuses,
    summary: {
      totalCount: players.length,
      activeCount: players.filter((player) => player.status === "active").length,
      onlineCount: players.filter((player) => player.online).length,
      flaggedCount: players.filter((player) => player.flagged).length,
    },
    isEmpty: players.length === 0,
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error)
    ? error
    : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function successfulMutation(result) {
  if (result?.ok === false) throw result;
  return result;
}

/** Owns Players reads, supported mutations, filtering, refresh lifecycle, and private resource keys. */
export function createPlayersController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of [
    "readPlayers",
    "createPlayer",
    "updatePlayerSettings",
    "updatePlayerCredentials",
  ]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Players API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let filters = Object.freeze({ query: "", status: "all", presence: "all" });
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const pendingIdempotency = new Map();
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("players.manage")) return state;
    api.cancelPlayersRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();

    try {
      const result = await api.readPlayers({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion || result?.current === false) return state;
      const model = normalizePlayersReadModel(result);
      state = resolveAdminDataLoad(state, model, {
        empty: model.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function scheduleAuthoritativeRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  function nextIdempotencyKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.players.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  async function mutate({ action, player = null, input, request, successTitle, successMessage }) {
    if (destroyed || !hasPermission("players.manage")) {
      return {
        ok: false,
        error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }),
      };
    }
    const fingerprint = stableStringify({ action, playerId: player?.resourceId || null, input });
    if (activeMutations.has(fingerprint)) {
      return {
        ok: false,
        busy: true,
        error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }),
      };
    }

    let idempotencyKey = pendingIdempotency.get(fingerprint);
    try {
      if (!idempotencyKey) {
        idempotencyKey = nextIdempotencyKey(action);
        pendingIdempotency.set(fingerprint, idempotencyKey);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = successfulMutation(await request(idempotencyKey));
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({ tone: "success", title: successTitle, message: successMessage });
        scheduleAuthoritativeRefresh();
      }
      return { ok: true, result, refreshScheduled: !destroyed };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({
          tone: "error",
          title: "Player change was not saved",
          message: envelope.userMessage,
        });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function createPlayer(input) {
    return mutate({
      action: "create",
      input,
      request: (idempotencyKey) => api.createPlayer({
        gameId: selectedGameId,
        player: input,
        idempotencyKey,
      }),
      successTitle: "Player created",
      successMessage: `${safeText(input?.displayName, 240) || "The Player"} was added to this game.`,
    });
  }

  function updateProfile(player, input) {
    if (!player?.resourceId) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    return mutate({
      action: "profile",
      player,
      input,
      request: (idempotencyKey) => api.updatePlayerSettings({
        gameId: selectedGameId,
        playerId: player.resourceId,
        settings: input,
        idempotencyKey,
      }),
      successTitle: "Administrative profile saved",
      successMessage: `${player.displayName}'s Admin profile settings were saved.`,
    });
  }

  function updateCredentials(player, input) {
    if (!player?.resourceId) {
      return Promise.resolve({
        ok: false,
        error: createAdminErrorEnvelope({ code: "NOT_FOUND", retryable: false }),
      });
    }
    return mutate({
      action: "credentials",
      player,
      input,
      request: (idempotencyKey) => api.updatePlayerCredentials({
        gameId: selectedGameId,
        playerId: player.resourceId,
        credentials: input,
        idempotencyKey,
      }),
      successTitle: "Player credentials updated",
      successMessage: "The requested Player ID or Access Code change was applied. Existing Access Codes remain protected.",
    });
  }

  function updateFilters(nextFilters = {}) {
    const status = String(nextFilters.status ?? filters.status).trim().toLowerCase();
    const presence = String(nextFilters.presence ?? filters.presence).trim().toLowerCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      status: status || "all",
      presence: ["all", "online", "recently_active", "offline"].includes(presence)
        ? presence
        : "all",
    });
  }

  function render() {
    if (destroyed) throw new Error("Players controller has been destroyed.");
    currentView?.destroy?.();
    currentView = PlayersRoute({
      state,
      filters,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onCreate: createPlayer,
      onEditProfile: updateProfile,
      onUpdateCredentials: updateCredentials,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    if (api.cancelPlayersRequest?.() !== true) return;
    requestVersion += 1;
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
      return;
    }
    if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = resolveAdminDataLoad(state, state.data, {
        empty: state.data?.isEmpty === true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
  }

  function deactivate() {
    currentView?.destroy?.();
    currentView = null;
    cancelReadForDeactivation();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    api.cancelPlayersRequest?.();
    requestVersion += 1;
    currentView?.destroy?.();
    currentView = null;
    refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
    refreshTimers.clear();
    pendingIdempotency.clear();
    activeMutations.clear();
  }

  return Object.freeze({
    load,
    render,
    deactivate,
    destroy,
    getState: () => state,
    getFilters: () => filters,
    createPlayer,
    updateProfile,
    updateCredentials,
  });
}
