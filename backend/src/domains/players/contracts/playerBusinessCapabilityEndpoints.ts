import type {
  PlayerCapabilityEndpointDescriptor,
} from "./playerCapabilityManifestContracts.ts";

export const BUSINESS_CAPABILITY_ENDPOINTS: readonly PlayerCapabilityEndpointDescriptor[] = [
  {
    key: "business",
    operations: [{ method: "GET", pathTemplate: "/players/me/business" }],
    routeCapabilities: ["business"],
  },
  {
    key: "businessIpos",
    operations: [{ method: "GET", pathTemplate: "/players/me/business/ipos" }],
    routeCapabilities: ["business", "market"],
  },
  {
    key: "businessIpoPropose",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/ipos/proposals" }],
    routeCapabilities: ["business", "market"],
    actionCapabilities: ["businessIpoPropose"],
  },
  {
    key: "businessIpoVote",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/ipos/:ipoKey/votes" }],
    routeCapabilities: ["business", "market"],
    actionCapabilities: ["businessIpoVote"],
  },
  {
    key: "businessIpoSubscribe",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/ipos/:ipoKey/subscriptions" }],
    routeCapabilities: ["business", "market"],
    actionCapabilities: ["businessIpoSubscribe"],
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
    key: "businessEquipmentInstall",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/equipment/install" }],
    actionCapabilities: ["businessEquipmentInstall"],
  },
  {
    key: "businessStoreOfferCreate",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/store/offers" }],
    actionCapabilities: ["businessStoreOfferCreate"],
  },
  {
    key: "businessStoreOfferPublish",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/store/offers/:offerKey/publish" }],
    actionCapabilities: ["businessStoreOfferPublish"],
  },
  {
    key: "businessStoreOfferStock",
    operations: [{ method: "POST", pathTemplate: "/players/me/business/store/offers/:offerKey/stock" }],
    actionCapabilities: ["businessStoreOfferStock"],
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
] as const;
