import type {
  PlayerCapabilityEndpointDescriptor,
} from "./playerCapabilityManifestContracts.ts";

export const WORLD_BANKING_CAPABILITY_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
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
] as const;
