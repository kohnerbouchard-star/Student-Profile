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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const CURRENCY_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;
const PUBLIC_ACCOUNT_TYPES = new Set(["checking", "savings"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeText(value, maximum = 500) {
  if (!["string", "number", "boolean"].includes(typeof value)) return "";
  const text = String(value ?? "").trim();
  if (!text || UUID_IN_TEXT_PATTERN.test(text)) return "";
  return text.slice(0, maximum);
}

function safeFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!["string", "number"].includes(typeof value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeResourceId(row) {
  for (const candidate of [row?.id, row?.playerId]) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim().toLowerCase();
    if (UUID_PATTERN.test(value)) return value;
  }
  return null;
}

function safeCurrencyCode(value) {
  const code = safeText(value, 12).toUpperCase();
  return CURRENCY_CODE_PATTERN.test(code) ? code : "";
}

function canonicalAccountType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PUBLIC_ACCOUNT_TYPES.has(normalized) ? normalized : "";
}

function rowTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAccounts(rows) {
  const selected = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!isRecord(row)) return;
    const accountType = canonicalAccountType(row.accountType ?? row.account_type);
    if (!accountType) return;
    const balance = safeFinite(row.balance);
    if (balance === null) return;
    const currencyCode = safeCurrencyCode(row.currencyCode ?? row.currency_code);
    const key = `${accountType}:${currencyCode || "unknown"}`;
    const candidate = {
      key,
      accountType,
      balance,
      currencyCode,
      updatedAt: safeText(row.updatedAt ?? row.updated_at, 80),
    };
    const existing = selected.get(key);
    if (!existing || rowTimestamp(candidate.updatedAt) > rowTimestamp(existing.updatedAt)) {
      selected.set(key, candidate);
    }
  });

  return [...selected.values()]
    .sort((left, right) => {
      const typeOrder = Number(left.accountType === "savings") - Number(right.accountType === "savings");
      return typeOrder || left.currencyCode.localeCompare(right.currencyCode);
    })
    .map((account) => Object.freeze(account));
}

function playerRows(result) {
  if (Array.isArray(result)) return result;
  const candidates = [result, result?.value, result?.data, result?.data?.data, result?.payload]
    .filter(isRecord);
  for (const candidate of candidates) {
    if (Array.isArray(candidate.players)) return candidate.players;
    if (Array.isArray(candidate.roster)) return candidate.roster;
  }
  return null;
}

function normalizePlayer(row, index) {
  if (!isRecord(row)) return null;
  const accounts = normalizeAccounts(row.balances ?? row.accounts);
  return Object.freeze({
    resourceId: safeResourceId(row),
    rowKey: `banking-player-${index + 1}`,
    displayName: safeText(row.displayName ?? row.name, 240) || "Unnamed player",
    rosterLabel: safeText(row.rosterLabel, 160),
    countryName: safeText(row.countryName ?? row.location, 160),
    status: safeText(row.status, 40).toLowerCase() || "unknown",
    accounts: Object.freeze(accounts),
    checking: Object.freeze(accounts.filter((account) => account.accountType === "checking")),
    savings: Object.freeze(accounts.filter((account) => account.accountType === "savings")),
  });
}

/** Normalize the authoritative player balance projection without exposing private identifiers. */
export function normalizeBankingReadModel(result) {
  const rows = playerRows(result);
  if (!rows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const players = rows.slice(0, 2_000).map(normalizePlayer).filter(Boolean);
  const accounts = players.flatMap((player) => player.accounts);
  const currencies = [...new Set(accounts.map((account) => account.currencyCode).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return deepFreeze({
    players,
    currencies,
    summary: {
      playerCount: players.length,
      playersWithAccounts: players.filter((player) => player.accounts.length > 0).length,
      checkingAccountCount: accounts.filter((account) => account.accountType === "checking").length,
      savingsAccountCount: accounts.filter((account) => account.accountType === "savings").length,
      currencyCount: currencies.length,
    },
    isEmpty: players.length === 0,
  });
}

function titleCase(value, fallback = "Ledger activity") {
  const text = safeText(value, 160);
  if (!text) return fallback;
  return text
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function historyDescription(sourceDomain, sourceAction) {
  const combined = `${sourceDomain} ${sourceAction}`.toLowerCase();
  if (combined.includes("transfer")) return "Account transfer";
  if (combined.includes("staff_player_balance_adjustment") || combined.includes("ledger_adjustment")) {
    return "Administrative adjustment";
  }
  if (combined.includes("reward")) return "Reward";
  if (combined.includes("purchase")) return "Purchase";
  if (combined.includes("trade") || combined.includes("market")) return "Market activity";
  return titleCase(sourceAction || sourceDomain);
}

function historyRows(result) {
  const candidates = [result, result?.value, result?.data, result?.data?.data, result?.payload]
    .filter(isRecord);
  for (const candidate of candidates) {
    if (Array.isArray(candidate.ledgerEntries)) return candidate.ledgerEntries;
  }
  return null;
}

/** Normalize player ledger history to Checking/Savings-only, UUID-free presentation rows. */
export function normalizeBankingHistory(result) {
  const rows = historyRows(result);
  if (!rows) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  const entries = rows.slice(0, 250).map((row, index) => {
    if (!isRecord(row)) return null;
    const accountType = canonicalAccountType(row.accountType ?? row.account_type);
    if (!accountType) return null;
    const amount = safeFinite(row.amount);
    if (amount === null) return null;
    const sourceDomain = safeText(row.sourceDomain ?? row.source_domain, 100).toLowerCase();
    const sourceAction = safeText(row.sourceAction ?? row.source_action, 160).toLowerCase();
    const category = titleCase(sourceDomain, "Ledger");
    return Object.freeze({
      rowKey: `banking-entry-${index + 1}`,
      accountType,
      amount,
      currencyCode: safeCurrencyCode(row.currencyCode ?? row.currency_code),
      entryType: safeText(row.entryType ?? row.entry_type, 40).toLowerCase(),
      sourceDomain,
      sourceAction,
      description: historyDescription(sourceDomain, sourceAction),
      category,
      isTransfer: `${sourceDomain} ${sourceAction}`.includes("transfer"),
      createdAt: safeText(row.createdAt ?? row.created_at, 80),
    });
  }).filter(Boolean);
  return deepFreeze({ entries, isEmpty: entries.length === 0 });
}

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
