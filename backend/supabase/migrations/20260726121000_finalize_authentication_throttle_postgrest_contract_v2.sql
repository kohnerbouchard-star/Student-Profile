begin;

-- The throttle validator uses the repository-owned JSON compatibility helper.
-- Keep browser roles unable to execute the public wrappers; Edge service clients
-- remain the only authorized callers.
alter function public.authentication_throttle_validate_buckets_v2(jsonb)
  set search_path = pg_catalog, private, public, pg_temp;

revoke all on function public.auth_throttle_check_v2(jsonb)
  from public, anon, authenticated, authenticator;
revoke all on function public.auth_throttle_record_failure_v2(jsonb)
  from public, anon, authenticated, authenticator;
revoke all on function public.auth_throttle_record_success_v2(jsonb)
  from public, anon, authenticated, authenticator;

grant execute on function public.auth_throttle_check_v2(jsonb)
  to service_role;
grant execute on function public.auth_throttle_record_failure_v2(jsonb)
  to service_role;
grant execute on function public.auth_throttle_record_success_v2(jsonb)
  to service_role;

do $migration$
begin
  if not has_function_privilege(
    'service_role',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_CHECK_SERVICE_ROLE_EXECUTE_MISSING';
  end if;
  if has_function_privilege(
    'anon',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticator',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_NON_SERVICE_EXECUTION_EXPOSED';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
