-- Close the final Phase 15 live-shaped application-schema differences without
-- rewriting historical migrations. The purge review routines installed by the
-- reconciliation tranche require these columns, while a clean replay already
-- had the request table before the CREATE TABLE IF NOT EXISTS declaration.

begin;

alter table private.game_data_purge_requests
  add column if not exists review_manifest jsonb,
  add column if not exists review_sha256 text,
  add column if not exists review_generated_at timestamptz;

-- The three-argument overload predates the bounded tick-index overload. Both
-- hosted environments retained differently formatted historical definitions,
-- so reassert the exact repository definition as a forward-only convergence.
create or replace function private.upsert_stock_price_candles(
  p_game_session_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
) returns integer
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_rows integer := 0;
  v_count integer := 0;
begin
  if p_game_session_id is null or p_range_start is null or p_range_end is null or p_range_end <= p_range_start then
    raise exception 'STOCK_CANDLE_INVALID_RANGE';
  end if;

  with frames as (
    select '5m'::text as timeframe, interval '5 minutes' as span
    union all select '1h', interval '1 hour'
    union all select '1d', interval '1 day'
  ), base as (
    select
      t.game_session_id,
      t.stock_asset_id,
      f.timeframe,
      date_bin(f.span, t.created_at, timestamptz '2000-01-01 00:00:00+00') as bucket_start,
      t.tick_index,
      t.price,
      t.volume,
      t.created_at
    from public.stock_price_ticks t
    cross join frames f
    where t.game_session_id = p_game_session_id
      and t.created_at >= p_range_start
      and t.created_at < p_range_end
  ), agg as (
    select
      game_session_id,
      stock_asset_id,
      timeframe,
      bucket_start,
      (array_agg(price order by created_at asc, tick_index asc))[1] as open,
      max(price) as high,
      min(price) as low,
      (array_agg(price order by created_at desc, tick_index desc))[1] as close,
      sum(volume)::bigint as volume,
      count(*)::integer as tick_count,
      min(tick_index)::integer as first_tick_index,
      max(tick_index)::integer as last_tick_index
    from base
    group by game_session_id, stock_asset_id, timeframe, bucket_start
  )
  insert into public.stock_price_candles (
    game_session_id, stock_asset_id, timeframe, bucket_start,
    open, high, low, close, volume, tick_count, first_tick_index, last_tick_index
  )
  select
    game_session_id, stock_asset_id, timeframe, bucket_start,
    open, high, low, close, volume, tick_count, first_tick_index, last_tick_index
  from agg
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
    updated_at = now();

  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;
  return v_rows;
end;
$$;

revoke all on function private.upsert_stock_price_candles(
  uuid, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function private.upsert_stock_price_candles(
  uuid, timestamptz, timestamptz
) to service_role;

commit;
