import { randomUUID } from "node:crypto";
export const signature = "public.review_player_loan_application_v1(uuid,uuid,text,text,text,text)";
export const migrationPath = "backend/supabase/migrations/20261103082914_qualify_business_loan_review_status_v1.sql";
export const helpers = `
create function pg_temp.check_loan(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Loan assertion failed: %',label; end if; end $$;
create function pg_temp.loan_denied(command text,expected_state text,expected_message text default null) returns void language plpgsql as $$
begin begin execute command; exception when others then
 if sqlstate=expected_state and (expected_message is null or sqlerrm=expected_message) then return; end if;
 raise exception 'Expected % / %, got % / %',expected_state,expected_message,sqlstate,sqlerrm;
 end; raise exception 'Expected denied command succeeded'; end $$;
`;
export function fixture(options={}) {
  const f = Object.fromEntries(["staff","otherStaff","game","otherGame","actor","otherActor","business","product","app"].map(k=>[k,randomUUID()]));
  Object.assign(f,{amount:200,feeRate:0.02,fee:4,net:196,scheduled:20},options);
  f.currency = `QL${randomUUID().replaceAll('-','').slice(0,8).toUpperCase()}`;
  f.appKey = `lna_${randomUUID().replaceAll('-','')}`;
  f.bizKey = `biz_${randomUUID().replaceAll('-','')}`;
  f.account = `business:${f.bizKey}`;
  f.setup = `
insert into public.currencies(code,country_code,name,symbol,status,currency_kind) values('${f.currency}','ZZ','Synthetic loan qualification','QL','active','national');
insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values
 ('${f.staff}',gen_random_uuid(),'${f.staff}@example.test','Synthetic loan Staff'),
 ('${f.otherStaff}',gen_random_uuid(),'${f.otherStaff}@example.test','Other synthetic Staff');
insert into public.game_sessions(id,owner_staff_user_id,name,status) values
 ('${f.game}','${f.staff}','Synthetic loan qualification','active'),('${f.otherGame}','${f.otherStaff}','Synthetic isolation game','active');
insert into public.players(id,game_session_id,display_name,status) values
 ('${f.actor}','${f.game}','Synthetic borrower','active'),('${f.otherActor}','${f.game}','Other synthetic player','active');
insert into public.business_entities(id,public_key,game_session_id,owner_player_id,legal_name,country_code,currency_code,tax_classification)
 values('${f.business}','${f.bizKey}','${f.game}','${f.actor}','Synthetic retained borrower','US','${f.currency}','disregarded');
select public.ensure_business_bank_account_v2('${f.game}','${f.business}');
insert into public.loan_products(id,game_session_id,name,borrower_type,currency_code,minimum_amount,maximum_amount,annual_rate,term_cycles,origination_fee_rate,disclosure_text)
 values('${f.product}','${f.game}','Synthetic retained loan','business','${f.currency}',1,1000,0.05,12,${f.feeRate},'Synthetic retained approval qualification only.');
insert into public.loan_applications(id,public_key,game_session_id,player_id,business_id,loan_product_id,amount,purpose,repayment_source,credit_score,projected_payment,affordability_ratio,idempotency_key,request_hash)
 values('${f.app}','${f.appKey}','${f.game}','${f.actor}','${f.business}','${f.product}',${f.amount},'Synthetic retained application','${f.account}',650,${f.scheduled},0.1,'synthetic-${f.app}',repeat('7',64));
`;
  return f;
}
export const call = (f,decision="approve",key="synthetic-review-key",staff=f.staff,game=f.game) => `select * from public.review_player_loan_application_v1('${game}','${staff}','${f.appKey}','${decision}','Synthetic review','${key}')`;
export const snapshot = f => `select json_build_object(
 'application',(select to_jsonb(a) from public.loan_applications a where id='${f.app}'),
 'loans',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.player_loans l where game_session_id='${f.game}'),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from public.ledger_entries l where game_session_id='${f.game}'),
 'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.bank_transactions t where game_session_id='${f.game}'),
 'balances',(select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from public.account_balances b where game_session_id='${f.game}'),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_log a where game_session_id='${f.game}')
 )::text;`;
export const assertApproval = f => `
select pg_temp.check_loan((select status='approved' and reviewed_by_staff_user_id='${f.staff}'::uuid and reviewed_at is not null and review_reason like 'Synthetic %' from public.loan_applications where id='${f.app}'),'application reviewed fields');
select pg_temp.check_loan((select count(*)=1 from public.player_loans where application_id='${f.app}'),'exactly one loan');
select pg_temp.check_loan((select game_session_id='${f.game}'::uuid and player_id='${f.actor}'::uuid and business_id='${f.business}'::uuid
 and loan_product_id='${f.product}'::uuid and currency_code='${f.currency}' and original_principal=${f.amount} and principal_balance=${f.amount}
 and origination_fee=${f.fee} and annual_rate=0.05 and scheduled_payment=${f.scheduled} and repayment_account_type='${f.account}' and liability_kind='legacy_v1'
 and next_due_at=(select reviewed_at+interval '7 days' from public.loan_applications where id='${f.app}')
 from public.player_loans where application_id='${f.app}'),'exact bound obligation');
select pg_temp.check_loan((select count(*)=2 and sum(amount)=0 and min(amount)=-${f.net} and max(amount)=${f.net} from public.ledger_entries where game_session_id='${f.game}' and source_action='loan_disbursement'),'exact balanced disbursement pair');
select pg_temp.check_loan((select count(*)=1 from public.player_loans l join public.ledger_entries e on e.id=l.disbursement_ledger_entry_id
 where l.application_id='${f.app}' and e.game_session_id=l.game_session_id and e.business_id=l.business_id and e.currency_code=l.currency_code
 and e.account_type=l.repayment_account_type and e.amount=${f.net}),'disbursement currency/business/account binding');
select pg_temp.check_loan((select balance=${f.net} and business_id='${f.business}'::uuid from public.account_balances
 where game_session_id='${f.game}' and account_type='${f.account}' and currency_code='${f.currency}'),'net projected balance');
select pg_temp.check_loan((select count(*)=1 from public.audit_log where game_session_id='${f.game}' and action='loan.application.approve'
 and metadata->>'application_key'='${f.appKey}'),'one approval audit');
select pg_temp.check_loan((select count(*)=1 from public.bank_transactions where game_session_id='${f.game}' and source_domain='loans' and source_action='loan_disbursement' and posting_version='balanced_v2' and transaction_kind='compatibility_bridge' and source_id=(select id from public.player_loans where application_id='${f.app}')),'one balanced bank transaction');
select pg_temp.check_loan((select count(*)=2 and sum(e.amount)=0 from public.ledger_entries e join public.bank_transactions bt on bt.id=e.bank_transaction_id
 where bt.game_session_id='${f.game}' and bt.source_action='loan_disbursement' and e.currency_code='${f.currency}'),'same transaction currency balanced lines');
select pg_temp.check_loan((select count(*)=1 from public.ledger_entries e join public.bank_accounts ba on ba.id=e.bank_account_id
 where e.game_session_id='${f.game}' and e.source_action='loan_disbursement' and e.amount=-${f.net} and ba.account_kind='compatibility_offset'
 and e.line_metadata->>'nonSpendable'='true' and e.line_metadata->>'compatibilityRole'='signed_offset'),'one non-spendable offset');
select pg_temp.check_loan((select count(*)=3 from public.audit_log where game_session_id='${f.game}' and action in ('loans.loan_disbursement','loan.application.approve')),'exact three audit rows');
select pg_temp.check_loan((select count(*)=1 from public.audit_log a join public.bank_transactions bt on bt.id=a.target_id
 where a.game_session_id='${f.game}' and a.action='loans.loan_disbursement' and a.target_type='bank_transaction' and bt.source_id=(select id from public.player_loans where application_id='${f.app}')),'one posting audit');
select pg_temp.check_loan((select count(*)=1 from public.audit_log where game_session_id='${f.game}' and action='loans.loan_disbursement' and target_type='player' and target_id='${f.actor}' and metadata->>'ledger_entry_id'=(select disbursement_ledger_entry_id::text from public.player_loans where application_id='${f.app}')),'one gateway audit');
select pg_temp.check_loan(not exists(select 1 from public.player_loans where game_session_id='${f.otherGame}')
 and not exists(select 1 from public.ledger_entries where game_session_id='${f.otherGame}'),'no cross-game effects');
`;
