create or replace function public.maybe_capture_stock_market_checkpoint_v3(p_game_session_id uuid, p_interval_ticks integer default 60)
returns table(captured boolean, checkpoint_id uuid, tick_index integer, prior_checkpoint_tick integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_tick integer;
  v_prior_tick integer;
  v_checkpoint_id uuid;
  v_checkpoint_tick integer;
begin
  if p_interval_ticks < 1 then
    raise exception 'checkpoint interval must be positive';
  end if;

  select r.current_tick_index
    into v_current_tick
  from private.stock_market_runtime_state r
  where r.game_session_id = p_game_session_id;

  if v_current_tick is null then
    raise exception 'runtime state not found';
  end if;

  select c.tick_index
    into v_prior_tick
  from public.get_latest_valid_stock_market_checkpoint_v3(p_game_session_id, v_current_tick) c
  limit 1;

  if v_prior_tick is not null and v_current_tick - v_prior_tick < p_interval_ticks then
    return query select false, null::uuid, v_current_tick, v_prior_tick;
    return;
  end if;

  select c.checkpoint_id, c.tick_index
    into v_checkpoint_id, v_checkpoint_tick
  from public.capture_stock_market_checkpoint_v3(p_game_session_id, 'interval') c
  limit 1;

  return query select true, v_checkpoint_id, v_checkpoint_tick, v_prior_tick;
end;
$$;

revoke all on function public.maybe_capture_stock_market_checkpoint_v3(uuid,integer) from public, anon, authenticated;
grant execute on function public.maybe_capture_stock_market_checkpoint_v3(uuid,integer) to service_role;
