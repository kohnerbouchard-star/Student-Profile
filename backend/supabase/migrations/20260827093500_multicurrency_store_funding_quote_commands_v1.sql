-- Econovaria Business V2 Phase 10A.4C1: Store-owned funded quote commands.
--
-- Seeded/NPC and Business seller-offer quotes remain Store identities while
-- binding one immutable C0 purchase-funding quote for the exact bill currency.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.read_seeded_store_funding_quote_result_v1(
  p_store_quote_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'quoteKey', quote_row.public_quote_key,
    'quoteStatus', case
      when quote_row.status = 'CREATED'
        and quote_row.expires_at <= statement_timestamp()
      then 'EXPIRED'
      else quote_row.status
    end,
    'itemKey', item_row.item_key,
    'itemName', item_row.name,
    'quantity', quote_row.quantity,
    'baseUnitPrice', quote_row.base_unit_price,
    'inflationMultiplier', quote_row.inflation_multiplier,
    'locationMultiplier', quote_row.location_multiplier,
    'scarcityMultiplier', quote_row.scarcity_multiplier,
    'discountAmount', quote_row.discount_amount,
    'finalUnitPrice', quote_row.final_unit_price,
    'finalTotalPrice', quote_row.final_total_price,
    'currencyCode', quote_row.currency_code,
    'itemCurrencyCode', quote_row.item_currency_code,
    'playerCurrencyCode', quote_row.player_currency_code,
    'exchangeRate', quote_row.exchange_rate,
    'itemLocalFinalUnitPrice', quote_row.item_local_final_unit_price,
    'itemLocalFinalTotalPrice', quote_row.item_local_final_total_price,
    'pricingVersion', quote_row.pricing_version,
    'expiresAt', quote_row.expires_at,
    'replayed', p_replayed,
    'fundingQuote', private.purchase_funding_quote_public_json_v1(
      quote_row.funding_quote_id
    )
  )
  from public.store_purchase_quotes as quote_row
  join public.store_items as item_row
    on item_row.id = quote_row.store_item_id
   and item_row.game_session_id = quote_row.game_session_id
  where quote_row.id = p_store_quote_id
    and quote_row.funding_quote_id is not null;
$function$;

revoke all on function private.read_seeded_store_funding_quote_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function economy_private.read_store_offer_funding_quote_result_v1(
  p_store_quote_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, economy_private, pg_temp
as $function$
  select economy_private.read_store_offer_purchase_quote_result_v2(
    quote_row.id,
    p_replayed
  ) || jsonb_build_object(
    'fundingQuote', private.purchase_funding_quote_public_json_v1(
      quote_row.funding_quote_id
    )
  )
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.id = p_store_quote_id
    and quote_row.funding_quote_id is not null;
$function$;

revoke all on function economy_private.read_store_offer_funding_quote_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.create_seeded_store_funding_quote_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_allocations jsonb,
  p_idempotency_key text,
  p_effective_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_effective_at timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_allocations jsonb;
  v_request_hash text;
  v_existing public.store_purchase_quotes%rowtype;
  v_game_status text;
  v_player public.players%rowtype;
  v_assignment public.player_country_assignments%rowtype;
  v_country public.country_profiles%rowtype;
  v_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_stock_account public.inventory_accounts%rowtype;
  v_stock_holding public.inventory_holdings%rowtype;
  v_pricing record;
  v_store_pricing_version text;
  v_store_quote_id uuid := extensions.gen_random_uuid();
  v_store_quote_key text;
  v_target_account_id uuid;
  v_target_account_key text;
  v_context_hash text;
  v_funding_idempotency_key text;
  v_funding_result jsonb;
  v_funding_quote_key text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_expires_at timestamptz;
begin
  if p_game_session_id is null
     or p_player_id is null
     or v_item_key !~ '^[a-z0-9_-]{1,64}$'
     or p_quantity is null
     or p_quantity not between 1 and 100000
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or p_effective_at is null
  then
    raise exception 'STORE_FUNDED_QUOTE_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);
  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'seeded-store-funding-quote-v1',
    'gameSessionId', p_game_session_id,
    'playerId', p_player_id,
    'itemKey', v_item_key,
    'quantity', p_quantity,
    'allocations', v_allocations
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'seeded_store_funding_quote_v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  ), 0));

  -- Matching replay is authoritative before game, stock, price, balance, rate,
  -- or facility state is reinterpreted.
  select quote_row.*
  into v_existing
  from public.store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'STORE_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return private.read_seeded_store_funding_quote_result_v1(v_existing.id, true);
  end if;

  select game_row.status
  into v_game_status
  from public.game_sessions as game_row
  where game_row.id = p_game_session_id
  for share;
  if not found or v_game_status <> 'active' then
    raise exception 'STORE_FUNDED_QUOTE_GAME_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_QUOTE_PLAYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select assignment_row.*
  into v_assignment
  from public.player_country_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_player_id
    and assignment_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_QUOTE_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select country_row.*
  into v_country
  from public.country_profiles as country_row
  where country_row.id = v_assignment.country_profile_id
    and country_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_QUOTE_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Seeded/NPC Store item is the first commercial root.
  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.item_key = v_item_key
  for share;
  if not found
     or v_item.status <> 'active'
     or v_item.visibility <> 'visible'
     or v_item.game_item_id is null
     or v_item.inventory_account_id is null
  then
    raise exception 'STORE_FUNDED_QUOTE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_item.stock_quantity < p_quantity then
    raise exception 'STORE_FUNDED_QUOTE_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_item.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_QUOTE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_stock_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_item.inventory_account_id
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_FUNDED_QUOTE_STOCK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_stock_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_stock_account.id
    and holding_row.game_item_id = v_game_item.id
  for share;
  if not found
     or v_stock_holding.quantity_owned - v_stock_holding.quantity_reserved < p_quantity
  then
    raise exception 'STORE_FUNDED_QUOTE_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  select *
  into strict v_pricing
  from public.resolve_store_quote_pricing_v2(
    p_game_session_id,
    v_item.id,
    v_country.id,
    upper(v_item.currency_code),
    p_quantity,
    v_effective_at
  );

  if v_pricing.settlement_currency_code is distinct from upper(v_item.currency_code)
     or v_pricing.item_currency_code is distinct from upper(v_item.currency_code)
     or v_pricing.exchange_rate is distinct from 1
     or v_pricing.final_unit_price is distinct from v_pricing.item_local_final_unit_price
     or v_pricing.final_total_price is distinct from v_pricing.item_local_final_total_price
     or v_pricing.final_total_price <= 0
  then
    raise exception 'STORE_FUNDED_QUOTE_PRICING_INVALID' using errcode = 'P0001';
  end if;

  v_store_pricing_version := concat(
    'store-funded-v1:country:',
    lower(v_country.country_code),
    ':snapshot:',
    v_pricing.snapshot_sequence
  );

  v_target_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'store.seeded-revenue',
    'checking',
    upper(v_item.currency_code)
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_target_account_id
  );
  select account_row.public_key
  into strict v_target_account_key
  from public.bank_accounts as account_row
  where account_row.id = v_target_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.status = 'active';

  v_store_quote_key := 'quote_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'seeded-store-funding-quote-v1',
    p_game_session_id::text,
    p_player_id::text,
    v_idempotency_key
  )), 1, 32);

  v_context_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'seeded-store-funding-context-v1',
    'storeQuoteKey', v_store_quote_key,
    'storeItemKey', v_item.item_key,
    'canonicalItemKey', v_game_item.canonical_key,
    'quantity', p_quantity,
    'currencyCode', upper(v_item.currency_code),
    'totalPrice', v_pricing.final_total_price::text,
    'pricingVersion', v_store_pricing_version,
    'targetAccountKey', v_target_account_key
  ));
  v_funding_idempotency_key := 'seeded-store-funding:' || substr(v_request_hash, 1, 64);

  v_funding_result := public.create_purchase_funding_quote_v1(
    p_game_session_id,
    p_player_id,
    upper(v_item.currency_code),
    v_pricing.final_total_price,
    'store.seeded',
    v_store_quote_key,
    v_context_hash,
    v_allocations,
    v_funding_idempotency_key
  );
  v_funding_quote_key := v_funding_result -> 'quote' ->> 'quote_key';

  select quote_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_player_id
    and quote_row.public_key = v_funding_quote_key;
  if not found
     or v_funding_quote.funding_context_kind <> 'store.seeded'
     or v_funding_quote.funding_context_key <> v_store_quote_key
     or v_funding_quote.funding_context_hash <> v_context_hash
     or v_funding_quote.target_currency_code <> upper(v_item.currency_code)
     or v_funding_quote.target_amount <> v_pricing.final_total_price
  then
    raise exception 'STORE_FUNDED_QUOTE_BINDING_FAILED' using errcode = 'P0001';
  end if;

  v_expires_at := least(v_pricing.expires_at, v_funding_quote.expires_at);
  if v_expires_at <= clock_timestamp() then
    raise exception 'STORE_FUNDED_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  insert into public.store_purchase_quotes(
    id,
    public_quote_key,
    game_session_id,
    player_id,
    store_item_id,
    quantity,
    currency_code,
    item_currency_code,
    player_currency_code,
    exchange_rate,
    item_local_final_unit_price,
    item_local_final_total_price,
    base_unit_price,
    inflation_multiplier,
    location_multiplier,
    scarcity_multiplier,
    discount_amount,
    final_unit_price,
    final_total_price,
    pricing_version,
    status,
    expires_at,
    request_idempotency_key,
    request_hash,
    funding_quote_id,
    funding_context_hash,
    target_bank_account_id,
    funding_idempotency_key
  ) values (
    v_store_quote_id,
    v_store_quote_key,
    p_game_session_id,
    p_player_id,
    v_item.id,
    p_quantity,
    upper(v_item.currency_code),
    upper(v_item.currency_code),
    upper(v_item.currency_code),
    1,
    v_pricing.item_local_final_unit_price,
    v_pricing.item_local_final_total_price,
    v_pricing.base_unit_price,
    v_pricing.inflation_multiplier,
    v_pricing.location_multiplier,
    v_pricing.scarcity_multiplier,
    0,
    v_pricing.final_unit_price,
    v_pricing.final_total_price,
    v_store_pricing_version,
    'CREATED',
    v_expires_at,
    v_idempotency_key,
    v_request_hash,
    v_funding_quote.id,
    v_context_hash,
    v_target_account_id,
    v_funding_idempotency_key
  );

  return private.read_seeded_store_funding_quote_result_v1(
    v_store_quote_id,
    false
  );
end
$function$;

revoke all on function public.create_seeded_store_funding_quote_v1(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_seeded_store_funding_quote_v1(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) to service_role;

create or replace function public.create_business_store_offer_funding_quote_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_offer_key text,
  p_quantity integer,
  p_expected_offer_version bigint,
  p_allocations jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, economy_private, extensions, pg_temp
as $function$
declare
  v_offer_key text := lower(btrim(coalesce(p_offer_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_allocations jsonb;
  v_request_hash text;
  v_existing public.store_offer_purchase_quotes%rowtype;
  v_buyer public.players%rowtype;
  v_assignment public.player_country_assignments%rowtype;
  v_country public.country_profiles%rowtype;
  v_offer public.store_seller_offers%rowtype;
  v_party public.economic_parties%rowtype;
  v_business public.business_entities%rowtype;
  v_store_item public.store_items%rowtype;
  v_game_item public.game_items%rowtype;
  v_listing_account public.inventory_accounts%rowtype;
  v_listing_holding public.inventory_holdings%rowtype;
  v_available bigint;
  v_unit_price numeric(18, 4);
  v_total_price numeric(18, 4);
  v_store_quote_id uuid := extensions.gen_random_uuid();
  v_store_quote_key text;
  v_target_account_id uuid;
  v_target_account_key text;
  v_context_hash text;
  v_funding_idempotency_key text;
  v_funding_result jsonb;
  v_funding_quote_key text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_expires_at timestamptz;
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_offer_key !~ '^sof_[0-9a-f]{32}$'
     or p_quantity is null
     or p_quantity not between 1 and 1000000
     or p_expected_offer_version is null
     or p_expected_offer_version < 1
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_REQUEST_INVALID' using errcode = '22023';
  end if;

  v_allocations := private.store_funding_normalize_allocations_v1(p_allocations);
  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-offer-funding-quote-v1',
    'gameSessionId', p_game_session_id,
    'buyerPlayerId', p_buyer_player_id,
    'offerKey', v_offer_key,
    'quantity', p_quantity,
    'expectedOfferVersion', p_expected_offer_version,
    'allocations', v_allocations
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'business_store_offer_funding_quote_v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_idempotency_key
  ), 0));

  select quote_row.*
  into v_existing
  from public.store_offer_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.buyer_player_id = p_buyer_player_id
    and quote_row.request_idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_hash is distinct from v_request_hash then
      raise exception 'STORE_OFFER_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_existing.funding_quote_id is null then
      raise exception 'STORE_OFFER_FUNDED_QUOTE_LEGACY_CONFLICT' using errcode = 'P0001';
    end if;
    return economy_private.read_store_offer_funding_quote_result_v1(
      v_existing.id,
      true
    );
  end if;

  select player_row.*
  into v_buyer
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_buyer_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_BUYER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select assignment_row.*
  into v_assignment
  from public.player_country_assignments as assignment_row
  where assignment_row.game_session_id = p_game_session_id
    and assignment_row.player_id = p_buyer_player_id
    and assignment_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_BUYER_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select country_row.*
  into v_country
  from public.country_profiles as country_row
  where country_row.id = v_assignment.country_profile_id
    and country_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_BUYER_COUNTRY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Business seller offer remains the first commercial root.
  select offer_row.*
  into v_offer
  from public.store_seller_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = v_offer_key
    and offer_row.seller_kind = 'business'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'active' then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_OFFER_STATUS_INVALID' using errcode = 'P0001';
  end if;
  if v_offer.version <> p_expected_offer_version then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_OFFER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_offer.inventory_account_id is null then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_CUSTODY_MISSING' using errcode = 'P0001';
  end if;

  select party_row.*
  into v_party
  from public.economic_parties as party_row
  where party_row.game_session_id = p_game_session_id
    and party_row.id = v_offer.seller_party_id
    and party_row.party_kind = 'business'
    and party_row.status = 'active'
  for share;
  if not found or v_party.business_id is null then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_SELLER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_party.business_id
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_BUSINESS_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_business.owner_player_id = p_buyer_player_id
     or exists (
       select 1
       from public.business_ownership_positions as position_row
       where position_row.game_session_id = p_game_session_id
         and position_row.business_id = v_business.id
         and position_row.player_id = p_buyer_player_id
         and position_row.status = 'active'
     )
  then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_SELF_PURCHASE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_business.currency_code is distinct from v_offer.currency_code then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_SELLER_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select store_row.*
  into v_store_item
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
    raise exception 'STORE_OFFER_FUNDED_QUOTE_CATALOG_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_game_item
  from public.game_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_offer.game_item_id
    and item_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select account_row.*
  into v_listing_account
  from public.inventory_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_offer.inventory_account_id
    and account_row.party_id = v_party.id
    and account_row.account_kind = 'store_stock'
    and account_row.location_key = 'store_offer:' || v_offer.public_key
    and account_row.status = 'active'
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_CUSTODY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_listing_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_listing_account.id
    and holding_row.game_item_id = v_offer.game_item_id
  for share;
  if not found then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_listing_holding.quantity_owned <> trunc(v_listing_holding.quantity_owned)
     or v_listing_holding.quantity_reserved <> trunc(v_listing_holding.quantity_reserved)
     or v_listing_holding.quantity_reserved <> 0
  then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_LISTING_INVALID' using errcode = 'P0001';
  end if;
  v_available := v_listing_holding.quantity_owned::bigint;
  if v_available < p_quantity then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  v_unit_price := round(v_offer.unit_price, 4);
  v_total_price := round(v_unit_price * p_quantity, 4);
  if v_total_price <= 0
     or v_total_price <> round(v_total_price, 2)
  then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_MONEY_INVALID' using errcode = 'P0001';
  end if;

  v_target_account_id := private.ensure_business_bank_account_identity_v1(
    p_game_session_id,
    v_business.id,
    v_offer.currency_code
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_target_account_id
  );
  select account_row.public_key
  into strict v_target_account_key
  from public.bank_accounts as account_row
  where account_row.id = v_target_account_id
    and account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = v_offer.currency_code
    and account_row.status = 'active';

  v_store_quote_key := 'quote_' || substr(private.bank_digest_text_v1(concat_ws(
    '|',
    'business-store-offer-funding-quote-v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_idempotency_key
  )), 1, 32);
  v_context_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'business-store-offer-funding-context-v1',
    'storeQuoteKey', v_store_quote_key,
    'offerKey', v_offer.public_key,
    'offerVersion', v_offer.version,
    'businessKey', v_business.public_key,
    'canonicalItemKey', v_game_item.canonical_key,
    'quantity', p_quantity,
    'currencyCode', v_offer.currency_code,
    'totalPrice', v_total_price::text,
    'pricingVersion', 'business-offer-fixed-price-v2',
    'targetAccountKey', v_target_account_key
  ));
  v_funding_idempotency_key := 'business-store-funding:' || substr(v_request_hash, 1, 64);

  v_funding_result := public.create_purchase_funding_quote_v1(
    p_game_session_id,
    p_buyer_player_id,
    v_offer.currency_code,
    v_total_price,
    'store.business-offer',
    v_store_quote_key,
    v_context_hash,
    v_allocations,
    v_funding_idempotency_key
  );
  v_funding_quote_key := v_funding_result -> 'quote' ->> 'quote_key';

  select quote_row.*
  into v_funding_quote
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.player_id = p_buyer_player_id
    and quote_row.public_key = v_funding_quote_key;
  if not found
     or v_funding_quote.funding_context_kind <> 'store.business-offer'
     or v_funding_quote.funding_context_key <> v_store_quote_key
     or v_funding_quote.funding_context_hash <> v_context_hash
     or v_funding_quote.target_currency_code <> v_offer.currency_code
     or v_funding_quote.target_amount <> v_total_price
  then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_BINDING_FAILED' using errcode = 'P0001';
  end if;

  v_expires_at := least(
    statement_timestamp() + interval '2 minutes',
    v_funding_quote.expires_at
  );
  if v_expires_at <= clock_timestamp() then
    raise exception 'STORE_OFFER_FUNDED_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  insert into public.store_offer_purchase_quotes(
    id,
    public_key,
    game_session_id,
    buyer_player_id,
    buyer_country_profile_id,
    buyer_country_code,
    offer_id,
    business_id,
    seller_party_id,
    store_item_id,
    game_item_id,
    inventory_account_id,
    quantity,
    offer_version,
    available_quantity_at_quote,
    seller_unit_price,
    final_unit_price,
    seller_total_price,
    final_total_price,
    seller_currency_code,
    buyer_currency_code,
    exchange_rate,
    pricing_version,
    request_idempotency_key,
    request_hash,
    expires_at,
    metadata,
    funding_quote_id,
    funding_context_hash,
    target_bank_account_id,
    funding_idempotency_key
  ) values (
    v_store_quote_id,
    v_store_quote_key,
    p_game_session_id,
    p_buyer_player_id,
    v_country.id,
    v_country.country_code,
    v_offer.id,
    v_business.id,
    v_party.id,
    v_store_item.id,
    v_game_item.id,
    v_listing_account.id,
    p_quantity,
    v_offer.version,
    v_available,
    v_unit_price,
    v_unit_price,
    v_total_price,
    v_total_price,
    v_offer.currency_code,
    v_offer.currency_code,
    1,
    'business-offer-fixed-price-v2',
    v_idempotency_key,
    v_request_hash,
    v_expires_at,
    jsonb_build_object(
      'authority', 'business_store_offer_funding_quote_v1',
      'pricingPolicy', 'seller_offer_currency_bill',
      'buyerHomeCurrency', v_country.currency_code,
      'nonReserving', true
    ),
    v_funding_quote.id,
    v_context_hash,
    v_target_account_id,
    v_funding_idempotency_key
  );

  return economy_private.read_store_offer_funding_quote_result_v1(
    v_store_quote_id,
    false
  );
end
$function$;

revoke all on function public.create_business_store_offer_funding_quote_v1(
  uuid, uuid, text, integer, bigint, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_business_store_offer_funding_quote_v1(
  uuid, uuid, text, integer, bigint, jsonb, text
) to service_role;

comment on function public.create_seeded_store_funding_quote_v1(
  uuid, uuid, text, integer, jsonb, text, timestamptz
) is
  'Creates or replays one seeded/NPC Store quote in the Store item currency and binds one exact C0 funding quote using one to three Player Checking accounts.';
comment on function public.create_business_store_offer_funding_quote_v1(
  uuid, uuid, text, integer, bigint, jsonb, text
) is
  'Creates or replays one Business seller-offer Store quote in the offer currency and binds one exact C0 funding quote using one to three Player Checking accounts.';

commit;
