create or replace function public.get_current_stock_market_tick_index_v2(p_game_session_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select greatest(
    coalesce((select r.current_tick_index from private.stock_market_runtime_state r where r.game_session_id = p_game_session_id), 0),
    coalesce((select s.last_archived_tick_index from private.stock_tick_archive_state s where s.game_session_id = p_game_session_id), 0),
    coalesce((select t.tick_index from public.stock_price_ticks t where t.game_session_id = p_game_session_id order by t.tick_index desc limit 1), 0)
  )::integer;
$function$;

revoke all on function public.get_current_stock_market_tick_index_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_current_stock_market_tick_index_v2(uuid) to service_role;

create or replace function public.read_latest_stock_market_ticks_for_game(
  p_game_session_id uuid,
  p_ticker text default null
)
returns table(
  game_session_id uuid,
  stock_asset_id uuid,
  tick_index integer,
  ticker text,
  price numeric,
  previous_price numeric,
  change_pct numeric,
  volume bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  with resolved_tick as (
    select coalesce(
      (
        select r.current_tick_index
        from private.stock_market_runtime_state r
        where r.game_session_id = p_game_session_id
          and exists (
            select 1 from public.stock_price_ticks current_tick
            where current_tick.game_session_id = p_game_session_id
              and current_tick.tick_index = r.current_tick_index
          )
      ),
      (
        select fallback.tick_index
        from public.stock_price_ticks fallback
        where fallback.game_session_id = p_game_session_id
        order by fallback.tick_index desc
        limit 1
      )
    )::integer as tick_index
  )
  select
    tick.game_session_id,
    tick.stock_asset_id,
    tick.tick_index,
    tick.ticker,
    tick.price,
    tick.previous_price,
    tick.change_pct,
    tick.volume,
    tick.created_at
  from resolved_tick resolved
  join public.stock_price_ticks tick
    on tick.game_session_id = p_game_session_id
   and tick.tick_index = resolved.tick_index
  join public.game_session_stock_assets asset
    on asset.game_session_id = tick.game_session_id
   and asset.id = tick.stock_asset_id
   and asset.is_active = true
  where p_ticker is null or lower(asset.ticker) = lower(btrim(p_ticker))
  order by tick.stock_asset_id;
$function$;

revoke all on function public.read_latest_stock_market_ticks_for_game(uuid,text) from public, anon, authenticated;
grant execute on function public.read_latest_stock_market_ticks_for_game(uuid,text) to service_role;

create or replace function public.read_stock_market_history_v2(
  p_game_session_id uuid,
  p_stock_asset_id uuid default null,
  p_ticker text default null,
  p_limit integer default 200
)
returns table(
  game_session_id uuid,
  stock_asset_id uuid,
  tick_index integer,
  ticker text,
  price numeric,
  previous_price numeric,
  change_pct numeric,
  volume bigint,
  created_at timestamptz,
  source_kind text,
  timeframe text,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  first_tick_index integer,
  last_tick_index integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_limit integer;
  v_asset_id uuid;
  v_ticker text;
begin
  if p_game_session_id is null then raise exception 'STOCK_HISTORY_GAME_SESSION_REQUIRED'; end if;
  if p_stock_asset_id is null and nullif(btrim(coalesce(p_ticker, '')), '') is null then
    raise exception 'STOCK_HISTORY_ASSET_REQUIRED';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 200), 1000));

  select asset.id, asset.ticker into v_asset_id, v_ticker
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id
    and asset.is_active = true
    and (p_stock_asset_id is null or asset.id = p_stock_asset_id)
    and (p_ticker is null or lower(asset.ticker) = lower(btrim(p_ticker)))
  order by asset.id
  limit 1;

  if v_asset_id is null then return; end if;

  return query
  with hot as materialized (
    select
      tick.game_session_id,
      tick.stock_asset_id,
      tick.tick_index,
      tick.ticker,
      tick.price,
      tick.previous_price,
      tick.change_pct,
      tick.volume,
      tick.created_at,
      'tick'::text as source_kind,
      'tick'::text as timeframe,
      tick.previous_price as open,
      greatest(tick.previous_price, tick.price) as high,
      least(tick.previous_price, tick.price) as low,
      tick.price as close,
      tick.tick_index as first_tick_index,
      tick.tick_index as last_tick_index
    from public.stock_price_ticks tick
    where tick.game_session_id = p_game_session_id
      and tick.stock_asset_id = v_asset_id
    order by tick.tick_index desc, tick.created_at desc
    limit v_limit
  ),
  hot_meta as (
    select count(*)::integer as point_count, min(h.tick_index)::integer as min_tick_index from hot h
  ),
  cold as (
    select
      candle.game_session_id,
      candle.stock_asset_id,
      candle.last_tick_index::integer as tick_index,
      v_ticker::text as ticker,
      candle.close::numeric as price,
      candle.open::numeric as previous_price,
      case when candle.open is null or candle.open = 0 then 0::numeric
        else round(((candle.close - candle.open) / candle.open) * 100, 6) end as change_pct,
      candle.volume::bigint as volume,
      candle.bucket_start as created_at,
      'candle'::text as source_kind,
      candle.timeframe::text as timeframe,
      candle.open::numeric as open,
      candle.high::numeric as high,
      candle.low::numeric as low,
      candle.close::numeric as close,
      candle.first_tick_index::integer as first_tick_index,
      candle.last_tick_index::integer as last_tick_index
    from public.stock_price_candles candle
    cross join hot_meta meta
    where candle.game_session_id = p_game_session_id
      and candle.stock_asset_id = v_asset_id
      and candle.timeframe = '5m'
      and (meta.min_tick_index is null or candle.last_tick_index < meta.min_tick_index)
    order by candle.last_tick_index desc, candle.bucket_start desc
    limit greatest(v_limit - (select point_count from hot_meta), 0)
  ),
  combined as (
    select * from hot
    union all
    select * from cold
  )
  select
    combined.game_session_id,
    combined.stock_asset_id,
    combined.tick_index,
    combined.ticker,
    combined.price,
    combined.previous_price,
    combined.change_pct,
    combined.volume,
    combined.created_at,
    combined.source_kind,
    combined.timeframe,
    combined.open,
    combined.high,
    combined.low,
    combined.close,
    combined.first_tick_index,
    combined.last_tick_index
  from combined
  order by combined.tick_index desc, combined.created_at desc
  limit v_limit;
end;
$function$;

revoke all on function public.read_stock_market_history_v2(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.read_stock_market_history_v2(uuid,uuid,text,integer) to service_role;

comment on function public.get_current_stock_market_tick_index_v2(uuid) is
  'Returns the authoritative current Stock Runtime V2 tick using the runtime cursor, cold-archive cursor, and hot-tick fallback.';
comment on function public.read_latest_stock_market_ticks_for_game(uuid,text) is
  'Reads the authoritative latest hot tick set with one runtime-cursor resolution and one bounded game/tick range scan.';
comment on function public.read_stock_market_history_v2(uuid,uuid,text,integer) is
  'Returns authoritative stock history from hot raw ticks and verified 5-minute candles for older ranges without interpolation.';
