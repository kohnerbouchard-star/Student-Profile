-- Stock market runner apply RPC V1.
-- Persists one calculated stock market tick atomically for exactly one game
-- session. This migration intentionally does not add public policies, trading
-- tables, portfolio writes, order/fill behavior, seed data, or frontend routes.

create or replace function public.apply_stock_market_runner_tick(
  p_game_session_id uuid,
  p_tick_index integer,
  p_asset_updates jsonb,
  p_tick_rows jsonb
)
returns table (
  assets_updated integer,
  ticks_inserted integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset_update_count integer;
  v_tick_row_count integer;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_RUNNER_GAME_SESSION_REQUIRED';
  end if;

  if p_tick_index is null or p_tick_index < 0 then
    raise exception 'STOCK_RUNNER_INVALID_TICK_INDEX';
  end if;

  if p_asset_updates is null or jsonb_typeof(p_asset_updates) <> 'array' then
    raise exception 'STOCK_RUNNER_ASSET_UPDATES_ARRAY_REQUIRED';
  end if;

  if p_tick_rows is null or jsonb_typeof(p_tick_rows) <> 'array' then
    raise exception 'STOCK_RUNNER_TICK_ROWS_ARRAY_REQUIRED';
  end if;

  select count(*) into v_asset_update_count
  from jsonb_array_elements(p_asset_updates);

  select count(*) into v_tick_row_count
  from jsonb_array_elements(p_tick_rows);

  if v_asset_update_count = 0 or v_tick_row_count = 0 then
    raise exception 'STOCK_RUNNER_EMPTY_PAYLOAD';
  end if;

  if v_asset_update_count <> v_tick_row_count then
    raise exception 'STOCK_RUNNER_PAYLOAD_COUNT_MISMATCH';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_asset_updates) as asset_update(
      game_session_id uuid,
      asset_id uuid,
      current_price numeric,
      previous_close numeric,
      open_price numeric,
      day_high numeric,
      day_low numeric,
      market_cap numeric,
      current_volatility numeric,
      long_run_volatility numeric,
      recent_returns jsonb,
      chart_history jsonb
    )
    where asset_update.game_session_id is distinct from p_game_session_id
      or asset_update.asset_id is null
      or asset_update.current_price is null
      or asset_update.previous_close is null
      or asset_update.open_price is null
      or asset_update.day_high is null
      or asset_update.day_low is null
      or asset_update.market_cap is null
      or asset_update.current_volatility is null
      or asset_update.long_run_volatility is null
      or jsonb_typeof(coalesce(asset_update.recent_returns, 'null'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(asset_update.chart_history, 'null'::jsonb)) <> 'array'
  ) then
    raise exception 'STOCK_RUNNER_INVALID_ASSET_UPDATE_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tick_rows) as tick_row(
      game_session_id uuid,
      stock_asset_id uuid,
      tick_index integer,
      ticker text,
      price numeric,
      previous_price numeric,
      log_return numeric,
      change_pct numeric,
      volume bigint,
      current_volatility numeric,
      long_run_volatility numeric,
      explanation jsonb
    )
    where tick_row.game_session_id is distinct from p_game_session_id
      or tick_row.stock_asset_id is null
      or tick_row.tick_index is distinct from p_tick_index
      or tick_row.ticker is null
      or length(btrim(tick_row.ticker)) = 0
      or tick_row.price is null
      or tick_row.previous_price is null
      or tick_row.log_return is null
      or tick_row.change_pct is null
      or tick_row.volume is null
      or tick_row.current_volatility is null
      or tick_row.long_run_volatility is null
      or jsonb_typeof(coalesce(tick_row.explanation, 'null'::jsonb)) <> 'object'
  ) then
    raise exception 'STOCK_RUNNER_INVALID_TICK_ROW_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_asset_updates) as asset_update(
      game_session_id uuid,
      asset_id uuid,
      current_price numeric,
      previous_close numeric,
      open_price numeric,
      day_high numeric,
      day_low numeric,
      market_cap numeric,
      current_volatility numeric,
      long_run_volatility numeric,
      recent_returns jsonb,
      chart_history jsonb
    )
    group by asset_update.asset_id
    having count(*) > 1
  ) then
    raise exception 'STOCK_RUNNER_DUPLICATE_ASSET_UPDATES';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tick_rows) as tick_row(
      game_session_id uuid,
      stock_asset_id uuid,
      tick_index integer,
      ticker text,
      price numeric,
      previous_price numeric,
      log_return numeric,
      change_pct numeric,
      volume bigint,
      current_volatility numeric,
      long_run_volatility numeric,
      explanation jsonb
    )
    group by tick_row.stock_asset_id, tick_row.tick_index
    having count(*) > 1
  ) then
    raise exception 'STOCK_RUNNER_DUPLICATE_TICK_ROWS';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tick_rows) as tick_row(
      game_session_id uuid,
      stock_asset_id uuid,
      tick_index integer,
      ticker text,
      price numeric,
      previous_price numeric,
      log_return numeric,
      change_pct numeric,
      volume bigint,
      current_volatility numeric,
      long_run_volatility numeric,
      explanation jsonb
    )
    join public.stock_price_ticks existing_tick
      on existing_tick.game_session_id = p_game_session_id
      and existing_tick.stock_asset_id = tick_row.stock_asset_id
      and existing_tick.tick_index = p_tick_index
  ) then
    raise exception 'STOCK_TICK_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_asset_updates) as asset_update(
      game_session_id uuid,
      asset_id uuid,
      current_price numeric,
      previous_close numeric,
      open_price numeric,
      day_high numeric,
      day_low numeric,
      market_cap numeric,
      current_volatility numeric,
      long_run_volatility numeric,
      recent_returns jsonb,
      chart_history jsonb
    )
    left join public.game_session_stock_assets asset
      on asset.game_session_id = p_game_session_id
      and asset.id = asset_update.asset_id
    where asset.id is null
  ) then
    raise exception 'STOCK_RUNNER_ASSET_UPDATE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_tick_rows) as tick_row(
      game_session_id uuid,
      stock_asset_id uuid,
      tick_index integer,
      ticker text,
      price numeric,
      previous_price numeric,
      log_return numeric,
      change_pct numeric,
      volume bigint,
      current_volatility numeric,
      long_run_volatility numeric,
      explanation jsonb
    )
    left join public.game_session_stock_assets asset
      on asset.game_session_id = p_game_session_id
      and asset.id = tick_row.stock_asset_id
    where asset.id is null
  ) then
    raise exception 'STOCK_RUNNER_TICK_ASSET_NOT_FOUND';
  end if;

  update public.game_session_stock_assets asset
  set
    current_price = asset_update.current_price,
    previous_close = asset_update.previous_close,
    open_price = asset_update.open_price,
    day_high = asset_update.day_high,
    day_low = asset_update.day_low,
    market_cap = asset_update.market_cap,
    current_volatility = asset_update.current_volatility,
    long_run_volatility = asset_update.long_run_volatility,
    recent_returns = asset_update.recent_returns,
    chart_history = asset_update.chart_history
  from jsonb_to_recordset(p_asset_updates) as asset_update(
    game_session_id uuid,
    asset_id uuid,
    current_price numeric,
    previous_close numeric,
    open_price numeric,
    day_high numeric,
    day_low numeric,
    market_cap numeric,
    current_volatility numeric,
    long_run_volatility numeric,
    recent_returns jsonb,
    chart_history jsonb
  )
  where asset.game_session_id = p_game_session_id
    and asset.id = asset_update.asset_id;

  get diagnostics assets_updated = row_count;

  insert into public.stock_price_ticks (
    game_session_id,
    stock_asset_id,
    tick_index,
    ticker,
    price,
    previous_price,
    log_return,
    change_pct,
    volume,
    current_volatility,
    long_run_volatility,
    explanation
  )
  select
    tick_row.game_session_id,
    tick_row.stock_asset_id,
    tick_row.tick_index,
    tick_row.ticker,
    tick_row.price,
    tick_row.previous_price,
    tick_row.log_return,
    tick_row.change_pct,
    tick_row.volume,
    tick_row.current_volatility,
    tick_row.long_run_volatility,
    tick_row.explanation
  from jsonb_to_recordset(p_tick_rows) as tick_row(
    game_session_id uuid,
    stock_asset_id uuid,
    tick_index integer,
    ticker text,
    price numeric,
    previous_price numeric,
    log_return numeric,
    change_pct numeric,
    volume bigint,
    current_volatility numeric,
    long_run_volatility numeric,
    explanation jsonb
  );

  get diagnostics ticks_inserted = row_count;

  if assets_updated <> v_asset_update_count or ticks_inserted <> v_tick_row_count then
    raise exception 'STOCK_RUNNER_PERSISTENCE_COUNT_MISMATCH';
  end if;

  return next;
end;
$$;

comment on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb) is
  'Atomically applies one backend stock market runner tick for exactly one game session. Intended for service-role Edge Function use only.';

revoke all on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb) from public;
grant execute on function public.apply_stock_market_runner_tick(uuid, integer, jsonb, jsonb) to service_role;
