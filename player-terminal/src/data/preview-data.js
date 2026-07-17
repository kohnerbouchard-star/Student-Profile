export const previewData = Object.freeze({
  session: {
    playerId: "EN-2048-117",
    displayName: "Avery Rowan",
    initials: "AR",
    gameSessionId: "preview-game-session",
    gameName: "Econovaria: Celestial Markets",
    gameCode: "ECO-731",
    status: "LIVE",
    countryId: "eldoran",
    countryName: "Eldoran",
    capital: "Crescent Bay",
    currencyCode: "ELD",
    currencyName: "Lapis",
    currencySymbolAsset: "./assets/currency-symbols/lapis_lazuli.svg",
    rank: 12,
    level: 7,
    xp: 6840,
    nextLevelXp: 8000
  },
  dashboard: {
    netWorth: 148250,
    liquidBalance: 32680,
    savingsBalance: 18400,
    portfolioValue: 83240,
    inventoryValue: 13930,
    liabilities: 0,
    dailyChange: 2.84,
    contractsActive: 3,
    contractsDueSoon: 1,
    unreadNotifications: 4,
    marketStatus: "OPEN",
    economyPhase: "Expansion",
    inflationRate: 2.7,
    baseRate: 4.25,
    countryScore: 78,
    marketPulse: [
      { symbol: "NOVA", price: 184.22, change: 2.48 },
      { symbol: "AURX", price: 92.14, change: -0.61 },
      { symbol: "THR", price: 41.08, change: 1.12 },
      { symbol: "SYN", price: 276.9, change: 3.06 },
      { symbol: "VAL", price: 118.54, change: -1.42 },
      { symbol: "XAL", price: 64.72, change: 0.88 }
    ],
    worldEvents: [
      { id: "news-1", title: "Celestial shipping lanes stabilize", region: "Solvend", impact: "Logistics costs easing", tone: "good" },
      { id: "news-2", title: "Energy demand accelerates", region: "Dravenlok", impact: "Industrial equities rising", tone: "warn" },
      { id: "news-3", title: "Currency intervention announced", region: "Yrethia", impact: "Foreign exchange volatility", tone: "purple" }
    ]
  },
  countries: [
    { id: "northreach", name: "Northreach", capital: "Frostgate", x: 29, y: 20, tone: "purple", market: "Technology", condition: "Growing", index: 112.4, growth: 3.8, inflation: 1.9, unemployment: 4.3, baseRate: 3.5, currencyTrend: 1.6, stability: 81, risk: "Moderate", resources: ["Rare minerals", "Cold-climate computing"], exports: ["Processors", "Research equipment"], tradePartners: ["Solvend", "Eldoran"], policy: "Innovation credits remain active.", relatedAssetIds: ["nova"], eventIds: [] },
    { id: "yrethia", name: "Yrethia", capital: "Sableport", x: 17, y: 39, tone: "cyan", market: "Maritime", condition: "Stable", index: 98.7, growth: 1.7, inflation: 3.4, unemployment: 5.8, baseRate: 5.25, currencyTrend: -1.8, stability: 73, risk: "Moderate", resources: ["Fisheries", "Deep-water ports"], exports: ["Freight services", "Marine equipment"], tradePartners: ["Thaloris", "Valerion"], policy: "Central bank intervention is limiting currency losses.", relatedAssetIds: ["aurx"], eventIds: ["news-3"] },
    { id: "thaloris", name: "Thaloris", capital: "Dusk Harbor", x: 20, y: 68, tone: "amber", market: "Energy", condition: "Expanding", index: 127.9, growth: 4.9, inflation: 4.6, unemployment: 3.1, baseRate: 5.75, currencyTrend: 2.2, stability: 77, risk: "Elevated", resources: ["Natural gas", "Thermal energy"], exports: ["Energy cells", "Fuel contracts"], tradePartners: ["Dravenlok", "Yrethia"], policy: "Export quotas are under review.", relatedAssetIds: ["thr"], eventIds: [] },
    { id: "solvend", name: "Solvend", capital: "Aurora Spire", x: 49, y: 24, tone: "cyan", market: "Research", condition: "Volatile", index: 103.1, growth: 2.9, inflation: 2.2, unemployment: 4.7, baseRate: 4.0, currencyTrend: 0.4, stability: 84, risk: "Moderate", resources: ["Scientific talent", "Orbital logistics"], exports: ["Research services", "Navigation systems"], tradePartners: ["Northreach", "Eldoran"], policy: "Shipping insurance requirements were reduced.", relatedAssetIds: ["nova", "aurx"], eventIds: ["news-1"] },
    { id: "eldoran", name: "Eldoran", capital: "Crescent Bay", x: 51, y: 40, tone: "green", market: "Finance", condition: "Expanding", index: 121.6, growth: 4.1, inflation: 2.7, unemployment: 3.8, baseRate: 4.25, currencyTrend: 1.1, stability: 88, risk: "Low", resources: ["Financial capital", "Commercial data"], exports: ["Banking services", "Insurance"], tradePartners: ["Solvend", "Valerion", "Northreach"], policy: "Business credit conditions remain supportive.", relatedAssetIds: ["aurx", "nova"], eventIds: ["news-4"] },
    { id: "valerion", name: "Valerion", capital: "Glassfall", x: 51, y: 59, tone: "cyan", market: "Manufacturing", condition: "Stable", index: 107.8, growth: 2.4, inflation: 2.9, unemployment: 4.9, baseRate: 4.5, currencyTrend: -0.2, stability: 80, risk: "Moderate", resources: ["Industrial labor", "Glass composites"], exports: ["Machinery", "Construction systems"], tradePartners: ["Eldoran", "Dravenlok"], policy: "Factory modernization grants continue.", relatedAssetIds: ["val"], eventIds: ["news-5"] },
    { id: "lumenor", name: "Lumenor", capital: "Starfall", x: 51, y: 80, tone: "cyan", market: "Services", condition: "Recovering", index: 95.2, growth: 1.2, inflation: 1.5, unemployment: 6.2, baseRate: 3.25, currencyTrend: 0.7, stability: 79, risk: "Moderate", resources: ["Tourism", "Education services"], exports: ["Training", "Hospitality"], tradePartners: ["Eldoran", "Syndalis"], policy: "Recovery support remains targeted at small firms.", relatedAssetIds: ["syn"], eventIds: [] },
    { id: "xalvoria", name: "Xalvoria", capital: "Emberhall", x: 75, y: 20, tone: "amber", market: "Capital Goods", condition: "Growing", index: 116.3, growth: 3.6, inflation: 3.1, unemployment: 4.1, baseRate: 4.75, currencyTrend: 1.3, stability: 82, risk: "Moderate", resources: ["Machine tooling", "Engineering talent"], exports: ["Factory equipment", "Transport systems"], tradePartners: ["Dravenlok", "Northreach"], policy: "Accelerated depreciation is supporting investment.", relatedAssetIds: ["xal"], eventIds: [] },
    { id: "dravenlok", name: "Dravenlok", capital: "Ironhold", x: 84, y: 40, tone: "red", market: "Heavy Industry", condition: "Overheating", index: 132.5, growth: 6.3, inflation: 7.8, unemployment: 2.6, baseRate: 7.0, currencyTrend: 2.9, stability: 69, risk: "High", resources: ["Iron ore", "Industrial energy"], exports: ["Steel", "Heavy equipment"], tradePartners: ["Thaloris", "Xalvoria", "Valerion"], policy: "Price controls are being considered for strategic materials.", relatedAssetIds: ["thr", "val", "xal"], eventIds: ["news-2", "news-5"] },
    { id: "syndalis", name: "Syndalis", capital: "Blacklight", x: 76, y: 62, tone: "purple", market: "Media", condition: "Expanding", index: 124.1, growth: 4.5, inflation: 2.4, unemployment: 3.6, baseRate: 3.75, currencyTrend: 1.9, stability: 76, risk: "Moderate", resources: ["Creative talent", "Broadcast infrastructure"], exports: ["Media rights", "Advertising services"], tradePartners: ["Lumenor", "Eldoran"], policy: "Digital export rebates remain in effect.", relatedAssetIds: ["syn"], eventIds: ["news-6"] }
  ],
  news: {
    categories: ["All", "World", "Markets", "Policy", "Contracts"],
    selectedId: "news-1",
    items: [
      { id: "news-1", category: "World", severity: "Medium", tone: "good", time: "12 min ago", title: "Celestial shipping lanes stabilize", summary: "Insurance costs and transit delays are easing after Solvend reopened two priority navigation corridors.", analysis: "Lower freight costs should support manufacturers and retailers that depend on imported components. The immediate effect is positive for Valerion Industrial and moderately positive for Eldoran finance activity.", countryIds: ["solvend", "valerion", "eldoran"], assetIds: ["val", "aurx"], effects: ["Freight costs ↓", "Delivery reliability ↑", "Industrial margins ↑"] },
      { id: "news-2", category: "Markets", severity: "High", tone: "warn", time: "28 min ago", title: "Dravenlok energy demand accelerates", summary: "Steel mills increased energy purchases after industrial output exceeded projections for a third consecutive week.", analysis: "Energy producers benefit in the short term, while downstream manufacturers face higher input costs. Continued overheating may trigger a policy response or rate increase.", countryIds: ["dravenlok", "thaloris", "valerion"], assetIds: ["thr", "val", "xal"], effects: ["Energy demand ↑", "Steel costs ↑", "Rate risk ↑"] },
      { id: "news-3", category: "Policy", severity: "Medium", tone: "purple", time: "46 min ago", title: "Yrethia announces currency intervention", summary: "The monetary authority began limited purchases of the Yrethian currency after a week of elevated volatility.", analysis: "The intervention may reduce imported inflation but could pressure foreign reserves if market confidence does not improve.", countryIds: ["yrethia"], assetIds: ["aurx"], effects: ["Currency volatility ↓", "Reserve use ↑", "Import prices stabilize"] },
      { id: "news-4", category: "Policy", severity: "Low", tone: "good", time: "1 hr ago", title: "Eldoran maintains supportive credit policy", summary: "The central bank held its base rate at 4.25% and retained small-business lending incentives.", analysis: "Stable funding costs support banks, contract issuers, and domestic investment. The decision was broadly expected.", countryIds: ["eldoran"], assetIds: ["aurx", "nova"], effects: ["Credit conditions stable", "Investment supported", "Currency steady"] },
      { id: "news-5", category: "World", severity: "Medium", tone: "warn", time: "2 hr ago", title: "Industrial alloy prices rise across Valerion", summary: "Refined alloy prices rose after Dravenlok suppliers prioritized domestic buyers.", analysis: "Valerion manufacturers may face lower margins until alternative suppliers become available. Inventory-heavy players could benefit from higher resale values later.", countryIds: ["valerion", "dravenlok"], assetIds: ["val", "xal"], effects: ["Alloy prices ↑", "Manufacturing margins ↓", "Inventory values ↑"] },
      { id: "news-6", category: "Contracts", severity: "Low", tone: "cyan", time: "3 hr ago", title: "Syndalis media authority issues research contracts", summary: "New market-sentiment contracts are available to players with current economic research access.", analysis: "This event creates a direct earning opportunity rather than a broad market shock.", countryIds: ["syndalis", "solvend"], assetIds: ["syn"], effects: ["New contracts", "Research demand ↑", "Media activity ↑"] }
    ]
  },
  market: {
    status: "OPEN",
    nextClose: "02:14:38",
    selectedAssetId: "nova",
    sectors: ["All", "Technology", "Energy", "Finance", "Industry", "Consumer"],
    assets: [
      { id: "nova", symbol: "NOVA", name: "Novaria Systems", type: "Stock", sector: "Technology", countryId: "northreach", price: 184.22, open: 180.1, dayHigh: 186.4, dayLow: 178.8, change: 2.48, volume: 842100, marketCap: 18400000000, pe: 24.8, yield: 0.8, risk: "Medium", outlook: "Positive", watchlisted: true, owned: 120, averageCost: 161.4, history: [146,151,149,156,161,158,166,169,174,171,179,184], newsIds: ["news-4"] },
      { id: "aurx", symbol: "AURX", name: "Aurora Exchange", type: "Stock", sector: "Finance", countryId: "eldoran", price: 92.14, open: 92.7, dayHigh: 94.2, dayLow: 91.5, change: -0.61, volume: 441200, marketCap: 9200000000, pe: 18.2, yield: 1.4, risk: "Low", outlook: "Stable", watchlisted: true, owned: 80, averageCost: 89.6, history: [81,84,87,90,94,96,93,91,95,94,93,92], newsIds: ["news-1", "news-3", "news-4"] },
      { id: "thr", symbol: "THR", name: "Thaloris Energy", type: "Stock", sector: "Energy", countryId: "thaloris", price: 41.08, open: 40.62, dayHigh: 42.1, dayLow: 40.1, change: 1.12, volume: 1215400, marketCap: 4100000000, pe: 11.6, yield: 3.8, risk: "High", outlook: "Positive", watchlisted: false, owned: 200, averageCost: 37.25, history: [31,32,34,33,35,37,36,38,39,40,39,41], newsIds: ["news-2"] },
      { id: "syn", symbol: "SYN", name: "Syndalis Media Grid", type: "Stock", sector: "Consumer", countryId: "syndalis", price: 276.9, open: 268.7, dayHigh: 279.3, dayLow: 266.4, change: 3.06, volume: 285600, marketCap: 27700000000, pe: 31.4, yield: 0.2, risk: "High", outlook: "Positive", watchlisted: false, owned: 0, averageCost: 0, history: [211,219,225,233,228,239,247,252,260,258,269,277], newsIds: ["news-6"] },
      { id: "val", symbol: "VAL", name: "Valerion Industrial", type: "Stock", sector: "Industry", countryId: "valerion", price: 118.54, open: 120.25, dayHigh: 121.2, dayLow: 117.8, change: -1.42, volume: 618300, marketCap: 11900000000, pe: 16.7, yield: 2.1, risk: "Medium", outlook: "Cautious", watchlisted: true, owned: 75, averageCost: 109.2, history: [103,108,112,116,121,124,120,123,121,120,120,119], newsIds: ["news-1", "news-2", "news-5"] },
      { id: "xal", symbol: "XAL", name: "Xalvoria Works", type: "Stock", sector: "Industry", countryId: "xalvoria", price: 64.72, open: 64.15, dayHigh: 65.4, dayLow: 63.7, change: 0.88, volume: 953900, marketCap: 6500000000, pe: 14.3, yield: 2.9, risk: "Medium", outlook: "Stable", watchlisted: false, owned: 150, averageCost: 61.0, history: [52,54,55,58,57,60,62,61,63,62,64,65], newsIds: ["news-2", "news-5"] },
      { id: "cel-index", symbol: "CELEST", name: "Celestial Composite", type: "Index", sector: "All", countryId: "all", price: 1248.62, open: 1231.87, dayHigh: 1252.2, dayLow: 1228.4, change: 1.36, volume: 0, marketCap: 0, pe: 0, yield: 0, risk: "Medium", outlook: "Positive", watchlisted: true, owned: 0, averageCost: 0, history: [1120,1138,1152,1168,1181,1174,1192,1204,1218,1226,1232,1249], newsIds: ["news-1", "news-2", "news-4"] }
    ]
  },
  portfolio: {
    netWorth: 148250,
    totalAssets: 148250,
    liabilities: 0,
    dailyChange: 2.84,
    totalGain: 12283.5,
    totalGainPercent: 17.35,
    history: [118400,120800,119900,124600,127100,130900,129700,134200,137800,141500,144300,148250],
    allocation: [
      { id: "equities", label: "Equities", value: 83240, percent: 56.1, tone: "cyan" },
      { id: "cash", label: "Checking", value: 32680, percent: 22.0, tone: "green" },
      { id: "savings", label: "Savings", value: 18400, percent: 12.4, tone: "purple" },
      { id: "inventory", label: "Inventory", value: 13930, percent: 9.4, tone: "amber" }
    ],
    countryExposure: [
      { countryId: "thaloris", value: 8216, percent: 28.4 },
      { countryId: "northreach", value: 22106.4, percent: 26.6 },
      { countryId: "xalvoria", value: 9708, percent: 18.1 },
      { countryId: "eldoran", value: 7371.2, percent: 14.7 },
      { countryId: "valerion", value: 8890.5, percent: 12.2 }
    ]
  },
  store: {
    categories: ["All", "Equipment", "Materials", "Consumables", "Access"],
    items: [
      { id: "market-lens", name: "Market Lens", category: "Equipment", price: 2400, stock: 8, owned: 1, image: "./assets/store-items/market-lens.svg", description: "Unlocks expanded market intelligence for one cycle." },
      { id: "logistics-scanner", name: "Logistics Scanner", category: "Equipment", price: 1800, stock: 12, owned: 0, image: "./assets/store-items/logistics-scanner.svg", description: "Improves supply-chain contract visibility." },
      { id: "refined-alloy", name: "Refined Alloy Bundle", category: "Materials", price: 640, stock: 42, owned: 4, image: "./assets/store-items/refined-alloy-bundle.svg", description: "Industrial input used in fabrication contracts." },
      { id: "energy-cell", name: "Energy Cell Pack", category: "Materials", price: 420, stock: 65, owned: 8, image: "./assets/store-items/energy-cell-pack.svg", description: "Portable energy units used across the economy." },
      { id: "repair-kit", name: "Emergency Repair Kit", category: "Consumables", price: 950, stock: 15, owned: 2, image: "./assets/store-items/emergency-repair-kit.svg", description: "Reduces penalties from one equipment failure." },
      { id: "priority-token", name: "Priority Processing Token", category: "Consumables", price: 1200, stock: 6, owned: 0, image: "./assets/store-items/priority-processing-token.svg", description: "Accelerates one eligible contract submission." },
      { id: "field-permit", name: "Field Permit", category: "Access", price: 3200, stock: 3, owned: 0, image: "./assets/store-items/field-permit.svg", description: "Grants access to restricted regional contracts." },
      { id: "workshop-pass", name: "Workshop Access Pass", category: "Access", price: 1600, stock: 10, owned: 1, image: "./assets/store-items/workshop-access-pass.svg", description: "Allows entry to one advanced workshop session." }
    ]
  },
  contracts: {
    tabs: ["Active", "Available", "Submitted", "Completed"],
    lifecycle: ["Available", "Active", "Submitted", "Completed"],
    items: [
      { id: "ctr-101", status: "Active", title: "Regional Supply Forecast", issuer: "Eldoran Commerce Authority", location: "Eldoran", due: "Today · 16:00", urgency: "high", rewardCash: 4200, rewardXp: 650, progress: 72, objective: "Analyze recent price changes and submit a one-page supply forecast.", requirements: ["PDF or document link", "Three evidence points", "One risk scenario"], timeline: [{ label: "Accepted", time: "Jul 14 · 09:10", complete: true }, { label: "Work in progress", time: "Current stage", complete: true }, { label: "Submit for review", time: "Pending", complete: false }, { label: "Reward issued", time: "Pending", complete: false }] },
      { id: "ctr-102", status: "Active", title: "Cross-Border Pricing Audit", issuer: "Celestial Trade Council", location: "All Nations", due: "Tomorrow · 12:00", urgency: "medium", rewardCash: 6100, rewardXp: 900, progress: 35, objective: "Compare final consumer prices across three countries and explain the largest variance.", requirements: ["Three-country comparison", "Tax and tariff notes", "Recommendation"], timeline: [{ label: "Accepted", time: "Jul 14 · 13:40", complete: true }, { label: "Work in progress", time: "Current stage", complete: true }, { label: "Submit for review", time: "Pending", complete: false }, { label: "Reward issued", time: "Pending", complete: false }] },
      { id: "ctr-103", status: "Active", title: "Inventory Reconciliation", issuer: "Crescent Bay Logistics", location: "Eldoran", due: "3 days", urgency: "low", rewardCash: 2600, rewardXp: 420, progress: 10, objective: "Reconcile warehouse inventory against the provided transaction ledger.", requirements: ["Completed worksheet", "Variance explanation"], timeline: [{ label: "Accepted", time: "Jul 15 · 08:35", complete: true }, { label: "Work in progress", time: "Current stage", complete: true }, { label: "Submit for review", time: "Pending", complete: false }, { label: "Reward issued", time: "Pending", complete: false }] },
      { id: "ctr-201", status: "Available", title: "Market Sentiment Brief", issuer: "Aurora Exchange", location: "Solvend", due: "5 days", urgency: "low", rewardCash: 3800, rewardXp: 540, progress: 0, objective: "Summarize current market sentiment using at least two indicators.", requirements: ["Two indicators", "150–250 words"], timeline: [{ label: "Available", time: "Open now", complete: true }, { label: "Accept contract", time: "Pending", complete: false }, { label: "Submit for review", time: "Pending", complete: false }, { label: "Reward issued", time: "Pending", complete: false }] },
      { id: "ctr-202", status: "Available", title: "Energy Shock Response", issuer: "Thaloris Energy Board", location: "Thaloris", due: "4 days", urgency: "medium", rewardCash: 5200, rewardXp: 780, progress: 0, objective: "Propose a business response to an unexpected increase in energy costs.", requirements: ["Cost impact", "Pricing response", "Operational response"], timeline: [{ label: "Available", time: "Open now", complete: true }, { label: "Accept contract", time: "Pending", complete: false }, { label: "Submit for review", time: "Pending", complete: false }, { label: "Reward issued", time: "Pending", complete: false }] },
      { id: "ctr-250", status: "Submitted", title: "Consumer Confidence Snapshot", issuer: "Eldoran Civic Bank", location: "Eldoran", due: "Submitted Jul 15", urgency: "review", rewardCash: 4700, rewardXp: 620, progress: 100, objective: "Explain recent consumer-confidence movement and identify one business implication.", requirements: ["250-word brief", "One chart", "One recommendation"], submission: { time: "Jul 15 · 14:26", url: "https://example.com/submission", note: "Brief and chart submitted for review." }, timeline: [{ label: "Accepted", time: "Jul 13 · 10:20", complete: true }, { label: "Work completed", time: "Jul 15 · 14:10", complete: true }, { label: "Submitted for review", time: "Jul 15 · 14:26", complete: true }, { label: "Reward issued", time: "Awaiting review", complete: false }] },
      { id: "ctr-301", status: "Completed", title: "Household Budget Model", issuer: "Eldoran Civic Bank", location: "Eldoran", due: "Completed Jul 11", urgency: "complete", rewardCash: 3100, rewardXp: 500, progress: 100, objective: "Create a balanced monthly household budget.", requirements: ["Completed"], timeline: [{ label: "Accepted", time: "Jul 9 · 11:04", complete: true }, { label: "Work completed", time: "Jul 11 · 13:20", complete: true }, { label: "Approved", time: "Jul 11 · 15:02", complete: true }, { label: "Reward issued", time: "Jul 11 · 15:03", complete: true }] }
    ]
  },
  inventory: {
    capacityUsed: 21,
    capacityMax: 40,
    categories: ["All", "Equipment", "Materials", "Consumables", "Access"],
    items: [
      { id: "inv-market-lens", storeItemId: "market-lens", name: "Market Lens", category: "Equipment", quantity: 1, value: 2400, state: "Equipped", image: "./assets/store-items/market-lens.svg", description: "Expanded market intelligence module." },
      { id: "inv-alloy", storeItemId: "refined-alloy", name: "Refined Alloy Bundle", category: "Materials", quantity: 4, value: 2560, state: "Stored", image: "./assets/store-items/refined-alloy-bundle.svg", description: "Industrial fabrication input." },
      { id: "inv-energy", storeItemId: "energy-cell", name: "Energy Cell Pack", category: "Materials", quantity: 8, value: 3360, state: "Stored", image: "./assets/store-items/energy-cell-pack.svg", description: "Portable energy units." },
      { id: "inv-repair", storeItemId: "repair-kit", name: "Emergency Repair Kit", category: "Consumables", quantity: 2, value: 1900, state: "Ready", image: "./assets/store-items/emergency-repair-kit.svg", description: "Single-use equipment protection." },
      { id: "inv-workshop", storeItemId: "workshop-pass", name: "Workshop Access Pass", category: "Access", quantity: 1, value: 1600, state: "Ready", image: "./assets/store-items/workshop-access-pass.svg", description: "Access to one advanced workshop." },
      { id: "inv-data", storeItemId: "data-chip", name: "Encrypted Data Chip", category: "Equipment", quantity: 1, value: 2110, state: "Stored", image: "./assets/store-items/data-chip.svg", description: "Carries contract intelligence." }
    ]
  },
  banking: {
    checking: { accountId: "CHK-7741", balance: 32680, available: 32680, pending: 0 },
    savings: { accountId: "SVG-2048", balance: 18400, available: 18400, interestRate: 3.25, interestEarned: 248.2 },
    creditScore: 742,
    transferLimit: 10000,
    transactions: [
      { id: "txn-1", date: "Jul 15 · 10:42", description: "Contract reward · Market Analysis", category: "Contract", amount: 4200, status: "Posted" },
      { id: "txn-2", date: "Jul 15 · 09:18", description: "Stock purchase · NOVA × 20", category: "Market", amount: -3640, status: "Posted" },
      { id: "txn-3", date: "Jul 14 · 16:31", description: "Transfer to savings", category: "Transfer", amount: -2500, status: "Posted" },
      { id: "txn-4", date: "Jul 14 · 13:05", description: "Store purchase · Repair Kit", category: "Store", amount: -950, status: "Posted" },
      { id: "txn-5", date: "Jul 13 · 11:14", description: "Savings interest", category: "Interest", amount: 18.4, status: "Posted" },
      { id: "txn-6", date: "Jul 12 · 15:44", description: "Contract reward · Pricing Audit", category: "Contract", amount: 6100, status: "Posted" }
    ]
  },
  business: {
    company: { name: "Crescent Dynamics", registration: "ELD-BIZ-4418", status: "Operating", industry: "Precision Manufacturing", headquarters: "Crescent Bay, Eldoran", valuation: 84600, valuationChange: 4.2, cash: 12600, revenue: 18420, margin: 18.6, reputation: 74, reputationLabel: "Trusted supplier", summary: "A compact player-owned manufacturer producing logistics and analytical equipment for regional buyers." },
    operations: { employees: 8, output: 146, backlog: 34, capacityUse: 78, maxRun: 50, capacityNote: "Current staffing can support one additional standard production run without overtime." },
    products: [
      { id: "prod-scanner", name: "Logistics Scanner", category: "Equipment", icon: "search", price: 1820, margin: 21.4, demand: "High", description: "Compact supply-chain visibility hardware for commercial operators." },
      { id: "prod-lens", name: "Market Lens", category: "Analytics", icon: "chart", price: 2460, margin: 17.8, demand: "Stable", description: "Market-intelligence module used by traders and contract teams." },
      { id: "prod-cell", name: "Energy Cell Pack", category: "Components", icon: "pulse", price: 435, margin: 12.2, demand: "Rising", description: "Standardized portable power unit for workshop and field equipment." }
    ],
    suppliers: [
      { name: "Glassfall Composites", material: "Composite housings", country: "Valerion", status: "Stable", leadTime: "2 days", tone: "good" },
      { name: "Dusk Harbor Energy", material: "Energy cells", country: "Thaloris", status: "Price risk", leadTime: "3 days", tone: "warn" },
      { name: "Frostgate Circuits", material: "Sensor boards", country: "Northreach", status: "Stable", leadTime: "4 days", tone: "good" }
    ]
  },
  marketplace: {
    categories: ["All", "Equipment", "Materials", "Consumables", "Access"],
    volume: 67240,
    activeSellers: 18,
    feeRate: 2.5,
    listings: [
      { id: "listing-1", name: "Refined Alloy Bundle", category: "Materials", country: "Valerion", seller: "Mira Chen", rating: 4.8, unitPrice: 710, quantity: 12, condition: "New", image: "./assets/store-items/refined-alloy-bundle.svg", description: "Unused alloy bundles from a completed manufacturing contract." },
      { id: "listing-2", name: "Market Lens", category: "Equipment", country: "Eldoran", seller: "Jon Vale", rating: 4.6, unitPrice: 2180, quantity: 2, condition: "Used", image: "./assets/store-items/market-lens.svg", description: "Operational market-intelligence module with one cycle of use." },
      { id: "listing-3", name: "Emergency Repair Kit", category: "Consumables", country: "Dravenlok", seller: "Iris Stone", rating: 4.9, unitPrice: 880, quantity: 5, condition: "New", image: "./assets/store-items/emergency-repair-kit.svg", description: "Sealed emergency kits offered below the system-store price." },
      { id: "listing-4", name: "Workshop Access Pass", category: "Access", country: "Lumenor", seller: "Theo Park", rating: 4.4, unitPrice: 1420, quantity: 1, condition: "New", image: "./assets/store-items/workshop-access-pass.svg", description: "Transferable access credential for one advanced workshop session." },
      { id: "listing-5", name: "Energy Cell Pack", category: "Materials", country: "Thaloris", seller: "Nadia Ross", rating: 4.7, unitPrice: 465, quantity: 20, condition: "New", image: "./assets/store-items/energy-cell-pack.svg", description: "Current-cycle energy cells with immediate regional delivery." }
    ],
    myListings: [
      { id: "my-listing-1", name: "Encrypted Data Chip", quantity: 1, unitPrice: 2450, status: "Active" },
      { id: "my-listing-2", name: "Energy Cell Pack", quantity: 3, unitPrice: 490, status: "Active" }
    ]
  },
  crafting: {
    workshopLevel: "Tier II",
    workshopNote: "Supports equipment and consumable recipes.",
    materialSlotsUsed: 12,
    materialSlotsMax: 24,
    queue: [{ id: "job-1", name: "Priority Processing Token", quantity: 1, remaining: "8 min", progress: 62 }],
    recipes: [
      { id: "recipe-1", name: "Priority Processing Token", category: "Consumable", duration: "20 min", description: "Creates one token that accelerates an eligible contract review.", image: "./assets/store-items/priority-processing-token.svg", unlockStatus: "Unlocked", requiredWorkshop: "Tier I", outputQuantity: 1, effect: "One eligible submission receives priority processing.", maxCraft: 2, ingredients: [{ name: "Encrypted Data Chip", owned: 1, required: 1 }, { name: "Energy Cell Pack", owned: 8, required: 2 }] },
      { id: "recipe-2", name: "Emergency Repair Kit", category: "Consumable", duration: "35 min", description: "Builds a single-use protection kit for equipment failures.", image: "./assets/store-items/emergency-repair-kit.svg", unlockStatus: "Unlocked", requiredWorkshop: "Tier II", outputQuantity: 1, effect: "Prevents one equipment-failure penalty.", maxCraft: 4, ingredients: [{ name: "Refined Alloy Bundle", owned: 4, required: 1 }, { name: "Energy Cell Pack", owned: 8, required: 1 }] },
      { id: "recipe-3", name: "Advanced Fabricator", category: "Equipment", duration: "2 hr", description: "Produces a permanent workshop upgrade for advanced recipes.", image: "./assets/store-items/advanced-fabricator.svg", unlockStatus: "Locked", requiredWorkshop: "Tier III", outputQuantity: 1, effect: "Unlocks advanced equipment recipes.", maxCraft: 1, ingredients: [{ name: "Refined Alloy Bundle", owned: 4, required: 6 }, { name: "Energy Cell Pack", owned: 8, required: 4 }] }
    ]
  },
  loans: {
    creditScore: 742,
    availableCredit: 24000,
    outstanding: 6800,
    nextPayment: { amount: 920, due: "Jul 20 · 17:00" },
    onTimeRate: 100,
    paymentsMade: 4,
    offers: [
      { id: "loan-offer-1", name: "Working Capital Line", purpose: "Business", icon: "business", limit: 12000, apr: 6.25, termCycles: 6, fee: 1.0, risk: "Low", description: "Short-term liquidity for inventory and operating expenses." },
      { id: "loan-offer-2", name: "Equipment Finance", purpose: "Investment", icon: "factory", limit: 18000, apr: 7.1, termCycles: 10, fee: 1.5, risk: "Moderate", description: "Fixed financing for workshop and production equipment." },
      { id: "loan-offer-3", name: "Contract Bridge", purpose: "Contracts", icon: "contracts", limit: 6500, apr: 5.8, termCycles: 4, fee: 0.8, risk: "Low", description: "Bridge financing against an accepted high-value contract." }
    ],
    activeLoans: [{ id: "LN-8804", name: "Equipment Finance", originalAmount: 10000, balance: 6800, nextPayment: 920, nextDue: "Jul 20", repaidPercent: 32, status: "Current" }],
    schedule: [
      { cycle: "Cycle 4", due: "Jul 10", amount: 920, status: "Paid" },
      { cycle: "Cycle 5", due: "Jul 20", amount: 920, status: "Due" },
      { cycle: "Cycle 6", due: "Jul 30", amount: 920, status: "Scheduled" },
      { cycle: "Cycle 7", due: "Aug 9", amount: 920, status: "Scheduled" }
    ]
  },
  messages: {
    unread: 3,
    threads: [
      { id: "thread-1", type: "PLAYER DIRECT", title: "Mira Chen", initials: "MC", tone: "cyan", preview: "I can deliver the alloy bundle today.", time: "09:42", unread: 2, members: "2 participants", status: "Online", messages: [
        { sender: "Mira Chen", initials: "MC", time: "09:31", body: "I saw your marketplace request. I can deliver the refined alloy bundle today." },
        { sender: "Avery Rowan", initials: "AR", time: "09:36", body: "That works. Is the listing price fixed?", self: true },
        { sender: "Mira Chen", initials: "MC", time: "09:42", body: "Yes. I posted twelve units at ELD 710 each. The marketplace will handle settlement." }
      ]},
      { id: "thread-2", type: "CONTRACT CHANNEL", title: "Regional Supply Forecast", initials: "EC", tone: "amber", preview: "Submission guidance was updated.", time: "Yesterday", unread: 1, members: "Eldoran Commerce Authority", status: "Official", messages: [
        { sender: "Eldoran Commerce Authority", initials: "EC", time: "Yesterday · 15:18", body: "The forecast may use any three evidence points from the market or news terminal.", attachment: "Forecast rubric.pdf" },
        { sender: "Avery Rowan", initials: "AR", time: "Yesterday · 15:42", body: "Understood. I will include freight costs, alloy prices, and the base-rate decision.", self: true }
      ]},
      { id: "thread-3", type: "ADMIN ANNOUNCEMENT", title: "Game Administration", initials: "GA", tone: "purple", preview: "Market closes at 17:00 today.", time: "Jul 15", unread: 0, members: "All players", status: "Official", messages: [
        { sender: "Game Administration", initials: "GA", time: "Jul 15 · 08:00", body: "The financial exchange closes at 17:00 today. Open orders will remain pending until the next session." }
      ]}
    ]
  },
  progression: {
    playerName: "Avery Rowan",
    title: "Regional Operator",
    summary: "Balanced performance across contracts, markets, banking, and business operations.",
    level: 7,
    xp: 6840,
    nextLevelXp: 8000,
    skillPoints: 3,
    reputation: [
      { name: "Contracts", label: "Reliable", score: 82, icon: "contracts" },
      { name: "Trading", label: "Disciplined", score: 71, icon: "market" },
      { name: "Business", label: "Trusted", score: 74, icon: "business" },
      { name: "Banking", label: "Excellent", score: 88, icon: "banking" }
    ],
    milestones: [
      { title: "Complete 10 contracts", detail: "8 of 10 approved", progress: 80, icon: "contracts" },
      { title: "Reach ELD 200k net worth", detail: "ELD 148,250 current", progress: 74, icon: "portfolio" },
      { title: "Maintain 80+ business reputation", detail: "74 current", progress: 92, icon: "business" }
    ],
    skills: [
      { id: "skill-1", category: "Market", name: "Analytical Discipline", description: "Reduces simulated order fees on eligible trades.", cost: 2, icon: "chart", unlocked: false },
      { id: "skill-2", category: "Business", name: "Lean Operations", description: "Improves the output estimate for standard production runs.", cost: 3, icon: "factory", unlocked: false },
      { id: "skill-3", category: "Contracts", name: "Clear Submission", description: "Adds an expanded checklist to contract submissions.", cost: 1, icon: "contracts", unlocked: true }
    ],
    achievements: [
      { id: "ach-1", name: "First Enterprise", description: "Register and operate a player-owned company.", progressText: "Completed Jul 12", complete: true, claimable: true },
      { id: "ach-2", name: "Reliable Counterparty", description: "Complete five marketplace purchases without a dispute.", progressText: "3 of 5", complete: false, claimable: false },
      { id: "ach-3", name: "Creditworthy", description: "Maintain an on-time loan payment rate of 100% for four cycles.", progressText: "Completed Jul 15", complete: true, claimable: false }
    ],
    licenses: [
      { name: "Commercial Operator License", issuer: "Eldoran Commerce Authority", description: "Permits player business operations and supplier contracts.", icon: "business", status: "Active" },
      { name: "Tier II Workshop Permit", issuer: "Crescent Bay Fabrication Guild", description: "Permits equipment and consumable crafting recipes.", icon: "crafting", status: "Active" },
      { name: "Advanced Market Access", issuer: "Aurora Exchange", description: "Requires Level 8 and Trading reputation of 75.", icon: "market", status: "Locked" }
    ]
  },
  notifications: [
    { id: "note-1", title: "Contract due today", detail: "Regional Supply Forecast · 16:00", tone: "warn" },
    { id: "note-2", title: "NOVA moved +2.48%", detail: "Your position gained 547.20", tone: "good" },
    { id: "note-3", title: "New store inventory", detail: "Field Permit stock is limited", tone: "purple" },
    { id: "note-4", title: "Bank rate updated", detail: "Savings yield is now 3.25%", tone: "cyan" }
  ]
});
