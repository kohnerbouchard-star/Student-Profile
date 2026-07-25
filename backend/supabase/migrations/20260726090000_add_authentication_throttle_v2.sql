begin;

create table if not exists public.authentication_throttle_buckets (
  dimension text not null,
  key_hash text not null,
  failure_count integer not null default 0,
  locked_until timestamptz null,
  first_failure_at timestamptz null,
  last_failure_at timestamptz null,
  last_success_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authentication_throttle_buckets_pkey primary key (dimension, key_hash),
  constraint authentication_throttle_dimension_check check (
    dimension in ('account', 'device', 'ip')
  ),
  constraint authentication_throttle_key_hash_check check (
    key_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authentication_throttle_failure_count_check check (
    failure_count between 0 and 2147483647
  ),
  constraint authentication_throttle_expiry_check check (
    expires_at > created_at
  )
);

create index if not exists authentication_throttle_expiry_idx
  on public.authentication_throttle_buckets (expires_at);
create index if not exists authentication_throttle_lock_idx
  on public.authentication_throttle_buckets (locked_until)
  where locked_until is not null;

alter table public.authentication_throttle_buckets enable row level security;
alter table public.authentication_throttle_buckets force row level security;
revoke all on table public.authentication_throttle_buckets
  from public, anon, authenticated, service_role;

comment on table public.authentication_throttle_buckets is
  'Failure-sensitive authentication throttles keyed only by Edge-generated HMAC-SHA256 digests. Raw emails, Player identifiers, device identifiers, IP addresses, credentials, and tokens are never stored.';

create or replace function public.authentication_throttle_validate_buckets_v2(
  p_buckets jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_bucket jsonb;
  v_dimensions text[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'AUTHENTICATION_THROTTLE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_buckets) <> 'array'
    or jsonb_array_length(p_buckets) <> 3 then
    raise exception 'AUTHENTICATION_THROTTLE_REQUIRES_THREE_BUCKETS' using errcode = '22023';
  end if;

  select array_agg(distinct value ->> 'dimension' order by value ->> 'dimension')
  into v_dimensions
  from jsonb_array_elements(p_buckets);

  if v_dimensions <> array['account', 'device', 'ip']::text[] then
    raise exception 'AUTHENTICATION_THROTTLE_DIMENSIONS_INVALID' using errcode = '22023';
  end if;

  for v_bucket in select value from jsonb_array_elements(p_buckets)
  loop
    if jsonb_typeof(v_bucket) <> 'object'
      or jsonb_object_length(v_bucket) <> 2
      or exists (
        select 1
        from jsonb_object_keys(v_bucket) supplied(key)
        where key not in ('dimension', 'keyHash')
      )
      or (v_bucket ->> 'dimension') not in ('account', 'device', 'ip')
      or coalesce(v_bucket ->> 'keyHash', '') !~ '^[0-9a-f]{64}$'
    then
      raise exception 'AUTHENTICATION_THROTTLE_BUCKET_INVALID' using errcode = '22023';
    end if;
  end loop;
end;
$function$;

create or replace function public.authentication_throttle_cooldown_seconds_v2(
  p_dimension text,
  p_failure_count integer
)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select case p_dimension
    when 'account' then case
      when p_failure_count <= 2 then 0
      when p_failure_count = 3 then 5
      when p_failure_count = 4 then 15
      when p_failure_count = 5 then 30
      when p_failure_count = 6 then 60
      when p_failure_count = 7 then 300
      when p_failure_count = 8 then 900
      when p_failure_count = 9 then 3600
      else 21600
    end
    when 'device' then case
      when p_failure_count <= 5 then 0
      when p_failure_count = 6 then 30
      when p_failure_count = 7 then 60
      when p_failure_count = 8 then 300
      when p_failure_count = 9 then 900
      else 3600
    end
    when 'ip' then case
      when p_failure_count <= 50 then 0
      when p_failure_count <= 60 then 60
      when p_failure_count <= 80 then 300
      when p_failure_count <= 100 then 900
      else 3600
    end
    else 21600
  end;
$function$;

create or replace function public.check_authentication_throttle_v2(
  p_buckets jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  limiting_dimension text,
  failure_count integer,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket jsonb;
  v_row public.authentication_throttle_buckets%rowtype;
  v_retry integer := 0;
  v_limiting_dimension text := null;
  v_failure_count integer := 0;
  v_locked_until timestamptz := null;
begin
  perform public.authentication_throttle_validate_buckets_v2(p_buckets);

  delete from public.authentication_throttle_buckets
  where expires_at <= v_now;

  for v_bucket in
    select value from jsonb_array_elements(p_buckets)
    order by value ->> 'dimension'
  loop
    select * into v_row
    from public.authentication_throttle_buckets
    where dimension = v_bucket ->> 'dimension'
      and key_hash = v_bucket ->> 'keyHash';

    if found and v_row.locked_until > v_now then
      if ceil(extract(epoch from (v_row.locked_until - v_now)))::integer > v_retry then
        v_retry := greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer);
        v_limiting_dimension := v_row.dimension;
        v_failure_count := v_row.failure_count;
        v_locked_until := v_row.locked_until;
      end if;
    end if;
  end loop;

  return query select
    v_retry = 0,
    v_retry,
    v_limiting_dimension,
    v_failure_count,
    v_locked_until;
end;
$function$;

create or replace function public.record_authentication_failure_v2(
  p_buckets jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  limiting_dimension text,
  failure_count integer,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket jsonb;
  v_dimension text;
  v_key_hash text;
  v_existing public.authentication_throttle_buckets%rowtype;
  v_next_count integer;
  v_cooldown integer;
  v_next_lock timestamptz;
  v_retry integer := 0;
  v_limiting_dimension text := null;
  v_limiting_count integer := 0;
  v_limiting_lock timestamptz := null;
begin
  perform public.authentication_throttle_validate_buckets_v2(p_buckets);

  for v_bucket in
    select value from jsonb_array_elements(p_buckets)
    order by value ->> 'dimension'
  loop
    v_dimension := v_bucket ->> 'dimension';
    v_key_hash := v_bucket ->> 'keyHash';

    perform pg_advisory_xact_lock(hashtextextended(v_dimension || ':' || v_key_hash, 0));

    select * into v_existing
    from public.authentication_throttle_buckets
    where dimension = v_dimension and key_hash = v_key_hash
    for update;

    if not found or v_existing.expires_at <= v_now then
      v_next_count := 1;
      v_next_lock := null;
    else
      v_next_count := least(2147483647, v_existing.failure_count + 1);
      v_next_lock := case
        when v_existing.locked_until > v_now then v_existing.locked_until
        else null
      end;
    end if;

    v_cooldown := public.authentication_throttle_cooldown_seconds_v2(
      v_dimension,
      v_next_count
    );
    if v_cooldown > 0 then
      v_next_lock := greatest(
        coalesce(v_next_lock, v_now),
        v_now + make_interval(secs => v_cooldown)
      );
    end if;

    insert into public.authentication_throttle_buckets (
      dimension,
      key_hash,
      failure_count,
      locked_until,
      first_failure_at,
      last_failure_at,
      last_success_at,
      expires_at,
      created_at,
      updated_at
    ) values (
      v_dimension,
      v_key_hash,
      v_next_count,
      v_next_lock,
      v_now,
      v_now,
      null,
      v_now + interval '24 hours',
      v_now,
      v_now
    )
    on conflict (dimension, key_hash) do update set
      failure_count = excluded.failure_count,
      locked_until = excluded.locked_until,
      first_failure_at = coalesce(
        authentication_throttle_buckets.first_failure_at,
        excluded.first_failure_at
      ),
      last_failure_at = excluded.last_failure_at,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;

    if v_next_lock > v_now
      and ceil(extract(epoch from (v_next_lock - v_now)))::integer > v_retry then
      v_retry := greatest(1, ceil(extract(epoch from (v_next_lock - v_now)))::integer);
      v_limiting_dimension := v_dimension;
      v_limiting_count := v_next_count;
      v_limiting_lock := v_next_lock;
    end if;
  end loop;

  return query select
    false,
    v_retry,
    v_limiting_dimension,
    v_limiting_count,
    v_limiting_lock;
end;
$function$;

create or replace function public.record_authentication_success_v2(
  p_buckets jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket jsonb;
begin
  perform public.authentication_throttle_validate_buckets_v2(p_buckets);

  for v_bucket in select value from jsonb_array_elements(p_buckets)
  loop
    if v_bucket ->> 'dimension' in ('account', 'device') then
      delete from public.authentication_throttle_buckets
      where dimension = v_bucket ->> 'dimension'
        and key_hash = v_bucket ->> 'keyHash';
    else
      update public.authentication_throttle_buckets
      set failure_count = greatest(0, failure_count - 5),
          locked_until = case when locked_until > v_now then locked_until else null end,
          last_success_at = v_now,
          expires_at = v_now + interval '1 hour',
          updated_at = v_now
      where dimension = 'ip'
        and key_hash = v_bucket ->> 'keyHash';
    end if;
  end loop;
end;
$function$;

create or replace function public.reset_authentication_throttle_v2(
  p_dimension text,
  p_key_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'AUTHENTICATION_THROTTLE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_dimension not in ('account', 'device', 'ip')
    or coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'AUTHENTICATION_THROTTLE_RESET_INVALID' using errcode = '22023';
  end if;

  delete from public.authentication_throttle_buckets
  where dimension = p_dimension and key_hash = p_key_hash;
  return found;
end;
$function$;

revoke all on function public.authentication_throttle_validate_buckets_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.authentication_throttle_cooldown_seconds_v2(text, integer)
  from public, anon, authenticated;
revoke all on function public.check_authentication_throttle_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_authentication_failure_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.record_authentication_success_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.reset_authentication_throttle_v2(text, text)
  from public, anon, authenticated;

grant execute on function public.check_authentication_throttle_v2(jsonb)
  to service_role;
grant execute on function public.record_authentication_failure_v2(jsonb)
  to service_role;
grant execute on function public.record_authentication_success_v2(jsonb)
  to service_role;
grant execute on function public.reset_authentication_throttle_v2(text, text)
  to service_role;

commit;
