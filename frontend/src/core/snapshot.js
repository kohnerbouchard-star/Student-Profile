window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.snapshot = window.Econovaria.core.snapshot || {};

function mergeSnapshot(snapshot) {
  const stateApi = getSnapshotStateApi();
  const previous = stateApi.getState() || stateApi.emptyState();
  const base = stateApi.emptyState();
  const normalized = normalizeSnapshot(snapshot || {});
  const next = {
    ...base,
    ...previous,
    profile: normalized.profile || previous.profile || null
  };

  preserveOrUpdateSection(next, previous, base, normalized, "store");
  mergeSnapshotTransactions(next, previous, base, snapshot || {}, normalized);
  preserveOrUpdateSection(next, previous, base, normalized, "inventory");
  preserveOrUpdateSection(next, previous, base, normalized, "market");
  preserveOrUpdateSection(next, previous, base, normalized, "portfolio");
  preserveOrUpdateSection(next, previous, base, normalized, "ratings");
  preserveOrUpdateSection(next, previous, base, normalized, "news");

  stateApi.setState(next);
}

function getSnapshotStateApi() {
  const stateApi = window.Econovaria?.state;

  if (
    !stateApi ||
    typeof stateApi.emptyState !== "function" ||
    typeof stateApi.getState !== "function" ||
    typeof stateApi.setState !== "function"
  ) {
    throw new Error("[Econovaria snapshot] State helpers are not available.");
  }

  return stateApi;
}

function preserveOrUpdateSection(next, previous, base, normalized, key) {
  if (Array.isArray(normalized[key]) && normalized[key].length > 0) {
    next[key] = normalized[key];
    return;
  }

  next[key] = Array.isArray(previous[key]) ? previous[key] : base[key];
}

function mergeSnapshotTransactions(next, previous, base, rawSnapshot, normalized) {
  const transactionRows = getPresentArray(rawSnapshot, [
    "transactions",
    "recentTransactions",
    "history",
    "transactionHistory",
    "activity",
    "recentActivity"
  ]);

  const stockTradeRows = getPresentArray(rawSnapshot, [
    "stockTrades",
    "stockTradeLog",
    "tradeLog",
    "trades",
    "recentTrades",
    "stockTransactions",
    "stockHistory",
    "Stock_Trade_Log",
    "Stock_Trade"
  ]);

  const hasGeneralTransactions = hasRows(transactionRows);
  const hasStockTransactions = hasRows(stockTradeRows);

  if (!hasGeneralTransactions && !hasStockTransactions) {
    preserveOrUpdateSection(next, previous, base, normalized, "transactions");
    return;
  }

  const existingTransactions = Array.isArray(previous.transactions)
    ? previous.transactions
    : base.transactions;

  const generalTransactions = hasGeneralTransactions
    ? transactionRows.map(normalizeTransaction)
    : existingTransactions.filter((transaction) => !isStockTransaction(transaction));

  const stockNormalizer = getStockTradeRowNormalizer();
  const stockTransactions = hasStockTransactions
    ? stockTradeRows.map(stockNormalizer)
    : existingTransactions.filter(isStockTransaction);

  next.transactions = [...generalTransactions, ...stockTransactions].sort(sortNewestFirst);
}

function getPresentArray(snapshot, keys) {
  if (!snapshot) return undefined;

  for (const key of keys) {
    if (Array.isArray(snapshot[key])) {
      return snapshot[key];
    }
  }

  return undefined;
}

function hasRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

function isStockTransaction(transaction) {
  return String(transaction?.mode || "").toUpperCase().includes("STOCK");
}

function getStockTradeRowNormalizer() {
  if (typeof normalizeStockTradeRow === "function") {
    return normalizeStockTradeRow;
  }

  if (typeof window.normalizeStockTradeRow === "function") {
    return window.normalizeStockTradeRow;
  }

  const tradingApi =
    window.Econovaria?.features?.trading ||
    window.Econovaria?.trading ||
    {};

  if (typeof tradingApi.normalizeStockTradeRow === "function") {
    return tradingApi.normalizeStockTradeRow;
  }

  return normalizeTransaction;
}

function numberForSnapshot(value) {
  const helper = window.Econovaria?.utils?.toNumber;
  return typeof helper === "function" ? helper(value) : localSnapshotNumber(value);
}

function localSnapshotNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[$,]/g, "").trim();
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function dateValueForSnapshot(value) {
  const helper = window.Econovaria?.utils?.parseDateValue;
  return typeof helper === "function" ? helper(value) : localSnapshotDateValue(value);
}

function localSnapshotDateValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();

  const text = String(value).trim();
  if (!text) return 0;

  const direct = Date.parse(text.replace(/\./g, "-").replace(" ", "T"));
  if (!Number.isNaN(direct)) return direct;

  const fallback = Date.parse(text);
  return Number.isNaN(fallback) ? 0 : fallback;
}

function normalizeSnapshot(snapshot) {
  const profileSource =
    snapshot.profile ||
    snapshot.student ||
    snapshot.currentStudent ||
    snapshot.account ||
    (Array.isArray(snapshot.students) ? snapshot.students[0] : null) ||
    (Array.isArray(snapshot.studentRows) ? snapshot.studentRows[0] : null) ||
    null;

  return {
    profile: profileSource ? normalizeProfile(profileSource) : null,
    store: getFirstArray(snapshot, ["store", "storeItems", "items", "availableItems"]).map(normalizeStoreItem),
    transactions: getFirstArray(snapshot, ["transactions", "recentTransactions", "history", "transactionHistory", "activity", "recentActivity"])
      .map(normalizeTransaction)
      .sort(sortNewestFirst),
    inventory: getFirstArray(snapshot, ["inventory", "studentInventory", "itemsOwned", "ownedItems"]).map(normalizeInventoryItem),
    market: getFirstArray(snapshot, ["market", "stocks", "stockMarket", "marketRows"]).map(normalizeMarketRow),
    portfolio: getFirstArray(snapshot, ["portfolio", "holdings", "positions", "stockPortfolio"]).map(normalizePortfolioRow),
    ratings: getFirstArray(snapshot, ["ratings", "predictions", "analystRatings", "ratingHistory"]).map(normalizeRatingRow).sort(sortNewestFirst),
    news: getFirstArray(snapshot, ["news", "stockNews", "reports", "stockNewsReports"]).map(normalizeNewsRow).sort(sortNewestFirst)
  };
}

function normalizeProfile(row) {
  return {
    name: pick(row, ["name", "studentName", "Student_Name", "Student Name", "Name"]),
    grade: pick(row, ["grade", "Grade"]),
    homeroom: pick(row, ["homeroom", "Homeroom", "Class", "class"]),
    jobTitle: pick(row, ["jobTitle", "Job_Title", "Job Title", "Job", "job"]),
    balance: numberForSnapshot(pick(row, ["balance", "Balance", "Current_Balance", "Current Balance"])),
    active: pick(row, ["active", "Active", "Status", "status"]) || "Active"
  };
}

function normalizeStoreItem(row) {
  return {
    itemId: pick(row, ["itemId", "Item_ID", "Item ID", "id", "ID"]),
    itemName: pick(row, ["itemName", "Item_Name", "Item Name", "name", "Name"]),
    price: numberForSnapshot(pick(row, ["price", "Price"])),
    inventory: pick(row, ["inventory", "Inventory", "Stock", "stock"]),
    category: pick(row, ["category", "Category"]),
    description: pick(row, ["description", "Description", "Notes", "notes"])
  };
}

function normalizeTransaction(row) {
  const action = pick(row, ["mode", "Mode", "action", "Action", "Type", "type"]);
  const ticker = pick(row, ["ticker", "Ticker"]);
  const itemId = pick(row, ["itemId", "Item_ID", "Item ID", "Ticker", "ticker"]);
  const itemName = pick(row, ["itemName", "Item_Name", "Item Name", "Company_Name", "Company Name", "Ticker", "ticker", "Note", "note"]);

  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "time", "Time", "date", "Date"]),
    mode: normalizeMode(action || (ticker ? "STOCK_TRADE" : "ACTIVITY")),
    amount: numberForSnapshot(pick(row, ["amount", "Amount", "Total_Value", "Total Value", "totalValue", "Price", "price"])),
    endingBalance: numberForSnapshot(pick(row, ["endingBalance", "Ending_Balance", "Ending Balance", "Balance_After", "Balance After", "balanceAfter"])),
    itemId,
    itemName,
    status: pick(row, ["status", "Status", "Reward_Status", "Reward Status"]),
    note: pick(row, ["note", "Note", "Reason", "reason"])
  };
}

function normalizeInventoryItem(row) {
  return {
    itemName: pick(row, ["itemName", "Item_Name", "Item Name", "Name", "name"]),
    category: pick(row, ["category", "Category"]),
    quantityPurchased: numberForSnapshot(pick(row, ["quantityPurchased", "Quantity_Purchased", "Quantity Purchased", "Qty", "qty", "Quantity", "quantity"])),
    totalSpent: numberForSnapshot(pick(row, ["totalSpent", "Total_Spent", "Total Spent", "Amount", "amount"])),
    lastPurchased: pick(row, ["lastPurchased", "Last_Purchased", "Last Purchased", "Last_Updated", "Last Updated", "Timestamp", "timestamp"])
  };
}

function normalizeMarketRow(row) {
  const history =
    Array.isArray(row.history)
      ? row.history
      : Array.isArray(row.History)
        ? row.History
        : pick(row, ["history", "History", "Price_History", "Price History", "priceHistory"]);

  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name", "Name", "name"]),
    sector: pick(row, ["sector", "Sector"]),
    currentPrice: numberForSnapshot(pick(row, ["currentPrice", "Current_Price", "Current Price", "Price", "price", "Close", "close"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change", "change", "Price_Change_%", "Price Change %"]),
    trend: pick(row, ["trend", "Trend"]),
    assetType: pick(row, ["assetType", "Asset_Type", "Asset Type", "Type", "type"]),
    previousClose: numberForSnapshot(pick(row, ["previousClose", "Previous_Close", "Previous Close", "Prev_Close", "Prev Close"])),
    dayLow: numberForSnapshot(pick(row, ["dayLow", "Day_Low", "Day Low", "Low", "low"])),
    dayHigh: numberForSnapshot(pick(row, ["dayHigh", "Day_High", "Day High", "High", "high"])),
    volume: numberForSnapshot(pick(row, ["volume", "Volume", "Trade_Volume", "Trade Volume", "Daily_Volume", "Daily Volume"])),
    marketCap: numberForSnapshot(pick(row, ["marketCap", "Market_Cap", "Market Cap", "Market_Value", "Market Value"])),
    history,
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated", "Timestamp", "timestamp", "Updated", "updated"])
  };
}

function normalizePortfolioRow(row) {
  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    sharesOwned: numberForSnapshot(pick(row, ["sharesOwned", "Shares_Owned", "Shares Owned", "Shares", "shares"])),
    avgBuyPrice: numberForSnapshot(pick(row, ["avgBuyPrice", "Avg_Buy_Price", "Avg Buy Price", "Average Buy Price"])),
    totalCost: numberForSnapshot(pick(row, ["totalCost", "Total_Cost", "Total Cost"])),
    currentPrice: numberForSnapshot(pick(row, ["currentPrice", "Current Price", "Current_Price"])),
    marketValue: numberForSnapshot(pick(row, ["marketValue", "Market Value", "Market_Value"])),
    gainLoss: numberForSnapshot(pick(row, ["gainLoss", "Unrealized Gain/Loss", "Unrealized_Gain_Loss", "Unrealized Gain Loss"])),
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated"])
  };
}

function normalizeNewsRow(row) {
  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "Date", "date"]),
    date: pick(row, ["date", "Date"]),
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name"]),
    sector: pick(row, ["sector", "Sector"]),
    headline: pick(row, ["headline", "Headline", "Title", "title"]),
    summary: pick(row, ["summary", "Summary", "Description", "description", "Note", "note"]),
    impact: pick(row, ["impact", "Impact"]),
    sentiment: pick(row, ["sentiment", "Sentiment"]),
    priceBefore: numberForSnapshot(pick(row, ["priceBefore", "Price_Before", "Price Before"])),
    priceAfter: numberForSnapshot(pick(row, ["priceAfter", "Price_After", "Price After"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change"])
  };
}

function normalizeRatingRow(row) {
  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "Date", "date"]),
    ticker: pick(row, ["ticker", "Ticker"]),
    rating: pick(row, ["rating", "Rating", "Prediction", "prediction"]),
    targetPrice: numberForSnapshot(pick(row, ["targetPrice", "Target_Price", "Target Price"])),
    reason: pick(row, ["reason", "Reason"]),
    rewardStatus: pick(row, ["rewardStatus", "Reward_Status", "Reward Status", "Status", "status"]),
    rewardAmount: numberForSnapshot(pick(row, ["rewardAmount", "Reward_Amount", "Reward Amount"])),
    endOfDayPrice: numberForSnapshot(pick(row, ["endOfDayPrice", "End_Of_Day_Price", "End Of Day Price"])),
    accuracy: pick(row, ["accuracy", "Accuracy_%", "Accuracy %"])
  };
}

function getFirstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function pick(row, keys) {
  if (!row) return "";

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  const normalizedMap = {};
  Object.keys(row).forEach((key) => {
    normalizedMap[normalizeKey(key)] = row[key];
  });

  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalizedMap[normalized] !== undefined && normalizedMap[normalized] !== null && normalizedMap[normalized] !== "") {
      return normalizedMap[normalized];
    }
  }

  return "";
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMode(value) {
  const mode = String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toUpperCase();

  if (mode === "BUY" || mode === "SELL") return `STOCK_${mode}`;
  if (mode.includes("STORE")) return "STORE_PURCHASE";
  if (mode.includes("RATING") || mode.includes("PREDICTION")) return "PREDICTION";
  return mode || "ACTIVITY";
}

function sortNewestFirst(a, b) {
  return dateValueForSnapshot(b.timestamp || b.lastUpdated || b.lastPurchased) - dateValueForSnapshot(a.timestamp || a.lastUpdated || a.lastPurchased);
}

const snapshotApi = {
  mergeSnapshot,
  normalizeSnapshot,
  normalizeProfile,
  normalizeStoreItem,
  normalizeTransaction,
  normalizeInventoryItem,
  normalizeMarketRow,
  normalizePortfolioRow,
  normalizeNewsRow,
  normalizeRatingRow,
  getFirstArray,
  pick,
  normalizeKey,
  normalizeMode,
  sortNewestFirst
};

Object.assign(window.Econovaria.core.snapshot, snapshotApi);
Object.assign(window.Econovaria.core, snapshotApi);
