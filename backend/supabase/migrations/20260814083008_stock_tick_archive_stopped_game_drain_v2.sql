create or replace function public.prepare_next_stock_tick_archive(p_game_session_id uuid)
returns table(
  game_session_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  min_tick_index integer,
  max_tick_index integer,
  row_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_first_tick integer;
  v_first_at timestamptz;
  v_latest_tick integer;
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_min_tick integer;
  v_max_tick integer;
  v_row_count bigint;
  v_next_at timestamptz;
  v_hot_retention interval;
  v_runtime_mode text;
  v_game_status text;
  v_lifecycle_state text;
  v_can_drain_latest boolean := false;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_ARCHIVE_GAME_SESSION_REQUIRED';
  end if;

  select gs.status, gs.lifecycle_state, r.runtime_mode
  into v_game_status, v_lifecycle_state, v_runtime_mode
  from public.game_sessions gs
  left join private.stock_market_runtime_state r on r.game_session_id = gs.id
  where gs.id = p_game_session_id;

  v_can_drain_latest :=
    v_runtime_mode = 'suspended'
    and coalesce(v_game_status, 'active') <> 'active'
    and coalesce(v_lifecycle_state, 'active') <> 'active';

  select coalesce(s.hot_retention, interval '4 hours')
  into v_hot_retention
  from (select 1) seed
  left join private.stock_tick_archive_state s on s.game_session_id = p_game_session_id;

  select t.tick_index, t.created_at
  into v_first_tick, v_first_at
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
  order by t.tick_index asc
  limit 1;

  if v_first_tick is null then return; end if;

  select t.tick_index into v_latest_tick
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
  order by t.tick_index desc
  limit 1;

  v_range_start := date_trunc('hour', v_first_at);
  v_range_end := v_range_start + interval '1 hour';
  if v_range_end > now() - v_hot_retention then return; end if;

  select min(t.tick_index), max(t.tick_index), count(*)
  into v_min_tick, v_max_tick, v_row_count
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
    and t.tick_index between v_first_tick and v_first_tick + 120
    and t.created_at >= v_range_start
    and t.created_at < v_range_end;

  if v_row_count is null or v_row_count = 0 or v_min_tick is null or v_max_tick is null then
    raise exception 'STOCK_ARCHIVE_EMPTY_RANGE';
  end if;

  if v_latest_tick is not null and v_max_tick >= v_latest_tick and not v_can_drain_latest then
    return;
  end if;

  select t.created_at into v_next_at
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id and t.tick_index > v_max_tick
  order by t.tick_index asc
  limit 1;

  if v_next_at is not null and v_next_at < v_range_end then
    raise exception 'STOCK_ARCHIVE_TICK_RATE_EXCEEDS_SAFE_WINDOW';
  end if;

  return query
  select p_game_session_id, v_range_start, v_range_end, v_min_tick, v_max_tick, v_row_count;
end;
$function$;

revoke all on function public.prepare_next_stock_tick_archive(uuid) from public, anon, authenticated;
grant execute on function public.prepare_next_stock_tick_archive(uuid) to service_role;

create or replace function public.list_stock_tick_archive_candidates_v2()
returns table(game_session_id uuid)
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select r.game_session_id
  from private.stock_market_runtime_state r
  join public.game_sessions gs on gs.id = r.game_session_id
  left join private.stock_tick_archive_state s on s.game_session_id = r.game_session_id
  where gs.data_purge_protected is not true
    and r.current_tick_index > coalesce(s.last_archived_tick_index, 0)
  order by r.game_session_id;
$function$;

revoke all on function public.list_stock_tick_archive_candidates_v2() from public, anon, authenticated;
grant execute on function public.list_stock_tick_archive_candidates_v2() to service_role;

create or replace function public.configure_stock_tick_archive_retention_v2(p_function_url text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $function$
declare
  v_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/stock-tick-archiver$' then
    raise exception using errcode = '22023', message = 'invalid stock tick archiver URL';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'econovaria-stock-runtime-scheduler-v1'
  order by created_at desc
  limit 1;

  if v_token is null then
    raise exception 'STOCK_ARCHIVE_SCHEDULER_TOKEN_MISSING';
  end if;

  for v_job_id in select jobid from cron.job where jobname = 'econovaria-stock-tick-archive-retention-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-econovaria-scheduler-token', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'econovaria-stock-runtime-scheduler-v1'
          order by created_at desc limit 1
        )
      ),
      body := jsonb_build_object(
        'action', 'archive_next_hour',
        'gameSessionId', sessions.game_session_id::text,
        'purge', true
      ),
      timeout_milliseconds := 20000
    )
    from public.list_stock_tick_archive_candidates_v2() sessions;
  $command$, v_url);

  return cron.schedule('econovaria-stock-tick-archive-retention-v1', '*/15 * * * *', v_command);
end;
$function$;

revoke all on function public.configure_stock_tick_archive_retention_v2(text) from public, anon, authenticated;
grant execute on function public.configure_stock_tick_archive_retention_v2(text) to service_role;

comment on function public.prepare_next_stock_tick_archive(uuid) is
  'Prepares one verified hot stock-tick archive hour. The latest occupied hour is retained for operational games and may drain only when the game is non-active and Stock Runtime V2 is explicitly suspended.';
comment on function public.list_stock_tick_archive_candidates_v2() is
  'Returns Stock Runtime V2 sessions whose authoritative runtime cursor is ahead of the cold-archive cursor without scanning stock_price_ticks.';
comment on function public.configure_stock_tick_archive_retention_v2(text) is
  'Configures the environment-specific verified stock tick archive retention cron without storing project URLs or scheduler tokens in source.';
