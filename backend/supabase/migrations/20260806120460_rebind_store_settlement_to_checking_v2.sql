-- Rebind canonical Store settlement to the merged Checking/Savings personal banking authority.
-- PR #503 recreates purchase_quoted_store_item after the Checking convergence migration,
-- so the Store debit must not reintroduce the retired personal `cash` account key.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $migration$
declare
  v_function_oid oid;
  v_definition text;
  v_rewritten_definition text;
  v_cash_literal_count integer;
begin
  v_function_oid := to_regprocedure(
    'public.purchase_quoted_store_item(uuid,uuid,uuid,text,timestamp with time zone,jsonb)'
  );

  if v_function_oid is null then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_FUNCTION_REQUIRED'
      using errcode = 'P0001';
  end if;

  v_definition := pg_get_functiondef(v_function_oid);
  v_cash_literal_count := (
    length(v_definition) - length(replace(v_definition, '''cash''', ''))
  ) / length('''cash''');

  if v_cash_literal_count <> 2 then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CASH_LITERAL_DRIFT:%', v_cash_literal_count
      using errcode = 'P0001';
  end if;

  v_rewritten_definition := replace(
    v_definition,
    '''cash''',
    '''checking'''
  );

  if v_rewritten_definition = v_definition then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CHECKING_REBIND_REQUIRED'
      using errcode = 'P0001';
  end if;

  execute v_rewritten_definition;

  v_definition := pg_get_functiondef(
    'public.purchase_quoted_store_item(uuid,uuid,uuid,text,timestamp with time zone,jsonb)'::regprocedure
  );

  if v_definition like '%''cash''%' then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CASH_LITERAL_RETAINED'
      using errcode = 'P0001';
  end if;

  if v_definition not like '%''checking''%' then
    raise exception 'ECONOMIC_CORE_STORE_SETTLEMENT_CHECKING_LITERAL_MISSING'
      using errcode = 'P0001';
  end if;
end;
$migration$;

comment on function public.purchase_quoted_store_item(
  uuid, uuid, uuid, text, timestamptz, jsonb
) is
  'Atomically settles a Store offer using canonical Player Checking for payment and canonical inventory accounts for ownership.';

commit;
