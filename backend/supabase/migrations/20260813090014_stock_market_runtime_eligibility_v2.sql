create index if not exists stock_market_runtime_state_due_idx
  on private.stock_market_runtime_state(runtime_mode, next_due_at, game_session_id);

create or replace function public.list_due_stock_market_games_v2(
  p_now timestamptz default clock_timestamp(),
  p_limit integer default 25
)
returns table (
  game_session_id uuid,
  engine_version text,
  simulation_seed text,
  current_tick_index integer,
  next_due_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    g.id,
    r.engine_version,
    r.simulation_seed,
    r.current_tick_index,
    r.next_due_at
  from public.game_sessions g
  join private.stock_market_runtime_state r on r.game_session_id = g.id
  where p_now is not null
    and p_limit between 1 and 100
    and g.status = 'active'
    and g.lifecycle_state = 'active'
    and g.provisioning_status = 'ready'
    and g.license_expired_at is null
    and r.runtime_mode = 'active'
    and (r.next_due_at is null or r.next_due_at <= p_now)
    and exists (
      select 1
      from public.entitlements e
      where e.game_session_id = g.id
        and e.status = 'active'
        and (e.license_expires_at is null or e.license_expires_at > p_now)
    )
  order by r.next_due_at nulls first, g.id
  limit p_limit;
$$;

revoke all on function public.list_due_stock_market_games_v2(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.list_due_stock_market_games_v2(timestamptz, integer) to service_role;

create or replace function public.set_stock_market_runtime_mode_v2(
  p_game_session_id uuid,
  p_mode text,
  p_next_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row private.stock_market_runtime_state%rowtype;
begin
  if p_game_session_id is null then raise exception 'GAME_SESSION_REQUIRED' using errcode='22023'; end if;
  if p_mode not in ('active','idle','suspended') then raise exception 'INVALID_STOCK_RUNTIME_MODE' using errcode='22023'; end if;

  update private.stock_market_runtime_state
  set runtime_mode = p_mode,
      next_due_at = case when p_mode = 'suspended' then null else p_next_due_at end,
      updated_at = clock_timestamp()
  where game_session_id = p_game_session_id
  returning * into v_row;

  if not found then raise exception 'STOCK_RUNTIME_STATE_NOT_FOUND' using errcode='P0001'; end if;

  return jsonb_build_object(
    'gameSessionId', v_row.game_session_id,
    'runtimeMode', v_row.runtime_mode,
    'nextDueAt', v_row.next_due_at,
    'currentTickIndex', v_row.current_tick_index,
    'engineVersion', v_row.engine_version
  );
end;
$$;

revoke all on function public.set_stock_market_runtime_mode_v2(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_stock_market_runtime_mode_v2(uuid, text, timestamptz) to service_role;

comment on function public.list_due_stock_market_games_v2(timestamptz, integer) is
  'Returns only licensed, active, provisioned Stock Runtime V2 games that are due for work. Intended as the scheduler discovery contract.';
