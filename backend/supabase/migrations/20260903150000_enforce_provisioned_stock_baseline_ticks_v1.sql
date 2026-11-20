begin;

create or replace function private.ensure_provisioned_stock_baseline_ticks_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.provisioning_status <> 'ready' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.provisioning_status is not distinct from 'ready' then
    return new;
  end if;

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
    asset_row.game_session_id,
    asset_row.id,
    0,
    asset_row.ticker,
    asset_row.current_price,
    asset_row.current_price,
    0,
    0,
    0,
    asset_row.current_volatility,
    asset_row.long_run_volatility,
    jsonb_build_object(
      'kind', 'stock_market_initialization',
      'headline', 'Stock initialized',
      'summary', 'Baseline stock price tick created before the game became ready.',
      'gameSessionId', asset_row.game_session_id,
      'ticker', asset_row.ticker,
      'tickIndex', 0
    )
  from public.game_session_stock_assets as asset_row
  where asset_row.game_session_id = new.id
    and asset_row.is_active
    and not exists (
      select 1
      from public.stock_price_ticks as existing_tick
      where existing_tick.game_session_id = asset_row.game_session_id
        and existing_tick.stock_asset_id = asset_row.id
        and existing_tick.tick_index = 0
    )
  on conflict (game_session_id, stock_asset_id, tick_index) do nothing;

  if exists (
    select 1
    from public.game_session_stock_assets as asset_row
    where asset_row.game_session_id = new.id
      and asset_row.is_active
      and not exists (
        select 1
        from public.stock_price_ticks as baseline_tick
        where baseline_tick.game_session_id = asset_row.game_session_id
          and baseline_tick.stock_asset_id = asset_row.id
          and baseline_tick.tick_index = 0
      )
  ) then
    raise exception 'GAME_PROVISIONING_STOCK_TICKS_INCOMPLETE' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.ensure_provisioned_stock_baseline_ticks_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists ensure_provisioned_stock_baseline_ticks_before_ready_v1
  on public.game_sessions;
create trigger ensure_provisioned_stock_baseline_ticks_before_ready_v1
before insert or update of provisioning_status
on public.game_sessions
for each row
execute function private.ensure_provisioned_stock_baseline_ticks_v1();

comment on function private.ensure_provisioned_stock_baseline_ticks_v1() is
  'Ensures every active Stock asset has an authoritative tick_index 0 baseline before a game can transition to ready provisioning. Missing baselines are inserted transactionally and readiness fails closed if any active asset remains tickless.';

commit;
