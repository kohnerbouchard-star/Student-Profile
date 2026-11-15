import type {
  PlayerCapabilityEndpointDescriptor,
} from "./playerCapabilityManifestContracts.ts";

export const GAMEPLAY_CAPABILITY_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
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
] as const;
