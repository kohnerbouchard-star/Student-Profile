export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-21.3" as const;

export const PLAYER_ROUTE_CAPABILITY_KEYS = [
  "dashboard",
  "news",
  "market",
  "portfolio",
  "business",
  "contracts",
  "store",
  "marketplace",
  "inventory",
  "crafting",
  "banking",
  "loans",
  "messages",
  "progression",
  "profile",
] as const;

export const PLAYER_ACTION_CAPABILITY_KEYS = [
  "bankingExport",
  "bankTransfer",
  "businessHire",
  "businessPrice",
  "businessProduction",
  "chartRange",
  "contractAccept",
  "contractSubmit",
  "craftItem",
  "inventoryUse",
  "loanApply",
  "loanRepay",
  "logout",
  "marketOrder",
  "marketSearch",
  "marketWatchlist",
  "marketplaceCancel",
  "marketplaceListing",
  "marketplacePurchase",
  "messageAttachment",
  "messageSearch",
  "messageSend",
  "notificationsRead",
  "progressionClaim",
  "progressionUnlock",
  "savingsTransfer",
  "storePurchase",
  "storyDeliveryState",
] as const;

export type PlayerRouteCapabilityKey =
  typeof PLAYER_ROUTE_CAPABILITY_KEYS[number];
export type PlayerActionCapabilityKey =
  typeof PLAYER_ACTION_CAPABILITY_KEYS[number];

export type PlayerCapabilityEndpointKey =
  | "bootstrap"
  | "capabilities"
  | "banking"
  | "contractAccept"
  | "contractSubmit"
  | "contracts"
  | "countries"
  | "country"
  | "dashboard"
  | "inventory"
  | "inventoryRedemptions"
  | "logout"
  | "market"
  | "marketAsset"
  | "marketOrder"
  | "marketWatchlist"
  | "messages"
  | "messageThread"
  | "messagePolicy"
  | "messageSearch"
  | "messageThreadCreate"
  | "messageSend"
  | "messageRead"
  | "news"
  | "notifications"
  | "notificationsRead"
  | "portfolio"
  | "store"
  | "storeQuote"
  | "storePurchase"
  | "storyDeliveries"
  | "storyDeliveryState";

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

export type PlayerCapabilityManifestResponseBody = {
  readonly ok: true;
} & PlayerCapabilityManifest;

export type PlayerCapabilityManifestRoute =
  | { readonly kind: "manifest" }
  | { readonly kind: "malformed" };

const REVIEWED_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
  endpoint("bootstrap", [["GET", "/players/me"]], ["profile"]),
  endpoint("capabilities", [["GET", "/players/me/capabilities"]]),
  endpoint("banking", [["GET", "/players/me/ledger"]], ["banking"]),
  endpoint(
    "contractAccept",
    [["POST", "/players/me/contracts/:contractKey/accept"]],
    undefined,
    ["contractAccept"],
  ),
  endpoint(
    "contractSubmit",
    [["POST", "/players/me/contracts/:contractKey/submit"]],
    undefined,
    ["contractSubmit"],
  ),
  endpoint("contracts", [["GET", "/players/me/contracts"]], ["contracts"]),
  endpoint("countries", [["GET", "/players/me/world/countries"]]),
  endpoint("country", [["GET", "/players/me/world/countries/:countryCode"]]),
  endpoint("dashboard", [["GET", "/players/me/game/dashboard"]], ["dashboard"]),
  endpoint("news", [["GET", "/players/me/world/news"]], ["news"]),
  endpoint("market", [["GET", "/players/me/stocks/assets"]], ["market"]),
  endpoint("marketAsset", [["GET", "/players/me/stocks/assets/:ticker"]], ["market"]),
  endpoint(
    "marketOrder",
    [["POST", "/players/me/stocks/orders"]],
    ["market"],
    ["marketOrder"],
  ),
  endpoint(
    "marketWatchlist",
    [
      ["GET", "/players/me/stocks/watchlist"],
      ["PUT", "/players/me/stocks/watchlist/:ticker"],
      ["DELETE", "/players/me/stocks/watchlist/:ticker"],
    ],
    ["market"],
    ["marketWatchlist"],
  ),
  endpoint("portfolio", [["GET", "/players/me/stocks/portfolio"]], ["portfolio"]),
  endpoint("store", [["GET", "/players/me/store/items"]], ["store"]),
  endpoint("storeQuote", [["POST", "/players/me/store/quotes"]]),
  endpoint(
    "storePurchase",
    [
      ["GET", "/players/me/store/purchases"],
      ["POST", "/players/me/store/purchases"],
    ],
    undefined,
    ["storePurchase"],
  ),
  endpoint("inventory", [["GET", "/players/me/inventory"]], ["inventory"]),
  endpoint(
    "inventoryRedemptions",
    [
      ["GET", "/players/me/inventory/redemptions"],
      ["POST", "/players/me/inventory/:itemId/redemptions"],
      ["GET", "/players/me/inventory/redemptions/:requestId"],
    ],
    ["inventory"],
    ["inventoryUse"],
  ),
  endpoint("messages", [["GET", "/players/me/messages"]], ["messages"]),
  endpoint(
    "messageThread",
    [["GET", "/players/me/messages/threads/:threadId"]],
    ["messages"],
  ),
  endpoint(
    "messagePolicy",
    [["GET", "/players/me/messages/policy"]],
    ["messages"],
  ),
  endpoint(
    "messageSearch",
    [["GET", "/players/me/messages/search"]],
    ["messages"],
    ["messageSearch"],
  ),
  endpoint(
    "messageThreadCreate",
    [["POST", "/players/me/messages/threads"]],
    ["messages"],
    ["messageSend"],
  ),
  endpoint(
    "messageSend",
    [["POST", "/players/me/messages/threads/:threadId/messages"]],
    ["messages"],
    ["messageSend"],
  ),
  endpoint(
    "messageRead",
    [
      ["POST", "/players/me/messages/read"],
      ["POST", "/players/me/messages/threads/:threadId/read"],
    ],
    ["messages"],
  ),
  endpoint("notifications", [["GET", "/players/me/notifications"]]),
  endpoint(
    "notificationsRead",
    [["POST", "/players/me/notifications/read"]],
    undefined,
    ["notificationsRead"],
  ),
  endpoint("storyDeliveries", [["GET", "/players/me/story-deliveries"]]),
  endpoint(
    "storyDeliveryState",
    [["POST", "/players/me/story-deliveries/:deliveryId/state"]],
    undefined,
    ["storyDeliveryState"],
  ),
  endpoint(
    "logout",
    [["POST", "/players/me/session/logout"]],
    undefined,
    ["logout"],
  ),
] as const;

export function buildPlayerCapabilityManifest(): PlayerCapabilityManifest {
  const routeCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) =>
      descriptor.routeCapabilities ?? []
    ),
  );
  const actionCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) =>
      descriptor.actionCapabilities ?? []
    ),
  );

  return Object.freeze({
    schemaVersion: PLAYER_CAPABILITY_SCHEMA_VERSION,
    manifestVersion: PLAYER_CAPABILITY_MANIFEST_VERSION,
    service: "classroom-api",
    capabilities: Object.freeze({
      routes: capabilityFlags(PLAYER_ROUTE_CAPABILITY_KEYS, routeCapabilities),
      actions: capabilityFlags(
        PLAYER_ACTION_CAPABILITY_KEYS,
        actionCapabilities,
      ),
    }),
    endpoints: Object.freeze(
      REVIEWED_ENDPOINTS.map((descriptor) =>
        Object.freeze({
          key: descriptor.key,
          operations: Object.freeze(descriptor.operations.map((operation) =>
            Object.freeze({ ...operation })
          )),
        })
      ),
    ),
  });
}

function endpoint(
  key: PlayerCapabilityEndpointKey,
  operations: readonly (readonly [PlayerCapabilityHttpMethod, string])[],
  routeCapabilities?: readonly PlayerRouteCapabilityKey[],
  actionCapabilities?: readonly PlayerActionCapabilityKey[],
): PlayerCapabilityEndpointDescriptor {
  return Object.freeze({
    key,
    operations: Object.freeze(
      operations.map(([method, pathTemplate]) =>
        Object.freeze({ method, pathTemplate })
      ),
    ),
    routeCapabilities,
    actionCapabilities,
  });
}

function capabilityFlags<TKey extends string>(
  keys: readonly TKey[],
  supported: ReadonlySet<TKey>,
): Readonly<Record<TKey, boolean>> {
  return Object.freeze(Object.fromEntries(
    keys.map((key) => [key, supported.has(key)]),
  ) as Record<TKey, boolean>);
}
