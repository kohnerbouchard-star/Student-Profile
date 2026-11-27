-- Exact inverse after verified detach; never removes application data.
begin;
set local search_path = pg_catalog, pg_temp;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select staging_economic_pause.assert_open_epoch(:'economic_epoch'::uuid,false);
do $must_be_inert$
begin
  if exists (
    select 1 from pg_trigger where tgfoid='staging_economic_pause.require_economic_write_open()'::regprocedure
      or tgname in ('a00_staging_economic_guard','a00_staging_economic_row_guard')
  ) then raise exception 'STAGING_ECONOMIC_TEARDOWN_UNSAFE'; end if;
end $must_be_inert$;
drop function staging_economic_pause.hold(uuid);
drop function staging_economic_pause.reopen(uuid);
drop function staging_economic_pause.assert_economic_held(uuid);
drop function staging_economic_pause.assert_open_epoch(uuid,boolean);
drop function staging_economic_pause.check_private_acl();
drop function staging_economic_pause.check_economic_topology(boolean);
drop function staging_economic_pause.require_economic_write_open();
drop function staging_economic_pause.economic_targets();
drop function staging_economic_pause.require_operator();
drop table staging_economic_pause.scopes;
drop schema staging_economic_pause;
commit;
