-- Staging economic database controls only. Initial install attaches no triggers.
-- The pinned ledger is a predecessor guard, not provider identity. A later
-- authorized transport must bind the staging connection and verify TLS.
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $target$
begin
  if current_database() <> 'postgres' or session_user <> 'postgres' or current_user <> 'postgres'
    or pg_is_in_recovery()
  then raise exception 'STAGING_CONTROL_OPERATOR_REQUIRED'; end if;
end $target$;

lock table supabase_migrations.schema_migrations in share mode;
do $ledger$
begin
  if (select count(*)=468 and
    encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate "C")::text,'UTF8')),'hex') =
      'abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312'
    from supabase_migrations.schema_migrations m) is distinct from true
  then raise exception 'STAGING_PREPARATION_LEDGER_CHANGED'; end if;
end $ledger$;

create schema staging_economic_pause;
revoke all on schema staging_economic_pause from public, anon, authenticated, service_role;
create table staging_economic_pause.scopes (
  scope text primary key check (scope = 'economic-db'),
  epoch uuid not null default gen_random_uuid(),
  held boolean not null default false,
  attached boolean not null default false,
  check (not held or attached)
);
insert into staging_economic_pause.scopes(scope) values ('economic-db');

create function staging_economic_pause.require_operator() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $operator$
begin
  if current_database() <> 'postgres' or session_user <> 'postgres'
    or current_user <> 'postgres' or pg_is_in_recovery()
  then raise exception 'STAGING_CONTROL_OPERATOR_REQUIRED'; end if;
end $operator$;

-- The shared Store offer relation guards Business rows but not seeded/NPC rows.
create function staging_economic_pause.economic_targets()
returns table (relation_name text,business_rows_only boolean)
language sql immutable set search_path = pg_catalog, pg_temp as $targets$
  values
    ('business_equipment_installations',false),
    ('business_equipment_reservations',false),
    ('business_gross_receipts_tax_assessments',false),
    ('business_gross_receipts_tax_payments',false),
    ('business_inventory',false),
    ('business_labor_reservations',false),
    ('business_manufacturing_completion_receipts',false),
    ('business_manufacturing_job_materials',false),
    ('business_manufacturing_job_transitions',false),
    ('business_manufacturing_jobs',false),
    ('business_operating_period_claims',false),
    ('business_operating_period_close_receipts',false),
    ('business_operating_period_store_receipts',false),
    ('business_payroll_clocks',false),
    ('business_payroll_entries',false),
    ('business_payroll_recovery_requests',false),
    ('business_payroll_runs',false),
    ('credit_profiles',false),
    ('loan_applications',false),
    ('loan_payments',false),
    ('player_loans',false),
    ('store_offer_withdrawal_requests',false),
    ('store_seller_offers',true)
$targets$;

create function staging_economic_pause.require_economic_write_open() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $economic_guard$
declare
  closed boolean;
  business_row boolean := false;
begin
  if tg_level='ROW' then
    if tg_table_schema<>'public' or tg_table_name<>'store_seller_offers'
    then raise exception 'STAGING_ECONOMIC_GUARD_TARGET_CHANGED'; end if;
    if tg_op<>'INSERT' then business_row := old.seller_kind is not distinct from 'business'; end if;
    if tg_op<>'DELETE' then business_row := business_row or (new.seller_kind is not distinct from 'business'); end if;
  end if;
  if tg_level='STATEMENT' or business_row then
    -- Shared lock lasts to the caller's commit/rollback. A stale repeatable
    -- snapshot must not allow a database write after the holder has committed.
    select held into strict closed from staging_economic_pause.scopes
      where scope='economic-db' and attached for share;
    if closed then raise exception using
      errcode='55000', message='STAGING_ECONOMIC_WRITES_HELD'; end if;
  end if;
  if tg_level='STATEMENT' then return null; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $economic_guard$;

create function staging_economic_pause.check_economic_topology(p_attached boolean) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $topology$
declare
  target record;
  relation_id oid;
  n_triggers integer;
  n_expected integer := 0;
  guard_id oid := 'staging_economic_pause.require_economic_write_open()'::regprocedure;
begin
  if p_attached is null then raise exception 'STAGING_ECONOMIC_TOPOLOGY_CHANGED'; end if;
  for target in select * from staging_economic_pause.economic_targets() loop
    select c.oid into relation_id from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=target.relation_name
      and c.relkind='r' and c.relpersistence='p' and not c.relispartition
      and not exists(select 1 from pg_inherits i where i.inhrelid=c.oid or i.inhparent=c.oid);
    if not found then raise exception 'STAGING_ECONOMIC_TABLE_SCOPE_CHANGED'; end if;
    if target.business_rows_only and not exists(
      select 1 from pg_attribute where attrelid=relation_id and attname='seller_kind'
        and atttypid='text'::regtype and attnotnull and attnum>0 and not attisdropped
    ) then raise exception 'STAGING_ECONOMIC_TABLE_SCOPE_CHANGED'; end if;
    if exists (select 1 from pg_trigger where tgrelid=relation_id
      and not tgisinternal and tgname='staging_manufacturing_guard')
    then raise exception 'STAGING_ECONOMIC_TOPOLOGY_CHANGED'; end if;
    if not p_attached then continue; end if;

    n_expected := n_expected + case when target.business_rows_only then 2 else 1 end;
    -- pg_trigger flags: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32.
    select count(*) into n_triggers from pg_trigger
    where tgrelid=relation_id and tgfoid=guard_id and tgenabled='A'
      and not tgisinternal and tgnargs=0 and tgqual is null
      and tgconstraint=0 and tgattr::text='' and tgoldtable is null and tgnewtable is null
      and ((tgname='a00_staging_economic_guard'
          and tgtype=case when target.business_rows_only then 34 else 62 end)
        or (target.business_rows_only and tgname='a00_staging_economic_row_guard' and tgtype=31));
    if n_triggers<>(case when target.business_rows_only then 2 else 1 end)
    then raise exception 'STAGING_ECONOMIC_TOPOLOGY_CHANGED'; end if;
  end loop;

  if (select count(*) from pg_trigger where tgfoid=guard_id
      or tgname in ('a00_staging_economic_guard','a00_staging_economic_row_guard'))<>n_expected
  then raise exception 'STAGING_ECONOMIC_TOPOLOGY_CHANGED'; end if;
end $topology$;

create function staging_economic_pause.assert_economic_held(p_epoch uuid) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $held$
begin
  perform staging_economic_pause.require_operator();
  perform 1 from staging_economic_pause.scopes
    where scope='economic-db' and attached and held and epoch=p_epoch for share;
  if not found then raise exception 'STAGING_HOLD_STATE_CHANGED'; end if;
  perform staging_economic_pause.check_economic_topology(true);
end $held$;

-- Only the private owner should receive explicit permissions on new objects.
-- Privileged administrative DDL and inherited platform authority are outside
-- this check; unusual defaults must be reviewed, never silently accepted.
create function staging_economic_pause.check_private_acl() returns void
language plpgsql set search_path = pg_catalog, pg_temp as $acl$
begin
  if exists (
    select 1 from pg_namespace n, lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      where n.nspname='staging_economic_pause'
        and (n.nspowner<>'postgres'::regrole or a.grantee<>n.nspowner)
  ) or exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
      lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where n.nspname='staging_economic_pause' and c.relkind='r'
        and (c.relowner<>'postgres'::regrole or a.grantee<>c.relowner)
  ) or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where n.nspname='staging_economic_pause'
        and (p.proowner<>'postgres'::regrole or a.grantee<>p.proowner)
  )
  then raise exception 'STAGING_ECONOMIC_ACL_DRIFT'; end if;
end $acl$;

create function staging_economic_pause.assert_open_epoch(p_epoch uuid,p_attached boolean) returns void
language plpgsql set search_path = pg_catalog, pg_temp as $opened$
begin
  perform staging_economic_pause.require_operator();
  perform staging_economic_pause.check_private_acl();
  perform 1 from staging_economic_pause.scopes where scope='economic-db'
    and not held and attached=p_attached and epoch=p_epoch for update;
  if not found then raise exception 'STAGING_HOLD_STATE_CHANGED'; end if;
end $opened$;

create function staging_economic_pause.hold(p_epoch uuid) returns uuid
language plpgsql set search_path = pg_catalog, pg_temp as $hold$
declare next_epoch uuid := gen_random_uuid();
begin
  perform staging_economic_pause.assert_open_epoch(p_epoch,true);
  perform staging_economic_pause.check_economic_topology(true);
  update staging_economic_pause.scopes set held=true,epoch=next_epoch where scope='economic-db';
  return next_epoch;
end $hold$;

create function staging_economic_pause.reopen(p_epoch uuid) returns uuid
language plpgsql set search_path = pg_catalog, pg_temp as $reopen$
declare next_epoch uuid := gen_random_uuid();
begin
  perform staging_economic_pause.require_operator();
  perform staging_economic_pause.check_private_acl();
  perform 1 from staging_economic_pause.scopes where scope='economic-db'
    and held and attached and epoch=p_epoch for update;
  if not found then raise exception 'STAGING_HOLD_STATE_CHANGED'; end if;
  perform staging_economic_pause.check_economic_topology(true);
  update staging_economic_pause.scopes set held=false,epoch=next_epoch where scope='economic-db';
  return next_epoch;
end $reopen$;

revoke all on all functions in schema staging_economic_pause from public, anon, authenticated, service_role;
revoke all on all tables in schema staging_economic_pause from public, anon, authenticated, service_role;
select staging_economic_pause.check_private_acl();
select staging_economic_pause.check_economic_topology(false);
-- One open, unattached control row; no existing relation's writes change.
commit;
