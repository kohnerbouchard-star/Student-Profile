begin;

-- Forward convergence for environments whose historical migration ledger skipped
-- 20260801084000_harden_browser_role_default_privileges_v1.sql. The statements
-- are intentionally idempotent so clean replay and already-hardened live
-- environments converge on the same browser/BFF boundary.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

do $$
declare
  exposed_relation text;
begin
  select format('%I.%I', namespace.nspname, relation.relname)
    into exposed_relation
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  cross join (values ('anon'), ('authenticated')) as browser_role(role_name)
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p', 'v', 'm', 'f')
    and (
      has_table_privilege(browser_role.role_name, relation.oid, 'SELECT')
      or has_table_privilege(browser_role.role_name, relation.oid, 'INSERT')
      or has_table_privilege(browser_role.role_name, relation.oid, 'UPDATE')
      or has_table_privilege(browser_role.role_name, relation.oid, 'DELETE')
      or has_table_privilege(browser_role.role_name, relation.oid, 'TRUNCATE')
      or has_table_privilege(browser_role.role_name, relation.oid, 'REFERENCES')
      or has_table_privilege(browser_role.role_name, relation.oid, 'TRIGGER')
    )
  limit 1;

  if exposed_relation is not null then
    raise exception 'browser role retains direct privilege on %', exposed_relation;
  end if;
end
$$;

comment on schema public is
  'Econovaria application schema. Direct browser-role table and RPC access is denied; trusted Edge/BFF services mediate runtime access.';

commit;
