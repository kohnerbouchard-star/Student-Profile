do $$
declare
  v_sql text;
begin
  select pg_get_functiondef(p.oid) into v_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='capture_stock_market_checkpoint_v3'
    and pg_get_function_identity_arguments(p.oid)='p_game_session_id uuid, p_checkpoint_kind text';

  if v_sql is null then
    raise exception 'capture_stock_market_checkpoint_v3 not found';
  end if;

  v_sql := replace(
    v_sql,
    'on conflict (game_session_id,config_hash) do nothing',
    'on conflict on constraint stock_market_simulation_configs_game_session_id_config_hash_key do nothing'
  );
  execute v_sql;
end $$;
