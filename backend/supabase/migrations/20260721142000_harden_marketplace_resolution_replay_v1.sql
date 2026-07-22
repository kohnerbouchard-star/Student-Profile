begin;

-- Marketplace reservation convergence is layered after Crafting's generic
-- inventory_reservations authority. Existing Marketplace lifecycle functions
-- remain private projection-mutating primitives wrapped by authoritative
-- reservation checks and transitions.

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_reason_type_check;

alter table public.inventory_reservations
  add constraint inventory_reservations_reason_type_check
  check (reason_type in ('crafting_input', 'equipment_action', 'marketplace_listing'));

create index if not exists inventory_reservations_marketplace_source_idx
  on public.inventory_reservations (
    game_session_id,
    player_id,
    reason_type,
    source_id,
    status
  )
  where reason_type = 'marketplace_listing';

create or replace function public.marketplace_inventory_projection_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_inventory_holding_id uuid
)
returns table (
  quantity_owned integer,
  authoritative_reserved bigint,
  projected_reserved integer,
  drift bigint,
  available_quantity bigint
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select
    h.quantity_owned,
    coalesce(sum(r.quantity) filter (where r.status = 'active'), 0)::bigint,
    h.quantity_reserved,
    h.quantity_reserved::bigint
      - coalesce(sum(r.quantity) filter (where r.status = 'active'), 0)::bigint,
    h.quantity_owned::bigint
      - coalesce(sum(r.quantity) filter (where r.status = 'active'), 0)::bigint
  from public.inventory_holdings h
  left join public.inventory_reservations r
    on r.game_session_id = h.game_session_id
   and r.player_id = h.player_id
   and r.inventory_holding_id = h.id
  where h.game_session_id = p_game_session_id
    and h.player_id = p_player_id
    and h.id = p_inventory_holding_id
  group by h.id, h.quantity_owned, h.quantity_reserved;
$$;

create or replace function public.marketplace_reconcile_inventory_projection_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_inventory_holding_id uuid,
  p_repair boolean default false
)
returns table (
  quantity_owned integer,
  authoritative_reserved bigint,
  projected_reserved integer,
  drift bigint,
  available_quantity bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_projection record;
begin
  perform 1
  from public.inventory_holdings
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and id = p_inventory_holding_id
  for update;

  if not found then
    raise exception 'MARKETPLACE_RESERVATION_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  select *
  into v_projection
  from public.marketplace_inventory_projection_v1(
    p_game_session_id,
    p_player_id,
    p_inventory_holding_id
  );

  if v_projection.authoritative_reserved > v_projection.quantity_owned then
    raise exception 'MARKETPLACE_RESERVATION_OVER_RESERVED' using errcode = 'P0001';
  end if;

  if v_projection.drift <> 0 then
    if not p_repair then
      raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
    end if;

    update public.inventory_holdings
    set quantity_reserved = v_projection.authoritative_reserved::integer,
        updated_at = statement_timestamp()
    where game_session_id = p_game_session_id
      and player_id = p_player_id
      and id = p_inventory_holding_id;

    select *
    into v_projection
    from public.marketplace_inventory_projection_v1(
      p_game_session_id,
      p_player_id,
      p_inventory_holding_id
    );
  end if;

  return query select
    v_projection.quantity_owned::integer,
    v_projection.authoritative_reserved::bigint,
    v_projection.projected_reserved::integer,
    v_projection.drift::bigint,
    v_projection.available_quantity::bigint;
end;
$$;

create or replace function public.marketplace_attach_listing_reservation_v1(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_id uuid,
  p_inventory_holding_id uuid,
  p_store_item_id uuid,
  p_item_key text,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.inventory_reservations%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'MARKETPLACE_RESERVATION_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from public.inventory_reservations
  where game_session_id = p_game_session_id
    and player_id = p_seller_player_id
    and inventory_holding_id = p_inventory_holding_id
    and reason_type = 'marketplace_listing'
    and source_id = p_listing_id
  for update;

  if found then
    if v_existing.store_item_id <> p_store_item_id
      or v_existing.item_key <> p_item_key
    then
      raise exception 'MARKETPLACE_RESERVATION_SOURCE_INVALID' using errcode = 'P0001';
    end if;
  else
    insert into public.inventory_reservations (
      game_session_id,
      player_id,
      inventory_holding_id,
      store_item_id,
      item_key,
      reason_type,
      source_id,
      quantity,
      status
    ) values (
      p_game_session_id,
      p_seller_player_id,
      p_inventory_holding_id,
      p_store_item_id,
      p_item_key,
      'marketplace_listing',
      p_listing_id,
      p_quantity,
      'active'
    );
  end if;

  perform *
  from public.marketplace_reconcile_inventory_projection_v1(
    p_game_session_id,
    p_seller_player_id,
    p_inventory_holding_id,
    false
  );
end;
$$;

create or replace function public.marketplace_assert_listing_reservation_v1(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_id uuid,
  p_inventory_holding_id uuid,
  p_minimum_quantity integer default 1
)
returns public.inventory_reservations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.inventory_reservations%rowtype;
begin
  select *
  into v_reservation
  from public.inventory_reservations
  where game_session_id = p_game_session_id
    and player_id = p_seller_player_id
    and inventory_holding_id = p_inventory_holding_id
    and reason_type = 'marketplace_listing'
    and source_id = p_listing_id
  for update;

  if not found then
    raise exception 'MARKETPLACE_RESERVATION_SOURCE_INVALID' using errcode = 'P0001';
  end if;
  if v_reservation.status <> 'active'
    or v_reservation.quantity < greatest(coalesce(p_minimum_quantity, 1), 1)
  then
    raise exception 'MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_reservation;
end;
$$;

create or replace function public.marketplace_transition_listing_reservation_v1(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_id uuid,
  p_inventory_holding_id uuid,
  p_quantity integer,
  p_action text,
  p_require_full boolean default false
)
returns table (
  reservation_status text,
  remaining_quantity integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reservation public.inventory_reservations%rowtype;
  v_remaining integer;
begin
  if p_quantity is null or p_quantity <= 0
    or v_action not in ('consume', 'release')
  then
    raise exception 'MARKETPLACE_RESERVATION_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_reservation
  from public.inventory_reservations
  where game_session_id = p_game_session_id
    and player_id = p_seller_player_id
    and inventory_holding_id = p_inventory_holding_id
    and reason_type = 'marketplace_listing'
    and source_id = p_listing_id
  for update;

  if not found then
    raise exception 'MARKETPLACE_RESERVATION_SOURCE_INVALID' using errcode = 'P0001';
  end if;
  if v_reservation.status <> 'active' then
    raise exception 'MARKETPLACE_RESERVATION_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  if p_quantity > v_reservation.quantity then
    raise exception 'MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_require_full and p_quantity <> v_reservation.quantity then
    raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
  end if;

  v_remaining := v_reservation.quantity - p_quantity;

  if v_remaining = 0 then
    update public.inventory_reservations
    set status = case when v_action = 'consume' then 'consumed' else 'released' end,
        consumed_at = case when v_action = 'consume' then statement_timestamp() else consumed_at end,
        released_at = case when v_action = 'release' then statement_timestamp() else released_at end
    where id = v_reservation.id;
  else
    update public.inventory_reservations
    set quantity = v_remaining
    where id = v_reservation.id;
  end if;

  perform *
  from public.marketplace_reconcile_inventory_projection_v1(
    p_game_session_id,
    p_seller_player_id,
    p_inventory_holding_id,
    false
  );

  return query select
    case
      when v_remaining > 0 then 'active'
      when v_action = 'consume' then 'consumed'
      else 'released'
    end,
    v_remaining;
end;
$$;

create or replace function public.marketplace_assert_refund_inventory_available_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_inventory_holding_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_projection record;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select *
  into v_projection
  from public.marketplace_reconcile_inventory_projection_v1(
    p_game_session_id,
    p_buyer_player_id,
    p_inventory_holding_id,
    false
  );

  if v_projection.available_quantity < p_quantity then
    raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

alter function public.create_marketplace_listing_public_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) rename to create_marketplace_listing_projection_legacy_v2;

alter function public.activate_marketplace_listing_public_v1(
  uuid, uuid, text, bigint, text
) rename to activate_marketplace_listing_projection_legacy_v1;

alter function public.reserve_marketplace_purchase_public_v1(
  uuid, uuid, text, integer, bigint, text
) rename to reserve_marketplace_purchase_projection_legacy_v1;

alter function public.settle_marketplace_purchase_public_v1(
  uuid, uuid, text
) rename to settle_marketplace_purchase_projection_legacy_v1;

alter function public.cancel_marketplace_listing_public_v2(
  uuid, uuid, text, bigint, text
) rename to cancel_marketplace_listing_projection_legacy_v2;

alter function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) rename to review_marketplace_admin_projection_legacy_v2;

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
  from public.store_items
  where game_session_id = p_game_session_id
    and item_key = lower(btrim(coalesce(p_item_key, '')))
  for share;

  if not found then
    raise exception 'MARKETPLACE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into v_holding
  from public.inventory_holdings
  where game_session_id = p_game_session_id
    and player_id = p_seller_player_id
    and store_item_id = v_item.id
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
  from public.marketplace_listings
  where game_session_id = p_game_session_id
    and public_id = v_result.listing_key
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
    from public.inventory_reservations
    where game_session_id = p_game_session_id
      and player_id = p_seller_player_id
      and inventory_holding_id = v_listing.inventory_holding_id
      and reason_type = 'marketplace_listing'
      and source_id = v_listing.id;

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

create or replace function public.activate_marketplace_listing_public_v1(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_key text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  listing_key text,
  status text,
  version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.marketplace_listings%rowtype;
begin
  select *
  into v_listing
  from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and public_id = lower(btrim(coalesce(p_listing_key, '')))
  for update;

  if found then
    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
    perform public.marketplace_assert_listing_reservation_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      greatest(v_listing.quantity_available, 1)
    );
  end if;

  return query
  select *
  from public.activate_marketplace_listing_projection_legacy_v1(
    p_game_session_id,
    p_seller_player_id,
    p_listing_key,
    p_expected_version,
    p_idempotency_key
  );
end;
$$;

create or replace function public.reserve_marketplace_purchase_public_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_listing_key text,
  p_quantity integer,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  reservation_key text,
  listing_key text,
  quantity integer,
  buyer_total numeric,
  currency_code text,
  status text,
  version bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.marketplace_listings%rowtype;
begin
  select *
  into v_listing
  from public.marketplace_listings
  where game_session_id = p_game_session_id
    and public_id = lower(btrim(coalesce(p_listing_key, '')))
  for update;

  if found then
    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      v_listing.seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
    perform public.marketplace_assert_listing_reservation_v1(
      p_game_session_id,
      v_listing.seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      p_quantity
    );
  end if;

  return query
  select *
  from public.reserve_marketplace_purchase_projection_legacy_v1(
    p_game_session_id,
    p_buyer_player_id,
    p_listing_key,
    p_quantity,
    p_expected_version,
    p_idempotency_key
  );
end;
$$;

create or replace function public.expire_marketplace_purchase_reservations_v1(
  p_game_session_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_count integer := 0;
begin
  for v_reservation in
    select *
    from public.marketplace_purchase_reservations
    where game_session_id = p_game_session_id
      and status in ('reserved', 'settling')
      and expires_at <= p_now
    for update skip locked
  loop
    select *
    into v_listing
    from public.marketplace_listings
    where id = v_reservation.listing_id
    for update;

    if found and v_listing.status = 'active' and v_listing.expires_at > p_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active',
          version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id;
    else
      perform *
      from public.marketplace_reconcile_inventory_projection_v1(
        v_reservation.game_session_id,
        v_reservation.seller_player_id,
        v_listing.inventory_holding_id,
        false
      );

      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where game_session_id = v_reservation.game_session_id
        and player_id = v_reservation.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_reservation.quantity;

      if not found then
        raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
      end if;

      perform *
      from public.marketplace_transition_listing_reservation_v1(
        v_reservation.game_session_id,
        v_reservation.seller_player_id,
        v_listing.id,
        v_listing.inventory_holding_id,
        v_reservation.quantity,
        'release',
        false
      );
    end if;

    update public.marketplace_purchase_reservations
    set status = 'expired',
        version = version + 1,
        released_at = p_now,
        release_reason = 'reservation_expired',
        updated_at = statement_timestamp()
    where id = v_reservation.id;

    insert into public.marketplace_audit_events (
      game_session_id,
      listing_id,
      reservation_id,
      actor_type,
      action,
      metadata
    ) values (
      v_reservation.game_session_id,
      v_reservation.listing_id,
      v_reservation.id,
      'system',
      'purchase_reservation_expired',
      jsonb_build_object('quantity', v_reservation.quantity)
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.expire_marketplace_listings_v1(
  p_game_session_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_count integer := 0;
begin
  perform public.expire_marketplace_purchase_reservations_v1(
    p_game_session_id,
    p_now
  );

  for v_listing in
    select *
    from public.marketplace_listings
    where game_session_id = p_game_session_id
      and status in ('draft', 'active', 'moderation_hold')
      and expires_at <= p_now
    for update skip locked
  loop
    if v_listing.quantity_available > 0 then
      perform *
      from public.marketplace_reconcile_inventory_projection_v1(
        v_listing.game_session_id,
        v_listing.seller_player_id,
        v_listing.inventory_holding_id,
        false
      );

      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_listing.quantity_available,
          updated_at = statement_timestamp()
      where game_session_id = v_listing.game_session_id
        and player_id = v_listing.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_listing.quantity_available;

      if not found then
        raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
      end if;

      perform *
      from public.marketplace_transition_listing_reservation_v1(
        v_listing.game_session_id,
        v_listing.seller_player_id,
        v_listing.id,
        v_listing.inventory_holding_id,
        v_listing.quantity_available,
        'release',
        true
      );
    end if;

    update public.marketplace_listings
    set status = 'expired',
        quantity_available = 0,
        version = version + 1,
        updated_at = statement_timestamp()
    where id = v_listing.id;

    insert into public.marketplace_audit_events (
      game_session_id,
      listing_id,
      actor_type,
      action,
      metadata
    ) values (
      v_listing.game_session_id,
      v_listing.id,
      'system',
      'listing_expired',
      jsonb_build_object('releasedQuantity', v_listing.quantity_available)
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.settle_marketplace_purchase_public_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_reservation_key text
)
returns table (
  outcome text,
  order_key text,
  reservation_key text,
  listing_key text,
  item_key text,
  quantity integer,
  buyer_total numeric,
  seller_proceeds numeric,
  fee_amount numeric,
  tax_amount numeric,
  currency_code text,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_result record;
begin
  select *
  into v_reservation
  from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id
    and buyer_player_id = p_buyer_player_id
    and public_id = lower(btrim(coalesce(p_reservation_key, '')))
  for update;

  if found then
    select *
    into v_listing
    from public.marketplace_listings
    where id = v_reservation.listing_id
    for update;

    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      v_reservation.seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
    perform public.marketplace_assert_listing_reservation_v1(
      p_game_session_id,
      v_reservation.seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      v_reservation.quantity
    );
  end if;

  select *
  into v_result
  from public.settle_marketplace_purchase_projection_legacy_v1(
    p_game_session_id,
    p_buyer_player_id,
    p_reservation_key
  );

  if v_reservation.id is not null then
    select *
    into v_listing
    from public.marketplace_listings
    where id = v_reservation.listing_id
    for update;

    if v_result.outcome = 'applied' then
      perform *
      from public.marketplace_transition_listing_reservation_v1(
        p_game_session_id,
        v_reservation.seller_player_id,
        v_listing.id,
        v_listing.inventory_holding_id,
        v_reservation.quantity,
        'consume',
        false
      );
    elsif v_result.outcome = 'insufficient_funds'
      and not (v_listing.status = 'active' and v_listing.expires_at > now())
    then
      perform *
      from public.marketplace_transition_listing_reservation_v1(
        p_game_session_id,
        v_reservation.seller_player_id,
        v_listing.id,
        v_listing.inventory_holding_id,
        v_reservation.quantity,
        'release',
        false
      );
    elsif v_result.outcome = 'reservation_lost' then
      raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
    else
      perform *
      from public.marketplace_reconcile_inventory_projection_v1(
        p_game_session_id,
        v_reservation.seller_player_id,
        v_listing.inventory_holding_id,
        false
      );
    end if;
  end if;

  return query select
    v_result.outcome::text,
    v_result.order_key::text,
    v_result.reservation_key::text,
    v_result.listing_key::text,
    v_result.item_key::text,
    v_result.quantity::integer,
    v_result.buyer_total::numeric,
    v_result.seller_proceeds::numeric,
    v_result.fee_amount::numeric,
    v_result.tax_amount::numeric,
    v_result.currency_code::text,
    v_result.status::text,
    v_result.completed_at::timestamptz;
end;
$$;

create or replace function public.cancel_marketplace_listing_public_v2(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_key text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  listing_key text,
  status text,
  version bigint,
  released_quantity integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_result record;
begin
  select *
  into v_listing
  from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and public_id = lower(btrim(coalesce(p_listing_key, '')))
  for update;

  if found then
    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
  end if;

  select *
  into v_result
  from public.cancel_marketplace_listing_projection_legacy_v2(
    p_game_session_id,
    p_seller_player_id,
    p_listing_key,
    p_expected_version,
    p_idempotency_key
  );

  if v_result.outcome = 'applied' and v_result.released_quantity > 0 then
    perform *
    from public.marketplace_transition_listing_reservation_v1(
      p_game_session_id,
      p_seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      v_result.released_quantity,
      'release',
      true
    );
  elsif v_listing.id is not null then
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
    v_result.status::text,
    v_result.version::bigint,
    v_result.released_quantity::integer,
    v_result.updated_at::timestamptz;
end;
$$;

create or replace function public.review_marketplace_admin_v2(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_target_key text,
  p_action text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  target_key text,
  target_type text,
  status text,
  version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target text := lower(btrim(coalesce(p_target_key, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_listing public.marketplace_listings%rowtype;
  v_dispute public.marketplace_disputes%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_result record;
  v_release integer := 0;
begin
  if v_target ~ '^lst_[0-9a-f]{32}$' then
    select *
    into v_listing
    from public.marketplace_listings
    where game_session_id = p_game_session_id
      and public_id = v_target
    for update;

    if found then
      v_release := v_listing.quantity_available;
      perform *
      from public.marketplace_reconcile_inventory_projection_v1(
        p_game_session_id,
        v_listing.seller_player_id,
        v_listing.inventory_holding_id,
        false
      );
    end if;
  elsif v_target ~ '^dsp_[0-9a-f]{32}$' and v_action = 'refund_buyer' then
    select *
    into v_dispute
    from public.marketplace_disputes
    where game_session_id = p_game_session_id
      and public_id = v_target
    for update;

    if found then
      select *
      into v_order
      from public.marketplace_orders
      where id = v_dispute.order_id
      for update;

      select *
      into v_buyer_holding
      from public.inventory_holdings
      where game_session_id = p_game_session_id
        and player_id = v_order.buyer_player_id
        and store_item_id = v_order.store_item_id
      for update;

      if not found then
        raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
      end if;

      perform public.marketplace_assert_refund_inventory_available_v1(
        p_game_session_id,
        v_order.buyer_player_id,
        v_buyer_holding.id,
        v_order.quantity
      );
    end if;
  end if;

  select *
  into v_result
  from public.review_marketplace_admin_projection_legacy_v2(
    p_game_session_id,
    p_staff_user_id,
    p_target_key,
    p_action,
    p_reason,
    p_expected_version,
    p_idempotency_key
  );

  if v_result.outcome = 'applied'
    and v_result.target_type = 'listing'
    and v_result.status = 'rejected'
    and v_release > 0
  then
    perform *
    from public.marketplace_transition_listing_reservation_v1(
      p_game_session_id,
      v_listing.seller_player_id,
      v_listing.id,
      v_listing.inventory_holding_id,
      v_release,
      'release',
      true
    );
  elsif v_buyer_holding.id is not null then
    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      v_order.buyer_player_id,
      v_buyer_holding.id,
      false
    );
  elsif v_listing.id is not null then
    perform *
    from public.marketplace_reconcile_inventory_projection_v1(
      p_game_session_id,
      v_listing.seller_player_id,
      v_listing.inventory_holding_id,
      false
    );
  end if;

  return query select
    v_result.outcome::text,
    v_result.target_key::text,
    v_result.target_type::text,
    v_result.status::text,
    v_result.version::bigint,
    v_result.updated_at::timestamptz;
end;
$$;

create or replace function public.review_marketplace_admin_strict_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_target_key text,
  p_action text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text,
  target_key text,
  target_type text,
  status text,
  version bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target text := lower(btrim(coalesce(p_target_key, '')));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_dispute public.marketplace_disputes%rowtype;
begin
  if v_target ~ '^dsp_[0-9a-f]{32}$' then
    select *
    into v_dispute
    from public.marketplace_disputes
    where game_session_id = p_game_session_id
      and public_id = v_target
    for update;

    if not found then
      raise exception 'MARKETPLACE_DISPUTE_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_dispute.version <> p_expected_version then
      raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
    end if;
    if v_dispute.status <> 'open' then
      if (
        (v_dispute.status = 'resolved_buyer' and v_action = 'refund_buyer')
        or (v_dispute.status = 'resolved_seller' and v_action = 'resolve_seller')
        or (v_dispute.status = 'rejected' and v_action = 'reject')
      ) then
        return query select
          'replayed'::text,
          v_dispute.public_id,
          'dispute'::text,
          v_dispute.status,
          v_dispute.version,
          v_dispute.updated_at;
        return;
      end if;
      raise exception 'MARKETPLACE_TERMINAL_RESOLUTION_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  return query
  select *
  from public.review_marketplace_admin_v2(
    p_game_session_id,
    p_staff_user_id,
    p_target_key,
    p_action,
    p_reason,
    p_expected_version,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.marketplace_inventory_projection_v1(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.marketplace_reconcile_inventory_projection_v1(
  uuid, uuid, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.marketplace_attach_listing_reservation_v1(
  uuid, uuid, uuid, uuid, uuid, text, integer
) from public, anon, authenticated;
revoke all on function public.marketplace_assert_listing_reservation_v1(
  uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.marketplace_transition_listing_reservation_v1(
  uuid, uuid, uuid, uuid, integer, text, boolean
) from public, anon, authenticated;
revoke all on function public.marketplace_assert_refund_inventory_available_v1(
  uuid, uuid, uuid, integer
) from public, anon, authenticated;

revoke all on function public.create_marketplace_listing_projection_legacy_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.activate_marketplace_listing_projection_legacy_v1(
  uuid, uuid, text, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.reserve_marketplace_purchase_projection_legacy_v1(
  uuid, uuid, text, integer, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.settle_marketplace_purchase_projection_legacy_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.cancel_marketplace_listing_projection_legacy_v2(
  uuid, uuid, text, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.review_marketplace_admin_projection_legacy_v2(
  uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated, service_role;

revoke all on function public.create_marketplace_listing_public_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) from public, anon, authenticated;
revoke all on function public.activate_marketplace_listing_public_v1(
  uuid, uuid, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.reserve_marketplace_purchase_public_v1(
  uuid, uuid, text, integer, bigint, text
) from public, anon, authenticated;
revoke all on function public.settle_marketplace_purchase_public_v1(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.cancel_marketplace_listing_public_v2(
  uuid, uuid, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.review_marketplace_admin_strict_v1(
  uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.create_marketplace_listing_public_v2(
  uuid, uuid, text, integer, numeric, text, text, integer, text
) to service_role;
grant execute on function public.activate_marketplace_listing_public_v1(
  uuid, uuid, text, bigint, text
) to service_role;
grant execute on function public.reserve_marketplace_purchase_public_v1(
  uuid, uuid, text, integer, bigint, text
) to service_role;
grant execute on function public.settle_marketplace_purchase_public_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.cancel_marketplace_listing_public_v2(
  uuid, uuid, text, bigint, text
) to service_role;
grant execute on function public.review_marketplace_admin_v2(
  uuid, uuid, text, text, text, bigint, text
) to service_role;
grant execute on function public.review_marketplace_admin_strict_v1(
  uuid, uuid, text, text, text, bigint, text
) to service_role;

commit;
