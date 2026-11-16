-- Econovaria Business V2 Phase 10A.4C2: fail-closed database assertions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '180s';

create or replace function private.assert_multicurrency_marketplace_funding_v1()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_missing text[];
  v_service_oid oid := to_regrole('service_role');
begin
  select array_agg(required_column)
  into v_missing
  from unnest(array[
    'marketplace_purchase_reservations.funding_quote_id',
    'marketplace_purchase_reservations.funding_context_hash',
    'marketplace_purchase_reservations.settlement_clearing_account_id',
    'marketplace_purchase_reservations.seller_bank_account_id',
    'marketplace_purchase_reservations.fee_bank_account_id',
    'marketplace_purchase_reservations.tax_bank_account_id',
    'marketplace_orders.funding_receipt_id',
    'marketplace_orders.funding_bank_transaction_id',
    'marketplace_orders.distribution_bank_transaction_id',
    'marketplace_orders.settlement_clearing_account_id',
    'marketplace_orders.seller_bank_account_id',
    'marketplace_orders.fee_bank_account_id',
    'marketplace_orders.tax_bank_account_id'
  ]) as required(required_column)
  where not exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = split_part(required.required_column, '.', 1)
      and column_row.column_name = split_part(required.required_column, '.', 2)
  );
  if v_missing is not null then
    raise exception 'MARKETPLACE_FUNDING_COLUMNS_MISSING:%', v_missing
      using errcode = 'P0001';
  end if;

  if to_regclass('public.marketplace_funding_refunds') is null then
    raise exception 'MARKETPLACE_FUNDING_REFUND_EVIDENCE_MISSING'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_class as class_row
    where class_row.oid = 'public.marketplace_funding_refunds'::regclass
      and class_row.relrowsecurity
      and class_row.relforcerowsecurity
  ) then
    raise exception 'MARKETPLACE_FUNDING_REFUND_RLS_INVALID'
      using errcode = 'P0001';
  end if;

  if has_table_privilege('anon', 'public.marketplace_funding_refunds', 'select')
     or has_table_privilege('anon', 'public.marketplace_funding_refunds', 'insert')
     or has_table_privilege('authenticated', 'public.marketplace_funding_refunds', 'select')
     or has_table_privilege('authenticated', 'public.marketplace_funding_refunds', 'insert')
     or has_table_privilege('service_role', 'public.marketplace_funding_refunds', 'insert')
     or has_table_privilege('service_role', 'public.marketplace_funding_refunds', 'update')
     or has_table_privilege('service_role', 'public.marketplace_funding_refunds', 'delete')
  then
    raise exception 'MARKETPLACE_FUNDING_REFUND_DML_AUTHORITY_INVALID'
      using errcode = 'P0001';
  end if;
  if not has_table_privilege(
    'service_role',
    'public.marketplace_funding_refunds',
    'select'
  ) then
    raise exception 'MARKETPLACE_FUNDING_REFUND_READ_AUTHORITY_MISSING'
      using errcode = 'P0001';
  end if;

  if to_regprocedure(
    'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)'
  ) is null
     or to_regprocedure(
       'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)'
     ) is null
     or to_regprocedure(
       'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)'
     ) is null
     or to_regprocedure(
       'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)'
     ) is null
  then
    raise exception 'MARKETPLACE_FUNDING_COMMAND_MISSING'
      using errcode = 'P0001';
  end if;

  if has_function_privilege(
       'anon',
       'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)',
       'execute'
     )
  then
    raise exception 'MARKETPLACE_FUNDING_BROWSER_EXECUTE_FORBIDDEN'
      using errcode = 'P0001';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.create_marketplace_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.settle_marketplace_funding_v1(uuid,uuid,text,text,timestamp with time zone)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.refund_marketplace_funding_v1(uuid,uuid,text,text,bigint,text)',
       'execute'
     )
  then
    raise exception 'MARKETPLACE_FUNDING_SERVICE_EXECUTE_MISSING'
      using errcode = 'P0001';
  end if;

  if has_function_privilege(
       'service_role',
       'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'private.reverse_purchase_funding_receipt_v1(uuid,uuid,text,text,uuid,text,text,uuid,jsonb)',
       'execute'
     )
  then
    raise exception 'MARKETPLACE_FUNDING_REVERSAL_PRIVATE_AUTHORITY_INVALID'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.marketplace_orders'::regclass
      and constraint_row.conname = 'marketplace_orders_payment_evidence_check'
  )
     or not exists (
       select 1
       from pg_constraint as constraint_row
       where constraint_row.conrelid =
         'public.marketplace_purchase_reservations'::regclass
         and constraint_row.conname =
           'marketplace_reservations_funding_binding_check'
     )
  then
    raise exception 'MARKETPLACE_FUNDING_EVIDENCE_CONSTRAINT_MISSING'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_trigger as trigger_row
    where trigger_row.tgrelid =
      'public.marketplace_purchase_reservations'::regclass
      and trigger_row.tgname =
        'marketplace_reservations_funding_binding_guard'
      and not trigger_row.tgisinternal
  )
     or not exists (
       select 1
       from pg_trigger as trigger_row
       where trigger_row.tgrelid = 'public.marketplace_orders'::regclass
         and trigger_row.tgname = 'marketplace_orders_funding_binding_guard'
         and not trigger_row.tgisinternal
     )
     or not exists (
       select 1
       from pg_trigger as trigger_row
       where trigger_row.tgrelid =
         'public.marketplace_funding_refunds'::regclass
         and trigger_row.tgname =
           'guard_marketplace_funding_refunds_immutable'
         and not trigger_row.tgisinternal
     )
  then
    raise exception 'MARKETPLACE_FUNDING_GUARD_TRIGGER_MISSING'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from pg_proc as proc_row
    join pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where (
      namespace_row.nspname,
      proc_row.proname
    ) in (
      ('public', 'create_marketplace_funding_quote_v1'),
      ('public', 'settle_marketplace_funding_v1'),
      ('public', 'refund_marketplace_funding_v1'),
      ('private', 'reverse_purchase_funding_receipt_v1')
    )
      and not exists (
        select 1
        from unnest(coalesce(proc_row.proconfig, '{}'::text[])) as setting(value)
        where setting.value like 'search_path=%'
      )
  ) then
    raise exception 'MARKETPLACE_FUNDING_SEARCH_PATH_MISSING'
      using errcode = 'P0001';
  end if;

  if v_service_oid is null then
    raise exception 'MARKETPLACE_FUNDING_SERVICE_ROLE_MISSING'
      using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function private.assert_multicurrency_marketplace_funding_v1()
  from public, anon, authenticated, service_role;

select private.assert_multicurrency_marketplace_funding_v1();

drop function private.assert_multicurrency_marketplace_funding_v1();

commit;
