import { normalizeMarket, normalizeMarketRead, normalizeMarketAssetRead } from "./market-read-model.js";
import { normalizeBankingRead } from "./banking-read-model.js";
import { normalizeStore, normalizeInventory, normalizeInventoryRead } from "./store-inventory-read-model.js";
import { normalizeContracts } from "./contracts-read-model.js";
import { normalizePortfolio } from "./portfolio-read-model.js";
import { list, object, text, number } from "./read-model-values.js";
import {
  normalizeMarketNews,
  normalizeCountriesRead,
  normalizeWorldNewsRead,
  linkCountryRelations
} from "./country-news-read-model.js";

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
      checking: { accountId: "CHECKING", balance: 0, available: 0, pending: 0 },
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
        cash: 0,
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
  const primaryBalance = balances.find((entry) => text(entry.accountType).toLowerCase() === "checking") || {};
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
  const checkingBalances = list(cash.balances).filter((entry) => text(entry.accountType).toLowerCase() === "checking");
  const primaryBalance = checkingBalances.find((entry) => text(entry.currencyCode).toUpperCase() === primaryCurrency.toUpperCase()) || {};
  const available = number(primaryBalance.balance, number(cash.totalBalance));
  data.banking.checking = { accountId: text(primaryBalance.accountType, "CHECKING").toUpperCase(), balance: available, available, pending: 0 };
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
    const body = object(response);
    const snapshot = { me: { store: { listings: list(body.items), products: list(body.products), inventory: data.inventory.items.map((item) => ({
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
    next.banking = normalizeBankingRead(response, data.banking, data.session?.currencyCode);
    next.dashboard = {
      ...data.dashboard,
      liquidBalance: next.banking.checking.balance,
      savingsBalance: next.banking.savings.configured ? next.banking.savings.balance : null
    };
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
