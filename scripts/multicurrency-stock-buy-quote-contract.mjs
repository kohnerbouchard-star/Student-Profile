#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const quoteMigration = readFileSync(
  "backend/supabase/migrations/20260827111500_multicurrency_stock_buy_quote_v1.sql",
  "utf8",
);
const clockMigration = readFileSync(
  "backend/supabase/migrations/20260827111600_multicurrency_stock_buy_quote_clock_v1.sql",
  "utf8",
);
const assertionsMigration = readFileSync(
  "backend/supabase/migrations/20260827111700_multicurrency_stock_buy_quote_assertions_v1.sql",
  "utf8",
);
const combined = `${quoteMigration}\n${clockMigration}\n${assertionsMigration}`;

assert.match(quoteMigration, /create table public\.stock_buy_quotes/iu);
assert.match(quoteMigration, /'sbq_'\s*\|\|/iu);
assert.match(quoteMigration, /unique \(funding_quote_id\)/iu);
assert.match(quoteMigration, /references public\.purchase_funding_quotes\(id, game_session_id\)/iu);
assert.match(quoteMigration, /alter table public\.stock_buy_quotes enable row level security/iu);
assert.match(quoteMigration, /alter table public\.stock_buy_quotes force row level security/iu);
assert.match(quoteMigration, /guard_stock_buy_quotes_immutable/iu);
assert.match(quoteMigration, /private\.purchase_funding_quote_public_json_v1/iu);
assert.match(quoteMigration, /public\.create_purchase_funding_quote_v1/iu);
assert.match(quoteMigration, /'stocks\.immediate-buy'/iu);
assert.match(quoteMigration, /STOCK_BUY_QUOTE_PRICE_CHANGED/iu);
assert.match(quoteMigration, /STOCK_BUY_QUOTE_TICK_CHANGED/iu);
assert.match(quoteMigration, /p_expected_price <> v_asset\.current_price/iu);
assert.match(quoteMigration, /p_expected_tick_index <> v_latest_tick\.tick_index/iu);
assert.match(quoteMigration, /funding_context_key <> v_quote_public_key/iu);
assert.match(quoteMigration, /funding_context_hash <> v_request_hash/iu);
assert.match(quoteMigration, /target_amount <> v_gross/iu);

assert.match(clockMigration, /private\.create_stock_buy_quote_at_v1/iu);
assert.match(clockMigration, /public\.is_stock_market_open_at\(p_game_session_id, p_at\)/iu);
assert.match(clockMigration, /clock_timestamp\(\)/iu);
assert.match(
  clockMigration,
  /revoke all on function private\.create_stock_buy_quote_at_v1[\s\S]*from public, anon, authenticated, service_role/iu,
);
assert.match(
  clockMigration,
  /grant execute on function public\.create_stock_buy_quote_v1[\s\S]*to service_role/iu,
);
assert.match(
  clockMigration,
  /revoke all on function public\.create_stock_buy_quote_v1[\s\S]*from public, anon, authenticated/iu,
);

assert.match(assertionsMigration, /browser_quote_table_privilege/iu);
assert.match(assertionsMigration, /browser_public_quote_execute/iu);
assert.match(assertionsMigration, /private_clock_execute_exposed/iu);
assert.match(assertionsMigration, /funding_binding_mismatch/iu);

for (const forbidden of [
  /insert\s+into\s+public\.stock_orders/iu,
  /update\s+public\.stock_orders/iu,
  /delete\s+from\s+public\.stock_orders/iu,
  /insert\s+into\s+public\.stock_trades/iu,
  /update\s+public\.stock_trades/iu,
  /insert\s+into\s+public\.stock_holdings/iu,
  /update\s+public\.stock_holdings/iu,
  /execute_stock_market_order/iu,
  /record_player_ledger_entry/iu,
  /post_balanced_bank_transaction_v2/iu,
  /settle_purchase_funding/iu,
]) {
  assert.doesNotMatch(
    combined,
    forbidden,
    `C3B must remain quote-only and must not match ${forbidden}`,
  );
}

assert.doesNotMatch(
  quoteMigration.match(/stock_buy_quote_public_json_v1[\s\S]*?\$function\$;/iu)?.[0] ?? "",
  /game_session_id|player_id|stock_asset_id|funding_quote_id|bank_account_id|\bid\b\s*[,)]/iu,
  "C3B public projection must not expose internal UUID identifiers.",
);

console.log("Multi-currency Stock funding C3B quote authority contract: PASS");
