-- Stock market seed/copy RPC V1.
-- Copies active stock templates into one game session and creates baseline tick
-- rows for newly inserted runtime assets. This is non-destructive and does not
-- add trading, portfolios, orders, fills, reservations, ledger writes,
-- schedulers, frontend routes, or classroom-api changes.

create or replace function public.initialize_stock_market_assets_for_game(
  p_game_session_id uuid,
  p_mode text default 'missing_only'
)
returns table (
  game_session_id uuid,
  templates_available integer,
  assets_before integer,
  assets_inserted integer,
  baseline_ticks_inserted integer,
  assets_after integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text := coalesce(nullif(btrim(p_mode), ''), 'missing_only');
  v_existing_tick_count integer;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_MARKET_GAME_SESSION_REQUIRED';
  end if;

  if v_mode not in ('missing_only', 'reset_empty_only') then
    raise exception 'STOCK_MARKET_UNKNOWN_SEED_COPY_MODE';
  end if;

  if not exists (
    select 1
    from public.game_sessions session
    where session.id = p_game_session_id
  ) then
    raise exception 'GAME_SESSION_NOT_FOUND';
  end if;

  select count(*) into templates_available
  from public.stock_templates template
  where template.is_active = true;

  select count(*) into assets_before
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id;

  select count(*) into v_existing_tick_count
  from public.stock_price_ticks tick
  where tick.game_session_id = p_game_session_id;

  if v_mode = 'reset_empty_only' and (assets_before > 0 or v_existing_tick_count > 0) then
    raise exception 'STOCK_MARKET_RESET_EMPTY_ONLY_CONFLICT';
  end if;

  with templates_to_copy as (
    select template.*
    from public.stock_templates template
    where template.is_active = true
      and not exists (
        select 1
        from public.game_session_stock_assets asset
        where asset.game_session_id = p_game_session_id
          and lower(asset.ticker) = lower(template.ticker)
      )
  ), inserted_assets as (
    insert into public.game_session_stock_assets (
      game_session_id,
      template_id,
      ticker,
      company_name,
      sector_key,
      country_code,
      description,
      current_price,
      previous_close,
      open_price,
      day_high,
      day_low,
      market_cap,
      shares_outstanding,
      beta,
      liquidity,
      current_volatility,
      long_run_volatility,
      fair_value_anchor,
      recent_returns,
      chart_history,
      fundamentals,
      country_exposure,
      sector_exposure,
      commodity_exposure,
      is_active
    )
    select
      p_game_session_id,
      template.id,
      template.ticker,
      template.company_name,
      template.sector_key,
      template.country_code,
      template.description,
      template.base_price,
      template.base_price,
      template.base_price,
      template.base_price,
      template.base_price,
      case
        when template.shares_outstanding is null then null
        else template.base_price * template.shares_outstanding
      end,
      template.shares_outstanding,
      template.beta,
      template.liquidity,
      template.long_run_volatility,
      template.long_run_volatility,
      template.base_price,
      '[]'::jsonb,
      '[]'::jsonb,
      template.fundamentals,
      template.country_exposure,
      template.sector_exposure,
      template.commodity_exposure,
      true
    from templates_to_copy template
    returning
      id,
      game_session_id,
      ticker,
      current_price,
      long_run_volatility
  ), inserted_ticks as (
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
      inserted_assets.game_session_id,
      inserted_assets.id,
      0,
      inserted_assets.ticker,
      inserted_assets.current_price,
      inserted_assets.current_price,
      0,
      0,
      0,
      inserted_assets.long_run_volatility,
      inserted_assets.long_run_volatility,
      jsonb_build_object(
        'kind', 'stock_market_initialization',
        'headline', 'Stock initialized',
        'summary', 'Baseline stock price tick created from the active stock template.',
        'gameSessionId', inserted_assets.game_session_id,
        'ticker', inserted_assets.ticker,
        'tickIndex', 0
      )
    from inserted_assets
    returning id
  )
  select
    (select count(*)::integer from inserted_assets),
    (select count(*)::integer from inserted_ticks)
  into assets_inserted, baseline_ticks_inserted;

  if assets_inserted <> baseline_ticks_inserted then
    raise exception 'STOCK_MARKET_SEED_COPY_COUNT_MISMATCH';
  end if;

  select count(*) into assets_after
  from public.game_session_stock_assets asset
  where asset.game_session_id = p_game_session_id;

  game_session_id := p_game_session_id;

  return next;
end;
$$;

comment on function public.initialize_stock_market_assets_for_game(uuid, text) is
  'Copies active stock templates into one game session and inserts tick_index 0 baseline stock_price_ticks for newly inserted assets. Intended for trusted service-role backend use only.';

revoke all on function public.initialize_stock_market_assets_for_game(uuid, text) from public;
grant execute on function public.initialize_stock_market_assets_for_game(uuid, text) to service_role;
