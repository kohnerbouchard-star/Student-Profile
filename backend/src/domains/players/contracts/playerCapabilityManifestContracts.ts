export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-07-18.1" as const;

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
] as const;

export type PlayerRouteCapabilityKey =
  typeof PLAYER_ROUTE_CAPABILITY_KEYS[number];
export type PlayerActionCapabilityKey =
  typeof PLAYER_ACTION_CAPABILITY_KEYS[number];

export type PlayerCapabilityEndpointKey =
  | "capabilities"
  | "countries"
  | "country"
  | "inventory"
  | "logout"
  | "market"
  | "marketAsset"
  | "marketWatchlist"
  | "news"
  | "notifications"
  | "notificationsRead";

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
    key: "capabilities",
    operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }],
  },
  {
    key: "countries",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/world/countries",
    }],
  },
  {
    key: "country",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/world/countries/:countryCode",
    }],
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
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/stocks/assets/:ticker",
    }],
    routeCapabilities: ["market"],
  },
  {
    key: "marketWatchlist",
    operations: [
      { method: "GET", pathTemplate: "/players/me/stocks/watchlist" },
      { method: "PUT", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
      {
        method: "DELETE",
        pathTemplate: "/players/me/stocks/watchlist/:ticker",
      },
    ],
    routeCapabilities: ["market"],
    actionCapabilities: ["marketWatchlist"],
  },
  {
    key: "inventory",
    operations: [{ method: "GET", pathTemplate: "/players/me/inventory" }],
    routeCapabilities: ["inventory"],
  },
  {
    key: "notifications",
    operations: [{ method: "GET", pathTemplate: "/players/me/notifications" }],
  },
  {
    key: "notificationsRead",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/notifications/read",
    }],
    actionCapabilities: ["notificationsRead"],
  },
  {
    key: "logout",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/session/logout",
    }],
    actionCapabilities: ["logout"],
  },
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

function capabilityFlags<TKey extends string>(
  keys: readonly TKey[],
  supported: ReadonlySet<TKey>,
): Readonly<Record<TKey, boolean>> {
  return Object.freeze(Object.fromEntries(
    keys.map((key) => [key, supported.has(key)]),
  ) as Record<TKey, boolean>);
}
