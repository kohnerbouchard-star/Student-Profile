-- Add canonical UTC market-minute identity without replacing sequential gameplay
-- tick indexes. Legacy rows remain readable with null market-minute metadata.

alter table public.stock_price_ticks
  add column if not exists exchange_code text null,
  add column if not exists market_minute timestamptz null;

alter table public.stock_price_ticks
  drop constraint if exists stock_price_ticks_exchange_code_check;

alter table public.stock_price_ticks
  add constraint stock_price_ticks_exchange_code_check
  check (
    exchange_code is null
    or exchange_code in (
      'FGX', 'SBX', 'DHM', 'AUX', 'CMX',
      'GFX', 'SCX', 'ECX', 'IHX', 'BDX'
    )
  );

alter table public.stock_price_ticks
  drop constraint if exists stock_price_ticks_market_minute_boundary_check;

alter table public.stock_price_ticks
  add constraint stock_price_ticks_market_minute_boundary_check
  check (
    market_minute is null
    or market_minute = date_trunc('minute', market_minute)
  );

create unique index if not exists stock_price_ticks_market_minute_unique_idx
on public.stock_price_ticks (
  game_session_id,
  stock_asset_id,
  exchange_code,
  market_minute
)
where exchange_code is not null and market_minute is not null;

create index if not exists stock_price_ticks_market_minute_lookup_idx
on public.stock_price_ticks (
  game_session_id,
  exchange_code,
  market_minute desc
)
where exchange_code is not null and market_minute is not null;

comment on column public.stock_price_ticks.exchange_code is
  'Versioned fictional exchange code used for authoritative market-session evaluation.';
comment on column public.stock_price_ticks.market_minute is
  'Canonical UTC minute represented by this price row. Sequential tick_index remains the gameplay/event sequence.';

create or replace function public.apply_stock_market_runner_minute(
  p_game_session_id uuid,
  p_tick_index integer,
  p_exchange_code text,
  p_market_minute timestamptz,
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
  v_exchange_code text;
  v_market_minute timestamptz;
  v_apply record;
  v_tagged_count integer;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_RUNNER_GAME_SESSION_REQUIRED';
  end if;

  v_exchange_code := upper(btrim(coalesce(p_exchange_code, '')));
  if v_exchange_code not in (
    'FGX', 'SBX', 'DHM', 'AUX', 'CMX',
    'GFX', 'SCX', 'ECX', 'IHX', 'BDX'
  ) then
    raise exception 'STOCK_RUNNER_INVALID_EXCHANGE_CODE';
  end if;

  if p_market_minute is null then
    raise exception 'STOCK_RUNNER_MARKET_MINUTE_REQUIRED';
  end if;

  v_market_minute := date_trunc('minute', p_market_minute);
  if p_market_minute <> v_market_minute then
    raise exception 'STOCK_RUNNER_MARKET_MINUTE_BOUNDARY_REQUIRED';
  end if;

  if v_market_minute > date_trunc('minute', now()) then
    raise exception 'STOCK_RUNNER_FUTURE_MARKET_MINUTE';
  end if;

  if not public.is_stock_market_open_at(v_market_minute) then
    raise exception 'STOCK_RUNNER_MARKET_MINUTE_CLOSED';
  end if;

  -- Serialize one game/exchange/minute across scheduler retries and concurrent
  -- workers before any asset state is changed.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_game_session_id::text || ':' || v_exchange_code || ':' || v_market_minute::text,
      0
    )
  );

  if exists (
    select 1
    from public.stock_price_ticks existing_tick
    where existing_tick.game_session_id = p_game_session_id
      and existing_tick.exchange_code = v_exchange_code
      and existing_tick.market_minute = v_market_minute
  ) then
    raise exception 'STOCK_MARKET_MINUTE_ALREADY_EXISTS' using errcode = '23505';
  end if;

  select * into v_apply
  from public.apply_stock_market_runner_tick(
    p_game_session_id,
    p_tick_index,
    p_asset_updates,
    p_tick_rows
  );

  update public.stock_price_ticks tick
  set
    exchange_code = v_exchange_code,
    market_minute = v_market_minute
  where tick.game_session_id = p_game_session_id
    and tick.tick_index = p_tick_index;

  get diagnostics v_tagged_count = row_count;

  if v_tagged_count <> v_apply.ticks_inserted then
    raise exception 'STOCK_RUNNER_MARKET_MINUTE_TAG_COUNT_MISMATCH';
  end if;

  assets_updated := v_apply.assets_updated;
  ticks_inserted := v_apply.ticks_inserted;
  return next;
end;
$$;

comment on function public.apply_stock_market_runner_minute(
  uuid,
  integer,
  text,
  timestamptz,
  jsonb,
  jsonb
) is
  'Atomically applies one sequential gameplay tick for one canonical open-market UTC minute, with game/exchange/minute idempotency.';

revoke all on function public.apply_stock_market_runner_minute(
  uuid,
  integer,
  text,
  timestamptz,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.apply_stock_market_runner_minute(
  uuid,
  integer,
  text,
  timestamptz,
  jsonb,
  jsonb
) to service_role;
