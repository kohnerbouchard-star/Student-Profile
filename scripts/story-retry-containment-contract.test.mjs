import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('backend/supabase/migrations/20261117180000_bound_story_execution_retries_v1.sql','utf8');
const original=readFileSync('backend/supabase/migrations/20260812120000_add_story_event_execution_lease_v1.sql','utf8');
test('Existing RPC contracts stay byte-identical; no browser execution grant',()=>{
 for(const name of ['claim','fail']){
  const signature=s=>s.split(`create or replace function public.${name}_story_event_execution_v1(`)[1].split('as $function$')[0];
  assert.equal(signature(sql),signature(original));
 }
 assert(!/grant\s+execute[^;]+to\s+(anon|authenticated)/is.test(sql));
});
test('containment checks happen after active lease guard and before reacquisition',()=>{
 const guard=sql.indexOf("if v_claim.status = 'executing' and v_claim.lease_expires_at > v_now");
 const hold=sql.indexOf('if v_claim.retry_hold_reason is null and exists');
 const acquire=sql.indexOf("attempt_count = claim_row.attempt_count + 1");
 assert(guard>0&&hold>guard&&acquire>hold);
 assert.match(sql,/planned\.effect_entry -> 'effect' ->> 'type' = 'currency_volatility'/);
 assert.match(sql,/v_claim\.retry_hold_reason is not null or v_claim\.retry_after_at > v_now/);
});
test('no economy mutation, final resolution, frozen plan rewrite or automatic release',()=>{
 assert(!/update\s+private\.fx_runtime_state|insert into public\.story_event_resolutions|set\s+execution_plan|delete from|truncate/i.test(sql));
 assert(sql.includes("v_claim.attempt_count, '{}'::jsonb, null::uuid"));
 assert(sql.includes("(v_claim.attempt_count - v_claim.retry_epoch_start_attempt) >= 8"));
 assert(sql.includes('60 * power(2, least(v_claim.attempt_count - v_claim.retry_epoch_start_attempt - 1, 6))'));
});
test('rollback-only real DB proof asserts stale lease and identity boundaries',()=>{
 const proof=readFileSync('scripts/story-retry-containment-database.sql','utf8');
 for(const term of ['rollback;','held claim accepted stale failure','held claim accepted stale finalize','retry lost frozen identity','containment finalized event','has_function_privilege','deferred retry executed or leaked plan']) assert(proof.includes(term));
});

test('explicit release is fenced, audited and preserves total attempt history',()=>{
 for(const term of ['STORY_RETRY_RELEASE_STATE_CHANGED','v_claim.retry_hold_generation is distinct from p_expected_hold_generation','STORY_RETRY_RELEASE_IDEMPOTENCY_CONFLICT','STORY_RETRY_RELEASE_FX_NOT_READY','game_row.owner_staff_user_id=p_actor_staff_user_id','retry_epoch_start_attempt=v_claim.attempt_count','insert into public.story_execution_retry_release_audit']) assert(sql.includes(term));
 assert(!/set\s+attempt_count\s*=/.test(sql));
});
test('hold generation fences same-count rehold ABA and is part of replay identity',()=>{
 assert.equal((sql.match(/retry_hold_generation = claim_row\.retry_hold_generation \+ 1/g)||[]).length,2);
 assert(sql.includes('then v_claim.retry_hold_generation + 1 else v_claim.retry_hold_generation end'));
 assert(sql.includes('v_audit.released_hold_generation is distinct from p_expected_hold_generation'));
 assert(readFileSync('scripts/story-retry-containment-database.sql','utf8').includes('Stale hold generation released reheld claim'));
});
test('dedicated CI remains PR-only, credential-free and disposable',()=>{
 const workflow=readFileSync('.github/workflows/story-retry-containment.yml','utf8');
 for(const forbidden of ['workflow_dispatch:','pull_request_target:','secrets.','supabase link','--project-ref','db push','SUPABASE_ACCESS_TOKEN:','environment:','actions/upload-artifact'])assert(!workflow.includes(forbidden),forbidden);
 for(const required of ['contents: read','persist-credentials: false','--no-install','supabase stop --workdir backend --no-backup','github.event.pull_request.head.sha','fix/story-dependency-retry-containment','RUNNER_TEMP'])assert(workflow.includes(required),required);
});

test('failed CI prints only bounded diagnostics after fail-closed redaction',()=>{
 const workflow=readFileSync('.github/workflows/story-retry-containment.yml','utf8');
 for(const name of ['start','acceptance']){
  const safe=`node scripts/redact-econovaria-ci-log.mjs "$RUNNER_TEMP/story-retry-${name}.log" >"$RUNNER_TEMP/story-retry-${name}.sanitized.log"`;
  const tail=`tail -n 120 "$RUNNER_TEMP/story-retry-${name}.sanitized.log"`;
  assert(workflow.includes(safe));assert(workflow.indexOf(tail)>workflow.indexOf(safe));
  assert(!workflow.includes(`tail -n 120 "$RUNNER_TEMP/story-retry-${name}.log"`));
 }
 assert(workflow.includes('scripts/redact-econovaria-ci-log.test.mjs'));
});
