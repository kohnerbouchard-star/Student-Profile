\set ON_ERROR_STOP on

begin;

-- B2 acceptance is intentionally self-contained and rolls back. It verifies the
-- rebuilt schema/ACL boundary before higher-level fixture/concurrency scripts
-- exercise settlement behavior.
do $acceptance$
declare
  v_table text;
  v_routine text;
  v_oid oid;
  v_rls boolean;
  v_force_rls boolean;
  v_definition text;
begin
  foreach v_table in array array[
    'loan_applications',
    'player_loans',
    'bank_accounts',
    'bank_transactions',
    'bank_account_holds',
    'bank_account_hold_events',
    'fx_liquidity_cap_snapshots',
    'fx_quotes',
    'fx_orders',
    'fx_order_events',
    'fx_settlement_receipts'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'B2_ACCEPTANCE_TABLE_MISSING:%', v_table;
    end if;

    select class_row.relrowsecurity, class_row.relforcerowsecurity
    into v_rls, v_force_rls
    from pg_catalog.pg_class as class_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relname = v_table;

    if not coalesce(v_rls, false) or not coalesce(v_force_rls, false) then
      raise exception 'B2_ACCEPTANCE_RLS_NOT_FORCED:%', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
    then
      raise exception 'B2_ACCEPTANCE_BROWSER_TABLE_PRIVILEGE:%', v_table;
    end if;
  end loop;

  foreach v_routine in array array[
    'list_player_bank_accounts_v1',
    'list_player_bank_activity_v1',
    'get_player_banking_fx_overview_v1',
    'list_player_fx_rate_history_v1',
    'list_player_fx_orders_v1',
    'create_player_fx_quote_v1',
    'submit_player_standard_fx_order_v1',
    'execute_player_instant_fx_v1',
    'cancel_player_standard_fx_order_v1'
  ] loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'public'
      and proc_row.proname = v_routine
    order by proc_row.oid
    limit 1;

    if v_oid is null then
      raise exception 'B2_ACCEPTANCE_RPC_MISSING:%', v_routine;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
      or has_function_privilege('authenticated', v_oid, 'EXECUTE')
    then
      raise exception 'B2_ACCEPTANCE_BROWSER_RPC_PRIVILEGE:%', v_routine;
    end if;
    if not has_function_privilege('service_role', v_oid, 'EXECUTE') then
      raise exception 'B2_ACCEPTANCE_SERVICE_RPC_PRIVILEGE_MISSING:%', v_routine;
    end if;
  end loop;

  foreach v_routine in array array[
    'ensure_bank_account_identity_v1',
    'ensure_player_bank_account_v1',
    'ensure_business_bank_account_identity_v1',
    'post_bank_transaction_v1',
    'create_bank_account_hold_v1',
    'release_bank_account_hold_v1',
    'settle_player_fx_order_v1'
  ] loop
    select proc_row.oid
    into v_oid
    from pg_catalog.pg_proc as proc_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = proc_row.pronamespace
    where namespace_row.nspname = 'private'
      and proc_row.proname = v_routine
    order by proc_row.oid
    limit 1;

    if v_oid is null then
      raise exception 'B2_ACCEPTANCE_PRIVATE_ROUTINE_MISSING:%', v_routine;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
      or has_function_privilege('authenticated', v_oid, 'EXECUTE')
      or has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'B2_ACCEPTANCE_PRIVATE_ROUTINE_EXPOSED:%', v_routine;
    end if;
  end loop;

  if exists (
    select 1
    from public.bank_accounts as account_row
    where account_row.public_key !~ '^bac_[0-9a-f]{32}$'
       or account_row.game_session_id is null
       or account_row.party_id is null
       or account_row.currency_code is null
  ) then
    raise exception 'B2_ACCEPTANCE_ACCOUNT_IDENTITY_INVALID';
  end if;

  select string_agg(pg_get_constraintdef(constraint_row.oid), ' ')
  into v_definition
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.fx_quotes'::regclass;

  if v_definition is null
    or v_definition not like '%spread_rate = 0.005%'
    or v_definition not like '%fee_rate = 0.02%'
  then
    raise exception 'B2_ACCEPTANCE_PRICING_POLICY_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1
    from information_schema.columns as column_row
    join information_schema.tables as table_row
      on table_row.table_schema = column_row.table_schema
     and table_row.table_name = column_row.table_name
    left join private.game_data_purge_table_registry as registry_row
      on registry_row.table_schema = column_row.table_schema
     and registry_row.table_name = column_row.table_name
    where column_row.column_name = 'game_session_id'
      and column_row.table_schema in ('public', 'private')
      and table_row.table_type = 'BASE TABLE'
      and column_row.table_name <> 'game_sessions'
      and column_row.table_name not in (
        'game_data_purge_requests',
        'game_data_purge_table_registry'
      )
      and registry_row.table_name is null
  ) then
    raise exception 'B2_ACCEPTANCE_PURGE_REGISTRY_INCOMPLETE';
  end if;
end;
$acceptance$;

-- REF025c1 runs only in this rollback-only disposable database acceptance.
create function pg_temp.ref025_reject(statement text, expected text) returns void
language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when integrity_constraint_violation then
    get stacked diagnostics actual = constraint_name;
    if actual = expected then return; end if;
    raise exception 'REF025 wrong constraint: expected %, got %', expected, actual;
  end;
  raise exception 'REF025 accepted invalid write: %', expected;
end $$;

do $ref025$
declare
  staff uuid := gen_random_uuid(); g uuid := gen_random_uuid(); other_game uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); other_actor uuid := gen_random_uuid(); business uuid := gen_random_uuid();
  other_business uuid := gen_random_uuid(); product uuid; application uuid; loan uuid; account text; loan_key text; payment record;
  tab text; role_name text; gate text; shape text; row_id uuid; patch jsonb; original jsonb; statement text;
begin
  insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
    values(staff,gen_random_uuid(),staff||'@example.test','REF025 disposable');
  insert into public.game_sessions(id,owner_staff_user_id,name,status)
    values(g,staff,'REF025 first','active'),(other_game,staff,'REF025 second','active');
  insert into public.players(id,game_session_id,display_name,status)
    values(actor,g,'REF025 actor','active'),(other_actor,other_game,'REF025 other','active');
  insert into public.business_entities(id,game_session_id,owner_player_id,legal_name,country_code,currency_code,tax_classification)
    values(business,g,actor,'REF025 borrower','US','USD','disregarded'),
      (other_business,other_game,other_actor,'REF025 other borrower','US','USD','disregarded');
  select public.business_account_type_v1(public_key) into account from public.business_entities where id=business;
  insert into public.account_balances(game_session_id,player_id,business_id,account_type,currency_code,balance)
    values(g,actor,business,account,'USD',0);
  insert into public.loan_products(game_session_id,name,borrower_type,currency_code,minimum_amount,
    maximum_amount,annual_rate,term_cycles,disclosure_text)
    values(g,'REF025 product','business','USD',1,1000,0.05,12,'Disposable compatibility fixture only.') returning id into product;
  insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,
    purpose,repayment_source,credit_score,projected_payment,affordability_ratio,idempotency_key,request_hash)
    values(g,actor,business,product,100,'Fixture',account,650,10,0.1,'ref025-legacy',repeat('a',64)) returning id into application;
  insert into public.player_loans(game_session_id,player_id,business_id,loan_product_id,application_id,
    currency_code,original_principal,principal_balance,annual_rate,scheduled_payment,next_due_at)
    values(g,actor,business,product,application,'USD',100,100,0.05,10,now()+interval '7 days') returning id into loan;
  perform public.record_player_ledger_entry(g,actor,account,100,'USD','credit','banking',
    'ref025_fixture',null,'system',null,'{}'::jsonb);
  select public_key into loan_key from public.player_loans where id=loan;
  select * into payment from public.repay_player_loan_v1(g,actor,loan_key,10,'ref025-repayment');
  if payment.replayed or payment.principal_balance <> 90 then raise exception 'REF025 legacy repayment failed'; end if;
  select * into payment from public.repay_player_loan_v1(g,actor,loan_key,10,'ref025-repayment');
  if not payment.replayed or payment.principal_balance <> 90 then raise exception 'REF025 legacy replay failed'; end if;
  foreach tab in array array['loan_applications','player_loans'] loop
    row_id := case when tab='loan_applications' then application else loan end;
    execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into original using row_id;
    if original->>'liability_kind' <> 'legacy_v1' or original->>'initiating_operator_player_id' is not null
      or original->>'borrower_business_id' is not null or original->>'obligation_currency_code' is not null then
      raise exception 'REF025 legacy defaults changed';
    end if;
    gate := tab||'_business_liability_disabled_v1'; shape := tab||'_liability_shape_v1';
    patch := jsonb_build_object('liability_kind','business_v1','initiating_operator_player_id',actor,'borrower_business_id',business);
    if tab='loan_applications' then patch := patch||'{"obligation_currency_code":"USD"}'::jsonb; end if;
    foreach role_name in array array['postgres','service_role'] loop
      execute format('set local role %I',role_name);
      perform pg_temp.ref025_reject(format('update public.%I set liability_kind=%L, initiating_operator_player_id=%L,
        borrower_business_id=%L%s where id=%L',tab,'business_v1',actor,business,
        case when tab='loan_applications' then ', obligation_currency_code=''USD''' else '' end,row_id),gate);
      perform pg_temp.ref025_reject(format('insert into public.%I select (jsonb_populate_record(null::public.%I,%L)).*',
        tab,tab,original||patch||jsonb_build_object('id',gen_random_uuid())),gate);
      reset role;
    end loop;
    -- Remove ONLY this gate inside the outer rollback transaction to test real constraints.
    execute format('alter table public.%I drop constraint %I',tab,gate);
    perform pg_temp.ref025_reject(format('update public.%I set liability_kind=%L where id=%L',tab,'business_v1',row_id),shape);
    perform pg_temp.ref025_reject(format('update public.%I set initiating_operator_player_id=%L where id=%L',tab,actor,row_id),shape);
    if tab='loan_applications' then
      perform pg_temp.ref025_reject(format('update public.%I set obligation_currency_code=%L where id=%L',tab,'usd',row_id),shape);
    end if;
    -- Isolate the actual composite FKs from the actor-equality/legacy-null shape check.
    execute format('alter table public.%I drop constraint %I',tab,shape);
    perform pg_temp.ref025_reject(format('update public.%I set initiating_operator_player_id=%L where id=%L',tab,other_actor,row_id),tab||'_operator_scope_fk_v1');
    perform pg_temp.ref025_reject(format('update public.%I set borrower_business_id=%L where id=%L',tab,other_business,row_id),tab||'_borrower_scope_fk_v1');
    execute format('update public.%I set initiating_operator_player_id=$1, borrower_business_id=$2 where id=$3',tab)
      using actor,business,row_id;
    raise notice 'REF025 %: legacy defaults; postgres/service gates INSERT+UPDATE; shape; cross-game FKs passed',tab;
  end loop;
end;
$ref025$;

rollback;
-- The test's constraint removals and all fixtures must be gone after rollback.
do $$ begin
  if (select count(*) from pg_constraint where conname in (
    'loan_applications_business_liability_disabled_v1','player_loans_business_liability_disabled_v1',
    'loan_applications_liability_shape_v1','player_loans_liability_shape_v1') and convalidated) <> 4
    or exists(select 1 from public.game_sessions where name like 'REF025 %') then
    raise exception 'REF025 acceptance rollback failed';
  end if;
end $$;
