#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  expectSqlError,
  FIXTURE,
  resetFixture,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const game = FIXTURE.games.one;
const playerId = game.buyerOneId;
const quantity = 2;

function json(sql) {
  return runJson(`select (${sql})::text;`);
}

resetFixture();

runSql(`
  select *
  from public.initialize_stock_market_assets_for_game(
    ${sqlLiteral(game.id)}::uuid,
    'missing_only'
  );
`);

const asset = json(`
  select jsonb_build_object(
    'id', asset_row.id,
    'ticker', asset_row.ticker,
    'price', asset_row.current_price,
    'currencyCode', asset_row.listing_currency_code,
    'currencyDecimals', currency_row.decimal_places,
    'currentVolatility', asset_row.current_volatility,
    'longRunVolatility', asset_row.long_run_volatility
  )
  from public.game_session_stock_assets as asset_row
  join public.currencies as currency_row
    on currency_row.code = asset_row.listing_currency_code
   and currency_row.status = 'active'
  where asset_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and asset_row.is_active = true
  order by asset_row.ticker
  limit 1
`);

assert.match(asset.ticker, /^[A-Z0-9][A-Z0-9._-]{0,31}$/u);
assert.match(asset.currencyCode, /^[A-Z][A-Z0-9_]{1,15}$/u);

runSql(`
  insert into public.stock_price_ticks (
    game_session_id,
    stock_asset_id,
    tick_index,
    ticker,
    price,
    previous_price,
    log_return,
    change_pct,
    volume,
    current_volatility,
    long_run_volatility,
    explanation
  )
  select
    asset_row.game_session_id,
    asset_row.id,
    coalesce((
      select max(tick_row.tick_index) + 1
      from public.stock_price_ticks as tick_row
      where tick_row.game_session_id = asset_row.game_session_id
        and tick_row.stock_asset_id = asset_row.id
    ), 0),
    asset_row.ticker,
    asset_row.current_price,
    asset_row.current_price,
    0,
    0,
    0,
    asset_row.current_volatility,
    asset_row.long_run_volatility,
    jsonb_build_object('fixture', 'c3b')
  from public.game_session_stock_assets as asset_row
  where asset_row.id = ${sqlLiteral(asset.id)}::uuid;
`);

const tick = json(`
  select jsonb_build_object(
    'tickIndex', tick_row.tick_index,
    'price', tick_row.price
  )
  from public.stock_price_ticks as tick_row
  where tick_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and tick_row.stock_asset_id = ${sqlLiteral(asset.id)}::uuid
  order by tick_row.tick_index desc
  limit 1
`);

assert.equal(String(tick.price), String(asset.price));

const openAt = json(`
  select to_jsonb(candidate_at)
  from generate_series(
    '2026-08-31T00:00:00Z'::timestamptz,
    '2026-09-04T08:00:00Z'::timestamptz,
    interval '1 hour'
  ) as candidate_at
  where public.is_stock_market_open_at(
    ${sqlLiteral(game.id)}::uuid,
    candidate_at
  )
  order by candidate_at
  limit 1
`);
assert.ok(openAt, "Fixture must expose at least one authoritative open market instant.");

const closedAt = json(`
  select to_jsonb(candidate_at)
  from generate_series(
    '2026-08-29T00:00:00Z'::timestamptz,
    '2026-08-30T23:00:00Z'::timestamptz,
    interval '1 hour'
  ) as candidate_at
  where not public.is_stock_market_open_at(
    ${sqlLiteral(game.id)}::uuid,
    candidate_at
  )
  order by candidate_at
  limit 1
`);
assert.ok(closedAt, "Fixture must expose at least one authoritative closed market instant.");

runSql(`
  select *
  from public.record_player_ledger_entry(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    'checking',
    1000,
    ${sqlLiteral(asset.currencyCode)},
    'credit',
    'setup',
    'initial_balance_seed',
    ${sqlLiteral(playerId)}::uuid,
    'system',
    null,
    jsonb_build_object(
      'bankTransactionIdempotencyKey', 'c3b-listing-currency-seed'
    )
  );
`);

const accountKey = json(`
  select to_jsonb(account_row.public_key)
  from public.bank_accounts as account_row
  where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and account_row.player_id = ${sqlLiteral(playerId)}::uuid
    and account_row.account_kind = 'checking'
    and account_row.currency_code = ${sqlLiteral(asset.currencyCode)}
    and account_row.status = 'active'
  order by account_row.created_at, account_row.id
  limit 1
`);
assert.match(accountKey, /^bac_[0-9a-f]{32}$/u);

const grossValue = json(`
  select to_jsonb(round(
    ${sqlLiteral(asset.price)}::numeric * ${quantity}::numeric,
    ${Number(asset.currencyDecimals)}
  ))
`);
assert.ok(Number(grossValue) > 0);

const allocations = JSON.stringify([
  { sourceAccountKey: accountKey, targetAmount: String(grossValue) },
]);

const before = json(`
  select jsonb_build_object(
    'stockQuoteCount', (select count(*) from public.stock_buy_quotes),
    'fundingQuoteCount', (select count(*) from public.purchase_funding_quotes),
    'bankTransactionCount', (
      select count(*) from public.bank_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'ledgerCount', (
      select count(*) from public.ledger_entries
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'orderCount', (
      select count(*) from public.stock_orders
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'tradeCount', (
      select count(*) from public.stock_trades
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'holdingCount', (
      select count(*) from public.stock_holdings
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    )
  )
`);

const quoteSql = ({
  idempotencyKey = "c3b-buy-quote-0001",
  requestedQuantity = quantity,
  expectedPrice = asset.price,
  expectedTick = tick.tickIndex,
  at = openAt,
  allocationJson = allocations,
} = {}) => `
  private.create_stock_buy_quote_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(asset.ticker)},
    ${requestedQuantity},
    ${sqlLiteral(expectedPrice)}::numeric,
    ${Number(expectedTick)}::bigint,
    ${sqlLiteral(allocationJson)}::jsonb,
    ${sqlLiteral(idempotencyKey)},
    ${sqlLiteral(at)}::timestamptz
  )
`;

const first = json(`select ${quoteSql()}`);
assert.match(first.quote_key, /^sbq_[0-9a-f]{32}$/u);
assert.equal(first.ticker, asset.ticker);
assert.equal(first.listing_currency_code, asset.currencyCode);
assert.equal(Number(first.quantity), quantity);
assert.equal(String(first.quoted_price), String(asset.price));
assert.equal(Number(first.price_tick_index), Number(tick.tickIndex));
assert.equal(Number(first.gross_value), Number(grossValue));
assert.match(first.funding.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(first.funding.target_currency_code, asset.currencyCode);
assert.equal(Number(first.funding.target_amount), Number(grossValue));
assert.equal(first.funding.funding_context_kind, "stocks.immediate-buy");
assert.equal(first.funding.funding_context_key, first.quote_key);
assert.equal(first.funding.allocations.length, 1);
assert.equal(first.funding.allocations[0].source_account_key, accountKey);

const replay = json(`select ${quoteSql()}`);
assert.deepEqual(replay, first, "C3B exact replay must return the original quote pair.");

expectSqlError(
  `select ${quoteSql({ requestedQuantity: quantity + 1 })};`,
  /STOCK_BUY_QUOTE_IDEMPOTENCY_CONFLICT/u,
);

expectSqlError(
  `select ${quoteSql({
    idempotencyKey: "c3b-buy-quote-wrong-price",
    expectedPrice: Number(asset.price) + 1,
  })};`,
  /STOCK_BUY_QUOTE_PRICE_CHANGED/u,
);

expectSqlError(
  `select ${quoteSql({
    idempotencyKey: "c3b-buy-quote-wrong-tick",
    expectedTick: Number(tick.tickIndex) + 1,
  })};`,
  /STOCK_BUY_QUOTE_TICK_CHANGED/u,
);

expectSqlError(
  `select ${quoteSql({
    idempotencyKey: "c3b-buy-quote-closed",
    at: closedAt,
  })};`,
  /STOCK_BUY_QUOTE_MARKET_CLOSED/u,
);

expectSqlError(
  `begin;
   set local role authenticated;
   select public.create_stock_buy_quote_v1(
     ${sqlLiteral(game.id)}::uuid,
     ${sqlLiteral(playerId)}::uuid,
     ${sqlLiteral(asset.ticker)},
     ${quantity},
     ${sqlLiteral(asset.price)}::numeric,
     ${Number(tick.tickIndex)}::bigint,
     ${sqlLiteral(allocations)}::jsonb,
     'c3b-browser-denied'
   );
   commit;`,
  /permission denied/u,
);

expectSqlError(
  `begin;
   set local role service_role;
   select private.create_stock_buy_quote_at_v1(
     ${sqlLiteral(game.id)}::uuid,
     ${sqlLiteral(playerId)}::uuid,
     ${sqlLiteral(asset.ticker)},
     ${quantity},
     ${sqlLiteral(asset.price)}::numeric,
     ${Number(tick.tickIndex)}::bigint,
     ${sqlLiteral(allocations)}::jsonb,
     'c3b-clock-denied',
     ${sqlLiteral(openAt)}::timestamptz
   );
   commit;`,
  /permission denied/u,
);

expectSqlError(
  `update public.stock_buy_quotes
   set gross_value = gross_value + 1
   where public_key = ${sqlLiteral(first.quote_key)};`,
  /STOCK_BUY_QUOTE_IMMUTABLE/u,
);

const after = json(`
  select jsonb_build_object(
    'stockQuoteCount', (select count(*) from public.stock_buy_quotes),
    'fundingQuoteCount', (select count(*) from public.purchase_funding_quotes),
    'bankTransactionCount', (
      select count(*) from public.bank_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'ledgerCount', (
      select count(*) from public.ledger_entries
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'orderCount', (
      select count(*) from public.stock_orders
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'tradeCount', (
      select count(*) from public.stock_trades
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'holdingCount', (
      select count(*) from public.stock_holdings
      where game_session_id = ${sqlLiteral(game.id)}::uuid
    ),
    'bindingMismatchCount', (
      select count(*)
      from public.stock_buy_quotes as stock_quote
      join public.purchase_funding_quotes as funding_quote
        on funding_quote.id = stock_quote.funding_quote_id
      where funding_quote.game_session_id <> stock_quote.game_session_id
         or funding_quote.player_id <> stock_quote.player_id
         or funding_quote.target_currency_code <> stock_quote.listing_currency_code
         or funding_quote.target_amount <> stock_quote.gross_value
         or funding_quote.funding_context_kind <> 'stocks.immediate-buy'
         or funding_quote.funding_context_key <> stock_quote.public_key
         or funding_quote.funding_context_hash <> stock_quote.request_hash
         or funding_quote.expires_at <> stock_quote.expires_at
    )
  )
`);

assert.equal(Number(after.stockQuoteCount), Number(before.stockQuoteCount) + 1);
assert.equal(Number(after.fundingQuoteCount), Number(before.fundingQuoteCount) + 1);
assert.equal(Number(after.bankTransactionCount), Number(before.bankTransactionCount));
assert.equal(Number(after.ledgerCount), Number(before.ledgerCount));
assert.equal(Number(after.orderCount), Number(before.orderCount));
assert.equal(Number(after.tradeCount), Number(before.tradeCount));
assert.equal(Number(after.holdingCount), Number(before.holdingCount));
assert.equal(Number(after.bindingMismatchCount), 0);

const persisted = json(`
  select jsonb_build_object(
    'quoteKey', stock_quote.public_key,
    'fundingKey', funding_quote.public_key,
    'ticker', stock_quote.ticker,
    'currencyCode', stock_quote.listing_currency_code,
    'quantity', stock_quote.quantity,
    'price', stock_quote.quoted_price,
    'tickIndex', stock_quote.price_tick_index,
    'gross', stock_quote.gross_value,
    'sameExpiry', stock_quote.expires_at = funding_quote.expires_at,
    'sameContextKey', funding_quote.funding_context_key = stock_quote.public_key,
    'sameContextHash', funding_quote.funding_context_hash = stock_quote.request_hash
  )
  from public.stock_buy_quotes as stock_quote
  join public.purchase_funding_quotes as funding_quote
    on funding_quote.id = stock_quote.funding_quote_id
  where stock_quote.public_key = ${sqlLiteral(first.quote_key)}
`);

assert.equal(persisted.quoteKey, first.quote_key);
assert.equal(persisted.fundingKey, first.funding.quote_key);
assert.equal(persisted.sameExpiry, true);
assert.equal(persisted.sameContextKey, true);
assert.equal(persisted.sameContextHash, true);

console.log("Multi-currency Stock funding C3B database acceptance: PASS");
