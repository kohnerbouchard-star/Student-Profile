export type PlayerCapabilityStatus = "connected" | "read_only" | "planned";

export type PlayerAdminSurfaceStatus = "available" | "partial" | "missing";

export interface PlayerCapabilityDomain {
  readonly key: string;
  readonly label: string;
  readonly status: PlayerCapabilityStatus;
  readonly summary: string;
  readonly playerReads: readonly string[];
  readonly playerWrites: readonly string[];
  readonly missingPlayerWrites: readonly string[];
  readonly adminSurface: PlayerAdminSurfaceStatus;
  readonly adminSummary: string;
  readonly implementationPhase: number;
}

export interface PlayerCapabilityManifest {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly summary: {
    readonly connected: number;
    readonly readOnly: number;
    readonly planned: number;
    readonly missingAdminSurfaces: number;
  };
  readonly domains: readonly PlayerCapabilityDomain[];
}

export const PLAYER_CAPABILITY_REGISTRY: readonly PlayerCapabilityDomain[] = Object.freeze([
  {
    key: "session",
    label: "Session and dashboard",
    status: "connected",
    summary: "Player session bootstrap, dashboard hydration, and logout are connected.",
    playerReads: ["session", "dashboard"],
    playerWrites: ["logout"],
    missingPlayerWrites: [],
    adminSurface: "available",
    adminSummary: "Administrator session, game selection, and dashboard surfaces are available.",
    implementationPhase: 0,
  },
  {
    key: "world",
    label: "World and news",
    status: "connected",
    summary: "Country directory, country detail, and public game news are connected.",
    playerReads: ["countries", "country", "news"],
    playerWrites: [],
    missingPlayerWrites: [],
    adminSurface: "partial",
    adminSummary: "Market event controls exist; a consolidated world-policy administration surface is still missing.",
    implementationPhase: 0,
  },
  {
    key: "market",
    label: "Stock market",
    status: "connected",
    summary: "Asset reads, history, portfolio, market orders, and watchlists are connected.",
    playerReads: ["market", "marketAsset", "portfolio"],
    playerWrites: ["marketOrder", "marketWatchlist"],
    missingPlayerWrites: [],
    adminSurface: "available",
    adminSummary: "Asset, event, trade, and market audit surfaces are available.",
    implementationPhase: 0,
  },
  {
    key: "store",
    label: "Store",
    status: "connected",
    summary: "Catalog reads and quote-based, idempotent purchases are connected.",
    playerReads: ["store"],
    playerWrites: ["storeQuote", "storePurchase"],
    missingPlayerWrites: [],
    adminSurface: "available",
    adminSummary: "Catalog creation and Store administration are available.",
    implementationPhase: 0,
  },
  {
    key: "contracts",
    label: "Contracts",
    status: "connected",
    summary: "Contract reads, acceptance, evidence submission, and reward issuance are connected.",
    playerReads: ["contracts"],
    playerWrites: ["contractAccept", "contractSubmit"],
    missingPlayerWrites: [],
    adminSurface: "available",
    adminSummary: "Creation, targeting, submission review, and reward audit surfaces are available.",
    implementationPhase: 0,
  },
  {
    key: "notifications",
    label: "Notifications",
    status: "connected",
    summary: "Player notification delivery reads and bounded mark-read writes are connected.",
    playerReads: ["notifications"],
    playerWrites: ["notificationsRead"],
    missingPlayerWrites: [],
    adminSurface: "partial",
    adminSummary: "Delivery infrastructure exists; authoring and targeting controls are not consolidated in the admin console.",
    implementationPhase: 0,
  },
  {
    key: "inventory",
    label: "Inventory and redemptions",
    status: "connected",
    summary: "Owned inventory, idempotent redemption requests, reservations, review, and fulfillment are connected.",
    playerReads: ["inventory"],
    playerWrites: ["inventoryUse"],
    missingPlayerWrites: [],
    adminSurface: "available",
    adminSummary: "Administrators can inspect, approve, reject, and fulfill inventory redemption requests with audit history.",
    implementationPhase: 1,
  },
  {
    key: "marketplace",
    label: "Player marketplace",
    status: "planned",
    summary: "Listings, inventory reservation, settlement, purchase, and cancellation are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: [
      "marketplace",
      "marketplacePurchase",
      "marketplaceListing",
      "marketplaceCancel",
    ],
    adminSurface: "partial",
    adminSummary: "The current admin Marketplace view is read-only and needs moderation, fee policy, dispute, and settlement controls.",
    implementationPhase: 2,
  },
  {
    key: "business",
    label: "Player businesses",
    status: "planned",
    summary: "Company profiles, production runs, product pricing, staffing, and suppliers are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: ["business", "businessProduction", "businessPrice", "businessHire"],
    adminSurface: "missing",
    adminSummary: "Business templates, approvals, production policy, staffing rules, and intervention controls are required.",
    implementationPhase: 3,
  },
  {
    key: "crafting",
    label: "Crafting",
    status: "planned",
    summary: "Recipes, ingredient consumption, queues, and item output are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: ["crafting", "craftItem"],
    adminSurface: "missing",
    adminSummary: "Recipe publishing, unlock policy, queue monitoring, and rollback controls are required.",
    implementationPhase: 3,
  },
  {
    key: "banking",
    label: "Banking and transfers",
    status: "read_only",
    summary: "The authoritative ledger is connected; savings and player transfers are not configured.",
    playerReads: ["banking"],
    playerWrites: [],
    missingPlayerWrites: ["bankTransfer", "savingsTransfer"],
    adminSurface: "partial",
    adminSummary: "Ledger adjustment exists; account policy, transfer review, limits, and exception handling are required.",
    implementationPhase: 4,
  },
  {
    key: "lending",
    label: "Loans and credit",
    status: "planned",
    summary: "Eligibility, applications, facilities, repayment schedules, and payments are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: ["loans", "loanApply", "loanRepay"],
    adminSurface: "missing",
    adminSummary: "Credit policy, application review, approval, repayment, delinquency, and forgiveness controls are required.",
    implementationPhase: 4,
  },
  {
    key: "messages",
    label: "Messages",
    status: "planned",
    summary: "Auditable message threads and player message sending are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: ["messages", "messageSend"],
    adminSurface: "missing",
    adminSummary: "Thread visibility, moderation, retention, attachments, and reporting controls are required.",
    implementationPhase: 5,
  },
  {
    key: "progression",
    label: "Progression",
    status: "planned",
    summary: "XP, levels, skills, achievements, licenses, unlocks, and reward claims are not connected.",
    playerReads: [],
    playerWrites: [],
    missingPlayerWrites: ["progression", "progressionUnlock", "progressionClaim"],
    adminSurface: "missing",
    adminSummary: "Progression rules, award policy, overrides, reversals, and audit controls are required.",
    implementationPhase: 5,
  },
]);

export function buildPlayerCapabilityManifest(
  generatedAt = new Date().toISOString(),
): PlayerCapabilityManifest {
  return {
    schemaVersion: 1,
    generatedAt,
    summary: {
      connected: PLAYER_CAPABILITY_REGISTRY.filter((domain) => domain.status === "connected").length,
      readOnly: PLAYER_CAPABILITY_REGISTRY.filter((domain) => domain.status === "read_only").length,
      planned: PLAYER_CAPABILITY_REGISTRY.filter((domain) => domain.status === "planned").length,
      missingAdminSurfaces: PLAYER_CAPABILITY_REGISTRY.filter((domain) => domain.adminSurface === "missing").length,
    },
    domains: PLAYER_CAPABILITY_REGISTRY,
  };
}
