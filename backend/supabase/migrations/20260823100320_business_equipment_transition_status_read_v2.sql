-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.transition_business_equipment_reservation_v2(
  p_game_session_id uuid,
  p_reservation_key text,
  p_transition text,
  p_production_run_key text default null
)
returns table (
  reservation_key text,
  status text,
  production_run_key text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_reservation public.business_equipment_reservations%rowtype;
  v_run public.business_production_runs%rowtype;
  v_target text := lower(btrim(coalesce(p_transition, '')));
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null
    or coalesce(p_reservation_key, '') !~ '^eqr_[0-9a-f]{32}$'
    or v_target not in ('active','consumed','released')
    or (
      p_production_run_key is not null
      and p_production_run_key !~ '^run_[0-9a-f]{32}$'
    )
  then
    raise exception 'BUSINESS_EQUIPMENT_TRANSITION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select reservation_row.*
  into v_reservation
  from public.business_equipment_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.public_key = lower(btrim(p_reservation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_production_run_key is not null then
    select run_row.*
    into v_run
    from public.business_production_runs as run_row
    where run_row.game_session_id = p_game_session_id
      and run_row.public_key = lower(btrim(p_production_run_key))
      and run_row.business_id = v_reservation.business_id
    for share;
    if not found then
      raise exception 'BUSINESS_EQUIPMENT_PRODUCTION_RUN_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  if v_reservation.status = v_target then
    return query select
      v_reservation.public_key,
      v_reservation.status,
      v_run.public_key,
      true;
    return;
  end if;

  if v_target = 'active' and v_reservation.status <> 'reserved' then
    raise exception 'BUSINESS_EQUIPMENT_TRANSITION_INVALID' using errcode = 'P0001';
  elsif v_target in ('consumed','released')
    and v_reservation.status not in ('reserved','active')
  then
    raise exception 'BUSINESS_EQUIPMENT_TRANSITION_INVALID' using errcode = 'P0001';
  end if;

  update public.business_equipment_reservations
  set
    status = v_target,
    production_run_id = coalesce(v_run.id, production_run_id),
    activated_at = case
      when v_target = 'active' then v_now
      else activated_at
    end,
    consumed_at = case
      when v_target = 'consumed' then v_now
      else consumed_at
    end,
    released_at = case
      when v_target = 'released' then v_now
      else released_at
    end
  where id = v_reservation.id
  returning * into v_reservation;

  return query select
    v_reservation.public_key,
    v_reservation.status,
    v_run.public_key,
    false;
end
$function$;

revoke all on function public.transition_business_equipment_reservation_v2(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.transition_business_equipment_reservation_v2(
  uuid, text, text, text
) to service_role;

create or replace function public.set_owned_business_equipment_status_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_installation_key text,
  p_transition text,
  p_idempotency_key text
)
returns table (
  business_key text,
  installation_key text,
  equipment_key text,
  status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_business record;
  v_installation public.business_equipment_installations%rowtype;
  v_instance public.equipment_instances%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_target text;
  v_hash text;
  v_now timestamptz := statement_timestamp();
begin
  if p_game_session_id is null or p_player_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_installation_key, '') !~ '^bei_[0-9a-f]{32}$'
    or lower(btrim(coalesce(p_transition, ''))) not in ('online','offline','retire')
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_EQUIPMENT_STATUS_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  if v_business.business_key is distinct from lower(btrim(p_business_key))
    or not exists (
      select 1 from public.business_entities as active_business
      where active_business.game_session_id = p_game_session_id
        and active_business.id = v_business.business_id
        and active_business.status = 'active'
    )
  then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_target := case lower(btrim(p_transition))
    when 'online' then 'installed'
    when 'offline' then 'offline'
    else 'retired'
  end;
  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|', p_game_session_id, p_player_id, v_business.business_id,
        lower(btrim(p_installation_key)), v_target
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.mutation_idempotency_keys (
    game_session_id, player_id, route_key, idempotency_key,
    request_hash, status, expires_at
  ) values (
    p_game_session_id, p_player_id,
    'players.me.business.equipment.status',
    btrim(p_idempotency_key), v_hash, 'STARTED', v_now + interval '7 days'
  )
  on conflict on constraint mutation_idempotency_keys_scope_unique do nothing;

  select idempotency_row.*
  into v_idempotency
  from public.mutation_idempotency_keys as idempotency_row
  where idempotency_row.game_session_id = p_game_session_id
    and idempotency_row.player_id = p_player_id
    and idempotency_row.route_key = 'players.me.business.equipment.status'
    and idempotency_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_idempotency.request_hash <> v_hash then
    raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;

  select installation_row.*
  into v_installation
  from public.business_equipment_installations as installation_row
  where installation_row.game_session_id = p_game_session_id
    and installation_row.business_id = v_business.business_id
    and installation_row.public_key = lower(btrim(p_installation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select instance_row.*
  into v_instance
  from public.equipment_instances as instance_row
  where instance_row.game_session_id = p_game_session_id
    and instance_row.id = v_installation.equipment_instance_id
    and instance_row.player_id is null
    and instance_row.equipped_slot is null
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH' using errcode = 'P0001';
  end if;

  if v_idempotency.status = 'COMPLETED' or v_installation.status = v_target then
    if v_idempotency.status <> 'COMPLETED' then
      update public.mutation_idempotency_keys
      set
        status = 'COMPLETED',
        result_type = 'business_equipment_installation',
        result_id = v_installation.id,
        response_body = jsonb_build_object(
          'businessKey', v_business.business_key,
          'installationKey', v_installation.public_key,
          'equipmentKey', v_instance.public_id,
          'status', v_installation.status
        ),
        completed_at = v_now
      where id = v_idempotency.id;
    end if;
    return query select
      v_business.business_key,
      v_installation.public_key,
      v_instance.public_id,
      v_installation.status,
      true;
    return;
  end if;

  if v_installation.status = 'retired' then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_RETIRED' using errcode = 'P0001';
  end if;

  if v_target in ('offline','retired') and exists (
    select 1
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = p_game_session_id
      and reservation.installation_id = v_installation.id
      and reservation.status in ('reserved','active')
  ) then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_ACTIVE' using errcode = 'P0001';
  end if;

  update public.business_equipment_installations
  set
    status = v_target,
    offline_at = case when v_target = 'offline' then v_now else null end,
    retired_at = case when v_target = 'retired' then v_now else null end,
    version = version + 1
  where id = v_installation.id
  returning * into v_installation;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action,
    target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id,
    'business.equipment.' || v_target,
    'business_equipment_installation', v_installation.id,
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'installationKey', v_installation.public_key,
      'equipmentKey', v_instance.public_id,
      'status', v_installation.status,
      'idempotencyKey', btrim(p_idempotency_key),
      'durabilityEnabled', false,
      'repairEnabled', false
    )
  );

  update public.mutation_idempotency_keys
  set
    status = 'COMPLETED',
    result_type = 'business_equipment_installation',
    result_id = v_installation.id,
    response_body = jsonb_build_object(
      'businessKey', v_business.business_key,
      'installationKey', v_installation.public_key,
      'equipmentKey', v_instance.public_id,
      'status', v_installation.status
    ),
    completed_at = v_now
  where id = v_idempotency.id;

  return query select
    v_business.business_key,
    v_installation.public_key,
    v_instance.public_id,
    v_installation.status,
    false;
end
$function$;

revoke all on function public.set_owned_business_equipment_status_v2(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_owned_business_equipment_status_v2(
  uuid, uuid, text, text, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Public-key-only Business equipment read
-- ---------------------------------------------------------------------------

create or replace function public.read_owned_business_equipment_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (
  business_key text,
  installation_key text,
  equipment_key text,
  item_key text,
  canonical_key text,
  item_name text,
  equipment_slot text,
  capability_keys text[],
  installation_status text,
  period_key text,
  capacity_minutes integer,
  reserved_minutes integer,
  consumed_minutes integer,
  available_minutes integer,
  idle_minutes integer,
  utilization_basis_points integer,
  durability_supported boolean,
  repair_supported boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business record;
  v_period_key text;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  v_period_key := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.business_id
  );

  return query
  select
    v_business.business_key,
    installation.public_key,
    instance.public_id,
    item.public_key,
    item.canonical_key,
    item.name,
    definition.equipment_slot,
    profile.capability_keys,
    installation.status,
    v_period_key,
    case when installation.status = 'installed'
      then profile.base_capacity_minutes_per_period else 0 end,
    coalesce(usage.reserved_minutes, 0),
    coalesce(usage.consumed_minutes, 0),
    case when installation.status = 'installed' then greatest(
      profile.base_capacity_minutes_per_period
        - coalesce(usage.committed_minutes, 0),
      0
    ) else 0 end,
    case when installation.status = 'installed' then greatest(
      profile.base_capacity_minutes_per_period
        - coalesce(usage.committed_minutes, 0),
      0
    ) else 0 end,
    case when installation.status = 'installed' then least(
      10000,
      greatest(
        0,
        round(
          10000.0 * coalesce(usage.committed_minutes, 0)
          / nullif(profile.base_capacity_minutes_per_period, 0)
        )::integer
      )
    ) else 0 end,
    false,
    false
  from public.business_equipment_installations as installation
  join public.equipment_instances as instance
    on instance.game_session_id = installation.game_session_id
   and instance.id = installation.equipment_instance_id
  join public.game_items as item
    on item.game_session_id = instance.game_session_id
   and item.id = instance.game_item_id
  join public.physical_economy_item_definitions as definition
    on definition.id = item.physical_item_definition_id
  join public.business_equipment_capacity_profiles as profile
    on profile.id = installation.capacity_profile_id
  left join lateral (
    select
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status in ('reserved','active')
      ), 0)::integer as reserved_minutes,
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status = 'consumed'
      ), 0)::integer as consumed_minutes,
      coalesce(sum(reservation.reserved_minutes) filter (
        where reservation.status in ('reserved','active','consumed')
      ), 0)::integer as committed_minutes
    from public.business_equipment_reservations as reservation
    where reservation.game_session_id = installation.game_session_id
      and reservation.installation_id = installation.id
      and reservation.period_key = v_period_key
  ) as usage on true
  where installation.game_session_id = p_game_session_id
    and installation.business_id = v_business.business_id
    and installation.status in ('installed','offline')
    and instance.status = 'active'
    and instance.player_id is null
    and instance.equipped_slot is null
    and item.status = 'active'
    and definition.status = 'active'
    and profile.status = 'active'
  order by item.name, instance.public_id;
end
$function$;

revoke all on function public.read_owned_business_equipment_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_equipment_v2(uuid, uuid)
  to service_role;

comment on function public.read_owned_business_equipment_v2(uuid, uuid) is
  'Public-key-only Business equipment installation and finite-capacity read. '
  'Internal UUIDs, inventory accounts, and trusted ownership fields remain server-private.';

commit;
