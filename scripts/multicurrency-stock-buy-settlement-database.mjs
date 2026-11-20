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

function normalizeFxCountryFixture() {
  runSql(`
    update public.country_profiles
    set status = 'disabled'
    where id = ${sqlLiteral(FIXTURE.countryId)}::uuid
      and country_code = 'TST'
      and currency_code = 'ECO';
  `);
}

function initializeFx(targetGame) {
  runSql(`
    insert into public.game_settings(game_session_id, stock_market_window)
    values (${sqlLiteral(targetGame.id)}::uuid, jsonb_build_object('timezone', 'UTC'))
    on conflict (game_session_id) do update
    set stock_market_window = excluded.stock_market_window;

    insert into public.country_economic_snapshots (
      game_session_id, country_profile_id, snapshot_sequence, effective_at,
      snapshot_label, difficulty_policy_profile_id, difficulty_preset,
      metadata, created_at
    )
    select
      ${sqlLiteral(targetGame.id)}::uuid,
      country_row.id,
      0,
      statement_timestamp() - interval '2 minutes',
      'C3C Stock buy settlement acceptance',
      difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'multicurrency-stock-buy-settlement-database'),
      statement_timestamp() - interval '3 minutes'
    from public.country_profiles as country_row
    join public.difficulty_policy_profiles as difficulty_row
      on difficulty_row.preset_key = 'standard'
    where country_row.status = 'active';

    select public.initialize_fx_authority_for_game_v1(
      ${sqlLiteral(targetGame.id)}::uuid,
      clock_timestamp() - interval '1 minute',
      true
    )::text;
  `);
}

function activateGame(targetGame) {
  runSql(`
    update public.game_sessions
    set lifecycle_state = 'active',
        status = 'active',
        started_at = coalesce(started_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where id = ${sqlLiteral(targetGame.id)}::uuid;
  `);
}

resetFixture();
normalizeFxCountryFixture();
initializeFx(game);
activateGame(game);

runSql(`
  select * from public.initialize_stock_market_assets_for_game(
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

runSql(`
  insert into public.stock_price_ticks (
    game_session_id, stock_asset_id, tick_index, ticker, price, previous_price,
    log_return, change_pct, volume, current_volatility, long_run_volatility,
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
    0, 0, 0,
    asset_row.current_volatility,
    asset_row.long_run_volatility,
    jsonb_build_object('fixture', 'c3c')
  from public.game_session_stock_assets as asset_row
  where asset_row.id = ${sqlLiteral(asset.id)}::uuid;
`);

const tick = json(`
  select jsonb_build_object('tickIndex', tick_index, 'price', price)
  from public.stock_price_ticks
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and stock_asset_id = ${sqlLiteral(asset.id)}::uuid
  order by tick_index desc
  limit 1
`);

const openAt = json(`
  select to_jsonb(candidate_at)
  from generate_series(
    '2026-08-28T08:00:00Z'::timestamptz,
    '2026-08-28T16:59:00Z'::timestamptz,
    interval '1 minute'
  ) as candidate_at
  where public.is_stock_market_open_at(${sqlLiteral(game.id)}::uuid, candidate_at)
  order by candidate_at
  limit 1
`);
assert.ok(openAt, "C3C fixture requires a deterministic open exchange instant.");

runSql(`
  begin;
  set local role service_role;
  select * from public.create_player_session_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    repeat('c', 64),
    clock_timestamp() + interval '12 hours'
  );
  commit;
`);

const sessionState = json(`
  select jsonb_build_object(
    'count', count(*),
    'eligible', count(*) filter (
      where status = 'active'
        and revoked_at is null
        and expires_at > ${sqlLiteral(openAt)}::timestamptz
    )
  )
  from public.player_sessions
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and player_id = ${sqlLiteral(playerId)}::uuid
`);
assert.equal(Number(sessionState.eligible), 1, "C3C fixture must provision exactly one settlement-eligible Player session.");

runSql(`
  select * from public.record_player_ledger_entry(
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
    jsonb_build_object('bankTransactionIdempotencyKey', 'c3c-listing-currency-seed')
  );
`);

const account = json(`
  select jsonb_build_object('id', account_row.id, 'key', account_row.public_key)
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.game_session_id = account_row.game_session_id
   and party_row.id = account_row.party_id
  where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and party_row.party_kind = 'player'
    and party_row.player_id = ${sqlLiteral(playerId)}::uuid
    and account_row.account_kind = 'checking'
    and account_row.currency_code = ${sqlLiteral(asset.currencyCode)}
    and account_row.status = 'active'
  order by account_row.created_at, account_row.id
  limit 1
`);
assert.match(account.key, /^bac_[0-9a-f]{32}$/u);

const grossValue = Number(json(`
  select to_jsonb(round(
    ${sqlLiteral(asset.price)}::numeric * ${quantity}::numeric,
    ${Number(asset.currencyDecimals)}
  ))
`));
const allocations = JSON.stringify([
  { sourceAccountKey: account.key, targetAmount: String(grossValue) },
]);

runSql(`
  select public.initialize_stock_market_liquidity_accounts_v1(
    ${sqlLiteral(game.id)}::uuid
  );
`);

const liquidity = json(`
  select jsonb_build_object('id', account_row.id, 'key', account_row.public_key)
  from public.stock_market_liquidity_accounts as binding_row
  join public.bank_accounts as account_row
    on account_row.id = binding_row.bank_account_id
   and account_row.game_session_id = binding_row.game_session_id
  where binding_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and binding_row.currency_code = ${sqlLiteral(asset.currencyCode)}
`);
assert.match(liquidity.key, /^bac_[0-9a-f]{32}$/u);

const quoteSql = (quoteIdempotency) => `
  private.create_stock_buy_quote_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(asset.ticker)},
    ${quantity},
    ${sqlLiteral(asset.price)}::numeric,
    ${Number(tick.tickIndex)}::bigint,
    ${sqlLiteral(allocations)}::jsonb,
    ${sqlLiteral(quoteIdempotency)},
    ${sqlLiteral(openAt)}::timestamptz
  )
`;

const settleSql = (quoteKey, settlementIdempotency, at = openAt) => `
  private.settle_stock_buy_quote_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(quoteKey)},
    ${sqlLiteral(settlementIdempotency)},
    ${sqlLiteral(at)}::timestamptz
  )
`;

function balances() {
  return json(`
    select jsonb_build_object(
      'source', (
        select balance from public.account_balances
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and bank_account_id = ${sqlLiteral(account.id)}::uuid
      ),
      'liquidity', (
        select balance from public.account_balances
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and bank_account_id = ${sqlLiteral(liquidity.id)}::uuid
      ),
      'orders', (
        select count(*) from public.stock_orders
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and settlement_evidence_family = 'c3'
      ),
      'trades', (
        select count(*) from public.stock_trades
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and settlement_evidence_family = 'c3'
      ),
      'receipts', (
        select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and source_domain = 'stocks'
          and source_action = 'immediate_buy_funding'
      ),
      'holdingQuantity', coalesce((
        select quantity from public.stock_holdings
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and player_id = ${sqlLiteral(playerId)}::uuid
          and stock_asset_id = ${sqlLiteral(asset.id)}::uuid
      ), 0)
    )
  `);
}

const firstQuote = json(`select ${quoteSql('c3c-buy-quote-0001')}`);
const before = balances();
const first = json(`select ${settleSql(firstQuote.quote_key, 'c3c-buy-settle-0001')}`);

assert.equal(first.quote_key, firstQuote.quote_key);
assert.equal(first.ticker, asset.ticker);
assert.equal(first.listing_currency_code, asset.currencyCode);
assert.equal(Number(first.quantity), quantity);
assert.equal(Number(first.execution_price), Number(asset.price));
assert.equal(Number(first.price_tick_index), Number(tick.tickIndex));
assert.equal(Number(first.gross_value), grossValue);
assert.equal(first.already_completed, false);
assert.match(first.funding.receipt_key, /^pfr_[0-9a-f]{32}$/u);
assert.equal(first.funding.target_account_key, liquidity.key);
assert.equal(first.funding.target_currency_code, asset.currencyCode);
assert.equal(Number(first.funding.target_amount), grossValue);

const after = balances();
assert.equal(Number(after.source), Number(before.source) - grossValue);
assert.equal(Number(after.liquidity), Number(before.liquidity) + grossValue);
assert.equal(Number(after.orders), Number(before.orders) + 1);
assert.equal(Number(after.trades), Number(before.trades) + 1);
assert.equal(Number(after.receipts), Number(before.receipts) + 1);
assert.equal(Number(after.holdingQuantity), Number(before.holdingQuantity) + quantity);

const persisted = json(`
  select jsonb_build_object(
    'quoteKey', quote_row.public_key,
    'orderCount', count(*) over (),
    'family', order_row.settlement_evidence_family,
    'side', order_row.side,
    'price', order_row.execution_price,
    'tick', order_row.price_tick_index,
    'gross', order_row.gross_value,
    'currency', order_row.listing_currency_code,
    'fundingQuoteMatches', order_row.funding_quote_id = quote_row.funding_quote_id,
    'receiptMatches', receipt_row.quote_id = quote_row.funding_quote_id,
    'transactionMatches', order_row.funding_bank_transaction_id = receipt_row.bank_transaction_id,
    'targetMatches', order_row.market_liquidity_account_id = receipt_row.target_account_id,
    'tradeMatches', trade_row.execution_price = order_row.execution_price
      and trade_row.price_tick_index = order_row.price_tick_index
      and trade_row.gross_value = order_row.gross_value
  )
  from public.stock_orders as order_row
  join public.stock_buy_quotes as quote_row
    on quote_row.id = order_row.stock_buy_quote_id
  join public.purchase_funding_receipts as receipt_row
    on receipt_row.id = order_row.funding_receipt_id
  join public.stock_trades as trade_row
    on trade_row.order_id = order_row.id
  where order_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and quote_row.public_key = ${sqlLiteral(firstQuote.quote_key)}
`);
assert.equal(persisted.quoteKey, firstQuote.quote_key);
assert.equal(Number(persisted.orderCount), 1);
assert.equal(persisted.family, 'c3');
assert.equal(persisted.side, 'buy');
assert.equal(persisted.fundingQuoteMatches, true);
assert.equal(persisted.receiptMatches, true);
assert.equal(persisted.transactionMatches, true);
assert.equal(persisted.targetMatches, true);
assert.equal(persisted.tradeMatches, true);

const replayBefore = balances();
const replay = json(`select ${settleSql(firstQuote.quote_key, 'c3c-buy-settle-0001')}`);
const replayAfter = balances();
assert.equal(replay.already_completed, true);
assert.equal(replay.quote_key, first.quote_key);
assert.deepEqual(replayAfter, replayBefore, 'C3C replay must not move money or shares twice.');

expectSqlError(
  `select ${settleSql(firstQuote.quote_key, 'c3c-buy-settle-conflict')};`,
  /STOCK_BUY_SETTLEMENT_QUOTE_CONSUMED/u,
);

const secondQuote = json(`select ${quoteSql('c3c-buy-quote-0002')}`);
expectSqlError(
  `select ${settleSql(secondQuote.quote_key, 'c3c-buy-settle-0001')};`,
  /STOCK_BUY_SETTLEMENT_IDEMPOTENCY_CONFLICT/u,
);

for (const stage of [
  'after_funding',
  'after_holding',
  'after_order',
  'after_trade',
  'after_evidence',
]) {
  const failureQuote = json(`select ${quoteSql(`c3c-failure-quote-${stage}`)}`);
  const failureBefore = balances();
  expectSqlError(
    `begin;
     set local app.stock_buy_settlement_fail_stage = ${sqlLiteral(stage)};
     select ${settleSql(failureQuote.quote_key, `c3c-failure-settle-${stage}`)};
     commit;`,
    new RegExp(`STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:${stage}`, 'u'),
  );
  const failureAfter = balances();
  assert.deepEqual(
    failureAfter,
    failureBefore,
    `C3C injected failure ${stage} must roll back money, shares, orders, trades, and evidence.`,
  );
}

const staleQuote = json(`select ${quoteSql('c3c-stale-tick-quote')}`);
runSql(`
  insert into public.stock_price_ticks (
    game_session_id, stock_asset_id, tick_index, ticker, price, previous_price,
    log_return, change_pct, volume, current_volatility, long_run_volatility,
    explanation
  ) values (
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(asset.id)}::uuid,
    ${Number(tick.tickIndex) + 1},
    ${sqlLiteral(asset.ticker)},
    ${sqlLiteral(asset.price)}::numeric,
    ${sqlLiteral(asset.price)}::numeric,
    0, 0, 0,
    ${sqlLiteral(asset.currentVolatility)}::numeric,
    ${sqlLiteral(asset.longRunVolatility)}::numeric,
    jsonb_build_object('fixture', 'c3c-stale-tick')
  );
`);
expectSqlError(
  `select ${settleSql(staleQuote.quote_key, 'c3c-stale-tick-settle')};`,
  /STOCK_BUY_SETTLEMENT_TICK_CHANGED/u,
);

expectSqlError(
  `begin;
   set local role authenticated;
   select public.settle_stock_buy_quote_v1(
     ${sqlLiteral(game.id)}::uuid,
     ${sqlLiteral(playerId)}::uuid,
     ${sqlLiteral(secondQuote.quote_key)},
     'c3c-browser-denied'
   );
   commit;`,
  /permission denied/u,
);

expectSqlError(
  `begin;
   set local role service_role;
   select private.settle_stock_buy_quote_at_v1(
     ${sqlLiteral(game.id)}::uuid,
     ${sqlLiteral(playerId)}::uuid,
     ${sqlLiteral(secondQuote.quote_key)},
     'c3c-private-clock-denied',
     ${sqlLiteral(openAt)}::timestamptz
   );
   commit;`,
  /permission denied/u,
);

console.log('Multi-currency Stock funding C3C database acceptance: PASS');