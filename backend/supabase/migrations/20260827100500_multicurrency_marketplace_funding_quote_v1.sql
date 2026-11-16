-- Econovaria Business V2 Phase 10A.4C2: funded Marketplace reservation quote.
--
-- Marketplace owns listing, reservation, fee/tax, and listing-currency facts.
-- C0 owns one-to-three-account funding and retail checkout FX evidence.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.read_marketplace_funding_quote_result_v1(
  p_reservation_id uuid,
  p_replayed boolean
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'reservationKey', reservation_row.public_id,
    'listingKey', listing_row.public_id,
    'itemKey', listing_row.item_key,
    'quantity', reservation_row.quantity,
    'unitPrice', reservation_row.unit_price::text,
    'subtotal', reservation_row.subtotal::text,
    'feeRate', reservation_row.fee_rate::text,
    'taxRate', reservation_row.tax_rate::text,
    'feeAmount', reservation_row.fee_amount::text,
    'taxAmount', reservation_row.tax_amount::text,
    'buyerTotal', reservation_row.buyer_total::text,
    'sellerProceeds', reservation_row.seller_proceeds::text,
    'currencyCode', reservation_row.currency_code,
    'status', case
      when reservation_row.status = 'reserved'
        and reservation_row.expires_at <= statement_timestamp()
      then 'expired'
      else reservation_row.status
    end,
    'version', reservation_row.version,
    'listingVersion', listing_row.version,
    'expiresAt', reservation_row.expires_at,
    'replayed', p_replayed,
    'fundingQuote', private.purchase_funding_quote_public_json_v1(
      reservation_row.funding_quote_id
    )
  )
  from public.marketplace_purchase_reservations as reservation_row
  join public.marketplace_listings as listing_row
    on listing_row.id = reservation_row.listing_id
   and listing_row.game_session_id = reservation_row.game_session_id
  where reservation_row.id = p_reservation_id
    and reservation_row.funding_quote_id is not null;
$function$;

revoke all on function private.read_marketplace_funding_quote_result_v1(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.create_marketplace_funding_quote_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_listing_key text,
  p_quantity integer,
  p_expected_version bigint,
  p_allocations jsonb,
  p_idempotency_key text,
  p_effective_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_listing_key text := lower(btrim(coalesce(p_listing_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_effective_at timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_now timestamptz := clock_timestamp();
  v_allocations jsonb;
  v_request_hash text;
  v_existing public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_policy public.marketplace_policies%rowtype;
  v_buyer_country record;
  v_override jsonb;
  v_fee_rate numeric(8, 6);
  v_tax_rate numeric(8, 6);
  v_currency_decimals integer;
  v_subtotal numeric(38, 18);
  v_fee_amount numeric(38, 18);
  v_tax_amount numeric(38, 18);
  v_buyer_total numeric(38, 18);
  v_policy_hash text;
  v_reservation_id uuid := extensions.gen_random_uuid();
  v_reservation_key text;
  v_settlement_account_id uuid;
  v_settlement_account_key text;
  v_seller_account public.bank_accounts%rowtype;
  v_fee_account_id uuid;
  v_tax_account_id uuid;
  v_context_hash text;
  v_funding_idempotency_key text;
  v_funding_result jsonb;
  v_funding_quote_key text;
  v_funding_quote public.purchase_funding_quotes%rowtype;
  v_expires_at timestamptz;
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_prior_write_context text := coalesce(
    current_setting('app.marketplace_funding_write_v1', true), ''
  );
begin
  if p_game_session_id is null
     or p_buyer_player_id is null
     or v_listing_key !~ '^lst_[0-9a-f]{32}$'
     or p_quantity is null
     or p_quantity not between 1 and 1000000
     or p_expected_version is null
     or p_expected_version < 1
     or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
     or p_effective_at is null
  then
    raise exception 'MARKETPLACE_FUNDED_QUOTE_REQUEST_INVALID'
      using errcode = '22023';
  end if;

  v_allocations := private.marketplace_funding_normalize_allocations_v1(
    p_allocations
  );
  v_request_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-funding-quote-v1',
    'gameSessionId', p_game_session_id,
    'buyerPlayerId', p_buyer_player_id,
    'listingKey', v_listing_key,
    'quantity', p_quantity,
    'expectedVersion', p_expected_version,
    'allocations', v_allocations
  ));

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'marketplace_funding_quote_v1',
    p_game_session_id::text,
    p_buyer_player_id::text,
    v_idempotency_key
  ), 0));

  -- Matching replay is authoritative before listing, Inventory, Banking, rate,
  -- policy, or account state is reinterpreted.
  select reservation_row.*
  into v_existing
  from public.marketplace_purchase_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.buyer_player_id = p_buyer_player_id
    and reservation_row.buyer_idempotency_key = v_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_request_hash
       or v_existing.funding_quote_id is null
    then
      raise exception 'MARKETPLACE_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT'
        using errcode = 'P0001';
    end if;
    return private.read_marketplace_funding_quote_result_v1(
      v_existing.id,
      true
    );
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row
    on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_buyer_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for share of player_row, game_row;
  if not found then
    raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE'
      using errcode = 'P0001';
  end if;

  -- Listing is the first mutable commercial root.
  select listing_row.*
  into v_listing
  from public.marketplace_listings as listing_row
  where listing_row.game_session_id = p_game_session_id
    and listing_row.public_id = v_listing_key
  for update;
  if not found then
    raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_listing.seller_player_id = p_buyer_player_id then
    raise exception 'MARKETPLACE_SELF_PURCHASE' using errcode = 'P0001';
  end if;
  if v_listing.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_listing.status <> 'active' or v_listing.expires_at <= v_now then
    raise exception 'MARKETPLACE_LISTING_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_listing.quantity_available < p_quantity then
    raise exception 'MARKETPLACE_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  perform public.marketplace_assert_listing_reservation_v1(
    p_game_session_id,
    v_listing.seller_player_id,
    v_listing.id,
    v_listing.inventory_holding_id,
    p_quantity
  );

  select policy_row.*
  into v_policy
  from public.marketplace_policies as policy_row
  where policy_row.game_session_id = p_game_session_id
  for share;
  if not found or not v_policy.marketplace_enabled then
    raise exception 'MARKETPLACE_DISABLED' using errcode = 'P0001';
  end if;

  select *
  into v_buyer_country
  from public.marketplace_player_country_v1(
    p_game_session_id,
    p_buyer_player_id
  );
  if not found
     or v_buyer_country.country_code = any(v_policy.blocked_country_codes)
  then
    raise exception 'MARKETPLACE_COUNTRY_BLOCKED' using errcode = 'P0001';
  end if;
  if not v_policy.cross_country_trading_enabled
     and v_buyer_country.country_code <> v_listing.seller_country_code
  then
    raise exception 'MARKETPLACE_CROSS_COUNTRY_BLOCKED' using errcode = 'P0001';
  end if;

  select currency_row.decimal_places
  into v_currency_decimals
  from public.currencies as currency_row
  where currency_row.code = upper(v_listing.currency_code)
    and currency_row.status = 'active';
  if not found or v_currency_decimals not between 0 and 4 then
    raise exception 'MARKETPLACE_CURRENCY_PRECISION_UNSUPPORTED'
      using errcode = 'P0001';
  end if;
  if v_listing.unit_price <> round(v_listing.unit_price, v_currency_decimals) then
    raise exception 'MARKETPLACE_LISTING_MINOR_UNIT_INVALID'
      using errcode = 'P0001';
  end if;

  v_override := v_policy.country_fee_overrides -> v_buyer_country.country_code;
  v_fee_rate := case
    when jsonb_typeof(v_override -> 'feeRate') = 'number'
      then least(0.25, greatest(0, (v_override ->> 'feeRate')::numeric))
    else v_policy.fee_rate
  end;
  v_tax_rate := case
    when jsonb_typeof(v_override -> 'taxRate') = 'number'
      then least(0.25, greatest(0, (v_override ->> 'taxRate')::numeric))
    else v_policy.tax_rate
  end;

  v_subtotal := round(v_listing.unit_price * p_quantity, v_currency_decimals);
  v_fee_amount := round(v_subtotal * v_fee_rate, v_currency_decimals);
  v_tax_amount := round(v_subtotal * v_tax_rate, v_currency_decimals);
  v_buyer_total := round(
    v_subtotal + v_fee_amount + v_tax_amount,
    v_currency_decimals
  );
  if v_subtotal <= 0
     or v_buyer_total <= 0
     or v_buyer_total <> v_subtotal + v_fee_amount + v_tax_amount
  then
    raise exception 'MARKETPLACE_COMMERCIAL_AMOUNT_INVALID'
      using errcode = 'P0001';
  end if;

  select account_row.*
  into v_seller_account
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.id = account_row.party_id
   and party_row.game_session_id = account_row.game_session_id
  where account_row.game_session_id = p_game_session_id
    and account_row.account_kind = 'checking'
    and account_row.currency_code = upper(v_listing.currency_code)
    and account_row.status = 'active'
    and party_row.party_kind = 'player'
    and party_row.player_id = v_listing.seller_player_id
    and party_row.status = 'active'
  order by account_row.id
  limit 1;
  if not found then
    raise exception 'MARKETPLACE_SELLER_ACCOUNT_UNAVAILABLE'
      using errcode = 'P0001';
  end if;

  v_settlement_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'marketplace.settlement-clearing',
    'checking',
    upper(v_listing.currency_code)
  );
  v_fee_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'marketplace.fee-revenue',
    'checking',
    upper(v_listing.currency_code)
  );
  v_tax_account_id := private.ensure_system_bank_account_v1(
    p_game_session_id,
    'marketplace.tax-payable',
    'checking',
    upper(v_listing.currency_code)
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_settlement_account_id
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_seller_account.id
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_fee_account_id
  );
  perform private.ensure_bank_account_projection_v1(
    p_game_session_id,
    v_tax_account_id
  );

  select account_row.public_key
  into strict v_settlement_account_key
  from public.bank_accounts as account_row
  where account_row.game_session_id = p_game_session_id
    and account_row.id = v_settlement_account_id
    and account_row.status = 'active';

  v_policy_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-policy-evidence-v1',
    'marketplaceEnabled', v_policy.marketplace_enabled,
    'crossCountryTradingEnabled', v_policy.cross_country_trading_enabled,
    'feeRate', v_fee_rate::text,
    'taxRate', v_tax_rate::text,
    'purchaseReservationMinutes', v_policy.purchase_reservation_minutes,
    'buyerCountryCode', v_buyer_country.country_code
  ));

  v_reservation_key := 'mpr_' || replace(v_reservation_id::text, '-', '');
  v_context_hash := private.fx_digest_jsonb_v1(jsonb_build_object(
    'version', 'marketplace-funding-context-v1',
    'reservationKey', v_reservation_key,
    'listingKey', v_listing.public_id,
    'sellerPlayerId', v_listing.seller_player_id,
    'itemKey', v_listing.item_key,
    'listingVersion', v_listing.version,
    'quantity', p_quantity,
    'currencyCode', upper(v_listing.currency_code),
    'unitPrice', v_listing.unit_price::text,
    'subtotal', v_subtotal::text,
    'feeAmount', v_fee_amount::text,
    'taxAmount', v_tax_amount::text,
    'sellerProceeds', v_subtotal::text,
    'buyerTotal', v_buyer_total::text,
    'policyEvidenceHash', v_policy_hash,
    'targetAccountKey', v_settlement_account_key
  ));
  v_funding_idempotency_key := 'marketplace-funding:' || substr(
    v_request_hash,
    1,
    64
  );

  v_funding_result := public.create_purchase_funding_quote_v1(
    p_game_session_id,
    p_buyer_player_id,
    upper(v_listing.currency_code),
    v_buyer_total,
    'marketplace.purchase',
    v_reservation_key,
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
     or v_funding_quote.funding_context_kind <> 'marketplace.purchase'
     or v_funding_quote.funding_context_key <> v_reservation_key
     or v_funding_quote.funding_context_hash <> v_context_hash
     or v_funding_quote.target_currency_code <> upper(v_listing.currency_code)
     or v_funding_quote.target_amount <> v_buyer_total
  then
    raise exception 'MARKETPLACE_FUNDED_QUOTE_BINDING_FAILED'
      using errcode = 'P0001';
  end if;

  v_expires_at := least(
    v_now + make_interval(mins => v_policy.purchase_reservation_minutes),
    v_funding_quote.expires_at
  );
  if v_expires_at <= v_now then
    raise exception 'MARKETPLACE_FUNDED_QUOTE_EXPIRED'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.set_config('app.marketplace_funding_write_v1', 'on', true);

  update public.marketplace_listings
  set quantity_available = quantity_available - p_quantity,
      status = case
        when quantity_available - p_quantity = 0 then 'sold_out'
        else status
      end,
      version = version + 1,
      updated_at = statement_timestamp()
  where id = v_listing.id
  returning * into v_listing;

  insert into public.marketplace_purchase_reservations (
    id,
    public_id,
    game_session_id,
    listing_id,
    buyer_player_id,
    seller_player_id,
    quantity,
    unit_price,
    subtotal,
    fee_rate,
    tax_rate,
    fee_amount,
    tax_amount,
    buyer_total,
    seller_proceeds,
    currency_code,
    status,
    version,
    buyer_idempotency_key,
    request_fingerprint,
    reserved_at,
    expires_at,
    funding_quote_id,
    funding_context_hash,
    settlement_clearing_account_id,
    seller_bank_account_id,
    fee_bank_account_id,
    tax_bank_account_id,
    funding_idempotency_key,
    policy_evidence_hash
  ) values (
    v_reservation_id,
    v_reservation_key,
    p_game_session_id,
    v_listing.id,
    p_buyer_player_id,
    v_listing.seller_player_id,
    p_quantity,
    v_listing.unit_price,
    v_subtotal,
    v_fee_rate,
    v_tax_rate,
    v_fee_amount,
    v_tax_amount,
    v_buyer_total,
    v_subtotal,
    upper(v_listing.currency_code),
    'reserved',
    1,
    v_idempotency_key,
    v_request_hash,
    v_now,
    v_expires_at,
    v_funding_quote.id,
    v_context_hash,
    v_settlement_account_id,
    v_seller_account.id,
    v_fee_account_id,
    v_tax_account_id,
    v_funding_idempotency_key,
    v_policy_hash
  )
  returning * into v_reservation;

  insert into public.marketplace_audit_events(
    game_session_id,
    listing_id,
    reservation_id,
    actor_type,
    actor_id,
    action,
    metadata
  ) values (
    p_game_session_id,
    v_listing.id,
    v_reservation.id,
    'player',
    p_buyer_player_id,
    'funded_purchase_quoted',
    jsonb_build_object(
      'reservationKey', v_reservation.public_id,
      'listingVersion', v_listing.version,
      'quantity', p_quantity,
      'buyerTotal', v_buyer_total,
      'currencyCode', upper(v_listing.currency_code),
      'fundingQuoteKey', v_funding_quote.public_key
    )
  );

  perform pg_catalog.set_config(
    'app.marketplace_funding_write_v1',
    v_prior_write_context,
    true
  );

  return private.read_marketplace_funding_quote_result_v1(
    v_reservation.id,
    false
  );
end;
$function$;

revoke all on function public.create_marketplace_funding_quote_v1(
  uuid, uuid, text, integer, bigint, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_marketplace_funding_quote_v1(
  uuid, uuid, text, integer, bigint, jsonb, text, timestamptz
) to service_role;

commit;
