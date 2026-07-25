(function initEconovariaAdminAuthSessionManager() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEFAULT_EXPIRY_SKEW_MS = 30000;
  const nativeFetch = window.fetch.bind(window);
  let refreshPromise = null;
  let economicRequestSequence = 0;

  function text(value) {
    return String(value ?? "").trim();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function first(source, keys) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
    return undefined;
  }

  function newEconomicRequestId() {
    if (typeof window.crypto?.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    economicRequestSequence += 1;
    return `economic-write-${Date.now()}-${economicRequestSequence}`;
  }

  function isLedgerAdjustmentRequest(url, method) {
    return method === "POST" &&
      /\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/.test(url.pathname);
  }

  async function readEconomicRequestBody(request) {
    const contentType = text(request.headers.get("content-type")).toLowerCase();
    try {
      if (contentType.includes("application/json")) {
        return record(await request.clone().json());
      }
      if (contentType.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(new URLSearchParams(await request.clone().text()));
      }
      if (contentType.includes("multipart/form-data")) {
        const result = {};
        for (const [key, value] of (await request.clone().formData()).entries()) {
          if (typeof value === "string") result[key] = value;
        }
        return result;
      }
    } catch (_) {
      return {};
    }
    return {};
  }

  function normalizeLedgerAdjustmentBody(source, request) {
    const normalized = { ...source };
    const amount = first(source, [
      "amount",
      "value",
      "delta",
      "adjustmentAmount",
      "ledgerAmount",
      "balanceAdjustment"
    ]);
    if (amount !== undefined) normalized.amount = amount;

    const adjustmentType = first(source, [
      "adjustmentType",
      "entryType",
      "direction",
      "transactionType"
    ]);
    if (adjustmentType !== undefined) normalized.adjustmentType = adjustmentType;

    const reason = first(source, ["reason", "note", "ledgerNote", "memo"]);
    if (reason !== undefined) normalized.reason = reason;

    normalized.accountType = text(first(source, ["accountType", "account"])) || "cash";
    normalized.currencyCode = (
      text(first(source, ["currencyCode", "currency"])) || "ECO"
    ).toUpperCase();
    normalized.idempotencyKey = text(
      source.idempotencyKey ||
      request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id")
    ) || newEconomicRequestId();
    return normalized;
  }

  window.fetch = async function econovariaEconomicWriteFetch(input, init) {
    const rawUrl = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;
    const initial = input instanceof Request
      ? new Request(input, init)
      : new Request(rawUrl, init);
    const url = new URL(initial.url, window.location.href);

    if (!isLedgerAdjustmentRequest(url, initial.method.toUpperCase())) {
      return nativeFetch(initial);
    }

    const body = normalizeLedgerAdjustmentBody(
      await readEconomicRequestBody(initial),
      initial
    );
    const headers = new Headers(initial.headers);
    headers.set("Content-Type", "application/json");
    headers.set("X-Idempotency-Key", body.idempotencyKey);
    headers.delete("Content-Length");

    return nativeFetch(new Request(initial, {
      headers,
      body: JSON.stringify(body)
    }));
  };

  function read() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && typeof value.accessToken === "string" && value.accessToken.trim()
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function parseJwt(token) {
    try {
      const payload = String(token || "").split(".")[1] || "";
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return JSON.parse(atob(padded));
    } catch (_) {
      return {};
    }
  }

  function isExpired(session, skewMs = DEFAULT_EXPIRY_SKEW_MS) {
    const expiresAt = Number(parseJwt(session?.accessToken || "").exp || 0) * 1000;
    return Boolean(expiresAt && expiresAt <= Date.now() + Math.max(0, Number(skewMs) || 0));
  }

  function storeTokenResponse(payload, previousSession) {
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) throw new Error("Refresh response did not contain an access token.");

    const session = {
      ...(previousSession || {}),
      accessToken,
      refreshToken: String(payload?.refresh_token || previousSession?.refreshToken || "").trim(),
      user: payload?.user || previousSession?.user || null,
      refreshedAt: new Date().toISOString()
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("econovaria:admin-session-refreshed", {
      detail: { refreshedAt: session.refreshedAt }
    }));
    return session;
  }

  function clear({ includeSelectedGame = true } = {}) {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      if (includeSelectedGame) window.sessionStorage.removeItem(SELECTED_GAME_KEY);
    } catch (_) {}
  }

  async function performRefresh() {
    const previousSession = read();
    const refreshToken = String(previousSession?.refreshToken || "").trim();
    if (!previousSession || !refreshToken) {
      clear();
      throw new Error("Administrator refresh token is unavailable.");
    }

    let response;
    try {
      response = await nativeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } catch (error) {
      throw new Error("Administrator session refresh could not reach the identity service.", {
        cause: error
      });
    }

    if (!response.ok) {
      clear();
      throw new Error(`Administrator session refresh was rejected (${response.status}).`);
    }

    try {
      return storeTokenResponse(await response.json(), previousSession);
    } catch (error) {
      clear();
      throw new Error("Administrator session refresh returned an invalid response.", {
        cause: error
      });
    }
  }

  function refresh() {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function getUsableSession({ minimumValidityMs = DEFAULT_EXPIRY_SKEW_MS } = {}) {
    const session = read();
    if (!session) return null;
    if (!isExpired(session, minimumValidityMs)) return session;
    return refresh();
  }

  window.EconovariaEconomicWriteContract = Object.freeze({
    normalizeLedgerAdjustmentBody
  });

  window.EconovariaAdminAuthSession = Object.freeze({
    read,
    clear,
    parseJwt,
    isExpired,
    refresh,
    getUsableSession
  });
})();
