-- Explicit default-open attachment; does not pause any writer.
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

-- Acquire target-table locks before the state-row lock to avoid inversion
-- against writers admitted through the open triggers.
do $lock_targets$
declare qualified_tables text;
begin
  perform staging_economic_pause.require_operator();
  select string_agg(format('public.%I',relation_name), ', ' order by relation_name collate "C")
    into qualified_tables from staging_economic_pause.economic_targets();
  execute 'lock table ' || qualified_tables || ' in share row exclusive mode';
end $lock_targets$;
select staging_economic_pause.assert_open_epoch(:'economic_epoch'::uuid,false);
do $attach$
declare target record;
begin
  perform staging_economic_pause.check_economic_topology(false);
  update staging_economic_pause.scopes set attached=true,epoch=gen_random_uuid()
    where scope='economic-db' and not held and not attached;
  if not found then raise exception 'STAGING_ECONOMIC_ATTACH_STATE_CHANGED'; end if;

  for target in select * from staging_economic_pause.economic_targets() loop
    execute format('create trigger a00_staging_economic_guard before %s on public.%I
      for each statement execute function staging_economic_pause.require_economic_write_open()',
      case when target.business_rows_only then 'truncate' else 'insert or update or delete or truncate' end,
      target.relation_name);
    execute format('alter table public.%I enable always trigger a00_staging_economic_guard',target.relation_name);
    if target.business_rows_only then
      execute format('create trigger a00_staging_economic_row_guard before insert or update or delete on public.%I
        for each row execute function staging_economic_pause.require_economic_write_open()',target.relation_name);
      execute format('alter table public.%I enable always trigger a00_staging_economic_row_guard',target.relation_name);
    end if;
  end loop;
  perform staging_economic_pause.check_economic_topology(true);
end $attach$;
commit;
