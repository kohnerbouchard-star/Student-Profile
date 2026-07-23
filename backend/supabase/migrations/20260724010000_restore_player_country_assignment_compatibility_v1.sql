begin;

alter table public.players
  add column if not exists country_id uuid references public.country_profiles (id) on delete restrict;

comment on column public.players.country_id is
  'Compatibility mirror of the authoritative active player_country_assignments.country_profile_id. Do not use as an independent ownership authority.';

with latest_active_assignment as (
  select distinct on (assignment.game_session_id, assignment.player_id)
    assignment.game_session_id,
    assignment.player_id,
    assignment.country_profile_id
  from public.player_country_assignments as assignment
  where assignment.status = 'active'
    and assignment.ended_at is null
  order by
    assignment.game_session_id,
    assignment.player_id,
    assignment.assigned_at desc,
    assignment.created_at desc,
    assignment.id desc
)
update public.players as player_row
set country_id = assignment.country_profile_id
from latest_active_assignment as assignment
where player_row.game_session_id = assignment.game_session_id
  and player_row.id = assignment.player_id
  and player_row.country_id is distinct from assignment.country_profile_id;

create or replace function public.sync_player_country_assignment_compatibility_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_game_session_id uuid;
  v_player_id uuid;
  v_country_profile_id uuid;
begin
  v_game_session_id := case when tg_op = 'DELETE' then old.game_session_id else new.game_session_id end;
  v_player_id := case when tg_op = 'DELETE' then old.player_id else new.player_id end;

  select assignment.country_profile_id
  into v_country_profile_id
  from public.player_country_assignments as assignment
  where assignment.game_session_id = v_game_session_id
    and assignment.player_id = v_player_id
    and assignment.status = 'active'
    and assignment.ended_at is null
  order by assignment.assigned_at desc, assignment.created_at desc, assignment.id desc
  limit 1;

  update public.players as player_row
  set country_id = v_country_profile_id
  where player_row.game_session_id = v_game_session_id
    and player_row.id = v_player_id
    and player_row.country_id is distinct from v_country_profile_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_player_country_assignment_compatibility_v1()
  from public, anon, authenticated;
grant execute on function public.sync_player_country_assignment_compatibility_v1()
  to service_role;

drop trigger if exists sync_player_country_assignment_compatibility
  on public.player_country_assignments;
create trigger sync_player_country_assignment_compatibility
after insert or delete or update of country_profile_id, status, assigned_at, ended_at
on public.player_country_assignments
for each row execute function public.sync_player_country_assignment_compatibility_v1();

create or replace function public.assert_player_country_assignment_compatibility_v1(
  p_game_session_id uuid
)
returns table (
  active_assignment_count integer,
  mirrored_player_count integer,
  mismatch_count integer
)
language sql
security definer
set search_path = public, pg_temp
as $function$
  with active_assignment as (
    select distinct on (assignment.player_id)
      assignment.player_id,
      assignment.country_profile_id
    from public.player_country_assignments as assignment
    where assignment.game_session_id = p_game_session_id
      and assignment.status = 'active'
      and assignment.ended_at is null
    order by assignment.player_id, assignment.assigned_at desc, assignment.created_at desc, assignment.id desc
  )
  select
    count(*)::integer,
    count(*) filter (where player_row.country_id is not null)::integer,
    count(*) filter (where player_row.country_id is distinct from assignment.country_profile_id)::integer
  from active_assignment as assignment
  join public.players as player_row
    on player_row.game_session_id = p_game_session_id
   and player_row.id = assignment.player_id;
$function$;

revoke all on function public.assert_player_country_assignment_compatibility_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.assert_player_country_assignment_compatibility_v1(uuid)
  to service_role;

commit;
