begin;

create or replace function public.auth_throttle_check_v2(
  p_buckets jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  limiting_dimension text,
  failure_count integer,
  locked_until timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select *
  from public.check_authentication_throttle_v2(p_buckets);
$function$;

create or replace function public.auth_throttle_record_failure_v2(
  p_buckets jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  limiting_dimension text,
  failure_count integer,
  locked_until timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select *
  from public.record_authentication_failure_v2(p_buckets);
$function$;

create or replace function public.auth_throttle_record_success_v2(
  p_buckets jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.record_authentication_success_v2(p_buckets);
end;
$function$;

revoke all on function public.auth_throttle_check_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.auth_throttle_record_failure_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.auth_throttle_record_success_v2(jsonb)
  from public, anon, authenticated;

grant execute on function public.auth_throttle_check_v2(jsonb)
  to service_role;
grant execute on function public.auth_throttle_record_failure_v2(jsonb)
  to service_role;
grant execute on function public.auth_throttle_record_success_v2(jsonb)
  to service_role;

comment on function public.auth_throttle_check_v2(jsonb) is
  'Stable service-role-only PostgREST wrapper for the authentication throttle decision.';
comment on function public.auth_throttle_record_failure_v2(jsonb) is
  'Stable service-role-only PostgREST wrapper for authentication failure recording.';
comment on function public.auth_throttle_record_success_v2(jsonb) is
  'Stable service-role-only PostgREST wrapper for authentication success recording.';

notify pgrst, 'reload schema';

commit;
