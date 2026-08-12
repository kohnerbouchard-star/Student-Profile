-- Forward-only reconciliation for verified live fixes that were applied outside
-- the production migration ledger. This migration is intentionally idempotent.

-- Keep one authoritative entitlement-duration trigger.
drop trigger if exists entitlements_apply_license_term_v1 on public.entitlements;
drop function if exists private.apply_entitlement_license_term_v1();

-- Trigger helpers and story initializers are not public RPC endpoints.
do $$
begin
  if to_regprocedure('public.activate_meridian_customs_security_intrusion_from_full_game_v1()') is not null then
    execute 'revoke all on function public.activate_meridian_customs_security_intrusion_from_full_game_v1() from public, anon, authenticated';
    execute 'grant execute on function public.activate_meridian_customs_security_intrusion_from_full_game_v1() to service_role';
  end if;

  if to_regprocedure('public.initialize_meridian_customs_security_intrusion_v1(uuid)') is not null then
    execute 'revoke all on function public.initialize_meridian_customs_security_intrusion_v1(uuid) from public, anon, authenticated';
    execute 'grant execute on function public.initialize_meridian_customs_security_intrusion_v1(uuid) to service_role';
  end if;
end;
$$;

create or replace function public.configure_game_data_purge_environment_v1(
  p_environment_name text,
  p_r2_bucket_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_control private.game_data_purge_control%rowtype;
begin
  if p_environment_name not in ('production', 'staging') then
    raise exception 'INVALID_PURGE_ENVIRONMENT' using errcode = '22023';
  end if;
  if p_r2_bucket_name is null or btrim(p_r2_bucket_name) !~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' then
    raise exception 'INVALID_PURGE_R2_BUCKET' using errcode = '22023';
  end if;

  select * into v_control
  from private.game_data_purge_control
  where singleton
  for update;

  if v_control.arm_id is not null and v_control.armed_until is not null and v_control.armed_until > v_now then
    raise exception 'GAME_DATA_PURGE_LEVER_MUST_BE_DISARMED' using errcode = 'P0001';
  end if;

  update private.game_data_purge_control
  set environment_name = p_environment_name,
      r2_bucket_name = btrim(p_r2_bucket_name),
      arm_id = null,
      armed_until = null,
      armed_by_staff_user_id = null,
      disarmed_at = v_now,
      updated_at = v_now
  where singleton;

  return jsonb_build_object(
    'environment', p_environment_name,
    'r2Bucket', btrim(p_r2_bucket_name),
    'leverArmed', false
  );
end;
$$;

revoke all on function public.configure_game_data_purge_environment_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_game_data_purge_environment_v1(text, text)
  to service_role;

create or replace function public.configure_stock_tick_archive_retention_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net
as $$
declare
  v_job_name constant text := 'econovaria-stock-tick-archive-retention-v1';
  v_token_name constant text := 'econovaria-stock-runtime-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/stock-tick-archiver$' then
    raise exception 'INVALID_STOCK_TICK_ARCHIVER_FUNCTION_URL' using errcode = '22023';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = v_token_name
  order by created_at desc
  limit 1;

  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'STOCK_RUNTIME_SCHEDULER_TOKEN_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  for v_job_id in select jobid from cron.job where jobname = v_job_name loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-econovaria-scheduler-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'econovaria-stock-runtime-scheduler-v1'
          order by created_at desc
          limit 1
        )
      ),
      body := jsonb_build_object(
        'action', 'archive_next_hour',
        'gameSessionId', sessions.game_session_id::text,
        'purge', true
      ),
      timeout_milliseconds := 20000
    )
    from (
      select distinct game_session_id
      from public.stock_price_ticks
    ) sessions;
  $command$, v_function_url);

  return cron.schedule(v_job_name, '*/15 * * * *', v_command);
end;
$$;

revoke all on function public.configure_stock_tick_archive_retention_scheduler_v1(text)
  from public, anon, authenticated;
grant execute on function public.configure_stock_tick_archive_retention_scheduler_v1(text)
  to service_role;

create or replace function public.configure_cron_history_retention_v1()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, cron
as $$
declare
  v_job_name constant text := 'econovaria-cron-history-retention-v1';
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = v_job_name loop
    perform cron.unschedule(v_job_id);
  end loop;

  return cron.schedule(
    v_job_name,
    '41 3 * * *',
    $command$delete from cron.job_run_details where end_time < clock_timestamp() - interval '7 days';$command$
  );
end;
$$;

revoke all on function public.configure_cron_history_retention_v1()
  from public, anon, authenticated;
grant execute on function public.configure_cron_history_retention_v1()
  to service_role;
