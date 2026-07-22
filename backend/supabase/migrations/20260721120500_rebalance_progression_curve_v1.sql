begin;

create or replace function public.progression_level_threshold_v1(p_level integer)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case p_level
    when 1 then 0
    when 2 then 150
    when 3 then 375
    when 4 then 675
    when 5 then 1050
    when 6 then 1500
    when 7 then 2025
    when 8 then 2625
    when 9 then 3300
    when 10 then 4050
    when 11 then 4875
    when 12 then 5775
    when 13 then 6750
    when 14 then 7800
    when 15 then 8925
    when 16 then 10125
    when 17 then 11400
    when 18 then 12750
    when 19 then 14175
    when 20 then 15675
    else 15675
  end::bigint;
$$;

comment on function public.progression_level_threshold_v1(integer) is
  'Bounded level curve with linearly increasing XP increments. Level 20 requires 15,675 XP; the curve is intentionally non-exponential and does not alter economic rewards.';

create or replace function public.enforce_progression_admin_correction_game_active_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lifecycle_state text;
  v_operational_status text;
begin
  select lifecycle_state, status
  into v_lifecycle_state, v_operational_status
  from public.game_sessions
  where id = new.game_session_id
  for share;

  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lifecycle_state = 'paused' then
    raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
  end if;
  if v_lifecycle_state in ('ended', 'archived') or v_operational_status = 'archived' then
    raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_lifecycle_state <> 'active' or v_operational_status <> 'active' then
    raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_progression_admin_correction_game_active_v1
on public.progression_admin_corrections;

create trigger enforce_progression_admin_correction_game_active_v1
before insert on public.progression_admin_corrections
for each row execute function public.enforce_progression_admin_correction_game_active_v1();

revoke all on function public.enforce_progression_admin_correction_game_active_v1()
from public, anon, authenticated;

comment on function public.enforce_progression_admin_correction_game_active_v1() is
  'Serializes Progression corrections with game lifecycle transitions. New corrections require an active game; committed idempotent replays remain available because they do not insert new audit rows.';

create or replace function public.read_admin_progression_corrections_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_player_identifier text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_game_session_id is null or p_staff_user_id is null
    or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset not between 0 and 10000
    or (
      p_player_identifier is not null
      and (
        length(btrim(p_player_identifier)) not between 1 and 160
        or btrim(p_player_identifier) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
      )
    )
  then
    raise exception 'PROGRESSION_ADMIN_READ_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions
    where id = p_game_session_id
      and owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'PROGRESSION_ADMIN_SCOPE_FORBIDDEN' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', correction_row.public_correction_id,
        'playerId', correction_row.player_identifier,
        'displayName', correction_row.display_name,
        'correctionType', correction_row.correction_type,
        'amount', correction_row.amount,
        'reputationType', correction_row.reputation_type,
        'reputationScope', correction_row.reputation_scope,
        'reason', correction_row.reason,
        'beforeValue', correction_row.before_value,
        'afterValue', correction_row.after_value,
        'createdAt', correction_row.created_at
      ) order by correction_row.created_at desc, correction_row.public_correction_id)
      from (
        select
          correction.public_correction_id,
          player_row.player_identifier,
          player_row.display_name,
          correction.correction_type,
          correction.amount,
          correction.reputation_type,
          correction.reputation_scope,
          correction.reason,
          correction.before_value,
          correction.after_value,
          correction.created_at
        from public.progression_admin_corrections as correction
        join public.players as player_row
          on player_row.game_session_id = correction.game_session_id
          and player_row.id = correction.player_id
        where correction.game_session_id = p_game_session_id
          and (
            p_player_identifier is null
            or player_row.player_identifier_normalized = lower(btrim(p_player_identifier))
          )
        order by correction.created_at desc, correction.public_correction_id
        limit p_limit offset p_offset
      ) as correction_row
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'limit', p_limit,
      'offset', p_offset,
      'playerId', p_player_identifier
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.read_admin_progression_corrections_v1(uuid,uuid,text,integer,integer)
from public, anon, authenticated;
grant execute on function public.read_admin_progression_corrections_v1(uuid,uuid,text,integer,integer)
to service_role;

comment on function public.read_admin_progression_corrections_v1(uuid,uuid,text,integer,integer) is
  'Owner-scoped bounded read of immutable Progression correction history. Returns public Player and correction identifiers only; staff UUIDs and idempotency keys remain private.';

commit;
