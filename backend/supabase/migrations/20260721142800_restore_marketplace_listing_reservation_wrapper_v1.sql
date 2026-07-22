begin;

-- Restore the authoritative reservation wrapper after the connected staging
-- ambiguity fixes. The private legacy projection function remains isolated;
-- all public listing creation must reconcile and attach inventory_reservations.
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
  outcome text,
  listing_key text,
  item_key text,
  quantity_available integer,
  unit_price numeric,
  currency_code text,
  status text,
  version bigint,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_result record;
begin
  select *
  into v_item
  from public.store_items as si
  where si.game_session_id = p_game_session_id
    and si.item_key = lower(btrim(coalesce(p_item_key, '')))
  for share;

  if not found then
    raise exception 'MARKETPLACE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into v_holding
  from public.inventory_holdings as ih
  where ih.game_session_id = p_game_session_id
    and ih.player_id = p_seller_player_id
    and ih.store_item_id = v_item.id
  for update;

  if not found then
    raise exception 'MARKETPLACE_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  perform *
  from public.marketplace_reconcile_inventory_projection_v1(
    p_game_session_id,
    p_seller_player_id,
    v_holding.id,
    false
  );

  select *
  into v_result
  from public.create_marketplace_listing_projection_legacy_v2(
    p_game_session_id,
    p_seller_player_id,
    p_item_key,
    p_quantity,
    p_unit_price,
    p_currency_code,
    p_condition_label,
    p_duration_hours,
    p_idempotency_key
  );

  select *
  into v_listing
  from public.marketplace_listings as ml
  where ml.game_session_id = p_game_session_id
    and ml.public_id = v_result.listing_key
  for update;

  if not found then
    raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_result.outcome = 'applied' then
    perform public.marketplace_attach_listing_reservation_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      v_listing.store_item_id,
      v_listing.item_key,
      v_listing.quantity_initial
    );
  else
    perform 1
    from public.inventory_reservations as ir
    where ir.game_session_id = p_game_session_id
      and ir.player_id = p_seller_player_id
      and ir.inventory_holding_id = v_listing.inventory_holding_id
      and ir.reason_type = 'marketplace_listing'
      and ir.source_id = v_listing.id;

    if not found then
      raise exception 'MARKETPLACE_RESERVATION_SOURCE_INVALID' using errcode = 'P0001';
    end if;

    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
  end if;

  return query select
    v_result.outcome::text,
    v_result.listing_key::text,
    v_result.item_key::text,
    v_result.quantity_available::integer,
    v_result.unit_price::numeric,
    v_result.currency_code::text,
    v_result.status::text,
    v_result.version::bigint,
    v_result.expires_at::timestamptz,
    v_result.created_at::timestamptz;
end;
$$;

revoke all on function public.create_marketplace_listing_public_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.create_marketplace_listing_public_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) to service_role;

commit;
