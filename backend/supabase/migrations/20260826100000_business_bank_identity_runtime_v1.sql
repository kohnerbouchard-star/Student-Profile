-- Business monetary read identity convergence V1.
--
-- B2 made bank_account_id/business_id the canonical Business money identity.
-- Retained Business compatibility functions may still authorize through a
-- controller Player, but Business cash reads must resolve through the stable
-- Business identity. Ownership transfer must never move the Business's own cash
-- between controller-shaped projections.

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
  v_block_start integer;
  v_block_end_relative integer;
  v_block_end integer;
  v_block_tail text;
  v_remaining text;
begin
  -- These retained routines use Player ownership for authorization, but every
  -- Business balance read is rewritten to the stable Business projection.
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
      ),
      (
        'hire_business_employee_v1'::text,
        'ab.player_id=p_player_id'::text,
        'ab.business_id = v_business.id'::text,
        1::integer
      ),
      (
        'purchase_business_input_v1'::text,
        'ab.player_id = p_player_id'::text,
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
      and proc_row.prokind = 'f'
    order by proc_row.oid desc
    limit 1;

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

  -- Acquisition changes control of a Business; it does not transfer the
  -- Business's own cash. Buyer consideration still moves from the buyer's
  -- personal Checking authority to the seller's personal Checking authority.
  select proc_row.oid
  into v_oid
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'public'
    and proc_row.proname = 'create_or_acquire_player_business_v1'
    and proc_row.prokind = 'f'
  order by proc_row.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'BUSINESS_ACQUISITION_ROUTINE_MISSING' using errcode = 'P0001';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  v_match_count := (
    length(v_definition) - length(replace(
      v_definition,
      'ab.player_id = v_seller_player_id',
      ''
    ))
  ) / length('ab.player_id = v_seller_player_id');
  if v_match_count <> 1 then
    raise exception 'BUSINESS_ACQUISITION_BALANCE_REWRITE_COUNT:%', v_match_count
      using errcode = 'P0001';
  end if;
  v_definition := replace(
    v_definition,
    'ab.player_id = v_seller_player_id',
    'ab.business_id = v_business.id'
  );

  -- Remove the historical controller-to-controller Business cash movement in
  -- its entirety. The canonical Business bank account already survives the
  -- ownership change, so those two journal entries would be fake movement.
  v_block_start := position(
    'if coalesce(v_business_cash, 0) <> 0 then' in lower(v_definition)
  );
  if v_block_start = 0 then
    raise exception 'BUSINESS_ACQUISITION_CASH_TRANSFER_BLOCK_MISSING'
      using errcode = 'P0001';
  end if;
  v_block_tail := substring(v_definition from v_block_start);
  v_block_end_relative := position('end if;' in lower(v_block_tail));
  if v_block_end_relative = 0 then
    raise exception 'BUSINESS_ACQUISITION_CASH_TRANSFER_BLOCK_UNTERMINATED'
      using errcode = 'P0001';
  end if;
  v_block_end := v_block_start + v_block_end_relative
    + length('end if;') - 2;
  v_definition := substring(v_definition from 1 for v_block_start - 1)
    || 'perform public.ensure_business_bank_account_v2('
    || 'p_game_session_id, v_business.id);'
    || substring(v_definition from v_block_end + 1);

  if position('''transferred_business_cash''' in v_definition) = 0 then
    raise exception 'BUSINESS_ACQUISITION_AUDIT_FIELD_MISSING'
      using errcode = 'P0001';
  end if;
  v_definition := replace(
    v_definition,
    '''transferred_business_cash''',
    '''retained_business_cash'''
  );

  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  if position('ownership_cash_transfer_out' in v_definition) <> 0
    or position('ownership_cash_transfer_in' in v_definition) <> 0
    or position('ab.player_id = v_seller_player_id' in v_definition) <> 0
    or position('''retained_business_cash''' in v_definition) = 0
  then
    raise exception 'BUSINESS_ACQUISITION_CASH_IDENTITY_CUTOVER_INCOMPLETE'
      using errcode = 'P0001';
  end if;

  -- Diagnostic final sweep. create_or_acquire_player_business_v1 is excluded
  -- because it legitimately reads the buyer's personal cash in the same
  -- function; its Business-cash path is asserted explicitly above.
  select string_agg(proc_row.proname, ', ' order by proc_row.proname)
  into v_remaining
  from pg_catalog.pg_proc as proc_row
  join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = proc_row.pronamespace
  where namespace_row.nspname = 'public'
    and proc_row.prokind = 'f'
    and proc_row.proname <> 'create_or_acquire_player_business_v1'
    and pg_catalog.pg_get_functiondef(proc_row.oid) like '%account_balances%'
    and pg_catalog.pg_get_functiondef(proc_row.oid) like '%business_account_type_v1%'
    and (
      pg_catalog.pg_get_functiondef(proc_row.oid)
        ~ '[.]player_id[[:space:]]*=[[:space:]]*p_player_id'
      or pg_catalog.pg_get_functiondef(proc_row.oid)
        ~ '[.]player_id[[:space:]]*=[[:space:]]*v_business[.]owner_player_id'
      or pg_catalog.pg_get_functiondef(proc_row.oid)
        ~ '[.]player_id[[:space:]]*=[[:space:]]*v_seller_player_id'
    );

  if v_remaining is not null then
    raise exception 'BUSINESS_BANK_IDENTITY_OWNER_SCOPED_READ_REMAINS:%',
      v_remaining using errcode = 'P0001';
  end if;
end;
$migration$;

comment on function public.read_business_balance_v2(uuid, uuid, text) is
  'Canonical Business balance read. Business identity is business_id/bank_account_id; owner Player UUID is authorization or historical compatibility metadata only.';

commit;
