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
import { BankingRoute } from "./BankingRoute.js";
import { normalizeBankingReadModel, normalizeBankingHistory, UUID_PATTERN, safeFinite, safeText } from "./BankingReadModel.js";
export { normalizeBankingReadModel, normalizeBankingHistory } from "./BankingReadModel.js";

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

/** Owns the Banking route data lifecycle, history reads, and authoritative ledger adjustments. */
export function createBankingController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readBanking", "readBankingHistory", "adjustBankingBalance"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Banking API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let historyState = createAdminDataState();
  let filters = Object.freeze({ query: "", currency: "all" });
  let selectedPlayer = null;
  let requestVersion = 0;
  let historyRequestVersion = 0;
  let mutationSequence = 0;
  let currentView = null;
  let destroyed = false;
  const pendingIdempotency = new Map();
  const activeMutations = new Set();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("economy.adjust")) return state;
    api.cancelBankingRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readBanking({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeBankingReadModel(result);
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
      if (selectedPlayer) {
        const replacement = model.players.find((player) => player.rowKey === selectedPlayer.rowKey);
        selectedPlayer = replacement || null;
        if (!selectedPlayer) historyState = createAdminDataState();
      }
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  async function loadHistory(player = selectedPlayer) {
    if (destroyed || !hasPermission("economy.adjust") || !player?.resourceId) return historyState;
    selectedPlayer = player;
    api.cancelBankingHistoryRequest?.();
    historyRequestVersion += 1;
    const version = historyRequestVersion;
    historyState = beginAdminDataLoad(historyState, { requestVersion: version });
    publish();
    try {
      const result = await api.readBankingHistory({
        gameId: selectedGameId,
        playerId: player.resourceId,
      });
      if (destroyed || version !== historyRequestVersion || selectedPlayer?.rowKey !== player.rowKey) {
        return historyState;
      }
      const history = normalizeBankingHistory(result);
      historyState = resolveAdminDataLoad(historyState, history, {
        empty: history.isEmpty,
        requestVersion: version,
      });
    } catch (error) {
      if (destroyed || version !== historyRequestVersion) return historyState;
      historyState = rejectAdminDataLoad(historyState, safeError(error), { requestVersion: version });
    }
    publish();
    return historyState;
  }

  function selectPlayer(player) {
    if (!player?.resourceId) return Promise.resolve(historyState);
    const changed = selectedPlayer?.rowKey !== player.rowKey;
    selectedPlayer = player;
    if (changed) {
      historyRequestVersion += 1;
      api.cancelBankingHistoryRequest?.();
      historyState = createAdminDataState();
    }
    publish();
    return loadHistory(player);
  }

  function clearPlayer() {
    historyRequestVersion += 1;
    api.cancelBankingHistoryRequest?.();
    selectedPlayer = null;
    historyState = createAdminDataState();
    publish();
  }

  function updateFilters(nextFilters = {}) {
    const currency = String(nextFilters.currency ?? filters.currency).trim().toUpperCase();
    filters = Object.freeze({
      query: String(nextFilters.query ?? filters.query).trimStart().slice(0, 160),
      currency: currency === "ALL" || CURRENCY_CODE_PATTERN.test(currency) ? currency.toLowerCase() : "all",
    });
  }

  function nextIdempotencyKey() {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) {
      throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    }
    return `admin.banking.adjust.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function scheduleRefresh(player) {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (destroyed) return;
      void load();
      if (selectedPlayer?.rowKey === player.rowKey) void loadHistory(player);
    }, 0);
    refreshTimers.add(timer);
  }

  async function adjustBalance(player, account, input = {}) {
    if (destroyed || !hasPermission("economy.adjust")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (!player?.resourceId || player.status !== "active" || !player.accounts.includes(account)) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false }) };
    }
    const amount = safeFinite(input.amount);
    const reason = safeText(input.reason, 301);
    if (amount === null || amount === 0 || !reason || reason.length > 300 || !account.currencyCode) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false }) };
    }

    const fingerprint = stableStringify({
      player: player.rowKey,
      account: account.key,
      amount: Math.round(amount * 100) / 100,
      reason,
    });
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }

    let idempotencyKey = pendingIdempotency.get(fingerprint);
    try {
      if (!idempotencyKey) {
        idempotencyKey = nextIdempotencyKey();
        pendingIdempotency.set(fingerprint, idempotencyKey);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }

    activeMutations.add(fingerprint);
    try {
      const result = await api.adjustBankingBalance({
        gameId: selectedGameId,
        playerId: player.resourceId,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        amount: Math.round(amount * 100) / 100,
        reason,
        idempotencyKey,
      });
      pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({
          tone: "success",
          title: "Balance adjusted",
          message: `${player.displayName}'s ${account.accountType === "savings" ? "Savings" : "Checking"} balance was adjusted.`,
        });
        scheduleRefresh(player);
      }
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingIdempotency.delete(fingerprint);
      if (!destroyed) {
        notify({ tone: "error", title: "Balance was not adjusted", message: envelope.userMessage });
      }
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function render() {
    if (destroyed) throw new Error("Banking controller has been destroyed.");
    currentView?.destroy?.();
    currentView = BankingRoute({
      state,
      filters,
      selectedPlayer,
      historyState,
      onFiltersChange: updateFilters,
      onRefresh: load,
      onSelectPlayer: selectPlayer,
      onClosePlayer: clearPlayer,
      onRefreshHistory: () => loadHistory(selectedPlayer),
      onAdjust: adjustBalance,
    });
    return currentView;
  }

  function cancelReadForDeactivation() {
    const cancelled = api.cancelBankingRequest?.() === true;
    api.cancelBankingHistoryRequest?.();
    historyRequestVersion += 1;
    if (!cancelled) return;
    requestVersion += 1;
    if (!state.hasResolved) {
      requestVersion = 0;
      state = createAdminDataState();
      return;
    }
    if (state.status === ADMIN_DATA_STATES.REFRESHING) {
      state = createAdminDataState({
        status: state.data?.isEmpty ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
        data: state.data,
        hasResolved: true,
        requestVersion,
        updatedAt: state.updatedAt,
      });
    }
  }

  return Object.freeze({
    getState: () => state,
    getHistoryState: () => historyState,
    getFilters: () => filters,
    getSelectedPlayer: () => selectedPlayer,
    load,
    loadHistory,
    selectPlayer,
    clearPlayer,
    adjustBalance,
    render,
    deactivate() {
      cancelReadForDeactivation();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      historyRequestVersion += 1;
      api.cancelBankingRequest?.();
      api.cancelBankingHistoryRequest?.();
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      currentView?.destroy?.();
      currentView = null;
      pendingIdempotency.clear();
      activeMutations.clear();
    },
  });
}
