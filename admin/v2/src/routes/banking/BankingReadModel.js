import { createAdminErrorEnvelope } from "../../core/error-envelope.js";
import { readBankingResponseRows } from "./BankingResponse.js";

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
  const rows = readBankingResponseRows(result, ["players", "roster"], true);
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

/** Normalize player ledger history to Checking/Savings-only, UUID-free presentation rows. */
export function normalizeBankingHistory(result) {
  const rows = readBankingResponseRows(result, ["ledgerEntries"]);
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

// Shared validation semantics also used by the controller adjustment boundary.
export { UUID_PATTERN, CURRENCY_CODE_PATTERN, safeFinite, safeText };
