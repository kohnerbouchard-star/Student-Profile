-- Storage/lifecycle monitoring and bounded operational history.

-- Exact duplicates of authoritative unique indexes.
drop index if exists public.inventory_holdings_marketplace_reference_scope_unique;
drop index if exists public.store_items_marketplace_reference_scope_unique;

create or replace function public.maintain_runtime_history_retention_v1(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, cron
as $$
declare
  v_deleted_cron bigint := 0;
begin
  if p_now is null then
    raise exception 'CURRENT_TIME_REQUIRED' using errcode = '22023';
  end if;

  delete from cron.job_run_details
  where end_time < p_now - interval '7 days';
  get diagnostics v_deleted_cron = row_count;

  return jsonb_build_object(
    'deletedCronHistory', v_deleted_cron,
    'cronRetentionDays', 7,
    'pgNetRetention', 'extension-managed TTL'
  );
end;
$$;

revoke all on function public.maintain_runtime_history_retention_v1(timestamptz)
  from public, anon, authenticated;
grant execute on function public.maintain_runtime_history_retention_v1(timestamptz)
  to service_role;

create or replace function public.configure_runtime_history_retention_scheduler_v1()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron
as $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'econovaria-cron-history-retention-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  return cron.schedule(
    'econovaria-cron-history-retention-v1',
    '41 3 * * *',
    'select public.maintain_runtime_history_retention_v1(clock_timestamp());'
  );
end;
$$;

revoke all on function public.configure_runtime_history_retention_scheduler_v1()
  from public, anon, authenticated;
grant execute on function public.configure_runtime_history_retention_scheduler_v1()
  to service_role;

create table if not exists private.platform_storage_health (
  environment_name text primary key
    check (environment_name in ('production', 'staging')),
  severity text not null check (severity in ('ok', 'warning', 'critical')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  checked_at timestamptz not null default clock_timestamp()
);

alter table private.platform_storage_health enable row level security;
alter table private.platform_storage_health force row level security;
revoke all on private.platform_storage_health
  from public, anon, authenticated, service_role;
grant select on private.platform_storage_health to service_role;

create or replace function public.run_platform_storage_health_check_v1(
  p_environment_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, cron, net
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_db bigint;
  v_tick_bytes bigint;
  v_tick_rows bigint;
  v_candle_bytes bigint;
  v_candle_rows bigint;
  v_archive_objects bigint;
  v_archive_rows bigint;
  v_archive_bytes bigint;
  v_archive_stuck bigint;
  v_purge_failed bigint;
  v_purge_waiting bigint;
  v_purge_due bigint;
  v_purge_stuck bigint;
  v_expired_untracked bigint;
  v_inactive_crons bigint;
  v_missing_crons bigint;
  v_recent_failed_crons bigint;
  v_cron_history_rows bigint;
  v_net_response_rows bigint;
  v_candle_timeframes jsonb;
  v_archive_statuses jsonb;
  v_purge_statuses jsonb;
  v_previous jsonb;
  v_snapshot jsonb;
  v_severity text := 'ok';
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_environment_name not in ('production', 'staging') then
    raise exception 'INVALID_HEALTH_ENVIRONMENT' using errcode = '22023';
  end if;

  select snapshot into v_previous
  from private.platform_storage_health
  where environment_name = p_environment_name;

  v_db := pg_database_size(current_database());
  v_tick_bytes := pg_total_relation_size('public.stock_price_ticks'::regclass);
  select count(*) into v_tick_rows from public.stock_price_ticks;
  v_candle_bytes := pg_total_relation_size('public.stock_price_candles'::regclass);
  select count(*) into v_candle_rows from public.stock_price_candles;

  select coalesce(jsonb_object_agg(timeframe, row_count), '{}'::jsonb)
    into v_candle_timeframes
  from (
    select timeframe, count(*) as row_count
    from public.stock_price_candles
    group by timeframe
    order by timeframe
  ) timeframe_rows;

  select
    count(*),
    coalesce(sum(row_count), 0),
    coalesce(sum(compressed_bytes), 0),
    count(*) filter (
      where status not in ('purged', 'verified')
        and created_at < v_now - interval '1 hour'
    )
  into v_archive_objects, v_archive_rows, v_archive_bytes, v_archive_stuck
  from private.stock_tick_archives;

  select coalesce(jsonb_object_agg(status, row_count), '{}'::jsonb)
    into v_archive_statuses
  from (
    select status, count(*) as row_count
    from private.stock_tick_archives
    group by status
  ) status_rows;

  select
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'awaiting_confirmation'),
    count(*) filter (
      where status = 'eligible'
        and purge_not_before is not null
        and purge_not_before <= v_now
    ),
    count(*) filter (
      where status in ('r2_deleting', 'db_deleting')
        and coalesce(last_attempt_at, created_at) < v_now - interval '30 minutes'
    )
  into v_purge_failed, v_purge_waiting, v_purge_due, v_purge_stuck
  from private.game_data_purge_requests;

  select coalesce(jsonb_object_agg(status, row_count), '{}'::jsonb)
    into v_purge_statuses
  from (
    select status, count(*) as row_count
    from private.game_data_purge_requests
    group by status
  ) purge_status_rows;

  select count(*) into v_expired_untracked
  from public.entitlements entitlement_row
  join public.game_sessions game_row on game_row.id = entitlement_row.game_session_id
  where entitlement_row.status = 'expired'
    and not game_row.data_purge_protected
    and not exists (
      select 1
      from private.game_data_purge_requests request_row
      where request_row.game_session_id = entitlement_row.game_session_id
        and request_row.status not in ('cancelled', 'failed')
    );

  select count(*) into v_inactive_crons
  from cron.job
  where jobname like 'econovaria-%'
    and not active;

  with expected(jobname) as (
    values
      ('econovaria-stock-runtime-scheduler-v1'),
      ('econovaria-stock-tick-archive-retention-v1'),
      ('econovaria-stock-candle-retention-v1'),
      ('econovaria-game-license-expiration-v1'),
      ('econovaria-game-data-purge-scheduler-v1'),
      ('econovaria-cron-history-retention-v1'),
      ('econovaria-platform-storage-health-v1')
  )
  select count(*) into v_missing_crons
  from expected
  where not exists (
    select 1
    from cron.job job_row
    where job_row.jobname = expected.jobname
      and job_row.active
  );

  select count(*) into v_recent_failed_crons
  from cron.job_run_details
  where start_time > v_now - interval '1 hour'
    and status = 'failed';
  select count(*) into v_cron_history_rows from cron.job_run_details;
  select count(*) into v_net_response_rows from net._http_response;

  if v_db >= 450 * 1024 * 1024 then
    v_severity := 'critical';
    v_reasons := v_reasons || jsonb_build_array('database >= 450 MiB');
  elsif v_db >= 350 * 1024 * 1024 then
    v_severity := 'warning';
    v_reasons := v_reasons || jsonb_build_array('database >= 350 MiB');
  end if;

  if v_tick_bytes >= 250 * 1024 * 1024 then
    v_severity := 'critical';
    v_reasons := v_reasons || jsonb_build_array('stock ticks >= 250 MiB');
  elsif v_tick_bytes >= 150 * 1024 * 1024 and v_severity = 'ok' then
    v_severity := 'warning';
    v_reasons := v_reasons || jsonb_build_array('stock ticks >= 150 MiB');
  end if;

  if v_candle_bytes >= 300 * 1024 * 1024 then
    v_severity := 'critical';
    v_reasons := v_reasons || jsonb_build_array('stock candles >= 300 MiB');
  elsif v_candle_bytes >= 200 * 1024 * 1024 and v_severity = 'ok' then
    v_severity := 'warning';
    v_reasons := v_reasons || jsonb_build_array('stock candles >= 200 MiB');
  end if;

  if v_purge_failed > 0 or v_purge_stuck > 0 then
    v_severity := 'critical';
    v_reasons := v_reasons || jsonb_build_array('game purge failed or stuck');
  end if;

  if v_severity <> 'critical' and (
    v_archive_stuck > 0
    or v_purge_waiting > 0
    or v_purge_due > 0
    or v_expired_untracked > 0
    or v_inactive_crons > 0
    or v_missing_crons > 0
    or v_recent_failed_crons > 0
  ) then
    v_severity := 'warning';
  end if;

  if v_archive_stuck > 0 then
    v_reasons := v_reasons || jsonb_build_array('stock archive pending/stuck > 1h');
  end if;
  if v_purge_waiting > 0 then
    v_reasons := v_reasons || jsonb_build_array('game purge awaiting hard confirmation');
  end if;
  if v_purge_due > 0 then
    v_reasons := v_reasons || jsonb_build_array('expired game purge eligible for review');
  end if;
  if v_expired_untracked > 0 then
    v_reasons := v_reasons || jsonb_build_array('expired entitlement missing purge request');
  end if;
  if v_inactive_crons > 0 then
    v_reasons := v_reasons || jsonb_build_array('inactive Econovaria cron');
  end if;
  if v_missing_crons > 0 then
    v_reasons := v_reasons || jsonb_build_array('required storage/lifecycle cron missing');
  end if;
  if v_recent_failed_crons > 0 then
    v_reasons := v_reasons || jsonb_build_array('cron failure in last hour');
  end if;

  v_snapshot := jsonb_build_object(
    'environment', p_environment_name,
    'severity', v_severity,
    'reasons', v_reasons,
    'checkedAt', v_now,
    'databaseBytes', v_db,
    'databaseDeltaBytes', v_db - coalesce(
      (v_previous->>'databaseBytes')::bigint,
      v_db
    ),
    'stockTicks', jsonb_build_object(
      'bytes', v_tick_bytes,
      'rows', v_tick_rows,
      'deltaBytes', v_tick_bytes - coalesce(
        (v_previous->'stockTicks'->>'bytes')::bigint,
        v_tick_bytes
      )
    ),
    'stockCandles', jsonb_build_object(
      'bytes', v_candle_bytes,
      'rows', v_candle_rows,
      'timeframes', v_candle_timeframes,
      'deltaBytes', v_candle_bytes - coalesce(
        (v_previous->'stockCandles'->>'bytes')::bigint,
        v_candle_bytes
      )
    ),
    'r2ArchiveManifest', jsonb_build_object(
      'objects', v_archive_objects,
      'rows', v_archive_rows,
      'compressedBytes', v_archive_bytes,
      'statuses', v_archive_statuses,
      'stuck', v_archive_stuck
    ),
    'licensesAndPurge', jsonb_build_object(
      'failed', v_purge_failed,
      'awaitingConfirmation', v_purge_waiting,
      'eligibleForReview', v_purge_due,
      'stuck', v_purge_stuck,
      'expiredUntracked', v_expired_untracked,
      'statuses', v_purge_statuses
    ),
    'cron', jsonb_build_object(
      'inactive', v_inactive_crons,
      'missingRequired', v_missing_crons,
      'failedLastHour', v_recent_failed_crons,
      'historyRows', v_cron_history_rows
    ),
    'pgNet', jsonb_build_object('responseRows', v_net_response_rows),
    'thresholds', jsonb_build_object(
      'databaseWarningMiB', 350,
      'databaseCriticalMiB', 450,
      'tickWarningMiB', 150,
      'tickCriticalMiB', 250,
      'candleWarningMiB', 200,
      'candleCriticalMiB', 300
    )
  );

  insert into private.platform_storage_health (
    environment_name,
    severity,
    snapshot,
    checked_at
  ) values (
    p_environment_name,
    v_severity,
    v_snapshot,
    v_now
  )
  on conflict (environment_name) do update set
    severity = excluded.severity,
    snapshot = excluded.snapshot,
    checked_at = excluded.checked_at;

  return v_snapshot;
end;
$$;

revoke all on function public.run_platform_storage_health_check_v1(text)
  from public, anon, authenticated;
grant execute on function public.run_platform_storage_health_check_v1(text)
  to service_role;

create or replace function public.get_platform_storage_health_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select coalesce(
    jsonb_agg(snapshot order by environment_name),
    '[]'::jsonb
  )
  from private.platform_storage_health;
$$;

revoke all on function public.get_platform_storage_health_v1()
  from public, anon, authenticated;
grant execute on function public.get_platform_storage_health_v1()
  to service_role;

create or replace function public.configure_platform_storage_health_scheduler_v1(
  p_environment_name text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron
as $$
declare
  v_job_id bigint;
begin
  if p_environment_name not in ('production', 'staging') then
    raise exception 'INVALID_HEALTH_ENVIRONMENT' using errcode = '22023';
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'econovaria-platform-storage-health-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  return cron.schedule(
    'econovaria-platform-storage-health-v1',
    '37 * * * *',
    format(
      'select public.run_platform_storage_health_check_v1(%L);',
      p_environment_name
    )
  );
end;
$$;

revoke all on function public.configure_platform_storage_health_scheduler_v1(text)
  from public, anon, authenticated;
grant execute on function public.configure_platform_storage_health_scheduler_v1(text)
  to service_role;
