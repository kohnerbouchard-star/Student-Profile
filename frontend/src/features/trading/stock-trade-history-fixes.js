// Compatibility helper for stock trade history.
// Trade Desk rendering lives in frontend/src/features/trading/trading.js.
// This file keeps the stock-trade row normalizer available for partial snapshot merges.

function getStockTradeHistoryRuntime() {
  const root = window.Econovaria || {};
  const core = root.core || {};
  const utils = root.utils || {};
  const runtime = {
    pick: typeof core.pick === 'function' ? core.pick : window.pick,
    normalizeMode: typeof core.normalizeMode === 'function' ? core.normalizeMode : window.normalizeMode,
    toNumber: typeof utils.toNumber === 'function' ? utils.toNumber : window.toNumber
  };
  const missing = Object.keys(runtime).filter((key) => typeof runtime[key] !== 'function');

  if (missing.length) {
    throw new Error(`[Econovaria stock trade history] Missing runtime helpers: ${missing.join(', ')}`);
  }

  return runtime;
}

function normalizeStockTradeRow(row) {
  const runtime = getStockTradeHistoryRuntime();
  const action = runtime.pick(row, ['mode', 'Mode', 'action', 'Action', 'Type', 'type']);
  const ticker = runtime.pick(row, ['ticker', 'Ticker', 'Item_ID', 'Item ID']);
  const shares = runtime.pick(row, ['shares', 'Shares', 'Shares_Owned', 'Shares Owned']);
  const price = runtime.pick(row, ['price', 'Price', 'Current_Price', 'Current Price']);
  const totalValue = runtime.pick(row, ['totalValue', 'Total_Value', 'Total Value', 'amount', 'Amount']);
  const companyName = runtime.pick(row, ['companyName', 'Company_Name', 'Company Name', 'itemName', 'Item_Name', 'Item Name']);

  return {
    timestamp: runtime.pick(row, ['timestamp', 'Timestamp', 'time', 'Time', 'date', 'Date']),
    mode: runtime.normalizeMode(action || 'STOCK_TRADE'),
    amount: runtime.toNumber(totalValue || price),
    endingBalance: runtime.toNumber(runtime.pick(row, ['endingBalance', 'Ending_Balance', 'Ending Balance', 'Balance_After', 'Balance After', 'balanceAfter'])),
    itemId: ticker,
    itemName: companyName || [ticker, shares ? `${shares} shares` : ''].filter(Boolean).join(' · '),
    status: runtime.pick(row, ['status', 'Status', 'Reward_Status', 'Reward Status']) || 'Success',
    note: runtime.pick(row, ['note', 'Note', 'Reason', 'reason'])
  };
}

window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.trading = window.Econovaria.features.trading || {};
Object.assign(window.Econovaria.features.trading, { normalizeStockTradeRow, stockTradeHistoryFixLoaded: true });
