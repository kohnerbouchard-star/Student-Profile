-- C3C schema/runtime assertions for atomic immediate-buy settlement.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $c3c_assertions$
declare
  v_constraint text;
  v_public_acl aclitem[];
  v_private_acl aclitem[];
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_orders'
      and column_name = 'stock_buy_quote_id'
      and data_type = 'uuid'
  ) then
    raise exception 'C3C_ASSERT_STOCK_BUY_QUOTE_COLUMN_MISSING';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'stock_orders'
      and c.conname = 'stock_orders_stock_buy_quote_scope_fk'
      and c.contype = 'f'
      and c.confrelid = 'public.stock_buy_quotes'::regclass
  ) then
    raise exception 'C3C_ASSERT_STOCK_BUY_QUOTE_FK_MISSING';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'stock_orders'
      and indexname = 'stock_orders_stock_buy_quote_unique'
      and indexdef ilike 'create unique index%stock_buy_quote_id%where (stock_buy_quote_id is not null)%'
  ) then
    raise exception 'C3C_ASSERT_STOCK_QUOTE_CONSUMPTION_UNIQUE_MISSING';
  end if;

  select pg_get_constraintdef(c.oid)
  into v_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'stock_orders'
    and c.conname = 'stock_orders_settlement_evidence_shape_check';

  if v_constraint is null
     or v_constraint not ilike '%stock_buy_quote_id IS NOT NULL%'
     or v_constraint not ilike '%funding_receipt_id IS NOT NULL%'
     or v_constraint not ilike '%market_liquidity_account_id IS NOT NULL%'
  then
    raise exception 'C3C_ASSERT_ORDER_EVIDENCE_SHAPE_INVALID';
  end if;

  if to_regprocedure('public.settle_stock_buy_quote_v1(uuid,uuid,text,text)') is null then
    raise exception 'C3C_ASSERT_PUBLIC_SETTLEMENT_FUNCTION_MISSING';
  end if;

  if to_regprocedure('private.settle_stock_buy_quote_at_v1(uuid,uuid,text,text,timestamp with time zone)') is null then
    raise exception 'C3C_ASSERT_PRIVATE_CLOCK_FUNCTION_MISSING';
  end if;

  select p.proacl
  into v_public_acl
  from pg_proc p
  where p.oid = 'public.settle_stock_buy_quote_v1(uuid,uuid,text,text)'::regprocedure;

  if has_function_privilege('anon', 'public.settle_stock_buy_quote_v1(uuid,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.settle_stock_buy_quote_v1(uuid,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.settle_stock_buy_quote_v1(uuid,uuid,text,text)', 'EXECUTE')
  then
    raise exception 'C3C_ASSERT_PUBLIC_SETTLEMENT_ACL_INVALID';
  end if;

  select p.proacl
  into v_private_acl
  from pg_proc p
  where p.oid = 'private.settle_stock_buy_quote_at_v1(uuid,uuid,text,text,timestamp with time zone)'::regprocedure;

  if has_function_privilege('anon', 'private.settle_stock_buy_quote_at_v1(uuid,uuid,text,text,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.settle_stock_buy_quote_at_v1(uuid,uuid,text,text,timestamp with time zone)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.settle_stock_buy_quote_at_v1(uuid,uuid,text,text,timestamp with time zone)', 'EXECUTE')
  then
    raise exception 'C3C_ASSERT_PRIVATE_CLOCK_ACL_INVALID';
  end if;

  if exists (
    select 1
    from public.stock_orders
    where settlement_evidence_family = 'legacy'
      and stock_buy_quote_id is not null
  ) then
    raise exception 'C3C_ASSERT_LEGACY_QUOTE_CONTAMINATION';
  end if;
end;
$c3c_assertions$;

commit;
