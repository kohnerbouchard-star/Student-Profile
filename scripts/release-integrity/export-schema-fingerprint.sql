\set ON_ERROR_STOP on
begin transaction read only;

with relevant_role_oids as (
  select oid
  from pg_roles
  where rolname in (
    'anon',
    'authenticated',
    'service_role',
    'authenticator',
    'postgres',
    'supabase_admin'
  )
  union
  select n.nspowner
  from pg_namespace n
  where n.nspname in ('public', 'private')
  union
  select c.relowner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
  union
  select p.proowner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
),
relevant_roles as (
  select distinct oid
  from relevant_role_oids
)
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
        'name', column_name,
        'dataType', data_type,
        'udtSchema', udt_schema,
        'udtName', udt_name,
        'nullable', is_nullable,
        'default', column_default,
        'identity', is_identity,
        'generated', is_generated
      ) order by table_schema, table_name, column_name), '[]'::jsonb)
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
        'definitionSha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex')
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
    'schemaOwners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'owner', pg_get_userbyid(n.nspowner)
      ) order by n.nspname), '[]'::jsonb)
      from pg_namespace n
      where n.nspname in ('public', 'private')
    ),
    'relationOwners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'relation', c.relname,
        'kind', c.relkind,
        'owner', pg_get_userbyid(c.relowner)
      ) order by n.nspname, c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private')
        and c.relkind in ('r', 'p', 'v', 'm', 'S')
    ),
    'routineOwners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schema', n.nspname,
        'routine', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner)
      ) order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prokind in ('f', 'p')
    ),
    'roleAttributes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role', r.rolname,
        'superuser', r.rolsuper,
        'inherit', r.rolinherit,
        'createRole', r.rolcreaterole,
        'createDatabase', r.rolcreatedb,
        'canLogin', r.rolcanlogin,
        'replication', r.rolreplication,
        'bypassRls', r.rolbypassrls
      ) order by r.rolname), '[]'::jsonb)
      from pg_roles r
      join relevant_roles rr on rr.oid = r.oid
    ),
    'roleMemberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role', role_role.rolname,
        'member', member_role.rolname,
        'grantor', grantor_role.rolname,
        'adminOption', membership.admin_option
      ) order by role_role.rolname, member_role.rolname, grantor_role.rolname), '[]'::jsonb)
      from pg_auth_members membership
      join pg_roles role_role on role_role.oid = membership.roleid
      join pg_roles member_role on member_role.oid = membership.member
      join pg_roles grantor_role on grantor_role.oid = membership.grantor
      where membership.roleid in (select oid from relevant_roles)
         or membership.member in (select oid from relevant_roles)
    ),
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
        'grantor', pg_get_userbyid(grant_acl.grantor),
        'grantee', case
          when grant_acl.grantee = 0 then 'PUBLIC'
          else pg_get_userbyid(grant_acl.grantee)
        end,
        'schema', n.nspname,
        'routine', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'privilege', grant_acl.privilege_type,
        'grantable', grant_acl.is_grantable
      ) order by
        case when grant_acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(grant_acl.grantee) end,
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid),
        grant_acl.privilege_type,
        pg_get_userbyid(grant_acl.grantor)
      ), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as grant_acl
      where n.nspname in ('public', 'private')
        and p.prokind in ('f', 'p')
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
