-- Require one explicit game-level timezone for every stock exchange.
-- Existing rows receive a one-time Asia/Seoul migration value. Runtime contains
-- no fallback and never reads a browser or device timezone.

update public.game_settings
set stock_market_window = jsonb_set(
  coalesce(stock_market_window, '{}'::jsonb),
  '{timezone}',
  to_jsonb('Asia/Seoul'::text),
  true
)
where nullif(btrim(stock_market_window ->> 'timezone'), '') is null;

do $
begin
  if exists (
    select 1
    from public.game_settings settings
    where not exists (
      select 1
      from pg_timezone_names zone
      where zone.name = btrim(settings.stock_market_window ->> 'timezone')
    )
  ) then
    raise exception 'STOCK_MARKET_EXISTING_TIMEZONE_INVALID';
  end if;
end;
$;

create or replace function public.validate_required_stock_market_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  if jsonb_typeof(new.stock_market_window) <> 'object' then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  v_timezone := nullif(btrim(new.stock_market_window ->> 'timezone'), '');

  if v_timezone is null then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  if not exists (
    select 1
    from pg_timezone_names zone
    where zone.name = v_timezone
  ) then
    raise exception 'STOCK_MARKET_TIMEZONE_INVALID';
  end if;

  new.stock_market_window := jsonb_set(
    new.stock_market_window,
    '{timezone}',
    to_jsonb(v_timezone),
    true
  );

  return new;
end;
$$;

drop trigger if exists validate_required_stock_market_timezone
on public.game_settings;

create trigger validate_required_stock_market_timezone
before insert or update of stock_market_window
on public.game_settings
for each row
execute function public.validate_required_stock_market_timezone();

create or replace function public.stock_market_timezone_for_game(
  p_game_session_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
begin
  select nullif(btrim(settings.stock_market_window ->> 'timezone'), '')
  into v_timezone
  from public.game_settings settings
  where settings.game_session_id = p_game_session_id;

  if v_timezone is null then
    raise exception 'STOCK_MARKET_TIMEZONE_REQUIRED';
  end if;

  if not exists (
    select 1
    from pg_timezone_names zone
    where zone.name = v_timezone
  ) then
    raise exception 'STOCK_MARKET_TIMEZONE_INVALID';
  end if;

  return v_timezone;
end;
$$;

revoke all on function public.stock_market_timezone_for_game(uuid)
from public, anon, authenticated;
grant execute on function public.stock_market_timezone_for_game(uuid)
to service_role;

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

  if not exists (
    select 1
    from public.game_sessions game_session
    where game_session.id = p_game_session_id
      and game_session.status = 'active'
  ) then
    return false;
  end if;

  v_timezone := public.stock_market_timezone_for_game(p_game_session_id);
  v_local := p_at at time zone v_timezone;
  v_iso_day := extract(isodow from v_local)::integer;
  v_local_time := v_local::time;

  return v_iso_day between 1 and 5
    and v_local_time >= time '08:00'
    and v_local_time < time '17:00';
end;
$$;

comment on function public.is_stock_market_open_at(uuid, timestamptz) is
  'Authoritative game-scoped market-session decision. One required game timezone applies to every exchange.';

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
