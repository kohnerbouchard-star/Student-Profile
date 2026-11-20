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

const asset = json(`
  select jsonb_build_object(
    'id', h.stock_asset_id,
    'ticker', h.ticker,
    'quantity', h.quantity,
    'averageCost', h.average_cost,
    'realizedPnl', h.realized_pnl,
    'price', a.current_price,
    'currencyCode', a.listing_currency_code,
    'currencyDecimals', c.decimal_places
  )
  from public.stock_holdings h
  join public.game_session_stock_assets a
    on a.id = h.stock_asset_id and a.game_session_id = h.game_session_id
  join public.currencies c on c.code = a.listing_currency_code
  where h.game_session_id = ${sqlLiteral(game.id)}::uuid
    and h.player_id = ${sqlLiteral(playerId)}::uuid
    and h.quantity > h.reserved_quantity
  order by h.created_at
  limit 1
`);
assert.ok(asset, 'C3D acceptance requires the certified C3C buy fixture holding.');

const tick = json(`
  select jsonb_build_object('tickIndex', tick_index, 'price', price)
  from public.stock_price_ticks
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and stock_asset_id = ${sqlLiteral(asset.id)}::uuid
  order by tick_index desc limit 1
`);
assert.equal(Number(tick.price), Number(asset.price));

const openAt = json(`
  select to_jsonb(candidate_at)
  from generate_series(
    '2026-08-28T08:00:00Z'::timestamptz,
    '2026-08-28T16:59:00Z'::timestamptz,
    interval '1 minute'
  ) candidate_at
  where public.is_stock_market_open_at(${sqlLiteral(game.id)}::uuid, candidate_at)
  order by candidate_at limit 1
`);
assert.ok(openAt, 'C3D fixture requires a deterministic open exchange instant.');

const destination = json(`
  select jsonb_build_object('id', a.id, 'key', a.public_key)
  from public.bank_accounts a
  join public.economic_parties ep
    on ep.id = a.party_id and ep.game_session_id = a.game_session_id
  where a.game_session_id = ${sqlLiteral(game.id)}::uuid
    and ep.party_kind = 'player'
    and ep.player_id = ${sqlLiteral(playerId)}::uuid
    and a.account_kind = 'checking'
    and a.currency_code = ${sqlLiteral(asset.currencyCode)}
    and a.status = 'active'
  order by a.created_at, a.id limit 1
`);
assert.match(destination.key, /^bac_[0-9a-f]{32}$/u);

const liquidity = json(`
  select jsonb_build_object('id', a.id, 'key', a.public_key)
  from public.stock_market_liquidity_accounts b
  join public.bank_accounts a
    on a.id = b.bank_account_id and a.game_session_id = b.game_session_id
  where b.game_session_id = ${sqlLiteral(game.id)}::uuid
    and b.currency_code = ${sqlLiteral(asset.currencyCode)}
`);
assert.match(liquidity.key, /^bac_[0-9a-f]{32}$/u);

const sellSql = (quantity, key, price = asset.price, tickIndex = tick.tickIndex, at = openAt, destinationKey = destination.key) => `
  private.settle_stock_sell_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(asset.ticker)},
    ${quantity}::numeric,
    ${sqlLiteral(price)}::numeric,
    ${Number(tickIndex)}::bigint,
    ${sqlLiteral(destinationKey)},
    ${sqlLiteral(key)},
    ${sqlLiteral(at)}::timestamptz
  )
`;

function state() {
  return json(`
    select jsonb_build_object(
      'destination', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(destination.id)}::uuid),
      'liquidity', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(liquidity.id)}::uuid),
      'holdingQuantity', (select quantity from public.stock_holdings where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and stock_asset_id = ${sqlLiteral(asset.id)}::uuid),
      'realizedPnl', (select realized_pnl from public.stock_holdings where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and stock_asset_id = ${sqlLiteral(asset.id)}::uuid),
      'sellOrders', (select count(*) from public.stock_orders where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and side = 'sell' and settlement_evidence_family = 'c3'),
      'sellTrades', (select count(*) from public.stock_trades where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and side = 'sell' and settlement_evidence_family = 'c3'),
      'sellTransactions', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(game.id)}::uuid and source_domain = 'stocks' and source_action = 'immediate_sell_proceeds')
    )
  `);
}

const sellQuantity = 1;
const gross = Number(json(`select to_jsonb(round(${sqlLiteral(asset.price)}::numeric * ${sellQuantity}::numeric, ${Number(asset.currencyDecimals)}))`));
const before = state();
const first = json(`select ${sellSql(sellQuantity, 'c3d-sell-settle-0001')}`);
const after = state();

assert.equal(first.ticker, asset.ticker);
assert.equal(first.listing_currency_code, asset.currencyCode);
assert.equal(Number(first.quantity), sellQuantity);
assert.equal(Number(first.execution_price), Number(asset.price));
assert.equal(Number(first.price_tick_index), Number(tick.tickIndex));
assert.equal(Number(first.gross_value), gross);
assert.equal(first.destination_account_key, destination.key);
assert.match(first.settlement_transaction_key, /^btx_[0-9a-f]{32}$/u);
assert.equal(first.already_completed, false);
assert.equal(Number(after.destination), Number(before.destination) + gross);
assert.equal(Number(after.liquidity), Number(before.liquidity) - gross);
assert.equal(Number(after.holdingQuantity), Number(before.holdingQuantity) - sellQuantity);
assert.equal(Number(after.sellOrders), Number(before.sellOrders) + 1);
assert.equal(Number(after.sellTrades), Number(before.sellTrades) + 1);
assert.equal(Number(after.sellTransactions), Number(before.sellTransactions) + 1);

const persisted = json(`
  select jsonb_build_object(
    'side', o.side,
    'family', o.settlement_evidence_family,
    'destinationMatches', o.destination_bank_account_id = ${sqlLiteral(destination.id)}::uuid,
    'liquidityMatches', o.market_liquidity_account_id = ${sqlLiteral(liquidity.id)}::uuid,
    'transactionMatches', o.settlement_bank_transaction_id = tx.id,
    'tradeMatches', tr.order_id = o.id and tr.price_tick_index = o.price_tick_index and tr.gross_value = o.gross_value,
    'lineSum', (select sum(le.amount) from public.ledger_entries le where le.bank_transaction_id = tx.id)
  )
  from public.stock_orders o
  join public.bank_transactions tx on tx.id = o.settlement_bank_transaction_id
  join public.stock_trades tr on tr.order_id = o.id
  where o.game_session_id = ${sqlLiteral(game.id)}::uuid
    and o.player_id = ${sqlLiteral(playerId)}::uuid
    and o.idempotency_key = 'c3d-sell-settle-0001'
`);
assert.equal(persisted.side, 'sell');
assert.equal(persisted.family, 'c3');
assert.equal(persisted.destinationMatches, true);
assert.equal(persisted.liquidityMatches, true);
assert.equal(persisted.transactionMatches, true);
assert.equal(persisted.tradeMatches, true);
assert.equal(Number(persisted.lineSum), 0);

const replayBefore = state();
const replay = json(`select ${sellSql(sellQuantity, 'c3d-sell-settle-0001')}`);
assert.equal(replay.already_completed, true);
assert.deepEqual(state(), replayBefore, 'C3D replay must not move money or shares twice.');

expectSqlError(
  `select ${sellSql(sellQuantity + 1, 'c3d-sell-settle-0001')};`,
  /STOCK_SELL_SETTLEMENT_IDEMPOTENCY_CONFLICT/u,
);
expectSqlError(
  `select ${sellSql(999999, 'c3d-sell-shares-insufficient')};`,
  /STOCK_SELL_SETTLEMENT_SHARES_INSUFFICIENT/u,
);
expectSqlError(
  `select ${sellSql(1, 'c3d-sell-wrong-destination', asset.price, tick.tickIndex, openAt, 'bac_00000000000000000000000000000000')};`,
  /STOCK_SELL_SETTLEMENT_DESTINATION_INVALID/u,
);

for (const stage of ['after_funding', 'after_holding', 'after_order', 'after_trade', 'after_evidence']) {
  const snapshot = state();
  expectSqlError(
    `begin;
     set local app.stock_sell_settlement_fail_stage = ${sqlLiteral(stage)};
     select ${sellSql(0.1, `c3d-failure-${stage}`)};
     commit;`,
    new RegExp(`STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:${stage}`, 'u'),
  );
  assert.deepEqual(state(), snapshot, `C3D injected failure ${stage} must roll back money, shares, order, trade, and evidence.`);
}

runSql(`
  insert into public.stock_price_ticks(
    game_session_id, stock_asset_id, tick_index, ticker, price, previous_price,
    log_return, change_pct, volume, current_volatility, long_run_volatility, explanation
  )
  select game_session_id, id, ${Number(tick.tickIndex) + 1}, ticker, current_price, current_price,
         0, 0, 0, current_volatility, long_run_volatility, jsonb_build_object('fixture','c3d-stale')
  from public.game_session_stock_assets where id = ${sqlLiteral(asset.id)}::uuid;
`);
expectSqlError(
  `select ${sellSql(0.1, 'c3d-stale-tick')};`,
  /STOCK_SELL_SETTLEMENT_TICK_CHANGED/u,
);

console.log('Multi-currency Stock funding C3D sell settlement database acceptance: PASS');
