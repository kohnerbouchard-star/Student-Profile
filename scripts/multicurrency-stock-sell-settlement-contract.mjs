import fs from 'node:fs';

const migrationPath = 'backend/supabase/migrations/20260827113000_multicurrency_stock_sell_settlement_v1.sql';
const source = fs.readFileSync(migrationPath, 'utf8');

const required = [
  'private.settle_stock_sell_at_v1',
  'public.settle_stock_sell_v1',
  'private.post_bank_transaction_v1',
  "'stocks.market-liquidity'",
  "'immediate_sell_proceeds'",
  "'STOCK_SELL_SETTLEMENT_SHARES_INSUFFICIENT'",
  "'STOCK_SELL_SETTLEMENT_DESTINATION_INVALID'",
  "'STOCK_SELL_SETTLEMENT_MARKET_CLOSED'",
  "'STOCK_SELL_SETTLEMENT_PRICE_CHANGED'",
  "'STOCK_SELL_SETTLEMENT_TICK_CHANGED'",
  "'STOCK_SELL_SETTLEMENT_IDEMPOTENCY_CONFLICT'",
  "settlement_evidence_family = 'c3'",
  "'sell', 'market'",
  "'after_funding'",
  "'after_holding'",
  "'after_order'",
  "'after_trade'",
  "'after_evidence'",
  'to service_role'
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`C3D sell settlement contract missing: ${token}`);
}

const forbidden = [
  'record_player_ledger_entry(',
  'update public.account_balances',
  'insert into public.ledger_entries',
  'limit_order',
  'partial_fill',
  'short_sell',
  'margin'
];
for (const token of forbidden) {
  if (source.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`C3D sell settlement introduced forbidden authority: ${token}`);
  }
}

console.log('Multi-currency Stock funding C3D sell settlement source contract: PASS');
