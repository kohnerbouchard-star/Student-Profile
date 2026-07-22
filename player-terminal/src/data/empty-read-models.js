export function createEmptyReadModels() {
  return {
    session: null,
    dashboard: null,
    capabilities: { routes: { dashboard: true, profile: true }, actions: {} },
    resourceStatus: {},
    notifications: [],
    countries: [],
    news: { categories: ["All"], selectedId: "", items: [] },
    worldRuntime: {
      campaign: null,
      arrival: { required: false, questionnaire: null, assignment: null },
      travel: { state: null, activeJourney: null },
      residency: null,
      world: { revision: 0, locations: [], routes: [] }
    },
    market: { status: "UNAVAILABLE", nextClose: "", selectedAssetId: "", sectors: ["All"], assets: [] },
    portfolio: {
      netWorth: 0,
      totalAssets: 0,
      liabilities: 0,
      dailyChange: 0,
      totalGain: 0,
      totalGainPercent: 0,
      history: [],
      allocation: [],
      countryExposure: []
    },
    business: {
      company: {
        name: "Business not configured",
        registration: "",
        status: "Unavailable",
        industry: "Not configured",
        headquarters: "Not configured",
        valuation: 0,
        valuationChange: 0,
        cash: 0,
        revenue: 0,
        margin: 0,
        reputation: 0,
        reputationLabel: "Unavailable",
        summary: "Business information is unavailable."
      },
      operations: {
        employees: 0,
        output: 0,
        backlog: 0,
        capacityUse: 0,
        maxRun: 0,
        capacityNote: "Production capacity is unavailable."
      },
      products: [],
      suppliers: []
    },
    contracts: { tabs: ["Available", "Active", "Submitted", "Completed"], lifecycle: [], items: [] },
    store: { categories: ["All"], items: [] },
    marketplace: {
      configured: false, enabled: false, crossCountryTradingEnabled: false, moderationRequired: false,
      categories: ["All"], volume: 0, activeSellers: 0, feeRate: 0, platformFeeRate: 0,
      taxRate: 0, listingDurationHours: 168, purchaseReservationMinutes: 5,
      disputeWindowDays: 7, disputesEnabled: false, listings: [], myListings: [],
      reservations: [], orders: [], disputes: []
    },
    inventory: { categories: ["All"], items: [], capacityUsed: 0, capacityMax: 0 },
    crafting: {
      workshopLevel: "Unavailable",
      workshopNote: "",
      materialSlotsUsed: 0,
      materialSlotsMax: 0,
      recipes: [],
      queue: []
    },
    banking: {
      checking: { accountId: "", balance: undefined, available: undefined },
      savings: { accountId: "", balance: undefined, available: undefined, interestRate: undefined, interestEarned: undefined },
      creditScore: undefined,
      transferLimit: undefined,
      transactions: []
    },
    loans: {
      creditScore: 0,
      availableCredit: 0,
      outstanding: 0,
      nextPayment: { amount: 0, due: "" },
      onTimeRate: 0,
      paymentsMade: 0,
      offers: [],
      activeLoans: [],
      schedule: []
    },
    messages: { unread: 0, threads: [] },
    progression: {
      playerName: "",
      title: "",
      level: 0,
      xp: 0,
      nextLevelXp: 1,
      reputation: 0,
      skillPoints: 0,
      summary: [],
      milestones: [],
      skills: [],
      achievements: [],
      licenses: []
    }
  };
}
