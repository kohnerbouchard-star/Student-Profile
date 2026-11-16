-- Econovaria Business V2 Phase 10A.4C2: converge Marketplace reservation
-- projection ordering for both retained and funded settlement callers.
--
-- Retained Marketplace callers already decrement inventory_holdings.quantity_reserved
-- before transitioning the authoritative inventory_reservations row. The funded C2
-- settlement owns the entire outer transaction and reaches the shared transition
-- helper before that compatibility projection has moved. Accept exactly those two
-- coherent pre-states, perform the missing projection decrement when required, and
-- fail closed for every other drift shape.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

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
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reservation public.inventory_reservations%rowtype;
  v_projection record;
  v_expected_projected_reserved bigint;
  v_remaining integer;
begin
  if p_quantity is null or p_quantity <= 0
    or v_action not in ('consume', 'release')
  then
    raise exception 'MARKETPLACE_RESERVATION_INVALID' using errcode = 'P0001';
  end if;

  select reservation_row.*
  into v_reservation
  from public.inventory_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.player_id = p_seller_player_id
    and reservation_row.inventory_holding_id = p_inventory_holding_id
    and reservation_row.reason_type = 'marketplace_listing'
    and reservation_row.source_id = p_listing_id
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

  select projection_row.*
  into v_projection
  from public.marketplace_inventory_projection_v1(
    p_game_session_id,
    p_seller_player_id,
    p_inventory_holding_id
  ) as projection_row;

  if v_projection.authoritative_reserved < p_quantity then
    raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
  end if;

  v_expected_projected_reserved :=
    v_projection.authoritative_reserved - p_quantity;

  -- MARKETPLACE_FUNDING_RESERVATION_PROJECTION_ORDER_V1
  -- Funded C2 settlement arrives with the compatibility projection still at the
  -- current authoritative total. Retained callers arrive with it already at the
  -- exact post-transition total. Anything else is real projection drift.
  if v_projection.projected_reserved = v_projection.authoritative_reserved then
    update public.inventory_holdings as holding_row
    set quantity_reserved = holding_row.quantity_reserved - p_quantity,
        updated_at = statement_timestamp()
    where holding_row.game_session_id = p_game_session_id
      and holding_row.player_id = p_seller_player_id
      and holding_row.id = p_inventory_holding_id
      and holding_row.quantity_reserved >= p_quantity;

    if not found then
      raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
    end if;
  elsif v_projection.projected_reserved = v_expected_projected_reserved then
    null;
  else
    raise exception 'MARKETPLACE_RESERVATION_PROJECTION_DRIFT' using errcode = 'P0001';
  end if;

  v_remaining := v_reservation.quantity - p_quantity;

  if v_remaining = 0 then
    update public.inventory_reservations as reservation_row
    set status = case when v_action = 'consume' then 'consumed' else 'released' end,
        consumed_at = case
          when v_action = 'consume' then statement_timestamp()
          else reservation_row.consumed_at
        end,
        released_at = case
          when v_action = 'release' then statement_timestamp()
          else reservation_row.released_at
        end
    where reservation_row.id = v_reservation.id;
  else
    update public.inventory_reservations as reservation_row
    set quantity = v_remaining
    where reservation_row.id = v_reservation.id;
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
$function$;

-- Fail the replay immediately if the compatibility-safe ordering contract is
-- absent from the rebuilt function definition.
do $assertion$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.marketplace_transition_listing_reservation_v1(uuid,uuid,uuid,uuid,integer,text,boolean)'::regprocedure
  )
  into v_definition;

  if position(
    'MARKETPLACE_FUNDING_RESERVATION_PROJECTION_ORDER_V1'
    in v_definition
  ) = 0
    or position(
      'v_projection.projected_reserved = v_projection.authoritative_reserved'
      in v_definition
    ) = 0
    or position(
      'v_projection.projected_reserved = v_expected_projected_reserved'
      in v_definition
    ) = 0
  then
    raise exception 'MARKETPLACE_FUNDING_RESERVATION_PROJECTION_ORDER_INVALID'
      using errcode = 'P0001';
  end if;
end;
$assertion$;

commit;
