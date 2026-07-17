begin;

alter table public.inventory_holdings
add constraint inventory_holdings_game_session_id_id_unique
unique (game_session_id, id);

create table public.inventory_redemption_requests (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  inventory_holding_id uuid not null,
  store_item_id uuid not null,
  quantity integer not null,
  status text not null default 'pending',
  request_note text null,
  resolution_note text null,
  idempotency_key text not null,
  request_hash text not null,
  requested_at timestamptz not null default now(),
  reviewed_by_staff_user_id uuid null references public.staff_users (id),
  reviewed_at timestamptz null,
  fulfilled_by_staff_user_id uuid null references public.staff_users (id),
  fulfilled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_redemption_requests_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint inventory_redemption_requests_holding_scope_fk
    foreign key (game_session_id, inventory_holding_id)
    references public.inventory_holdings (game_session_id, id),
  constraint inventory_redemption_requests_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items (game_session_id, id),
  constraint inventory_redemption_requests_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint inventory_redemption_requests_quantity_positive
    check (quantity > 0),
  constraint inventory_redemption_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  constraint inventory_redemption_requests_request_note_length
    check (request_note is null or length(request_note) <= 1000),
  constraint inventory_redemption_requests_resolution_note_length
    check (resolution_note is null or length(resolution_note) <= 1000),
  constraint inventory_redemption_requests_idempotency_key_not_blank
    check (length(btrim(idempotency_key)) > 0),
  constraint inventory_redemption_requests_request_hash_not_blank
    check (length(btrim(request_hash)) > 0),
  constraint inventory_redemption_requests_review_state_check check (
    (status = 'pending' and reviewed_at is null and reviewed_by_staff_user_id is null)
    or
    (status <> 'pending' and reviewed_at is not null and reviewed_by_staff_user_id is not null)
  ),
  constraint inventory_redemption_requests_fulfillment_state_check check (
    (status = 'fulfilled' and fulfilled_at is not null and fulfilled_by_staff_user_id is not null)
    or
    (status <> 'fulfilled' and fulfilled_at is null and fulfilled_by_staff_user_id is null)
  )
);

create trigger set_inventory_redemption_requests_updated_at
before update on public.inventory_redemption_requests
for each row
execute function public.set_current_timestamp_updated_at();

create index inventory_redemption_requests_game_status_requested_idx
on public.inventory_redemption_requests (game_session_id, status, requested_at desc);

create index inventory_redemption_requests_player_requested_idx
on public.inventory_redemption_requests (game_session_id, player_id, requested_at desc);

create index inventory_redemption_requests_holding_status_idx
on public.inventory_redemption_requests (game_session_id, inventory_holding_id, status);

alter table public.inventory_redemption_requests enable row level security;
revoke all on table public.inventory_redemption_requests from public, anon, authenticated;
grant select, insert, update on table public.inventory_redemption_requests to service_role;

create or replace function public.request_inventory_redemption(
  p_game_session_id uuid,
  p_player_id uuid,
  p_inventory_holding_id uuid,
  p_quantity integer,
  p_request_note text,
  p_idempotency_key text,
  p_request_hash text
)
returns table (
  request_outcome text,
  id uuid,
  game_session_id uuid,
  player_id uuid,
  inventory_holding_id uuid,
  store_item_id uuid,
  quantity integer,
  status text,
  request_note text,
  resolution_note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_holding public.inventory_holdings%rowtype;
  v_request public.inventory_redemption_requests%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_inventory_holding_id is null
    or p_quantity is null
    or p_quantity <= 0
    or p_idempotency_key is null
    or length(btrim(p_idempotency_key)) = 0
    or p_request_hash is null
    or length(btrim(p_request_hash)) = 0 then
    raise exception 'INVENTORY_REDEMPTION_REQUEST_INVALID';
  end if;

  select holding.*
  into v_holding
  from public.inventory_holdings holding
  join public.players player
    on player.game_session_id = holding.game_session_id
   and player.id = holding.player_id
   and player.status = 'active'
  join public.game_sessions game
    on game.id = holding.game_session_id
   and game.status = 'active'
  where holding.game_session_id = p_game_session_id
    and holding.player_id = p_player_id
    and holding.id = p_inventory_holding_id
  for update of holding;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_HOLDING_NOT_FOUND';
  end if;

  select request.*
  into v_request
  from public.inventory_redemption_requests request
  where request.game_session_id = p_game_session_id
    and request.player_id = p_player_id
    and request.idempotency_key = p_idempotency_key;

  if found then
    if v_request.request_hash <> p_request_hash then
      raise exception 'INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT';
    end if;
    request_outcome := 'replayed';
  else
    if v_holding.quantity_owned - v_holding.quantity_reserved < p_quantity then
      raise exception 'INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE';
    end if;

    insert into public.inventory_redemption_requests (
      game_session_id,
      player_id,
      inventory_holding_id,
      store_item_id,
      quantity,
      request_note,
      idempotency_key,
      request_hash
    )
    values (
      p_game_session_id,
      p_player_id,
      p_inventory_holding_id,
      v_holding.store_item_id,
      p_quantity,
      nullif(btrim(coalesce(p_request_note, '')), ''),
      btrim(p_idempotency_key),
      btrim(p_request_hash)
    )
    returning * into v_request;

    update public.inventory_holdings holding
    set quantity_reserved = holding.quantity_reserved + p_quantity
    where holding.id = p_inventory_holding_id;

    insert into public.inventory_events (
      game_session_id,
      player_id,
      store_item_id,
      quantity_delta,
      event_type,
      source_domain,
      source_action,
      source_id,
      metadata
    )
    values (
      p_game_session_id,
      p_player_id,
      v_holding.store_item_id,
      -p_quantity,
      'RESERVED',
      'inventory',
      'redemption_requested',
      v_request.id,
      jsonb_build_object('inventoryHoldingId', p_inventory_holding_id)
    );

    insert into public.audit_log (
      game_session_id,
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values (
      p_game_session_id,
      'player',
      p_player_id,
      'inventory.redemption_requested',
      'inventory_redemption_request',
      v_request.id,
      jsonb_build_object(
        'inventoryHoldingId', p_inventory_holding_id,
        'storeItemId', v_holding.store_item_id,
        'quantity', p_quantity
      )
    );

    request_outcome := 'created';
  end if;

  id := v_request.id;
  game_session_id := v_request.game_session_id;
  player_id := v_request.player_id;
  inventory_holding_id := v_request.inventory_holding_id;
  store_item_id := v_request.store_item_id;
  quantity := v_request.quantity;
  status := v_request.status;
  request_note := v_request.request_note;
  resolution_note := v_request.resolution_note;
  requested_at := v_request.requested_at;
  reviewed_at := v_request.reviewed_at;
  fulfilled_at := v_request.fulfilled_at;
  created_at := v_request.created_at;
  updated_at := v_request.updated_at;
  return next;
end;
$$;

create or replace function public.review_inventory_redemption(
  p_game_session_id uuid,
  p_request_id uuid,
  p_staff_user_id uuid,
  p_action text,
  p_resolution_note text
)
returns table (
  review_outcome text,
  id uuid,
  game_session_id uuid,
  player_id uuid,
  inventory_holding_id uuid,
  store_item_id uuid,
  quantity integer,
  status text,
  request_note text,
  resolution_note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_request public.inventory_redemption_requests%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_now timestamptz := now();
begin
  if p_game_session_id is null
    or p_request_id is null
    or p_staff_user_id is null
    or v_action not in ('approve', 'reject', 'fulfill') then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_INVALID';
  end if;

  if not exists (
    select 1
    from public.game_sessions game
    join public.staff_users staff
      on staff.id = p_staff_user_id
    where game.id = p_game_session_id
      and game.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_FORBIDDEN';
  end if;

  select request.*
  into v_request
  from public.inventory_redemption_requests request
  where request.game_session_id = p_game_session_id
    and request.id = p_request_id
  for update;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_REQUEST_NOT_FOUND';
  end if;

  select holding.*
  into v_holding
  from public.inventory_holdings holding
  where holding.game_session_id = p_game_session_id
    and holding.id = v_request.inventory_holding_id
  for update;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_HOLDING_NOT_FOUND';
  end if;

  if v_action = 'approve' then
    if v_request.status = 'approved' then
      review_outcome := 'replayed';
    elsif v_request.status = 'pending' then
      update public.inventory_redemption_requests request
      set status = 'approved',
          resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
          reviewed_by_staff_user_id = p_staff_user_id,
          reviewed_at = v_now
      where request.id = p_request_id
      returning * into v_request;
      review_outcome := 'approved';
    else
      raise exception 'INVENTORY_REDEMPTION_INVALID_TRANSITION';
    end if;
  elsif v_action = 'reject' then
    if v_request.status = 'rejected' then
      review_outcome := 'replayed';
    elsif v_request.status in ('pending', 'approved') then
      if v_holding.quantity_reserved < v_request.quantity then
        raise exception 'INVENTORY_REDEMPTION_RESERVATION_CORRUPT';
      end if;

      update public.inventory_holdings holding
      set quantity_reserved = holding.quantity_reserved - v_request.quantity
      where holding.id = v_request.inventory_holding_id;

      insert into public.inventory_events (
        game_session_id,
        player_id,
        store_item_id,
        quantity_delta,
        event_type,
        source_domain,
        source_action,
        source_id,
        metadata
      ) values (
        p_game_session_id,
        v_request.player_id,
        v_request.store_item_id,
        v_request.quantity,
        'RELEASED',
        'inventory',
        'redemption_rejected',
        v_request.id,
        '{}'::jsonb
      );

      update public.inventory_redemption_requests request
      set status = 'rejected',
          resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), ''),
          reviewed_by_staff_user_id = p_staff_user_id,
          reviewed_at = v_now
      where request.id = p_request_id
      returning * into v_request;
      review_outcome := 'rejected';
    else
      raise exception 'INVENTORY_REDEMPTION_INVALID_TRANSITION';
    end if;
  else
    if v_request.status = 'fulfilled' then
      review_outcome := 'replayed';
    elsif v_request.status = 'approved' then
      if v_holding.quantity_reserved < v_request.quantity
        or v_holding.quantity_owned < v_request.quantity then
        raise exception 'INVENTORY_REDEMPTION_RESERVATION_CORRUPT';
      end if;

      update public.inventory_holdings holding
      set quantity_owned = holding.quantity_owned - v_request.quantity,
          quantity_reserved = holding.quantity_reserved - v_request.quantity
      where holding.id = v_request.inventory_holding_id;

      insert into public.inventory_events (
        game_session_id,
        player_id,
        store_item_id,
        quantity_delta,
        event_type,
        source_domain,
        source_action,
        source_id,
        metadata
      ) values (
        p_game_session_id,
        v_request.player_id,
        v_request.store_item_id,
        -v_request.quantity,
        'USED',
        'inventory',
        'redemption_fulfilled',
        v_request.id,
        '{}'::jsonb
      );

      update public.inventory_redemption_requests request
      set status = 'fulfilled',
          resolution_note = coalesce(
            nullif(btrim(coalesce(p_resolution_note, '')), ''),
            request.resolution_note
          ),
          reviewed_by_staff_user_id = coalesce(request.reviewed_by_staff_user_id, p_staff_user_id),
          reviewed_at = coalesce(request.reviewed_at, v_now),
          fulfilled_by_staff_user_id = p_staff_user_id,
          fulfilled_at = v_now
      where request.id = p_request_id
      returning * into v_request;
      review_outcome := 'fulfilled';
    else
      raise exception 'INVENTORY_REDEMPTION_INVALID_TRANSITION';
    end if;
  end if;

  if review_outcome <> 'replayed' then
    insert into public.audit_log (
      game_session_id,
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      p_game_session_id,
      'staff_user',
      p_staff_user_id,
      'inventory.redemption_' || v_action,
      'inventory_redemption_request',
      v_request.id,
      jsonb_build_object(
        'playerId', v_request.player_id,
        'inventoryHoldingId', v_request.inventory_holding_id,
        'storeItemId', v_request.store_item_id,
        'quantity', v_request.quantity,
        'status', v_request.status
      )
    );
  end if;

  id := v_request.id;
  game_session_id := v_request.game_session_id;
  player_id := v_request.player_id;
  inventory_holding_id := v_request.inventory_holding_id;
  store_item_id := v_request.store_item_id;
  quantity := v_request.quantity;
  status := v_request.status;
  request_note := v_request.request_note;
  resolution_note := v_request.resolution_note;
  requested_at := v_request.requested_at;
  reviewed_at := v_request.reviewed_at;
  fulfilled_at := v_request.fulfilled_at;
  created_at := v_request.created_at;
  updated_at := v_request.updated_at;
  return next;
end;
$$;

revoke all on function public.request_inventory_redemption(uuid, uuid, uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.request_inventory_redemption(uuid, uuid, uuid, integer, text, text, text)
  to service_role;

revoke all on function public.review_inventory_redemption(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_inventory_redemption(uuid, uuid, uuid, text, text)
  to service_role;

comment on table public.inventory_redemption_requests is
  'Player item-use requests with reservation, administrator review, and fulfillment lifecycle.';
comment on function public.request_inventory_redemption(uuid, uuid, uuid, integer, text, text, text) is
  'Idempotently reserves available inventory and creates one player redemption request.';
comment on function public.review_inventory_redemption(uuid, uuid, uuid, text, text) is
  'Atomically approves, rejects, or fulfills one inventory redemption request.';

commit;
