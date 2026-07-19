-- Make stock-market timezone a persisted game setting. No browser or device
-- timezone is consulted. Missing or invalid values fall back to Asia/Seoul.

update public.game_settings
set stock_market_window = jsonb_set(
  case
    when jsonb_typeof(stock_market_window) = 'object' then stock_market_window
    else '{}'::jsonb
  end,
  '{timezone}',
  to_jsonb('Asia/Seoul'::text),
  true
)
where jsonb_typeof(stock_market_window) <> 'object'
   or nullif(btrim(stock_market_window ->> 'timezone'), '') is null;

create or replace function public.resolve_stock_market_timezone(
  p_game_session_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidate text;
  v_seoul_fallback constant text := 'Asia/Seoul';
begin
  if p_game_session_id is not null then
    select nullif(btrim(settings.stock_market_window ->> 'timezone'), '')
    into v_candidate
    from public.game_settings settings
    where settings.game_session_id = p_game_session_id;
  end if;

  if v_candidate is not null and exists (
    select 1
    from pg_catalog.pg_timezone_names zone
    where zone.name = v_candidate
  ) then
    return v_candidate;
  end if;

  return v_seoul_fallback;
end;
$$;

comment on function public.resolve_stock_market_timezone(uuid) is
  'Resolves game_settings.stock_market_window.timezone and falls back only to Asia/Seoul. Device timezone is never consulted.';

revoke all on function public.resolve_stock_market_timezone(uuid)
from public, anon, authenticated;
grant execute on function public.resolve_stock_market_timezone(uuid)
to service_role;

-- Remove the initial one-argument calendar function so all runtime callers must
-- provide the game session whose persisted timezone controls evaluation.
drop function if exists public.is_stock_market_open_at(timestamptz);

create or replace function public.is_stock_market_open_at(
  p_game_session_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_local timestamp without time zone;
  v_iso_day integer;
  v_local_time time without time zone;
begin
  if p_game_session_id is null or p_at is null then
    return false;
  end if;

  v_timezone := public.resolve_stock_market_timezone(p_game_session_id);
  v_local := p_at at time zone v_timezone;
  v_iso_day := extract(isodow from v_local)::integer;
  v_local_time := v_local::time;

  return v_iso_day between 1 and 5
    and v_local_time >= time '08:00'
    and v_local_time < time '17:00';
end;
$$;

comment on function public.is_stock_market_open_at(uuid, timestamptz) is
  'Authoritative stock-session decision using the persisted game timezone with Asia/Seoul fallback.';

revoke all on function public.is_stock_market_open_at(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.is_stock_market_open_at(uuid, timestamptz)
to service_role;

create or replace function public.execute_stock_market_order_calendar_gated(
  p_game_session_id uuid,
  p_player_session_id uuid,
  p_stock_asset_id uuid,
  p_side text,
  p_quantity numeric,
  p_idempotency_key text
)
returns table (
  order_id uuid,
  game_session_id uuid,
  player_session_id uuid,
  player_id uuid,
  stock_asset_id uuid,
  ticker text,
  side text,
  quantity numeric,
  execution_price numeric,
  gross_value numeric,
  status text,
  rejection_reason text,
  cash_balance numeric,
  cash_currency_code text,
  holding_quantity numeric,
  average_cost numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.stock_orders existing_order
    where existing_order.game_session_id = p_game_session_id
      and existing_order.player_session_id = p_player_session_id
      and existing_order.idempotency_key = btrim(coalesce(p_idempotency_key, ''))
  ) and not public.is_stock_market_open_at(p_game_session_id, now()) then
    raise exception 'STOCK_TRADING_MARKET_CLOSED';
  end if;

  return query
  select result.*
  from public.execute_stock_market_order(
    p_game_session_id,
    p_player_session_id,
    p_stock_asset_id,
    p_side,
    p_quantity,
    p_idempotency_key
  ) result;
end;
$$;

comment on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) is
  'Rejects new immediate fills using the persisted game timezone with Asia/Seoul fallback while preserving stored idempotent replay.';

revoke all on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) from public, anon, authenticated;
grant execute on function public.execute_stock_market_order_calendar_gated(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) to service_role;
