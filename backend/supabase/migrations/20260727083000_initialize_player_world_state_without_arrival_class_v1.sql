begin;

-- Player travel and residency are country-scoped runtime state. They must not
-- depend on the optional Arrival Class questionnaire or grant pipeline.
create or replace function public.initialize_player_world_state_from_country_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_country public.world_country_runtime%rowtype;
  v_eligible_country_ids jsonb;
  v_effective_at timestamptz := now();
begin
  if new.status <> 'active' or new.country_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and old.country_id is not distinct from new.country_id
  then
    return new;
  end if;

  select country_row.* into v_country
  from public.world_country_runtime as country_row
  where country_row.game_session_id = new.game_session_id
    and country_row.country_uuid = new.country_id;

  -- Legacy or partially provisioned games remain fail-closed without blocking
  -- the base Player mutation. Their World runtime can be repaired separately.
  if not found then
    return new;
  end if;

  select coalesce(
    jsonb_agg(country_row.country_id order by country_row.country_id)
      filter (where country_row.country_uuid <> new.country_id),
    '[]'::jsonb
  ) into v_eligible_country_ids
  from public.world_country_runtime as country_row
  where country_row.game_session_id = new.game_session_id;

  perform 1
  from public.initialize_player_travel_state_v1(
    new.game_session_id,
    new.id,
    v_country.arrival_location_id,
    v_effective_at
  );

  insert into public.player_residency_states (
    game_session_id,
    player_id,
    current_country_id,
    currency_code,
    eligible_country_ids,
    pending_country_id,
    revision,
    updated_at
  ) values (
    new.game_session_id,
    new.id,
    v_country.country_id,
    v_country.currency_code,
    v_eligible_country_ids,
    null,
    0,
    v_effective_at
  )
  on conflict on constraint player_residency_states_unique do update
  set
    current_country_id = excluded.current_country_id,
    currency_code = excluded.currency_code,
    eligible_country_ids = excluded.eligible_country_ids,
    pending_country_id = case
      when public.player_residency_states.current_country_id = excluded.current_country_id
      then public.player_residency_states.pending_country_id
      else null
    end,
    revision = case
      when public.player_residency_states.current_country_id = excluded.current_country_id
      then public.player_residency_states.revision
      else public.player_residency_states.revision + 1
    end,
    updated_at = excluded.updated_at;

  return new;
end;
$function$;

revoke all on function public.initialize_player_world_state_from_country_v1()
  from public, anon, authenticated;
grant execute on function public.initialize_player_world_state_from_country_v1()
  to service_role;

drop trigger if exists initialize_player_world_state_from_country
  on public.players;
create trigger initialize_player_world_state_from_country
after insert or update of status, country_id on public.players
for each row
when (new.status = 'active')
execute function public.initialize_player_world_state_from_country_v1();

-- Repair active Players created before this trigger existed, but do not alter
-- already-initialized travel or residency state.
insert into public.player_travel_states (
  game_session_id,
  player_id,
  current_location_id,
  status,
  revision,
  created_at,
  updated_at
)
select
  player_row.game_session_id,
  player_row.id,
  country_row.arrival_location_id,
  'available',
  0,
  now(),
  now()
from public.players as player_row
join public.world_country_runtime as country_row
  on country_row.game_session_id = player_row.game_session_id
 and country_row.country_uuid = player_row.country_id
join public.game_sessions as game_row
  on game_row.id = player_row.game_session_id
where player_row.status = 'active'
  and game_row.status = 'active'
on conflict on constraint player_travel_states_scope_unique do nothing;

insert into public.player_residency_states (
  game_session_id,
  player_id,
  current_country_id,
  currency_code,
  eligible_country_ids,
  pending_country_id,
  revision,
  updated_at
)
select
  player_row.game_session_id,
  player_row.id,
  country_row.country_id,
  country_row.currency_code,
  coalesce(eligible.country_ids, '[]'::jsonb),
  null,
  0,
  now()
from public.players as player_row
join public.world_country_runtime as country_row
  on country_row.game_session_id = player_row.game_session_id
 and country_row.country_uuid = player_row.country_id
join public.game_sessions as game_row
  on game_row.id = player_row.game_session_id
left join lateral (
  select jsonb_agg(other_country.country_id order by other_country.country_id) as country_ids
  from public.world_country_runtime as other_country
  where other_country.game_session_id = player_row.game_session_id
    and other_country.country_uuid <> player_row.country_id
) as eligible on true
where player_row.status = 'active'
  and game_row.status = 'active'
on conflict on constraint player_residency_states_unique do nothing;

commit;
