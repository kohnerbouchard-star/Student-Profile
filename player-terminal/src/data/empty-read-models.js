export function createEmptyReadModels() {
  return {
    session: null,
    dashboard: null,
    capabilities: { routes: { dashboard: true, profile: true }, actions: {} },
    notifications: [],
    countries: [],
    news: { categories: ["All"], selectedId: "", items: [] },
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
      company: { status: "Unavailable", valuation: 0, valuationChange: 0, cashFlow: 0, employees: 0, capacity: 0 },
      operations: { utilization: 0, currentJobs: [], completedThisCycle: 0 },
      products: [],
      suppliers: []
    },
    contracts: { tabs: ["Available", "Active", "Submitted", "Completed"], lifecycle: [], items: [] },
    store: { categories: ["All"], items: [] },
    marketplace: { categories: ["All"], listings: [], myListings: [], feeRate: 0 },
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
      checking: { accountId: "", balance: 0, available: 0 },
      savings: { accountId: "", balance: 0, available: 0, interestRate: 0, interestEarned: 0 },
      creditScore: 0,
      transferLimit: 0,
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
