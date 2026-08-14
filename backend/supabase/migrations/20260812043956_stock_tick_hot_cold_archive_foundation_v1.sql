create table if not exists private.stock_tick_archives (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  range_start timestamptz not null,
  range_end timestamptz not null,
  min_tick_index integer not null check (min_tick_index >= 0),
  max_tick_index integer not null check (max_tick_index >= min_tick_index),
  row_count bigint not null check (row_count > 0),
  object_key text not null check (length(btrim(object_key)) > 0),
  object_etag text,
  sha256 text,
  compressed_bytes bigint check (compressed_bytes is null or compressed_bytes >= 0),
  format text not null default 'parquet',
  compression text not null default 'zstd',
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (range_end > range_start),
  check ((status <> 'verified') or (verified_at is not null and sha256 is not null and length(btrim(sha256)) > 0 and compressed_bytes is not null))
);

create unique index if not exists stock_tick_archives_object_key_uq
  on private.stock_tick_archives(object_key);
create index if not exists stock_tick_archives_session_range_idx
  on private.stock_tick_archives(game_session_id, range_start, range_end);
create index if not exists stock_tick_archives_status_idx
  on private.stock_tick_archives(status, created_at);

create table if not exists private.stock_tick_archive_state (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  last_archived_at timestamptz,
  last_archived_tick_index integer check (last_archived_tick_index is null or last_archived_tick_index >= 0),
  hot_retention interval not null default interval '4 hours' check (hot_retention >= interval '1 hour'),
  archive_chunk interval not null default interval '1 hour' check (archive_chunk >= interval '5 minutes'),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_price_candles (
  game_session_id uuid not null,
  stock_asset_id uuid not null,
  timeframe text not null check (timeframe in ('5m','1h','1d')),
  bucket_start timestamptz not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  volume bigint not null check (volume >= 0),
  tick_count integer not null check (tick_count > 0),
  first_tick_index integer not null check (first_tick_index >= 0),
  last_tick_index integer not null check (last_tick_index >= first_tick_index),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_session_id, stock_asset_id, timeframe, bucket_start),
  foreign key (game_session_id) references public.game_sessions(id) on delete cascade,
  foreign key (game_session_id, stock_asset_id) references public.game_session_stock_assets(game_session_id, id) on delete cascade
);

create index if not exists stock_price_candles_lookup_idx
  on public.stock_price_candles(game_session_id, stock_asset_id, timeframe, bucket_start desc);

alter table public.stock_price_candles enable row level security;
revoke all on table public.stock_price_candles from anon, authenticated;
grant select, insert, update, delete on table public.stock_price_candles to service_role;

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

revoke all on function private.upsert_stock_price_candles(uuid, timestamptz, timestamptz) from public;
grant execute on function private.upsert_stock_price_candles(uuid, timestamptz, timestamptz) to service_role;

create or replace function private.purge_verified_stock_tick_archive(p_archive_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_archive private.stock_tick_archives%rowtype;
  v_matching bigint;
  v_deleted bigint;
begin
  select * into v_archive
  from private.stock_tick_archives
  where id = p_archive_id
  for update;

  if not found then
    raise exception 'STOCK_ARCHIVE_NOT_FOUND';
  end if;
  if v_archive.status <> 'verified' then
    raise exception 'STOCK_ARCHIVE_NOT_VERIFIED';
  end if;
  if v_archive.sha256 is null or v_archive.compressed_bytes is null or v_archive.verified_at is null then
    raise exception 'STOCK_ARCHIVE_VERIFICATION_INCOMPLETE';
  end if;

  select count(*) into v_matching
  from public.stock_price_ticks
  where game_session_id = v_archive.game_session_id
    and created_at >= v_archive.range_start
    and created_at < v_archive.range_end
    and tick_index between v_archive.min_tick_index and v_archive.max_tick_index;

  if v_matching <> v_archive.row_count then
    raise exception 'STOCK_ARCHIVE_ROW_COUNT_MISMATCH expected %, found %', v_archive.row_count, v_matching;
  end if;

  perform private.upsert_stock_price_candles(v_archive.game_session_id, v_archive.range_start, v_archive.range_end);

  delete from public.stock_price_ticks
  where game_session_id = v_archive.game_session_id
    and created_at >= v_archive.range_start
    and created_at < v_archive.range_end
    and tick_index between v_archive.min_tick_index and v_archive.max_tick_index;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_archive.row_count then
    raise exception 'STOCK_ARCHIVE_DELETE_COUNT_MISMATCH expected %, deleted %', v_archive.row_count, v_deleted;
  end if;

  insert into private.stock_tick_archive_state(game_session_id, last_archived_at, last_archived_tick_index)
  values (v_archive.game_session_id, v_archive.range_end, v_archive.max_tick_index)
  on conflict (game_session_id) do update set
    last_archived_at = greatest(private.stock_tick_archive_state.last_archived_at, excluded.last_archived_at),
    last_archived_tick_index = greatest(private.stock_tick_archive_state.last_archived_tick_index, excluded.last_archived_tick_index),
    updated_at = now();

  return v_deleted;
end;
$$;

revoke all on function private.purge_verified_stock_tick_archive(uuid) from public;
grant execute on function private.purge_verified_stock_tick_archive(uuid) to service_role;

comment on table private.stock_tick_archives is 'Verified manifest for raw stock tick objects archived to S3-compatible cold storage. Raw Postgres ticks may only be purged through the guarded verified-archive function.';
comment on table public.stock_price_candles is 'Compact 5-minute, hourly, and daily OHLCV history retained in Postgres after raw stock ticks are archived.';
