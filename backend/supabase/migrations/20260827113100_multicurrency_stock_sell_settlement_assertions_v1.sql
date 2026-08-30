-- C3D migration-time authority assertions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '180s';

do $assertions$
declare
  v_service_exec boolean;
  v_authenticated_exec boolean;
  v_anon_exec boolean;
  v_private_service_exec boolean;
  v_shape text;
begin
  select has_function_privilege(
    'service_role',
    'public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text)',
    'EXECUTE'
  ) into v_service_exec;
  select has_function_privilege(
    'authenticated',
    'public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text)',
    'EXECUTE'
  ) into v_authenticated_exec;
  select has_function_privilege(
    'anon',
    'public.settle_stock_sell_v1(uuid,uuid,text,numeric,numeric,bigint,text,text)',
    'EXECUTE'
  ) into v_anon_exec;
  select has_function_privilege(
    'service_role',
    'private.settle_stock_sell_at_v1(uuid,uuid,text,numeric,numeric,bigint,text,text,timestamptz)',
    'EXECUTE'
  ) into v_private_service_exec;

  if not v_service_exec or v_authenticated_exec or v_anon_exec or v_private_service_exec then
    raise exception 'C3D_SELL_SETTLEMENT_ACL_INVALID';
  end if;

  select pg_get_constraintdef(oid)
  into v_shape
  from pg_constraint
  where conrelid = 'public.stock_orders'::regclass
    and conname = 'stock_orders_settlement_evidence_shape_check';

  if v_shape is null
     or position('destination_bank_account_id IS NOT NULL' in v_shape) = 0
     or position('settlement_bank_transaction_id IS NOT NULL' in v_shape) = 0
  then
    raise exception 'C3D_SELL_EVIDENCE_SHAPE_MISSING';
  end if;
end
$assertions$;

commit;
