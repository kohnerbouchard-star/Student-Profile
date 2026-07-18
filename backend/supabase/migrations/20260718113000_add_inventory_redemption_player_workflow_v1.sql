begin;

alter table public.inventory_holdings
  add constraint inventory_holdings_game_player_id_item_unique
  unique (game_session_id, player_id, id, store_item_id);

alter table public.store_items
  add constraint store_items_game_id_key_unique
  unique (game_session_id, id, item_key);

create table public.inventory_redemption_requests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default (
    'red_' || replace(gen_random_uuid()::text, '-', '')
  ),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid not null,
  inventory_holding_id uuid not null,
  store_item_id uuid not null,
  item_key text not null,
  quantity integer not null,
  status text not null default 'pending',
  request_note text null,
  resolution_note text null,
  idempotency_key text not null,
  requested_at timestamptz not null default now(),
  reviewed_by_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  reviewed_at timestamptz null,
  fulfilled_by_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  fulfilled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_redemption_requests_game_id_unique
    unique (game_session_id, id),
  constraint inventory_redemption_requests_public_id_unique
    unique (public_id),
  constraint inventory_redemption_requests_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint inventory_redemption_requests_holding_scope_fk
    foreign key (
      game_session_id,
      player_id,
      inventory_holding_id,
      store_item_id
    )
    references public.inventory_holdings (
      game_session_id,
      player_id,
      id,
      store_item_id
    ),
  constraint inventory_redemption_requests_item_scope_fk
    foreign key (game_session_id, store_item_id, item_key)
    references public.store_items (game_session_id, id, item_key),
  constraint inventory_redemption_requests_idempotency_unique
    unique (game_session_id, player_id, idempotency_key),
  constraint inventory_redemption_requests_public_id_valid
    check (public_id ~ '^red_[0-9a-f]{32}$'),
  constraint inventory_redemption_requests_item_key_valid
    check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint inventory_redemption_requests_quantity_valid
    check (quantity between 1 and 100),
  constraint inventory_redemption_requests_status_valid
    check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  constraint inventory_redemption_requests_request_note_valid
    check (
      request_note is null
      or (
        length(request_note) between 1 and 1000
        and request_note = btrim(request_note)
      )
    ),
  constraint inventory_redemption_requests_resolution_note_valid
    check (
      resolution_note is null
      or (
        length(resolution_note) between 1 and 1000
        and resolution_note = btrim(resolution_note)
      )
    ),
  constraint inventory_redemption_requests_idempotency_key_valid
    check (
      length(idempotency_key) between 1 and 128
      and idempotency_key = btrim(idempotency_key)
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
  constraint inventory_redemption_requests_review_state_valid
    check (
      (status = 'pending'
        and reviewed_by_staff_user_id is null
        and reviewed_at is null)
      or
      (status <> 'pending'
        and reviewed_by_staff_user_id is not null
        and reviewed_at is not null)
    ),
  constraint inventory_redemption_requests_fulfillment_state_valid
    check (
      (status = 'fulfilled'
        and fulfilled_by_staff_user_id is not null
        and fulfilled_at is not null)
      or
      (status <> 'fulfilled'
        and fulfilled_by_staff_user_id is null
        and fulfilled_at is null)
    )
);

create trigger set_inventory_redemption_requests_updated_at
before update on public.inventory_redemption_requests
for each row
execute function public.set_current_timestamp_updated_at();

create index inventory_redemption_requests_game_status_requested_idx
  on public.inventory_redemption_requests (
    game_session_id,
    status,
    requested_at desc,
    public_id desc
  );

create index inventory_redemption_requests_player_requested_idx
  on public.inventory_redemption_requests (
    game_session_id,
    player_id,
    requested_at desc,
    public_id desc
  );

create index inventory_redemption_requests_holding_status_idx
  on public.inventory_redemption_requests (
    game_session_id,
    inventory_holding_id,
    status
  );

create table public.inventory_redemption_transitions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null,
  request_id uuid not null,
  from_status text null,
  to_status text not null,
  actor_type text not null,
  actor_id uuid not null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  transitioned_at timestamptz not null default now(),

  constraint inventory_redemption_transitions_request_scope_fk
    foreign key (game_session_id, request_id)
    references public.inventory_redemption_requests (game_session_id, id)
    on delete cascade,
  constraint inventory_redemption_transitions_once_per_status
    unique (request_id, to_status),
  constraint inventory_redemption_transitions_status_valid
    check (
      from_status is null
      or from_status in ('pending', 'approved', 'rejected', 'fulfilled')
    ),
  constraint inventory_redemption_transitions_to_status_valid
    check (to_status in ('pending', 'approved', 'rejected', 'fulfilled')),
  constraint inventory_redemption_transitions_path_valid
    check (
      (from_status is null and to_status = 'pending')
      or (from_status = 'pending' and to_status in ('approved', 'rejected'))
      or (from_status = 'approved' and to_status in ('rejected', 'fulfilled'))
    ),
  constraint inventory_redemption_transitions_actor_type_valid
    check (actor_type in ('player', 'staff_user', 'system')),
  constraint inventory_redemption_transitions_note_valid
    check (
      note is null
      or (length(note) between 1 and 1000 and note = btrim(note))
    ),
  constraint inventory_redemption_transitions_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index inventory_redemption_transitions_request_time_idx
  on public.inventory_redemption_transitions (
    game_session_id,
    request_id,
    transitioned_at asc,
    id asc
  );

create unique index inventory_events_redemption_request_once
  on public.inventory_events (source_id)
  where source_domain = 'inventory'
    and source_action = 'redemption_requested'
    and source_id is not null;

alter table public.inventory_redemption_requests enable row level security;
alter table public.inventory_redemption_transitions enable row level security;

revoke all on table public.inventory_redemption_requests
  from public, anon, authenticated, service_role;
revoke all on table public.inventory_redemption_transitions
  from public, anon, authenticated, service_role;
grant select on table public.inventory_redemption_requests
  to service_role;
grant select on table public.inventory_redemption_transitions
  to service_role;

create or replace function public.request_inventory_redemption_atomic_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_request_note text,
  p_idempotency_key text
)
returns table (
  request_outcome text,
  request_id text,
  item_id text,
  quantity integer,
  status text,
  request_note text,
  resolution_note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_note text := nullif(btrim(coalesce(p_request_note, '')), '');
  v_player public.players%rowtype;
  v_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_request public.inventory_redemption_requests%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_item_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_quantity is null
    or p_quantity not between 1 and 100
    or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or length(v_idempotency_key) > 128
    or length(coalesce(v_request_note, '')) > 1000
  then
    raise exception 'INVENTORY_REDEMPTION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select player_row.*
  into v_player
  from public.players as player_row
  join public.game_sessions as game_row
    on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for update of player_row;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001';
  end if;

  select request_row.*
  into v_request
  from public.inventory_redemption_requests as request_row
  where request_row.game_session_id = p_game_session_id
    and request_row.player_id = p_player_id
    and request_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_request.item_key <> v_item_key
      or v_request.quantity <> p_quantity
      or v_request.request_note is distinct from v_request_note
    then
      raise exception 'INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      'replayed'::text,
      v_request.public_id,
      v_request.item_key,
      v_request.quantity,
      v_request.status,
      v_request.request_note,
      v_request.resolution_note,
      v_request.requested_at,
      v_request.reviewed_at,
      v_request.fulfilled_at,
      v_request.updated_at;
    return;
  end if;

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.item_key = v_item_key
    and item_row.status = 'active'
    and item_row.visibility = 'visible'
  for share;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_ITEM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = p_player_id
    and holding_row.store_item_id = v_item.id
  for update;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_ITEM_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_holding.quantity_owned - v_holding.quantity_reserved < p_quantity then
    raise exception 'INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.inventory_redemption_requests (
    game_session_id,
    player_id,
    inventory_holding_id,
    store_item_id,
    item_key,
    quantity,
    request_note,
    idempotency_key
  ) values (
    p_game_session_id,
    p_player_id,
    v_holding.id,
    v_item.id,
    v_item.item_key,
    p_quantity,
    v_request_note,
    v_idempotency_key
  )
  returning * into v_request;

  update public.inventory_holdings as holding_row
  set quantity_reserved = holding_row.quantity_reserved + p_quantity,
      updated_at = statement_timestamp()
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = p_player_id
    and holding_row.id = v_holding.id;

  insert into public.inventory_redemption_transitions (
    game_session_id,
    request_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    note,
    metadata
  ) values (
    p_game_session_id,
    v_request.id,
    null,
    'pending',
    'player',
    p_player_id,
    v_request_note,
    jsonb_build_object(
      'requestId', v_request.public_id,
      'itemId', v_request.item_key,
      'quantity', v_request.quantity
    )
  );

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
    p_player_id,
    v_item.id,
    -p_quantity,
    'RESERVED',
    'inventory',
    'redemption_requested',
    v_request.id,
    jsonb_build_object(
      'requestId', v_request.public_id,
      'itemId', v_request.item_key,
      'quantity', v_request.quantity
    )
  );

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
    'player',
    p_player_id,
    'inventory.redemption_requested',
    'inventory_redemption_request',
    v_request.id,
    jsonb_build_object(
      'requestId', v_request.public_id,
      'itemId', v_request.item_key,
      'quantity', v_request.quantity
    )
  );

  return query
  select
    'created'::text,
    v_request.public_id,
    v_request.item_key,
    v_request.quantity,
    v_request.status,
    v_request.request_note,
    v_request.resolution_note,
    v_request.requested_at,
    v_request.reviewed_at,
    v_request.fulfilled_at,
    v_request.updated_at;
end;
$function$;

create or replace function public.read_player_inventory_redemptions_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_request_public_id text default null
)
returns table (
  request_id text,
  item_id text,
  quantity integer,
  status text,
  request_note text,
  resolution_note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_request_public_id text := nullif(btrim(coalesce(p_request_public_id, '')), '');
begin
  if p_game_session_id is null
    or p_player_id is null
    or (v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'fulfilled'))
    or p_limit is null
    or p_limit not between 1 and 51
    or p_offset is null
    or p_offset not between 0 and 10000
    or (
      v_request_public_id is not null
      and v_request_public_id !~ '^red_[0-9a-f]{32}$'
    )
  then
    raise exception 'INVENTORY_REDEMPTION_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.players as player_row
    join public.game_sessions as game_row
      on game_row.id = player_row.game_session_id
    where player_row.game_session_id = p_game_session_id
      and player_row.id = p_player_id
      and player_row.status = 'active'
      and game_row.status = 'active'
  ) then
    raise exception 'INVENTORY_REDEMPTION_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001';
  end if;

  return query
  select
    request_row.public_id,
    request_row.item_key,
    request_row.quantity,
    request_row.status,
    request_row.request_note,
    request_row.resolution_note,
    request_row.requested_at,
    request_row.reviewed_at,
    request_row.fulfilled_at,
    request_row.updated_at
  from public.inventory_redemption_requests as request_row
  where request_row.game_session_id = p_game_session_id
    and request_row.player_id = p_player_id
    and (v_status is null or request_row.status = v_status)
    and (
      v_request_public_id is null
      or request_row.public_id = v_request_public_id
    )
  order by request_row.requested_at desc, request_row.public_id desc
  limit p_limit
  offset p_offset;
end;
$function$;

revoke all on function public.request_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  integer,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.request_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  integer,
  text,
  text
) to service_role;

revoke all on function public.read_player_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer,
  text
) from public, anon, authenticated;
grant execute on function public.read_player_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer,
  text
) to service_role;

comment on table public.inventory_redemption_requests is
  'Authoritative player item-redemption request state. Browser contracts use public_id and item_key only.';
comment on table public.inventory_redemption_transitions is
  'Append-only inventory-redemption transition authority.';
comment on function public.request_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  integer,
  text,
  text
) is
  'Idempotently reserves one player-owned public item and appends its initial redemption evidence.';
comment on function public.read_player_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer,
  text
) is
  'Returns only public, player-scoped inventory-redemption history fields.';

commit;
