-- Business V2 Phase 5A: canonical Business equipment capacity foundation.
-- Additive, forward-only, and intentionally excludes timed manufacturing and maintenance settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.current_business_equipment_period_key_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payroll_key text;
begin
  v_payroll_key := public.current_business_payroll_period_key_v2(
    p_game_session_id,
    p_business_id
  );
  if v_payroll_key !~ '^payroll:[1-9][0-9]*$' then
    raise exception 'BUSINESS_EQUIPMENT_PERIOD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return regexp_replace(v_payroll_key, '^payroll:', 'equipment:');
end
$function$;

revoke all on function public.current_business_equipment_period_key_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.current_business_equipment_period_key_v2(uuid, uuid)
  to service_role;

create or replace function public.reserve_business_equipment_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_installation_key text,
  p_requirement_key text,
  p_period_key text,
  p_reserved_minutes integer,
  p_intent_ref text,
  p_idempotency_key text
)
returns table (
  reservation_key text,
  status text,
  reserved_minutes integer,
  capacity_minutes integer,
  available_minutes integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_installation public.business_equipment_installations%rowtype;
  v_instance public.equipment_instances%rowtype;
  v_profile public.business_equipment_capacity_profiles%rowtype;
  v_requirement public.business_recipe_equipment_requirements%rowtype;
  v_reservation public.business_equipment_reservations%rowtype;
  v_current_period text;
  v_used_minutes integer := 0;
  v_hash text;
begin
  if p_game_session_id is null
    or coalesce(p_business_key, '') !~ '^biz_[0-9a-f]{32}$'
    or coalesce(p_installation_key, '') !~ '^bei_[0-9a-f]{32}$'
    or coalesce(p_requirement_key, '') !~ '^beq_[0-9a-f]{32}$'
    or coalesce(p_period_key, '') !~ '^equipment:[1-9][0-9]*$'
    or p_reserved_minutes is null
    or p_reserved_minutes <= 0
    or coalesce(p_intent_ref, '') !~ '^[a-z0-9][a-z0-9._:-]{7,159}$'
    or length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160
  then
    raise exception 'BUSINESS_EQUIPMENT_RESERVATION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_current_period := public.current_business_equipment_period_key_v2(
    p_game_session_id,
    v_business.id
  );
  if p_period_key is distinct from v_current_period then
    raise exception 'BUSINESS_EQUIPMENT_PERIOD_MISMATCH' using errcode = 'P0001';
  end if;

  select installation_row.*
  into v_installation
  from public.business_equipment_installations as installation_row
  where installation_row.game_session_id = p_game_session_id
    and installation_row.business_id = v_business.id
    and installation_row.public_key = lower(btrim(p_installation_key))
    and installation_row.status = 'installed'
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTALLATION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select instance_row.*
  into v_instance
  from public.equipment_instances as instance_row
  where instance_row.game_session_id = p_game_session_id
    and instance_row.id = v_installation.equipment_instance_id
    and instance_row.status = 'active'
    and instance_row.player_id is null
    and instance_row.equipped_slot is null
  for update;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_INSTANCE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select profile_row.*
  into v_profile
  from public.business_equipment_capacity_profiles as profile_row
  where profile_row.id = v_installation.capacity_profile_id
    and profile_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_PROFILE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select requirement_row.*
  into v_requirement
  from public.business_recipe_equipment_requirements as requirement_row
  where requirement_row.public_key = lower(btrim(p_requirement_key))
    and requirement_row.status = 'active'
  for share;
  if not found then
    raise exception 'BUSINESS_EQUIPMENT_REQUIREMENT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not (v_requirement.capability_key = any(v_profile.capability_keys)) then
    raise exception 'BUSINESS_EQUIPMENT_CAPABILITY_MISMATCH' using errcode = 'P0001';
  end if;

  v_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        p_game_session_id,
        v_business.id,
        v_installation.id,
        v_requirement.id,
        p_period_key,
        p_reserved_minutes,
        lower(btrim(p_intent_ref))
      ),
      'sha256'
    ),
    'hex'
  );

  select reservation_row.*
  into v_reservation
  from public.business_equipment_reservations as reservation_row
  where reservation_row.game_session_id = p_game_session_id
    and reservation_row.business_id = v_business.id
    and reservation_row.installation_id = v_installation.id
    and reservation_row.idempotency_key = btrim(p_idempotency_key)
  for update;
  if not found then
    select reservation_row.*
    into v_reservation
    from public.business_equipment_reservations as reservation_row
    where reservation_row.game_session_id = p_game_session_id
      and reservation_row.installation_id = v_installation.id
      and reservation_row.requirement_id = v_requirement.id
      and reservation_row.period_key = p_period_key
      and reservation_row.intent_ref = lower(btrim(p_intent_ref))
    for update;
  end if;

  if found then
    if v_reservation.request_hash <> v_hash then
      raise exception 'BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select coalesce(sum(existing.reserved_minutes), 0)::integer
    into v_used_minutes
    from public.business_equipment_reservations as existing
    where existing.game_session_id = p_game_session_id
      and existing.installation_id = v_installation.id
      and existing.period_key = p_period_key
      and existing.status in ('reserved','active','consumed');
    return query select
      v_reservation.public_key,
      v_reservation.status,
      v_reservation.reserved_minutes,
      v_profile.base_capacity_minutes_per_period,
      greatest(v_profile.base_capacity_minutes_per_period - v_used_minutes, 0),
      true;
    return;
  end if;

  select coalesce(sum(existing.reserved_minutes), 0)::integer
  into v_used_minutes
  from public.business_equipment_reservations as existing
  where existing.game_session_id = p_game_session_id
    and existing.installation_id = v_installation.id
    and existing.period_key = p_period_key
    and existing.status in ('reserved','active','consumed');

  if v_used_minutes + p_reserved_minutes > v_profile.base_capacity_minutes_per_period then
    raise exception 'BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.business_equipment_reservations (
    game_session_id,
    business_id,
    installation_id,
    requirement_id,
    period_key,
    intent_ref,
    reserved_minutes,
    status,
    idempotency_key,
    request_hash
  ) values (
    p_game_session_id,
    v_business.id,
    v_installation.id,
    v_requirement.id,
    p_period_key,
    lower(btrim(p_intent_ref)),
    p_reserved_minutes,
    'reserved',
    btrim(p_idempotency_key),
    v_hash
  )
  returning * into v_reservation;

  return query select
    v_reservation.public_key,
    v_reservation.status,
    v_reservation.reserved_minutes,
    v_profile.base_capacity_minutes_per_period,
    greatest(
      v_profile.base_capacity_minutes_per_period
        - v_used_minutes
        - v_reservation.reserved_minutes,
      0
    ),
    false;
end
$function$;

revoke all on function public.reserve_business_equipment_v2(
  uuid, text, text, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_business_equipment_v2(
  uuid, text, text, text, text, integer, text, text
) to service_role;

commit;
