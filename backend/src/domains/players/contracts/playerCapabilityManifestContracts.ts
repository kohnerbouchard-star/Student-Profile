export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-21.1" as const;

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
  "marketplaceActivate",
  "marketplaceCancel",
  "marketplaceListing",
  "marketplacePurchase",
  "marketplaceDispute",
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
  | "marketplace"
  | "marketplaceActivate"
  | "marketplaceCancel"
  | "marketplaceDispute"
  | "marketplaceListing"
  | "marketplacePurchase"
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
  {
    key: "bootstrap",
    operations: [{ method: "GET", pathTemplate: "/players/me" }],
    routeCapabilities: ["profile"],
  },
  {
    key: "capabilities",
    operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }],
  },
  {
    key: "banking",
    operations: [{ method: "GET", pathTemplate: "/players/me/ledger" }],
    routeCapabilities: ["banking"],
  },
  {
    key: "contractAccept",
    operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/accept" }],
    actionCapabilities: ["contractAccept"],
  },
  {
    key: "contractSubmit",
    operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/submit" }],
    actionCapabilities: ["contractSubmit"],
  },
  {
    key: "contracts",
    operations: [{ method: "GET", pathTemplate: "/players/me/contracts" }],
    routeCapabilities: ["contracts"],
  },
  {
    key: "countries",
    operations: [{ method: "GET", pathTemplate: "/players/me/world/countries" }],
  },
  {
    key: "country",
    operations: [{ method: "GET", pathTemplate: "/players/me/world/countries/:countryCode" }],
  },
  {
    key: "dashboard",
    operations: [{ method: "GET", pathTemplate: "/players/me/game/dashboard" }],
    routeCapabilities: ["dashboard"],
  },
  {
    key: "news",
    operations: [{ method: "GET", pathTemplate: "/players/me/world/news" }],
    routeCapabilities: ["news"],
  },
  {
    key: "market",
    operations: [{ method: "GET", pathTemplate: "/players/me/stocks/assets" }],
    routeCapabilities: ["market"],
  },
  {
    key: "marketAsset",
    operations: [{ method: "GET", pathTemplate: "/players/me/stocks/assets/:ticker" }],
    routeCapabilities: ["market"],
  },
  {
    key: "marketOrder",
    operations: [{ method: "POST", pathTemplate: "/players/me/stocks/orders" }],
    routeCapabilities: ["market"],
    actionCapabilities: ["marketOrder"],
  },
  {
    key: "marketWatchlist",
    operations: [
      { method: "GET", pathTemplate: "/players/me/stocks/watchlist" },
      { method: "PUT", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
      { method: "DELETE", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
    ],
    routeCapabilities: ["market"],
    actionCapabilities: ["marketWatchlist"],
  },
  {
    key: "portfolio",
    operations: [{ method: "GET", pathTemplate: "/players/me/stocks/portfolio" }],
    routeCapabilities: ["portfolio"],
  },
  {
    key: "store",
    operations: [{ method: "GET", pathTemplate: "/players/me/store/items" }],
    routeCapabilities: ["store"],
  },
  {
    key: "storeQuote",
    operations: [{ method: "POST", pathTemplate: "/players/me/store/quotes" }],
  },
  {
    key: "storePurchase",
    operations: [
      { method: "GET", pathTemplate: "/players/me/store/purchases" },
      { method: "POST", pathTemplate: "/players/me/store/purchases" },
    ],
    actionCapabilities: ["storePurchase"],
  },
  {
    key: "inventory",
    operations: [{ method: "GET", pathTemplate: "/players/me/inventory" }],
    routeCapabilities: ["inventory"],
  },
  {
    key: "inventoryRedemptions",
    operations: [
      { method: "GET", pathTemplate: "/players/me/inventory/redemptions" },
      { method: "POST", pathTemplate: "/players/me/inventory/:itemId/redemptions" },
      { method: "GET", pathTemplate: "/players/me/inventory/redemptions/:requestId" },
    ],
    routeCapabilities: ["inventory"],
    actionCapabilities: ["inventoryUse"],
  },
  {
    key: "marketplace",
    operations: [{ method: "GET", pathTemplate: "/players/me/marketplace/listings" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: [],
  },
  {
    key: "marketplaceListing",
    operations: [{ method: "POST", pathTemplate: "/players/me/marketplace/listings" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceListing"],
  },
  {
    key: "marketplaceActivate",
    operations: [{ method: "POST", pathTemplate: "/players/me/marketplace/listings/:listingId/activate" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceActivate"],
  },
  {
    key: "marketplacePurchase",
    operations: [{ method: "POST", pathTemplate: "/players/me/marketplace/listings/:listingId/purchase" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplacePurchase"],
  },
  {
    key: "marketplaceCancel",
    operations: [{ method: "POST", pathTemplate: "/players/me/marketplace/listings/:listingId/cancel" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceCancel"],
  },
  {
    key: "marketplaceDispute",
    operations: [{ method: "POST", pathTemplate: "/players/me/marketplace/orders/:orderId/disputes" }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceDispute"],
  },
  {
    key: "notifications",
    operations: [{ method: "GET", pathTemplate: "/players/me/notifications" }],
  },
  {
    key: "notificationsRead",
    operations: [{ method: "POST", pathTemplate: "/players/me/notifications/read" }],
    actionCapabilities: ["notificationsRead"],
  },
  {
    key: "storyDeliveries",
    operations: [{ method: "GET", pathTemplate: "/players/me/story-deliveries" }],
  },
  {
    key: "storyDeliveryState",
    operations: [{ method: "POST", pathTemplate: "/players/me/story-deliveries/:deliveryId/state" }],
    actionCapabilities: ["storyDeliveryState"],
  },
  {
    key: "logout",
    operations: [{ method: "POST", pathTemplate: "/players/me/session/logout" }],
    actionCapabilities: ["logout"],
  },
] as const;

export function buildPlayerCapabilityManifest(): PlayerCapabilityManifest {
  const routeCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) => descriptor.routeCapabilities ?? []),
  );
  const actionCapabilities = new Set(
    REVIEWED_ENDPOINTS.flatMap((descriptor) => descriptor.actionCapabilities ?? []),
  );

  return Object.freeze({
    schemaVersion: PLAYER_CAPABILITY_SCHEMA_VERSION,
    manifestVersion: PLAYER_CAPABILITY_MANIFEST_VERSION,
    service: "classroom-api",
    capabilities: Object.freeze({
      routes: capabilityFlags(PLAYER_ROUTE_CAPABILITY_KEYS, routeCapabilities),
      actions: capabilityFlags(PLAYER_ACTION_CAPABILITY_KEYS, actionCapabilities),
    }),
    endpoints: Object.freeze(
      REVIEWED_ENDPOINTS.map((descriptor) => Object.freeze({
        key: descriptor.key,
        operations: Object.freeze(descriptor.operations.map((operation) => Object.freeze({ ...operation }))),
      })),
    ),
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
