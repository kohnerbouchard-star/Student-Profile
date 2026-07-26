begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.internal_runner_nonce_claims (
  runner_name text not null,
  nonce_hash text not null,
  timestamp_seconds bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint internal_runner_nonce_claims_pkey
    primary key (runner_name, nonce_hash),
  constraint internal_runner_nonce_claims_runner_name_check
    check (runner_name ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  constraint internal_runner_nonce_claims_nonce_hash_check
    check (nonce_hash ~ '^[0-9a-f]{64}$'),
  constraint internal_runner_nonce_claims_timestamp_check
    check (timestamp_seconds between 1 and 9223372036854775806),
  constraint internal_runner_nonce_claims_expiry_check
    check (expires_at > created_at - interval '15 minutes')
);

create index if not exists internal_runner_nonce_claims_expiry_idx
  on private.internal_runner_nonce_claims (expires_at);

alter table private.internal_runner_nonce_claims enable row level security;
alter table private.internal_runner_nonce_claims force row level security;
revoke all on table private.internal_runner_nonce_claims
  from public, anon, authenticated, service_role;

comment on table private.internal_runner_nonce_claims is
  'Private replay-denial ledger for signed internal runners. Stores only the runner name, a SHA-256 nonce digest, bounded timestamp, and expiry; raw nonces and runner secrets are never persisted.';

create or replace function public.claim_internal_runner_nonce_v2(
  p_runner_name text,
  p_nonce_hash text,
  p_timestamp_seconds bigint,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'INTERNAL_RUNNER_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if coalesce(p_runner_name, '') !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
    or coalesce(p_nonce_hash, '') !~ '^[0-9a-f]{64}$'
    or p_timestamp_seconds is null
    or p_expires_at is null
    or p_expires_at <= v_now
    or p_expires_at > v_now + interval '20 minutes'
    or abs(extract(epoch from v_now)::bigint - p_timestamp_seconds) > 600
  then
    raise exception 'INTERNAL_RUNNER_NONCE_CLAIM_INVALID' using errcode = '22023';
  end if;

  delete from private.internal_runner_nonce_claims
  where expires_at <= v_now;

  insert into private.internal_runner_nonce_claims (
    runner_name,
    nonce_hash,
    timestamp_seconds,
    expires_at
  ) values (
    p_runner_name,
    p_nonce_hash,
    p_timestamp_seconds,
    p_expires_at
  )
  on conflict on constraint internal_runner_nonce_claims_pkey do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$function$;

revoke all on function public.claim_internal_runner_nonce_v2(
  text,
  text,
  bigint,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_internal_runner_nonce_v2(
  text,
  text,
  bigint,
  timestamptz
) to service_role;

commit;
