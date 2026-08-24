-- Business V2 Phase 10A.2: service-only Business seller-offer quote command.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.create_business_store_offer_quote_v2(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_offer_key text,
  p_quantity integer,
  p_expected_offer_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_buyer public.players%rowtype;
  v_assignment public.player_country_assignments%rowtype;
  v_country public.country_profiles%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_store_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_account public.inventory_accounts%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_quote public.store_offer_purchase_quotes%rowtype;
  v_offer_key text := lower(btrim(coalesce(p_offer_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_hash text;
  v_available bigint;
  v_unit_price numeric(18,4);
  v_total_price numeric(18,4);
begin
  if p_game_session_id is null or p_buyer_player_id is null
    or v_offer_key !~ '^sof_[0-9a-f]{32}$'
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_expected_offer_version is null or p_expected_offer_version < 1
    or length(v_idempotency_key) not between 8 and 160
  then
    raise exception 'STORE_OFFER_QUOTE_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(concat_ws('|',
        'business-offer-quote-v2', p_game_session_id::text,
        p_buyer_player_id::text, v_offer_key, p_quantity::text,
        p_expected_offer_version::text
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',
    'business_store_offer_quote_v2', p_game_session_id::text,
    p_buyer_player_id::text, v_idempotency_key
  ), 0));

  -- Durable replay precedes every mutable live-state interpretation.
  select quote_row.* into v_quote
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.buyer_player_id = p_buyer_player_id
    and quote_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_quote.request_hash is distinct from v_request_hash then
      raise exception 'STORE_OFFER_QUOTE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return economy_private.read_store_offer_purchase_quote_result_v2(v_quote.id, true);
  end if;

  select player_row.* into v_buyer
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_buyer_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_BUYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select assignment_row.* into v_assignment
  from public.player_country_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_buyer_player_id
    and assignment_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_BUYER_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select country_row.* into v_country
  from public.country_profiles as country_row
  where country_row.id = v_assignment.country_profile_id
    and country_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_BUYER_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Seller offer is the first mutable commercial row and is locked before stock.
  select offer_row.* into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_kind = 'business'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'STORE_OFFER_QUOTE_OFFER_STATUS_INVALID' using errcode = 'P0001';
  end if;
  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_offer.inventory_account_id is null then
    raise exception 'STORE_OFFER_QUOTE_CUSTODY_MISSING' using errcode = 'P0001';
  end if;

  select party_row.* into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_offer.seller_party_id
    and party_row.party_kind = 'business'
    and party_row.status = 'active'
  for share;
  if not found or v_party.business_id is null then
    raise exception 'STORE_OFFER_QUOTE_SELLER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_party.business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_BUSINESS_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_business.owner_player_id = p_buyer_player_id then
    raise exception 'STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_business.currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_QUOTE_SELLER_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select store_row.* into v_store_item
  from public.store_items as store_row
  where store_row.game_session_id = p_game_session_id
    and store_row.id = v_offer.store_item_id
    and store_row.status = 'active'
    and store_row.visibility = 'visible'
  for share;
  if not found
    or v_store_item.game_item_id is distinct from v_offer.game_item_id
    or v_store_item.currency_code is distinct from v_offer.currency_code
  then
    raise exception 'STORE_OFFER_QUOTE_CATALOG_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select item_row.* into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_offer.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.* into v_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_CUSTODY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.* into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_account.id
    and holding_row.game_item_id = v_offer.game_item_id
  for share;
  if not found then
    raise exception 'STORE_OFFER_QUOTE_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_holding.quantity_owned <> trunc(v_holding.quantity_owned)
    or v_holding.quantity_reserved <> trunc(v_holding.quantity_reserved)
  then
    raise exception 'STORE_OFFER_QUOTE_LISTING_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if v_holding.quantity_reserved <> 0 then
    raise exception 'STORE_OFFER_QUOTE_INVENTORY_RESERVED' using errcode = 'P0001';
  end if;
  v_available := v_holding.quantity_owned::bigint;
  if v_available < p_quantity then
    raise exception 'STORE_OFFER_QUOTE_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  -- Cross-currency settlement is deferred until a named FX clearing authority exists.
  if v_country.currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED' using errcode = 'P0001';
  end if;

  v_unit_price := round(v_offer.unit_price, 4);
  v_total_price := round(v_unit_price * p_quantity, 4);
  insert into public.store_offer_purchase_quotes(
    game_session_id, buyer_player_id, buyer_country_profile_id,
    buyer_country_code, offer_id, business_id, seller_party_id,
    store_item_id, game_item_id, inventory_account_id, quantity,
    offer_version, available_quantity_at_quote, seller_unit_price,
    final_unit_price, seller_total_price, final_total_price,
    seller_currency_code, buyer_currency_code, exchange_rate,
    pricing_version, request_idempotency_key, request_hash,
    expires_at, metadata
  ) values (
    p_game_session_id, p_buyer_player_id, v_country.id,
    v_country.country_code, v_offer.id, v_business.id, v_party.id,
    v_store_item.id, v_game_item.id, v_account.id, p_quantity,
    v_offer.version, v_available, v_unit_price,
    v_unit_price, v_total_price, v_total_price,
    v_offer.currency_code, v_country.currency_code, 1,
    'business-offer-fixed-price-v2', v_idempotency_key, v_request_hash,
    statement_timestamp() + interval '2 minutes',
    jsonb_build_object(
      'authority', 'business_store_offer_quote_v2',
      'pricingPolicy', 'same_currency_fixed_offer_price',
      'nonReserving', true
    )
  ) returning * into v_quote;

  return economy_private.read_store_offer_purchase_quote_result_v2(v_quote.id, false);
end
$function$;

comment on function public.create_business_store_offer_quote_v2(
  uuid, uuid, text, integer, bigint, text
) is
  'Creates or replays an immutable same-currency Business offer quote without money, Inventory, or offer mutation.';

revoke all on function public.create_business_store_offer_quote_v2(
  uuid, uuid, text, integer, bigint, text
) from public, anon, authenticated;
grant execute on function public.create_business_store_offer_quote_v2(
  uuid, uuid, text, integer, bigint, text
) to service_role;

commit;
