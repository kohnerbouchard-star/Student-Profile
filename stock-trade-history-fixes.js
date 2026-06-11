// Compatibility patch for stock trade history.
// Some backend snapshots return trade history separately from general transactions.

function normalizeStockTradeRow(row) {
  const action = pick(row, ['mode', 'Mode', 'action', 'Action', 'Type', 'type']);
  const ticker = pick(row, ['ticker', 'Ticker', 'Item_ID', 'Item ID']);
  const shares = pick(row, ['shares', 'Shares', 'Shares_Owned', 'Shares Owned']);
  const price = pick(row, ['price', 'Price', 'Current_Price', 'Current Price']);
  const totalValue = pick(row, ['totalValue', 'Total_Value', 'Total Value', 'amount', 'Amount']);
  const companyName = pick(row, ['companyName', 'Company_Name', 'Company Name', 'itemName', 'Item_Name', 'Item Name']);

  return {
    timestamp: pick(row, ['timestamp', 'Timestamp', 'time', 'Time', 'date', 'Date']),
    mode: normalizeMode(action || 'STOCK_TRADE'),
    amount: toNumber(totalValue || price),
    endingBalance: toNumber(pick(row, ['endingBalance', 'Ending_Balance', 'Ending Balance', 'Balance_After', 'Balance After', 'balanceAfter'])),
    itemId: ticker,
    itemName: companyName || [ticker, shares ? `${shares} shares` : ''].filter(Boolean).join(' · '),
    status: pick(row, ['status', 'Status', 'Reward_Status', 'Reward Status']) || 'Success',
    note: pick(row, ['note', 'Note', 'Reason', 'reason'])
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

  const generalTransactions = getFirstArray(snapshot, [
    'transactions',
    'recentTransactions',
    'history',
    'transactionHistory',
    'activity',
    'recentActivity'
  ]).map(normalizeTransaction);

  const stockTrades = getFirstArray(snapshot, [
    'stockTrades',
    'stockTradeLog',
    'tradeLog',
    'trades',
    'recentTrades',
    'stockTransactions',
    'stockHistory',
    'Stock_Trade_Log',
    'Stock_Trade'
  ]).map(normalizeStockTradeRow);

  return {
    profile: profileSource ? normalizeProfile(profileSource) : null,
    store: getFirstArray(snapshot, ['store', 'storeItems', 'items', 'availableItems']).map(normalizeStoreItem),
    transactions: [...generalTransactions, ...stockTrades].sort(sortNewestFirst),
    inventory: getFirstArray(snapshot, ['inventory', 'studentInventory', 'itemsOwned', 'ownedItems']).map(normalizeInventoryItem),
    market: getFirstArray(snapshot, ['market', 'stocks', 'stockMarket', 'marketRows']).map(normalizeMarketRow),
    portfolio: getFirstArray(snapshot, ['portfolio', 'holdings', 'positions', 'stockPortfolio']).map(normalizePortfolioRow),
    ratings: getFirstArray(snapshot, ['ratings', 'predictions', 'analystRatings', 'ratingHistory']).map(normalizeRatingRow).sort(sortNewestFirst)
  };
}

function getStockTradeRows() {
  return (state.transactions || [])
    .filter((t) => {
      const mode = String(t.mode || '').toUpperCase();
      const itemId = String(t.itemId || '').trim();
      return mode.startsWith('STOCK') || mode === 'BUY' || mode === 'SELL' || Boolean(itemId && mode.includes('TRADE'));
    })
    .sort(sortNewestFirst)
    .slice(0, 10);
}

function renderTrade() {
  const marketRows = state.market || [];
  const stockTx = getStockTradeRows();

  document.getElementById('trade').innerHTML = `
    <div class="market-ticker">
      ${marketRows.slice(0, 24).map((m) => `<div class="ticker-pill"><strong>${sanitize(m.ticker)}</strong> ${money(m.currentPrice)} <span>${sanitize(m.trend || '')}</span></div>`).join('')}
    </div>

    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Place a Trade ${tip('Buy or sell shares during the trading window.')}</h2>
          <span class="badge ${can('STOCK_TRADE') ? 'good' : 'bad'}">${can('STOCK_TRADE') ? 'Ready' : 'Unavailable'}</span>
        </div>
        ${help('BUY spends your balance. SELL gives money back if you own enough shares.')}

        <div class="form-grid" id="tradeForm">
          <label>
            <span class="field-label">Action ${tip('BUY purchases shares. SELL sells shares you already own.')}</span>
            <select id="tradeAction"><option>BUY</option><option>SELL</option></select>
          </label>

          <label>
            <span class="field-label">Stock ${tip('Choose the ticker you want to trade.')}</span>
            <select id="tradeTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join('')}
            </select>
          </label>

          <label class="span-2">
            <span class="field-label">Shares ${tip('Enter a whole number of shares.')}</span>
            <input id="tradeShares" type="number" min="1" value="1" />
          </label>

          <button id="tradeSubmitButton" class="primary-btn span-2" type="button" ${can('STOCK_TRADE') ? '' : 'disabled'} onclick="submitTrade(this)">Submit Trade</button>
        </div>

        <div id="tradeStatus" class="status-box">Trades are checked against your balance and current holdings.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Recent Trades ${tip('Your confirmed stock trades appear here. If this is empty, press Refresh after trading.')}</h2>
        ${table(stockTx, ['timestamp', 'mode', 'itemId', 'itemName', 'amount', 'endingBalance', 'status'], 'No stock trades yet. Press Refresh if you just completed a trade.')}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2 class="card-title">Market Board ${tip('Use this table to compare current prices before trading.')}</h2>
      ${table(marketRows.slice(0, 40), ['ticker', 'companyName', 'sector', 'currentPrice', 'changePct', 'trend', 'assetType'], 'No market data is available right now.')}
    </div>`;
}
