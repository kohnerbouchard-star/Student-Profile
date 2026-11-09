import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindLoanDatabase } from "./loan-review-transition-binding.mjs";
import { fixture, call, helpers, signature } from "./loan-review-transition-fixtures.mjs";

test("actual historical review baseline on production-shaped migrated schema", () => {
  const {sql} = bindLoanDatabase();
  const historical = readFileSync("backend/supabase/migrations/20260721120000_add_business_banking_credit_runtime_v1.sql","utf8");
  const start = historical.indexOf("create or replace function public.review_player_loan_application_v1(");
  const routine = historical.slice(start,historical.indexOf("\n$$;",start)+4);
  assert(routine.includes("and status in ('active','restructuring')"));
  const before = sql(`select pg_get_functiondef('${signature}'::regprocedure);`);
  const f=fixture();
  // Only this rollback-only baseline probe installs the unchanged actual old routine.
  // All real tables/triggers/ACLs remain migrated. Candidate tests never substitute it.
  const result=sql(`begin; ${helpers} ${f.setup}
    create temp table routine_security_before as select proowner,prosecdef,proconfig,proacl,pg_get_function_result(oid) result from pg_proc where oid='${signature}'::regprocedure;
    ${routine}
    select pg_temp.check_loan((select row_to_json(b)::jsonb=(select row_to_json(a)::jsonb from
      (select proowner,prosecdef,proconfig,proacl,pg_get_function_result(oid) result from pg_proc where oid='${signature}'::regprocedure) a)
      from routine_security_before b),'baseline/candidate owner signature definer settings ACL identical');
    select pg_temp.loan_denied($q$${call(f)}$q$,'42702','column reference "status" is ambiguous');
    select pg_temp.check_loan((select status='pending_review' from public.loan_applications where id='${f.app}'),'baseline pending');
    select pg_temp.check_loan(not exists(select 1 from public.player_loans where application_id='${f.app}'),'baseline no loan');
    select pg_temp.check_loan(not exists(select 1 from public.ledger_entries where game_session_id='${f.game}'),'baseline no ledger');
    select 'BASELINE_SQLSTATE_42702_STATUS_AMBIGUITY'; rollback;`);
  assert.match(result,/BASELINE_SQLSTATE_42702_STATUS_AMBIGUITY/);
  assert.equal(sql(`select pg_get_functiondef('${signature}'::regprocedure);`),before,"Baseline transaction must restore candidate definition");
});
