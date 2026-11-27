-- Exact inverse: detaches only the listed economic triggers while open.
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
select staging_economic_pause.assert_open_epoch(:'economic_epoch'::uuid,true);
do $detach$
declare target record;
begin
  perform staging_economic_pause.check_economic_topology(true);
  update staging_economic_pause.scopes set attached=false,epoch=gen_random_uuid()
    where scope='economic-db' and not held and attached;
  if not found then raise exception 'STAGING_ECONOMIC_DETACH_STATE_CHANGED'; end if;

  for target in select * from staging_economic_pause.economic_targets() loop
    execute format('drop trigger a00_staging_economic_guard on public.%I',target.relation_name);
    if target.business_rows_only then
      execute format('drop trigger a00_staging_economic_row_guard on public.%I',target.relation_name);
    end if;
  end loop;
  perform staging_economic_pause.check_economic_topology(false);
end $detach$;
commit;
