export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-21.1" as const;

export const PLAYER_ROUTE_CAPABILITY_KEYS = [
  "dashboard", "news", "market", "portfolio", "business", "contracts",
  "store", "marketplace", "inventory", "crafting", "banking", "loans",
  "messages", "progression", "profile",
] as const;

export const PLAYER_ACTION_CAPABILITY_KEYS = [
  "bankingExport", "bankTransfer", "businessHire", "businessPrice",
  "businessProduction", "chartRange", "contractAccept", "contractSubmit",
  "craftItem", "inventoryUse", "loanApply", "loanRepay", "logout",
  "marketOrder", "marketSearch", "marketWatchlist", "marketplaceCancel",
  "marketplaceListing", "marketplacePurchase", "messageAttachment",
  "messageSearch", "messageSend", "notificationsRead", "progressionClaim",
  "progressionUnlock", "savingsTransfer", "storePurchase",
  "storyDeliveryState",
] as const;

export type PlayerRouteCapabilityKey = typeof PLAYER_ROUTE_CAPABILITY_KEYS[number];
export type PlayerActionCapabilityKey = typeof PLAYER_ACTION_CAPABILITY_KEYS[number];

export type PlayerCapabilityEndpointKey =
  | "bootstrap" | "capabilities" | "banking" | "contractAccept"
  | "contractSubmit" | "contracts" | "countries" | "country" | "dashboard"
  | "inventory" | "inventoryRedemptions" | "logout" | "market"
  | "marketAsset" | "marketOrder" | "marketWatchlist" | "news"
  | "notifications" | "notificationsRead" | "portfolio" | "progression"
  | "progressionUnlock" | "progressionClaim" | "store" | "storeQuote"
  | "storePurchase" | "storyDeliveries" | "storyDeliveryState";

export type PlayerCapabilityHttpMethod = "DELETE" | "GET" | "POST" | "PUT";

export interface PlayerCapabilityEndpointOperation {
  readonly method: PlayerCapabilityHttpMethod;
  readonly pathTemplate: string;
}
export interface PlayerCapabilityEndpointDescriptor {
  readonly key: PlayerCapabilityEndpointKey;
  readonly operations: readonly PlayerCapabilityEndpointOperation[];
  readonly routeCapabilities?: readonly PlayerRouteCapabilityKey[];
  readonly actionCapabilities?: readonly PlayerActionCapabilityKey[];
}
export interface PlayerCapabilityManifest {
  readonly schemaVersion: typeof PLAYER_CAPABILITY_SCHEMA_VERSION;
  readonly manifestVersion: typeof PLAYER_CAPABILITY_MANIFEST_VERSION;
  readonly service: "classroom-api";
  readonly capabilities: {
    readonly routes: Readonly<Record<PlayerRouteCapabilityKey, boolean>>;
    readonly actions: Readonly<Record<PlayerActionCapabilityKey, boolean>>;
  };
  readonly endpoints: readonly {
    readonly key: PlayerCapabilityEndpointKey;
    readonly operations: readonly PlayerCapabilityEndpointOperation[];
  }[];
}
export type PlayerCapabilityManifestResponseBody = { readonly ok: true } & PlayerCapabilityManifest;
export type PlayerCapabilityManifestRoute = { readonly kind: "manifest" } | { readonly kind: "malformed" };

const operation = (method: PlayerCapabilityHttpMethod, pathTemplate: string): PlayerCapabilityEndpointOperation =>
  Object.freeze({ method, pathTemplate });
const endpoint = (
  key: PlayerCapabilityEndpointKey,
  operations: readonly PlayerCapabilityEndpointOperation[],
  routeCapabilities: readonly PlayerRouteCapabilityKey[] = [],
  actionCapabilities: readonly PlayerActionCapabilityKey[] = [],
): PlayerCapabilityEndpointDescriptor => Object.freeze({ key, operations, routeCapabilities, actionCapabilities });

const REVIEWED_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
  endpoint("bootstrap", [operation("GET", "/players/me")], ["profile"]),
  endpoint("capabilities", [operation("GET", "/players/me/capabilities")]),
  endpoint("banking", [operation("GET", "/players/me/ledger")], ["banking"]),
  endpoint("contractAccept", [operation("POST", "/players/me/contracts/:contractKey/accept")], [], ["contractAccept"]),
  endpoint("contractSubmit", [operation("POST", "/players/me/contracts/:contractKey/submit")], [], ["contractSubmit"]),
  endpoint("contracts", [operation("GET", "/players/me/contracts")], ["contracts"]),
  endpoint("countries", [operation("GET", "/players/me/world/countries")]),
  endpoint("country", [operation("GET", "/players/me/world/countries/:countryCode")]),
  endpoint("dashboard", [operation("GET", "/players/me/game/dashboard")], ["dashboard"]),
  endpoint("news", [operation("GET", "/players/me/world/news")], ["news"]),
  endpoint("market", [operation("GET", "/players/me/stocks/assets")], ["market"]),
  endpoint("marketAsset", [operation("GET", "/players/me/stocks/assets/:ticker")], ["market"]),
  endpoint("marketOrder", [operation("POST", "/players/me/stocks/orders")], ["market"], ["marketOrder"]),
  endpoint("marketWatchlist", [
    operation("GET", "/players/me/stocks/watchlist"),
    operation("PUT", "/players/me/stocks/watchlist/:ticker"),
    operation("DELETE", "/players/me/stocks/watchlist/:ticker"),
  ], ["market"], ["marketWatchlist"]),
  endpoint("portfolio", [operation("GET", "/players/me/stocks/portfolio")], ["portfolio"]),
  endpoint("store", [operation("GET", "/players/me/store/items")], ["store"]),
  endpoint("storeQuote", [operation("POST", "/players/me/store/quotes")]),
  endpoint("storePurchase", [
    operation("GET", "/players/me/store/purchases"),
    operation("POST", "/players/me/store/purchases"),
  ], [], ["storePurchase"]),
  endpoint("inventory", [operation("GET", "/players/me/inventory")], ["inventory"]),
  endpoint("inventoryRedemptions", [
    operation("GET", "/players/me/inventory/redemptions"),
    operation("POST", "/players/me/inventory/:itemId/redemptions"),
    operation("GET", "/players/me/inventory/redemptions/:requestId"),
  ], ["inventory"], ["inventoryUse"]),
  endpoint("progression", [operation("GET", "/players/me/progression")], ["progression"]),
  endpoint("progressionUnlock", [
    operation("POST", "/players/me/progression/skills/:skillId/unlock"),
  ], ["progression"], ["progressionUnlock"]),
  endpoint("progressionClaim", [
    operation("POST", "/players/me/progression/rewards/:rewardId/claim"),
  ], ["progression"], ["progressionClaim"]),
  endpoint("notifications", [operation("GET", "/players/me/notifications")]),
  endpoint("notificationsRead", [operation("POST", "/players/me/notifications/read")], [], ["notificationsRead"]),
  endpoint("storyDeliveries", [operation("GET", "/players/me/story-deliveries")]),
  endpoint("storyDeliveryState", [operation("POST", "/players/me/story-deliveries/:deliveryId/state")], [], ["storyDeliveryState"]),
  endpoint("logout", [operation("POST", "/players/me/session/logout")], [], ["logout"]),
] as const;

export function buildPlayerCapabilityManifest(): PlayerCapabilityManifest {
  const routeCapabilities = new Set(REVIEWED_ENDPOINTS.flatMap((item) => item.routeCapabilities ?? []));
  const actionCapabilities = new Set(REVIEWED_ENDPOINTS.flatMap((item) => item.actionCapabilities ?? []));
  return Object.freeze({
    schemaVersion: PLAYER_CAPABILITY_SCHEMA_VERSION,
    manifestVersion: PLAYER_CAPABILITY_MANIFEST_VERSION,
    service: "classroom-api",
    capabilities: Object.freeze({
      routes: capabilityFlags(PLAYER_ROUTE_CAPABILITY_KEYS, routeCapabilities),
      actions: capabilityFlags(PLAYER_ACTION_CAPABILITY_KEYS, actionCapabilities),
    }),
    endpoints: Object.freeze(REVIEWED_ENDPOINTS.map((item) => Object.freeze({
      key: item.key,
      operations: Object.freeze(item.operations.map((entry) => Object.freeze({ ...entry }))),
    }))),
  });
}

function capabilityFlags<TKey extends string>(
  keys: readonly TKey[],
  supported: ReadonlySet<TKey>,
): Readonly<Record<TKey, boolean>> {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, supported.has(key)])) as Record<TKey, boolean>);
}
