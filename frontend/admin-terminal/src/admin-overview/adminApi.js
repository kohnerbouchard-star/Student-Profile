(function attachEconovariaAdminApi(globalScope) {
  "use strict";

  const DEFAULT_CLASSROOM_API_PATH = "/functions/v1/classroom-api";
  const DEFAULT_STOCK_ORDER_PATH = "/players/me/stocks/orders";
  const JSON_CONTENT_TYPE = "application/json";
  const UNSUPPORTED_CONTRACTS_MESSAGE = "Contracts backend routes are not available in classroom-api yet.";
  const UNSUPPORTED_MARKET_MESSAGE = "Marketplace read-model routes are not available in classroom-api yet.";

  function readConfigValue(key) {
    const config = globalScope?.EconovariaAdminConfig ||
      globalScope?.Econovaria?.adminTerminal?.config ||
      {};

    if (config && config[key]) return config[key];
    if (globalScope && globalScope[key]) return globalScope[key];

    const processEnv = typeof process !== "undefined" ? process.env : null;
    if (processEnv?.[key]) return processEnv[key];
    if (key === "SUPABASE_PUBLISHABLE_KEY" && processEnv?.SUPABASE_ANON_KEY) {
      return processEnv.SUPABASE_ANON_KEY;
    }
    if (key === "CLASSROOM_API_URL" && processEnv?.VITE_CLASSROOM_API_URL) {
      return processEnv.VITE_CLASSROOM_API_URL;
    }
    if (key === "SUPABASE_PUBLISHABLE_KEY" && processEnv?.VITE_SUPABASE_ANON_KEY) {
      return processEnv.VITE_SUPABASE_ANON_KEY;
    }

    const documentRef = globalScope?.document;
    const meta = documentRef?.querySelector?.(`meta[name="${key.toLowerCase().replaceAll("_", "-")}"]`);
    return meta?.getAttribute?.("content") || "";
  }

  function resolveClassroomApiUrl() {
    return String(readConfigValue("CLASSROOM_API_URL") || DEFAULT_CLASSROOM_API_PATH).replace(/\/+$/, "");
  }

  function resolveStockOrderPath() {
    return String(readConfigValue("STOCK_ORDER_EXECUTION_PATH") || DEFAULT_STOCK_ORDER_PATH);
  }

  function resolveSupabasePublishableKey() {
    return String(readConfigValue("SUPABASE_PUBLISHABLE_KEY") || "").trim();
  }

  function normalizeBearerToken(token) {
    return String(token || "").replace(/^Bearer\s+/i, "").trim();
  }

  function appendPath(baseUrl, path) {
    const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
    const normalizedPath = `/${String(path || "").replace(/^\/+/, "")}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  function buildClassroomApiUrl(path = "", query = null) {
    const url = appendPath(resolveClassroomApiUrl(), path);
    const params = new URLSearchParams();

    if (query && typeof query === "object") {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
      });
    }

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  function buildStaffHeaders(token, options = {}) {
    const bearerToken = normalizeBearerToken(token);
    const publishableKey = resolveSupabasePublishableKey();
    const headers = {
      accept: JSON_CONTENT_TYPE,
    };

    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    if (publishableKey) headers.apikey = publishableKey;
    if (options.jsonBody) headers["Content-Type"] = JSON_CONTENT_TYPE;
    if (options.requestId) headers["x-request-id"] = options.requestId;

    return headers;
  }

  function buildPlayerHeaders(playerSessionToken, options = {}) {
    const publishableKey = resolveSupabasePublishableKey();
    const sessionToken = String(playerSessionToken || "").trim();
    const headers = {
      accept: JSON_CONTENT_TYPE,
    };

    if (publishableKey) {
      headers.Authorization = `Bearer ${publishableKey}`;
      headers.apikey = publishableKey;
    }
    if (sessionToken) headers["x-player-session-token"] = sessionToken;
    if (options.jsonBody) headers["Content-Type"] = JSON_CONTENT_TYPE;
    if (options.requestId) headers["x-request-id"] = options.requestId;

    return headers;
  }

  function createIdempotencyKey(prefix = "admin") {
    const safePrefix = String(prefix || "admin").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "admin";
    const cryptoRef = globalScope?.crypto;

    if (cryptoRef?.randomUUID) {
      return `${safePrefix}-${cryptoRef.randomUUID()}`;
    }

    const randomPart = Math.random().toString(36).slice(2, 12);
    const timePart = Date.now().toString(36);
    return `${safePrefix}-${timePart}-${randomPart}`;
  }

  function normalizeApiError(result, status = 0, fallback = {}) {
    const error = result && typeof result === "object" ? result.error : null;
    const code = error?.code || result?.code || fallback.code || "classroom_api_request_failed";
    const message = error?.message || result?.message || fallback.message || "Classroom API request failed.";
    const retryable = Boolean(error?.retryable ?? result?.retryable ?? fallback.retryable ?? false);

    return {
      ok: false,
      status,
      code,
      message,
      retryable,
      error: error || null,
    };
  }

  function unsupported(code, message) {
    return Promise.resolve({
      ok: false,
      status: 501,
      code,
      message,
      retryable: false,
      error: {
        code,
        message,
        retryable: false,
      },
    });
  }

  async function readJsonResponse(response, fallback) {
    let result = null;

    try {
      result = await response.json();
    } catch (_error) {
      return normalizeApiError(null, response.status, {
        code: fallback.unreadableCode || "classroom_api_unreadable_response",
        message: fallback.unreadableMessage || "Classroom API returned an unreadable response.",
      });
    }

    if (response.ok && result?.ok === true) {
      return {
        status: response.status,
        ...result,
      };
    }

    return normalizeApiError(result, response.status, fallback);
  }

  async function requestJson(path, options = {}) {
    const fetchImpl = options.fetchImpl || globalScope?.fetch;

    if (typeof fetchImpl !== "function") {
      return normalizeApiError(null, 0, {
        code: "fetch_not_available",
        message: "Fetch is not available in this runtime.",
      });
    }

    const method = String(options.method || "GET").toUpperCase();
    const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
    const requestId = options.requestId || (method === "GET" ? "" : createIdempotencyKey(options.idempotencyScope || "admin"));
    const headers = options.headers || buildStaffHeaders(options.token, {
      jsonBody: hasBody,
      requestId,
    });

    try {
      const response = await fetchImpl(buildClassroomApiUrl(path, options.query), {
        method,
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
      });

      return readJsonResponse(response, options.fallback || {});
    } catch (_error) {
      return normalizeApiError(null, 0, {
        code: options.networkCode || "classroom_api_network_failed",
        message: options.networkMessage || "Could not connect to classroom-api.",
        retryable: true,
      });
    }
  }

  function getStaffBootstrap(token) {
    return requestJson("/staff/bootstrap", {
      method: "GET",
      token,
      fallback: {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
      },
    });
  }

  function listPlayers(gameSessionId, token) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players`, {
      method: "GET",
      token,
      fallback: {
        code: "player_roster_failed",
        message: "Player roster could not be loaded.",
      },
    });
  }

  function createPlayer(gameSessionId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players`, {
      method: "POST",
      token,
      body: {
        displayName: input.displayName || input.name || "",
        rosterLabel: input.rosterLabel ?? input.label ?? null,
      },
      idempotencyScope: "create-player",
      fallback: {
        code: "player_create_failed",
        message: "Player could not be created.",
      },
    });
  }

  function resetPlayerAccessCode(gameSessionId, playerId, token) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players/${encodeURIComponent(playerId || "")}/access-code/reset`, {
      method: "POST",
      token,
      idempotencyScope: "reset-player-access-code",
      fallback: {
        code: "access_code_reset_failed",
        message: "Player access code could not be reset.",
      },
    });
  }

  function getAttendanceDaily(gameSessionId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/attendance`, {
      method: "GET",
      token,
      query: {
        date: input.date,
      },
      fallback: {
        code: "attendance_daily_list_failed",
        message: "Daily attendance could not be loaded.",
      },
    });
  }

  function scanAttendance(gameSessionId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/attendance/scan`, {
      method: "POST",
      token,
      body: {
        playerId: input.playerId || input.studentCode || input.code || "",
        deviceTimezone: input.deviceTimezone || input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      idempotencyScope: "attendance-scan",
      fallback: {
        code: "attendance_scan_failed",
        message: "Attendance scan failed.",
      },
    });
  }

  function listStoreItems(gameSessionId, token) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/store/items`, {
      method: "GET",
      token,
      fallback: {
        code: "store_catalog_request_failed",
        message: "Store catalog request failed.",
      },
    });
  }

  function createStoreItem(gameSessionId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/store/items`, {
      method: "POST",
      token,
      body: input,
      idempotencyScope: "create-store-item",
      fallback: {
        code: "store_catalog_request_failed",
        message: "Store item could not be created.",
      },
    });
  }

  function updateStoreItem(gameSessionId, itemId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/store/items/${encodeURIComponent(itemId || "")}`, {
      method: "PATCH",
      token,
      body: input,
      idempotencyScope: "update-store-item",
      fallback: {
        code: "store_catalog_request_failed",
        message: "Store item could not be updated.",
      },
    });
  }

  function listContracts() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function createContract() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function publishContract() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function listContractProgress() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function reviewContractProgress() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function issueContractRewards() {
    return unsupported("contracts_backend_not_available", UNSUPPORTED_CONTRACTS_MESSAGE);
  }

  function resetJoinCode(gameSessionId, token) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/join-code/reset`, {
      method: "POST",
      token,
      idempotencyScope: "reset-join-code",
      fallback: {
        code: "join_code_reset_failed",
        message: "Game join code could not be reset.",
      },
    });
  }

  function seedInitialBalances(gameSessionId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players/seed-balances`, {
      method: "POST",
      token,
      body: {
        amount: input.amount ?? 100,
        reason: input.reason || "Initial balance seed",
        accountType: input.accountType || "cash",
        currencyCode: input.currencyCode || "ECO",
      },
      idempotencyScope: "seed-initial-balances",
      fallback: {
        code: "initial_balance_seed_failed",
        message: "Initial balance seed failed.",
      },
    });
  }

  function readPlayerLedger(gameSessionId, playerId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players/${encodeURIComponent(playerId || "")}/ledger`, {
      method: "GET",
      token,
      query: {
        limit: input.limit,
      },
      fallback: {
        code: "admin_player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
      },
    });
  }

  function adjustPlayerLedger(gameSessionId, playerId, token, input = {}) {
    return requestJson(`/games/${encodeURIComponent(gameSessionId || "")}/players/${encodeURIComponent(playerId || "")}/ledger-adjustments`, {
      method: "POST",
      token,
      body: {
        amount: input.amount,
        reason: input.reason,
        accountType: input.accountType || "cash",
        currencyCode: input.currencyCode || "ECO",
      },
      idempotencyScope: "adjust-player-ledger",
      fallback: {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
      },
    });
  }

  function listMarketSecurities() {
    return unsupported("marketplace_backend_not_available", UNSUPPORTED_MARKET_MESSAGE);
  }

  function listMarketHoldings() {
    return unsupported("marketplace_backend_not_available", UNSUPPORTED_MARKET_MESSAGE);
  }

  function listMarketOrders() {
    return unsupported("marketplace_backend_not_available", UNSUPPORTED_MARKET_MESSAGE);
  }

  function listMarketTrades() {
    return unsupported("marketplace_backend_not_available", UNSUPPORTED_MARKET_MESSAGE);
  }

  function normalizeStockOrderSide(side) {
    const normalized = String(side || "").trim().toLowerCase();
    if (normalized === "buy") return "buy";
    if (normalized === "sell") return "sell";
    return "";
  }

  function isAdvancedStockOrder(input = {}) {
    const side = String(input.side || input.action || "").trim().toLowerCase().replace(/\s+/g, "_");
    const orderType = String(input.orderType || input.type || "market").trim().toLowerCase().replace(/\s+/g, "_");
    const instrument = String(input.instrument || input.instrumentType || "stock").trim().toLowerCase();
    const hasAdvancedField = ["optionType", "strike", "expiry", "stopPrice", "stop", "short"].some((key) =>
      Object.prototype.hasOwnProperty.call(input, key)
    );

    return Boolean(
      hasAdvancedField ||
      instrument.includes("option") ||
      instrument === "call" ||
      instrument === "put" ||
      side === "short_sell" ||
      side === "short" ||
      side === "cover_short" ||
      side === "cover" ||
      orderType.startsWith("stop")
    );
  }

  function buildStockOrderPayload(gameSessionId, input = {}) {
    if (isAdvancedStockOrder(input)) {
      return {
        ok: false,
        code: "advanced_stock_order_not_supported",
        message: "Only simple stock buy/sell orders can be submitted to the current stock order endpoint.",
      };
    }

    const side = normalizeStockOrderSide(input.side || input.action);
    const stockAssetId = String(input.stockAssetId || "").trim();
    const quantity = Number(input.quantity);
    const idempotencyKey = input.idempotencyKey || createIdempotencyKey("stock-order");

    if (!stockAssetId) {
      return {
        ok: false,
        code: "stock_asset_required",
        message: "stockAssetId is required.",
      };
    }

    if (side !== "buy" && side !== "sell") {
      return {
        ok: false,
        code: "stock_order_side_not_supported",
        message: "Stock order side must be buy or sell.",
      };
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        ok: false,
        code: "stock_order_quantity_required",
        message: "quantity must be a whole number above zero.",
      };
    }

    return {
      ok: true,
      payload: {
        gameSessionId,
        stockAssetId,
        side,
        quantity,
        idempotencyKey,
      },
    };
  }

  async function placeStockOrder(gameSessionId, playerSessionToken, input = {}, options = {}) {
    const payloadResult = buildStockOrderPayload(gameSessionId, input);

    if (!payloadResult.ok) {
      return normalizeApiError(null, 400, {
        code: payloadResult.code,
        message: payloadResult.message,
      });
    }

    const fetchImpl = options.fetchImpl || globalScope?.fetch;
    if (typeof fetchImpl !== "function") {
      return normalizeApiError(null, 0, {
        code: "fetch_not_available",
        message: "Fetch is not available in this runtime.",
      });
    }

    try {
      const response = await fetchImpl(buildClassroomApiUrl(resolveStockOrderPath()), {
        method: "POST",
        headers: buildPlayerHeaders(playerSessionToken, {
          jsonBody: true,
          requestId: payloadResult.payload.idempotencyKey,
        }),
        body: JSON.stringify(payloadResult.payload),
      });

      return readJsonResponse(response, {
        code: "stock_order_failed",
        message: "Stock order failed.",
      });
    } catch (_error) {
      return normalizeApiError(null, 0, {
        code: "stock_order_network_failed",
        message: "Could not connect to the stock order endpoint.",
        retryable: true,
      });
    }
  }

  const api = {
    getStaffBootstrap,
    listPlayers,
    createPlayer,
    resetPlayerAccessCode,
    getAttendanceDaily,
    scanAttendance,
    listStoreItems,
    createStoreItem,
    updateStoreItem,
    listContracts,
    createContract,
    publishContract,
    listContractProgress,
    reviewContractProgress,
    issueContractRewards,
    resetJoinCode,
    seedInitialBalances,
    readPlayerLedger,
    adjustPlayerLedger,
    listMarketSecurities,
    listMarketHoldings,
    listMarketOrders,
    listMarketTrades,
    placeStockOrder,
    placeMarketOrder: placeStockOrder,
    createIdempotencyKey,
    __test: {
      buildClassroomApiUrl,
      buildStaffHeaders,
      buildPlayerHeaders,
      buildStockOrderPayload,
      isAdvancedStockOrder,
      normalizeApiError,
      resolveClassroomApiUrl,
      resolveSupabasePublishableKey,
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.EconovariaAdminApi = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
