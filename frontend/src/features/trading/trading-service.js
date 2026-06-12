(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const trading = app.modules.trading = app.modules.trading || {};

  function normalizeKey(key) {
    return String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function pick(row, keys) {
    if (typeof global.pick === "function") {
      return global.pick(row, keys);
    }

    if (!row) return "";

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        return row[key];
      }
    }

    const normalizedMap = {};
    Object.keys(row).forEach(function (key) {
      normalizedMap[normalizeKey(key)] = row[key];
    });

    for (let index = 0; index < keys.length; index += 1) {
      const normalized = normalizeKey(keys[index]);
      if (
        normalizedMap[normalized] !== undefined &&
        normalizedMap[normalized] !== null &&
        normalizedMap[normalized] !== ""
      ) {
        return normalizedMap[normalized];
      }
    }

    return "";
  }

  // display-only
  function toNumber(value) {
    if (typeof global.toNumber === "function") {
      return global.toNumber(value);
    }

    const number = Number(String(value ?? "").replace(/[$,%]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function normalizeMode(value) {
    if (typeof global.normalizeMode === "function") {
      return global.normalizeMode(value);
    }

    const mode = String(value || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_")
      .toUpperCase();

    if (mode === "BUY" || mode === "SELL") return `STOCK_${mode}`;
    return mode || "STOCK_TRADE";
  }

  function sortNewestFirst(a, b) {
    if (typeof global.sortNewestFirst === "function") {
      return global.sortNewestFirst(a, b);
    }

    return parseDateValue(b && b.timestamp) - parseDateValue(a && a.timestamp);
  }

  function parseDateValue(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();

    const parsed = Date.parse(String(value).trim().replace(/\./g, "-").replace(" ", "T"));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  // display-only
  function getMarketRows(sourceState) {
    const rows = getState(sourceState).market;
    return Array.isArray(rows) ? rows : [];
  }

  // display-only
  function getTransactionRows(sourceState) {
    const rows = getState(sourceState).transactions;
    return Array.isArray(rows) ? rows : [];
  }

  // display-only
  function isStockTradeRow(row) {
    const mode = String(row && row.mode || "").toUpperCase();
    const itemId = String(row && row.itemId || "").trim();

    return mode.startsWith("STOCK") ||
      mode === "BUY" ||
      mode === "SELL" ||
      Boolean(itemId && mode.includes("TRADE"));
  }

  // display-only
  function normalizeStockTradeRow(row) {
    const action = pick(row, ["mode", "Mode", "action", "Action", "Type", "type"]);
    const ticker = pick(row, ["ticker", "Ticker", "Item_ID", "Item ID"]);
    const shares = pick(row, ["shares", "Shares", "Shares_Owned", "Shares Owned"]);
    const price = pick(row, ["price", "Price", "Current_Price", "Current Price"]);
    const totalValue = pick(row, ["totalValue", "Total_Value", "Total Value", "amount", "Amount"]);
    const companyName = pick(row, ["companyName", "Company_Name", "Company Name", "itemName", "Item_Name", "Item Name"]);

    return {
      timestamp: pick(row, ["timestamp", "Timestamp", "time", "Time", "date", "Date"]),
      mode: normalizeMode(action || "STOCK_TRADE"),
      amount: toNumber(totalValue || price),
      endingBalance: toNumber(pick(row, ["endingBalance", "Ending_Balance", "Ending Balance", "Balance_After", "Balance After", "balanceAfter"])),
      itemId: ticker,
      itemName: companyName || [ticker, shares ? `${shares} shares` : ""].filter(Boolean).join(" - "),
      status: pick(row, ["status", "Status", "Reward_Status", "Reward Status"]) || "Success",
      note: pick(row, ["note", "Note", "Reason", "reason"])
    };
  }

  // display-only
  function getStockTradeRows(sourceState, limit) {
    const maxRows = Number.isFinite(Number(limit)) ? Number(limit) : 10;

    return getTransactionRows(sourceState)
      .filter(isStockTradeRow)
      .sort(sortNewestFirst)
      .slice(0, Math.max(0, maxRows));
  }

  // validation-preview-only
  function readTradeFormPreview(root) {
    const documentRoot = root || global.document;
    const actionInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("tradeAction")
      : null;
    const tickerInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("tradeTicker")
      : null;
    const sharesInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("tradeShares")
      : null;
    const shares = Number(sharesInput && sharesInput.value || 0);

    return {
      action: actionInput && actionInput.value || "BUY",
      ticker: tickerInput && tickerInput.value || "",
      shares,
      isWholeSharePreview: Number.isInteger(shares) && shares > 0
    };
  }

  trading.status = "extracted";
  trading.getMarketRows = getMarketRows;
  trading.getTransactionRows = getTransactionRows;
  trading.isStockTradeRow = isStockTradeRow;
  trading.normalizeStockTradeRow = normalizeStockTradeRow;
  trading.getStockTradeRows = getStockTradeRows;
  trading.readTradeFormPreview = readTradeFormPreview;

  app.modules.tradingService = {
    status: "extracted",
    description: "Trading display and preview helpers. Backend STOCK_TRADE remains authoritative.",
    getMarketRows,
    getTransactionRows,
    isStockTradeRow,
    normalizeStockTradeRow,
    getStockTradeRows,
    readTradeFormPreview
  };
})(window);
