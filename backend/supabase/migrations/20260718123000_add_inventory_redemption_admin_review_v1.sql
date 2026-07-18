begin;

alter table public.inventory_redemption_transitions
  add column action text null,
  add column idempotency_key text null,
  add constraint inventory_redemption_transitions_staff_command_valid
  check (
    (
      actor_type = 'staff_user'
      and action in ('approve', 'reject', 'fulfill')
      and idempotency_key is not null
      and length(idempotency_key) between 1 and 128
      and idempotency_key = btrim(idempotency_key)
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
    or (
      actor_type <> 'staff_user'
      and action is null
      and idempotency_key is null
    )
  );

create unique index inventory_redemption_transitions_staff_idempotency_unique
  on public.inventory_redemption_transitions (
    game_session_id,
    actor_id,
    idempotency_key
  )
  where actor_type = 'staff_user' and idempotency_key is not null;

create unique index inventory_events_redemption_review_once
  on public.inventory_events (source_action, source_id)
  where source_domain = 'inventory'
    and source_action in (
      'redemption_rejected',
      'redemption_fulfillment_release',
      'redemption_fulfilled'
    )
    and source_id is not null;

create or replace function public.read_admin_inventory_redemptions_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_status text default 'pending',
  p_limit integer default 25,
  p_offset integer default 0
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
  updated_at timestamptz,
  player_reference text,
  player_display_name text,
  player_roster_label text,
  item_name text,
  item_category text
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or (
      v_status is not null
      and v_status not in ('pending', 'approved', 'rejected', 'fulfilled')
    )
    or p_limit is null
    or p_limit not between 1 and 51
    or p_offset is null
    or p_offset not between 0 and 10000
  then
    raise exception 'INVENTORY_REDEMPTION_ADMIN_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    join public.staff_users as staff_row
      on staff_row.id = game_row.owner_staff_user_id
    where game_row.id = p_game_session_id
      and staff_row.id = p_staff_user_id
  ) then
    raise exception 'INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN' using errcode = 'P0001';
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
    request_row.updated_at,
    case
      when player_row.player_identifier is null then null
      when player_row.player_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then null
      else player_row.player_identifier
    end,
    player_row.display_name,
    player_row.roster_label,
    item_row.name,
    item_row.category
  from public.inventory_redemption_requests as request_row
  join public.players as player_row
    on player_row.game_session_id = request_row.game_session_id
    and player_row.id = request_row.player_id
  join public.store_items as item_row
    on item_row.game_session_id = request_row.game_session_id
    and item_row.id = request_row.store_item_id
  where request_row.game_session_id = p_game_session_id
    and (v_status is null or request_row.status = v_status)
  order by
    case when v_status = 'pending' then request_row.requested_at end asc,
    case when v_status is distinct from 'pending' then request_row.requested_at end desc,
    case when v_status = 'pending' then request_row.public_id end asc,
    case when v_status is distinct from 'pending' then request_row.public_id end desc
  limit p_limit
  offset p_offset;
end;
$function$;

create or replace function public.review_inventory_redemption_atomic_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_request_public_id text,
  p_action text,
  p_resolution_note text,
  p_idempotency_key text
)
returns table (
  review_outcome text,
  request_id text,
  item_id text,
  quantity integer,
  status text,
  request_note text,
  resolution_note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz,
  player_reference text,
  player_display_name text,
  player_roster_label text,
  item_name text,
  item_category text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_request_public_id text := btrim(coalesce(p_request_public_id, ''));
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_resolution_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_target_status text;
  v_from_status text;
  v_staff public.staff_users%rowtype;
  v_request public.inventory_redemption_requests%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_existing_transition public.inventory_redemption_transitions%rowtype;
begin
  if p_game_session_id is null
    or p_staff_user_id is null
    or v_request_public_id !~ '^red_[0-9a-f]{32}$'
    or v_action not in ('approve', 'reject', 'fulfill')
    or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or length(v_idempotency_key) > 128
    or length(coalesce(v_resolution_note, '')) > 1000
    or (v_action = 'reject' and v_resolution_note is null)
  then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_INVALID' using errcode = 'P0001';
  end if;

  v_target_status := case v_action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    when 'fulfill' then 'fulfilled'
  end;

  select staff_row.*
  into v_staff
  from public.staff_users as staff_row
  join public.game_sessions as game_row
    on game_row.owner_staff_user_id = staff_row.id
  where staff_row.id = p_staff_user_id
    and game_row.id = p_game_session_id
  for update of staff_row;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_ADMIN_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select transition_row.*
  into v_existing_transition
  from public.inventory_redemption_transitions as transition_row
  where transition_row.game_session_id = p_game_session_id
    and transition_row.actor_type = 'staff_user'
    and transition_row.actor_id = p_staff_user_id
    and transition_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    select request_row.*
    into v_request
    from public.inventory_redemption_requests as request_row
    where request_row.game_session_id = p_game_session_id
      and request_row.id = v_existing_transition.request_id;

    if not found
      or v_request.public_id <> v_request_public_id
      or v_existing_transition.action <> v_action
      or v_existing_transition.note is distinct from v_resolution_note
    then
      raise exception 'INVENTORY_REDEMPTION_REVIEW_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
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
      v_request.updated_at,
      case
        when player_row.player_identifier is null then null
        when player_row.player_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then null
        else player_row.player_identifier
      end,
      player_row.display_name,
      player_row.roster_label,
      item_row.name,
      item_row.category
    from public.players as player_row
    join public.store_items as item_row
      on item_row.game_session_id = p_game_session_id
      and item_row.id = v_request.store_item_id
    where player_row.game_session_id = p_game_session_id
      and player_row.id = v_request.player_id;
    return;
  end if;

  select request_row.*
  into v_request
  from public.inventory_redemption_requests as request_row
  where request_row.game_session_id = p_game_session_id
    and request_row.public_id = v_request_public_id
  for update;

  if not found then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_NOT_FOUND' using errcode = 'P0001';
  end if;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.player_id = v_request.player_id
    and holding_row.id = v_request.inventory_holding_id
    and holding_row.store_item_id = v_request.store_item_id
  for update;

  if not found
    or v_holding.quantity_reserved < v_request.quantity
    or v_holding.quantity_owned < v_request.quantity
  then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_RESERVATION_INVALID' using errcode = 'P0001';
  end if;

  if (v_action = 'approve' and v_request.status <> 'pending')
    or (
      v_action = 'reject'
      and v_request.status not in ('pending', 'approved')
    )
    or (v_action = 'fulfill' and v_request.status <> 'approved')
  then
    raise exception 'INVENTORY_REDEMPTION_REVIEW_TRANSITION_INVALID' using errcode = 'P0001';
  end if;

  v_from_status := v_request.status;

  if v_action = 'approve' then
    update public.inventory_redemption_requests as request_row
    set status = 'approved',
        resolution_note = v_resolution_note,
        reviewed_by_staff_user_id = p_staff_user_id,
        reviewed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where request_row.id = v_request.id
    returning * into v_request;
  elsif v_action = 'reject' then
    update public.inventory_holdings as holding_row
    set quantity_reserved = holding_row.quantity_reserved - v_request.quantity,
        updated_at = statement_timestamp()
    where holding_row.id = v_holding.id;

    update public.inventory_redemption_requests as request_row
    set status = 'rejected',
        resolution_note = v_resolution_note,
        reviewed_by_staff_user_id = p_staff_user_id,
        reviewed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where request_row.id = v_request.id
    returning * into v_request;

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
      jsonb_build_object(
        'requestId', v_request.public_id,
        'itemId', v_request.item_key,
        'quantity', v_request.quantity
      )
    );
  else
    update public.inventory_holdings as holding_row
    set quantity_owned = holding_row.quantity_owned - v_request.quantity,
        quantity_reserved = holding_row.quantity_reserved - v_request.quantity,
        updated_at = statement_timestamp()
    where holding_row.id = v_holding.id;

    update public.inventory_redemption_requests as request_row
    set status = 'fulfilled',
        resolution_note = coalesce(v_resolution_note, request_row.resolution_note),
        fulfilled_by_staff_user_id = p_staff_user_id,
        fulfilled_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where request_row.id = v_request.id
    returning * into v_request;

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
    ) values
    (
      p_game_session_id,
      v_request.player_id,
      v_request.store_item_id,
      v_request.quantity,
      'RELEASED',
      'inventory',
      'redemption_fulfillment_release',
      v_request.id,
      jsonb_build_object(
        'requestId', v_request.public_id,
        'itemId', v_request.item_key,
        'quantity', v_request.quantity
      )
    ),
    (
      p_game_session_id,
      v_request.player_id,
      v_request.store_item_id,
      -v_request.quantity,
      'USED',
      'inventory',
      'redemption_fulfilled',
      v_request.id,
      jsonb_build_object(
        'requestId', v_request.public_id,
        'itemId', v_request.item_key,
        'quantity', v_request.quantity,
        'effectApplication', 'not_automated'
      )
    );
  end if;

  insert into public.inventory_redemption_transitions (
    game_session_id,
    request_id,
    from_status,
    to_status,
    actor_type,
    actor_id,
    action,
    idempotency_key,
    note,
    metadata
  ) values (
    p_game_session_id,
    v_request.id,
    v_from_status,
    v_target_status,
    'staff_user',
    p_staff_user_id,
    v_action,
    v_idempotency_key,
    v_resolution_note,
    jsonb_build_object(
      'requestId', v_request.public_id,
      'itemId', v_request.item_key,
      'quantity', v_request.quantity,
      'effectApplication', case
        when v_action = 'fulfill' then 'not_automated'
        else 'not_applicable'
      end
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
    'staff_user',
    p_staff_user_id,
    'inventory.redemption_' || v_target_status,
    'inventory_redemption_request',
    v_request.id,
    jsonb_build_object(
      'requestId', v_request.public_id,
      'itemId', v_request.item_key,
      'quantity', v_request.quantity,
      'resolutionNote', v_resolution_note,
      'idempotencyKey', v_idempotency_key
    )
  );

  return query
  select
    'applied'::text,
    v_request.public_id,
    v_request.item_key,
    v_request.quantity,
    v_request.status,
    v_request.request_note,
    v_request.resolution_note,
    v_request.requested_at,
    v_request.reviewed_at,
    v_request.fulfilled_at,
    v_request.updated_at,
    case
      when player_row.player_identifier is null then null
      when player_row.player_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then null
      else player_row.player_identifier
    end,
    player_row.display_name,
    player_row.roster_label,
    item_row.name,
    item_row.category
  from public.players as player_row
  join public.store_items as item_row
    on item_row.game_session_id = p_game_session_id
    and item_row.id = v_request.store_item_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = v_request.player_id;
end;
$function$;

revoke all on function public.read_admin_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.read_admin_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer
) to service_role;

revoke all on function public.review_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.review_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.read_admin_inventory_redemptions_v1(
  uuid,
  uuid,
  text,
  integer,
  integer
) is
  'Returns a bounded UUID-private redemption review queue only to the owning staff user.';
comment on function public.review_inventory_redemption_atomic_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) is
  'Idempotently approves, rejects, or fulfills one public redemption request while updating its reservation and append-only evidence.';

commit;
