begin;

-- PostgREST builds its RPC schema cache while connected as the NOLOGIN-facing
-- authenticator role, then switches to the JWT role for request execution.
-- Browser roles remain denied. The wrapped functions independently require
-- auth.role() = 'service_role', so this grant provides discovery only and does
-- not create an anon or authenticated execution path.
revoke all on function public.auth_throttle_check_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.auth_throttle_record_failure_v2(jsonb)
  from public, anon, authenticated;
revoke all on function public.auth_throttle_record_success_v2(jsonb)
  from public, anon, authenticated;

grant execute on function public.auth_throttle_check_v2(jsonb)
  to authenticator, service_role;
grant execute on function public.auth_throttle_record_failure_v2(jsonb)
  to authenticator, service_role;
grant execute on function public.auth_throttle_record_success_v2(jsonb)
  to authenticator, service_role;

do $migration$
begin
  if not has_function_privilege(
    'authenticator',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_CHECK_POSTGREST_VISIBILITY_MISSING';
  end if;
  if not has_function_privilege(
    'authenticator',
    'public.auth_throttle_record_failure_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_FAILURE_POSTGREST_VISIBILITY_MISSING';
  end if;
  if not has_function_privilege(
    'authenticator',
    'public.auth_throttle_record_success_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_SUCCESS_POSTGREST_VISIBILITY_MISSING';
  end if;
  if has_function_privilege(
    'anon',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.auth_throttle_check_v2(jsonb)',
    'execute'
  ) then
    raise exception 'AUTH_THROTTLE_BROWSER_ROLE_EXECUTION_EXPOSED';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
