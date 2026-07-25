begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

authorization do $$
begin
  null;
end $$;

create or replace function private.jsonb_object_length(value jsonb)
returns integer
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $function$
  select count(*)::integer from jsonb_object_keys(value);
$function$;

revoke all on function private.jsonb_object_length(jsonb)
  from public, anon, authenticated, service_role;

alter function public.consume_request_rate_limits_v1(jsonb)
  set search_path = public, private, pg_temp;
alter function public.consume_pre_auth_request_rate_limits_v1(jsonb)
  set search_path = public, private, pg_temp;

-- The counter table remains inaccessible through the Data API. Edge Functions
-- may only consume limits through the reviewed security-definer RPCs.
revoke all on table public.request_rate_limit_buckets
  from public, anon, authenticated, service_role;
revoke all on function public.consume_request_rate_limits_v1(jsonb)
  from public, anon, authenticated;
revoke all on function public.consume_pre_auth_request_rate_limits_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_request_rate_limits_v1(jsonb)
  to service_role;
grant execute on function public.consume_pre_auth_request_rate_limits_v1(jsonb)
  to service_role;

comment on function private.jsonb_object_length(jsonb) is
  'Private compatibility helper for hosted PostgreSQL runtimes that do not expose jsonb_object_length(jsonb).';

commit;
