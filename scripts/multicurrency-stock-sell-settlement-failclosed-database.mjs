#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  expectSqlError,
  FIXTURE,
  runJson,
  runSql,
  sqlLiteral,
} from './business-phase10-atomic-settlement-database-support.mjs';

const game = FIXTURE.games.one;
const playerId = game.buyerOneId;

function json(sql) {
  return runJson(`select (${sql})::text;`);
}

const fixture = json(`
  select jsonb_build_object(
    'assetId', h.stock_asset_id,
    'ticker', h.ticker,
    'quantity', h.quantity,
    'price', a.current_price,
    'currencyCode', a.listing_currency_code,
    'currencyDecimals', c.decimal_places,
    'tickIndex', t.tick_index,
    'destinationId', destination.id,
    'destinationKey', destination.public_key,
    'liquidityId', liquidity.id,
    'liquidityBalance', liquidity_balance.balance
  )
  from public.stock_holdings h
  join public.game_session_stock_assets a
    on a.id = h.stock_asset_id and a.game_session_id = h.game_session_id
  join public.currencies c on c.code = a.listing_currency_code
  join lateral (
    select tick_index
    from public.stock_price_ticks t0
    where t0.game_session_id = h.game_session_id
      and t0.stock_asset_id = h.stock_asset_id
    order by tick_index desc limit 1
  ) t on true
  join public.economic_parties ep
    on ep.game_session_id = h.game_session_id
   and ep.player_id = h.player_id
   and ep.party_kind = 'player'
  join public.bank_accounts destination
    on destination.game_session_id = ep.game_session_id
   and destination.party_id = ep.id
   and destination.account_kind = 'checking'
   and destination.currency_code = a.listing_currency_code
   and destination.status = 'active'
  join public.stock_market_liquidity_accounts binding
    on binding.game_session_id = h.game_session_id
   and binding.currency_code = a.listing_currency_code
  join public.bank_accounts liquidity
    on liquidity.id = binding.bank_account_id
   and liquidity.game_session_id = binding.game_session_id
  join public.account_balances liquidity_balance
    on liquidity_balance.bank_account_id = liquidity.id
   and liquidity_balance.game_session_id = liquidity.game_session_id
  where h.game_session_id = ${sqlLiteral(game.id)}::uuid
    and h.player_id = ${sqlLiteral(playerId)}::uuid
    and h.quantity - h.reserved_quantity >= 1
  order by h.created_at, destination.created_at
  limit 1
`);
assert.ok(fixture);
assert.ok(Number(fixture.liquidityBalance) > 0);

const openAt = json(`
  select to_jsonb(candidate_at)
  from generate_series('2026-08-28T08:00:00Z'::timestamptz, '2026-08-28T16:59:00Z'::timestamptz, interval '1 minute') candidate_at
  where public.is_stock_market_open_at(${sqlLiteral(game.id)}::uuid, candidate_at)
  order by candidate_at limit 1
`);
const closedAt = '2026-08-30T12:00:00Z';
assert.equal(Boolean(json(`select to_jsonb(public.is_stock_market_open_at(${sqlLiteral(game.id)}::uuid, ${sqlLiteral(closedAt)}::timestamptz))`)), false);

const sellSql = (price, tickIndex, key, at = openAt) => `
  private.settle_stock_sell_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(fixture.ticker)},
    1::numeric,
    ${sqlLiteral(price)}::numeric,
    ${Number(tickIndex)}::bigint,
    ${sqlLiteral(fixture.destinationKey)},
    ${sqlLiteral(key)},
    ${sqlLiteral(at)}::timestamptz
  )
`;

function economicState() {
  return json(`
    select jsonb_build_object(
      'destination', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(fixture.destinationId)}::uuid),
      'liquidity', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(fixture.liquidityId)}::uuid),
      'holding', (select quantity from public.stock_holdings where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and stock_asset_id = ${sqlLiteral(fixture.assetId)}::uuid),
      'sellOrders', (select count(*) from public.stock_orders where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and side = 'sell' and settlement_evidence_family = 'c3'),
      'sellTransactions', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(game.id)}::uuid and source_domain = 'stocks' and source_action = 'immediate_sell_proceeds')
    )
  `);
}

let before = economicState();
expectSqlError(
  `select ${sellSql(fixture.price, fixture.tickIndex, 'c3d-market-closed', closedAt)};`,
  /STOCK_SELL_SETTLEMENT_MARKET_CLOSED/u,
);
assert.deepEqual(economicState(), before, 'Closed-market C3D rejection must not mutate economic state.');

before = economicState();
const wrongPrice = Number(fixture.price) + 1;
expectSqlError(
  `select ${sellSql(wrongPrice, fixture.tickIndex, 'c3d-price-mismatch')};`,
  /STOCK_SELL_SETTLEMENT_PRICE_CHANGED/u,
);
assert.deepEqual(economicState(), before, 'Price-mismatch C3D rejection must not mutate economic state.');

const highPrice = Number(fixture.liquidityBalance) + Math.max(1, Number(fixture.price));
const highTick = Number(fixture.tickIndex) + 1;
runSql(`
  update public.game_session_stock_assets
  set current_price = ${sqlLiteral(highPrice)}::numeric,
      updated_at = clock_timestamp()
  where id = ${sqlLiteral(fixture.assetId)}::uuid
    and game_session_id = ${sqlLiteral(game.id)}::uuid;

  insert into public.stock_price_ticks(
    game_session_id, stock_asset_id, tick_index, ticker, price, previous_price,
    log_return, change_pct, volume, current_volatility, long_run_volatility, explanation
  )
  select game_session_id, id, ${highTick}, ticker, ${sqlLiteral(highPrice)}::numeric, ${sqlLiteral(fixture.price)}::numeric,
         0, 0, 0, current_volatility, long_run_volatility,
         jsonb_build_object('fixture','c3d-insufficient-market-liquidity')
  from public.game_session_stock_assets
  where id = ${sqlLiteral(fixture.assetId)}::uuid;
`);

before = economicState();
assert.ok(Number(before.holding) >= 1, 'Liquidity rejection fixture must retain sufficient shares.');
assert.ok(Number(before.liquidity) < highPrice, 'Liquidity rejection fixture must make market liquidity insufficient while shares are sufficient.');
expectSqlError(
  `select ${sellSql(highPrice, highTick, 'c3d-liquidity-insufficient')};`,
  /BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT/u,
);
assert.deepEqual(economicState(), before, 'Insufficient-liquidity C3D rejection must not mutate money, shares, orders, or settlement evidence.');

console.log('Multi-currency Stock funding C3D fail-closed market/liquidity acceptance: PASS');
