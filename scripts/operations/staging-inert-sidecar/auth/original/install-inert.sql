-- Source review only. No normal migration or release uses this packet.
-- A future transport must verify the actual exact staging endpoint and TLS.
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

lock table supabase_migrations.schema_migrations in share mode;
do $ledger$
begin
  if (select count(*)=468 and
    encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate "C")::text,'UTF8')),'hex') =
      'abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312'
    from supabase_migrations.schema_migrations m) is distinct from true
  then raise exception 'STAGING_PASSWORD_RESET_LEDGER_CHANGED'; end if;
end $ledger$;

create schema staging_app_auth_guard;
revoke all on schema staging_app_auth_guard from public, anon, authenticated, service_role;
create table staging_app_auth_guard.control (
  singleton boolean primary key default true check (singleton),
  epoch uuid not null default gen_random_uuid(),
  deployment text check (deployment ~ '^eecvbssdvarfcykcfrny_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[1-9][0-9]*$'),
  held_at timestamptz check (held_at is null or deployment is not null)
);
insert into staging_app_auth_guard.control default values;

create table staging_app_auth_guard.pending (
  permit uuid primary key,
  epoch uuid not null,
  deployment text not null,
  registered_at timestamptz not null default clock_timestamp()
);

-- Operator must independently validate the actual password-reset-api runtime.
create function staging_app_auth_guard.bind_password_reset_runtime(p_epoch uuid, p_deployment text)
returns uuid language plpgsql set search_path = pg_catalog, pg_temp as $bind$
declare next_epoch uuid := gen_random_uuid();
begin
  if p_deployment is null or p_deployment !~ '^eecvbssdvarfcykcfrny_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_[1-9][0-9]*$'
  then raise exception 'STAGING_PASSWORD_RESET_RUNTIME_REJECTED'; end if;
  update staging_app_auth_guard.control set deployment=p_deployment,epoch=next_epoch
    where singleton and epoch=p_epoch and deployment is null and held_at is null;
  if not found then raise exception 'STAGING_PASSWORD_RESET_STATE_CHANGED'; end if;
  return next_epoch;
end $bind$;

create function public.staging_track_password_reset_begin_v1(p_deployment text)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $admit$
declare state staging_app_auth_guard.control%rowtype; new_permit uuid := gen_random_uuid();
begin
  select * into strict state from staging_app_auth_guard.control where singleton for share;
  if state.held_at is not null or state.deployment is null
    or state.deployment is distinct from p_deployment then return null; end if;
  insert into staging_app_auth_guard.pending(permit,epoch,deployment)
    values(new_permit,state.epoch,state.deployment);
  return new_permit;
end $admit$;
create function public.staging_track_password_reset_complete_v1(p_permit uuid, p_deployment text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $settle$
begin
  delete from staging_app_auth_guard.pending where permit=p_permit and deployment=p_deployment;
  return found;
end $settle$;

create function staging_app_auth_guard.hold_password_reset(p_epoch uuid)
returns uuid language plpgsql set search_path = pg_catalog, pg_temp as $hold$
declare next_epoch uuid := gen_random_uuid();
begin
  update staging_app_auth_guard.control set held_at=clock_timestamp(),epoch=next_epoch
    where singleton and epoch=p_epoch and deployment is not null and held_at is null;
  if not found then raise exception 'STAGING_PASSWORD_RESET_STATE_CHANGED'; end if;
  return next_epoch;
end $hold$;

-- Reports only permits reserved by this approved handler revision.
create function staging_app_auth_guard.tracked_password_reset_snapshot(p_epoch uuid)
returns table (
  held_epoch uuid, held_since timestamptz, observed_at timestamptz,
  deployment_sha256 text, unresolved_tracked_count bigint,
  scope text, managed_origin_status text
) language sql stable set search_path = pg_catalog, pg_temp as $snapshot$
  select c.epoch,c.held_at,statement_timestamp(),
    encode(sha256(convert_to(c.deployment,'UTF8')),'hex'),
    (select count(*) from staging_app_auth_guard.pending),
    'app-password-reset-only'::text, 'NOT_ATTESTED'::text
  from staging_app_auth_guard.control c
  where c.singleton and c.epoch=p_epoch and c.held_at is not null;
$snapshot$;

create function staging_app_auth_guard.reopen_password_reset(p_epoch uuid)
returns uuid language plpgsql set search_path = pg_catalog, pg_temp as $reopen$
declare next_epoch uuid := gen_random_uuid();
begin
  perform 1 from staging_app_auth_guard.control where singleton and epoch=p_epoch
    and held_at is not null for update;
  if not found then raise exception 'STAGING_PASSWORD_RESET_STATE_CHANGED'; end if;
  if exists (select 1 from staging_app_auth_guard.pending)
  then raise exception 'STAGING_PASSWORD_RESET_UNRESOLVED'; end if;
  update staging_app_auth_guard.control set held_at=null,epoch=next_epoch
    where singleton and epoch=p_epoch;
  return next_epoch;
end $reopen$;

revoke all on all functions in schema staging_app_auth_guard from public, anon, authenticated, service_role;
revoke all on all tables in schema staging_app_auth_guard from public, anon, authenticated, service_role;
revoke all on function public.staging_track_password_reset_begin_v1(text),
  public.staging_track_password_reset_complete_v1(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.staging_track_password_reset_begin_v1(text),
  public.staging_track_password_reset_complete_v1(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
