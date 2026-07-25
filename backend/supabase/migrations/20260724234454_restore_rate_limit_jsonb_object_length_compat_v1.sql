begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.jsonb_object_length(p_value jsonb)
returns integer
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select count(*)::integer
  from jsonb_object_keys(p_value);
$function$;

revoke all on function private.jsonb_object_length(jsonb)
  from public, anon, authenticated, service_role;

alter function public.consume_request_rate_limits_v1(jsonb)
  set search_path = pg_catalog, private, public, pg_temp;
alter function public.consume_pre_auth_request_rate_limits_v1(jsonb)
  set search_path = pg_catalog, private, public, pg_temp;

commit;
