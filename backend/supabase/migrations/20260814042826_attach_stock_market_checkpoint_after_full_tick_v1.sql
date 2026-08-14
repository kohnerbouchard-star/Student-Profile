do $migration$
declare
  v_sql text;
  v_needle text := $needle$  if assets_updated <> v_asset_update_count or ticks_inserted <> v_tick_row_count then
    raise exception 'STOCK_RUNNER_PERSISTENCE_COUNT_MISMATCH';
  end if;

  return next;$needle$;
  v_replacement text := $replacement$  if assets_updated <> v_asset_update_count or ticks_inserted <> v_tick_row_count then
    raise exception 'STOCK_RUNNER_PERSISTENCE_COUNT_MISMATCH';
  end if;

  perform public.maybe_capture_stock_market_checkpoint_v3(
    p_game_session_id,
    60
  );

  return next;$replacement$;
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

  if position('maybe_capture_stock_market_checkpoint_v3' in v_sql) = 0 then
    if position(v_needle in v_sql) = 0 then
      raise exception 'apply_stock_market_runner_tick completion boundary did not match reviewed definition';
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

  if position('perform public.maybe_capture_stock_market_checkpoint_v3' in v_sql) = 0 then
    raise exception 'stock checkpoint capture hook was not installed';
  end if;
end;
$migration$;

comment on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb) is
  'Atomically persists one complete stock-market tick and, only after persistence counts match, evaluates the service-only V3 60-tick checkpoint interval against the cursor advanced by the stock tick insert trigger.';
