import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL ?? "";
assert.ok(databaseUrl, "DATABASE_URL is required.");
const parsed = new URL(databaseUrl.replace(/^postgresql:/u, "postgres:"));
assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
assert.equal(parsed.port, "54322");

async function query(statement) {
  const { stdout } = await execFileAsync(
    "psql",
    [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
    { timeout: 120_000, maxBuffer: 4_194_304 },
  );
  return String(stdout ?? "").trim();
}

const result = JSON.parse(await query(`
  with definitions as (
    select
      pg_get_functiondef(
        'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'::regprocedure
      ) as quote_definition,
      pg_get_functiondef(
        'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure
      ) as settlement_definition,
      pg_get_functiondef(
        'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'::regprocedure
      ) as refund_definition
  )
  select jsonb_build_object(
    'quoteReplayBeforeListing',
      position('buyer_idempotency_key = v_idempotency_key' in quote_definition)
        < position('for update;' in quote_definition),
    'quoteListingBeforeC0',
      position('-- Listing is the first mutable commercial root.' in quote_definition)
        < position('create_purchase_funding_quote_v1' in quote_definition),
    'settlementReplayBeforeListing',
      position('-- Resolve order replay before current listing' in settlement_definition)
        < position('-- Listing is the first mutable economic root.' in settlement_definition),
    'settlementListingBeforeFundingQuote',
      position('-- Listing is the first mutable economic root.' in settlement_definition)
        < position('select quote_row.*' in settlement_definition),
    'settlementInventoryBeforeComposer',
      position('marketplace_assert_listing_reservation_v1' in settlement_definition)
        < position('compose_purchase_funding_v1' in settlement_definition),
    'settlementComposerBeforeDistribution',
      position('compose_purchase_funding_v1' in settlement_definition)
        < position('marketplace_purchase_distribution' in settlement_definition),
    'settlementDistributionBeforeInventoryMove',
      position('marketplace_purchase_distribution' in settlement_definition)
        < position('marketplace_transition_listing_reservation_v1' in settlement_definition),
    'refundReplayBeforeDisputeLock',
      position('marketplace_funding_refunds as refund_row' in refund_definition)
        < position('marketplace_disputes as dispute_row' in refund_definition),
    'refundDistributionBeforeFundingReversal',
      position('marketplace_refund_distribution' in refund_definition)
        < position('reverse_purchase_funding_receipt_v1' in refund_definition),
    'refundMoneyBeforeInventoryMove',
      position('reverse_purchase_funding_receipt_v1' in refund_definition)
        < position('update public.inventory_holdings' in refund_definition),
    'settlementHasGameScopedAdvisory',
      position('marketplace_funded_settlement_v1' in settlement_definition) > 0,
    'refundHasGameScopedAdvisory',
      position('marketplace_funded_refund_v1' in refund_definition) > 0
  )::text
  from definitions;
`));

for (const [name, passed] of Object.entries(result)) {
  assert.equal(passed, true, `Marketplace funding lock-order assertion failed: ${name}`);
}

console.log("Multi-currency Marketplace funding lock-order contract passed.");
