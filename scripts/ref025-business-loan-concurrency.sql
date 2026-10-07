-- Invoked only inside the attested, exclusively disposable REF025 Banking phase.
-- Real settled sales use existing canonical helpers; no production routine is replaced.
set client_min_messages=warning; -- Canonical funding emits harmless DROP IF EXISTS notices; SQL errors remain fatal.
create temporary table ref025_fixtures(n integer,g uuid,owner_id uuid,buyer uuid,b uuid,business_key text,product_key text,country_id uuid,proposal_id uuid);
begin;
alter table public.loan_applications drop constraint loan_applications_business_liability_disabled_v1;
do $fixture$
begin
for i in 1..(select case when income then 2 else 9 end from ref025_phase) loop
 declare
  staff uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); country uuid:=gen_random_uuid();
  owner_id uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  item uuid:=gen_random_uuid(); store_item uuid:=gen_random_uuid(); offer uuid:=gen_random_uuid();
  listing uuid; product uuid; proposal uuid; quote jsonb; result jsonb; account_key text;
  offer_key text; business_key text; receipt public.store_offer_purchase_receipts%rowtype;
  code text:='RF'||chr(64+i);
 begin
  -- Bootstrap expects the ten canonical active countries; hide only this phase's earlier synthetic country while bootstrapping.
  update public.country_profiles set status='disabled' where id in(select country_id from ref025_fixtures);
  insert into public.staff_users(id,supabase_auth_user_id,email,display_name)
    values(staff,gen_random_uuid(),staff||'@example.test','REF025 concurrency staff');
  insert into public.game_sessions(id,owner_staff_user_id,name,lifecycle_state,provisioning_status)
    values(g,staff,'REF025 concurrency game '||i,'draft','pending');
  insert into public.country_profiles(id,country_code,country_name,capital_name,currency_code,status)
    values(country,code,'REF025 concurrency country '||code,'Test City','ECO','disabled');
  insert into public.players(id,game_session_id,display_name,status,country_id)
    values(owner_id,g,'Sales owner','active',country),(buyer,g,'Sales buyer','active',country);
  insert into public.player_country_assignments(game_session_id,player_id,country_profile_id,status,assignment_reason)
    values(g,owner_id,country,'active','ref025'),(g,buyer,country,'active','ref025');
  insert into public.business_entities(id,game_session_id,owner_player_id,legal_name,entity_type,
    country_code,currency_code,status,tax_classification,formation_state,ownership_model_version)
    values(b,g,owner_id,'REF025 sales borrower','llc',code,'ECO','active','disregarded','operational',1)
    returning public_key into business_key;
  insert into public.game_items(id,game_session_id,canonical_key,source_kind,name,item_class,subtype,
    stackable,serialized,transferable,status)
    values(item,g,'ref025.widget','business_product','Sales Widget','finished_good','widget',true,false,true,'active');
  insert into public.store_items(id,game_session_id,item_key,name,category,price,currency_code,
    stock_quantity,status,visibility,game_item_id)
    values(store_item,g,'ref025_widget','Sales Widget','goods',120,'ECO',0,'active','visible',item);
  insert into public.store_seller_offers(id,game_session_id,store_item_id,game_item_id,seller_party_id,
    seller_kind,unit_price,currency_code,status,replenishment_policy,creation_idempotency_key,creation_request_hash,version)
    select offer,g,store_item,item,id,'business',120,'ECO','draft','none','ref025-sales-offer',repeat('a',64),1
    from public.economic_parties where game_session_id=g and business_id=b returning public_key into offer_key;
  listing := economy_private.ensure_business_store_listing_account_v2(g,b,offer);
  update public.store_seller_offers set inventory_account_id=listing,status='active',version=2 where id=offer;
  insert into public.inventory_holdings(game_session_id,inventory_account_id,game_item_id,quantity_owned,
    quantity_reserved,average_unit_cost,cost_currency_code,version) values(g,listing,item,10,0,2.5,'ECO',1);
  perform public.record_player_ledger_entry(g,buyer,'checking',1000,'ECO','credit','setup',
    'initial_balance_seed',buyer,'system',null,jsonb_build_object('bankTransactionIdempotencyKey','ref025-buyer-seed'));
  insert into public.game_settings(game_session_id,stock_market_window) values(g,'{"timezone":"UTC"}')
    on conflict(game_session_id) do update set stock_market_window=excluded.stock_market_window;
  insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,
    effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,created_at)
    select g,c.id,0,statement_timestamp()-interval '2 minutes','REF025 concurrency game '||i,d.id,d.preset_key,
      statement_timestamp()-interval '3 minutes' from public.country_profiles c
    cross join public.difficulty_policy_profiles d where c.status='active' and d.preset_key='standard';
  result := public.initialize_fx_authority_for_game_v1(g,clock_timestamp()-interval '1 minute',true);
  if result->>'cutoverStatus' is distinct from 'ready' then raise exception 'REF025 fixture FX bootstrap: %',result; end if;
  update public.country_profiles set status='active' where id=country or id in(select country_id from ref025_fixtures);
  update public.game_sessions set lifecycle_state='active',status='active' where id=g;
  insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,
    effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,created_at)
    select g,country,0,statement_timestamp()-interval '2 minutes','REF025 sales TST',id,preset_key,
      statement_timestamp()-interval '3 minutes' from public.difficulty_policy_profiles where preset_key='standard';
  perform public.record_business_ledger_entry_v2(g,b,20,'ECO','credit','business',
    'capital_contribution_in',b,'system',null,jsonb_build_object('bankTransactionIdempotencyKey','ref025-business-seed'));
  quote := public.create_business_store_offer_quote_v2(g,buyer,offer_key,1,2,'ref025-retained-quote');
  result := public.settle_business_store_offer_v2(g,buyer,offer_key,quote->>'quoteKey',1,2,'ref025-retained-sale');
  select * into strict receipt from public.store_offer_purchase_receipts where public_key=result->>'receiptKey';
  if receipt.funding_receipt_id is not null or receipt.gross_revenue<>120
    or receipt.business_credit_ledger_entry_id is null then raise exception 'REF025 retained sale missing'; end if;
  select a.public_key into strict account_key from public.bank_accounts a join public.economic_parties p
    on p.id=a.party_id and p.game_session_id=a.game_session_id
    where a.game_session_id=g and p.player_id=buyer and a.account_kind='checking' and a.currency_code='ECO';
  quote := public.create_business_store_offer_funding_quote_v1(g,buyer,offer_key,1,3,
    jsonb_build_array(jsonb_build_object('sourceAccountKey',account_key,'targetAmount',120)),'ref025-funded-quote');
  result := public.settle_business_store_offer_funding_v1(g,buyer,offer_key,quote->>'quoteKey',1,3,'ref025-funded-sale');
  select * into strict receipt from public.store_offer_purchase_receipts where public_key=result->>'receiptKey';
  if receipt.funding_receipt_id is null or receipt.gross_revenue<>120
    or receipt.business_sales_authority_version<>1 then raise exception 'REF025 funded sale missing'; end if;
  insert into public.loan_products(game_session_id,name,borrower_type,currency_code,minimum_amount,
    maximum_amount,annual_rate,term_cycles,payment_frequency_cycles,maximum_payment_to_income,minimum_credit_score,disclosure_text)
    values(g,'REF025 sales product','business','ECO',1,1000,0,12,2,0.45,600,'Disposable sales-only assessment fixture.') returning id into product;
  insert into public.business_governance_proposals(game_session_id,business_id,proposer_player_id,
    proposal_type,approval_threshold_basis_points,snapshot_total_voting_units,idempotency_key,expires_at)
    values(g,b,owner_id,'capital_raise',5001,1,'ref025-race-mandates',now()+interval '1 day') returning id into proposal;
  if i<=2 then
    insert into public.business_management_mandates(game_session_id,business_id,player_id,source_proposal_id)
      values(g,b,owner_id,proposal),(g,b,buyer,proposal);
  end if;
  insert into ref025_fixtures select i,g,owner_id,buyer,b,business_key,public_key,country,proposal from public.loan_products where id=product;
 end;
end loop;
end $fixture$;
commit;

-- REF025 session helpers
create function pg_temp.ref025_state(g uuid) returns jsonb language sql as $state$
 select jsonb_build_object(
  'applications',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.loan_applications a where game_session_id=g),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.credit_profiles p where game_session_id=g),
  'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_log a where game_session_id=g),
  'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.player_loans l where game_session_id=g),
  'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.ledger_entries l where game_session_id=g),
  'balances',(select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from public.account_balances b where game_session_id=g));
$state$;
create function pg_temp.ref025_fail() returns trigger language plpgsql as $fail$
 begin
  if new.action='business.loan.application.submit' and new.game_session_id::text=tg_argv[0] then
   raise exception using errcode='Z0255',message='REF025 injected audit failure';
  end if;
  return new;
 end;
$fail$;
create function pg_temp.ref025_reject(statement text,expected text) returns void language plpgsql as $reject$
 begin
  begin execute statement;
  exception when others then if sqlerrm=expected or sqlstate=expected then return; end if; raise;
  end; raise exception 'REF025_EXPECTED_REJECTION_MISSING';
 end;
$reject$;
create function pg_temp.ref025_blocker(waiter integer,blocker integer) returns json language sql as $blocker$
 select json_build_object('pid',pid,'start',backend_start::text,'wait',wait_event_type,
  'blockers',pg_blocking_pids(pid),'blockerStart',(select backend_start::text from pg_stat_activity where pid=blocker))
 from pg_stat_activity where pid=waiter;
$blocker$;
create function pg_temp.ref025_rollback(g uuid,statement text) returns void language plpgsql as $rollback$
 begin
  execute format('create trigger ref025_race_failure after insert on public.audit_log for each row execute function pg_temp.ref025_fail(%L)',g);
  perform pg_temp.ref025_reject(statement,'Z0255');
  drop trigger ref025_race_failure on public.audit_log;
 end;
$rollback$;
-- Guarded fixture-state transition only; not a new governance command or explicit mandate revocation.
create function pg_temp.ref025_handoff(g uuid,b uuid,successor uuid,proposal uuid) returns void language sql as $handoff$
 insert into public.business_management_mandates(game_session_id,business_id,player_id,source_proposal_id)
 values(g,b,successor,proposal);
$handoff$;
create function pg_temp.ref025_authority(g uuid,b uuid,proposal uuid) returns jsonb language sql as $authority$
 select jsonb_build_object(
  'business',(select to_jsonb(x) from public.business_entities x where game_session_id=g and id=b),
  'proposal',(select to_jsonb(x) from public.business_governance_proposals x where game_session_id=g and id=proposal),
  'mandates',(select coalesce(jsonb_agg(to_jsonb(x) order by player_id),'[]') from public.business_management_mandates x where game_session_id=g and business_id=b));
$authority$;
create function pg_temp.ref025_eligibility(g uuid,b uuid,product text) returns jsonb language sql as $eligibility$
 select jsonb_build_object(
  'business',(select to_jsonb(x) from public.business_entities x where game_session_id=g and id=b),
  'product',(select to_jsonb(x) from public.loan_products x where game_session_id=g and public_key=product),
  'party',(select to_jsonb(x) from public.economic_parties x where game_session_id=g and business_id=b and party_kind='business'),
  'account',(select to_jsonb(a) from public.bank_accounts a join public.economic_parties p
    on p.game_session_id=a.game_session_id and p.id=a.party_id
    where a.game_session_id=g and p.business_id=b and a.account_kind='checking' and a.currency_code='ECO'));
$eligibility$;
-- Ordinary guarded fixture status writes; no trigger suppression or identity mutation.
create function pg_temp.ref025_status(g uuid,b uuid,product text,target text,value text) returns timestamptz language plpgsql as $status$
 declare changed integer;
 begin
  if target='product' and value in ('active','paused') then
   update public.loan_products set status=value where game_session_id=g and public_key=product;
  elsif target='party' and value in ('active','disabled') then
   update public.economic_parties set status=value where game_session_id=g and business_id=b and party_kind='business';
  elsif target='account' and value in ('active','restricted') then
   update public.bank_accounts a set status=value from public.economic_parties p
    where p.game_session_id=a.game_session_id and p.id=a.party_id
      and a.game_session_id=g and p.business_id=b and a.account_kind='checking' and a.currency_code='ECO';
  else raise exception 'REF025_STATUS_TARGET';
  end if;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'REF025_STATUS_ROW_COUNT: %',changed; end if;
  return transaction_timestamp();
 end;
$status$;

-- Income phase observes complete rows, including canonical settlement journals and projections.
create function pg_temp.ref025_income_state(g uuid) returns jsonb language plpgsql as $income_state$
 declare result jsonb:=jsonb_build_object('economic',pg_temp.ref025_state(g)); name text; rows jsonb;
 begin
  foreach name in array array['store_offer_purchase_receipts','store_offer_purchase_quotes','store_seller_offers',
    'purchase_funding_receipts','purchase_funding_quotes','purchase_funding_quote_lines','bank_transactions','bank_accounts','bank_account_holds',
    'inventory_transactions','inventory_transaction_lines','inventory_holdings','inventory_accounts','inventory_events',
    'business_activity_events'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]'') from public.%I t where game_session_id=$1',name) into rows using g;
   result:=result||jsonb_build_object(name,rows);
  end loop;
  return result;
 end;
$income_state$;
create function pg_temp.ref025_sale(g uuid,b uuid,buyer uuid,key text,funded boolean,saved jsonb default null)
 returns jsonb language plpgsql as $sale$
 declare offer text; version bigint; quote jsonb; result jsonb; account text;
 begin
  if saved is null then
   select o.public_key,o.version into strict offer,version from public.store_seller_offers o
    join public.economic_parties p on p.game_session_id=o.game_session_id and p.id=o.seller_party_id
    where o.game_session_id=g and p.business_id=b;
   if funded then
    select a.public_key into strict account from public.bank_accounts a join public.economic_parties p
     on p.game_session_id=a.game_session_id and p.id=a.party_id
     where a.game_session_id=g and p.player_id=buyer and a.account_kind='checking' and a.currency_code='ECO';
    quote:=public.create_business_store_offer_funding_quote_v1(g,buyer,offer,1,version,
     jsonb_build_array(jsonb_build_object('sourceAccountKey',account,'targetAmount',120)),key||'-quote');
   else quote:=public.create_business_store_offer_quote_v2(g,buyer,offer,1,version,key||'-quote'); end if;
  else offer:=saved->>'offer'; version:=(saved->>'version')::bigint; quote:=saved->'quote'; end if;
  if funded then result:=public.settle_business_store_offer_funding_v1(g,buyer,offer,quote->>'quoteKey',1,version,key);
  else result:=public.settle_business_store_offer_v2(g,buyer,offer,quote->>'quoteKey',1,version,key); end if;
  return jsonb_build_object('offer',offer,'version',version,'quote',quote,'result',result,'asOf',clock_timestamp());
 end;
$sale$;
-- Same captured time on both sides of a commit isolates MVCC from time-window eligibility.
-- STABLE propagates the outer statement snapshot; the temporary barrier does not replace assessment.
create function pg_temp.ref025_income(g uuid,b uuid,product text,at_time timestamptz,barrier bigint default null)
 returns jsonb language plpgsql stable as $income$
 declare result jsonb;
 begin
  if barrier is not null then perform pg_advisory_xact_lock(barrier); end if;
  select to_jsonb(a) into strict result from public.loan_products p cross join lateral
   economy_private.assess_business_loan_application_v1(g,b,p.id,120,at_time) a
   where p.game_session_id=g and p.public_key=product;
  return result;
 end;
$income$;
create function pg_temp.ref025_sale_effects(before_state jsonb,after_state jsonb,b uuid,buyer uuid,funded boolean,at_time timestamptz)
 returns void language plpgsql as $sale_effects$
 declare receipt jsonb; name text; old_row jsonb; new_row jsonb; delta numeric;
 begin
  for name in select unnest(array['applications','profiles','loans']) loop
   if before_state->'economic'->name is distinct from after_state->'economic'->name then raise exception 'REF025_SALE_LOAN_EFFECT'; end if;
  end loop;
  for name in select unnest(array['store_offer_purchase_receipts','inventory_transactions','business_activity_events']) loop
   if jsonb_array_length(after_state->name)<>jsonb_array_length(before_state->name)+1
     or not (after_state->name @> before_state->name) then raise exception 'REF025_SALE_ROW_COUNT: %',name; end if;
  end loop;
  select x into strict receipt from jsonb_array_elements(after_state->'store_offer_purchase_receipts') x
   where not (before_state->'store_offer_purchase_receipts' @> jsonb_build_array(x));
  if (receipt->>'business_id'=b::text and receipt->>'buyer_player_id'=buyer::text
    and receipt->>'currency_code'='ECO' and (receipt->>'gross_revenue')::numeric=120
    and (receipt->>'quantity')::integer=1 and (receipt->>'business_sales_authority_version')::integer=1
    and (receipt->>'business_sales_authority_committed_at')::timestamptz between at_time-interval '84 days' and at_time
    and ((receipt->>'funding_receipt_id') is not null)=funded) is not true then raise exception 'REF025_SALE_RECEIPT'; end if;
  if jsonb_array_length(after_state->'purchase_funding_receipts')<>jsonb_array_length(before_state->'purchase_funding_receipts')+funded::integer
    or not (after_state->'purchase_funding_receipts' @> before_state->'purchase_funding_receipts')
    or jsonb_array_length(after_state->'economic'->'ledger')<>jsonb_array_length(before_state->'economic'->'ledger')+(case when funded then 2 else 4 end)
    or not (after_state->'economic'->'ledger' @> before_state->'economic'->'ledger') then raise exception 'REF025_SALE_MONEY_COUNT'; end if;
  if jsonb_array_length(after_state->'economic'->'balances')<>jsonb_array_length(before_state->'economic'->'balances')
    or jsonb_array_length(after_state->'inventory_holdings')<>jsonb_array_length(before_state->'inventory_holdings') then raise exception 'REF025_SALE_PROJECTION_COUNT'; end if;
  for old_row in select x from jsonb_array_elements(before_state->'economic'->'balances') x loop
   select x into strict new_row from jsonb_array_elements(after_state->'economic'->'balances') x where x->>'id'=old_row->>'id';
   delta:=case when old_row->>'business_id'=b::text then 120 when old_row->>'player_id'=buyer::text and old_row->>'account_type'='checking' then -120 else 0 end;
   if (new_row->>'balance')::numeric<>(old_row->>'balance')::numeric+delta
     or new_row-array['balance','updated_at','last_ledger_entry_id'] is distinct from old_row-array['balance','updated_at','last_ledger_entry_id'] then raise exception 'REF025_SALE_BALANCE'; end if;
  end loop;
  for old_row in select x from jsonb_array_elements(before_state->'inventory_holdings') x loop
   select x into strict new_row from jsonb_array_elements(after_state->'inventory_holdings') x where x->>'id'=old_row->>'id';
   delta:=case when old_row->>'inventory_account_id'=receipt->>'listing_inventory_account_id' then -1
     when old_row->>'inventory_account_id'=receipt->>'buyer_inventory_account_id' then 1 else 0 end;
   if (new_row->>'quantity_owned')::numeric<>(old_row->>'quantity_owned')::numeric+delta
     or new_row->'quantity_reserved' is distinct from old_row->'quantity_reserved' then raise exception 'REF025_SALE_INVENTORY'; end if;
  end loop;
 end;
$sale_effects$;
