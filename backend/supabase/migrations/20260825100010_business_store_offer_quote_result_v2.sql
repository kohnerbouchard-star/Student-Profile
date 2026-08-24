-- Business V2 Phase 10A.2: public-key-only quote result projection.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.read_store_offer_purchase_quote_result_v2(
  p_quote_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, public, economy_private, pg_temp
as $function$
  select jsonb_build_object(
    'quoteKey', quote_row.public_key,
    'quoteStatus', case
      when quote_row.status = 'created' and quote_row.expires_at <= statement_timestamp()
      then 'expired'
      else quote_row.status
    end,
    'offerKey', offer_row.public_key,
    'offerVersion', quote_row.offer_version,
    'businessKey', business_row.public_key,
    'sellerPartyKey', party_row.public_key,
    'catalogItemKey', item_row.public_key,
    'canonicalItemKey', item_row.canonical_key,
    'storeItemKey', store_row.item_key,
    'inventoryAccountKey', account_row.public_key,
    'buyerCountryCode', quote_row.buyer_country_code,
    'quantity', quote_row.quantity,
    'availableQuantityAtQuote', quote_row.available_quantity_at_quote,
    'sellerUnitPrice', quote_row.seller_unit_price,
    'finalUnitPrice', quote_row.final_unit_price,
    'sellerTotalPrice', quote_row.seller_total_price,
    'finalTotalPrice', quote_row.final_total_price,
    'sellerCurrencyCode', quote_row.seller_currency_code,
    'buyerCurrencyCode', quote_row.buyer_currency_code,
    'exchangeRate', quote_row.exchange_rate,
    'pricingVersion', quote_row.pricing_version,
    'createdAt', quote_row.created_at,
    'expiresAt', quote_row.expires_at,
    'replayed', p_replayed
  )
  from public.store_offer_purchase_quotes as quote_row
  join public.store_seller_offers as offer_row
    on offer_row.game_session_id = quote_row.game_session_id
   and offer_row.id = quote_row.offer_id
  join public.business_entities as business_row
    on business_row.game_session_id = quote_row.game_session_id
   and business_row.id = quote_row.business_id
  join public.economic_parties as party_row
    on party_row.game_session_id = quote_row.game_session_id
   and party_row.id = quote_row.seller_party_id
  join public.game_items as item_row
    on item_row.game_session_id = quote_row.game_session_id
   and item_row.id = quote_row.game_item_id
  join public.store_items as store_row
    on store_row.game_session_id = quote_row.game_session_id
   and store_row.id = quote_row.store_item_id
  join public.inventory_accounts as account_row
    on account_row.game_session_id = quote_row.game_session_id
   and account_row.id = quote_row.inventory_account_id
  where quote_row.id = p_quote_id
$function$;

revoke all on function economy_private.read_store_offer_purchase_quote_result_v2(
  uuid, boolean
) from public, anon, authenticated;
grant execute on function economy_private.read_store_offer_purchase_quote_result_v2(
  uuid, boolean
) to service_role;

commit;
