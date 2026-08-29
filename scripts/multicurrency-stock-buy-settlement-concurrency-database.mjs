#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  FIXTURE,
  PSQL_ARGS,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const game = FIXTURE.games.one;
const playerId = game.buyerOneId;
const quantity = 1;

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
    const child = spawn("psql", PSQL_ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({
      status,
      output: stdout.trim(),
      error: stderr.trim(),
    }));
    child.stdin.end(input);
  });
}

const asset = json(`
  select jsonb_build_object(
    'id', asset_row.id,
    'ticker', asset_row.ticker,
    'price', asset_row.current_price,
    'currencyCode', asset_row.listing_currency_code,
    'currencyDecimals', currency_row.decimal_places
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
assert.ok(openAt, "C3C concurrency acceptance requires an open exchange instant.");

runSql(`
  update public.player_sessions
  set status = 'active', revoked_at = null,
      expires_at = greatest(expires_at, ${sqlLiteral(openAt)}::timestamptz + interval '1 day')
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and player_id = ${sqlLiteral(playerId)}::uuid;
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

runSql(`
  select private.ensure_stock_market_liquidity_account_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(asset.currencyCode)}
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

const grossValue = Number(json(`
  select to_jsonb(round(
    ${sqlLiteral(asset.price)}::numeric * ${quantity}::numeric,
    ${Number(asset.currencyDecimals)}
  ))
`));
const allocations = JSON.stringify([
  { sourceAccountKey: account.key, targetAmount: String(grossValue) },
]);

const quote = json(`
  select private.create_stock_buy_quote_at_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(asset.ticker)},
    ${quantity},
    ${sqlLiteral(asset.price)}::numeric,
    ${Number(tick.tickIndex)}::bigint,
    ${sqlLiteral(allocations)}::jsonb,
    'c3c-concurrency-quote-0001',
    ${sqlLiteral(openAt)}::timestamptz
  )
`);

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
          and stock_buy_quote_id = (
            select id from public.stock_buy_quotes
            where public_key = ${sqlLiteral(quote.quote_key)}
          )
      ),
      'trades', (
        select count(*) from public.stock_trades as trade_row
        join public.stock_orders as order_row on order_row.id = trade_row.order_id
        where order_row.game_session_id = ${sqlLiteral(game.id)}::uuid
          and order_row.stock_buy_quote_id = (
            select id from public.stock_buy_quotes
            where public_key = ${sqlLiteral(quote.quote_key)}
          )
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

const before = balances();
const settlement = (idempotencyKey) => `
begin;
select (private.settle_stock_buy_quote_at_v1(
  ${sqlLiteral(game.id)}::uuid,
  ${sqlLiteral(playerId)}::uuid,
  ${sqlLiteral(quote.quote_key)},
  ${sqlLiteral(idempotencyKey)},
  ${sqlLiteral(openAt)}::timestamptz
))::text;
select pg_sleep(1);
commit;
`;

const results = await Promise.all([
  runConcurrentSql(settlement('c3c-concurrency-settle-a')),
  runConcurrentSql(settlement('c3c-concurrency-settle-b')),
]);

const winners = results.filter((result) => result.status === 0);
const losers = results.filter((result) => result.status !== 0);
if (winners.length !== 1 || losers.length !== 1) {
  console.error('C3C concurrent session outcomes:', JSON.stringify(results, null, 2));
}
assert.equal(winners.length, 1, `Expected one concurrent winner, received ${winners.length}.`);
assert.equal(losers.length, 1, `Expected one concurrent loser, received ${losers.length}.`);
assert.match(losers[0].error, /STOCK_BUY_SETTLEMENT_QUOTE_CONSUMED/u);
assert.match(winners[0].output, /"already_completed"\s*:\s*false/u);

const after = balances();
assert.equal(Number(after.source), Number(before.source) - grossValue);
assert.equal(Number(after.liquidity), Number(before.liquidity) + grossValue);
assert.equal(Number(after.orders), Number(before.orders) + 1);
assert.equal(Number(after.trades), Number(before.trades) + 1);
assert.equal(Number(after.holdingQuantity), Number(before.holdingQuantity) + quantity);

console.log('Multi-currency Stock funding C3C true-concurrency acceptance: PASS');
