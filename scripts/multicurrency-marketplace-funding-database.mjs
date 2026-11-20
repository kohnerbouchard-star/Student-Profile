import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL ?? "";

assert.ok(databaseUrl, "DATABASE_URL is required.");
const parsed = new URL(databaseUrl.replace(/^postgresql:/u, "postgres:"));
assert.equal(parsed.protocol, "postgres:");
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.port, "54322");
assert.equal(parsed.pathname, "/postgres");

async function sql(statement, { json = false } = {}) {
  const { stdout } = await execFileAsync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
    { timeout: 120_000, maxBuffer: 8_388_608 },
  );
  const output = String(stdout ?? "").trim();
  if (!json) return output;
  const lines = output.split(/\r?\n/u).filter(Boolean);
  assert.ok(lines.length > 0, "Expected a JSON row from the rebuilt database.");
  return JSON.parse(lines.at(-1));
}

async function expectFailure(statement, expectedCode) {
  try {
    await sql(statement);
  } catch (error) {
    const diagnostic = [error?.stdout, error?.stderr, error?.message]
      .filter(Boolean)
      .join("\n");
    assert.ok(
      diagnostic.includes(expectedCode),
      `Expected ${expectedCode}, received: ${diagnostic}`,
    );
    return;
  }
  assert.fail(`Expected ${expectedCode}, but the command succeeded.`);
}

const snapshot = await sql(`
  select jsonb_build_object(
    'quoteFunction', to_regprocedure(
      'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'
    ) is not null,
    'settlementFunction', to_regprocedure(
      'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'
    ) is not null,
    'refundFunction', to_regprocedure(
      'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'
    ) is not null,
    'privateReversal', to_regprocedure(
      'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)'
    ) is not null,
    'refundTable', to_regclass('public.marketplace_funding_refunds') is not null,
    'refundRls', (
      select class_row.relrowsecurity and class_row.relforcerowsecurity
      from pg_class as class_row
      where class_row.oid = 'public.marketplace_funding_refunds'::regclass
    ),
    'anonRefundSelect', has_table_privilege(
      'anon', 'public.marketplace_funding_refunds', 'select'
    ),
    'authenticatedRefundSelect', has_table_privilege(
      'authenticated', 'public.marketplace_funding_refunds', 'select'
    ),
    'serviceRefundInsert', has_table_privilege(
      'service_role', 'public.marketplace_funding_refunds', 'insert'
    ),
    'serviceQuoteExecute', has_function_privilege(
      'service_role',
      'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
      'execute'
    ),
    'serviceSettlementExecute', has_function_privilege(
      'service_role',
      'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)',
      'execute'
    ),
    'serviceRefundExecute', has_function_privilege(
      'service_role',
      'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)',
      'execute'
    ),
    'servicePrivateReversalExecute', has_function_privilege(
      'service_role',
      'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)',
      'execute'
    ),
    'reservationFundingColumns', (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketplace_purchase_reservations'
        and column_name in (
          'funding_quote_id',
          'funding_context_hash',
          'settlement_clearing_account_id',
          'seller_bank_account_id',
          'fee_bank_account_id',
          'tax_bank_account_id',
          'funding_idempotency_key',
          'policy_evidence_hash'
        )
    ),
    'orderFundingColumns', (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'marketplace_orders'
        and column_name in (
          'funding_receipt_id',
          'funding_bank_transaction_id',
          'distribution_bank_transaction_id',
          'settlement_clearing_account_id',
          'seller_bank_account_id',
          'fee_bank_account_id',
          'tax_bank_account_id',
          'settlement_idempotency_key',
          'settlement_request_hash'
        )
    )
  )::text;
`, { json: true });

assert.equal(snapshot.quoteFunction, true);
assert.equal(snapshot.settlementFunction, true);
assert.equal(snapshot.refundFunction, true);
assert.equal(snapshot.privateReversal, true);
assert.equal(snapshot.refundTable, true);
assert.equal(snapshot.refundRls, true);
assert.equal(snapshot.anonRefundSelect, false);
assert.equal(snapshot.authenticatedRefundSelect, false);
assert.equal(snapshot.serviceRefundInsert, false);
assert.equal(snapshot.serviceQuoteExecute, true);
assert.equal(snapshot.serviceSettlementExecute, true);
assert.equal(snapshot.serviceRefundExecute, true);
assert.equal(snapshot.servicePrivateReversalExecute, false);
assert.equal(Number(snapshot.reservationFundingColumns), 8);
assert.equal(Number(snapshot.orderFundingColumns), 9);

const normalized = await sql(`
  select private.marketplace_funding_normalize_allocations_v1(
    '[
      {"sourceAccountKey":"bac_11111111111111111111111111111111","targetAmount":"3.25"},
      {"sourceAccountKey":"bac_22222222222222222222222222222222","targetAmount":"6.75"}
    ]'::jsonb
  )::text;
`, { json: true });
assert.deepEqual(normalized, [
  {
    sourceAccountKey: "bac_11111111111111111111111111111111",
    targetAmount: "3.25",
  },
  {
    sourceAccountKey: "bac_22222222222222222222222222222222",
    targetAmount: "6.75",
  },
]);

await expectFailure(`
  select private.marketplace_funding_normalize_allocations_v1(
    '[
      {"sourceAccountKey":"bac_11111111111111111111111111111111","targetAmount":"5"},
      {"sourceAccountKey":"bac_11111111111111111111111111111111","targetAmount":"5"}
    ]'::jsonb
  );
`, "MARKETPLACE_FUNDING_ALLOCATIONS_INVALID");

const functionSafety = await sql(`
  select jsonb_build_object(
    'quoteUsesC0', position(
      'create_purchase_funding_quote_v1'
      in pg_get_functiondef(
        'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'::regprocedure
      )
    ) > 0,
    'quoteUsesListingCurrency', position(
      'upper(v_listing.currency_code)'
      in pg_get_functiondef(
        'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'::regprocedure
      )
    ) > 0,
    'settlementUsesComposer', position(
      'compose_purchase_funding_v1'
      in pg_get_functiondef(
        'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
      )
    ) > 0,
    'settlementUsesBalancedDistribution', position(
      'post_bank_transaction_v1'
      in pg_get_functiondef(
        'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
      )
    ) > 0,
    'refundUsesExactJournalReversal', position(
      'purchase_funding_exact_reversal'
      in pg_get_functiondef(
        'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)'::regprocedure
      )
    ) > 0,
    'settlementLegacyLedgerAbsent', position(
      'record_player_ledger_entry'
      in pg_get_functiondef(
        'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
      )
    ) = 0,
    'settlementTreasuryAbsent', position(
      'marketplace_treasury_balances'
      in pg_get_functiondef(
        'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
      )
    ) = 0,
    'refundCurrentRateAbsent', position(
      'convert_currency_amount'
      in pg_get_functiondef(
        'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'::regprocedure
      )
    ) = 0
  )::text;
`, { json: true });

for (const [key, value] of Object.entries(functionSafety)) {
  assert.equal(value, true, `Database function safety assertion failed: ${key}`);
}

const directRows = await sql(`
  select jsonb_build_object(
    'refundRows', count(*),
    'fundedReservations', (
      select count(*)
      from public.marketplace_purchase_reservations
      where funding_quote_id is not null
    ),
    'fundedOrders', (
      select count(*)
      from public.marketplace_orders
      where funding_receipt_id is not null
    )
  )::text
  from public.marketplace_funding_refunds;
`, { json: true });
assert.equal(Number(directRows.refundRows), 0);
assert.equal(Number(directRows.fundedReservations), 0);
assert.equal(Number(directRows.fundedOrders), 0);

console.log("Multi-currency Marketplace funding database acceptance passed.");
