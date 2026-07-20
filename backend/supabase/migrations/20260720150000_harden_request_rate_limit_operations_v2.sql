begin;

create index if not exists request_rate_limit_buckets_last_request_idx
  on public.request_rate_limit_buckets (
    last_request_at desc,
    dimension,
    window_seconds,
    limit_count
  );

create or replace function public.prune_request_rate_limit_buckets_v1(
  p_batch_limit integer default 5000
)
returns table (
  deleted_count integer,
  remaining_expired_count bigint,
  oldest_remaining_expiry timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deleted_count integer := 0;
begin
  if p_batch_limit is null or p_batch_limit not between 1 and 10000 then
    raise exception using
      errcode = '22023',
      message = 'rate limit cleanup batch must be between 1 and 10000';
  end if;

  with candidates as (
    select buckets.ctid
    from public.request_rate_limit_buckets as buckets
    where buckets.expires_at <= v_now
    order by buckets.expires_at, buckets.dimension
    limit p_batch_limit
    for update skip locked
  ), deleted as (
    delete from public.request_rate_limit_buckets as buckets
    using candidates
    where buckets.ctid = candidates.ctid
    returning 1
  )
  select count(*)::integer
  into v_deleted_count
  from deleted;

  return query
  select
    v_deleted_count,
    count(*)::bigint,
    min(buckets.expires_at)
  from public.request_rate_limit_buckets as buckets
  where buckets.expires_at <= v_now;
end;
$$;

revoke all on function public.prune_request_rate_limit_buckets_v1(integer)
  from public, anon, authenticated;
grant execute on function public.prune_request_rate_limit_buckets_v1(integer)
  to service_role;

comment on function public.prune_request_rate_limit_buckets_v1(integer) is
  'Deletes at most the requested number of expired HMAC-keyed rate-limit rows with SKIP LOCKED. Returns bounded aggregate cleanup evidence and never exposes bucket keys.';

create or replace function public.read_request_rate_limit_telemetry_v1(
  p_since_seconds integer default 900,
  p_row_limit integer default 100
)
returns table (
  dimension text,
  window_seconds integer,
  limit_count integer,
  active_bucket_count bigint,
  blocked_bucket_count bigint,
  total_request_count bigint,
  oldest_request_at timestamptz,
  newest_request_at timestamptz,
  nearest_expiry_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_since_seconds is null or p_since_seconds not between 60 and 86400 then
    raise exception using
      errcode = '22023',
      message = 'rate limit telemetry window must be between 60 and 86400 seconds';
  end if;

  if p_row_limit is null or p_row_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'rate limit telemetry row limit must be between 1 and 100';
  end if;

  return query
  select
    buckets.dimension,
    buckets.window_seconds,
    buckets.limit_count,
    count(*)::bigint as active_bucket_count,
    count(*) filter (
      where buckets.blocked_until > clock_timestamp()
    )::bigint as blocked_bucket_count,
    coalesce(sum(buckets.request_count), 0)::bigint as total_request_count,
    min(buckets.last_request_at) as oldest_request_at,
    max(buckets.last_request_at) as newest_request_at,
    min(buckets.expires_at) as nearest_expiry_at
  from public.request_rate_limit_buckets as buckets
  where buckets.last_request_at >= clock_timestamp()
    - make_interval(secs => p_since_seconds)
  group by
    buckets.dimension,
    buckets.window_seconds,
    buckets.limit_count
  order by
    blocked_bucket_count desc,
    total_request_count desc,
    buckets.dimension,
    buckets.window_seconds,
    buckets.limit_count
  limit p_row_limit;
end;
$$;

revoke all on function public.read_request_rate_limit_telemetry_v1(integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_request_rate_limit_telemetry_v1(integer, integer)
  to service_role;

comment on function public.read_request_rate_limit_telemetry_v1(integer, integer) is
  'Returns bounded aggregate limiter volume and block telemetry by policy shape. It never returns HMAC keys, IPs, action composites, tokens, or internal actor/game identifiers.';

commit;
