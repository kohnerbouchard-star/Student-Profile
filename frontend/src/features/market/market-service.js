(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketProfile = app.modules.marketProfile = app.modules.marketProfile || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  // display-only
  function cleanTicker(value) {
    return String(value || "").trim().toUpperCase();
  }

  // display-only
  function getMarketRows(sourceState) {
    const rows = getState(sourceState).market;
    return Array.isArray(rows) ? rows : [];
  }

  // display-only
  function findMarketByTicker(ticker, sourceState) {
    const selectedTicker = cleanTicker(ticker);
    return getMarketRows(sourceState).find(function (row) {
      return cleanTicker(row && row.ticker) === selectedTicker;
    }) || null;
  }

  // display-only
  function getSelectedTicker(sourceState, root) {
    const documentRoot = root || global.document;
    const select = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("stockProfileTicker")
      : null;

    if (select && select.value) {
      return cleanTicker(select.value);
    }

    const firstMarket = getMarketRows(sourceState)[0];
    return cleanTicker(firstMarket && firstMarket.ticker);
  }

  // display-only
  function getSelectedStock(sourceState, root) {
    const ticker = getSelectedTicker(sourceState, root);
    return findMarketByTicker(ticker, sourceState) || getMarketRows(sourceState)[0] || null;
  }

  // display-only
  function parseMarketPercent(value) {
    if (value === undefined || value === null || value === "") return 0;

    const raw = String(value).trim();
    const number = Number(raw.replace("%", ""));

    if (!Number.isFinite(number)) return 0;
    if (!raw.includes("%") && Math.abs(number) <= 1) return number * 100;

    return number;
  }

  // display-only
  function sortByAbsoluteMove(rows) {
    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(function (a, b) {
        return Math.abs(parseMarketPercent(b && b.changePct)) - Math.abs(parseMarketPercent(a && a.changePct));
      });
  }

  // display-only
  function getSectorPeers(stock, sourceState) {
    if (!stock) return [];

    return getMarketRows(sourceState)
      .filter(function (row) {
        return row &&
          cleanTicker(row.ticker) !== cleanTicker(stock.ticker) &&
          row.sector &&
          row.sector === stock.sector;
      })
      .slice(0, 6);
  }

  marketProfile.serviceStatus = "extracted";
  marketProfile.cleanTicker = cleanTicker;
  marketProfile.getMarketRows = getMarketRows;
  marketProfile.findMarketByTicker = findMarketByTicker;
  marketProfile.getSelectedTicker = getSelectedTicker;
  marketProfile.getSelectedStock = getSelectedStock;
  marketProfile.parseMarketPercent = parseMarketPercent;
  marketProfile.sortByAbsoluteMove = sortByAbsoluteMove;
  marketProfile.getSectorPeers = getSectorPeers;

  app.modules.marketService = {
    status: "extracted",
    description: "Display-only market data selectors. Official prices and news remain backend data.",
    getMarketRows,
    findMarketByTicker,
    getSelectedTicker,
    getSelectedStock,
    parseMarketPercent,
    sortByAbsoluteMove,
    getSectorPeers
  };
})(window);
