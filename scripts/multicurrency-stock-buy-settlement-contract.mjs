#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settlement = readFileSync(
  "backend/supabase/migrations/20260827112000_multicurrency_stock_buy_settlement_v1.sql",
  "utf8",
);
const clock = readFileSync(
  "backend/supabase/migrations/20260827112100_multicurrency_stock_buy_settlement_clock_v1.sql",
  "utf8",
);
const assertions = readFileSync(
  "backend/supabase/migrations/20260827112200_multicurrency_stock_buy_settlement_assertions_v1.sql",
  "utf8",
);
const combined = `${settlement}\n${clock}\n${assertions}`;

assert.match(settlement, /add column stock_buy_quote_id uuid null/iu);
assert.match(settlement, /references public\.stock_buy_quotes\(id, game_session_id\)/iu);
assert.match(settlement, /create unique index stock_orders_stock_buy_quote_unique/iu);
assert.match(settlement, /where stock_buy_quote_id is not null/iu);
assert.match(settlement, /private\.compose_purchase_funding_v1/iu);
assert.match(settlement, /'stocks\.market-liquidity'/iu);
assert.match(settlement, /'stocks\.immediate-buy'/iu);
assert.match(settlement, /'immediate_buy_funding'/iu);
assert.match(settlement, /insert into public\.stock_holdings|update public\.stock_holdings/iu);
assert.match(settlement, /insert into public\.stock_orders/iu);
assert.match(settlement, /insert into public\.stock_trades/iu);
assert.match(settlement, /settlement_evidence_family[\s\S]*'c3'/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_PRICE_CHANGED/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_TICK_CHANGED/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_QUOTE_EXPIRED/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_MARKET_CLOSED/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_QUOTE_CONSUMED/iu);
assert.match(settlement, /STOCK_BUY_SETTLEMENT_IDEMPOTENCY_CONFLICT/iu);

for (const stage of [
  "after_funding",
  "after_holding",
  "after_order",
  "after_trade",
  "after_evidence",
]) {
  assert.match(combined, new RegExp(`STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:${stage}`, "iu"));
}

assert.match(clock, /private\.settle_stock_buy_quote_at_v1/iu);
assert.match(clock, /v_now timestamptz := p_at/iu);
assert.match(clock, /public\.is_stock_market_open_at\(p_game_session_id, v_now\)/iu);
assert.match(clock, /clock_timestamp\(\)/iu);
assert.match(
  clock,
  /revoke all on function private\.settle_stock_buy_quote_at_v1[\s\S]*from public, anon, authenticated, service_role/iu,
);
assert.match(
  clock,
  /grant execute on function public\.settle_stock_buy_quote_v1[\s\S]*to service_role/iu,
);

assert.match(assertions, /C3C_ASSERT_STOCK_QUOTE_CONSUMPTION_UNIQUE_MISSING/iu);
assert.match(assertions, /C3C_ASSERT_ORDER_EVIDENCE_SHAPE_INVALID/iu);
assert.match(assertions, /C3C_ASSERT_PUBLIC_SETTLEMENT_ACL_INVALID/iu);
assert.match(assertions, /C3C_ASSERT_PRIVATE_CLOCK_ACL_INVALID/iu);

for (const forbidden of [
  /insert\s+into\s+public\.ledger_entries/iu,
  /update\s+public\.account_balances/iu,
  /insert\s+into\s+public\.account_balances/iu,
  /record_player_ledger_entry/iu,
  /post_balanced_bank_transaction_v2/iu,
  /execute_stock_market_order\s*\(/iu,
]) {
  assert.doesNotMatch(
    combined,
    forbidden,
    `C3C Stock settlement must compose C0/B2 authority rather than match ${forbidden}`,
  );
}

const publicProjection =
  settlement.match(/stock_buy_settlement_public_json_v1[\s\S]*?\$function\$;/iu)?.[0] ?? "";
for (const privateKey of [
  "game_session_id",
  "player_id",
  "stock_asset_id",
  "stock_buy_quote_id",
  "funding_quote_id",
  "funding_receipt_id",
  "bank_account_id",
  "order_id",
  "trade_id",
]) {
  assert.doesNotMatch(
    publicProjection,
    new RegExp(`['\"]${privateKey}['\"]\\s*,`, "iu"),
    `C3C public result must not expose internal key ${privateKey}.`,
  );
}

console.log("Multi-currency Stock funding C3C settlement contract: PASS");
