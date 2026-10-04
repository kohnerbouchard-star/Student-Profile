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
  insert into public.currencies(code,country_code,name,symbol,status,currency_kind)
    values('QREFLOAN','ZZ','REF025 synthetic fixture','QRF','active','national');
  insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
    values(staff,gen_random_uuid(),staff||'@example.test','REF025 disposable');
  insert into public.game_sessions(id,owner_staff_user_id,name,status)
    values(g,staff,'REF025 first','active'),(other_game,staff,'REF025 second','active');
  insert into public.players(id,game_session_id,display_name,status)
    values(actor,g,'REF025 actor','active'),(other_actor,other_game,'REF025 other','active');
  insert into public.business_entities(id,game_session_id,owner_player_id,legal_name,country_code,currency_code,tax_classification)
    values(business,g,actor,'REF025 borrower','US','QREFLOAN','disregarded'),
      (other_business,other_game,other_actor,'REF025 other borrower','US','QREFLOAN','disregarded');
  select public.business_account_type_v1(public_key) into account from public.business_entities where id=business;
  perform public.ensure_business_bank_account_v2(g,business);
  insert into public.loan_products(game_session_id,name,borrower_type,currency_code,minimum_amount,
    maximum_amount,annual_rate,term_cycles,disclosure_text)
    values(g,'REF025 product','business','QREFLOAN',1,1000,0.05,12,'Disposable compatibility fixture only.') returning id into product;
  insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,
    purpose,repayment_source,credit_score,projected_payment,affordability_ratio,idempotency_key,request_hash)
    values(g,actor,business,product,100,'Fixture',account,650,10,0.1,'ref025-legacy',repeat('a',64)) returning id into application;
  insert into public.player_loans(game_session_id,player_id,business_id,loan_product_id,application_id,
    currency_code,original_principal,principal_balance,annual_rate,scheduled_payment,next_due_at)
    values(g,actor,business,product,application,'QREFLOAN',100,100,0.05,10,now()+interval '7 days') returning id into loan;
  perform public.record_player_ledger_entry(g,actor,account,100,'QREFLOAN','credit','admin',
    'business_banking_correction',null,'system',null,'{}'::jsonb);
  -- A personal legacy obligation must survive the same upgrade and keep its account.
  perform private.ensure_bank_account_projection_v1(g,private.ensure_player_bank_account_v1(g,actor,'checking','QREFLOAN'));
  insert into public.loan_products(game_session_id,name,borrower_type,currency_code,minimum_amount,
    maximum_amount,annual_rate,term_cycles,disclosure_text)
    values(g,'REF025 personal','player','QREFLOAN',1,1000,0.05,12,'Disposable personal legacy fixture.') returning id into product;
  insert into public.loan_applications(game_session_id,player_id,loan_product_id,amount,purpose,
    repayment_source,credit_score,projected_payment,affordability_ratio,idempotency_key,request_hash)
    values(g,actor,product,100,'Personal fixture','checking',650,10,0.1,'ref025-personal',repeat('c',64)) returning id into application;
  insert into public.player_loans(game_session_id,player_id,loan_product_id,application_id,currency_code,
    original_principal,principal_balance,annual_rate,scheduled_payment,next_due_at)
    values(g,actor,product,application,'QREFLOAN',100,100,0.05,10,now()+interval '7 days');
  select application_id into application from public.player_loans where id=loan;
  perform public.record_player_ledger_entry(g,actor,'checking',100,'QREFLOAN','credit','admin',
    'business_banking_correction',null,'system',null,'{}'::jsonb);
  for loan_key in select public_key from public.player_loans where game_session_id=g loop
  select * into payment from public.repay_player_loan_v1(g,actor,loan_key,10,'ref025-repayment');
  if payment.replayed or payment.principal_balance <> 90 then raise exception 'REF025 legacy repayment failed'; end if;
  select * into payment from public.repay_player_loan_v1(g,actor,loan_key,10,'ref025-repayment');
  if not payment.replayed or payment.principal_balance <> 90 then raise exception 'REF025 legacy replay failed'; end if;
  end loop;
  -- c2-0: real legacy review/authority behaviour; undo this probe before c1 checks.
  declare manager uuid:=gen_random_uuid(); proposal uuid; key text; reviewed record; again record;
  begin
    select public_key into key from public.loan_applications where id=application;
    begin
      perform * from public.review_player_loan_application_v1(g,staff,key,'approve','Characterize','ref025-review-first');
      raise exception 'REF025 expected inherited review ambiguity';
    exception when ambiguous_column then
      if sqlerrm <> 'column reference "status" is ambiguous' then raise; end if;
    end;
    update public.loan_applications set status='approved' where id=application;
    select * into reviewed from public.review_player_loan_application_v1(g,staff,key,'decline','Changed decision','ref025-review-first');
    select * into again from public.review_player_loan_application_v1(g,staff,key,'invalid','Changed payload','ref025-review-other');
    if reviewed.replayed is distinct from true or reviewed.status is distinct from 'approved'
      or to_jsonb(reviewed) is distinct from to_jsonb(again) then
      raise exception 'REF025 legacy terminal replay changed';
    end if;
    insert into public.players(id,game_session_id,display_name,status) values(manager,g,'REF025 operator','active');
    insert into public.business_governance_proposals(game_session_id,business_id,proposer_player_id,proposal_type,
      approval_threshold_basis_points,snapshot_total_voting_units,idempotency_key,expires_at)
      values(g,business,actor,'capital_raise',5001,1,'ref025-mandate-fixture',now()+interval '1 day') returning id into proposal;
    insert into public.business_management_mandates(game_session_id,business_id,player_id,source_proposal_id)
      values(g,business,manager,proposal);
    if (select business_id from public.resolve_player_business_v2(g,manager)) is distinct from business then
      raise exception 'REF025 canonical mandate not recognized';
    end if;
    begin
      insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,purpose,
        repayment_source,credit_score,projected_payment,affordability_ratio,idempotency_key,request_hash)
        select g,manager,business,loan_product_id,10,'Mandate probe',account,650,1,0.1,'ref025-mandate',repeat('d',64)
        from public.loan_applications where id=application;
      raise exception 'REF025 retained binding accepted non-owner';
    exception when raise_exception then
      if sqlerrm <> 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' then raise; end if;
    end;
    raise exception using errcode='Z0252',message='rollback characterization probe';
  exception when sqlstate 'Z0252' then null;
  end;
  foreach tab in array array['loan_applications','player_loans'] loop
    row_id := case when tab='loan_applications' then application else loan end;
    execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into original using row_id;
    if original->>'liability_kind' <> 'legacy_v1' or original->>'initiating_operator_player_id' is not null
      or original->>'borrower_business_id' is not null or original->>'obligation_currency_code' is not null then
      raise exception 'REF025 legacy defaults changed';
    end if;
    gate := tab||'_business_liability_disabled_v1'; shape := tab||'_liability_shape_v1';
    patch := jsonb_build_object('liability_kind','business_v1','initiating_operator_player_id',actor,'borrower_business_id',business);
    if tab='loan_applications' then patch := patch||'{"obligation_currency_code":"QREFLOAN"}'::jsonb; end if;
    foreach role_name in array array['postgres','service_role'] loop
      execute format('set local role %I',role_name);
      perform pg_temp.ref025_reject(format('update public.%I set liability_kind=%L, initiating_operator_player_id=%L,
        borrower_business_id=%L%s where id=%L',tab,'business_v1',actor,business,
        case when tab='loan_applications' then ', obligation_currency_code=''QREFLOAN''' else '' end,row_id),gate);
      perform pg_temp.ref025_reject(format('insert into public.%I select (jsonb_populate_record(null::public.%I,%L)).*',
        tab,tab,original||patch||jsonb_build_object('id',gen_random_uuid())),gate);
      reset role;
    end loop;
    -- Remove ONLY this gate inside the outer rollback transaction to test real constraints.
    execute format('alter table public.%I drop constraint %I',tab,gate);
    perform pg_temp.ref025_reject(format('update public.%I set liability_kind=%L where id=%L',tab,'business_v1',row_id),shape);
    perform pg_temp.ref025_reject(format('update public.%I set initiating_operator_player_id=%L where id=%L',tab,actor,row_id),shape);
    execute format('update public.%I set liability_kind=%L, initiating_operator_player_id=%L,
      borrower_business_id=%L%s where id=%L',tab,'business_v1',actor,business,
      case when tab='loan_applications' then ', obligation_currency_code=''QREFLOAN''' else '' end,row_id);
    execute format('select to_jsonb(t) from public.%I t where id=$1',tab) into patch using row_id;
    if patch->>'liability_kind' <> 'business_v1' then raise exception 'REF025 valid business shape missing'; end if;
    perform pg_temp.ref025_reject(format('update public.%I set initiating_operator_player_id=%L where id=%L',tab,other_actor,row_id),shape);
    perform pg_temp.ref025_reject(format('update public.%I set borrower_business_id=%L where id=%L',tab,other_business,row_id),shape);
    if tab='loan_applications' then
      perform pg_temp.ref025_reject(format('update public.%I set obligation_currency_code=%L where id=%L',tab,'qrefloan',row_id),shape);
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
    or exists(select 1 from public.game_sessions where name like 'REF025 %')
    or exists(select 1 from public.currencies where code='QREFLOAN') then
    raise exception 'REF025 acceptance rollback failed';
  end if;
end $$;

-- c2-0 query-unit characterization: execute the deployed predicate/formula,
-- substituting only its ledger relation with temporary boundary rows, not a new policy.
begin;
create temp table ref025_income_rows(game_session_id uuid,player_id uuid,currency_code text,
  amount numeric,created_at timestamptz,source_domain text,source_action text,account_type text);
do $compile$ declare definition text; fragment text; first integer; last integer; begin
  definition:=pg_get_functiondef('public.apply_player_loan_v1(uuid,uuid,text,text,numeric,text,text,text)'::regprocedure);
  first:=strpos(definition,'  select coalesce(sum(entry_row.amount), 0)');
  last:=strpos(definition,'  if v_ratio > v_product.maximum_payment_to_income');
  if first=0 or last<=first then raise exception 'REF025 deployed affordability boundaries changed'; end if;
  fragment:=replace(substr(definition,first,last-first),'public.ledger_entries','pg_temp.ref025_income_rows');
  execute $ddl$create function pg_temp.ref025_income(p_game_session_id uuid,p_player_id uuid) returns numeric[]
    language plpgsql as $body$ declare v_product record; v_context record; v_business record;
      v_qualifying_inflows numeric; v_income_per_payment numeric; v_payment numeric:=10; v_ratio numeric;
    begin
      select 'business'::text borrower_type,2 payment_frequency_cycles into v_product;
      select 'QREFLOAN'::text currency_code into v_context;
      select ('biz_'||repeat('a',32))::text public_key into v_business;
    $ddl$||fragment||'return array[v_qualifying_inflows,v_income_per_payment,v_ratio]; end $body$;';
end $compile$;
do $income$ declare g uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); row record; result numeric[]; begin
  for row in select * from (values
    (240,'checking','admin','business_banking_correction',interval '0 days',0),
    (120,'business:biz_'||repeat('a',32),'store','business_offer_purchase_credit',interval '0 days',0),
    (60,'checking','admin','business_banking_correction',interval '84 days',0),
    (30,'checking','business','capital_contribution_in',interval '0 days',0),
    (50,'checking','business','ipo_primary_subscription',interval '0 days',0),
    (70,'checking','banking_fx','exchange_credit',interval '0 days',0),
    (999,'savings','admin','business_banking_correction',interval '0 days',0),
    (999,'checking','banking','account_transfer_in',interval '0 days',0),
    (999,'checking','loans','loan_disbursement',interval '0 days',0),
    (999,'checking','business','capitalization_in',interval '0 days',0),
    (999,'checking','business','ownership_cash_transfer_in',interval '0 days',0),
    (999,'checking','admin','business_banking_correction',interval '84 days 1 second',0),
    (999,'checking','admin','business_banking_correction',interval '0 days',1),
    (999,'checking','admin','business_banking_correction',interval '0 days',2),
    (999,'checking','admin','business_banking_correction',interval '0 days',3),
    (-999,'checking','admin','business_banking_correction',interval '0 days',0)
  ) as fixtures(amount,account,domain,action,age,mismatch) loop
    insert into ref025_income_rows values(case when row.mismatch=1 then gen_random_uuid() else g end,
      case when row.mismatch=2 then gen_random_uuid() else p end,case when row.mismatch=3 then 'OTHER' else 'QREFLOAN' end,
      row.amount,now()-row.age,row.domain,row.action,row.account);
  end loop;
  result:=pg_temp.ref025_income(g,p);
  if result is distinct from array[570,95,0.105263]::numeric[] then raise exception 'REF025 legacy income changed: %',result; end if;
  truncate ref025_income_rows;
  if pg_temp.ref025_income(g,p) is distinct from array[0,0,100]::numeric[] then raise exception 'REF025 empty income changed'; end if;
end $income$;
-- Invoke the actual receipt validator on temporary rows: both unsupported
-- provenance forms must be rejected. Successful settlement remains existing Store CI's responsibility.
create temp table ref025_receipt_probe as select * from public.store_offer_purchase_receipts with no data;
create trigger ref025_receipt_probe before insert on ref025_receipt_probe
  for each row execute function economy_private.validate_store_offer_purchase_receipt_v2();
do $receipts$ declare funding uuid; expected text; begin
  foreach funding in array array[null::uuid,gen_random_uuid()] loop
    expected:=case when funding is null then 'STORE_OFFER_PURCHASE_RECEIPT_BUYER_DEBIT_INVALID'
      else 'STORE_OFFER_PURCHASE_RECEIPT_FUNDING_INVALID' end;
    begin
      insert into ref025_receipt_probe(game_session_id,funding_receipt_id) values(gen_random_uuid(),funding);
      raise exception 'REF025 receipt accepted without provenance';
    exception when raise_exception then if sqlerrm <> expected then raise; end if;
    end;
  end loop;
end $receipts$;
rollback;
do $$ begin
  if to_regclass('pg_temp.ref025_income_rows') is not null or to_regclass('pg_temp.ref025_receipt_probe') is not null then
    raise exception 'REF025 characterization fixtures survived rollback';
  end if;
end $$;
