export const PLAYER_CAPABILITY_SCHEMA_VERSION = 1 as const;
export const PLAYER_CAPABILITY_MANIFEST_VERSION = "2026-08-31.2" as const;

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
  "bankingFx",
  "loans",
  "messages",
  "progression",
  "profile",
  "world",
] as const;

export const PLAYER_ACTION_CAPABILITY_KEYS = [
  "arrivalClassSubmit",
  "bankingExport",
  "bankingFxCancel",
  "bankingFxInstant",
  "bankingFxQuote",
  "bankingFxStandard",
  "bankTransfer",
  "businessCreate",
  "businessEmployeeTerminate",
  "businessFormationActivate",
  "businessFormationPropose",
  "businessFormationRespond",
  "businessCandidateHire",
  "businessPrice",
  "businessProductCreate",
  "businessProduction",
  "businessStatus",
  "businessTreasuryAccountOpen",
  "businessTreasuryFxCancel",
  "businessTreasuryFxInstant",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
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
  "residencyRequest",
  "savingsTransfer",
  "storePurchase",
  "storyDeliveryState",
  "travelComplete",
  "travelExecute",
  "travelQuote",
] as const;

export type PlayerRouteCapabilityKey =
  typeof PLAYER_ROUTE_CAPABILITY_KEYS[number];
export type PlayerActionCapabilityKey =
  typeof PLAYER_ACTION_CAPABILITY_KEYS[number];

export type PlayerCapabilityEndpointKey =
  | "bootstrap"
  | "capabilities"
  | "arrivalClass"
  | "banking"
  | "bankingFx"
  | "bankingFxHistory"
  | "bankingFxOrders"
  | "bankingFxQuote"
  | "bankingFxStandard"
  | "bankingFxInstant"
  | "bankingFxCancel"
  | "bankTransfer"
  | "business"
  | "businessStoreQuote"
  | "businessStorePurchase"
  | "businessTreasury"
  | "businessTreasuryAccountOpen"
  | "businessTreasuryFxQuote"
  | "businessTreasuryFxStandard"
  | "businessTreasuryFxInstant"
  | "businessTreasuryFxCancel"
  | "businessWorkforce"
  | "businessCreate"
  | "businessFormationActivate"
  | "businessFormationPropose"
  | "businessFormationRespond"
  | "businessCandidateHire"
  | "businessPrice"
  | "businessProductCreate"
  | "businessProduction"
  | "businessManufacturingJobs"
  | "businessManufacturingStart"
  | "businessManufacturingCancel"
  | "businessStatus"
  | "businessTerminate"
  | "contractAccept"
  | "contractSubmit"
  | "contracts"
  | "countries"
  | "country"
  | "dashboard"
  | "inventory"
  | "inventoryRedemptions"
  | "loanApply"
  | "loanRepay"
  | "loans"
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
  | "progression"
  | "progressionUnlock"
  | "progressionClaim"
  | "residencyRequest"
  | "savingsTransfer"
  | "store"
  | "storeQuote"
  | "storePurchase"
  | "storyDeliveries"
  | "storyDeliveryState"
  | "travelComplete"
  | "travelExecute"
  | "travelQuote"
  | "worldRuntime";

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
    key: "worldRuntime",
    operations: [{ method: "GET", pathTemplate: "/players/me/world-runtime" }],
    routeCapabilities: ["world"],
  },
  {
    key: "arrivalClass",
    operations: [{ method: "POST", pathTemplate: "/players/me/arrival-class" }],
    routeCapabilities: ["world"],
    actionCapabilities: ["arrivalClassSubmit"],
  },
  {
    key: "travelQuote",
    operations: [{ method: "POST", pathTemplate: "/players/me/travel/quotes" }],
    routeCapabilities: ["world"],
    actionCapabilities: ["travelQuote"],
  },
  {
    key: "travelExecute",
    operations: [{ method: "POST", pathTemplate: "/players/me/travel" }],
    routeCapabilities: ["world"],
    actionCapabilities: ["travelExecute"],
  },
  {
    key: "travelComplete",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/travel/:journeyId/complete",
    }],
    routeCapabilities: ["world"],
    actionCapabilities: ["travelComplete"],
  },
  {
    key: "residencyRequest",
    operations: [{ method: "POST", pathTemplate: "/players/me/residency" }],
    routeCapabilities: ["world"],
    actionCapabilities: ["residencyRequest"],
  },
  {
    key: "banking",
    operations: [{ method: "GET", pathTemplate: "/players/me/ledger" }],
    routeCapabilities: ["banking"],
  },
  {
    key: "bankingFx",
    operations: [{ method: "GET", pathTemplate: "/players/me/banking/fx" }],
    routeCapabilities: ["banking", "bankingFx"],
  },
  {
    key: "bankingFxHistory",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/banking/fx/history",
    }],
    routeCapabilities: ["banking", "bankingFx"],
  },
  {
    key: "bankingFxOrders",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/banking/fx/orders",
    }],
    routeCapabilities: ["banking", "bankingFx"],
  },
  {
    key: "bankingFxQuote",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/fx/quotes",
    }],
    routeCapabilities: ["banking", "bankingFx"],
    actionCapabilities: ["bankingFxQuote"],
  },
  {
    key: "bankingFxStandard",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/fx/orders/standard",
    }],
    routeCapabilities: ["banking", "bankingFx"],
    actionCapabilities: ["bankingFxStandard"],
  },
  {
    key: "bankingFxInstant",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/fx/orders/instant",
    }],
    routeCapabilities: ["banking", "bankingFx"],
    actionCapabilities: ["bankingFxInstant"],
  },
  {
    key: "bankingFxCancel",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/fx/orders/:orderKey/cancel",
    }],
    routeCapabilities: ["banking", "bankingFx"],
    actionCapabilities: ["bankingFxCancel"],
  },
  {
    key: "bankTransfer",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/transfers",
    }],
    actionCapabilities: ["bankTransfer"],
  },
  {
    key: "savingsTransfer",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/savings/transfers",
    }],
    actionCapabilities: ["savingsTransfer"],
  },
  {
    key: "business",
    operations: [{ method: "GET", pathTemplate: "/players/me/business" }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessTreasury",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/business/treasury",
    }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessTreasuryAccountOpen",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/treasury/accounts",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["businessTreasuryAccountOpen"],
  },
  {
    key: "businessTreasuryFxQuote",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/treasury/fx/quotes",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["businessTreasuryFxQuote"],
  },
  {
    key: "businessTreasuryFxStandard",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/treasury/fx/orders/standard",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["businessTreasuryFxStandard"],
  },
  {
    key: "businessTreasuryFxInstant",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/treasury/fx/orders/instant",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["businessTreasuryFxInstant"],
  },
  {
    key: "businessTreasuryFxCancel",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/treasury/fx/orders/:orderKey/cancel",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["businessTreasuryFxCancel"],
  },
  {
    key: "businessStoreQuote",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/store/quotes",
    }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessStorePurchase",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/store/purchases",
    }],
    routeCapabilities: ["business"],
    actionCapabilities: ["storePurchase"],
  },
  {
    key: "businessWorkforce",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/business/workforce/candidates",
    }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessCreate",
    operations: [{ method: "POST", pathTemplate: "/players/me/businesses" }],
    actionCapabilities: ["businessCreate"],
  },
  {
    key: "businessFormationPropose",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/formations",
    }],
    actionCapabilities: ["businessFormationPropose"],
  },
  {
    key: "businessFormationRespond",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/formations/:formationKey/respond",
    }],
    actionCapabilities: ["businessFormationRespond"],
  },
  {
    key: "businessFormationActivate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/formations/:formationKey/activate",
    }],
    actionCapabilities: ["businessFormationActivate"],
  },

  {
    key: "businessProductCreate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/products",
    }],
    actionCapabilities: ["businessProductCreate"],
  },
  {
    key: "businessProduction",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/production-runs",
    }],
    actionCapabilities: ["businessProduction"],
  },
  {
    key: "businessManufacturingJobs",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/businesses/:businessKey/manufacturing/jobs",
    }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessManufacturingStart",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/businesses/:businessKey/manufacturing/jobs",
    }],
    actionCapabilities: ["businessProduction"],
  },
  {
    key: "businessManufacturingCancel",
    operations: [{
      method: "POST",
      pathTemplate:
        "/players/me/businesses/:businessKey/manufacturing/jobs/:jobKey/cancel",
    }],
    actionCapabilities: ["businessProduction"],
  },
  {
    key: "businessPrice",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/products/:productKey/pricing",
    }],
    actionCapabilities: ["businessPrice"],
  },
  {
    key: "businessCandidateHire",
    operations: [{
      method: "POST",
      pathTemplate:
        "/players/me/business/workforce/candidates/:candidateKey/hire",
    }],
    actionCapabilities: ["businessCandidateHire"],
  },
  {
    key: "businessTerminate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/employees/:employeeKey/terminate",
    }],
    actionCapabilities: ["businessEmployeeTerminate"],
  },
  {
    key: "businessStatus",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/business/status",
    }],
    actionCapabilities: ["businessStatus"],
  },
  {
    key: "loans",
    operations: [{ method: "GET", pathTemplate: "/players/me/banking/loans" }],
    routeCapabilities: ["loans"],
  },
  {
    key: "loanApply",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/loans/applications/:offerKey",
    }],
    actionCapabilities: ["loanApply"],
  },
  {
    key: "loanRepay",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/banking/loans/:loanKey/payments",
    }],
    actionCapabilities: ["loanRepay"],
  },
  {
    key: "contractAccept",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/contracts/:contractKey/accept",
    }],
    actionCapabilities: ["contractAccept"],
  },
  {
    key: "contractSubmit",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/contracts/:contractKey/submit",
    }],
    actionCapabilities: ["contractSubmit"],
  },
  {
    key: "contracts",
    operations: [{ method: "GET", pathTemplate: "/players/me/contracts" }],
    routeCapabilities: ["contracts"],
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
    key: "dashboard",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/game/dashboard",
    }],
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
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/stocks/assets/:ticker",
    }],
    routeCapabilities: ["market"],
  },
  {
    key: "marketOrder",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/stocks/orders",
    }],
    routeCapabilities: ["market"],
    actionCapabilities: ["marketOrder"],
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
    key: "portfolio",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/stocks/portfolio",
    }],
    routeCapabilities: ["portfolio"],
  },
  {
    key: "progression",
    operations: [{ method: "GET", pathTemplate: "/players/me/progression" }],
    routeCapabilities: ["progression"],
  },
  {
    key: "progressionUnlock",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/progression/skills/:skillId/unlock",
    }],
    routeCapabilities: ["progression"],
    actionCapabilities: ["progressionUnlock"],
  },
  {
    key: "progressionClaim",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/progression/rewards/:rewardId/claim",
    }],
    routeCapabilities: ["progression"],
    actionCapabilities: ["progressionClaim"],
  },
  {
    key: "store",
    operations: [{ method: "GET", pathTemplate: "/players/me/store/items" }],
    routeCapabilities: ["store"],
  },
  {
    key: "storeQuote",
    operations: [
      { method: "POST", pathTemplate: "/players/me/store/quotes" },
      { method: "POST", pathTemplate: "/players/me/store/offer-quotes" },
    ],
  },
  {
    key: "storePurchase",
    operations: [
      { method: "GET", pathTemplate: "/players/me/store/purchases" },
      { method: "POST", pathTemplate: "/players/me/store/purchases" },
      { method: "POST", pathTemplate: "/players/me/store/offer-purchases" },
      {
        method: "GET",
        pathTemplate: "/players/me/store/receipts/:receiptKey",
      },
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
      {
        method: "GET",
        pathTemplate: "/players/me/inventory/redemptions",
      },
      {
        method: "POST",
        pathTemplate: "/players/me/inventory/:itemId/redemptions",
      },
      {
        method: "GET",
        pathTemplate: "/players/me/inventory/redemptions/:requestId",
      },
    ],
    routeCapabilities: ["inventory"],
    actionCapabilities: ["inventoryUse"],
  },
  {
    key: "marketplace",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/marketplace/listings",
    }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: [],
  },
  {
    key: "marketplaceListing",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/marketplace/listings",
    }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceListing"],
  },
  {
    key: "marketplaceActivate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/marketplace/listings/:listingId/activate",
    }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceActivate"],
  },
  {
    key: "marketplacePurchase",
    operations: [
      {
        method: "POST",
        pathTemplate: "/players/me/marketplace/listings/:listingId/quotes",
      },
      {
        method: "POST",
        pathTemplate:
          "/players/me/marketplace/reservations/:reservationId/settlements",
      },
    ],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplacePurchase"],
  },
  {
    key: "marketplaceCancel",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/marketplace/listings/:listingId/cancel",
    }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceCancel"],
  },
  {
    key: "marketplaceDispute",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/marketplace/orders/:orderId/disputes",
    }],
    routeCapabilities: ["marketplace"],
    actionCapabilities: ["marketplaceDispute"],
  },
  {
    key: "messages",
    operations: [{ method: "GET", pathTemplate: "/players/me/messages" }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messageThread",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/threads/:threadId",
    }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messagePolicy",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/policy",
    }],
    routeCapabilities: ["messages"],
  },
  {
    key: "messageSearch",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/messages/search",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSearch"],
  },
  {
    key: "messageThreadCreate",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/messages/threads",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSend"],
  },
  {
    key: "messageSend",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/messages/threads/:threadId/messages",
    }],
    routeCapabilities: ["messages"],
    actionCapabilities: ["messageSend"],
  },
  {
    key: "messageRead",
    operations: [
      { method: "POST", pathTemplate: "/players/me/messages/read" },
      {
        method: "POST",
        pathTemplate: "/players/me/messages/threads/:threadId/read",
      },
    ],
    routeCapabilities: ["messages"],
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
    key: "storyDeliveries",
    operations: [{
      method: "GET",
      pathTemplate: "/players/me/story-deliveries",
    }],
  },
  {
    key: "storyDeliveryState",
    operations: [{
      method: "POST",
      pathTemplate: "/players/me/story-deliveries/:deliveryId/state",
    }],
    actionCapabilities: ["storyDeliveryState"],
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
