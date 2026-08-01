\set ON_ERROR_STOP on
begin transaction read only;

select jsonb_build_object(
  'schemaVersion', 'econovaria.release-integrity.raw-schema-evidence.v1',
  'structural', jsonb_build_object(
    'schemas', (
      select coalesce(jsonb_agg(jsonb_build_object('name', n.nspname) order by n.nspname), '[]'::jsonb)
      from pg_namespace n
      where n.nspname in ('public', 'private')
    ),
    'relations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'name', c.relname,
        'kind', c.relkind,
        'persistence', c.relpersistence
      ) order by n.nspname, c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private')
        and c.relkind in ('r', 'p', 'v', 'm', 'S')
    ),
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', table_schema,
        'table', table_name,
        'ordinal', ordinal_position,
        'name', column_name,
        'dataType', data_type,
        'udtSchema', udt_schema,
        'udtName', udt_name,
        'nullable', is_nullable,
        'default', column_default,
        'identity', is_identity,
        'generated', is_generated
      ) order by table_schema, table_name, ordinal_position), '[]'::jsonb)
      from information_schema.columns
      where table_schema in ('public', 'private')
    ),
    'constraints', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'name', con.conname,
        'type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      ) order by n.nspname, c.relname, con.conname), '[]'::jsonb)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private')
    ),
    'indexes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', schemaname,
        'table', tablename,
        'name', indexname,
        'definition', indexdef
      ) order by schemaname, tablename, indexname), '[]'::jsonb)
      from pg_indexes
      where schemaname in ('public', 'private')
    ),
    'routines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'name', p.proname,
        'kind', p.prokind,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'result', pg_get_function_result(p.oid),
        'language', l.lanname,
        'securityDefiner', p.prosecdef,
        'configuration', p.proconfig,
        'definitionMd5', md5(pg_get_functiondef(p.oid))
      ) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname in ('public', 'private')
        and p.prokind in ('f', 'p')
    ),
    'triggers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'name', t.tgname,
        'definition', pg_get_triggerdef(t.oid, true)
      ) order by n.nspname, c.relname, t.tgname), '[]'::jsonb)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private')
        and not t.tgisinternal
    )
  ),
  'authorization', jsonb_build_object(
    'rowSecurity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'enabled', c.relrowsecurity,
        'forced', c.relforcerowsecurity
      ) order by n.nspname, c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private')
        and c.relkind in ('r', 'p')
    ),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', schemaname,
        'table', tablename,
        'name', policyname,
        'permissive', permissive,
        'roles', roles,
        'command', cmd,
        'using', qual,
        'check', with_check
      ) order by schemaname, tablename, policyname), '[]'::jsonb)
      from pg_policies
      where schemaname in ('public', 'private')
    ),
    'tableGrants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'grantor', grantor,
        'grantee', grantee,
        'schema', table_schema,
        'table', table_name,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) order by grantee, table_schema, table_name, privilege_type, grantor), '[]'::jsonb)
      from information_schema.table_privileges
      where table_schema in ('public', 'private')
    ),
    'routineGrants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'grantor', grantor,
        'grantee', grantee,
        'schema', routine_schema,
        'routine', routine_name,
        'specificName', specific_name,
        'privilege', privilege_type,
        'grantable', is_grantable
      ) order by grantee, routine_schema, routine_name, specific_name, privilege_type, grantor), '[]'::jsonb)
      from information_schema.routine_privileges
      where routine_schema in ('public', 'private')
    ),
    'defaultPrivileges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role', defaclrole::regrole::text,
        'schema', coalesce(n.nspname, ''),
        'objectType', defaclobjtype,
        'acl', defaclacl::text
      ) order by defaclrole::regrole::text, coalesce(n.nspname, ''), defaclobjtype), '[]'::jsonb)
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname in ('public', 'private') or d.defaclnamespace = 0
    )
  )
)::text;

rollback;
