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

const gameId = FIXTURE.games.one.id;

function json(sql) {
  return runJson(`select (${sql})::text;`);
}

function count(sql) {
  const result = json(`select jsonb_build_object('count', count(*)) from (${sql}) rows`);
  return Number(result.count);
}

resetFixture();

const templateState = json(`
  select jsonb_build_object(
    'activeTemplateCount', count(*) filter (where template_row.is_active),
    'activeCountryCount', count(distinct template_row.country_code)
      filter (where template_row.is_active),
    'activeCurrencyCount', count(distinct template_row.listing_currency_code)
      filter (where template_row.is_active),
    'mismatchCount', count(*) filter (
      where template_row.listing_currency_code is distinct from profile_row.currency_code
         or currency_row.code is null
         or profile_row.status <> 'active'
         or currency_row.status <> 'active'
    )
  )
  from public.stock_templates as template_row
  left join public.country_profiles as profile_row
    on profile_row.country_code = template_row.country_code
   and profile_row.status = 'active'
  left join public.currencies as currency_row
    on currency_row.code = template_row.listing_currency_code
`);

assert.ok(
  Number(templateState.activeTemplateCount) > 0,
  "C3A requires active Stock templates.",
);
assert.equal(
  Number(templateState.activeCountryCount),
  10,
  "C3A must retain the ten official issuer countries.",
);
assert.equal(
  Number(templateState.activeCurrencyCount),
  10,
  "C3A must resolve one official listing currency per issuer country.",
);
assert.equal(
  Number(templateState.mismatchCount),
  0,
  "Every Stock template must use its issuer country's active canonical currency.",
);

runSql(`
  select *
  from public.initialize_stock_market_assets_for_game(
    ${sqlLiteral(gameId)}::uuid,
    'missing_only'
  );
`);

const runtimeState = json(`
  select jsonb_build_object(
    'runtimeCount', count(*),
    'activeRuntimeCount', count(*) filter (where asset_row.is_active),
    'activeTemplateCount', (
      select count(*) from public.stock_templates where is_active = true
    ),
    'activeCurrencyCount', count(distinct asset_row.listing_currency_code)
      filter (where asset_row.is_active),
    'mappingMismatchCount', count(*) filter (
      where asset_row.listing_currency_code is distinct from profile_row.currency_code
         or asset_row.listing_currency_code is distinct from template_row.listing_currency_code
         or asset_row.country_code is distinct from template_row.country_code
    )
  )
  from public.game_session_stock_assets as asset_row
  join public.stock_templates as template_row
    on template_row.id = asset_row.template_id
  join public.country_profiles as profile_row
    on profile_row.country_code = asset_row.country_code
   and profile_row.status = 'active'
  where asset_row.game_session_id = ${sqlLiteral(gameId)}::uuid
`);

assert.equal(
  Number(runtimeState.runtimeCount),
  Number(runtimeState.activeTemplateCount),
  "Seed/copy must materialize every active template exactly once.",
);
assert.equal(
  Number(runtimeState.activeRuntimeCount),
  Number(runtimeState.activeTemplateCount),
  "All newly materialized runtime assets must remain active.",
);
assert.equal(Number(runtimeState.activeCurrencyCount), 10);
assert.equal(Number(runtimeState.mappingMismatchCount), 0);

const beforeProvision = json(`
  select jsonb_build_object(
    'bindingCount', (
      select count(*)
      from public.stock_market_liquidity_accounts
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    ),
    'ledgerCount', (
      select count(*)
      from public.ledger_entries
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    ),
    'transactionCount', (
      select count(*)
      from public.bank_transactions
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    )
  )
`);

assert.equal(Number(beforeProvision.bindingCount), 0);

const firstProvision = json(`
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currencyCode', provisioned.currency_code,
        'bindingKey', provisioned.binding_key,
        'accountKey', provisioned.account_key,
        'initializationPolicy', provisioned.initialization_policy
      ) order by provisioned.currency_code
    ),
    '[]'::jsonb
  )
  from public.initialize_stock_market_liquidity_accounts_v1(
    ${sqlLiteral(gameId)}::uuid
  ) as provisioned
`);

assert.equal(firstProvision.length, 10);
for (const row of firstProvision) {
  assert.match(row.currencyCode, /^[A-Z][A-Z0-9_]{1,15}$/u);
  assert.match(row.bindingKey, /^sml_[0-9a-f]{32}$/u);
  assert.match(row.accountKey, /^bac_[0-9a-f]{32}$/u);
  assert.equal(row.initializationPolicy, "zero-balance-identity-v1");
}

const bindingState = json(`
  select jsonb_build_object(
    'bindingCount', count(*),
    'distinctCurrencyCount', count(distinct binding_row.currency_code),
    'invalidAccountCount', count(*) filter (
      where account_row.id is null
         or account_row.account_kind <> 'checking'
         or account_row.status <> 'active'
         or account_row.currency_code <> binding_row.currency_code
         or party_row.party_kind <> 'system'
         or party_row.party_key <> 'stocks.market-liquidity'
    ),
    'nonZeroBalanceCount', count(*) filter (
      where coalesce(balance_row.balance, 0) <> 0
    ),
    'ledgerCount', (
      select count(*)
      from public.ledger_entries
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    ),
    'transactionCount', (
      select count(*)
      from public.bank_transactions
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    )
  )
  from public.stock_market_liquidity_accounts as binding_row
  left join public.bank_accounts as account_row
    on account_row.id = binding_row.bank_account_id
   and account_row.game_session_id = binding_row.game_session_id
  left join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  left join public.account_balances as balance_row
    on balance_row.bank_account_id = account_row.id
   and balance_row.game_session_id = account_row.game_session_id
  where binding_row.game_session_id = ${sqlLiteral(gameId)}::uuid
`);

assert.equal(Number(bindingState.bindingCount), 10);
assert.equal(Number(bindingState.distinctCurrencyCount), 10);
assert.equal(Number(bindingState.invalidAccountCount), 0);
assert.equal(Number(bindingState.nonZeroBalanceCount), 0);
assert.equal(
  Number(bindingState.ledgerCount),
  Number(beforeProvision.ledgerCount),
  "Liquidity identity provisioning must not append a ledger entry.",
);
assert.equal(
  Number(bindingState.transactionCount),
  Number(beforeProvision.transactionCount),
  "Liquidity identity provisioning must not append a bank transaction.",
);

const secondProvision = json(`
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currencyCode', provisioned.currency_code,
        'bindingKey', provisioned.binding_key,
        'accountKey', provisioned.account_key,
        'initializationPolicy', provisioned.initialization_policy
      ) order by provisioned.currency_code
    ),
    '[]'::jsonb
  )
  from public.initialize_stock_market_liquidity_accounts_v1(
    ${sqlLiteral(gameId)}::uuid
  ) as provisioned
`);

assert.deepEqual(
  secondProvision,
  firstProvision,
  "Liquidity identity provisioning must replay to the original bindings.",
);

const afterReplay = json(`
  select jsonb_build_object(
    'bindingCount', (
      select count(*)
      from public.stock_market_liquidity_accounts
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    ),
    'nonZeroBalanceCount', (
      select count(*)
      from public.stock_market_liquidity_accounts as binding_row
      join public.bank_accounts as account_row
        on account_row.id = binding_row.bank_account_id
       and account_row.game_session_id = binding_row.game_session_id
      left join public.account_balances as balance_row
        on balance_row.bank_account_id = account_row.id
       and balance_row.game_session_id = account_row.game_session_id
      where binding_row.game_session_id = ${sqlLiteral(gameId)}::uuid
        and coalesce(balance_row.balance, 0) <> 0
    ),
    'ledgerCount', (
      select count(*)
      from public.ledger_entries
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    ),
    'transactionCount', (
      select count(*)
      from public.bank_transactions
      where game_session_id = ${sqlLiteral(gameId)}::uuid
    )
  )
`);

assert.equal(Number(afterReplay.bindingCount), 10);
assert.equal(Number(afterReplay.nonZeroBalanceCount), 0);
assert.equal(Number(afterReplay.ledgerCount), Number(beforeProvision.ledgerCount));
assert.equal(
  Number(afterReplay.transactionCount),
  Number(beforeProvision.transactionCount),
);

const alternateCurrency = json(`
  select to_jsonb(currency_row.code)
  from public.currencies as currency_row
  where currency_row.status = 'active'
    and currency_row.code <> (
      select template_row.listing_currency_code
      from public.stock_templates as template_row
      order by template_row.ticker
      limit 1
    )
  order by currency_row.code
  limit 1
`);

const firstTicker = json(`
  select to_jsonb(template_row.ticker)
  from public.stock_templates as template_row
  order by template_row.ticker
  limit 1
`);

expectSqlError(
  `update public.stock_templates
   set listing_currency_code = ${sqlLiteral(alternateCurrency)}
   where ticker = ${sqlLiteral(firstTicker)};`,
  /STOCK_TEMPLATE_LISTING_CURRENCY_IMMUTABLE/u,
);

expectSqlError(
  `update public.game_session_stock_assets
   set listing_currency_code = ${sqlLiteral(alternateCurrency)}
   where game_session_id = ${sqlLiteral(gameId)}::uuid
     and ticker = ${sqlLiteral(firstTicker)};`,
  /STOCK_RUNTIME_LISTING_CURRENCY_IMMUTABLE/u,
);

expectSqlError(
  `update public.stock_market_liquidity_accounts
   set initialization_policy = 'changed'
   where game_session_id = ${sqlLiteral(gameId)}::uuid;`,
  /STOCK_MARKET_LIQUIDITY_BINDING_IMMUTABLE/u,
);

expectSqlError(
  `begin;
   set local role authenticated;
   select * from public.initialize_stock_market_liquidity_accounts_v1(
     ${sqlLiteral(gameId)}::uuid
   );
   commit;`,
  /permission denied/u,
);

const executionState = json(`
  select jsonb_build_object(
    'legacyExecutionPresent', to_regprocedure(
      'public.execute_stock_market_order(uuid,uuid,uuid,text,numeric,text)'
    ) is not null,
    'calendarExecutionPresent', to_regprocedure(
      'public.execute_stock_market_order_calendar_gated(uuid,uuid,uuid,text,numeric,text)'
    ) is not null,
    'legacyUsesPlayerLedger', position(
      'record_player_ledger_entry' in lower(pg_get_functiondef(to_regprocedure(
        'public.execute_stock_market_order(uuid,uuid,uuid,text,numeric,text)'
      )))
    ) > 0,
    'c3QuoteTablePresent', to_regclass('public.stock_buy_quotes') is not null
  )
`);

assert.equal(executionState.legacyExecutionPresent, true);
assert.equal(executionState.calendarExecutionPresent, true);
assert.equal(
  executionState.legacyUsesPlayerLedger,
  true,
  "C3A must leave the active legacy execution path unchanged until C3B/C3C.",
);
assert.equal(
  executionState.c3QuoteTablePresent,
  false,
  "C3A must not introduce the buy quote or change execution yet.",
);

assert.equal(
  count(`
    select 1
    from public.stock_market_liquidity_accounts as binding_row
    where binding_row.game_session_id <> ${sqlLiteral(gameId)}::uuid
  `),
  0,
  "C3A fixture provisioning must remain game-scoped.",
);

console.log("Multi-currency Stock funding C3A database acceptance: PASS");
