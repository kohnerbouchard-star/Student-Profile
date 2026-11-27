-- Inverse for the source packet's inert preparation, not an active runtime.
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $target$
begin
  if current_database() <> 'postgres' or session_user <> 'postgres' or current_user <> 'postgres'
    or pg_is_in_recovery()
  then raise exception 'STAGING_PASSWORD_RESET_OPERATOR_REQUIRED'; end if;
end $target$;
lock table staging_app_auth_guard.control, staging_app_auth_guard.pending in access exclusive mode;
do $state$
begin
  if not exists (select 1 from staging_app_auth_guard.control where singleton
     and deployment is null and held_at is null)
     or exists (select 1 from staging_app_auth_guard.pending)
  then raise exception 'STAGING_PASSWORD_RESET_INVERSE_REFUSED'; end if;
end $state$;
drop function public.staging_track_password_reset_begin_v1(text),
  public.staging_track_password_reset_complete_v1(uuid,text);
drop function staging_app_auth_guard.bind_password_reset_runtime(uuid,text),
  staging_app_auth_guard.hold_password_reset(uuid),
  staging_app_auth_guard.reopen_password_reset(uuid),
  staging_app_auth_guard.tracked_password_reset_snapshot(uuid);
drop table staging_app_auth_guard.pending,staging_app_auth_guard.control;
drop schema staging_app_auth_guard;
notify pgrst, 'reload schema';
commit;
