begin;

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

comment on function public.claim_internal_runner_nonce_v2(
  text,
  text,
  bigint,
  timestamptz
) is
  'Claims one bounded internal-runner nonce digest exactly once. Execution authority is enforced by the function ACL for service_role; browser roles have no EXECUTE privilege.';

commit;
