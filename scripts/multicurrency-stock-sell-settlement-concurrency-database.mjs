#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  FIXTURE,
  PSQL_ARGS,
  runJson,
  sqlLiteral,
} from './business-phase10-atomic-settlement-database-support.mjs';

const game = FIXTURE.games.one;
const playerId = game.buyerOneId;

function json(sql) {
  return runJson(`select (${sql})::text;`);
}

function runConcurrentSql(sql) {
  const input = String.raw`\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on
set statement_timeout = '30s';
set lock_timeout = '10s';
${sql}
`;
  return new Promise((resolve, reject) => {
    const child = spawn('psql', PSQL_ARGS, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output: stdout.trim(), error: stderr.trim() }));
    child.stdin.end(input);
  });
}

const asset = json(`
  select jsonb_build_object(
    'id', h.stock_asset_id,
    'ticker', h.ticker,
    'quantity', h.quantity,
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
    and h.quantity - h.reserved_quantity >= 2
  order by h.created_at limit 1
`);
assert.ok(asset, 'C3D concurrency fixture requires at least two unreserved shares from C3C.');

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
assert.ok(openAt);

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

const liquidity = json(`
  select jsonb_build_object('id', a.id, 'key', a.public_key)
  from public.stock_market_liquidity_accounts b
  join public.bank_accounts a
    on a.id = b.bank_account_id and a.game_session_id = b.game_session_id
  where b.game_session_id = ${sqlLiteral(game.id)}::uuid
    and b.currency_code = ${sqlLiteral(asset.currencyCode)}
`);

function state() {
  return json(`
    select jsonb_build_object(
      'destination', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(destination.id)}::uuid),
      'liquidity', (select balance from public.account_balances where bank_account_id = ${sqlLiteral(liquidity.id)}::uuid),
      'holding', (select quantity from public.stock_holdings where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and stock_asset_id = ${sqlLiteral(asset.id)}::uuid),
      'orders', (select count(*) from public.stock_orders where game_session_id = ${sqlLiteral(game.id)}::uuid and player_id = ${sqlLiteral(playerId)}::uuid and side = 'sell' and settlement_evidence_family = 'c3'),
      'transactions', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(game.id)}::uuid and source_domain = 'stocks' and source_action = 'immediate_sell_proceeds')
    )
  `);
}

const sellQuantity = 1.5;
const gross = Number(json(`select to_jsonb(round(${sqlLiteral(asset.price)}::numeric * ${sellQuantity}::numeric, ${Number(asset.currencyDecimals)}))`));
const before = state();

const settlement = (key) => `
begin;
select (private.settle_stock_sell_at_v1(
  ${sqlLiteral(game.id)}::uuid,
  ${sqlLiteral(playerId)}::uuid,
  ${sqlLiteral(asset.ticker)},
  ${sellQuantity}::numeric,
  ${sqlLiteral(asset.price)}::numeric,
  ${Number(tick.tickIndex)}::bigint,
  ${sqlLiteral(destination.key)},
  ${sqlLiteral(key)},
  ${sqlLiteral(openAt)}::timestamptz
))::text;
select pg_sleep(1);
commit;
`;

const results = await Promise.all([
  runConcurrentSql(settlement('c3d-concurrent-sell-a')),
  runConcurrentSql(settlement('c3d-concurrent-sell-b')),
]);

const winners = results.filter((r) => r.status === 0);
const losers = results.filter((r) => r.status !== 0);
if (winners.length !== 1 || losers.length !== 1) {
  console.error('C3D concurrent session outcomes:', JSON.stringify(results, null, 2));
}
assert.equal(winners.length, 1, `Expected one C3D concurrent winner, got ${winners.length}.`);
assert.equal(losers.length, 1, `Expected one C3D concurrent loser, got ${losers.length}.`);
assert.match(losers[0].error, /STOCK_SELL_SETTLEMENT_SHARES_INSUFFICIENT/u);
assert.match(winners[0].output, /"already_completed"\s*:\s*false/u);

const after = state();
assert.equal(Number(after.destination), Number(before.destination) + gross);
assert.equal(Number(after.liquidity), Number(before.liquidity) - gross);
assert.equal(Number(after.holding), Number(before.holding) - sellQuantity);
assert.equal(Number(after.orders), Number(before.orders) + 1);
assert.equal(Number(after.transactions), Number(before.transactions) + 1);
assert.ok(Number(after.holding) >= 0, 'Concurrent C3D sells must never create a negative holding.');

console.log('Multi-currency Stock funding C3D concurrent sell oversubscription acceptance: PASS');
