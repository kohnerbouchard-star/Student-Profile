#!/usr/bin/env node

import assert from "node:assert/strict";

// Reuse the exact C1/D fixture and acceptance path. Because the disposable
// database is rebuilt before this script, every Store receipt created by that
// retained harness is inserted after the Phase 11 cutover and therefore has
// business_sales_authority_version = 1.
import "./business-player-store-fx-final-database.mjs";
import {
  FIXTURE,
  expectSqlError,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const gameOne = FIXTURE.games.one;
const gameTwo = FIXTURE.games.two;
const purgeFingerprint = Object.freeze({
  registrySha256:
    "68695d3995661af72de99b01fffe0ed301071f1131e6a8e6b92f03febfedb960",
  registryTableCount: 202,
  fkGraphSha256:
    "779750e69db0f918d3c54dc47765ac12a04d635bcc32760d529d571fd4041ec0",
  fkGraphEdgeCount: 448,
  deleteOrderSha256:
    "ef50615cdc9e9191b149f45746d639d196aa0cd1eb1d308dfd2fd80ea43a7fa4",
  deleteOrderTableCount: 201,
  finalizeCursor: 202,
});
const phase11PurgeTables = Object.freeze([
  "business_operating_period_policies",
  "business_operating_period_claims",
  "business_gross_receipts_tax_assessments",
  "business_operating_period_store_receipts",
  "business_gross_receipts_tax_payments",
  "business_operating_period_close_receipts",
]);
const purgeFixture = Object.freeze({
  purchaseCodeId: "71000000-0000-4000-8000-000000000002",
  entitlementId: "72000000-0000-4000-8000-000000000002",
  requestId: "73000000-0000-4000-8000-000000000002",
  armId: "74000000-0000-4000-8000-000000000002",
});
const partialBusiness = Object.freeze({
  ...gameTwo,
  businessId: "50000000-0000-0000-0000-000000000004",
  businessKey: `biz_${"4".repeat(32)}`,
  offerId: "a0000000-0000-0000-0000-000000000004",
  offerKey: `sof_${"8".repeat(32)}`,
});
const lazyClockBusinesses = Object.freeze([
  Object.freeze({
    id: "51000000-0000-4000-8000-000000000001",
    key: "biz_51000000000040008000000000000001",
    createdAt: "2000-01-01T00:00:01.000Z",
  }),
  Object.freeze({
    id: "51000000-0000-4000-8000-000000000002",
    key: "biz_51000000000040008000000000000002",
    createdAt: "2000-01-01T00:00:02.000Z",
  }),
  Object.freeze({
    id: "51000000-0000-4000-8000-000000000003",
    key: "biz_51000000000040008000000000000003",
    createdAt: "2000-01-01T00:00:03.000Z",
  }),
  Object.freeze({
    id: "51000000-0000-4000-8000-000000000004",
    key: "biz_51000000000040008000000000000004",
    createdAt: "2000-01-01T00:00:04.000Z",
  }),
]);

function serviceRows(callSql, orderBy = "1") {
  return runJson(`
    begin;
    set local role service_role;
    select coalesce(
      jsonb_agg(to_jsonb(result_row) order by ${orderBy}),
      '[]'::jsonb
    )::text
    from ${callSql} as result_row;
    commit;
  `);
}

function serviceRow(callSql) {
  const rows = serviceRows(callSql);
  assert.equal(rows.length, 1, `Expected one row from ${callSql}`);
  return rows[0];
}

function serviceJsonValue(expressionSql) {
  return runJson(`
    begin;
    set local role service_role;
    select (${expressionSql})::text;
    commit;
  `);
}

function postgresRow(callSql) {
  const rows = runJson(`
    select coalesce(jsonb_agg(to_jsonb(result_row)), '[]'::jsonb)::text
    from ${callSql} as result_row;
  `);
  assert.equal(rows.length, 1, `Expected one postgres-owned fixture row from ${callSql}`);
  return rows[0];
}

function claimDue(limit = 10) {
  return serviceRows(
    `public.claim_due_business_operating_periods_v1(${limit})`,
    "result_row.business_key",
  );
}

function releaseClaim(claim, reasonCode, idempotencyKey) {
  return serviceRow(`public.release_business_operating_period_lease_v1(
    ${sqlLiteral(claim.claim_key)},
    ${sqlLiteral(claim.lease_token)}::uuid,
    ${sqlLiteral(reasonCode)},
    ${sqlLiteral(idempotencyKey)}
  )`);
}

function closeClaim(claim, idempotencyKey) {
  return serviceRow(`public.close_claimed_business_operating_period_v1(
    ${sqlLiteral(claim.claim_key)},
    ${sqlLiteral(claim.lease_token)}::uuid,
    ${sqlLiteral(idempotencyKey)}
  )`);
}

function businessAccount(game) {
  return runJson(`
    select jsonb_build_object(
      'id', account_row.id,
      'key', account_row.public_key,
      'balance', balance_row.balance::text,
      'activeHolds', private.active_bank_account_hold_amount_v1(
        account_row.game_session_id, account_row.id, '{}'::uuid[]
      )::text
    )::text
    from public.economic_parties as party_row
    join public.bank_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
     and account_row.account_kind = 'checking'
     and account_row.currency_code = 'ECO'
     and account_row.status = 'active'
    join public.account_balances as balance_row
      on balance_row.game_session_id = account_row.game_session_id
     and balance_row.bank_account_id = account_row.id
    where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'business'
      and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid
      and party_row.status = 'active';
  `);
}

function readProspectivePurgeFacts() {
  const phase11TablesSql = phase11PurgeTables
    .map((table) => sqlLiteral(table))
    .join(", ");
  return runJson(`
    with recursive installed_registry as (
      select table_schema, table_name
      from private.game_data_purge_table_registry
    ), dynamic_registry as (
      select column_row.table_schema, column_row.table_name
      from information_schema.columns as column_row
      where column_row.column_name = 'game_session_id'
        and column_row.table_schema in ('public', 'private')
        and column_row.table_name <> 'game_sessions'
        and not (
          column_row.table_schema = 'private'
          and column_row.table_name = 'game_data_purge_requests'
        )
      group by column_row.table_schema, column_row.table_name
    ), registry_digest as (
      select
        encode(
          extensions.digest(
            string_agg(
              table_schema || '.' || table_name,
              E'\\n' order by table_schema, table_name
            ),
            'sha256'
          ),
          'hex'
        ) as registry_sha256,
        count(*) as table_count
      from dynamic_registry
    ), delete_registry as (
      select
        table_schema::text collate "C" as table_schema,
        table_name::text collate "C" as table_name
      from dynamic_registry
      where not (
        table_schema = 'public'
        and table_name = 'entitlements'
      )
    ), delete_edges as (
      select
        child_namespace.nspname::text collate "C" as child_schema,
        child.relname::text collate "C" as child_table,
        parent_namespace.nspname::text collate "C" as parent_schema,
        parent.relname::text collate "C" as parent_table
      from pg_catalog.pg_constraint as constraint_row
      join pg_catalog.pg_class as child
        on child.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace as child_namespace
        on child_namespace.oid = child.relnamespace
      join pg_catalog.pg_class as parent
        on parent.oid = constraint_row.confrelid
      join pg_catalog.pg_namespace as parent_namespace
        on parent_namespace.oid = parent.relnamespace
      where constraint_row.contype = 'f'
        and not (
          child_namespace.nspname = 'public'
          and child.relname = 'store_offer_withdrawal_requests'
          and constraint_row.conname =
              'store_offer_withdrawal_requests_offer_id_fkey'
        )
        and exists (
          select 1
          from delete_registry as item
          where item.table_schema =
                child_namespace.nspname::text collate "C"
            and item.table_name = child.relname::text collate "C"
        )
        and exists (
          select 1
          from delete_registry as item
          where item.table_schema =
                parent_namespace.nspname::text collate "C"
            and item.table_name = parent.relname::text collate "C"
        )
        and not (
          child_namespace.nspname = parent_namespace.nspname
          and child.relname = parent.relname
        )
    ), delete_walk(
      root_schema,
      root_table,
      node_schema,
      node_table,
      depth,
      path
    ) as (
      select
        table_schema,
        table_name,
        table_schema,
        table_name,
        0,
        array[table_schema || '.' || table_name]
      from delete_registry
      union all
      select
        delete_walk.root_schema,
        delete_walk.root_table,
        delete_edge.child_schema,
        delete_edge.child_table,
        delete_walk.depth + 1,
        delete_walk.path ||
          (delete_edge.child_schema || '.' || delete_edge.child_table)
      from delete_walk
      join delete_edges as delete_edge
        on delete_edge.parent_schema = delete_walk.node_schema
       and delete_edge.parent_table = delete_walk.node_table
      where not (
        delete_edge.child_schema || '.' || delete_edge.child_table
      ) = any (delete_walk.path)
        and delete_walk.depth < 250
    ), delete_ranked as (
      select
        root_schema as table_schema,
        root_table as table_name,
        max(depth)::integer as dependency_depth
      from delete_walk
      group by root_schema, root_table
    ), delete_generated as (
      select
        row_number() over (
          order by dependency_depth asc, table_schema, table_name
        )::integer as position,
        table_schema,
        table_name,
        dependency_depth
      from delete_ranked
    ), delete_digest as (
      select
        encode(
          extensions.digest(
            string_agg(
              position || '|' || table_schema || '.' || table_name || '|'
                || dependency_depth,
              E'\\n' order by position
            ),
            'sha256'
          ),
          'hex'
        ) as order_sha256,
        count(*) as table_count
      from delete_generated
    ), fk_edges as (
      select
        child_namespace.nspname as child_schema,
        child.relname as child_table,
        constraint_row.conname,
        parent_namespace.nspname as parent_schema,
        parent.relname as parent_table,
        constraint_row.confdeltype::text as delete_rule,
        string_agg(
          child_attribute.attname || '->' || parent_attribute.attname,
          ',' order by subscript.i
        ) as column_map
      from pg_catalog.pg_constraint as constraint_row
      join pg_catalog.pg_class as child
        on child.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace as child_namespace
        on child_namespace.oid = child.relnamespace
      join pg_catalog.pg_class as parent
        on parent.oid = constraint_row.confrelid
      join pg_catalog.pg_namespace as parent_namespace
        on parent_namespace.oid = parent.relnamespace
      join lateral generate_subscripts(
        constraint_row.conkey,
        1
      ) as subscript(i) on true
      join pg_catalog.pg_attribute as child_attribute
        on child_attribute.attrelid = constraint_row.conrelid
       and child_attribute.attnum = constraint_row.conkey[subscript.i]
      join pg_catalog.pg_attribute as parent_attribute
        on parent_attribute.attrelid = constraint_row.confrelid
       and parent_attribute.attnum = constraint_row.confkey[subscript.i]
      where constraint_row.contype = 'f'
        and child_namespace.nspname in ('public', 'private')
        and exists (
          select 1
          from dynamic_registry as registry_row
          where registry_row.table_schema = parent_namespace.nspname
            and registry_row.table_name = parent.relname
        )
      group by
        child_namespace.nspname,
        child.relname,
        constraint_row.conname,
        parent_namespace.nspname,
        parent.relname,
        constraint_row.confdeltype
    ), fk_digest as (
      select
        encode(
          extensions.digest(
            string_agg(
              child_schema || '.' || child_table || '|' || conname || '|'
                || parent_schema || '.' || parent_table || '|' || delete_rule
                || '|' || column_map,
              E'\\n' order by child_schema, child_table, conname
            ),
            'sha256'
          ),
          'hex'
        ) as fk_graph_sha256,
        count(*) as edge_count
      from fk_edges
    ), fk_order_violations as (
      select count(*) as violation_count
      from delete_edges as edge
      join delete_generated as child_order
        on child_order.table_schema = edge.child_schema
       and child_order.table_name = edge.child_table
      join delete_generated as parent_order
        on parent_order.table_schema = edge.parent_schema
       and parent_order.table_name = edge.parent_table
      where child_order.position >= parent_order.position
    )
    select jsonb_build_object(
      'registrySha256', registry_digest.registry_sha256,
      'registryTableCount', registry_digest.table_count,
      'fkGraphSha256', fk_digest.fk_graph_sha256,
      'fkGraphEdgeCount', fk_digest.edge_count,
      'deleteOrderSha256', delete_digest.order_sha256,
      'deleteOrderTableCount', delete_digest.table_count,
      'finalizeCursor', delete_digest.table_count + 1,
      'fkOrderViolations', fk_order_violations.violation_count,
      'withdrawalOfferDeleteRule', (
        select constraint_row.confdeltype::text
        from pg_catalog.pg_constraint as constraint_row
        where constraint_row.conrelid =
              'public.store_offer_withdrawal_requests'::regclass
          and constraint_row.conname =
              'store_offer_withdrawal_requests_offer_id_fkey'
      ),
      'phase11RegistryTables', (
        select coalesce(
          jsonb_agg(table_name order by table_name collate "C"),
          '[]'::jsonb
        )
        from installed_registry
        where table_schema = 'public'
          and table_name = any (array[${phase11TablesSql}]::text[])
      ),
      'phase11DynamicRegistryTables', (
        select coalesce(
          jsonb_agg(table_name order by table_name collate "C"),
          '[]'::jsonb
        )
        from dynamic_registry
        where table_schema = 'public'
          and table_name = any (array[${phase11TablesSql}]::text[])
      ),
      'phase11DeleteOrderTables', (
        select coalesce(
          jsonb_agg(table_name order by table_name collate "C"),
          '[]'::jsonb
        )
        from delete_generated
        where table_schema = 'public'
          and table_name = any (array[${phase11TablesSql}]::text[])
      ),
      'installedRegistryOnly', (
        select count(*)
        from installed_registry as installed_row
        where not exists (
          select 1
          from dynamic_registry as dynamic_row
          where dynamic_row.table_schema = installed_row.table_schema
            and dynamic_row.table_name = installed_row.table_name
        )
      ),
      'dynamicRegistryOnly', (
        select count(*)
        from dynamic_registry as dynamic_row
        where not exists (
          select 1
          from installed_registry as installed_row
          where installed_row.table_schema = dynamic_row.table_schema
            and installed_row.table_name = dynamic_row.table_name
        )
      ),
      'deleteOrderMismatch', (
        select count(*)
        from (
          select
            coalesce(installed_row.position, generated_row.position) as position
          from private.game_data_purge_delete_order_v1 as installed_row
          full join delete_generated as generated_row
            on generated_row.position = installed_row.position
           and generated_row.table_schema = installed_row.table_schema
           and generated_row.table_name = installed_row.table_name
           and generated_row.dependency_depth = installed_row.dependency_depth
          where installed_row.position is null
             or generated_row.position is null
        ) as mismatch_row
      )
    )::text
    from registry_digest,
      fk_digest,
      delete_digest,
      fk_order_violations;
  `);
}

function playerCheckingKey(game, playerId) {
  return playerCheckingKeyInCurrency(game, playerId, "ECO");
}

function playerCheckingKeyInCurrency(game, playerId, currencyCode) {
  const key = runSql(`
    select account_row.public_key
    from public.economic_parties as party_row
    join public.bank_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
    where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(playerId)}::uuid
      and account_row.account_kind = 'checking'
      and account_row.currency_code = ${sqlLiteral(currencyCode)}
      and account_row.status = 'active';
  `).output;
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
  return key;
}

function purchaseBusinessOffer(game, suffix) {
  const sourceAccountKey = playerCheckingKey(game, game.buyerOneId);
  const version = Number(runSql(`
    select version
    from public.store_seller_offers
    where game_session_id = ${sqlLiteral(game.id)}::uuid
      and public_key = ${sqlLiteral(game.offerKey)};
  `).output);
  const quote = serviceJsonValue(`public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(game.buyerOneId)}::uuid,
    ${sqlLiteral(game.offerKey)},
    1,
    ${version},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey, targetAmount: null },
    ]))}::jsonb,
    ${sqlLiteral(`phase11-${suffix}-quote`)}
  )`);
  assert.match(quote.quoteKey ?? quote.quote_key, /^quote_[0-9a-f]{32}$/u);
  const receipt = serviceJsonValue(`public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(game.buyerOneId)}::uuid,
    ${sqlLiteral(quote.quoteKey ?? quote.quote_key)},
    ${sqlLiteral(`phase11-${suffix}-settle`)}
  )`);
  assert.match(receipt.receiptKey ?? receipt.receipt_key, /^spr_[0-9a-f]{32}$/u);
  return receipt;
}

function seedOperatingPoliciesAndClocks() {
  runSql(`
    begin;
    insert into public.business_operating_period_policies (
      game_session_id, policy_version, period_duration_seconds,
      gross_receipts_tax_rate, claim_lease_seconds,
      effective_for_periods_opened_at, source_type, metadata
    ) values
      (
        ${sqlLiteral(gameOne.id)}::uuid, 1, 604800, 0.08, 300,
        '2000-01-01T00:00:00Z'::timestamptz,
        'phase11_acceptance',
        '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
      ),
      (
        ${sqlLiteral(gameTwo.id)}::uuid, 1, 604800, 0.08, 300,
        '2000-01-01T00:00:00Z'::timestamptz,
        'phase11_acceptance',
        '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
      );
    set local role service_role;
    select public.ensure_business_payroll_clock_v2(
      ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.businessId)}::uuid
    );
    select public.ensure_business_payroll_clock_v2(
      ${sqlLiteral(gameTwo.id)}::uuid, ${sqlLiteral(gameTwo.businessId)}::uuid
    );
    commit;
  `);
}

function proveMulticurrencyFundedStorePeriodClose() {
  const nrcAccountKey = playerCheckingKeyInCurrency(
    gameOne,
    gameOne.buyerOneId,
    "NRC",
  );
  const yrcAccountKey = playerCheckingKeyInCurrency(
    gameOne,
    gameOne.buyerOneId,
    "YRC",
  );
  const offerVersion = Number(runSql(`
    select offer_row.version
    from public.store_seller_offers as offer_row
    where offer_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and offer_row.public_key = ${sqlLiteral(gameOne.offerKey)};
  `).output);
  assert.ok(Number.isSafeInteger(offerVersion) && offerVersion > 0);

  return runJson(`
    begin;
    set local role service_role;

    create temporary table phase11_multicurrency_quote on commit drop as
    select public.create_business_store_offer_funding_quote_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      ${sqlLiteral(gameOne.offerKey)},
      1,
      ${offerVersion},
      ${sqlLiteral(JSON.stringify([
        { sourceAccountKey: nrcAccountKey, targetAmount: "3.50" },
        { sourceAccountKey: yrcAccountKey, targetAmount: null },
      ]))}::jsonb,
      'phase11-multicurrency-tax-quote'
    ) as payload;

    create temporary table phase11_multicurrency_receipt on commit drop as
    select public.settle_business_store_offer_funding_v2(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      (select payload ->> 'quoteKey' from phase11_multicurrency_quote),
      'phase11-multicurrency-tax-settle'
    ) as payload;

    create temporary table phase11_multicurrency_settlement_replay
    on commit drop as
    select public.settle_business_store_offer_funding_v2(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      (select payload ->> 'quoteKey' from phase11_multicurrency_quote),
      'phase11-multicurrency-tax-settle'
    ) as payload;

    reset role;
    update public.business_payroll_clocks
    set period_started_at = statement_timestamp()
          - make_interval(secs => period_duration_seconds),
        next_due_at = statement_timestamp(),
        version = version + 1
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and business_id = ${sqlLiteral(gameOne.businessId)}::uuid;

    set local role service_role;
    create temporary table phase11_multicurrency_claim on commit drop as
    select claim_row.*
    from public.claim_due_business_operating_periods_v1(100) as claim_row
    where claim_row.business_key = ${sqlLiteral(gameOne.businessKey)};

    create temporary table phase11_multicurrency_close on commit drop as
    select close_row.*
    from public.close_claimed_business_operating_period_v1(
      (select claim_key from phase11_multicurrency_claim),
      (select lease_token from phase11_multicurrency_claim),
      'phase11-multicurrency-tax-close'
    ) as close_row;

    create temporary table phase11_multicurrency_close_replay on commit drop as
    select close_row.*
    from public.close_claimed_business_operating_period_v1(
      (select claim_key from phase11_multicurrency_claim),
      (select lease_token from phase11_multicurrency_claim),
      'phase11-multicurrency-tax-close'
    ) as close_row;

    reset role;
    insert into public.store_items (
      id, game_session_id, item_key, name, category, price, currency_code,
      stock_quantity, status, visibility, game_item_id
    ) values (
      '9f000000-0000-4000-8000-000000000001'::uuid,
      ${sqlLiteral(gameOne.id)}::uuid,
      'phase11_foreign_widget',
      'Phase 11 foreign seller currency probe',
      'goods', 9.25, 'NRC', 0, 'active', 'visible',
      ${sqlLiteral(gameOne.gameItemId)}::uuid
    );

    set local role service_role;
    create temporary table phase11_seller_currency_errors (
      probe text primary key,
      error_message text not null
    ) on commit drop;
    do $seller_currency_probe$
    begin
      begin
        perform public.create_business_store_offer_draft_v2(
          ${sqlLiteral(gameOne.id)}::uuid,
          ${sqlLiteral(gameOne.businessKey)},
          'phase11_foreign_widget',
          9.25,
          'phase11-foreign-seller-offer-probe'
        );
        raise exception 'FOREIGN_SELLER_CURRENCY_REJECTION_MISSING'
          using errcode = 'P0001';
      exception when sqlstate 'P0001' then
        if sqlerrm <> 'STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH' then
          raise;
        end if;
        insert into phase11_seller_currency_errors (probe, error_message)
        values ('foreign_business_offer', sqlerrm);
      end;
    end
    $seller_currency_probe$;

    reset role;
    with probe_receipt as (
      select receipt_row.*
      from phase11_multicurrency_receipt as probe_row
      join public.store_offer_purchase_receipts as receipt_row
        on receipt_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
       and receipt_row.public_key = probe_row.payload ->> 'receiptKey'
    ), store_quote as (
      select quote_row.*
      from public.store_offer_purchase_quotes as quote_row
      join probe_receipt as receipt_row on receipt_row.quote_id = quote_row.id
       and receipt_row.game_session_id = quote_row.game_session_id
    ), funding_quote as (
      select funding_row.*
      from public.purchase_funding_quotes as funding_row
      join store_quote as quote_row on quote_row.funding_quote_id = funding_row.id
       and quote_row.game_session_id = funding_row.game_session_id
    ), funding_lines as (
      select
        count(*)::integer as line_count,
        jsonb_agg(
          line_row.source_currency_code order by line_row.source_currency_code
        ) as source_currencies,
        bool_and(
          line_row.requires_fx
          and line_row.source_currency_code <> line_row.target_currency_code
        ) as all_foreign,
        bool_and(line_row.target_currency_code = 'ECO') as all_target_eco,
        bool_and(line_row.spread_rate = 0.01) as all_checkout_spread,
        bool_and(line_row.customer_rate < line_row.reference_rate)
          as all_customer_rates_discounted,
        bool_and(line_row.effective_rate <= line_row.customer_rate)
          as all_effective_rates_bounded,
        bool_and(
          line_row.rounding_disclosure =
            'Retail checkout FX uses the accepted reference fixing less a 1.00% spread; source debit is rounded upward once to the source-currency minor unit so the target contribution remains exact.'
        ) as all_rounding_disclosures_present,
        sum(line_row.target_contribution) as target_contribution
      from public.purchase_funding_quote_lines as line_row
      join funding_quote as funding_row on funding_row.id = line_row.quote_id
       and funding_row.game_session_id = line_row.game_session_id
    ), recipient_credits as (
      select
        count(*)::integer as credit_count,
        coalesce(sum(entry_row.amount), 0) as credit_amount
      from public.ledger_entries as entry_row
      join probe_receipt as receipt_row
        on receipt_row.game_session_id = entry_row.game_session_id
       and receipt_row.bank_transaction_id = entry_row.bank_transaction_id
       and receipt_row.target_bank_account_id = entry_row.bank_account_id
      where entry_row.entry_type = 'credit'
        and entry_row.line_metadata ->> 'lineRole'
          = 'purchase_funding_recipient_credit'
    ), source_assignment as (
      select source_row.*
      from public.business_operating_period_store_receipts as source_row
      join probe_receipt as receipt_row
        on receipt_row.game_session_id = source_row.game_session_id
       and receipt_row.id = source_row.store_purchase_receipt_id
    ), tax_assessment as (
      select assessment_row.*
      from public.business_gross_receipts_tax_assessments as assessment_row
      join source_assignment as source_row
        on source_row.game_session_id = assessment_row.game_session_id
       and source_row.tax_assessment_id = assessment_row.id
    ), assessment_sources as (
      select
        count(*)::integer as receipt_count,
        coalesce(sum(source_row.gross_revenue), 0) as gross_receipts,
        coalesce(sum(source_row.cost_of_goods_sold), 0) as cost_of_goods_sold
      from public.business_operating_period_store_receipts as source_row
      join tax_assessment as assessment_row
        on assessment_row.game_session_id = source_row.game_session_id
       and assessment_row.id = source_row.tax_assessment_id
    ), close_receipt as (
      select close_row.*
      from phase11_multicurrency_close as probe_row
      join public.business_operating_period_close_receipts as close_row
        on close_row.public_key = probe_row.close_receipt_key
    )
    select jsonb_build_object(
      'sourceCurrencies', funding_lines.source_currencies,
      'fundingLineCount', funding_lines.line_count,
      'allFundingLinesForeign', funding_lines.all_foreign,
      'allFundingLinesTargetECO', funding_lines.all_target_eco,
      'allFundingLinesUseCheckoutSpread',
        funding_lines.all_checkout_spread,
      'allCustomerRatesDiscounted',
        funding_lines.all_customer_rates_discounted,
      'allEffectiveRatesBounded',
        funding_lines.all_effective_rates_bounded,
      'allRoundingDisclosuresPresent',
        funding_lines.all_rounding_disclosures_present,
      'fundingTargetContribution', funding_lines.target_contribution::text,
      'fixingKey', fixing_row.public_key,
      'policyVersion', policy_row.policy_version,
      'storeQuoteCurrency', quote_row.seller_currency_code,
      'storeQuoteExchangeRate', quote_row.exchange_rate::text,
      'storeReceiptCurrency', receipt_row.currency_code,
      'storeReceiptGross', receipt_row.gross_revenue::text,
      'fundingQuoteTargetCurrency', funding_row.target_currency_code,
      'fundingReceiptTargetCurrency', funding_receipt.target_currency_code,
      'fundingReceiptTargetAmount', funding_receipt.target_amount::text,
      'fundingReceiptBound',
        funding_receipt.quote_id = funding_row.id
        and funding_receipt.funding_context_hash
          = funding_row.funding_context_hash,
      'targetAccountCurrency', target_account.currency_code,
      'businessReportingCurrency', business_row.currency_code,
      'recipientCreditCount', recipient_credits.credit_count,
      'recipientCreditAmount', recipient_credits.credit_amount::text,
      'settlementReceiptCount', (
        select count(*)
        from public.store_offer_purchase_receipts as settled_row
        where settled_row.game_session_id = receipt_row.game_session_id
          and settled_row.buyer_player_id = receipt_row.buyer_player_id
          and settled_row.request_idempotency_key
            = 'phase11-multicurrency-tax-settle'
      ),
      'settlementReplayStable', (
        select replay_row.payload ->> 'receiptKey' = receipt_row.public_key
          and (replay_row.payload ->> 'replayed')::boolean
        from phase11_multicurrency_settlement_replay as replay_row
      ),
      'probeAssignmentCount', (
        select count(*) from source_assignment
      ),
      'assessmentCurrency', assessment_row.currency_code,
      'assessmentReceiptCount', assessment_row.store_receipt_count,
      'assignedReceiptCount', assessment_sources.receipt_count,
      'assessmentGross', assessment_row.gross_receipts::text,
      'assignedGross', assessment_sources.gross_receipts::text,
      'assessmentCogs', assessment_row.cost_of_goods_sold::text,
      'assignedCogs', assessment_sources.cost_of_goods_sold::text,
      'taxRate', assessment_row.gross_receipts_tax_rate::text,
      'taxFormulaReconciled', assessment_row.tax_assessed = round(
        assessment_row.gross_receipts * assessment_row.gross_receipts_tax_rate,
        assessment_row.currency_minor_unit
      ),
      'closeReportingCurrency', close_row.reporting_currency_code,
      'closeReceiptCount', close_row.store_receipt_count,
      'closeGrossCurrencyCount',
        jsonb_array_length(close_row.gross_receipts_by_currency),
      'closeGrossCurrency',
        close_row.gross_receipts_by_currency -> 0 ->> 'currencyCode',
      'closeGross',
        close_row.gross_receipts_by_currency -> 0 ->> 'grossReceipts',
      'closeTaxCurrencyCount', jsonb_array_length(close_row.tax_by_currency),
      'closeTaxCurrency', close_row.tax_by_currency -> 0 ->> 'currencyCode',
      'closeTaxAssessed',
        close_row.tax_by_currency -> 0 ->> 'taxAssessed',
      'reportingTaxAssessed',
        close_row.tax_assessed_reporting_currency::text,
      'assessmentTaxAssessed', assessment_row.tax_assessed::text,
      'periodSourcesReconciled',
        assessment_row.store_receipt_count = assessment_sources.receipt_count
        and assessment_row.gross_receipts = assessment_sources.gross_receipts
        and assessment_row.cost_of_goods_sold
          = assessment_sources.cost_of_goods_sold,
      'closeReplayStable', (
        select replay_row.replayed
          and replay_row.close_receipt_key = close_row.public_key
          and replay_row.store_receipt_count = close_row.store_receipt_count
          and replay_row.tax_assessed
            = close_row.tax_assessed_reporting_currency
        from phase11_multicurrency_close_replay as replay_row
      ),
      'sellerCurrencyError', (
        select error_row.error_message
        from phase11_seller_currency_errors as error_row
        where error_row.probe = 'foreign_business_offer'
      ),
      'foreignSellerOfferResidue', (
        select count(*)
        from public.store_seller_offers as offer_row
        where offer_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and offer_row.creation_idempotency_key
            = 'phase11-foreign-seller-offer-probe'
      )
    )::text
    from probe_receipt as receipt_row
    join store_quote as quote_row on true
    join funding_quote as funding_row on true
    join public.purchase_funding_receipts as funding_receipt
      on funding_receipt.game_session_id = receipt_row.game_session_id
     and funding_receipt.id = receipt_row.funding_receipt_id
    join public.bank_accounts as target_account
      on target_account.game_session_id = receipt_row.game_session_id
     and target_account.id = receipt_row.target_bank_account_id
    join public.business_entities as business_row
      on business_row.game_session_id = receipt_row.game_session_id
     and business_row.id = receipt_row.business_id
    join public.fx_fixings as fixing_row
      on fixing_row.game_session_id = funding_row.game_session_id
     and fixing_row.id = funding_row.fixing_id
    join public.fx_policy_versions as policy_row
      on policy_row.id = funding_row.policy_version_id
    join funding_lines on true
    join recipient_credits on true
    join tax_assessment as assessment_row on true
    join assessment_sources on true
    join close_receipt as close_row on true;
    rollback;
  `);
}

function proveLazyClockBatchBound(batchLimit = 2) {
  assert.ok(Number.isSafeInteger(batchLimit) && batchLimit > 0);

  // Normalize the retained fixture first so the only clockless Businesses in
  // the rollback-only probe are the four rows below.
  runSql(`
    begin;
    set local role service_role;
    select public.ensure_business_payroll_clock_v2(
      business_row.game_session_id, business_row.id
    )
    from public.business_entities as business_row
    where business_row.status in ('active', 'restructuring', 'distressed')
    order by
      business_row.created_at,
      business_row.game_session_id,
      business_row.id;
    commit;
  `);

  const valuesSql = lazyClockBusinesses.map((business, index) => `(
    ${sqlLiteral(business.id)}::uuid,
    ${sqlLiteral(business.key)},
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(`Lazy clock fixture ${index + 1}`)},
    'sole_proprietorship', 'manufacturing', 'TST', 'ECO', 'active',
    0, 0, 'disregarded', 'operational', 2,
    ${sqlLiteral(business.createdAt)}::timestamptz,
    ${sqlLiteral(business.createdAt)}::timestamptz
  )`).join(",\n");
  const businessIdsSql = lazyClockBusinesses
    .map((business) => `${sqlLiteral(business.id)}::uuid`)
    .join(", ");

  return runJson(`
    begin;
    insert into public.business_entities (
      id, public_key, game_session_id, owner_player_id, legal_name,
      entity_type, industry_code, country_code, currency_code, status,
      capitalization, valuation, tax_classification, formation_state,
      ownership_model_version, created_at, updated_at
    ) values
      ${valuesSql};

    set local role service_role;
    create temporary table phase11_lazy_clock_claims on commit drop as
    select *
    from public.claim_due_business_operating_periods_v1(${batchLimit});

    select jsonb_build_object(
      'clockCount', (
        select count(*)
        from public.business_payroll_clocks as clock_row
        where clock_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and clock_row.business_id = any(array[${businessIdsSql}])
      ),
      'clockBusinessKeys', (
        select coalesce(
          jsonb_agg(
            business_row.public_key
            order by
              business_row.created_at,
              business_row.game_session_id,
              business_row.id
          ),
          '[]'::jsonb
        )
        from public.business_payroll_clocks as clock_row
        join public.business_entities as business_row
          on business_row.game_session_id = clock_row.game_session_id
         and business_row.id = clock_row.business_id
        where clock_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and clock_row.business_id = any(array[${businessIdsSql}])
      ),
      'claimCount', (
        select count(*) from phase11_lazy_clock_claims
      ),
      'claimBusinessKeys', (
        select coalesce(
          jsonb_agg(claim_row.business_key order by claim_row.due_at),
          '[]'::jsonb
        )
        from phase11_lazy_clock_claims as claim_row
      ),
      'remainingClocklessCount', (
        select count(*)
        from public.business_entities as business_row
        left join public.business_payroll_clocks as clock_row
          on clock_row.game_session_id = business_row.game_session_id
         and clock_row.business_id = business_row.id
        where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and business_row.id = any(array[${businessIdsSql}])
          and clock_row.id is null
      )
    )::text;
    rollback;
  `);
}

function proveInactiveGameClaimGate() {
  const clocklessBusiness = lazyClockBusinesses[0];
  return runJson(`
    begin;
    insert into public.business_entities (
      id, public_key, game_session_id, owner_player_id, legal_name,
      entity_type, industry_code, country_code, currency_code, status,
      capitalization, valuation, tax_classification, formation_state,
      ownership_model_version, created_at, updated_at
    ) values (
      ${sqlLiteral(clocklessBusiness.id)}::uuid,
      ${sqlLiteral(clocklessBusiness.key)},
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.ownerId)}::uuid,
      'Inactive game clockless fixture',
      'sole_proprietorship', 'manufacturing', 'TST', 'ECO', 'active',
      0, 0, 'disregarded', 'operational', 2,
      ${sqlLiteral(clocklessBusiness.createdAt)}::timestamptz,
      ${sqlLiteral(clocklessBusiness.createdAt)}::timestamptz
    );

    update public.business_payroll_clocks
    set period_started_at = statement_timestamp()
          - make_interval(secs => period_duration_seconds),
        next_due_at = statement_timestamp(),
        version = version + 1
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and business_id = ${sqlLiteral(gameOne.businessId)}::uuid;

    update public.game_sessions
    set lifecycle_state = 'paused',
        status = 'disabled'
    where id = ${sqlLiteral(gameOne.id)}::uuid;

    set local role service_role;
    create temporary table phase11_inactive_game_claims on commit drop as
    select *
    from public.claim_due_business_operating_periods_v1(100);

    select jsonb_build_object(
      'claimCount', (select count(*)
        from phase11_inactive_game_claims as claim_row
        where claim_row.business_key in (
          ${sqlLiteral(gameOne.businessKey)},
          ${sqlLiteral(clocklessBusiness.key)}
        )),
      'clocklessBusinessClockCount', (select count(*)
        from public.business_payroll_clocks as clock_row
        where clock_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and clock_row.business_id = ${sqlLiteral(clocklessBusiness.id)}::uuid),
      'dueBusinessClaimCount', (select count(*)
        from public.business_operating_period_claims as claim_row
        where claim_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and claim_row.business_id = ${sqlLiteral(gameOne.businessId)}::uuid)
    )::text;
    rollback;
  `);
}

function proveSequentialFormationReplayContracts() {
  const idempotencyKey = "phase11-formation-replay-contract";
  const singletonKey = "phase11-formation-singleton-contract";
  const malformedValuationKey = "phase11-formation-malformed-valuation";
  const malformedBindingKey = "phase11-formation-malformed-binding";
  const malformedTypeKey = "phase11-formation-malformed-type";

  return runJson(`
    begin;
    set local role service_role;
    create temporary table phase11_formation_expected_errors (
      probe text primary key,
      error_message text not null
    ) on commit drop;

    create temporary table phase11_formation_first on commit drop as
    select * from public.create_or_acquire_player_business_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      'Sequential Formation Fixture',
      'sole_proprietorship',
      'manufacturing',
      'TST',
      'ECO',
      0,
      null,
      ${sqlLiteral(idempotencyKey)}
    );

    create temporary table phase11_formation_replay on commit drop as
    select * from public.create_or_acquire_player_business_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      'Sequential Formation Fixture',
      'sole_proprietorship',
      'manufacturing',
      'TST',
      'ECO',
      0,
      null,
      ${sqlLiteral(idempotencyKey)}
    );

    do $formation_audit_immutable$
    begin
      begin
        update public.audit_log as audit_row
        set metadata = jsonb_set(
          audit_row.metadata,
          '{result_status}',
          to_jsonb('closed'::text)
        )
        where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and audit_row.actor_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and audit_row.action = 'business.create_or_acquire'
          and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(idempotencyKey)};
        raise exception 'FORMATION_AUDIT_UPDATE_NOT_REJECTED'
          using errcode = 'P0001';
      exception when sqlstate '42501' then
        if sqlerrm <> 'BUSINESS_FORMATION_AUDIT_IMMUTABLE' then
          raise;
        end if;
        insert into phase11_formation_expected_errors (probe, error_message)
        values ('audit_update', sqlerrm);
      end;

      begin
        delete from public.audit_log as audit_row
        where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and audit_row.actor_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and audit_row.action = 'business.create_or_acquire'
          and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(idempotencyKey)};
        raise exception 'FORMATION_AUDIT_DELETE_NOT_REJECTED'
          using errcode = 'P0001';
      exception when sqlstate '42501' then
        if sqlerrm <> 'BUSINESS_FORMATION_AUDIT_IMMUTABLE' then
          raise;
        end if;
        insert into phase11_formation_expected_errors (probe, error_message)
        values ('audit_delete', sqlerrm);
      end;
    end
    $formation_audit_immutable$;

    -- The guard is deliberately action-specific. This rollback-only control
    -- must retain the pre-existing UPDATE/DELETE behavior of unrelated audit
    -- families even after M4 patches the formation guard for whole-game purge.
    insert into public.audit_log (
      game_session_id, actor_type, actor_id, action, target_type, target_id,
      metadata
    ) values (
      ${sqlLiteral(gameOne.id)}::uuid,
      'system', null, 'phase11.formation.guard.control', 'system', null,
      '{"state":"created"}'::jsonb
    );
    update public.audit_log
    set metadata = '{"state":"updated"}'::jsonb
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and action = 'phase11.formation.guard.control';
    delete from public.audit_log
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and action = 'phase11.formation.guard.control';

    -- Insert deliberately malformed historical evidence without mutating the
    -- immutable valid row. Each variant has a matching request fingerprint so
    -- replay validation, not the later singleton guard, must reject it.
    with valid_audit as (
      select audit_row.*
      from public.audit_log as audit_row
      where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and audit_row.actor_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
        and audit_row.action = 'business.create_or_acquire'
        and audit_row.metadata ->> 'idempotency_key' =
            ${sqlLiteral(idempotencyKey)}
    )
    insert into public.audit_log (
      game_session_id, actor_type, actor_id, action, target_type, target_id,
      metadata
    )
    select
      valid_audit.game_session_id,
      valid_audit.actor_type,
      valid_audit.actor_id,
      valid_audit.action,
      valid_audit.target_type,
      valid_audit.target_id,
      (
        valid_audit.metadata || jsonb_build_object(
          'idempotency_key', ${sqlLiteral(malformedValuationKey)}
        )
      ) - 'result_valuation'
    from valid_audit
    union all
    select
      valid_audit.game_session_id,
      valid_audit.actor_type,
      valid_audit.actor_id,
      valid_audit.action,
      valid_audit.target_type,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      valid_audit.metadata || jsonb_build_object(
        'idempotency_key', ${sqlLiteral(malformedBindingKey)}
      )
    from valid_audit
    union all
    select
      valid_audit.game_session_id,
      valid_audit.actor_type,
      valid_audit.actor_id,
      valid_audit.action,
      valid_audit.target_type,
      valid_audit.target_id,
      jsonb_set(
        valid_audit.metadata || jsonb_build_object(
          'idempotency_key', ${sqlLiteral(malformedTypeKey)}
        ),
        '{result_capitalization}',
        to_jsonb('0'::text)
      )
    from valid_audit;

    do $formation_malformed_evidence$
    declare
      v_probe text;
      v_key text;
    begin
      for v_probe, v_key in
        select probe_row.probe, probe_row.idempotency_key
        from (values
          ('malformed_valuation', ${sqlLiteral(malformedValuationKey)}),
          ('malformed_binding', ${sqlLiteral(malformedBindingKey)}),
          ('malformed_type', ${sqlLiteral(malformedTypeKey)})
        ) as probe_row(probe, idempotency_key)
      loop
        begin
          perform * from public.create_or_acquire_player_business_v1(
            ${sqlLiteral(gameOne.id)}::uuid,
            ${sqlLiteral(gameOne.buyerOneId)}::uuid,
            'Sequential Formation Fixture',
            'sole_proprietorship',
            'manufacturing',
            'TST',
            'ECO',
            0,
            null,
            v_key
          );
          raise exception 'FORMATION_MALFORMED_EVIDENCE_NOT_REJECTED'
            using errcode = 'P0001';
        exception when sqlstate 'P0001' then
          if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then
            raise;
          end if;
          insert into phase11_formation_expected_errors (
            probe, error_message
          ) values (v_probe, sqlerrm);
        end;
      end loop;
    end
    $formation_malformed_evidence$;

    do $formation_conflict$
    begin
      begin
        perform * from public.create_or_acquire_player_business_v1(
          ${sqlLiteral(gameOne.id)}::uuid,
          ${sqlLiteral(gameOne.buyerOneId)}::uuid,
          'Changed Formation Intent',
          'sole_proprietorship',
          'manufacturing',
          'TST',
          'ECO',
          0,
          null,
          ${sqlLiteral(idempotencyKey)}
        );
        raise exception 'FORMATION_CONFLICT_NOT_REJECTED' using errcode = 'P0001';
      exception when sqlstate 'P0001' then
        if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then
          raise;
        end if;
        insert into phase11_formation_expected_errors (probe, error_message)
        values ('conflict', sqlerrm);
      end;
    end
    $formation_conflict$;

    do $formation_singleton$
    begin
      begin
        perform * from public.create_or_acquire_player_business_v1(
          ${sqlLiteral(gameOne.id)}::uuid,
          ${sqlLiteral(gameOne.buyerOneId)}::uuid,
          'Second Formation Attempt',
          'sole_proprietorship',
          'manufacturing',
          'TST',
          'ECO',
          0,
          null,
          ${sqlLiteral(singletonKey)}
        );
        raise exception 'FORMATION_SINGLETON_NOT_ENFORCED' using errcode = 'P0001';
      exception when sqlstate 'P0001' then
        if sqlerrm <> 'BUSINESS_ALREADY_OWNED' then
          raise;
        end if;
        insert into phase11_formation_expected_errors (probe, error_message)
        values ('singleton', sqlerrm);
      end;
    end
    $formation_singleton$;

    reset role;
    update public.business_entities as business_row
    set status = 'closed',
        capitalization = 123.45
    from phase11_formation_first as created
    where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and business_row.public_key = created.business_key;

    set local role service_role;
    create temporary table phase11_formation_immutable_replay on commit drop as
    select * from public.create_or_acquire_player_business_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.buyerOneId)}::uuid,
      'Sequential Formation Fixture',
      'sole_proprietorship',
      'manufacturing',
      'TST',
      'ECO',
      0,
      null,
      ${sqlLiteral(idempotencyKey)}
    );

    reset role;
    with formation_audit as (
      select audit_row.*
      from public.audit_log as audit_row
      where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and audit_row.actor_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
        and audit_row.action = 'business.create_or_acquire'
        and audit_row.metadata ->> 'idempotency_key' =
            ${sqlLiteral(idempotencyKey)}
    )
    select jsonb_build_object(
      'firstBusinessKey', (select business_key from phase11_formation_first),
      'firstStatus', (select status from phase11_formation_first),
      'firstOwnerPlayerId',
        (select owner_player_id::text from phase11_formation_first),
      'firstCapitalization',
        (select capitalization::text from phase11_formation_first),
      'firstValuation', (select valuation::text from phase11_formation_first),
      'firstReplayed', (select replayed from phase11_formation_first),
      'replayBusinessKey',
        (select business_key from phase11_formation_replay),
      'replayStatus', (select status from phase11_formation_replay),
      'replayOwnerPlayerId',
        (select owner_player_id::text from phase11_formation_replay),
      'replayCapitalization',
        (select capitalization::text from phase11_formation_replay),
      'replayValuation',
        (select valuation::text from phase11_formation_replay),
      'replayed', (select replayed from phase11_formation_replay),
      'immutableReplayBusinessKey',
        (select business_key from phase11_formation_immutable_replay),
      'immutableReplayStatus',
        (select status from phase11_formation_immutable_replay),
      'immutableReplayOwnerPlayerId',
        (select owner_player_id::text
         from phase11_formation_immutable_replay),
      'immutableReplayCapitalization',
        (select capitalization::text
         from phase11_formation_immutable_replay),
      'immutableReplayValuation',
        (select valuation::text from phase11_formation_immutable_replay),
      'immutableReplayed',
        (select replayed from phase11_formation_immutable_replay),
      'liveBusinessStatus', (select business_row.status
        from public.business_entities as business_row
        join phase11_formation_first as created
          on created.business_key = business_row.public_key
        where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
      'liveBusinessCapitalization', (select business_row.capitalization::text
        from public.business_entities as business_row
        join phase11_formation_first as created
          on created.business_key = business_row.public_key
        where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
      'businessCount', (select count(*)
        from public.business_entities as business_row
        where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and business_row.owner_player_id =
              ${sqlLiteral(gameOne.buyerOneId)}::uuid),
      'auditCount', (select count(*) from formation_audit),
      'expectedFingerprint', encode(
        extensions.digest(
          jsonb_build_object(
            'legalName', 'Sequential Formation Fixture',
            'entityType', 'sole_proprietorship',
            'industryCode', 'manufacturing',
            'countryCode', 'TST',
            'currencyCode', 'ECO',
            'capitalization', round(0::numeric, 2),
            'acquisition', false
          )::text,
          'sha256'
        ),
        'hex'
      ),
      'auditActorType', (select audit_row.actor_type
        from formation_audit as audit_row),
      'auditTargetType', (select audit_row.target_type
        from formation_audit as audit_row),
      'auditIdempotencyKey',
        (select audit_row.metadata ->> 'idempotency_key'
         from formation_audit as audit_row),
      'auditFingerprint', (select audit_row.metadata ->> 'request_fingerprint'
        from formation_audit as audit_row),
      'auditLegacyBusinessKey',
        (select audit_row.metadata ->> 'business_key'
         from formation_audit as audit_row),
      'auditAcquisition', (select audit_row.metadata -> 'acquisition'
        from formation_audit as audit_row),
      'auditCapitalContribution',
        (select audit_row.metadata ->> 'capital_contribution'
         from formation_audit as audit_row),
      'auditMetadataTypes', (select jsonb_build_object(
        'idempotencyKey',
          jsonb_typeof(audit_row.metadata -> 'idempotency_key'),
        'requestFingerprint',
          jsonb_typeof(audit_row.metadata -> 'request_fingerprint'),
        'businessKey', jsonb_typeof(audit_row.metadata -> 'business_key'),
        'acquisition', jsonb_typeof(audit_row.metadata -> 'acquisition'),
        'capitalContribution',
          jsonb_typeof(audit_row.metadata -> 'capital_contribution'),
        'resultBusinessKey',
          jsonb_typeof(audit_row.metadata -> 'result_business_key'),
        'resultStatus',
          jsonb_typeof(audit_row.metadata -> 'result_status'),
        'resultOwnerPlayerId',
          jsonb_typeof(audit_row.metadata -> 'result_owner_player_id'),
        'resultCapitalization',
          jsonb_typeof(audit_row.metadata -> 'result_capitalization'),
        'resultValuation',
          jsonb_typeof(audit_row.metadata -> 'result_valuation')
      ) from formation_audit as audit_row),
      'auditBusinessKey', (select audit_row.metadata ->> 'result_business_key'
        from formation_audit as audit_row),
      'auditStatus', (select audit_row.metadata ->> 'result_status'
        from formation_audit as audit_row),
      'auditOwnerPlayerId',
        (select audit_row.metadata ->> 'result_owner_player_id'
         from formation_audit as audit_row),
      'auditCapitalization',
        (select audit_row.metadata ->> 'result_capitalization'
         from formation_audit as audit_row),
      'auditValuation', (select audit_row.metadata ->> 'result_valuation'
        from formation_audit as audit_row),
      'auditTargetMatchesBusiness', (select audit_row.target_id = business_row.id
        from formation_audit as audit_row
        join public.business_entities as business_row
          on business_row.game_session_id = audit_row.game_session_id
         and business_row.id = audit_row.target_id),
      'malformedAuditCount', (select count(*)
        from public.audit_log as audit_row
        where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and audit_row.actor_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and audit_row.action = 'business.create_or_acquire'
          and audit_row.metadata ->> 'idempotency_key' in (
            ${sqlLiteral(malformedValuationKey)},
            ${sqlLiteral(malformedBindingKey)},
            ${sqlLiteral(malformedTypeKey)}
          )),
      'unrelatedAuditCount', (select count(*)
        from public.audit_log as audit_row
        where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and audit_row.action = 'phase11.formation.guard.control'),
      'conflictError', (select error_message
        from phase11_formation_expected_errors where probe = 'conflict'),
      'singletonError', (select error_message
        from phase11_formation_expected_errors where probe = 'singleton'),
      'auditUpdateError', (select error_message
        from phase11_formation_expected_errors where probe = 'audit_update'),
      'auditDeleteError', (select error_message
        from phase11_formation_expected_errors where probe = 'audit_delete'),
      'malformedValuationError', (select error_message
        from phase11_formation_expected_errors
        where probe = 'malformed_valuation'),
      'malformedBindingError', (select error_message
        from phase11_formation_expected_errors
        where probe = 'malformed_binding'),
      'malformedTypeError', (select error_message
        from phase11_formation_expected_errors where probe = 'malformed_type')
    )::text;
    rollback;
  `);
}

function proveStatusTransitionReplayContracts() {
  const transitionKey = "phase11-status-transition-replay";
  const recoveryKey = "phase11-status-transition-recover";
  const transitionReason = "Phase 11 status replay fixture";

  return runJson(`
    begin;
    set local role service_role;
    create temporary table phase11_status_expected_errors (
      probe text primary key,
      error_message text not null
    ) on commit drop;

    create temporary table phase11_status_first on commit drop as
    select * from public.transition_business_status_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.ownerId)}::uuid,
      ${sqlLiteral(gameOne.businessKey)},
      'restructure',
      ${sqlLiteral(transitionReason)},
      ${sqlLiteral(transitionKey)}
    );

    create temporary table phase11_status_audit_before on commit drop as
    select
      audit_row.id,
      audit_row.created_at,
      audit_row.metadata,
      encode(
        extensions.digest(audit_row.metadata::text, 'sha256'),
        'hex'
      ) as metadata_digest
    from public.audit_log as audit_row
    where audit_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and audit_row.actor_id = ${sqlLiteral(gameOne.ownerId)}::uuid
      and audit_row.action = 'business.status.transition'
      and audit_row.metadata ->> 'idempotency_key' =
          ${sqlLiteral(transitionKey)};

    create temporary table phase11_status_recovery on commit drop as
    select * from public.transition_business_status_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.ownerId)}::uuid,
      ${sqlLiteral(gameOne.businessKey)},
      'recover',
      'Return the transition fixture to active',
      ${sqlLiteral(recoveryKey)}
    );

    create temporary table phase11_status_live_after_recovery on commit drop as
    select business_row.status, business_row.failure_count,
      business_row.closed_at, business_row.version
    from public.business_entities as business_row
    where business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and business_row.id = ${sqlLiteral(gameOne.businessId)}::uuid;

    create temporary table phase11_status_replay on commit drop as
    select * from public.transition_business_status_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.ownerId)}::uuid,
      ${sqlLiteral(gameOne.businessKey)},
      'restructure',
      ${sqlLiteral(transitionReason)},
      ${sqlLiteral(transitionKey)}
    );

    do $status_transition_conflict$
    begin
      begin
        perform * from public.transition_business_status_v1(
          ${sqlLiteral(gameOne.id)}::uuid,
          ${sqlLiteral(gameOne.ownerId)}::uuid,
          ${sqlLiteral(gameOne.businessKey)},
          'restructure',
          'Changed Phase 11 status transition intent',
          ${sqlLiteral(transitionKey)}
        );
        raise exception 'STATUS_TRANSITION_CONFLICT_NOT_REJECTED'
          using errcode = 'P0001';
      exception when sqlstate 'P0001' then
        if sqlerrm <> 'IDEMPOTENCY_KEY_CONFLICT' then
          raise;
        end if;
        insert into phase11_status_expected_errors (probe, error_message)
        values ('conflict', sqlerrm);
      end;
    end
    $status_transition_conflict$;

    do $status_transition_audit_immutable$
    begin
      begin
        update public.audit_log as audit_row
        set metadata = jsonb_set(
          audit_row.metadata,
          '{result_status}',
          to_jsonb('closed'::text)
        )
        where audit_row.id = (
          select before_row.id from phase11_status_audit_before as before_row
        );
        raise exception 'STATUS_TRANSITION_AUDIT_UPDATE_NOT_REJECTED'
          using errcode = 'P0001';
      exception when sqlstate '42501' then
        if sqlerrm <> 'BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE' then
          raise;
        end if;
        insert into phase11_status_expected_errors (probe, error_message)
        values ('audit_update', sqlerrm);
      end;

      begin
        delete from public.audit_log as audit_row
        where audit_row.id = (
          select before_row.id from phase11_status_audit_before as before_row
        );
        raise exception 'STATUS_TRANSITION_AUDIT_DELETE_NOT_REJECTED'
          using errcode = 'P0001';
      exception when sqlstate '42501' then
        if sqlerrm <> 'BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE' then
          raise;
        end if;
        insert into phase11_status_expected_errors (probe, error_message)
        values ('audit_delete', sqlerrm);
      end;
    end
    $status_transition_audit_immutable$;

    select jsonb_build_object(
      'firstBusinessKey', first_row.business_key,
      'firstStatus', first_row.status,
      'firstFailureCount', first_row.failure_count,
      'firstClosedAt', first_row.closed_at,
      'firstReplayed', first_row.replayed,
      'recoveryBusinessKey', recovery_row.business_key,
      'recoveryStatus', recovery_row.status,
      'recoveryFailureCount', recovery_row.failure_count,
      'recoveryClosedAt', recovery_row.closed_at,
      'recoveryReplayed', recovery_row.replayed,
      'replayBusinessKey', replay_row.business_key,
      'replayStatus', replay_row.status,
      'replayFailureCount', replay_row.failure_count,
      'replayClosedAt', replay_row.closed_at,
      'replayed', replay_row.replayed,
      'liveStatus', business_row.status,
      'liveFailureCount', business_row.failure_count,
      'liveClosedAt', business_row.closed_at,
      'liveVersion', business_row.version,
      'recoveryVersion', recovery_live.version,
      'auditCount', (select count(*)
        from public.audit_log as audit_count_row
        where audit_count_row.game_session_id =
              ${sqlLiteral(gameOne.id)}::uuid
          and audit_count_row.actor_id = ${sqlLiteral(gameOne.ownerId)}::uuid
          and audit_count_row.action = 'business.status.transition'
          and audit_count_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(transitionKey)}),
      'auditActorType', audit_row.actor_type,
      'auditTargetType', audit_row.target_type,
      'auditTargetMatchesBusiness', audit_row.target_id = business_row.id,
      'auditIdempotencyKey', audit_row.metadata ->> 'idempotency_key',
      'auditFingerprint', audit_row.metadata ->> 'request_fingerprint',
      'expectedFingerprint', encode(
        extensions.digest(
          jsonb_build_object(
            'businessKey', lower(btrim(${sqlLiteral(gameOne.businessKey)})),
            'transition', 'restructure',
            'reason', ${sqlLiteral(transitionReason)}
          )::text,
          'sha256'
        ),
        'hex'
      ),
      'auditTransition', audit_row.metadata ->> 'transition',
      'auditReason', audit_row.metadata ->> 'reason',
      'auditStatus', audit_row.metadata ->> 'status',
      'auditBusinessKey', audit_row.metadata ->> 'result_business_key',
      'auditResultStatus', audit_row.metadata ->> 'result_status',
      'auditFailureCount', audit_row.metadata ->> 'result_failure_count',
      'auditClosedAtType', jsonb_typeof(
        audit_row.metadata -> 'result_closed_at'
      ),
      'auditPeriodClosureGuard',
        audit_row.metadata ->> 'periodClosureGuard',
      'auditCreatedAtUnchanged',
        audit_row.created_at = audit_before.created_at,
      'auditMetadataUnchanged', audit_row.metadata = audit_before.metadata,
      'auditDigestBefore', audit_before.metadata_digest,
      'auditDigestAfter', encode(
        extensions.digest(audit_row.metadata::text, 'sha256'),
        'hex'
      ),
      'conflictError', (select error_message
        from phase11_status_expected_errors where probe = 'conflict'),
      'auditUpdateError', (select error_message
        from phase11_status_expected_errors where probe = 'audit_update'),
      'auditDeleteError', (select error_message
        from phase11_status_expected_errors where probe = 'audit_delete')
    )::text
    from phase11_status_first as first_row
    cross join phase11_status_recovery as recovery_row
    cross join phase11_status_live_after_recovery as recovery_live
    cross join phase11_status_replay as replay_row
    cross join phase11_status_audit_before as audit_before
    join public.audit_log as audit_row
      on audit_row.id = audit_before.id
    join public.business_entities as business_row
      on business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
     and business_row.id = ${sqlLiteral(gameOne.businessId)}::uuid;
    rollback;
  `);
}

function makeClockDue(game) {
  runSql(`
    update public.business_payroll_clocks
    set period_started_at = statement_timestamp()
          - make_interval(secs => period_duration_seconds),
        next_due_at = statement_timestamp(),
        version = version + 1
    where game_session_id = ${sqlLiteral(game.id)}::uuid
      and business_id = ${sqlLiteral(game.businessId)}::uuid;
  `);
}

function seedAdditionalBusiness(game) {
  runSql(`
    begin;
    insert into public.business_entities (
      id, public_key, game_session_id, owner_player_id, legal_name,
      entity_type, industry_code, country_code, currency_code, status,
      capitalization, valuation, tax_classification, formation_state,
      ownership_model_version
    ) values (
      ${sqlLiteral(game.businessId)}::uuid,
      ${sqlLiteral(game.businessKey)},
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(game.ownerId)}::uuid,
      'Fixture Partial Tax LLC', 'llc', 'manufacturing', 'TST', 'ECO',
      'active', 100, 100, 'disregarded', 'operational', 2
    );

    select * from public.record_business_ledger_entry_v2(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(game.businessId)}::uuid,
      20, 'ECO', 'credit', 'business', 'capital_contribution_in',
      ${sqlLiteral(game.businessId)}::uuid,
      'system', null,
      jsonb_build_object(
        'bankTransactionIdempotencyKey', 'phase11-partial-business-seed'
      )
    );

    insert into public.store_seller_offers (
      id, public_key, game_session_id, store_item_id, game_item_id,
      seller_party_id, inventory_account_id, seller_kind, unit_price,
      currency_code, status, replenishment_policy,
      creation_idempotency_key, creation_request_hash, version, metadata
    )
    select
      ${sqlLiteral(game.offerId)}::uuid,
      ${sqlLiteral(game.offerKey)},
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(game.storeItemId)}::uuid,
      ${sqlLiteral(game.gameItemId)}::uuid,
      party_row.id, null, 'business', 7.50, 'ECO', 'draft', 'none',
      'phase11-partial-business-offer', repeat('d', 64), 1,
      '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
    from public.economic_parties as party_row
    where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'business'
      and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid;

    do $fixture$
    declare
      v_listing uuid;
    begin
      v_listing := economy_private.ensure_business_store_listing_account_v2(
        ${sqlLiteral(game.id)}::uuid,
        ${sqlLiteral(game.businessId)}::uuid,
        ${sqlLiteral(game.offerId)}::uuid
      );
      update public.store_seller_offers
      set inventory_account_id = v_listing, status = 'active', version = 2
      where id = ${sqlLiteral(game.offerId)}::uuid;
      insert into public.inventory_holdings (
        game_session_id, inventory_account_id, game_item_id, quantity_owned,
        quantity_reserved, average_unit_cost, cost_currency_code, version
      ) values (
        ${sqlLiteral(game.id)}::uuid,
        v_listing,
        ${sqlLiteral(game.gameItemId)}::uuid,
        10, 0, 2.5000, 'ECO', 1
      );
    end
    $fixture$;
    commit;

    begin;
    set local role service_role;
    select public.ensure_business_payroll_clock_v2(
      ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.businessId)}::uuid
    );
    commit;
  `);
}

function createBusinessHold(game, amount, suffix) {
  const account = businessAccount(game);
  assert.ok(Number(amount) > 0);
  return postgresRow(`private.create_bank_account_hold_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(account.id)}::uuid,
    ${sqlLiteral(amount)}::numeric,
    'business-period-acceptance',
    'held-cash-proof',
    null::uuid,
    ${sqlLiteral(`phase11-${suffix}-hold`)},
    ${sqlLiteral("a".repeat(64))},
    clock_timestamp() + interval '1 day',
    '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
  )`);
}

function proveExecutableWholeGamePurge() {
  const offerVersion = Number(runSql(`
    select version
    from public.store_seller_offers
    where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
      and public_key = ${sqlLiteral(gameTwo.offerKey)};
  `).output);
  const pendingWithdrawal = serviceJsonValue(
    `public.request_business_store_offer_withdrawal_v2(` +
      `${sqlLiteral(gameTwo.id)}::uuid,` +
      `${sqlLiteral(gameTwo.businessKey)},` +
      `${sqlLiteral(gameTwo.offerKey)},` +
      `'full',null::integer,${offerVersion},` +
      `'phase11-purge-withdrawal-cycle')`,
  );
  assert.equal(pendingWithdrawal.requestStatus, "pending");
  assert.equal(pendingWithdrawal.offerStatus, "withdrawal_pending");
  assert.equal(pendingWithdrawal.offerKey, gameTwo.offerKey);
  assert.equal(pendingWithdrawal.replayed, false);
  const withdrawalPair = runJson(`
    select jsonb_build_object(
      'offerCount', count(distinct offer_row.id),
      'requestCount', count(distinct request_row.id),
      'linkedCount', count(*) filter (
        where offer_row.withdrawal_request_id = request_row.id
          and request_row.offer_id = offer_row.id
      )
    )::text
    from public.store_seller_offers as offer_row
    join public.store_offer_withdrawal_requests as request_row
      on request_row.game_session_id = offer_row.game_session_id
     and request_row.id = offer_row.withdrawal_request_id
    where offer_row.game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
      and offer_row.public_key = ${sqlLiteral(gameTwo.offerKey)};
  `);
  assert.equal(Number(withdrawalPair.offerCount), 1);
  assert.equal(Number(withdrawalPair.requestCount), 1);
  assert.equal(Number(withdrawalPair.linkedCount), 1);
  expectSqlError(`
    begin;
    delete from public.store_seller_offers
    where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
      and public_key = ${sqlLiteral(gameTwo.offerKey)};
    rollback;
  `, /STORE_SELLER_OFFER_DELETE_RETIRED/u);

  const configured = serviceJsonValue(
    "public.configure_game_data_purge_environment_v1(" +
      "'staging','phase11-disposable-r2')",
  );
  assert.equal(configured.environment, "staging");
  assert.equal(configured.r2Bucket, "phase11-disposable-r2");
  assert.equal(configured.leverArmed, false);

  runSql(`
    begin;
    insert into public.purchase_codes (
      id, code_hash, status, max_redemptions, redeemed_count,
      license_duration_days
    ) values (
      ${sqlLiteral(purgeFixture.purchaseCodeId)}::uuid,
      repeat('e', 64), 'exhausted', 1, 1, null
    );
    insert into public.entitlements (
      id, purchase_code_id, staff_user_id, game_session_id, status,
      license_expires_at, expired_at
    ) values (
      ${sqlLiteral(purgeFixture.entitlementId)}::uuid,
      ${sqlLiteral(purgeFixture.purchaseCodeId)}::uuid,
      ${sqlLiteral(FIXTURE.staffId)}::uuid,
      ${sqlLiteral(gameTwo.id)}::uuid,
      'expired', '2000-01-01T00:00:00Z'::timestamptz,
      '2000-01-02T00:00:00Z'::timestamptz
    );
    update private.game_data_purge_control
    set arm_id = ${sqlLiteral(purgeFixture.armId)}::uuid,
        armed_until = clock_timestamp() + interval '2 hours',
        armed_by_staff_user_id = ${sqlLiteral(FIXTURE.staffId)}::uuid,
        armed_at = clock_timestamp(),
        disarmed_at = null,
        updated_at = clock_timestamp()
    where singleton;
    insert into private.game_data_purge_requests (
      id, game_session_id, game_name_snapshot, entitlement_id,
      license_expires_at, status, confirmation_hash,
      confirmation_issued_at, confirmation_not_before,
      confirmation_expires_at, confirmed_by_staff_user_id, confirmed_at,
      purge_not_before, confirmed_arm_id, r2_prefix, r2_deleted_at
    )
    select
      ${sqlLiteral(purgeFixture.requestId)}::uuid,
      game_row.id,
      game_row.name,
      ${sqlLiteral(purgeFixture.entitlementId)}::uuid,
      '2000-01-01T00:00:00Z'::timestamptz,
      'r2_deleted', repeat('c', 64),
      clock_timestamp() - interval '2 minutes',
      clock_timestamp() - interval '1 minute',
      clock_timestamp() + interval '30 minutes',
      ${sqlLiteral(FIXTURE.staffId)}::uuid,
      clock_timestamp() - interval '1 minute',
      clock_timestamp() - interval '1 day',
      ${sqlLiteral(purgeFixture.armId)}::uuid,
      'staging/game_session=${gameTwo.id}/',
      clock_timestamp() - interval '1 minute'
    from public.game_sessions as game_row
    where game_row.id = ${sqlLiteral(gameTwo.id)}::uuid;
    commit;
  `);

  const preflight = serviceJsonValue(
    `public.get_game_data_purge_preflight_v1(` +
      `${sqlLiteral(purgeFixture.requestId)}::uuid)`,
  );
  assert.equal(preflight.requestId, purgeFixture.requestId);
  assert.equal(preflight.gameSessionId, gameTwo.id);
  assert.equal(preflight.requestStatus, "r2_deleted");
  assert.equal(preflight.gameExists, true);
  assert.equal(preflight.purgeProtected, false);
  assert.equal(preflight.entitlementExpired, true);
  assert.equal(preflight.leverArmed, true);
  assert.equal(preflight.armMatches, true);
  assert.equal(preflight.environmentConfigured, true);
  assert.equal(preflight.environmentName, "staging");
  assert.equal(preflight.r2BucketName, "phase11-disposable-r2");
  assert.equal(preflight.registrySha256, purgeFingerprint.registrySha256);
  assert.equal(
    Number(preflight.registryTableCount),
    purgeFingerprint.registryTableCount,
  );
  assert.equal(preflight.fkGraphSha256, purgeFingerprint.fkGraphSha256);
  assert.equal(
    Number(preflight.fkGraphEdgeCount),
    purgeFingerprint.fkGraphEdgeCount,
  );
  assert.equal(
    preflight.deleteOrderSha256,
    purgeFingerprint.deleteOrderSha256,
  );
  assert.equal(
    Number(preflight.deleteOrderTableCount),
    purgeFingerprint.deleteOrderTableCount,
  );
  assert.equal(Number(preflight.crossGameBlockingReferences), 0);
  assert.equal(Number(preflight.dbDeleteCursor), 0);

  const unconfiguredClaim = runJson(`
    begin;
    update private.game_data_purge_requests
    set status = 'confirmed',
        r2_prefix = null,
        r2_deleted_at = null
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    update private.game_data_purge_control
    set environment_name = null,
        r2_bucket_name = null
    where singleton;
    set local role service_role;
    select jsonb_build_object(
      'claimCount', count(*),
      'requestStatus', (
        select request_row.status
        from private.game_data_purge_requests as request_row
        where request_row.id = ${sqlLiteral(purgeFixture.requestId)}::uuid
      )
    )::text
    from public.claim_confirmed_game_data_purge_v1();
    rollback;
  `);
  assert.equal(Number(unconfiguredClaim.claimCount), 0);
  assert.equal(unconfiguredClaim.requestStatus, "confirmed");

  expectSqlError(`
    begin;
    update private.game_data_purge_requests
    set status = 'r2_deleting'
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    select public.configure_game_data_purge_environment_v1(
      'production', 'unexpected-r2-bucket'
    );
    rollback;
  `, /GAME_PURGE_EXECUTION_IN_PROGRESS/u);

  expectSqlError(`
    begin;
    update private.game_data_purge_requests
    set status = 'r2_deleting'
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    select public.record_game_data_purge_r2_progress_v1(
      ${sqlLiteral(purgeFixture.requestId)}::uuid,
      'production/game_session=${gameTwo.id}/',
      1, 10, true
    );
    rollback;
  `, /GAME_PURGE_R2_BINDING_MISMATCH/u);

  const canonicalR2Progress = runJson(`
    begin;
    update private.game_data_purge_requests
    set status = 'r2_deleting',
        r2_deleted_at = null
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    create temporary table phase11_canonical_r2_progress on commit drop as
      select public.record_game_data_purge_r2_progress_v1(
        ${sqlLiteral(purgeFixture.requestId)}::uuid,
        'staging/game_session=${gameTwo.id}/',
        1, 10, true
      ) as result;
    select jsonb_build_object(
      'status', result ->> 'status',
      'prefix', result ->> 'r2Prefix',
      'persistedStatus', request_row.status,
      'persistedPrefix', request_row.r2_prefix,
      'completedAtRecorded', request_row.r2_deleted_at is not null
    )::text
    from phase11_canonical_r2_progress
    join private.game_data_purge_requests as request_row
      on request_row.id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    rollback;
  `);
  assert.equal(canonicalR2Progress.status, "r2_deleted");
  assert.equal(canonicalR2Progress.persistedStatus, "r2_deleted");
  assert.equal(
    canonicalR2Progress.prefix,
    `staging/game_session=${gameTwo.id}/`,
  );
  assert.equal(
    canonicalR2Progress.persistedPrefix,
    canonicalR2Progress.prefix,
  );
  assert.equal(canonicalR2Progress.completedAtRecorded, true);

  expectSqlError(`
    begin;
    set local role service_role;
    delete from public.store_offer_purchase_receipts
    where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid;
    commit;
  `, /permission denied for table store_offer_purchase_receipts/u);

  expectSqlError(`
    begin;
    update private.game_data_purge_requests as request_row
    set status = 'db_deleting',
        db_delete_cursor = order_row.position - 1,
        db_delete_token_hash = encode(
          extensions.digest(repeat('a', 64), 'sha256'), 'hex'
        ),
        db_delete_target_schema = order_row.table_schema,
        db_delete_target_table = order_row.table_name,
        db_delete_target_position = order_row.position
    from private.game_data_purge_delete_order_v1 as order_row
    where request_row.id = ${sqlLiteral(purgeFixture.requestId)}::uuid
      and order_row.table_schema = 'public'
      and order_row.table_name = 'store_offer_purchase_receipts';
    select set_config(
      'app.game_data_purge_request_id',
      ${sqlLiteral(purgeFixture.requestId)}, true
    );
    select set_config(
      'app.game_data_purge_delete_token', repeat('b', 64), true
    );
    delete from public.store_offer_purchase_receipts
    where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid;
    rollback;
  `, /STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE/u);

  expectSqlError(`
    select public.record_game_data_purge_db_progress_v1(
      ${sqlLiteral(purgeFixture.requestId)}::uuid,
      ${purgeFingerprint.finalizeCursor},
      '{}'::jsonb
    );
  `, /GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED/u);
  expectSqlError(`
    select public.record_game_data_purge_database_complete_v1(
      ${sqlLiteral(purgeFixture.requestId)}::uuid,
      '{}'::jsonb
    );
  `, /GAME_PURGE_LEGACY_PROGRESS_AUTHORITY_RETIRED/u);

  expectSqlError(`
    begin;
    update private.game_data_purge_requests
    set status = 'db_deleting',
        r2_prefix = 'production/game_session=${gameTwo.id}/'
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    select public.execute_game_data_purge_db_batch_v2(
      ${sqlLiteral(purgeFixture.requestId)}::uuid,
      20
    );
    rollback;
  `, /GAME_PURGE_R2_BINDING_MISMATCH/u);

  expectSqlError(`
    begin;
    update private.game_data_purge_requests
    set status = 'db_deleting',
        db_delete_cursor = ${purgeFingerprint.finalizeCursor},
        r2_prefix = 'production/game_session=${gameTwo.id}/'
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    select public.finalize_game_data_purge_v1(
      ${sqlLiteral(purgeFixture.requestId)}::uuid
    );
    rollback;
  `, /GAME_PURGE_R2_BINDING_MISMATCH/u);

  // A forged sentinel cannot replace physical zero-row proof.
  expectSqlError(`
    begin;
    update private.game_data_purge_requests
    set db_delete_cursor = ${purgeFingerprint.finalizeCursor}
    where id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    set local role service_role;
    select public.finalize_game_data_purge_v1(
      ${sqlLiteral(purgeFixture.requestId)}::uuid
    );
    rollback;
  `, /GAME_PURGE_DATABASE_ROWS_REMAIN/u);

  let cursor = 0;
  let batchCount = 0;
  while (cursor < purgeFingerprint.finalizeCursor) {
    const claim = serviceRows(
      "public.claim_confirmed_game_data_purge_v1()",
    );
    assert.equal(claim.length, 1);
    assert.equal(claim[0].request_id, purgeFixture.requestId);
    assert.equal(claim[0].game_session_id, gameTwo.id);
    assert.equal(claim[0].stage, "db");

    const result = serviceJsonValue(
      `public.execute_game_data_purge_db_batch_v2(` +
        `${sqlLiteral(purgeFixture.requestId)}::uuid,20)`,
    );
    const nextCursor = Number(result.cursor);
    assert.ok(nextCursor > cursor);
    assert.ok(nextCursor - cursor <= 20);
    assert.equal(result.requestId, purgeFixture.requestId);
    assert.equal(result.gameSessionId, gameTwo.id);
    assert.equal(
      result.readyToFinalize,
      nextCursor === purgeFingerprint.finalizeCursor,
    );

    const persisted = runJson(`
      select jsonb_build_object(
        'status', request_row.status,
        'cursor', request_row.db_delete_cursor,
        'authorizationCleared',
          request_row.db_delete_token_hash is null
          and request_row.db_delete_target_schema is null
          and request_row.db_delete_target_table is null
          and request_row.db_delete_target_position is null
      )::text
      from private.game_data_purge_requests as request_row
      where request_row.id = ${sqlLiteral(purgeFixture.requestId)}::uuid;
    `);
    assert.equal(persisted.status, "r2_deleted");
    assert.equal(Number(persisted.cursor), nextCursor);
    assert.equal(persisted.authorizationCleared, true);
    cursor = nextCursor;
    batchCount += 1;
  }
  assert.equal(batchCount, Math.ceil(purgeFingerprint.deleteOrderTableCount / 20));

  const finalized = serviceJsonValue(
    `public.finalize_game_data_purge_v1(` +
      `${sqlLiteral(purgeFixture.requestId)}::uuid)`,
  );
  assert.equal(finalized.requestId, purgeFixture.requestId);
  assert.equal(finalized.gameSessionId, gameTwo.id);
  assert.equal(finalized.status, "completed");
  assert.equal(finalized.leverDisarmed, true);

  const terminal = runJson(`
    select jsonb_build_object(
      'targetGameCount', (select count(*) from public.game_sessions
        where id = ${sqlLiteral(gameTwo.id)}::uuid),
      'comparisonGameCount', (select count(*) from public.game_sessions
        where id = ${sqlLiteral(gameOne.id)}::uuid),
      'targetEntitlementCount', (select count(*) from public.entitlements
        where id = ${sqlLiteral(purgeFixture.entitlementId)}::uuid),
      'requestStatus', (select status
        from private.game_data_purge_requests
        where id = ${sqlLiteral(purgeFixture.requestId)}::uuid),
      'authorizationCleared', (select
        db_delete_token_hash is null
        and db_delete_target_schema is null
        and db_delete_target_table is null
        and db_delete_target_position is null
        from private.game_data_purge_requests
        where id = ${sqlLiteral(purgeFixture.requestId)}::uuid),
      'immutableReceiptDeletes', (select coalesce(
        (db_deleted_rows ->> 'public.store_offer_purchase_receipts')::bigint,
        0
      ) from private.game_data_purge_requests
        where id = ${sqlLiteral(purgeFixture.requestId)}::uuid),
      'armCleared', (select arm_id is null and armed_until is null
        from private.game_data_purge_control where singleton),
      'comparisonPeriodEvidence', (select count(*)
        from public.business_operating_period_close_receipts
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
    )::text;
  `);
  assert.equal(Number(terminal.targetGameCount), 0);
  assert.equal(Number(terminal.comparisonGameCount), 1);
  assert.equal(Number(terminal.targetEntitlementCount), 0);
  assert.equal(terminal.requestStatus, "completed");
  assert.equal(terminal.authorizationCleared, true);
  assert.ok(Number(terminal.immutableReceiptDeletes) > 0);
  assert.equal(terminal.armCleared, true);
  assert.ok(Number(terminal.comparisonPeriodEvidence) > 0);

  return {
    batchCount,
    immutableReceiptDeletes: terminal.immutableReceiptDeletes,
    pendingWithdrawalCyclePurged: true,
  };
}

const prospectivePurgeFacts = readProspectivePurgeFacts();
assert.equal(
  prospectivePurgeFacts.registrySha256,
  purgeFingerprint.registrySha256,
);
assert.equal(
  Number(prospectivePurgeFacts.registryTableCount),
  purgeFingerprint.registryTableCount,
);
assert.equal(
  prospectivePurgeFacts.fkGraphSha256,
  purgeFingerprint.fkGraphSha256,
);
assert.equal(
  Number(prospectivePurgeFacts.fkGraphEdgeCount),
  purgeFingerprint.fkGraphEdgeCount,
);
assert.equal(
  prospectivePurgeFacts.deleteOrderSha256,
  purgeFingerprint.deleteOrderSha256,
);
assert.equal(
  Number(prospectivePurgeFacts.deleteOrderTableCount),
  purgeFingerprint.deleteOrderTableCount,
);
assert.equal(
  Number(prospectivePurgeFacts.finalizeCursor),
  purgeFingerprint.finalizeCursor,
);
const expectedPhase11PurgeTables = [...phase11PurgeTables].sort();
assert.deepEqual(
  prospectivePurgeFacts.phase11RegistryTables,
  expectedPhase11PurgeTables,
  "all six Phase 11 tables must be in the canonical purge registry",
);
assert.deepEqual(
  prospectivePurgeFacts.phase11DynamicRegistryTables,
  expectedPhase11PurgeTables,
  "all six Phase 11 tables must be selected by dynamic registry generation",
);
assert.deepEqual(
  prospectivePurgeFacts.phase11DeleteOrderTables,
  expectedPhase11PurgeTables,
  "all six Phase 11 tables must be in the prospective direct delete order",
);
assert.equal(Number(prospectivePurgeFacts.installedRegistryOnly), 0);
assert.equal(Number(prospectivePurgeFacts.dynamicRegistryOnly), 0);
assert.equal(Number(prospectivePurgeFacts.deleteOrderMismatch), 0);
assert.equal(Number(prospectivePurgeFacts.fkOrderViolations), 0);
assert.equal(prospectivePurgeFacts.withdrawalOfferDeleteRule, "c");

const installedRegistryDigest = serviceRow(
  "public.get_game_data_purge_registry_digest_v1()",
);
const installedFkDigest = serviceRow(
  "public.get_game_data_purge_fk_graph_digest_v1()",
);
const installedDeleteOrderDigest = serviceRow(
  "public.get_game_data_purge_delete_order_digest_v1()",
);
assert.equal(
  installedRegistryDigest.registry_sha256,
  purgeFingerprint.registrySha256,
);
assert.equal(
  Number(installedRegistryDigest.table_count),
  purgeFingerprint.registryTableCount,
);
assert.equal(installedFkDigest.fk_graph_sha256, purgeFingerprint.fkGraphSha256);
assert.equal(
  Number(installedFkDigest.edge_count),
  purgeFingerprint.fkGraphEdgeCount,
);
assert.equal(
  installedDeleteOrderDigest.order_sha256,
  purgeFingerprint.deleteOrderSha256,
);
assert.equal(
  Number(installedDeleteOrderDigest.table_count),
  purgeFingerprint.deleteOrderTableCount,
);

seedOperatingPoliciesAndClocks();

// Lazy clock initialization is part of the bounded worker claim, not a global
// provisioning sweep. Four overdue clockless Businesses with a limit of two
// create and claim exactly the deterministic oldest two; the rollback keeps the
// main acceptance fixture unchanged.
const lazyClockBound = 2;
const lazyClockFacts = proveLazyClockBatchBound(lazyClockBound);
const expectedLazyBusinessKeys = lazyClockBusinesses
  .slice(0, lazyClockBound)
  .map((business) => business.key);
assert.equal(Number(lazyClockFacts.clockCount), lazyClockBound);
assert.deepEqual(lazyClockFacts.clockBusinessKeys, expectedLazyBusinessKeys);
assert.equal(Number(lazyClockFacts.claimCount), lazyClockBound);
assert.deepEqual(lazyClockFacts.claimBusinessKeys, expectedLazyBusinessKeys);
assert.equal(
  Number(lazyClockFacts.remainingClocklessCount),
  lazyClockBusinesses.length - lazyClockBound,
);
const inactiveGameClaimFacts = proveInactiveGameClaimGate();
assert.equal(Number(inactiveGameClaimFacts.claimCount), 0);
assert.equal(Number(inactiveGameClaimFacts.clocklessBusinessClockCount), 0);
assert.equal(Number(inactiveGameClaimFacts.dueBusinessClaimCount), 0);

// Two foreign Checking accounts fund one exact Store bill. Checkout owns the
// immutable fixing/rate conversion; Store owns one seller receipt in the
// Business reporting currency; the guarded close assigns and taxes that
// receipt exactly once. A separate same-transaction characterization keeps
// foreign-denominated Business offers explicitly rejected by current policy.
const multicurrencyPeriodFacts = proveMulticurrencyFundedStorePeriodClose();
assert.deepEqual(multicurrencyPeriodFacts.sourceCurrencies, ["NRC", "YRC"]);
assert.equal(Number(multicurrencyPeriodFacts.fundingLineCount), 2);
assert.equal(multicurrencyPeriodFacts.allFundingLinesForeign, true);
assert.equal(multicurrencyPeriodFacts.allFundingLinesTargetECO, true);
assert.equal(multicurrencyPeriodFacts.allFundingLinesUseCheckoutSpread, true);
assert.equal(multicurrencyPeriodFacts.allCustomerRatesDiscounted, true);
assert.equal(multicurrencyPeriodFacts.allEffectiveRatesBounded, true);
assert.equal(multicurrencyPeriodFacts.allRoundingDisclosuresPresent, true);
assert.match(multicurrencyPeriodFacts.fixingKey, /^fxf_[0-9a-f]{32}$/u);
assert.match(
  multicurrencyPeriodFacts.policyVersion,
  /^fx-policy-v[1-9][0-9]*$/u,
);
for (const currencyCode of [
  multicurrencyPeriodFacts.storeQuoteCurrency,
  multicurrencyPeriodFacts.storeReceiptCurrency,
  multicurrencyPeriodFacts.fundingQuoteTargetCurrency,
  multicurrencyPeriodFacts.fundingReceiptTargetCurrency,
  multicurrencyPeriodFacts.targetAccountCurrency,
  multicurrencyPeriodFacts.businessReportingCurrency,
  multicurrencyPeriodFacts.assessmentCurrency,
  multicurrencyPeriodFacts.closeReportingCurrency,
  multicurrencyPeriodFacts.closeGrossCurrency,
  multicurrencyPeriodFacts.closeTaxCurrency,
]) {
  assert.equal(currencyCode, "ECO");
}
assert.equal(Number(multicurrencyPeriodFacts.storeQuoteExchangeRate), 1);
assert.equal(Number(multicurrencyPeriodFacts.storeReceiptGross), 7.5);
assert.equal(
  Number(multicurrencyPeriodFacts.fundingTargetContribution),
  Number(multicurrencyPeriodFacts.storeReceiptGross),
);
assert.equal(
  Number(multicurrencyPeriodFacts.fundingReceiptTargetAmount),
  Number(multicurrencyPeriodFacts.storeReceiptGross),
);
assert.equal(multicurrencyPeriodFacts.fundingReceiptBound, true);
assert.equal(Number(multicurrencyPeriodFacts.recipientCreditCount), 1);
assert.equal(
  Number(multicurrencyPeriodFacts.recipientCreditAmount),
  Number(multicurrencyPeriodFacts.storeReceiptGross),
);
assert.equal(Number(multicurrencyPeriodFacts.settlementReceiptCount), 1);
assert.equal(multicurrencyPeriodFacts.settlementReplayStable, true);
assert.equal(Number(multicurrencyPeriodFacts.probeAssignmentCount), 1);
assert.equal(
  Number(multicurrencyPeriodFacts.assessmentReceiptCount),
  Number(multicurrencyPeriodFacts.assignedReceiptCount),
);
assert.equal(
  Number(multicurrencyPeriodFacts.assessmentGross),
  Number(multicurrencyPeriodFacts.assignedGross),
);
assert.equal(
  Number(multicurrencyPeriodFacts.assessmentCogs),
  Number(multicurrencyPeriodFacts.assignedCogs),
);
assert.equal(Number(multicurrencyPeriodFacts.taxRate), 0.08);
assert.equal(multicurrencyPeriodFacts.taxFormulaReconciled, true);
assert.equal(multicurrencyPeriodFacts.periodSourcesReconciled, true);
assert.equal(Number(multicurrencyPeriodFacts.closeGrossCurrencyCount), 1);
assert.equal(Number(multicurrencyPeriodFacts.closeTaxCurrencyCount), 1);
assert.equal(
  Number(multicurrencyPeriodFacts.closeGross),
  Number(multicurrencyPeriodFacts.assessmentGross),
);
assert.equal(
  Number(multicurrencyPeriodFacts.closeTaxAssessed),
  Number(multicurrencyPeriodFacts.assessmentTaxAssessed),
);
assert.equal(
  Number(multicurrencyPeriodFacts.reportingTaxAssessed),
  Number(multicurrencyPeriodFacts.assessmentTaxAssessed),
);
assert.equal(
  Number(multicurrencyPeriodFacts.closeReceiptCount),
  Number(multicurrencyPeriodFacts.assessmentReceiptCount),
);
assert.equal(multicurrencyPeriodFacts.closeReplayStable, true);
assert.equal(
  multicurrencyPeriodFacts.sellerCurrencyError,
  "STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH",
);
assert.equal(Number(multicurrencyPeriodFacts.foreignSellerOfferResidue), 0);

// Newly opened periods are genuinely future-due. Worker claims derive time in
// the database and cannot be advanced by a caller-provided timestamp.
assert.deepEqual(claimDue(), []);
assert.equal(Number(runSql(`
  select count(*)
  from public.business_operating_period_claims;
`).output), 0);

// Poison the legacy/cached projections. A fixture-only replication-role scope
// models immutable pre-cutover history; normal runtime writes remain guarded
// and are checked below.
runSql(`
  begin;
  set local session_replication_role = replica;
  update public.business_entities
  set revenue_total = 999999.99,
      expense_total = 888888.88,
      profit_total = 777777.77,
      valuation = 666666.66,
      demand_index = 4.9999
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and id = ${sqlLiteral(gameOne.businessId)}::uuid;
  insert into public.business_cycle_settlement_receipts (
    public_key, game_session_id, business_id, settlement_key, request_hash,
    units_sold, gross_revenue, total_expense, net_income, ending_balance
  ) values (
    'bcsr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'phase11-pre-cutover-poison',
    repeat('b', 64), 999999, 999999.99, 1, 999998.99, 999999.99
  );
  commit;
`);
expectSqlError(`
  begin;
  set local role service_role;
  update public.business_entities
  set valuation = valuation + 1
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and id = ${sqlLiteral(gameOne.businessId)}::uuid;
  commit;
`, /BUSINESS_CACHED_FINANCIAL_AUTHORITY_RETIRED/u);
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.create_or_acquire_player_business_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.buyerOneId)}::uuid,
    'Retired Direct Acquisition',
    'sole_proprietorship',
    'manufacturing',
    'TST',
    'ECO',
    0,
    ${sqlLiteral(gameOne.businessKey)},
    'phase11-direct-acquisition-retired'
  );
  commit;
`, /BUSINESS_DIRECT_ACQUISITION_RETIRED/u);
const formationReplayFacts = proveSequentialFormationReplayContracts();
assert.match(formationReplayFacts.firstBusinessKey, /^biz_[0-9a-f]{32}$/u);
assert.equal(
  formationReplayFacts.replayBusinessKey,
  formationReplayFacts.firstBusinessKey,
);
assert.equal(
  formationReplayFacts.immutableReplayBusinessKey,
  formationReplayFacts.firstBusinessKey,
);
assert.equal(formationReplayFacts.firstStatus, "active");
assert.equal(formationReplayFacts.replayStatus, "active");
assert.equal(formationReplayFacts.immutableReplayStatus, "active");
assert.equal(formationReplayFacts.liveBusinessStatus, "closed");
assert.equal(
  formationReplayFacts.firstOwnerPlayerId,
  gameOne.buyerOneId,
);
assert.equal(formationReplayFacts.replayOwnerPlayerId, gameOne.buyerOneId);
assert.equal(
  formationReplayFacts.immutableReplayOwnerPlayerId,
  gameOne.buyerOneId,
);
for (const field of [
  "firstCapitalization",
  "replayCapitalization",
  "immutableReplayCapitalization",
  "liveBusinessCapitalization",
  "firstValuation",
  "replayValuation",
  "immutableReplayValuation",
  "auditCapitalContribution",
  "auditCapitalization",
  "auditValuation",
]) {
  assert.equal(
    typeof formationReplayFacts[field],
    "string",
    `${field} must remain present numeric evidence`,
  );
}
assert.equal(Number(formationReplayFacts.firstCapitalization), 0);
assert.equal(Number(formationReplayFacts.replayCapitalization), 0);
assert.equal(Number(formationReplayFacts.immutableReplayCapitalization), 0);
assert.equal(Number(formationReplayFacts.liveBusinessCapitalization), 123.45);
assert.equal(Number(formationReplayFacts.firstValuation), 0);
assert.equal(Number(formationReplayFacts.replayValuation), 0);
assert.equal(Number(formationReplayFacts.immutableReplayValuation), 0);
assert.equal(formationReplayFacts.firstReplayed, false);
assert.equal(formationReplayFacts.replayed, true);
assert.equal(formationReplayFacts.immutableReplayed, true);
assert.equal(Number(formationReplayFacts.businessCount), 1);
assert.equal(Number(formationReplayFacts.auditCount), 1);
assert.match(formationReplayFacts.auditFingerprint, /^[0-9a-f]{64}$/u);
assert.equal(
  formationReplayFacts.auditFingerprint,
  formationReplayFacts.expectedFingerprint,
);
assert.equal(formationReplayFacts.auditActorType, "player");
assert.equal(formationReplayFacts.auditTargetType, "business");
assert.equal(
  formationReplayFacts.auditIdempotencyKey,
  "phase11-formation-replay-contract",
);
assert.equal(
  formationReplayFacts.auditLegacyBusinessKey,
  formationReplayFacts.firstBusinessKey,
);
assert.equal(formationReplayFacts.auditAcquisition, false);
assert.equal(Number(formationReplayFacts.auditCapitalContribution), 0);
assert.deepEqual(formationReplayFacts.auditMetadataTypes, {
  acquisition: "boolean",
  businessKey: "string",
  capitalContribution: "number",
  idempotencyKey: "string",
  requestFingerprint: "string",
  resultBusinessKey: "string",
  resultCapitalization: "number",
  resultOwnerPlayerId: "string",
  resultStatus: "string",
  resultValuation: "number",
});
assert.equal(
  formationReplayFacts.auditBusinessKey,
  formationReplayFacts.firstBusinessKey,
);
assert.equal(formationReplayFacts.auditStatus, "active");
assert.equal(formationReplayFacts.auditOwnerPlayerId, gameOne.buyerOneId);
assert.equal(Number(formationReplayFacts.auditCapitalization), 0);
assert.equal(Number(formationReplayFacts.auditValuation), 0);
assert.equal(formationReplayFacts.auditTargetMatchesBusiness, true);
assert.equal(Number(formationReplayFacts.malformedAuditCount), 3);
assert.equal(Number(formationReplayFacts.unrelatedAuditCount), 0);
assert.equal(formationReplayFacts.conflictError, "IDEMPOTENCY_KEY_CONFLICT");
assert.equal(formationReplayFacts.singletonError, "BUSINESS_ALREADY_OWNED");
assert.equal(
  formationReplayFacts.auditUpdateError,
  "BUSINESS_FORMATION_AUDIT_IMMUTABLE",
);
assert.equal(
  formationReplayFacts.auditDeleteError,
  "BUSINESS_FORMATION_AUDIT_IMMUTABLE",
);
assert.equal(
  formationReplayFacts.malformedValuationError,
  "IDEMPOTENCY_KEY_CONFLICT",
);
assert.equal(
  formationReplayFacts.malformedBindingError,
  "IDEMPOTENCY_KEY_CONFLICT",
);
assert.equal(
  formationReplayFacts.malformedTypeError,
  "IDEMPOTENCY_KEY_CONFLICT",
);
const statusTransitionFacts = proveStatusTransitionReplayContracts();
assert.equal(statusTransitionFacts.firstBusinessKey, gameOne.businessKey);
assert.equal(statusTransitionFacts.firstStatus, "restructuring");
assert.equal(statusTransitionFacts.firstClosedAt, null);
assert.equal(statusTransitionFacts.firstReplayed, false);
assert.equal(statusTransitionFacts.recoveryBusinessKey, gameOne.businessKey);
assert.equal(statusTransitionFacts.recoveryStatus, "active");
assert.equal(statusTransitionFacts.recoveryClosedAt, null);
assert.equal(statusTransitionFacts.recoveryReplayed, false);
assert.equal(statusTransitionFacts.replayBusinessKey, gameOne.businessKey);
assert.equal(statusTransitionFacts.replayStatus, "restructuring");
assert.equal(
  Number(statusTransitionFacts.replayFailureCount),
  Number(statusTransitionFacts.firstFailureCount),
);
assert.equal(statusTransitionFacts.replayClosedAt, null);
assert.equal(statusTransitionFacts.replayed, true);
assert.equal(statusTransitionFacts.liveStatus, "active");
assert.equal(
  Number(statusTransitionFacts.liveFailureCount),
  Number(statusTransitionFacts.recoveryFailureCount),
);
assert.equal(statusTransitionFacts.liveClosedAt, null);
assert.equal(
  Number(statusTransitionFacts.liveVersion),
  Number(statusTransitionFacts.recoveryVersion),
);
assert.equal(Number(statusTransitionFacts.auditCount), 1);
assert.equal(statusTransitionFacts.auditActorType, "player");
assert.equal(statusTransitionFacts.auditTargetType, "business");
assert.equal(statusTransitionFacts.auditTargetMatchesBusiness, true);
assert.equal(
  statusTransitionFacts.auditIdempotencyKey,
  "phase11-status-transition-replay",
);
assert.match(statusTransitionFacts.auditFingerprint, /^[0-9a-f]{64}$/u);
assert.equal(
  statusTransitionFacts.auditFingerprint,
  statusTransitionFacts.expectedFingerprint,
);
assert.equal(statusTransitionFacts.auditTransition, "restructure");
assert.equal(
  statusTransitionFacts.auditReason,
  "Phase 11 status replay fixture",
);
assert.equal(statusTransitionFacts.auditStatus, "restructuring");
assert.equal(statusTransitionFacts.auditBusinessKey, gameOne.businessKey);
assert.equal(statusTransitionFacts.auditResultStatus, "restructuring");
assert.equal(
  Number(statusTransitionFacts.auditFailureCount),
  Number(statusTransitionFacts.firstFailureCount),
);
assert.equal(statusTransitionFacts.auditClosedAtType, "null");
assert.equal(
  statusTransitionFacts.auditPeriodClosureGuard,
  "business-operating-period-v1",
);
assert.equal(statusTransitionFacts.auditCreatedAtUnchanged, true);
assert.equal(statusTransitionFacts.auditMetadataUnchanged, true);
assert.match(statusTransitionFacts.auditDigestBefore, /^[0-9a-f]{64}$/u);
assert.equal(
  statusTransitionFacts.auditDigestAfter,
  statusTransitionFacts.auditDigestBefore,
);
assert.equal(
  statusTransitionFacts.conflictError,
  "IDEMPOTENCY_KEY_CONFLICT",
);
assert.equal(
  statusTransitionFacts.auditUpdateError,
  "BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE",
);
assert.equal(
  statusTransitionFacts.auditDeleteError,
  "BUSINESS_STATUS_TRANSITION_AUDIT_IMMUTABLE",
);
const neutralFormation = runJson(`
  begin;
  set local role service_role;
  create temporary table phase11_neutral_formation on commit drop as
  select * from public.create_or_acquire_player_business_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.buyerOneId)}::uuid,
    'Neutral Direct Formation',
    'sole_proprietorship',
    'manufacturing',
    'TST',
    'ECO',
    0,
    null,
    'phase11-direct-formation-neutral'
  );
  select jsonb_build_object(
    'returnedValuation', created.valuation::text,
    'storedValuation', business_row.valuation::text,
    'storedRevenue', business_row.revenue_total::text,
    'storedExpense', business_row.expense_total::text,
    'storedProfit', business_row.profit_total::text,
    'storedDemand', business_row.demand_index::text
  )::text
  from phase11_neutral_formation as created
  join public.business_entities as business_row
    on business_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
   and business_row.public_key = created.business_key;
  rollback;
`);
assert.equal(Number(neutralFormation.returnedValuation), 0);
assert.equal(Number(neutralFormation.storedValuation), 0);
assert.equal(Number(neutralFormation.storedRevenue), 0);
assert.equal(Number(neutralFormation.storedExpense), 0);
assert.equal(Number(neutralFormation.storedProfit), 0);
assert.equal(Number(neutralFormation.storedDemand), 1);
expectSqlError(`
  begin;
  set local role service_role;
  select public.business_position_fair_value_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    100
  );
  commit;
`, /BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE/u);
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.create_business_ownership_transfer_offer_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(gameOne.businessKey)},
    'P-CACHED-VALUATION-RETIRED',
    100,
    1,
    'phase11-cached-valuation-retired'
  );
  commit;
`, /BUSINESS_OWNERSHIP_TRANSFER_VALUATION_AUTHORITY_UNAVAILABLE/u);
assert.equal(Number(runSql(`
  select count(*)
  from public.business_ownership_transfer_offers
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and business_id = ${sqlLiteral(gameOne.businessId)}::uuid;
`).output), 0);

// Reserve real canonical cash, then set payroll to exactly the remaining
// available amount. Payroll must consume that amount before tax; held cash is
// unavailable and the period must still close with an unpaid tax liability.
createBusinessHold(gameOne, "5.00", "game-one");
const gameOneAccountBefore = businessAccount(gameOne);
const gameOneWage = (
  Number(gameOneAccountBefore.balance) - Number(gameOneAccountBefore.activeHolds)
).toFixed(2);
assert.ok(Number(gameOneWage) > 0);
runSql(`
  insert into public.business_workforce_role_definitions (
    public_key, role_key, display_name, labor_class,
    default_labor_minutes_per_cycle, minimum_skill_basis_points,
    status, metadata
  ) values (
    'wfr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'workforce.phase11.acceptance', 'Phase 11 acceptance worker',
    'administration', 60, 0, 'active',
    '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
  ) on conflict (role_key) do nothing;

  insert into public.business_employees (
    public_key, game_session_id, business_id, employee_player_id, role_name,
    contract_type, wage_per_cycle, productivity_index, status,
    workforce_role_definition_id, labor_minutes_per_cycle,
    skill_basis_points, workforce_source_type, workforce_version
  ) select
    'emp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    ${sqlLiteral(gameOne.buyerTwoId)}::uuid,
    'Phase 11 acceptance worker', 'cycle',
    ${sqlLiteral(gameOneWage)}::numeric, 1, 'active', role_row.id, 60, 0,
    'historical_v1', 1
  from public.business_workforce_role_definitions as role_row
  where role_row.role_key = 'workforce.phase11.acceptance';
`);

const eligibleGameOne = runJson(`
  select jsonb_build_object(
    'count', count(*),
    'gross', coalesce(sum(receipt_row.gross_revenue), 0)::text,
    'cogs', coalesce(sum(receipt_row.cost_of_goods_sold), 0)::text
  )::text
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and receipt_row.business_id = ${sqlLiteral(gameOne.businessId)}::uuid
    and receipt_row.business_sales_authority_version = 1;
`);
assert.ok(Number(eligibleGameOne.count) >= 2);

makeClockDue(gameOne);
const firstClaim = claimDue();
assert.equal(firstClaim.length, 1);
assert.equal(firstClaim[0].business_key, gameOne.businessKey);
assert.equal(firstClaim[0].period_number, 1);
assert.match(firstClaim[0].claim_key, /^bocl_[0-9a-f]{32}$/u);

const released = releaseClaim(
  firstClaim[0],
  "TRANSIENT_ACCEPTANCE_FAILURE",
  "phase11-release-game-one",
);
assert.equal(released.claim_status, "released");
assert.equal(released.replayed, false);
const releaseReplay = releaseClaim(
  firstClaim[0],
  "TRANSIENT_ACCEPTANCE_FAILURE",
  "phase11-release-game-one",
);
assert.equal(releaseReplay.replayed, true);
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.release_business_operating_period_lease_v1(
    ${sqlLiteral(firstClaim[0].claim_key)},
    ${sqlLiteral(firstClaim[0].lease_token)}::uuid,
    'DIFFERENT_REASON',
    'phase11-release-game-one'
  );
  commit;
`, /IDEMPOTENCY_KEY_CONFLICT/u);

const reclaimed = claimDue();
assert.equal(reclaimed.length, 1);
assert.equal(reclaimed[0].business_key, gameOne.businessKey);
assert.notEqual(reclaimed[0].claim_key, firstClaim[0].claim_key);
const gameOneClose = closeClaim(reclaimed[0], "phase11-close-game-one");
assert.equal(gameOneClose.business_key, gameOne.businessKey);
assert.equal(gameOneClose.replayed, false);
assert.match(
  gameOneClose.close_receipt_key ?? gameOneClose.receipt_key,
  /^bopr_[0-9a-f]{32}$/u,
);

const gameOneCloseFacts = runJson(`
  select jsonb_build_object(
    'closeCount', (select count(*)
      from public.business_operating_period_close_receipts
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'assignmentCount', (select count(*)
      from public.business_operating_period_store_receipts
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'gross', (select coalesce(sum(gross_receipts), 0)::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'cogs', (select coalesce(sum(cost_of_goods_sold), 0)::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'taxAssessed', (select coalesce(sum(tax_assessed), 0)::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'taxPaid', (select coalesce(sum(tax_paid), 0)::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'taxUnpaid', (select coalesce(sum(tax_unpaid), 0)::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid),
    'payrollDue', (select gross_wages_due::text
      from public.business_payroll_runs
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        and payroll_period_key = 'payroll:1'),
    'payrollPaid', (select gross_wages_paid::text
      from public.business_payroll_runs
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        and payroll_period_key = 'payroll:1'),
    'activeHolds', private.active_bank_account_hold_amount_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOneAccountBefore.id)}::uuid,
      '{}'::uuid[]
    )::text,
    'postedAfter', (select balance::text
      from public.account_balances
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and bank_account_id = ${sqlLiteral(gameOneAccountBefore.id)}::uuid),
    'legacyGross', (select gross_revenue::text
      from public.business_cycle_settlement_receipts
      where public_key = 'bcsr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'cachedRevenue', (select revenue_total::text
      from public.business_entities
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and id = ${sqlLiteral(gameOne.businessId)}::uuid)
  )::text;
`);
assert.equal(Number(gameOneCloseFacts.closeCount), 1);
assert.equal(
  Number(gameOneCloseFacts.assignmentCount),
  Number(eligibleGameOne.count),
);
assert.equal(Number(gameOneCloseFacts.gross), Number(eligibleGameOne.gross));
assert.equal(Number(gameOneCloseFacts.cogs), Number(eligibleGameOne.cogs));
assert.equal(Number(gameOneCloseFacts.payrollDue), Number(gameOneWage));
assert.equal(Number(gameOneCloseFacts.payrollPaid), Number(gameOneWage));
assert.equal(Number(gameOneCloseFacts.activeHolds), 5);
assert.equal(Number(gameOneCloseFacts.postedAfter), 5);
assert.ok(Number(gameOneCloseFacts.taxAssessed) > 0);
assert.equal(Number(gameOneCloseFacts.taxPaid), 0);
assert.equal(
  Number(gameOneCloseFacts.taxUnpaid),
  Number(gameOneCloseFacts.taxAssessed),
);
assert.equal(Number(gameOneCloseFacts.legacyGross), 999999.99);
assert.equal(Number(gameOneCloseFacts.cachedRevenue), 999999.99);

// Replay is immutable evidence, not a fresh operating authorization. Closing
// the Business after commit must not hide or reinterpret the original result.
runSql(`
  update public.business_entities
  set status = 'closed'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and id = ${sqlLiteral(gameOne.businessId)}::uuid;
`);
assert.equal(runSql(`
  select status
  from public.business_entities
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and id = ${sqlLiteral(gameOne.businessId)}::uuid;
`).output, "closed");
const gameOneReplay = closeClaim(reclaimed[0], "phase11-close-game-one");
assert.deepEqual(gameOneReplay, {
  ...gameOneClose,
  replayed: true,
});
runSql(`
  update public.business_entities
  set status = 'active'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and id = ${sqlLiteral(gameOne.businessId)}::uuid;
`);
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.close_claimed_business_operating_period_v1(
    ${sqlLiteral(reclaimed[0].claim_key)},
    ${sqlLiteral(reclaimed[0].lease_token)}::uuid,
    'phase11-close-game-one-conflict'
  );
  commit;
`, /BUSINESS_OPERATING_PERIOD_ALREADY_CLOSED/u);

// Normal service paths cannot recreate either retired historical authority.
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.settle_business_cycle_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessKey)},
    'phase11-retired-cycle', 100, 100, 100, 100
  );
  commit;
`, /BUSINESS_CYCLE_SETTLEMENT_RETIRED/u);
expectSqlError(`
  begin;
  set local role service_role;
  insert into public.business_sales (
    game_session_id, business_id, product_id, settlement_key, quantity,
    unit_price, gross_revenue, wage_expense, tax_expense, net_income,
    demand_index
  ) values (
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    'phase11-forbidden-sale', 1, 1, 1, 0, 0, 1, 1
  );
  commit;
`, /permission denied for table business_sales/u);
expectSqlError(`
  begin;
  set local role service_role;
  insert into public.business_cycle_settlement_receipts (
    game_session_id, business_id, settlement_key, request_hash, units_sold,
    gross_revenue, total_expense, net_income, ending_balance
  ) values (
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'phase11-forbidden-cycle', repeat('c', 64), 1, 1, 0, 1, 1
  );
  commit;
`, /permission denied for table business_cycle_settlement_receipts/u);
expectSqlError(`
  begin;
  insert into public.business_sales (
    game_session_id, business_id, product_id, settlement_key, quantity,
    unit_price, gross_revenue, wage_expense, tax_expense, net_income,
    demand_index
  ) values (
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    'phase11-trigger-forbidden-sale', 1, 1, 1, 0, 0, 1, 1
  );
  commit;
`, /BUSINESS_SALES_AUTHORITY_RETIRED/u);
expectSqlError(`
  begin;
  insert into public.business_cycle_settlement_receipts (
    game_session_id, business_id, settlement_key, request_hash, units_sold,
    gross_revenue, total_expense, net_income, ending_balance
  ) values (
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'phase11-trigger-forbidden-cycle', repeat('d', 64), 1, 1, 0, 1, 1
  );
  commit;
`, /BUSINESS_CYCLE_RECEIPT_AUTHORITY_RETIRED/u);

// Game two proves the same public-looking economics cannot cross scope and
// pays the Store-derived assessment in full.
purchaseBusinessOffer(gameTwo, "game-two-first");
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.transition_business_status_v1(
    ${sqlLiteral(gameTwo.id)}::uuid,
    ${sqlLiteral(gameTwo.ownerId)}::uuid,
    ${sqlLiteral(gameTwo.businessKey)},
    'close',
    'Attempt to bypass due Business obligations',
    'phase11-close-with-open-authority'
  );
  commit;
`, /BUSINESS_OPERATING_PERIOD_CLOSE_PENDING/u);
assert.equal(runSql(`
  select status
  from public.business_entities
  where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
    and id = ${sqlLiteral(gameTwo.businessId)}::uuid;
`).output, "active");
makeClockDue(gameTwo);
const gameTwoFirstClaim = claimDue();
assert.equal(gameTwoFirstClaim.length, 1);
assert.equal(gameTwoFirstClaim[0].business_key, gameTwo.businessKey);
expectSqlError(`
  begin;
  set local role service_role;
  select * from public.close_claimed_business_operating_period_v1(
    ${sqlLiteral(gameTwoFirstClaim[0].claim_key)},
    ${sqlLiteral(reclaimed[0].lease_token)}::uuid,
    'phase11-cross-game-token'
  );
  commit;
`, /BUSINESS_OPERATING_PERIOD_LEASE_TOKEN_INVALID/u);
assert.equal(Number(runSql(`
  select count(*)
  from public.business_operating_period_close_receipts
  where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid;
`).output), 0);

closeClaim(gameTwoFirstClaim[0], "phase11-close-game-two-first");
const firstAssessment = runJson(`
  select jsonb_build_object(
    'status', status,
    'assessed', tax_assessed::text,
    'paid', tax_paid::text,
    'unpaid', tax_unpaid::text
  )::text
  from public.business_gross_receipts_tax_assessments
  where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
    and business_id = ${sqlLiteral(gameTwo.businessId)}::uuid
    and period_number = 1;
`);
assert.equal(firstAssessment.status, "paid");
assert.ok(Number(firstAssessment.assessed) > 0);
assert.equal(Number(firstAssessment.paid), Number(firstAssessment.assessed));
assert.equal(Number(firstAssessment.unpaid), 0);

// A separate Business in the same second game proves partial payment without
// advancing or rewriting the anchored successor of an already closed period.
seedAdditionalBusiness(partialBusiness);
purchaseBusinessOffer(partialBusiness, "game-two-partial");
const gameTwoBeforePartial = businessAccount(partialBusiness);
const partialAvailable = "0.30";
const holdAmount = (
  Number(gameTwoBeforePartial.balance) - Number(partialAvailable)
).toFixed(2);
createBusinessHold(partialBusiness, holdAmount, "game-two-partial");
makeClockDue(partialBusiness);
const gameTwoSecondClaim = claimDue();
assert.equal(gameTwoSecondClaim.length, 1);
assert.equal(gameTwoSecondClaim[0].business_key, partialBusiness.businessKey);
assert.equal(gameTwoSecondClaim[0].period_number, 1);
closeClaim(gameTwoSecondClaim[0], "phase11-close-game-two-second");

const gameTwoFacts = runJson(`
  select jsonb_build_object(
    'closeCount', (select count(*)
      from public.business_operating_period_close_receipts
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id in (
          ${sqlLiteral(gameTwo.businessId)}::uuid,
          ${sqlLiteral(partialBusiness.businessId)}::uuid
        )),
    'assignmentCount', (select count(*)
      from public.business_operating_period_store_receipts
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id in (
          ${sqlLiteral(gameTwo.businessId)}::uuid,
          ${sqlLiteral(partialBusiness.businessId)}::uuid
        )),
    'distinctReceiptCount', (select count(distinct store_purchase_receipt_id)
      from public.business_operating_period_store_receipts
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id in (
          ${sqlLiteral(gameTwo.businessId)}::uuid,
          ${sqlLiteral(partialBusiness.businessId)}::uuid
        )),
    'partialStatus', (select status
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id = ${sqlLiteral(partialBusiness.businessId)}::uuid
        and period_number = 1),
    'partialAssessed', (select tax_assessed::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id = ${sqlLiteral(partialBusiness.businessId)}::uuid
        and period_number = 1),
    'partialPaid', (select tax_paid::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id = ${sqlLiteral(partialBusiness.businessId)}::uuid
        and period_number = 1),
    'partialUnpaid', (select tax_unpaid::text
      from public.business_gross_receipts_tax_assessments
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and business_id = ${sqlLiteral(partialBusiness.businessId)}::uuid
        and period_number = 1),
    'wrongGameAssignments', (select count(*)
      from public.business_operating_period_store_receipts as source_row
      join public.store_offer_purchase_receipts as receipt_row
        on receipt_row.id = source_row.store_purchase_receipt_id
      where source_row.game_session_id <> receipt_row.game_session_id
         or source_row.business_id <> receipt_row.business_id)
  )::text;
`);
assert.equal(Number(gameTwoFacts.closeCount), 2);
assert.equal(
  Number(gameTwoFacts.assignmentCount),
  Number(gameTwoFacts.distinctReceiptCount),
);
assert.equal(gameTwoFacts.partialStatus, "partially_paid");
assert.ok(Number(gameTwoFacts.partialAssessed) > Number(partialAvailable));
assert.equal(Number(gameTwoFacts.partialPaid), Number(partialAvailable));
assert.equal(
  Number(gameTwoFacts.partialUnpaid),
  Number(gameTwoFacts.partialAssessed) - Number(partialAvailable),
);
assert.equal(Number(gameTwoFacts.wrongGameAssignments), 0);

// No successor is early-claimable and every version-1 receipt has exactly one
// source assignment. The pre-cutover/history and cached poison remain unused.
assert.deepEqual(claimDue(), []);
const terminalFacts = runJson(`
  select jsonb_build_object(
    'unassignedAuthorityReceipts', (select count(*)
      from public.store_offer_purchase_receipts as receipt_row
      where receipt_row.business_sales_authority_version = 1
        and receipt_row.business_id is not null
        and not exists (
          select 1
          from public.business_operating_period_store_receipts as source_row
          where source_row.game_session_id = receipt_row.game_session_id
            and source_row.store_purchase_receipt_id = receipt_row.id
        )),
    'duplicateAssignments', (select count(*)
      from (
        select game_session_id, store_purchase_receipt_id
        from public.business_operating_period_store_receipts
        group by game_session_id, store_purchase_receipt_id
        having count(*) <> 1
      ) as duplicates),
    'legacySaleCount', (select count(*) from public.business_sales),
    'legacyCycleCount', (select count(*)
      from public.business_cycle_settlement_receipts),
    'completedClaims', (select count(*)
      from public.business_operating_period_claims where status = 'completed')
  )::text;
`);
assert.equal(Number(terminalFacts.unassignedAuthorityReceipts), 0);
assert.equal(Number(terminalFacts.duplicateAssignments), 0);
assert.equal(Number(terminalFacts.legacySaleCount), 0);
assert.equal(Number(terminalFacts.legacyCycleCount), 1);
assert.equal(Number(terminalFacts.completedClaims), 3);

const purgeExecution = proveExecutableWholeGamePurge();
assert.ok(Number(purgeExecution.batchCount) > 1);
assert.ok(Number(purgeExecution.immutableReceiptDeletes) > 0);
assert.equal(purgeExecution.pendingWithdrawalCyclePurged, true);

console.log(JSON.stringify({
  ok: true,
  lazyClockProvisioningBounded: true,
  inactiveGameProvisionAndClaimDenied: true,
  futureDueDenied: true,
  releasedAndReclaimed: true,
  multicurrencyStoreFundingPeriodClose: true,
  foreignSellerCurrencyRejected: true,
  storeReceiptAuthorityVersion: 1,
  storeReceiptsAssignedExactlyOnce: true,
  payrollBeforeTax: true,
  activeHoldsPreserved: true,
  fullPartialAndUnpaidTax: true,
  cachedAndLegacyPoisonIgnored: true,
  cachedValuationTransferAuthorityRetired: true,
  directAcquisitionRetired: true,
  newCachedFinancialsNeutral: true,
  replayAndConflict: true,
  statusTransitionReplayAndAuditImmutable: true,
  businessClosureEscapeDenied: true,
  legacySettlementRetired: true,
  twoGameIsolation: true,
  executablePurgeContract: true,
  requestBoundPurgeDelete: true,
  wholeGamePurgeCompleted: true,
  pendingWithdrawalCyclePurged: true,
}));
