import { resolvePlayerBackendRequest } from "../api/backend-routes.js";
import { hasMarketplaceBackendRoute, resolveMarketplaceBackendRequest } from "../api/marketplace-backend-routes.js";
import { ApiConnectionPendingError, ApiRequestError } from "../api/errors.js";
import { mergeTerminalRead, normalizeTerminalBootstrap } from "../api/read-model.js";
import { normalizeApiResponse } from "../api/response-normalizer.js";
import { attachPortfolioHoldings } from "../api/portfolio-market-holdings.js";
import { createEmptyReadModels } from "../data/empty-read-models.js";
import { normalizePlayerContracts } from "../features/contracts/contract-read-model.js";
import { normalizePlayerInventory } from "../features/inventory/inventory-read-model.js";
import { normalizePlayerMarketplace } from "../features/marketplace/marketplace-read-model.js";
import {
  normalizeBankingFxHistory,
  normalizeBankingFxOrders,
  normalizeBankingFxOverview,
} from "../features/banking/banking-fx-read-model.js";
import { validateStudentProfileCapabilityManifest } from "./student-profile-capability-manifest.js";

const CLIENT_OWNERSHIP_FIELDS = new Set([
  "playerId", "playerUuid", "playerUUID", "playerSessionId",
  "recipientPlayerUuid", "recipientPlayerUUID", "senderPlayerUuid", "senderPlayerUUID"
]);
const READ_MODEL_KEYS = new Set([
  "countries", "news", "market", "marketAsset", "portfolio", "store", "banking", "notifications"
]);
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizedBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizedCredential(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

function isPublishableKey(value) {
  return /^sb_publishable_/i.test(normalizedCredential(value));
}

function currencyCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : "";
}

function explicitSessionCurrency(rawSession) {
  const player = rawSession?.player && typeof rawSession.player === "object"
    ? rawSession.player
    : {};
  const country = player.country && typeof player.country === "object"
    ? player.country
    : {};
  for (const value of [
    rawSession?.countryCurrencyCode,
    rawSession?.localCurrencyCode,
    player.countryCurrencyCode,
    player.localCurrencyCode,
    player.currencyCode,
    country.currencyCode,
  ]) {
    const code = currencyCode(value);
    if (code) return code;
  }
  const checkingCurrencies = [...new Set(
    (Array.isArray(rawSession?.balances) ? rawSession.balances : [])
      .filter((row) => String(row?.accountType || "").trim().toLowerCase() === "checking")
      .map((row) => currencyCode(row?.currencyCode))
      .filter(Boolean),
  )];
  return checkingCurrencies.length === 1 ? checkingCurrencies[0] : "";
}

function dashboardCurrency(rawDashboard) {
  return currencyCode(
    rawDashboard?.me?.netWorthValuation?.currencyCode ||
    rawDashboard?.me?.cash?.primaryCurrencyCode,
  );
}

function bindSessionCurrency(snapshot, code) {
  const resolved = currencyCode(code);
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      currencyCode: resolved,
      currencyName: resolved || "Unavailable",
      currencyResolved: Boolean(resolved),
    },
  };
}

function accountBalanceForCurrency(balances, accountType, preferredCurrencyCode) {
  const type = String(accountType || "").trim().toLowerCase();
  const preferred = currencyCode(preferredCurrencyCode);
  const rows = (Array.isArray(balances) ? balances : []).filter((row) =>
    String(row?.accountKind || row?.accountType || "").trim().toLowerCase() === type
  );
  if (preferred) {
    return rows.find((row) => currencyCode(row?.currencyCode) === preferred) || null;
  }
  return rows.length === 1 ? rows[0] : null;
}

function bindBankingCurrency(snapshot, raw) {
  const preferredCurrencyCode = snapshot.session?.currencyResolved === true
    ? currencyCode(snapshot.session.currencyCode)
    : "";
  const balances = Array.isArray(raw?.currentBalances) ? raw.currentBalances : [];
  const checking = accountBalanceForCurrency(
    balances,
    "checking",
    preferredCurrencyCode,
  );
  const savings = accountBalanceForCurrency(
    balances,
    "savings",
    preferredCurrencyCode,
  );
  const checkingBalance = checking ? Number(checking.postedAmount ?? checking.balance) : null;
  const savingsBalance = savings ? Number(savings.postedAmount ?? savings.balance) : null;
  const checkingAmount = Number.isFinite(checkingBalance) ? checkingBalance : null;
  const savingsAmount = Number.isFinite(savingsBalance) ? savingsBalance : null;
  return {
    ...snapshot,
    banking: {
      ...snapshot.banking,
      checking: checking
        ? {
          configured: true,
          accountId: String(checking.accountKey || "CHECKING"),
          balance: checkingAmount,
          postedAmount: checkingAmount,
          heldAmount: Number(checking.heldAmount ?? checking.held ?? 0),
          available: Number(checking.availableAmount ?? checking.available ?? checkingAmount),
          availableAmount: Number(checking.availableAmount ?? checking.available ?? checkingAmount),
          pending: Number(checking.heldAmount ?? checking.held ?? 0),
          currencyCode: currencyCode(checking.currencyCode),
        }
        : {
          configured: false,
          accountId: "CHECKING",
          balance: null,
          available: null,
          pending: 0,
          currencyCode: preferredCurrencyCode,
        },
      savings: savings
        ? {
          configured: true,
          accountId: String(savings.accountKey || "SAVINGS"),
          balance: savingsAmount,
          postedAmount: savingsAmount,
          heldAmount: Number(savings.heldAmount ?? savings.held ?? 0),
          available: Number(savings.availableAmount ?? savings.available ?? savingsAmount),
          availableAmount: Number(savings.availableAmount ?? savings.available ?? savingsAmount),
          interestRate: snapshot.banking?.savings?.interestRate ?? null,
          interestEarned: snapshot.banking?.savings?.interestEarned ?? null,
          currencyCode: currencyCode(savings.currencyCode),
        }
        : {
          configured: false,
          accountId: "NOT CONFIGURED",
          balance: null,
          available: null,
          interestRate: null,
          interestEarned: null,
          currencyCode: preferredCurrencyCode,
        },
    },
    dashboard: {
      ...snapshot.dashboard,
      liquidBalance: checkingAmount,
      savingsBalance: savingsAmount,
    },
  };
}

function deviceId(config) {
  const configured = String(config?.deviceId || "").trim().toLowerCase();
  if (DEVICE_ID_PATTERN.test(configured)) return configured;
  try {
    const existing = String(globalThis.localStorage?.getItem(DEVICE_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (DEVICE_ID_PATTERN.test(existing)) return existing;
    const generated = String(globalThis.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_ID_PATTERN.test(generated)) throw new Error("device id unavailable");
    globalThis.localStorage?.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    throw new ApiRequestError("This device could not initialize a secure game session.", {
      code: "DEVICE_ID_UNAVAILABLE"
    });
  }
}

function assertNoClientOwnershipFields(payload, endpointKey) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  for (const key of Object.keys(payload)) {
    if (!CLIENT_OWNERSHIP_FIELDS.has(key)) continue;
    throw new ApiRequestError("Player ownership is resolved from the authenticated session.", {
      code: "INVALID_REQUEST", endpointKey
    });
  }
}

function backendPayload(context) {
  const payload = context.payload && typeof context.payload === "object" && !Array.isArray(context.payload)
    ? { ...context.payload }
    : context.payload;
  if (payload && typeof payload === "object" && context.idempotencyKey) payload.idempotencyKey = context.idempotencyKey;
  return payload;
}

export function headersFor(context) {
  if (context.session?.authenticated !== true) {
    throw new ApiRequestError("Your Player session has expired. Reconnect through the Econovaria sign-in screen.", {
      status: 401, code: "SESSION_INVALID", endpointKey: context.endpointKey, requestId: context.requestId
    });
  }

  const publishableKey = normalizedCredential(context.config?.publishableKey || "");
  if (publishableKey && !isPublishableKey(publishableKey)) {
    throw new ApiRequestError("The Player application identity is invalid.", {
      code: "PUBLISHABLE_KEY_INVALID", endpointKey: context.endpointKey, requestId: context.requestId
    });
  }

  const headers = {
    "content-type": "application/json",
    "x-econovaria-device-id": deviceId(context.config),
    "x-request-id": String(context.requestId || "")
  };
  if (publishableKey) headers.apikey = publishableKey;
  if (!["GET", "HEAD"].includes(String(context.method || "GET").toUpperCase())) {
    const csrfToken = String(context.session?.csrfToken || context.config?.csrfToken || "");
    if (!CSRF_PATTERN.test(csrfToken)) {
      throw new ApiRequestError("Your Player session has expired. Reconnect through the Econovaria sign-in screen.", {
        status: 401, code: "SESSION_INVALID", endpointKey: context.endpointKey, requestId: context.requestId
      });
    }
    headers["x-econovaria-csrf-token"] = csrfToken;
  }
  if (context.idempotencyKey) {
    const idempotencyKey = String(context.idempotencyKey);
    headers["idempotency-key"] = idempotencyKey;
    headers["x-idempotency-key"] = idempotencyKey;
  }
  return headers;
}

function endpointProjection(snapshot, endpointKey) {
  if (endpointKey === "marketAsset") return snapshot.market;
  return snapshot[endpointKey];
}

function responseCode(body) {
  return String(body?.code || body?.error?.code || "REQUEST_FAILED").toUpperCase();
}

function authoritativeSessionExpiry(raw) {
  const value = String(raw?.session?.expiresAt || raw?.sessionExpiresAt || raw?.expiresAt || "").trim();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function retryAfterMs(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function readBody(response) {
  const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text.slice(0, 5000) } : {};
}

function resolvedBackendRequest(context, payload) {
  if (hasMarketplaceBackendRoute(context.endpointKey)) {
    return resolveMarketplaceBackendRequest({ ...context, payload, session: context.session });
  }
  return resolvePlayerBackendRequest({ ...context, payload, session: context.session });
}

function applyCapabilityManifest(snapshot, manifest) {
  if (!manifest) return snapshot;
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      capabilities: manifest.capabilities,
      capabilitySchemaVersion: manifest.schemaVersion,
      capabilityManifestVersion: manifest.manifestVersion,
      capabilityService: manifest.service,
      capabilityEndpointKeys: manifest.endpoints.map((endpoint) => endpoint.key)
    }
  };
}

export function createStudentProfileFetchRequest({ apiBaseUrl = "/api/player", fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const baseUrl = normalizedBaseUrl(apiBaseUrl);
  return async function studentProfileFetchRequest({ method, path, payload, headers, signal }) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" || payload === undefined ? undefined : JSON.stringify(payload),
      signal,
      credentials: "include",
      cache: "no-store"
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw new ApiRequestError("The game service could not complete the request.", {
        status: response.status, code: responseCode(body), retryAfterMs: retryAfterMs(response)
      });
    }
    return body;
  };
}

export function createStudentProfileApiCall({ request } = {}) {
  if (typeof request !== "function") throw new TypeError("A Student-Profile request function is required.");
  let rawSession = null;
  let capabilityManifest = null;
  let snapshot = createEmptyReadModels();
  let sessionFingerprint = "";

  async function loadCapabilityManifest(context) {
    const route = resolvePlayerBackendRequest({ endpointKey: "capabilities", method: "GET", path: "/capabilities", payload: undefined, params: {}, session: context.session });
    if (!route) throw new ApiConnectionPendingError({ endpointKey: "capabilities", method: "GET", path: "/capabilities" });
    const raw = await request({
      endpointKey: "capabilities", method: route.method, path: route.path, payload: route.payload,
      headers: headersFor({ ...context, endpointKey: "capabilities", method: route.method }), signal: context.signal,
      requestId: context.requestId
    });
    return validateStudentProfileCapabilityManifest(raw);
  }

  return async function studentProfileApiCall(context) {
    assertNoClientOwnershipFields(context.payload, context.endpointKey);
    const currentFingerprint = [
      context.session?.authenticated === true ? "authenticated" : "anonymous",
      String(context.session?.csrfToken || ""),
      String(context.session?.gameSessionId || "")
    ].join("|");
    if (currentFingerprint !== sessionFingerprint) {
      sessionFingerprint = currentFingerprint;
      rawSession = null;
      capabilityManifest = null;
      snapshot = createEmptyReadModels();
    }

    const payload = backendPayload(context);
    const backendRequest = resolvedBackendRequest(context, payload);
    if (!backendRequest) {
      throw new ApiConnectionPendingError({ endpointKey: context.endpointKey, method: context.method, path: context.path, payload: context.payload });
    }

    const raw = await request({
      endpointKey: context.endpointKey, method: backendRequest.method, path: backendRequest.path,
      payload: backendRequest.payload, headers: headersFor({ ...context, method: backendRequest.method }), signal: context.signal,
      requestId: context.requestId, idempotencyKey: context.idempotencyKey
    });

    if (context.endpointKey === "session") {
      rawSession = raw;
      capabilityManifest = await loadCapabilityManifest(context);
      snapshot = applyCapabilityManifest(normalizeTerminalBootstrap(rawSession, {}), capabilityManifest);
      snapshot = bindSessionCurrency(snapshot, explicitSessionCurrency(rawSession));
      const sessionExpiresAt = authoritativeSessionExpiry(rawSession);
      if (sessionExpiresAt) snapshot = { ...snapshot, session: { ...snapshot.session, sessionExpiresAt } };
      return snapshot.session;
    }

    if (context.endpointKey === "dashboard") {
      if (!rawSession || !capabilityManifest) {
        throw new ApiRequestError("The Player session and capability manifest must load before the dashboard.", {
          code: "INVALID_RESPONSE", endpointKey: context.endpointKey, requestId: context.requestId
        });
      }
      snapshot = applyCapabilityManifest(normalizeTerminalBootstrap(rawSession, raw), capabilityManifest);
      snapshot = bindSessionCurrency(snapshot, dashboardCurrency(raw));
      const sessionExpiresAt = authoritativeSessionExpiry(rawSession);
      if (sessionExpiresAt) snapshot = { ...snapshot, session: { ...snapshot.session, sessionExpiresAt } };
      return snapshot.dashboard;
    }

    if (context.endpointKey === "worldRuntime") {
      snapshot = { ...snapshot, worldRuntime: raw };
      return snapshot.worldRuntime;
    }
    if (context.endpointKey === "contracts") {
      snapshot = { ...snapshot, contracts: normalizePlayerContracts(raw) };
      return snapshot.contracts;
    }
    if (context.endpointKey === "inventory") {
      snapshot = { ...snapshot, inventory: normalizePlayerInventory(raw) };
      return snapshot.inventory;
    }
    if (context.endpointKey === "marketplace") {
      snapshot = { ...snapshot, marketplace: normalizePlayerMarketplace(raw) };
      return snapshot.marketplace;
    }
    if (context.endpointKey === "bankingFx") {
      snapshot = { ...snapshot, bankingFx: normalizeBankingFxOverview(raw) };
      return snapshot.bankingFx;
    }
    if (context.endpointKey === "bankingFxHistory") {
      return normalizeBankingFxHistory(raw);
    }
    if (context.endpointKey === "bankingFxOrders") {
      return normalizeBankingFxOrders(raw);
    }
    if (READ_MODEL_KEYS.has(context.endpointKey)) {
      const readResponse = context.endpointKey === "store"
        ? normalizeApiResponse("store", raw, {
          config: context.config || {},
          path: context.path,
          requestId: context.requestId,
        })
        : raw;
      snapshot = mergeTerminalRead(snapshot, context.endpointKey, readResponse);
      if (context.endpointKey === "countries" && snapshot.session?.currencyCode) {
        snapshot = bindSessionCurrency(snapshot, snapshot.session.currencyCode);
      }
      if (context.endpointKey === "banking") {
        snapshot = bindBankingCurrency(snapshot, raw);
      }
      if (context.endpointKey === "portfolio") {
        snapshot = {
          ...snapshot,
          portfolio: attachPortfolioHoldings(snapshot.portfolio, raw),
        };
      }
      return endpointProjection(snapshot, context.endpointKey);
    }
    return raw;
  };
}
