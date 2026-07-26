begin;

do $migration$
begin
  if to_regprocedure('public.check_authentication_throttle_v2(jsonb)') is null
    or to_regprocedure('public.record_authentication_failure_v2(jsonb)') is null
    or to_regprocedure('public.record_authentication_success_v2(jsonb)') is null
    or to_regprocedure('public.reset_authentication_throttle_v2(text,text)') is null
  then
    raise exception 'AUTHENTICATION_THROTTLE_V2_RPC_CONTRACT_MISSING';
  end if;
end;
$migration$;

grant execute on function public.check_authentication_throttle_v2(jsonb)
  to service_role;
grant execute on function public.record_authentication_failure_v2(jsonb)
  to service_role;
grant execute on function public.record_authentication_success_v2(jsonb)
  to service_role;
grant execute on function public.reset_authentication_throttle_v2(text, text)
  to service_role;

comment on function public.check_authentication_throttle_v2(jsonb) is
  'Service-role-only authentication throttle read contract. This forward migration also forces PostgREST to expose the newly created RPC after a zero-state rebuild.';

notify pgrst, 'reload schema';

commit;
