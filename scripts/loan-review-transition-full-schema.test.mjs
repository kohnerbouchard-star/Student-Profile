import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindLoanDatabase } from "./loan-review-transition-binding.mjs";
import { fixture, call, helpers, signature, migrationPath, assertApproval } from "./loan-review-transition-fixtures.mjs";

test("effective migrated retained loan approval and guards", async t => {
 const {sql}=bindLoanDatabase();
 const expected=readFileSync(migrationPath,"utf8").split("as $$")[1].split("$$;")[0].trim();
 const metadata=JSON.parse(sql(`select json_build_object('body',prosrc,'definer',prosecdef,'settings',proconfig,'result',pg_get_function_result(oid),
 'public',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
 'anon',has_function_privilege('anon',oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
 'service',has_function_privilege('service_role',oid,'EXECUTE')) from pg_proc where oid='${signature}'::regprocedure;`));
 assert.equal(metadata.body.trim(),expected);
 assert.equal(metadata.definer,true); assert.deepEqual(metadata.settings,["search_path=public, pg_temp"]);
 assert.equal(metadata.result,"TABLE(application_key text, status text, loan_key text, principal numeric, scheduled_payment numeric, replayed boolean)");
 assert.equal(metadata.public,false);assert.equal(metadata.anon,false);assert.equal(metadata.authenticated,false);assert.equal(metadata.service,true);
 const scenario=async(name,body,options)=>t.test(name,()=>{const f=fixture(options);sql(`begin; ${helpers} ${f.setup} ${body(f)} rollback;`);});
 await scenario("service approval exact economics, duplicate receipts and retained terminal replay",f=>`
 create temp table result as ${call(f)} with no data; grant insert on result to service_role;
 set local role service_role; insert into result ${call(f)}; reset role;
 select pg_temp.check_loan((select application_key='${f.appKey}' and status='approved' and principal=200 and scheduled_payment=20 and replayed=false from result),'actual service result');
 ${assertApproval(f)}
 create temp table before_effects as select (select count(*) from public.ledger_entries where game_session_id='${f.game}') ledger,
 (select count(*) from public.audit_log where game_session_id='${f.game}') audit;
 create temp table same_key as ${call(f)};
 create temp table other_key as ${call(f,'decline','synthetic-other-key')};
 create temp table invalid as ${call(f,'invalid','synthetic-third-key')};
 select pg_temp.check_loan((select replayed and status='approved' and loan_key=(select loan_key from result) from same_key),'same key replays');
 select pg_temp.check_loan((select to_jsonb(o)=to_jsonb(i) from other_key o cross join invalid i),'changed payload retains terminal result');
 select pg_temp.check_loan((select replayed and status='approved' from other_key),'terminal decision unchanged');
 select pg_temp.check_loan((select count(*) from public.ledger_entries where game_session_id='${f.game}')=(select ledger from before_effects)
 and (select count(*) from public.audit_log where game_session_id='${f.game}')=(select audit from before_effects),'replay no new effects');
 ${assertApproval(f)}`);
 await scenario("fractional principal uses retained cent-rounded origination fee",f=>`${call(f)}; ${assertApproval(f)}`,{amount:100.01,feeRate:0.025,fee:2.50,net:97.51,scheduled:10});
 await scenario("decline and terminal changed-payload replay create no obligation",f=>`
 create temp table result as ${call(f,'decline')}; create temp table again as ${call(f,'approve','synthetic-new-key')};
 select pg_temp.check_loan((select status='declined' and replayed=false and loan_key is null and principal is null from result),'decline result');
 select pg_temp.check_loan((select status='declined' and replayed=true and loan_key is null from again),'decline replay');
 select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}') and not exists(select 1 from public.ledger_entries where game_session_id='${f.game}'),'decline no economics');
 select pg_temp.check_loan((select count(*)=1 from public.audit_log where game_session_id='${f.game}' and action='loan.application.decline'),'one decline audit');`);
 await scenario("browser ACLs, wrong Staff, wrong game and missing application fail closed",f=>`
 set local role anon; select pg_temp.loan_denied($q$${call(f)}$q$,'42501'); reset role;
 set local role authenticated; select pg_temp.loan_denied($q$${call(f)}$q$,'42501'); reset role;
 select pg_temp.loan_denied($q$${call(f,'approve','wrong-staff',f.otherStaff)}$q$,'P0001','STAFF_GAME_ACCESS_DENIED');
 select pg_temp.loan_denied($q$${call(f,'approve','wrong-game',f.otherStaff,f.otherGame)}$q$,'P0001','LOAN_APPLICATION_NOT_FOUND');
 update public.game_sessions set owner_staff_user_id='${f.staff}' where id='${f.otherGame}';
 select pg_temp.loan_denied($q$${call(f,'approve','other-owned-game',f.staff,f.otherGame)}$q$,'P0001','LOAN_APPLICATION_NOT_FOUND');
 select pg_temp.loan_denied($q$${call({...f,appKey:'lna_'+ '0'.repeat(32)})}$q$,'P0001','LOAN_APPLICATION_NOT_FOUND');
 select pg_temp.loan_denied($q$${call(f,'invalid')}$q$,'P0001','LOAN_REVIEW_DECISION_INVALID');
 select pg_temp.check_loan((select status='pending_review' from public.loan_applications where id='${f.app}') and not exists(select 1 from public.ledger_entries where game_session_id='${f.game}'),'denials unchanged');`);
 for(const state of ['distressed','closed']) await scenario(`business ${state} rejects approval`,f=>`
 update public.business_entities set status='${state}' where id='${f.business}';
 select pg_temp.loan_denied($q$${call(f)}$q$,'P0001','AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED');
 select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}'),'no ineligible loan');`);
 await scenario("restructuring retains eligible existing review behavior",f=>`update public.business_entities set status='restructuring' where id='${f.business}'; ${call(f)}; ${assertApproval(f)}`);
 await scenario("existing binding rejects missing/non-owner business and wrong product game/currency",f=>`
 select pg_temp.loan_denied($q$update public.loan_applications set business_id=gen_random_uuid() where id='${f.app}'$q$,'P0001','AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED');
 select pg_temp.loan_denied($q$update public.loan_applications set player_id='${f.otherActor}' where id='${f.app}'$q$,'P0001','AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED');
 select pg_temp.loan_denied($q$update public.loan_applications set loan_product_id=gen_random_uuid() where id='${f.app}'$q$,'P0001','LOAN_PRODUCT_NOT_FOUND');
 select pg_temp.loan_denied($q$update public.loan_applications set repayment_source='business:biz_${'0'.repeat(32)}' where id='${f.app}'$q$,'P0001','LOAN_REPAYMENT_ACCOUNT_INVALID');
 select pg_temp.check_loan((select player_id='${f.actor}'::uuid and business_id='${f.business}'::uuid and repayment_source='${f.account}' from public.loan_applications where id='${f.app}'),'binding remains original');`);
 await scenario("currency drift denies unavailable account without partial effects",f=>`
 update public.loan_products set currency_code='USD' where id='${f.product}';
 select pg_temp.loan_denied($q$${call(f)}$q$,'P0001','LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE');
 select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}') and not exists(select 1 from public.ledger_entries where game_session_id='${f.game}'),'currency mismatch no posting');`);
 await scenario("closed canonical bank account denies posting atomically",f=>`
 update public.bank_accounts set status='closed' where id=(select bank_account_id from public.account_balances where game_session_id='${f.game}' and account_type='${f.account}');
 select pg_temp.loan_denied($q$${call(f)}$q$,'P0001','BANK_ACCOUNT_OR_MINOR_UNIT_INVALID');
 select pg_temp.check_loan((select status='pending_review' from public.loan_applications where id='${f.app}') and not exists(select 1 from public.player_loans where application_id='${f.app}') and not exists(select 1 from public.bank_transactions where game_session_id='${f.game}'),'closed account no partial effects');`);
 await scenario("retained personal review still binds canonical checking",f=>`
 select private.ensure_bank_account_projection_v1('${f.game}',private.ensure_player_bank_account_v1('${f.game}','${f.actor}','checking','${f.currency}'));
 update public.loan_products set borrower_type='player' where id='${f.product}';
 update public.loan_applications set business_id=null,repayment_source='checking' where id='${f.app}';
 ${call(f)};
 select pg_temp.check_loan((select business_id is null and player_id='${f.actor}'::uuid and original_principal=200 and origination_fee=4 and repayment_account_type='checking' from public.player_loans where application_id='${f.app}'),'personal obligation preserved');
 select pg_temp.check_loan((select balance=196 from public.account_balances where game_session_id='${f.game}' and player_id='${f.actor}' and account_type='checking' and currency_code='${f.currency}'),'personal checking disbursement');
 select pg_temp.check_loan((select count(*)=2 and sum(amount)=0 from public.ledger_entries where game_session_id='${f.game}' and source_action='loan_disbursement'),'personal balanced posting');`);
 await scenario("new business liability creation checks remain enabled",f=>`
 select pg_temp.check_loan((select count(*)=2 and bool_and(convalidated) from pg_constraint where conname in ('loan_applications_business_liability_disabled_v1','player_loans_business_liability_disabled_v1')),'both creation gates validated');
 select pg_temp.check_loan((select liability_kind='legacy_v1' from public.loan_applications where id='${f.app}'),'legacy fixture only');`);
 await scenario("post-disbursement audit failure rolls back all economic and review state",f=>`
 create temp table before_balance as select * from public.account_balances where game_session_id='${f.game}';
 create function pg_temp.loan_fail_audit() returns trigger language plpgsql as $$ begin
 if new.action='loan.application.approve' and new.game_session_id='${f.game}' then raise exception using errcode='Z0911',message='synthetic audit failure'; end if; return new; end $$;
 create trigger synthetic_loan_failure before insert on public.audit_log for each row execute function pg_temp.loan_fail_audit();
 select pg_temp.loan_denied($q$${call(f)}$q$,'Z0911','synthetic audit failure');
 select pg_temp.check_loan((select status='pending_review' and reviewed_at is null from public.loan_applications where id='${f.app}'),'pending after rollback');
 select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}') and not exists(select 1 from public.ledger_entries where game_session_id='${f.game}')
 and not exists(select 1 from public.bank_transactions where game_session_id='${f.game}')
 and not exists(select 1 from public.audit_log where game_session_id='${f.game}' and action='loan.application.approve'),'no partial effects');
 select pg_temp.check_loan(not exists((select * from public.account_balances where game_session_id='${f.game}' except select * from before_balance)
 union all (select * from before_balance except select * from public.account_balances where game_session_id='${f.game}')),'projection rollback');
 drop trigger synthetic_loan_failure on public.audit_log;
 ${call(f)}; ${assertApproval(f)}`);
});
