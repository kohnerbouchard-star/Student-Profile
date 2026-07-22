begin;

-- Qualify the seller cash-account lookup so the returned currency_code column
-- cannot collide with account_balances.currency_code under PL/pgSQL.
create or replace function public.create_marketplace_listing_public_v2(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_unit_price numeric,
  p_currency_code text,
  p_condition_label text,
  p_duration_hours integer,
  p_idempotency_key text
)
returns table (
  outcome text, listing_key text, item_key text, quantity_available integer,
  unit_price numeric, currency_code text, status text, version bigint,
  expires_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_condition text := btrim(coalesce(p_condition_label, 'Used'));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_duration integer;
  v_fingerprint text;
  v_country record;
  v_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_policy public.marketplace_policies%rowtype;
begin
  if p_game_session_id is null or p_seller_player_id is null
    or v_item_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_price is null or p_unit_price <= 0 or p_unit_price > 1000000000000
    or v_currency !~ '^[A-Z0-9]{3,12}$'
    or v_condition not in ('New', 'Like New', 'Used', 'Damaged')
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_LISTING_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_seller_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  insert into public.marketplace_policies (game_session_id)
  values (p_game_session_id) on conflict do nothing;
  select * into v_policy from public.marketplace_policies
  where game_session_id = p_game_session_id for share;
  if not v_policy.marketplace_enabled then
    raise exception 'MARKETPLACE_DISABLED' using errcode = 'P0001';
  end if;

  select * into v_country from public.marketplace_player_country_v1(
    p_game_session_id, p_seller_player_id
  );
  if not found or v_country.country_code = any(v_policy.blocked_country_codes) then
    raise exception 'MARKETPLACE_COUNTRY_BLOCKED' using errcode = 'P0001';
  end if;
  if v_currency <> v_country.currency_code then
    raise exception 'MARKETPLACE_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  v_duration := coalesce(p_duration_hours, v_policy.listing_duration_hours);
  if v_duration not between 1 and 720 then
    raise exception 'MARKETPLACE_LISTING_DURATION_INVALID' using errcode = 'P0001';
  end if;
  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'itemKey', v_item_key, 'quantity', p_quantity, 'unitPrice', p_unit_price,
    'currencyCode', v_currency, 'condition', v_condition, 'durationHours', v_duration
  ));

  select * into v_listing from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and seller_idempotency_key = v_key
  for update;
  if found then
    if v_listing.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_listing.public_id, v_listing.item_key,
      v_listing.quantity_available, v_listing.unit_price, v_listing.currency_code,
      v_listing.status, v_listing.version, v_listing.expires_at, v_listing.created_at;
    return;
  end if;

  perform 1 from public.account_balances as ab
  where ab.game_session_id = p_game_session_id and ab.player_id = p_seller_player_id
    and ab.account_type = 'cash' and ab.currency_code = v_currency;
  if not found then raise exception 'MARKETPLACE_CURRENCY_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;

  select si.* into v_item from public.store_items as si
  where si.game_session_id = p_game_session_id and si.item_key = v_item_key
  for share;
  if not found then raise exception 'MARKETPLACE_ITEM_NOT_FOUND' using errcode = 'P0001'; end if;

  select ih.* into v_holding from public.inventory_holdings as ih
  where ih.game_session_id = p_game_session_id and ih.player_id = p_seller_player_id
    and ih.store_item_id = v_item.id
  for update;
  if not found or v_holding.quantity_owned - v_holding.quantity_reserved < p_quantity then
    raise exception 'MARKETPLACE_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.inventory_holdings
  set quantity_reserved = quantity_reserved + p_quantity,
      updated_at = statement_timestamp()
  where id = v_holding.id;

  insert into public.marketplace_listings (
    game_session_id, seller_player_id, seller_country_code,
    inventory_holding_id, store_item_id, item_key,
    quantity_initial, quantity_available, unit_price, currency_code,
    condition_label, seller_idempotency_key, request_fingerprint, expires_at
  ) values (
    p_game_session_id, p_seller_player_id, v_country.country_code,
    v_holding.id, v_item.id, v_item.item_key,
    p_quantity, p_quantity, p_unit_price, v_currency,
    v_condition, v_key, v_fingerprint, v_now + make_interval(hours => v_duration)
  ) returning * into v_listing;

  insert into public.marketplace_audit_events (
    game_session_id, listing_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, 'player', p_seller_player_id, 'listing_drafted',
    jsonb_build_object('quantity', p_quantity, 'unitPrice', p_unit_price,
      'currencyCode', v_currency, 'countryCode', v_country.country_code)
  );

  return query select 'applied', v_listing.public_id, v_listing.item_key,
    v_listing.quantity_available, v_listing.unit_price, v_listing.currency_code,
    v_listing.status, v_listing.version, v_listing.expires_at, v_listing.created_at;
end;
$$;

revoke all on function public.create_marketplace_listing_public_v2(uuid, uuid, text, integer, numeric, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_listing_public_v2(uuid, uuid, text, integer, numeric, text, text, integer, text) to service_role;

commit;
