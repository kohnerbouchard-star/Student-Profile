function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function initials(name) {
  const letters = text(name, "Player")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
  return letters || "PL";
}

function playerFacingId(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (!candidate) continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
      return candidate;
    }
  }
  return "—";
}

function shortDate(value, fallback = "No deadline") {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function categoryImage(item) {
  const itemKey = text(item?.itemKey).toLowerCase();
  const knownAssets = new Set([
    "advanced-fabricator",
    "data-chip",
    "energy-cell-pack",
    "emergency-repair-kit",
    "field-permit",
    "logistics-scanner",
    "market-lens",
    "priority-processing-token",
    "refined-alloy-bundle",
    "teacher-bonus-coupon",
    "workshop-access-pass"
  ]);
  if (knownAssets.has(itemKey)) return `./assets/store-items/${itemKey}.svg`;
  const category = text(item?.category, "custom").toLowerCase();
  const fallback = category.startsWith("equipment")
    ? "equipment"
    : category.startsWith("material")
      ? "material"
      : category.startsWith("consumable")
        ? "consumable"
        : "custom";
  return `./assets/store-items/store-item-${fallback}.svg`;
}

function emptyTerminalData() {
  return {
    session: {
      playerId: "",
      displayName: "Player",
      initials: "PL",
      gameSessionId: "",
      playerSessionId: "",
      gameName: "Econovaria",
      gameCode: "—",
      status: "LIVE",
      countryId: "",
      countryName: "Unassigned",
      capital: "Not assigned",
      currencyCode: "ECO",
      currencyName: "Credits",
      currencySymbolAsset: "",
      rank: 0,
      level: 0,
      xp: 0,
      nextLevelXp: 1
    },
    dashboard: {
      netWorth: 0,
      liquidBalance: 0,
      savingsBalance: null,
      portfolioValue: 0,
      inventoryValue: 0,
      liabilities: null,
      dailyChange: 0,
      contractsActive: 0,
      contractsDueSoon: 0,
      unreadNotifications: 0,
      marketStatus: "CLOSED",
      economyPhase: "Unavailable",
      inflationRate: 0,
      baseRate: 0,
      countryScore: 0,
      marketPulse: [],
      worldEvents: []
    },
    countries: [],
    news: { categories: ["All"], selectedId: "", items: [] },
    market: { status: "CLOSED", nextClose: "Schedule unavailable", sectors: ["All"], selectedAssetId: "", assets: [] },
    portfolio: {
      netWorth: 0,
      totalAssets: 0,
      liabilities: null,
      dailyChange: 0,
      totalGain: 0,
      totalGainPercent: 0,
      history: [],
      allocation: [],
      countryExposure: []
    },
    store: { categories: ["All"], items: [] },
    contracts: {
      tabs: ["Active", "Available", "Submitted", "Completed"],
      lifecycle: ["Available", "Active", "Submitted", "Completed"],
      items: []
    },
    inventory: { capacity: null, capacityUsed: null, capacityMax: null, categories: ["All"], items: [] },
    banking: {
      checking: { accountId: "CASH", balance: 0, available: 0, pending: 0 },
      savings: { configured: false, accountId: "NOT CONFIGURED", balance: null, available: null, interestRate: null, interestEarned: null },
      creditConfigured: false,
      transfersConfigured: false,
      creditScore: null,
      transferLimit: null,
      balances: [],
      generatedAt: "",
      staleAt: "",
      stale: false,
      pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 50 },
      transactions: []
    },
    business: {
      configured: false,
      company: {
        name: "Business not configured",
        registration: "—",
        status: "Unavailable",
        industry: "Not configured",
        headquarters: "Not configured",
        valuation: 0,
        valuationChange: 0,
        cash: 0,
        revenue: 0,
        margin: 0,
        reputation: 0,
        reputationLabel: "No business profile",
        summary: "The player business service is not connected for this game."
      },
      operations: { employees: 0, output: 0, backlog: 0, capacityUse: 0, maxRun: 0, capacityNote: "No production capacity is configured." },
      products: [],
      suppliers: []
    },
    marketplace: { configured: false, categories: ["All"], volume: 0, activeSellers: 0, feeRate: 0, listings: [], myListings: [] },
    crafting: { workshopLevel: "Unavailable", workshopNote: "No workshop is configured.", materialSlotsUsed: 0, materialSlotsMax: 0, queue: [], recipes: [] },
    loans: { configured: false, creditScore: null, availableCredit: null, outstanding: null, nextPayment: null, onTimeRate: null, paymentsMade: null, offers: [], activeLoans: [], schedule: [] },
    messages: { unread: 0, threads: [] },
    progression: {
      configured: false,
      level: 0,
      title: "Progression not configured",
      playerName: "Player",
      summary: "The progression service is not connected for this game.",
      xp: 0,
      nextLevelXp: 1,
      skillPoints: 0,
      reputation: [],
      milestones: [],
      skills: [],
      achievements: [],
      licenses: []
    },
    notifications: []
  };
}

function normalizeSession(rawSession, rawDashboard, base) {
  const direct = object(rawSession);
  if (direct.playerId || direct.gameSessionId) {
    const displayName = text(direct.displayName, base.displayName);
    return {
      ...base,
      ...direct,
      displayName,
      initials: text(direct.initials, initials(displayName)),
      playerSessionId: text(direct.playerSessionId, base.playerSessionId)
    };
  }

  const game = object(direct.gameSession);
  const player = object(direct.player);
  const session = object(direct.session);
  const dashboard = object(rawDashboard);
  const me = object(dashboard.me);
  const cash = object(me.cash);
  const balances = list(direct.balances);
  const primaryBalance = balances.find((entry) => entry.accountType === "cash") || balances[0] || {};
  const displayName = text(player.displayName || me.displayName, base.displayName);
  const countryCode = text(me.countryCode);
  const currencyCode = text(cash.primaryCurrencyCode || primaryBalance.currencyCode, base.currencyCode);

  return {
    ...base,
    playerId: playerFacingId(player.playerIdentifier, player.playerId, me.playerIdentifier),
    displayName,
    initials: initials(displayName),
    gameSessionId: text(game.id || object(dashboard.gameSession).id),
    playerSessionId: text(session.id),
    gameName: text(game.name || object(dashboard.gameSession).name, base.gameName),
    gameCode: text(direct.gameCode, base.gameCode),
    status: text(game.status || session.status, base.status).toUpperCase(),
    countryId: countryCode.toLowerCase(),
    countryName: countryCode || base.countryName,
    currencyCode,
    currencyName: currencyCode
  };
}

function normalizeMarketNews(news, stocks = []) {
  const assetIdByTicker = new Map(list(stocks).map((stock) => [
    text(stock.ticker).toLowerCase(),
    text(stock.assetId)
  ]));
  return list(news).map((item) => ({
    id: text(item.id),
    category: text(item.category, "Market"),
    time: shortDate(item.createdAt, "Current"),
    title: text(item.headline, "Market update"),
    summary: text(item.explanation),
    analysis: text(item.explanation),
    severity: item.sentiment === "negative" ? "High" : item.sentiment === "mixed" ? "Medium" : "Low",
    tone: item.sentiment === "positive" ? "good" : item.sentiment === "negative" ? "warn" : item.sentiment === "mixed" ? "purple" : "cyan",
    effects: text(item.explanation) ? [text(item.explanation)] : [],
    countryIds: item.scope === "country" && item.targetKey ? [String(item.targetKey).toLowerCase()] : [],
    assetIds: item.scope === "ticker" && item.targetKey
      ? [assetIdByTicker.get(String(item.targetKey).toLowerCase())].filter(Boolean)
      : []
  }));
}

function titleCase(value, fallback = "") {
  return text(value, fallback)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function newsTone(sentiment) {
  const value = text(sentiment).toLowerCase();
  if (value === "positive") return "good";
  if (value === "negative") return "warn";
  if (value === "mixed") return "purple";
  return "cyan";
}

function worldNewsSeverity(magnitude) {
  const value = Math.abs(number(magnitude));
  if (value >= 0.75) return "High";
  if (value >= 0.25) return "Medium";
  return "Low";
}

function normalizeWorldNewsItems(items, marketAssets) {
  const assetIdByTicker = new Map(list(marketAssets).map((asset) => [
    text(asset.symbol).toLowerCase(),
    text(asset.id)
  ]));
  return list(items).map((item) => {
    const impact = object(item.impact);
    const scope = text(item.scope).toLowerCase();
    const targetKey = text(item.targetKey);
    const effects = [
      `Magnitude ${number(impact.magnitude).toFixed(2)}`,
      `Confidence ${Math.round(number(impact.confidence) * 100)}%`
    ];
    if (impact.volatility !== null && impact.volatility !== undefined) {
      effects.push(`Volatility ${number(impact.volatility).toFixed(2)}`);
    }
    if (impact.volume !== null && impact.volume !== undefined) {
      effects.push(`Volume ${number(impact.volume).toFixed(2)}`);
    }
    return {
      id: text(item.id),
      category: titleCase(item.category, "World"),
      time: shortDate(item.createdAt, "Current"),
      title: text(item.headline, "World update"),
      summary: text(item.explanation),
      analysis: text(item.explanation),
      severity: worldNewsSeverity(impact.magnitude),
      tone: newsTone(item.sentiment),
      effects,
      countryIds: scope === "country" && targetKey
        ? [targetKey.toLowerCase()]
        : [],
      assetIds: scope === "ticker" && targetKey
        ? [assetIdByTicker.get(targetKey.toLowerCase())].filter(Boolean)
        : [],
      tick: object(item.tick),
      source: text(item.source)
    };
  });
}

function countryTone(color) {
  const value = text(color).toLowerCase();
  if (["red"].includes(value)) return "red";
  if (["orange", "gold", "yellow", "amber"].includes(value)) return "amber";
  if (["purple", "violet"].includes(value)) return "purple";
  if (["green"].includes(value)) return "green";
  return "cyan";
}

function countryRisk(marketRiskIndex) {
  const value = number(marketRiskIndex, 1);
  if (value >= 1.4) return "High";
  if (value >= 0.9) return "Moderate";
  return "Low";
}

function countryPolicy(economy) {
  if (!economy || typeof economy !== "object") {
    return "No live economic policy snapshot is available.";
  }
  return `Tax ${(number(economy.taxRate) * 100).toFixed(2)}% · subsidy ${(number(economy.subsidyRate) * 100).toFixed(2)}% · base rate ${(number(economy.interestRate) * 100).toFixed(2)}%.`;
}

function linkCountryRelations(countries, marketAssets, newsItems) {
  return list(countries).map((country) => ({
    ...country,
    relatedAssetIds: list(marketAssets)
      .filter((asset) => asset.countryId === country.id)
      .map((asset) => asset.id),
    eventIds: list(newsItems)
      .filter((item) => list(item.countryIds).includes(country.id))
      .map((item) => item.id)
  }));
}

function normalizeCountriesRead(response, data) {
  const countries = list(object(response).items).map((item) => {
    const economy = item.economy && typeof item.economy === "object"
      ? item.economy
      : null;
    const id = text(item.countryCode).toLowerCase();
    const stabilityIndex = number(economy?.politicalStabilityIndex, 1);
    return {
      id,
      profileId: text(item.id),
      name: text(item.countryName, text(item.countryCode, "Unknown country")),
      capital: text(item.capitalName, "Not available"),
      currencyCode: text(item.currencyCode),
      mapRegion: text(object(item.map).region),
      mapColor: text(object(item.map).color),
      tone: countryTone(object(item.map).color),
      market: economy ? titleCase(economy.difficultyPreset, "Current") : "Unavailable",
      condition: economy ? text(economy.label, "Current snapshot") : "No live snapshot",
      index: number(economy?.realGdpIndex),
      growth: number(economy?.gdpGrowthRate) * 100,
      inflation: number(economy?.inflationRate) * 100,
      unemployment: number(economy?.unemploymentRate) * 100,
      baseRate: number(economy?.interestRate) * 100,
      currencyTrend: (number(economy?.exchangeRateIndex, 1) - 1) * 100,
      stability: Math.round(Math.max(0, Math.min(100, stabilityIndex * 50))),
      risk: economy ? countryRisk(economy.marketRiskIndex) : "Unavailable",
      resources: [],
      exports: [],
      tradePartners: [],
      policy: countryPolicy(economy),
      isPlayerCountry: item.isPlayerCountry === true,
      economy
    };
  });
  return linkCountryRelations(countries, data.market.assets, data.news.items);
}

function normalizeWorldNewsRead(response, data) {
  const items = normalizeWorldNewsItems(object(response).items, data.market.assets);
  return {
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    selectedId: items[0]?.id || "",
    items
  };
}

function marketHistory(historyPoints, existing, previousClose, currentPrice) {
  const history = list(historyPoints)
    .map((point) => Number(object(point).price))
    .filter(Number.isFinite);
  if (history.length) return history;

  const existingHistory = list(existing?.history)
    .map(Number)
    .filter(Number.isFinite);
  if (existingHistory.length > 2) {
    return [...existingHistory.slice(0, -1), currentPrice];
  }
  return [previousClose, currentPrice];
}

function normalizeMarketAsset(stock, options = {}) {
  const existing = object(options.existing);
  const holding = object(options.holding);
  const currentPrice = number(stock.currentPrice);
  const previousClose = number(stock.previousClose, currentPrice);
  const change = number(stock.changePct);
  const currentVolatility = number(stock.currentVolatility);
  const longRunVolatility = number(stock.longRunVolatility);
  return {
    id: text(stock.assetId),
    symbol: text(stock.ticker, "—"),
    name: text(stock.companyName, text(stock.ticker, "Unknown asset")),
    type: "Stock",
    sector: text(stock.sector, "Other"),
    countryId: text(stock.countryCode).toLowerCase(),
    price: currentPrice,
    open: number(stock.openPrice, currentPrice),
    dayHigh: number(stock.dayHigh, currentPrice),
    dayLow: number(stock.dayLow, currentPrice),
    change,
    volume: number(stock.volume),
    marketCap: number(stock.marketCap),
    pe: number(existing.pe),
    yield: number(existing.yield),
    risk: currentVolatility > longRunVolatility ? "High" : "Medium",
    outlook: change > 0 ? "Positive" : change < 0 ? "Cautious" : "Stable",
    watchlisted: typeof stock.isWatchlisted === "boolean"
      ? stock.isWatchlisted
      : existing.watchlisted === true,
    owned: number(holding.quantity, number(existing.owned)),
    averageCost: number(holding.averageCost, number(existing.averageCost)),
    history: marketHistory(options.history, existing, previousClose, currentPrice),
    newsIds: list(options.newsIds).length ? list(options.newsIds) : list(existing.newsIds),
    description: text(stock.description, text(existing.description))
  };
}

function normalizeMarket(snapshot, newsItems) {
  const market = object(object(snapshot.public).market);
  const holdings = list(object(object(snapshot.me).stocks).holdings);
  const holdingByAsset = new Map(holdings.map((holding) => [holding.stockAssetId, holding]));
  const assets = list(market.stocks).map((stock) => {
    const holding = holdingByAsset.get(stock.assetId) || {};
    const relatedNews = newsItems
      .filter((item) => item.assetIds.includes(stock.assetId))
      .map((item) => item.id);
    return normalizeMarketAsset(stock, { holding, newsIds: relatedNews });
  });
  const sectors = [...new Set(assets.map((asset) => asset.sector).filter(Boolean))];
  return {
    status: text(object(snapshot.gameSession).marketStatus, "closed").toUpperCase(),
    nextClose: "Live session schedule",
    sectors: ["All", ...sectors],
    selectedAssetId: assets[0]?.id || "",
    assets
  };
}

function normalizeMarketRead(response, currentMarket) {
  const body = object(response);
  const current = object(currentMarket);
  const existingById = new Map(list(current.assets).map((asset) => [asset.id, asset]));
  const assets = list(body.assets).map((asset) => normalizeMarketAsset(asset, {
    existing: existingById.get(asset.assetId)
  }));
  const sectors = [...new Set(assets.map((asset) => asset.sector).filter(Boolean))];
  const selectedAssetId = assets.some((asset) => asset.id === current.selectedAssetId)
    ? current.selectedAssetId
    : assets[0]?.id || "";
  return {
    ...current,
    sectors: ["All", ...sectors],
    selectedAssetId,
    assets,
    pagination: object(body.pagination),
    tickIndex: number(body.tickIndex)
  };
}

function normalizeMarketAssetRead(response, currentMarket) {
  const body = object(response);
  const stock = object(body.asset);
  const current = object(currentMarket);
  const assets = list(current.assets);
  const existing = assets.find((asset) => asset.id === stock.assetId);
  if (!stock.assetId || !existing) return current;
  const updated = normalizeMarketAsset(stock, {
    existing,
    history: list(body.history)
  });
  return {
    ...current,
    assets: assets.map((asset) => asset.id === updated.id ? updated : asset),
    selectedAssetId: updated.id,
    tickIndex: number(body.tickIndex, number(current.tickIndex))
  };
}

function transactionDescription(entry) {
  const source = text(entry.sourceAction || entry.sourceDomain, "Ledger entry");
  return source
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeBankingRead(response, currentBanking) {
  const body = object(response);
  const current = object(currentBanking);
  const balances = list(body.currentBalances);
  const checking = balances.find((item) => ["cash", "checking"].includes(text(item.accountType).toLowerCase())) || balances[0] || {};
  const savings = balances.find((item) => text(item.accountType).toLowerCase() === "savings");
  const checkingBalance = number(checking.balance);
  const page = object(body.pagination);
  const incoming = list(body.ledgerEntries).map((entry) => {
    const amount = number(entry.amount);
    const entryType = text(entry.entryType).toLowerCase();
    return {
      id: text(entry.entryKey),
      description: transactionDescription(entry),
      date: shortDate(entry.createdAt, "Recorded"),
      category: text(entry.sourceDomain, "Ledger"),
      amount: entryType === "debit" ? -Math.abs(amount) : entryType === "credit" ? Math.abs(amount) : amount,
      status: "Posted",
      accountType: text(entry.accountType),
      currencyCode: text(entry.currencyCode)
    };
  });
  const append = Boolean(text(page.cursor));
  const transactions = append ? [...list(current.transactions), ...incoming] : incoming;
  const uniqueTransactions = [...new Map(transactions.map((entry) => [entry.id, entry])).values()];
  const staleAt = text(body.staleAt);
  const staleTimestamp = Date.parse(staleAt);
  return {
    ...current,
    balances: balances.map((balance) => ({
      accountType: text(balance.accountType),
      balance: number(balance.balance),
      currencyCode: text(balance.currencyCode)
    })),
    checking: {
      accountId: text(checking.accountType, "CASH").toUpperCase(),
      balance: checkingBalance,
      available: checkingBalance,
      pending: 0,
      currencyCode: text(checking.currencyCode)
    },
    savings: savings ? {
      configured: true,
      accountId: text(savings.accountType, "SAVINGS").toUpperCase(),
      balance: number(savings.balance),
      available: number(savings.balance),
      interestRate: null,
      interestEarned: null,
      currencyCode: text(savings.currencyCode)
    } : {
      configured: false,
      accountId: "NOT CONFIGURED",
      balance: null,
      available: null,
      interestRate: null,
      interestEarned: null,
      currencyCode: ""
    },
    creditConfigured: false,
    transfersConfigured: false,
    creditScore: null,
    transferLimit: null,
    generatedAt: text(body.generatedAt),
    staleAt,
    stale: body.stale === true || (Number.isFinite(staleTimestamp) && staleTimestamp <= Date.now()),
    pagination: {
      cursor: text(page.cursor) || null,
      nextCursor: text(page.nextCursor) || null,
      hasMore: page.hasMore === true,
      limit: number(page.limit, 50)
    },
    transactions: uniqueTransactions
  };
}

function storeItemsFromSnapshot(snapshot) {
  const store = object(object(snapshot.me).store);
  const inventoryByItem = new Map(list(store.inventory).map((holding) => [holding.itemId, holding]));
  return list(store.listings).map((item) => ({
    id: text(item.itemKey || item.id || item.itemId),
    itemKey: text(item.itemKey || item.id || item.itemId),
    name: text(item.name, "Unnamed item"),
    category: text(item.category, "Other"),
    price: number(item.price),
    stock: number(item.stockQuantity),
    currencyCode: text(item.currencyCode),
    owned: number(inventoryByItem.get(item.id || item.itemId)?.quantityOwned),
    image: categoryImage(item),
    description: text(item.description, "No description is available.")
  }));
}

function normalizeStore(snapshot) {
  const items = storeItemsFromSnapshot(snapshot);
  return {
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    items
  };
}

function normalizeInventory(snapshot) {
  const store = object(object(snapshot.me).store);
  const catalogById = new Map(list(store.listings).map((item) => [item.id || item.itemId, item]));
  const items = list(store.inventory).map((holding) => {
    const catalogItem = catalogById.get(holding.itemId) || {};
    const quantity = number(holding.quantityOwned);
    return {
      id: text(holding.inventoryId),
      storeItemId: text(holding.itemId),
      name: text(holding.itemName || catalogItem.name, "Unnamed item"),
      category: text(catalogItem.category, "Other"),
      quantity,
      value: number(catalogItem.price) * quantity,
      state: number(holding.quantityReserved) > 0 ? "Reserved" : "Stored",
      image: categoryImage(catalogItem),
      description: text(catalogItem.description, "Inventory item"),
      availableActions: []
    };
  });
  return {
    capacity: null,
    capacityUsed: null,
    capacityMax: null,
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    items
  };
}

function normalizeInventoryRead(response) {
  const body = object(response);
  const items = list(body.items).map((item) => ({
    id: text(item.id),
    storeItemId: text(item.storeItemId),
    name: text(item.name, "Unnamed item"),
    category: text(item.category, "Other"),
    quantity: number(item.quantityOwned),
    quantityReserved: number(item.quantityReserved),
    quantityAvailable: number(item.quantityAvailable),
    value: number(item.totalOwnedValue),
    unitValue: number(item.unitValue),
    currencyCode: text(item.currencyCode),
    state: number(item.quantityReserved) > 0 ? "Reserved" : "Stored",
    image: categoryImage(item),
    description: text(item.description, "Inventory item"),
    availableActions: list(item.availableActions)
  }));
  const capacity = body.capacity && typeof body.capacity === "object" ? body.capacity : null;
  return {
    capacity,
    capacityUsed: capacity ? number(capacity.used) : null,
    capacityMax: capacity ? number(capacity.max) : null,
    categories: list(body.categories).length
      ? list(body.categories)
      : ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    summary: object(body.summary),
    items
  };
}

function contractStatus(progress) {
  const status = text(progress?.status).toLowerCase();
  if (["completed", "approved", "rewarded"].includes(status)) return "Completed";
  if (status === "submitted") return "Submitted";
  if (["active", "accepted", "in_progress"].includes(status)) return "Active";
  return "Available";
}

function payloadList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const body = object(value);
  for (const key of ["items", "requirements", "submissionRequirements"]) {
    if (Array.isArray(body[key])) return body[key].map((item) => text(item)).filter(Boolean);
  }
  return [];
}

function normalizeContracts(snapshot) {
  const contracts = object(object(snapshot.me).contracts);
  const progressByContract = new Map(list(contracts.progress).map((progress) => [progress.contractId, progress]));
  const items = list(contracts.available).map((contract) => {
    const progress = progressByContract.get(contract.contractId);
    const status = contractStatus(progress);
    const reward = object(contract.rewardPayload);
    const target = object(contract.targetingPayload);
    const metadata = object(contract.metadata);
    const countryCodes = list(target.countryCodes);
    const requirements = payloadList(contract.requirementsPayload);
    return {
      id: text(contract.contractId),
      status,
      title: text(contract.title, "Untitled contract"),
      issuer: text(metadata.issuer || contract.sourceType, "Econovaria"),
      location: countryCodes.length ? countryCodes.join(", ") : "All Nations",
      due: shortDate(contract.deadlineAt || contract.expiresAt),
      urgency: contract.deadlineAt ? "medium" : "low",
      rewardCash: number(reward.cashAmount ?? reward.amount ?? object(reward.cash).amount),
      rewardXp: number(reward.xp ?? reward.experience),
      progress: status === "Completed" || status === "Submitted" ? 100 : status === "Active" ? 25 : 0,
      objective: text(contract.description, text(contract.instructions)),
      requirements,
      submission: progress ? {
        time: shortDate(progress.submittedAt, "Submitted"),
        url: text(object(progress.evidencePayload).submissionUrl),
        note: text(object(progress.evidencePayload).note)
      } : null,
      timeline: [
        { label: "Available", time: text(contract.publishedAt) ? shortDate(contract.publishedAt) : "Available now", complete: true },
        { label: "Accepted", time: status === "Available" ? "Pending" : "Recorded", complete: status !== "Available" },
        { label: "Submitted for review", time: progress?.submittedAt ? shortDate(progress.submittedAt) : "Pending", complete: ["Submitted", "Completed"].includes(status) },
        { label: "Reward issued", time: progress?.rewardIssuedAt ? shortDate(progress.rewardIssuedAt) : "Pending", complete: status === "Completed" }
      ]
    };
  });
  return {
    tabs: ["Active", "Available", "Submitted", "Completed"],
    lifecycle: ["Available", "Active", "Submitted", "Completed"],
    items
  };
}

function normalizePortfolio(snapshot) {
  const stocks = object(object(snapshot.me).stocks);
  const summary = object(stocks.portfolio);
  const cash = number(summary.cashBalance, number(object(object(snapshot.me).cash).totalBalance));
  const equities = number(summary.holdingsMarketValue);
  const netWorth = number(object(snapshot.me).netWorth, number(summary.totalEquity, cash + equities));
  const totalGain = number(summary.unrealizedPnl) + number(summary.realizedPnl);
  const totalCost = number(summary.totalCostBasis);
  const exposure = new Map();
  for (const holding of list(stocks.holdings)) {
    const countryId = text(holding.countryCode, "unknown").toLowerCase();
    exposure.set(countryId, number(exposure.get(countryId)) + number(holding.marketValue));
  }
  return {
    netWorth,
    totalAssets: netWorth,
    liabilities: null,
    dailyChange: 0,
    totalGain,
    totalGainPercent: totalCost ? totalGain / totalCost * 100 : 0,
    history: netWorth ? [netWorth, netWorth] : [],
    allocation: [
      ...(cash ? [{ id: "cash", label: "Cash", value: cash, percent: netWorth ? cash / netWorth * 100 : 0, tone: "green" }] : []),
      ...(equities ? [{ id: "equities", label: "Equities", value: equities, percent: netWorth ? equities / netWorth * 100 : 0, tone: "cyan" }] : [])
    ],
    countryExposure: [...exposure.entries()].map(([countryId, value]) => ({
      countryId,
      value,
      percent: equities ? value / equities * 100 : 0
    }))
  };
}

function normalizeNotifications(snapshot) {
  return normalizeNotificationItems(snapshot.unseenCutscenes);
}

function normalizeNotificationItems(items) {
  return list(items).map((delivery) => ({
    id: text(delivery.deliveryId || delivery.id),
    notificationId: text(delivery.notificationId),
    title: text(delivery.title, "Notification"),
    detail: text(delivery.summary || delivery.detail),
    tone: ["critical", "high", "urgent"].includes(text(delivery.priority).toLowerCase())
      ? "warn"
      : text(delivery.priority).toLowerCase() === "low"
        ? "cyan"
        : "purple",
    status: text(delivery.status, delivery.seenAt ? "read" : "unread"),
    deliveredAt: text(delivery.deliveredAt),
    seenAt: text(delivery.seenAt)
  }));
}

function applyDashboardSnapshot(data, rawDashboard) {
  const snapshot = object(rawDashboard);
  if (!snapshot.gameSession || !snapshot.me || !snapshot.public) {
    data.dashboard = { ...data.dashboard, ...snapshot };
    return data;
  }

  const publicMarket = object(object(snapshot.public).market);
  const newsItems = normalizeMarketNews(publicMarket.news, publicMarket.stocks);
  data.news = {
    categories: ["All", ...new Set(newsItems.map((item) => item.category).filter(Boolean))],
    selectedId: newsItems[0]?.id || "",
    items: newsItems
  };
  data.market = normalizeMarket(snapshot, newsItems);
  data.portfolio = normalizePortfolio(snapshot);
  data.store = normalizeStore(snapshot);
  data.inventory = normalizeInventory(snapshot);
  data.contracts = normalizeContracts(snapshot);
  data.notifications = normalizeNotifications(snapshot);

  const cash = object(object(snapshot.me).cash);
  const primaryCurrency = text(cash.primaryCurrencyCode, data.session.currencyCode);
  const primaryBalance = list(cash.balances).find((entry) => entry.currencyCode === primaryCurrency) || list(cash.balances)[0] || {};
  const available = number(primaryBalance.balance, number(cash.totalBalance));
  data.banking.checking = { accountId: text(primaryBalance.accountType, "CASH").toUpperCase(), balance: available, available, pending: 0 };
  data.session.currencyCode = primaryCurrency;
  data.session.currencyName = primaryCurrency;
  data.session.countryId = text(object(snapshot.me).countryCode).toLowerCase();
  data.session.countryName = text(object(snapshot.me).countryCode, data.session.countryName);

  const activeContracts = data.contracts.items.filter((item) => item.status === "Active");
  const marketPulse = data.market.assets.map((asset) => ({ symbol: asset.symbol, price: asset.price, change: asset.change }));
  const worldEvents = newsItems.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    region: item.countryIds[0]?.toUpperCase() || "Global",
    impact: item.summary,
    tone: item.tone
  }));
  data.dashboard = {
    ...data.dashboard,
    netWorth: number(object(snapshot.me).netWorth, data.portfolio.netWorth),
    liquidBalance: available,
    portfolioValue: number(object(object(object(snapshot.me).stocks).portfolio).holdingsMarketValue),
    inventoryValue: data.inventory.items.reduce((sum, item) => sum + number(item.value), 0),
    contractsActive: activeContracts.length,
    contractsDueSoon: activeContracts.filter((contract) => contract.urgency === "high").length,
    unreadNotifications: data.notifications.length,
    marketStatus: text(object(snapshot.gameSession).marketStatus, "closed").toUpperCase(),
    marketPulse,
    worldEvents
  };
  data.progression.playerName = data.session.displayName;
  return data;
}

export function readSessionContext(rawSession) {
  const response = object(rawSession);
  if (response.gameSessionId || response.playerSessionId) {
    return {
      gameSessionId: text(response.gameSessionId),
      playerSessionId: text(response.playerSessionId)
    };
  }
  return {
    gameSessionId: text(object(response.gameSession).id),
    playerSessionId: text(object(response.session).id)
  };
}

export function normalizeTerminalBootstrap(rawSession, rawDashboard) {
  const data = emptyTerminalData();
  data.session = normalizeSession(rawSession, rawDashboard, data.session);
  data.progression.playerName = data.session.displayName;
  return applyDashboardSnapshot(data, rawDashboard);
}

export function mergeTerminalRead(data, endpointKey, response) {
  const next = { ...data };
  if (endpointKey === "dashboard") return applyDashboardSnapshot(next, response);
  if (endpointKey === "countries") {
    next.countries = normalizeCountriesRead(response, data);
    const playerCountry = next.countries.find((country) => country.isPlayerCountry);
    if (playerCountry) {
      next.session = {
        ...data.session,
        countryId: playerCountry.id,
        countryName: playerCountry.name,
        capital: playerCountry.capital,
        currencyCode: playerCountry.currencyCode || data.session.currencyCode,
        currencyName: playerCountry.currencyCode || data.session.currencyName
      };
      next.dashboard = {
        ...data.dashboard,
        economyPhase: playerCountry.condition,
        inflationRate: playerCountry.inflation,
        baseRate: playerCountry.baseRate,
        countryScore: playerCountry.stability
      };
    }
  }
  if (endpointKey === "news") {
    next.news = normalizeWorldNewsRead(response, data);
    next.countries = linkCountryRelations(data.countries, data.market.assets, next.news.items);
    next.dashboard = {
      ...data.dashboard,
      worldEvents: next.news.items.slice(0, 5).map((item) => ({
        id: item.id,
        title: item.title,
        region: item.countryIds[0]?.toUpperCase() || "Global",
        impact: item.summary,
        tone: item.tone
      }))
    };
  }
  if (endpointKey === "market") {
    next.market = normalizeMarketRead(response, data.market);
    next.dashboard = {
      ...data.dashboard,
      marketPulse: next.market.assets.map((asset) => ({
        symbol: asset.symbol,
        price: asset.price,
        change: asset.change
      }))
    };
  }
  if (endpointKey === "marketAsset") {
    next.market = normalizeMarketAssetRead(response, data.market);
  }
  if (endpointKey === "marketWatchlist") {
    const body = object(response);
    next.market = {
      ...data.market,
      assets: data.market.assets.map((asset) => asset.id === body.assetId
        ? { ...asset, watchlisted: body.isWatchlisted === true }
        : asset)
    };
  }
  if (endpointKey === "store") {
    const snapshot = { me: { store: { listings: list(object(response).items), inventory: data.inventory.items.map((item) => ({
      inventoryId: item.id,
      itemId: item.storeItemId,
      itemName: item.name,
      quantityOwned: item.quantity,
      quantityReserved: item.state === "Reserved" ? item.quantity : 0
    })) } } };
    next.store = normalizeStore(snapshot);
  }
  if (endpointKey === "contracts") {
    next.contracts = normalizeContracts({ me: { contracts: { available: list(object(response).contracts), progress: list(object(response).progress) } } });
  }
  if (endpointKey === "portfolio") {
    const portfolio = object(response);
    next.portfolio = normalizePortfolio({ me: {
      netWorth: object(portfolio.summary).totalEquity,
      cash: { totalBalance: object(portfolio.cash).balance },
      stocks: { portfolio: object(portfolio.summary), holdings: list(portfolio.holdings) }
    } });
  }
  if (endpointKey === "inventory") {
    next.inventory = normalizeInventoryRead(response);
  }
  if (endpointKey === "banking") {
    next.banking = normalizeBankingRead(response, data.banking);
  }
  if (endpointKey === "notifications") {
    next.notifications = normalizeNotificationItems(object(response).items);
    next.dashboard = {
      ...data.dashboard,
      unreadNotifications: next.notifications.length
    };
  }
  if (endpointKey === "notificationsRead") {
    const processedIds = new Set(list(object(response).deliveries).map((delivery) =>
      text(delivery.deliveryId)
    ).filter(Boolean));
    next.notifications = data.notifications.filter((notification) =>
      !processedIds.has(notification.id)
    );
    next.dashboard = {
      ...data.dashboard,
      unreadNotifications: next.notifications.length
    };
  }
  return next;
}
