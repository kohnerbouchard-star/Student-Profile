-- Roll 5-minute candles into hourly/daily history and bound PostgreSQL growth.

drop index if exists public.stock_price_candles_lookup_idx;
create index if not exists stock_price_candles_retention_idx
  on public.stock_price_candles(timeframe, bucket_start);

create or replace function public.maintain_stock_candle_retention_v1(
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_daily bigint := 0;
  v_deleted_5m bigint := 0;
  v_deleted_1h bigint := 0;
begin
  if p_now is null then
    raise exception 'CURRENT_TIME_REQUIRED' using errcode = '22023';
  end if;

  with hourly as (
    select
      candle.*,
      coalesce(nullif(settings.stock_market_window->>'timezone', ''), 'UTC') as timezone_name
    from public.stock_price_candles candle
    join public.game_settings settings
      on settings.game_session_id = candle.game_session_id
    where candle.timeframe = '1h'
  ), bucketed as (
    select
      hourly.*,
      (
        date_trunc('day', hourly.bucket_start at time zone hourly.timezone_name)
        at time zone hourly.timezone_name
      ) as day_start,
      (
        date_trunc('day', p_now at time zone hourly.timezone_name)
        at time zone hourly.timezone_name
      ) as current_day_start
    from hourly
  ), aggregated as (
    select
      game_session_id,
      stock_asset_id,
      day_start,
      (array_agg(open order by bucket_start asc))[1] as open,
      max(high) as high,
      min(low) as low,
      (array_agg(close order by bucket_start desc))[1] as close,
      sum(volume)::bigint as volume,
      sum(tick_count)::integer as tick_count,
      min(first_tick_index)::integer as first_tick_index,
      max(last_tick_index)::integer as last_tick_index
    from bucketed
    where day_start < current_day_start
    group by game_session_id, stock_asset_id, day_start
  )
  insert into public.stock_price_candles (
    game_session_id, stock_asset_id, timeframe, bucket_start,
    open, high, low, close, volume, tick_count,
    first_tick_index, last_tick_index, created_at, updated_at
  )
  select
    game_session_id, stock_asset_id, '1d', day_start,
    open, high, low, close, volume, tick_count,
    first_tick_index, last_tick_index, clock_timestamp(), clock_timestamp()
  from aggregated
  on conflict (game_session_id, stock_asset_id, timeframe, bucket_start)
  do update set
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    volume = excluded.volume,
    tick_count = excluded.tick_count,
    first_tick_index = excluded.first_tick_index,
    last_tick_index = excluded.last_tick_index,
    updated_at = clock_timestamp();

  get diagnostics v_daily = row_count;

  delete from public.stock_price_candles five_minute
  where five_minute.timeframe = '5m'
    and five_minute.bucket_start < p_now - interval '48 hours'
    and exists (
      select 1
      from public.stock_price_candles hourly
      where hourly.game_session_id = five_minute.game_session_id
        and hourly.stock_asset_id = five_minute.stock_asset_id
        and hourly.timeframe = '1h'
        and hourly.bucket_start = date_trunc('hour', five_minute.bucket_start)
    );
  get diagnostics v_deleted_5m = row_count;

  delete from public.stock_price_candles hourly
  using public.game_settings settings
  where hourly.game_session_id = settings.game_session_id
    and hourly.timeframe = '1h'
    and hourly.bucket_start < p_now - interval '30 days'
    and exists (
      select 1
      from public.stock_price_candles daily
      where daily.game_session_id = hourly.game_session_id
        and daily.stock_asset_id = hourly.stock_asset_id
        and daily.timeframe = '1d'
        and daily.bucket_start = (
          date_trunc(
            'day',
            hourly.bucket_start at time zone coalesce(
              nullif(settings.stock_market_window->>'timezone', ''),
              'UTC'
            )
          ) at time zone coalesce(
            nullif(settings.stock_market_window->>'timezone', ''),
            'UTC'
          )
        )
    );
  get diagnostics v_deleted_1h = row_count;

  return jsonb_build_object(
    'dailyUpserts', v_daily,
    'deleted5m', v_deleted_5m,
    'deleted1h', v_deleted_1h,
    'retention5mHours', 48,
    'retention1hDays', 30
  );
end;
$$;

revoke all on function public.maintain_stock_candle_retention_v1(timestamptz)
  from public, anon, authenticated;
grant execute on function public.maintain_stock_candle_retention_v1(timestamptz)
  to service_role;

create or replace function public.configure_stock_candle_retention_scheduler_v1()
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
    where jobname = 'econovaria-stock-candle-retention-v1'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  return cron.schedule(
    'econovaria-stock-candle-retention-v1',
    '23 * * * *',
    'select public.maintain_stock_candle_retention_v1(clock_timestamp());'
  );
end;
$$;

revoke all on function public.configure_stock_candle_retention_scheduler_v1()
  from public, anon, authenticated;
grant execute on function public.configure_stock_candle_retention_scheduler_v1()
  to service_role;
