do $migration$
declare
  v_sql text;
  v_needle text := $needle$    long_run_volatility = asset_update.long_run_volatility,
    recent_returns = asset_update.recent_returns,
    chart_history = asset_update.chart_history$needle$;
  v_replacement text := $replacement$    long_run_volatility = asset_update.long_run_volatility,
    recent_returns = asset_update.recent_returns$replacement$;
begin
  select pg_get_functiondef(p.oid)
    into v_sql
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'apply_stock_market_runner_tick'
    and pg_get_function_identity_arguments(p.oid) =
      'p_game_session_id uuid, p_tick_index integer, p_asset_updates jsonb, p_tick_rows jsonb';

  if v_sql is null then
    raise exception 'apply_stock_market_runner_tick definition not found';
  end if;

  if position('chart_history = asset_update.chart_history' in v_sql) > 0 then
    if position(v_needle in v_sql) = 0 then
      raise exception 'apply_stock_market_runner_tick chart-history update boundary did not match reviewed definition';
    end if;
    execute replace(v_sql, v_needle, v_replacement);
  end if;

  select pg_get_functiondef(p.oid)
    into v_sql
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'apply_stock_market_runner_tick'
    and pg_get_function_identity_arguments(p.oid) =
      'p_game_session_id uuid, p_tick_index integer, p_asset_updates jsonb, p_tick_rows jsonb';

  if position('chart_history = asset_update.chart_history' in v_sql) > 0 then
    raise exception 'stock runtime chart-history rewrite was not removed';
  end if;
  if position('recent_returns = asset_update.recent_returns' in v_sql) = 0 then
    raise exception 'stock runtime recent-return persistence was altered unexpectedly';
  end if;
  if position('maybe_capture_stock_market_checkpoint_v3' in v_sql) = 0 then
    raise exception 'stock checkpoint capture hook was altered unexpectedly';
  end if;
end;
$migration$;

comment on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb) is
  'Atomically persists one complete stock-market tick, including all price-driving asset state and raw authoritative tick rows, without rewriting the legacy chart_history presentation cache. V3 checkpoint capture remains attached after persistence counts match.';
