import { PLAYER_ENDPOINTS, resolveEndpoint } from "./endpoints.js";
import { PreviewTransport } from "./preview-transport.js";
import { HttpTransport } from "./http-transport.js";
import { AdapterTransport } from "./adapter-transport.js";
import {
  mergeTerminalRead,
  normalizeTerminalBootstrap,
  readSessionContext
} from "./read-model.js";

const PREVIEW_BOOTSTRAP_KEYS = Object.freeze([
  "session", "dashboard", "countries", "news", "market", "portfolio", "business", "store",
  "marketplace", "contracts", "inventory", "crafting", "banking", "loans", "messages",
  "progression", "notifications"
]);

const LAZY_ROUTE_ENDPOINTS = Object.freeze({
  dashboard: "countries",
  news: "news",
  market: "market",
  store: "store",
  contracts: "contracts",
  portfolio: "portfolio",
  inventory: "inventory",
  banking: "banking"
});

const IDEMPOTENCY_PREFIXES = Object.freeze({
  marketOrder: "stock-order",
  inventoryUse: "inventory-redemption"
});

function createIdempotencyKey(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid}`;
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export class PlayerApi {
  constructor(config) {
    this.config = config;
    this.loadedLazyRoutes = new Set();
    this.transport = config.usePreviewData
      ? new PreviewTransport({ simulateWrites: config.simulatePreviewWrites })
      : config.apiCall || config.adapter
        ? new AdapterTransport(config.apiCall || config.adapter, config)
        : new HttpTransport(config);
  }

  setSession(session) {
    if (!session || typeof session !== "object") return;
    if (session.playerSessionToken) this.config.playerSessionToken = session.playerSessionToken;
    if (session.gameSessionId) this.config.gameSessionId = session.gameSessionId;
    if (session.playerSessionId) this.config.playerSessionId = session.playerSessionId;
    if (session.accessToken) this.config.accessToken = session.accessToken;
  }

  request(endpointKey, { params, payload } = {}) {
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
    if (!endpoint) throw new Error(`Unknown player API endpoint: ${endpointKey}`);
    const path = resolveEndpoint(endpoint, params);
    return this.transport.request({ endpointKey, method: endpoint.method, path, payload, params });
  }

  async bootstrap() {
    this.loadedLazyRoutes.clear();
    if (this.config.usePreviewData) {
      const values = await Promise.all(PREVIEW_BOOTSTRAP_KEYS.map((key) => this.request(key)));
      return Object.fromEntries(PREVIEW_BOOTSTRAP_KEYS.map((key, index) => [key, values[index]]));
    }

    const sessionResponse = await this.request("session");
    this.setSession(readSessionContext(sessionResponse));
    const dashboardResponse = await this.request("dashboard");
    return {
      ...normalizeTerminalBootstrap(sessionResponse, dashboardResponse),
      capabilities: sessionResponse?.capabilities ?? null
    };
  }

  execute(endpointKey, payload = {}, params) {
    const prefix = IDEMPOTENCY_PREFIXES[endpointKey];
    const idempotentPayload = prefix && !payload?.idempotencyKey
      ? { ...payload, idempotencyKey: createIdempotencyKey(prefix) }
      : payload;
    return this.request(endpointKey, { payload: idempotentPayload, params });
  }

  async loadRoute(route, data, { force = false } = {}) {
    if (this.config.usePreviewData || this.config.lazyRouteReads === false) return data;
    const endpointKey = LAZY_ROUTE_ENDPOINTS[route];
    if (!endpointKey || (!force && this.loadedLazyRoutes.has(route))) return data;
    const response = await this.request(endpointKey);
    this.loadedLazyRoutes.add(route);
    const next = mergeTerminalRead(data, endpointKey, response);
    if (endpointKey !== "market") return next;
    const assetId = next.market?.selectedAssetId;
    return assetId ? this.loadMarketAsset(next, assetId) : next;
  }

  async loadMarketAsset(data, assetId, { historyLimit = 200 } = {}) {
    if (this.config.usePreviewData) return data;
    const response = await this.request("marketAsset", {
      params: { assetId },
      payload: { historyLimit }
    });
    return mergeTerminalRead(data, "marketAsset", response);
  }

  invalidateRoute(route) {
    this.loadedLazyRoutes.delete(route);
  }

  async refreshDashboard(data) {
    if (this.config.usePreviewData) return this.bootstrap();
    const response = await this.request("dashboard");
    this.loadedLazyRoutes.clear();
    return mergeTerminalRead(data, "dashboard", response);
  }

  async refreshInventory(data) {
    if (this.config.usePreviewData) return data;
    const response = await this.request("inventory");
    this.loadedLazyRoutes.add("inventory");
    return mergeTerminalRead(data, "inventory", response);
  }

  async refreshNotifications(data) {
    if (this.config.usePreviewData) return data;
    const response = await this.request("notifications", {
      payload: { status: "unread", limit: 50 }
    });
    return mergeTerminalRead(data, "notifications", response);
  }

  quoteStoreItem({ storeItemId, itemId, quantity = 1 }) {
    return this.execute("storeQuote", { itemId: itemId || storeItemId, quantity });
  }

  completeStorePurchase({ quoteId, idempotencyKey, clientSubmittedAt }) {
    return this.execute("storePurchase", {
      quoteId,
      idempotencyKey: idempotencyKey || createIdempotencyKey("store-purchase"),
      clientSubmittedAt: clientSubmittedAt || new Date().toISOString()
    });
  }

  async purchaseStoreItem({ storeItemId, itemId, quantity = 1, idempotencyKey }) {
    const quote = await this.quoteStoreItem({ storeItemId, itemId, quantity });
    const purchase = await this.completeStorePurchase({
      quoteId: quote?.quoteId,
      idempotencyKey,
      clientSubmittedAt: new Date().toISOString()
    });
    return { quote, purchase, refreshRequired: purchase?.refreshRequired !== false };
  }

  clearSession() {
    this.config.playerSessionToken = "";
    this.config.gameSessionId = "";
    this.config.playerSessionId = "";
    this.config.accessToken = "";
    this.loadedLazyRoutes.clear();
  }

  async logout() {
    const response = await this.request("logout");
    this.clearSession();
    return response;
  }
}
