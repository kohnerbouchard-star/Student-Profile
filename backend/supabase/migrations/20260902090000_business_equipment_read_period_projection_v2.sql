-- Business V2 Phase 12: keep the Player equipment projection read-only after
-- the Phase 11 operating-period clock lease introduced lazy clock creation.
--
-- Command paths retain current_business_equipment_period_key_v2() and its
-- command-side clock initialization. This read projection must never create,
-- lock, or advance a payroll clock merely because a Player opens Business.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

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
  v_period_number bigint;
  v_period_key text;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  -- Phase 11 made current_business_payroll_period_key_v2() lazy-initializing
  -- and therefore VOLATILE. Player reads must project an existing clock only.
  -- A legacy Business with no clock is read as period 1, which is the same
  -- initial period command-side initialization will authoritatively create.
  select coalesce((
    select clock_row.current_period_number
    from public.business_payroll_clocks as clock_row
    where clock_row.game_session_id = p_game_session_id
      and clock_row.business_id = v_business.business_id
  ), 1::bigint)
  into v_period_number;

  v_period_key := 'equipment:' || v_period_number::text;

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
  'Player-safe Business equipment projection. Reads the existing operating period without initializing, locking, or advancing the payroll clock.';

commit;
