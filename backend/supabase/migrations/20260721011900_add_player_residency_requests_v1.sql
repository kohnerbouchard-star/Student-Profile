begin;

create or replace function public.request_player_residency_change_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_target_country_id text,
  p_expected_revision bigint,
  p_requested_at timestamptz
)
returns table (
  current_country_id text,
  currency_code text,
  eligible_country_ids jsonb,
  pending_country_id text,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_state public.player_residency_states%rowtype;
begin
  if p_game_session_id is null
    or p_player_id is null
    or p_target_country_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_requested_at is null
  then
    raise exception 'RESIDENCY_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  join public.game_sessions as game_row
    on game_row.id = player_row.game_session_id
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
    and game_row.status = 'active'
  for update of player_row;
  if not found then
    raise exception 'RESIDENCY_PLAYER_OR_GAME_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  select state_row.* into v_state
  from public.player_residency_states as state_row
  where state_row.game_session_id = p_game_session_id
    and state_row.player_id = p_player_id
  for update;
  if not found then
    raise exception 'RESIDENCY_STATE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_state.revision <> p_expected_revision then
    if v_state.pending_country_id = p_target_country_id then
      return query select
        v_state.current_country_id,
        v_state.currency_code,
        v_state.eligible_country_ids,
        v_state.pending_country_id,
        v_state.revision,
        v_state.updated_at;
      return;
    end if;
    raise exception 'RESIDENCY_REVISION_CONFLICT' using errcode = '40001';
  end if;

  if v_state.current_country_id = p_target_country_id then
    raise exception 'RESIDENCY_ALREADY_CURRENT' using errcode = 'P0001';
  end if;
  if not (v_state.eligible_country_ids @> jsonb_build_array(p_target_country_id)) then
    raise exception 'RESIDENCY_COUNTRY_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.world_country_runtime as country_row
    where country_row.game_session_id = p_game_session_id
      and country_row.country_id = p_target_country_id
  ) then
    raise exception 'RESIDENCY_COUNTRY_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.player_residency_states
  set pending_country_id = p_target_country_id,
      revision = revision + 1,
      updated_at = p_requested_at
  where id = v_state.id
  returning * into v_state;

  return query select
    v_state.current_country_id,
    v_state.currency_code,
    v_state.eligible_country_ids,
    v_state.pending_country_id,
    v_state.revision,
    v_state.updated_at;
end;
$function$;

revoke all on function public.request_player_residency_change_v1(
  uuid, uuid, text, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.request_player_residency_change_v1(
  uuid, uuid, text, bigint, timestamptz
) to service_role;

commit;
