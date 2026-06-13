window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

function mergeSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot || {});

  state = {
    ...emptyState(),
    ...state,
    ...normalized,
    profile: normalized.profile || state.profile || null,
    store: normalized.store,
    transactions: normalized.transactions,
    inventory: normalized.inventory,
    market: normalized.market,
    portfolio: normalized.portfolio,
    ratings: normalized.ratings,
    news: normalized.news
  };
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
    balance: toNumber(pick(row, ["balance", "Balance", "Current_Balance", "Current Balance"])),
    active: pick(row, ["active", "Active", "Status", "status"]) || "Active"
  };
}

function normalizeStoreItem(row) {
  return {
    itemId: pick(row, ["itemId", "Item_ID", "Item ID", "id", "ID"]),
    itemName: pick(row, ["itemName", "Item_Name", "Item Name", "name", "Name"]),
    price: toNumber(pick(row, ["price", "Price"])),
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
    amount: toNumber(pick(row, ["amount", "Amount", "Total_Value", "Total Value", "totalValue", "Price", "price"])),
    endingBalance: toNumber(pick(row, ["endingBalance", "Ending_Balance", "Ending Balance", "Balance_After", "Balance After", "balanceAfter"])),
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
    quantityPurchased: toNumber(pick(row, ["quantityPurchased", "Quantity_Purchased", "Quantity Purchased", "Qty", "qty", "Quantity", "quantity"])),
    totalSpent: toNumber(pick(row, ["totalSpent", "Total_Spent", "Total Spent", "Amount", "amount"])),
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
    currentPrice: toNumber(pick(row, ["currentPrice", "Current_Price", "Current Price", "Price", "price", "Close", "close"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change", "change", "Price_Change_%", "Price Change %"]),
    trend: pick(row, ["trend", "Trend"]),
    assetType: pick(row, ["assetType", "Asset_Type", "Asset Type", "Type", "type"]),
    previousClose: toNumber(pick(row, ["previousClose", "Previous_Close", "Previous Close", "Prev_Close", "Prev Close"])),
    dayLow: toNumber(pick(row, ["dayLow", "Day_Low", "Day Low", "Low", "low"])),
    dayHigh: toNumber(pick(row, ["dayHigh", "Day_High", "Day High", "High", "high"])),
    volume: toNumber(pick(row, ["volume", "Volume", "Trade_Volume", "Trade Volume", "Daily_Volume", "Daily Volume"])),
    marketCap: toNumber(pick(row, ["marketCap", "Market_Cap", "Market Cap", "Market_Value", "Market Value"])),
    history,
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated", "Timestamp", "timestamp", "Updated", "updated"])
  };
}

function normalizePortfolioRow(row) {
  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    sharesOwned: toNumber(pick(row, ["sharesOwned", "Shares_Owned", "Shares Owned", "Shares", "shares"])),
    avgBuyPrice: toNumber(pick(row, ["avgBuyPrice", "Avg_Buy_Price", "Avg Buy Price", "Average Buy Price"])),
    totalCost: toNumber(pick(row, ["totalCost", "Total_Cost", "Total Cost"])),
    currentPrice: toNumber(pick(row, ["currentPrice", "Current Price", "Current_Price"])),
    marketValue: toNumber(pick(row, ["marketValue", "Market Value", "Market_Value"])),
    gainLoss: toNumber(pick(row, ["gainLoss", "Unrealized Gain/Loss", "Unrealized_Gain_Loss", "Unrealized Gain Loss"])),
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
    priceBefore: toNumber(pick(row, ["priceBefore", "Price_Before", "Price Before"])),
    priceAfter: toNumber(pick(row, ["priceAfter", "Price_After", "Price After"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change"])
  };
}

function normalizeRatingRow(row) {
  return {
    timestamp: pick(row, ["timestamp", "Timestamp", "Date", "date"]),
    ticker: pick(row, ["ticker", "Ticker"]),
    rating: pick(row, ["rating", "Rating", "Prediction", "prediction"]),
    targetPrice: toNumber(pick(row, ["targetPrice", "Target_Price", "Target Price"])),
    reason: pick(row, ["reason", "Reason"]),
    rewardStatus: pick(row, ["rewardStatus", "Reward_Status", "Reward Status", "Status", "status"]),
    rewardAmount: toNumber(pick(row, ["rewardAmount", "Reward_Amount", "Reward Amount"])),
    endOfDayPrice: toNumber(pick(row, ["endOfDayPrice", "End_Of_Day_Price", "End Of Day Price"])),
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
  return parseDateValue(b.timestamp || b.lastUpdated || b.lastPurchased) - parseDateValue(a.timestamp || a.lastUpdated || a.lastPurchased);
}

Object.assign(window.Econovaria.core, {
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
});
