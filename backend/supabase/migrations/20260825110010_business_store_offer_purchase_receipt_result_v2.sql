-- Business V2 Phase 10A.3: immutable public-key-only receipt projection.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.read_store_offer_purchase_receipt_result_v2(
  p_receipt_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
  select jsonb_build_object(
    'receiptKey', receipt_row.public_key,
    'quoteKey', receipt_row.quote_key,
    'offerKey', receipt_row.offer_key,
    'businessKey', receipt_row.business_key,
    'sellerPartyKey', receipt_row.seller_party_key,
    'catalogItemKey', receipt_row.catalog_item_key,
    'canonicalItemKey', receipt_row.canonical_item_key,
    'storeItemKey', receipt_row.store_item_key,
    'buyerInventoryAccountKey', receipt_row.buyer_inventory_account_key,
    'inventoryTransactionKey', receipt_row.inventory_transaction_key,
    'quantity', receipt_row.quantity,
    'unitPrice', receipt_row.unit_price,
    'totalPrice', receipt_row.total_price,
    'currencyCode', receipt_row.currency_code,
    'buyerDebit', receipt_row.buyer_debit,
    'businessCredit', receipt_row.business_credit,
    'grossRevenue', receipt_row.gross_revenue,
    'costOfGoodsSold', receipt_row.cost_of_goods_sold,
    'grossMargin', receipt_row.gross_margin,
    'sourceUnitCost', receipt_row.source_unit_cost,
    'costCurrencyCode', receipt_row.cost_currency_code,
    'offerVersionBefore', receipt_row.offer_version_before,
    'offerVersionAfter', receipt_row.offer_version_after,
    'remainingListedQuantity', receipt_row.remaining_listed_quantity,
    'completedAt', receipt_row.completed_at,
    'replayed', p_replayed
  )
  from public.store_offer_purchase_receipts as receipt_row
  where receipt_row.id = p_receipt_id
$function$;

revoke all on function economy_private.read_store_offer_purchase_receipt_result_v2(uuid, boolean)
  from public, anon, authenticated, service_role;

commit;
