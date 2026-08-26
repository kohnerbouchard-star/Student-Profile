-- Business monetary read identity convergence V1.
--
-- B2 made bank_account_id/business_id the canonical Business money identity.
-- A few retained Business compatibility functions still read account_balances
-- through the current owner Player UUID. That metadata is historical and may
-- remain bound to a prior controller after an ownership transfer. Rewrite only
-- those exact final routine definitions so authorization remains owner-scoped
-- while monetary reads are Business-scoped.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  v_oid oid;
  v_definition text;
  v_match_count integer;
  v_function_name text;
  v_old_predicate text;
  v_new_predicate text;
  v_expected_count integer;
begin
  for v_function_name, v_old_predicate, v_new_predicate, v_expected_count in
    select * from (values
      (
        'run_business_production_material_compat_v1'::text,
        'ab.player_id = p_player_id'::text,
        'ab.business_id = v_business.id'::text,
        3::integer
      ),
      (
        'run_business_production_labor_v2'::text,
        'balance_row.player_id = p_player_id'::text,
        'balance_row.business_id = v_business.id'::text,
        2::integer
      ),
      (
        'settle_business_cycle_v1'::text,
        'ab.player_id = v_business.owner_player_id'::text,
        'ab.business_id = v_business.id'::text,
        3::integer
      )
    ) as targets(function_name, old_predicate, new_predicate, expected_count)
  loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'public'
      and proc_row.proname = v_function_name
      and proc_row.prokind = 'f';

    if v_oid is null then
      raise exception 'BUSINESS_BANK_IDENTITY_ROUTINE_MISSING:%', v_function_name
        using errcode = 'P0001';
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_match_count := (
      length(v_definition) - length(replace(v_definition, v_old_predicate, ''))
    ) / length(v_old_predicate);

    if v_match_count <> v_expected_count then
      raise exception 'BUSINESS_BANK_IDENTITY_REWRITE_COUNT:%:%:%',
        v_function_name, v_match_count, v_expected_count
        using errcode = 'P0001';
    end if;

    v_definition := replace(v_definition, v_old_predicate, v_new_predicate);
    if position(v_old_predicate in v_definition) <> 0 then
      raise exception 'BUSINESS_BANK_IDENTITY_REWRITE_INCOMPLETE:%', v_function_name
        using errcode = 'P0001';
    end if;

    execute v_definition;
  end loop;

  -- Fail closed if another final public routine still treats owner-player
  -- compatibility metadata as the monetary identity of a Business account.
  if exists (
    select 1
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'public'
      and proc_row.prokind = 'f'
      and pg_catalog.pg_get_functiondef(proc_row.oid) like '%account_balances%'
      and pg_catalog.pg_get_functiondef(proc_row.oid) like '%business_account_type_v1%'
      and (
        pg_catalog.pg_get_functiondef(proc_row.oid)
          ~ '[.]player_id[[:space:]]*=[[:space:]]*p_player_id'
        or pg_catalog.pg_get_functiondef(proc_row.oid)
          ~ '[.]player_id[[:space:]]*=[[:space:]]*v_business[.]owner_player_id'
      )
  ) then
    raise exception 'BUSINESS_BANK_IDENTITY_OWNER_SCOPED_READ_REMAINS'
      using errcode = 'P0001';
  end if;
end;
$migration$;

comment on function public.read_business_balance_v2(uuid, uuid, text) is
  'Canonical Business balance read. Business identity is business_id/bank_account_id; owner Player UUID is authorization or historical compatibility metadata only.';

commit;
