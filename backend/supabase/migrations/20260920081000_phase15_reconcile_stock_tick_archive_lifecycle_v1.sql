-- Canonical, environment-neutral reconciliation of the verified stock tick archive.
-- This migration deliberately excludes the one-time production compaction operations
-- that were used to reclaim physical disk space in the live database.

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
  compression text not null default 'snappy',
  status text not null default 'pending',
  verified_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (range_end > range_start),
  check (
    status <> 'verified'
    or (
      verified_at is not null
      and sha256 is not null
      and length(btrim(sha256)) > 0
      and compressed_bytes is not null
    )
  )
);

alter table private.stock_tick_archives add column if not exists purged_at timestamptz;
alter table private.stock_tick_archives drop constraint if exists stock_tick_archives_status_check;
alter table private.stock_tick_archives
  add constraint stock_tick_archives_status_check
  check (status = any (array['pending'::text, 'verified'::text, 'purged'::text, 'failed'::text]));

create unique index if not exists stock_tick_archives_object_key_uq
  on private.stock_tick_archives(object_key);
create index if not exists stock_tick_archives_session_range_idx
  on private.stock_tick_archives(game_session_id, range_start, range_end);
create index if not exists stock_tick_archives_status_idx
  on private.stock_tick_archives(status, created_at);

create table if not exists private.stock_tick_archive_state (
  game_session_id uuid primary key references public.game_sessions(id) on delete cascade,
  last_archived_at timestamptz,
  last_archived_tick_index integer check (
    last_archived_tick_index is null or last_archived_tick_index >= 0
  ),
  hot_retention interval not null default interval '4 hours'
    check (hot_retention >= interval '1 hour'),
  archive_chunk interval not null default interval '1 hour'
    check (archive_chunk >= interval '5 minutes'),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_price_candles (
  game_session_id uuid not null,
  stock_asset_id uuid not null,
  timeframe text not null check (timeframe in ('5m', '1h', '1d')),
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
  foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets(game_session_id, id) on delete cascade
);

alter table public.stock_price_candles enable row level security;
revoke all on table public.stock_price_candles from public, anon, authenticated;
grant select, insert, update, delete on table public.stock_price_candles to service_role;

create or replace function public.get_next_stock_market_tick_index(p_game_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select greatest(
    coalesce((
      select max(t.tick_index)
      from public.stock_price_ticks t
      where t.game_session_id = p_game_session_id
    ), 0),
    coalesce((
      select s.last_archived_tick_index
      from private.stock_tick_archive_state s
      where s.game_session_id = p_game_session_id
    ), 0)
  ) + 1;
$$;

revoke all on function public.get_next_stock_market_tick_index(uuid)
  from public, anon, authenticated;
grant execute on function public.get_next_stock_market_tick_index(uuid) to service_role;

create or replace function public.prepare_next_stock_tick_archive(p_game_session_id uuid)
returns table (
  game_session_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  min_tick_index integer,
  max_tick_index integer,
  row_count bigint
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_first_tick integer;
  v_first_at timestamptz;
  v_latest_tick integer;
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_min_tick integer;
  v_max_tick integer;
  v_row_count bigint;
  v_next_at timestamptz;
  v_hot_retention interval;
begin
  if p_game_session_id is null then
    raise exception 'STOCK_ARCHIVE_GAME_SESSION_REQUIRED';
  end if;

  select coalesce(s.hot_retention, interval '4 hours')
    into v_hot_retention
  from (select 1) seed
  left join private.stock_tick_archive_state s
    on s.game_session_id = p_game_session_id;

  select t.tick_index, t.created_at
    into v_first_tick, v_first_at
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
  order by t.tick_index asc
  limit 1;

  if v_first_tick is null then
    return;
  end if;

  select t.tick_index
    into v_latest_tick
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
  order by t.tick_index desc
  limit 1;

  v_range_start := date_trunc('hour', v_first_at);
  v_range_end := v_range_start + interval '1 hour';

  if v_range_end > now() - v_hot_retention then
    return;
  end if;

  select min(t.tick_index), max(t.tick_index), count(*)
    into v_min_tick, v_max_tick, v_row_count
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
    and t.tick_index between v_first_tick and v_first_tick + 120
    and t.created_at >= v_range_start
    and t.created_at < v_range_end;

  if v_row_count is null or v_row_count = 0
     or v_min_tick is null or v_max_tick is null then
    raise exception 'STOCK_ARCHIVE_EMPTY_RANGE';
  end if;

  -- Retain the latest occupied clock hour so legacy/current-tick readers still have
  -- an authoritative hot-table tail after long inactive periods.
  if v_latest_tick is not null and v_max_tick >= v_latest_tick then
    return;
  end if;

  select t.created_at
    into v_next_at
  from public.stock_price_ticks t
  where t.game_session_id = p_game_session_id
    and t.tick_index > v_max_tick
  order by t.tick_index asc
  limit 1;

  if v_next_at is not null and v_next_at < v_range_end then
    raise exception 'STOCK_ARCHIVE_TICK_RATE_EXCEEDS_SAFE_WINDOW';
  end if;

  return query
  select p_game_session_id, v_range_start, v_range_end,
         v_min_tick, v_max_tick, v_row_count;
end;
$$;

revoke all on function public.prepare_next_stock_tick_archive(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_next_stock_tick_archive(uuid) to service_role;

create or replace function public.register_verified_stock_tick_archive(
  p_game_session_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_min_tick_index integer,
  p_max_tick_index integer,
  p_row_count bigint,
  p_object_key text,
  p_object_etag text,
  p_sha256 text,
  p_compressed_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_expected record;
  v_existing private.stock_tick_archives%rowtype;
  v_id uuid;
begin
  if p_object_key is null or length(btrim(p_object_key)) = 0 then
    raise exception 'STOCK_ARCHIVE_OBJECT_KEY_REQUIRED';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'STOCK_ARCHIVE_SHA256_INVALID';
  end if;
  if p_compressed_bytes is null or p_compressed_bytes <= 0 then
    raise exception 'STOCK_ARCHIVE_COMPRESSED_BYTES_INVALID';
  end if;

  select * into v_expected
  from public.prepare_next_stock_tick_archive(p_game_session_id);

  if not found then
    raise exception 'STOCK_ARCHIVE_RANGE_NOT_ELIGIBLE';
  end if;

  if p_range_start is distinct from v_expected.range_start
     or p_range_end is distinct from v_expected.range_end
     or p_min_tick_index is distinct from v_expected.min_tick_index
     or p_max_tick_index is distinct from v_expected.max_tick_index
     or p_row_count is distinct from v_expected.row_count then
    raise exception 'STOCK_ARCHIVE_PREPARED_RANGE_MISMATCH';
  end if;

  select * into v_existing
  from private.stock_tick_archives archive_row
  where archive_row.object_key = p_object_key;

  if found then
    if v_existing.game_session_id = p_game_session_id
       and v_existing.range_start = p_range_start
       and v_existing.range_end = p_range_end
       and v_existing.min_tick_index = p_min_tick_index
       and v_existing.max_tick_index = p_max_tick_index
       and v_existing.row_count = p_row_count
       and lower(v_existing.sha256) = lower(p_sha256)
       and v_existing.compressed_bytes = p_compressed_bytes
       and v_existing.status in ('verified', 'purged') then
      return v_existing.id;
    end if;
    raise exception 'STOCK_ARCHIVE_OBJECT_KEY_CONFLICT';
  end if;

  insert into private.stock_tick_archives (
    game_session_id, range_start, range_end,
    min_tick_index, max_tick_index, row_count,
    object_key, object_etag, sha256, compressed_bytes,
    format, compression, status, verified_at
  ) values (
    p_game_session_id, p_range_start, p_range_end,
    p_min_tick_index, p_max_tick_index, p_row_count,
    p_object_key, nullif(btrim(p_object_etag), ''), lower(p_sha256), p_compressed_bytes,
    'parquet', 'snappy', 'verified', now()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_verified_stock_tick_archive(
  uuid, timestamptz, timestamptz, integer, integer, bigint, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.register_verified_stock_tick_archive(
  uuid, timestamptz, timestamptz, integer, integer, bigint, text, text, text, bigint
) to service_role;

create or replace function private.upsert_stock_price_candles(
  p_game_session_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_min_tick_index integer,
  p_max_tick_index integer
)
returns integer
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_game_session_id is null or p_range_start is null
     or p_range_end is null or p_range_end <= p_range_start then
    raise exception 'STOCK_CANDLE_INVALID_RANGE';
  end if;
  if p_min_tick_index is null or p_max_tick_index is null
     or p_min_tick_index < 0 or p_max_tick_index < p_min_tick_index then
    raise exception 'STOCK_CANDLE_INVALID_TICK_RANGE';
  end if;
  if p_range_start <> date_trunc('hour', p_range_start)
     or p_range_end <> p_range_start + interval '1 hour' then
    raise exception 'STOCK_CANDLE_RANGE_MUST_BE_EXACT_HOUR';
  end if;

  with frames as (
    select '5m'::text as timeframe, interval '5 minutes' as span
    union all
    select '1h', interval '1 hour'
  ), base as (
    select
      tick_row.game_session_id,
      tick_row.stock_asset_id,
      frame.timeframe,
      date_bin(
        frame.span,
        tick_row.created_at,
        timestamptz '2000-01-01 00:00:00+00'
      ) as bucket_start,
      tick_row.tick_index,
      tick_row.price,
      tick_row.volume,
      tick_row.created_at
    from public.stock_price_ticks tick_row
    cross join frames frame
    where tick_row.game_session_id = p_game_session_id
      and tick_row.tick_index between p_min_tick_index and p_max_tick_index
      and tick_row.created_at >= p_range_start
      and tick_row.created_at < p_range_end
  ), aggregated as (
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
    open, high, low, close, volume, tick_count,
    first_tick_index, last_tick_index
  )
  select
    game_session_id, stock_asset_id, timeframe, bucket_start,
    open, high, low, close, volume, tick_count,
    first_tick_index, last_tick_index
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
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.upsert_stock_price_candles(
  uuid, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;
grant execute on function private.upsert_stock_price_candles(
  uuid, timestamptz, timestamptz, integer, integer
) to service_role;

create or replace function private.purge_verified_stock_tick_archive(p_archive_id uuid)
returns bigint
language plpgsql
security definer
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
  if v_archive.status = 'purged' then
    return 0;
  end if;
  if v_archive.status <> 'verified' then
    raise exception 'STOCK_ARCHIVE_NOT_VERIFIED';
  end if;
  if v_archive.sha256 is null
     or v_archive.compressed_bytes is null
     or v_archive.verified_at is null then
    raise exception 'STOCK_ARCHIVE_VERIFICATION_INCOMPLETE';
  end if;
  if v_archive.range_start <> date_trunc('hour', v_archive.range_start)
     or v_archive.range_end <> v_archive.range_start + interval '1 hour' then
    raise exception 'STOCK_ARCHIVE_RANGE_MUST_BE_EXACT_HOUR';
  end if;

  select count(*) into v_matching
  from public.stock_price_ticks tick_row
  where tick_row.game_session_id = v_archive.game_session_id
    and tick_row.tick_index between v_archive.min_tick_index and v_archive.max_tick_index
    and tick_row.created_at >= v_archive.range_start
    and tick_row.created_at < v_archive.range_end;

  if v_matching <> v_archive.row_count then
    raise exception 'STOCK_ARCHIVE_ROW_COUNT_MISMATCH expected %, found %',
      v_archive.row_count, v_matching;
  end if;

  perform private.upsert_stock_price_candles(
    v_archive.game_session_id,
    v_archive.range_start,
    v_archive.range_end,
    v_archive.min_tick_index,
    v_archive.max_tick_index
  );

  delete from public.stock_price_ticks tick_row
  where tick_row.game_session_id = v_archive.game_session_id
    and tick_row.tick_index between v_archive.min_tick_index and v_archive.max_tick_index
    and tick_row.created_at >= v_archive.range_start
    and tick_row.created_at < v_archive.range_end;

  get diagnostics v_deleted = row_count;
  if v_deleted <> v_archive.row_count then
    raise exception 'STOCK_ARCHIVE_DELETE_COUNT_MISMATCH expected %, deleted %',
      v_archive.row_count, v_deleted;
  end if;

  insert into private.stock_tick_archive_state (
    game_session_id, last_archived_at, last_archived_tick_index
  ) values (
    v_archive.game_session_id, v_archive.range_end, v_archive.max_tick_index
  )
  on conflict (game_session_id) do update set
    last_archived_at = greatest(
      private.stock_tick_archive_state.last_archived_at,
      excluded.last_archived_at
    ),
    last_archived_tick_index = greatest(
      private.stock_tick_archive_state.last_archived_tick_index,
      excluded.last_archived_tick_index
    ),
    updated_at = now();

  update private.stock_tick_archives
  set status = 'purged', purged_at = now(), updated_at = now()
  where id = p_archive_id;

  return v_deleted;
end;
$$;

revoke all on function private.purge_verified_stock_tick_archive(uuid)
  from public, anon, authenticated;
grant execute on function private.purge_verified_stock_tick_archive(uuid) to service_role;

create or replace function public.purge_verified_stock_tick_archive(p_archive_id uuid)
returns bigint
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select private.purge_verified_stock_tick_archive(p_archive_id);
$$;

revoke all on function public.purge_verified_stock_tick_archive(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_verified_stock_tick_archive(uuid) to service_role;

create or replace function public.configure_stock_tick_archive_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net
as $$
declare
  v_scheduler_name constant text := 'econovaria-stock-tick-archive-retention-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/stock-tick-archiver$' then
    raise exception 'INVALID_STOCK_TICK_ARCHIVER_FUNCTION_URL' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'econovaria-stock-runtime-scheduler-v1'
  ) then
    raise exception 'STOCK_RUNTIME_SCHEDULER_TOKEN_MISSING' using errcode = 'P0001';
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-econovaria-scheduler-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'econovaria-stock-runtime-scheduler-v1'
          order by created_at desc
          limit 1
        )
      ),
      body := jsonb_build_object(
        'action', 'archive_next_hour',
        'gameSessionId', sessions.game_session_id::text,
        'purge', true
      ),
      timeout_milliseconds := 20000
    )
    from (
      select distinct game_session_id
      from public.stock_price_ticks
    ) sessions;
  $command$, v_function_url);

  return cron.schedule(v_scheduler_name, '*/15 * * * *', v_command);
end;
$$;

revoke all on function public.configure_stock_tick_archive_scheduler_v1(text)
  from public, anon, authenticated;
grant execute on function public.configure_stock_tick_archive_scheduler_v1(text)
  to service_role;

-- Keep the useful ticker lookup, remove only the exact redundant asset-desc index.
drop index if exists public.stock_price_ticks_asset_tick_desc_idx;
create index if not exists stock_price_ticks_ticker_tick_desc_idx
  on public.stock_price_ticks(game_session_id, ticker, tick_index desc);

comment on table private.stock_tick_archives is
  'Verified manifest for raw stock tick objects archived to S3-compatible cold storage. Raw PostgreSQL ticks may only be purged through the guarded verified-archive function.';
comment on table public.stock_price_candles is
  'Compact 5-minute, hourly, and daily OHLCV history retained in PostgreSQL after raw stock ticks are archived.';
