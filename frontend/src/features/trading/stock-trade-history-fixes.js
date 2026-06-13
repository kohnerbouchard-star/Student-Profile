// Compatibility helper for stock trade history.
// Trade Desk rendering lives in frontend/src/features/trading/trading.js.
// This file keeps the stock-trade row normalizer available for partial snapshot merges.

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

window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.trading = window.Econovaria.features.trading || {};
Object.assign(window.Econovaria.features.trading, { normalizeStockTradeRow, stockTradeHistoryFixLoaded: true });
