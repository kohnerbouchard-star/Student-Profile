import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertFxRaceEnvironment} from './fx-temporal-cutover-concurrency.mjs';
const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile'};
const sha='a'.repeat(40),project='fixture',time=Date.parse('2026-11-17T00:00:00Z');
const event={pull_request:{number:1005,draft:true,head:{ref:'fix/fx-bootstrap-temporal-provenance',sha,repo:{full_name:env.GITHUB_REPOSITORY}},base:{ref:'main',repo:{full_name:env.GITHUB_REPOSITORY}}}};
const context={Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}};
const container={Id:'b'.repeat(64),Image:`sha256:${'c'.repeat(64)}`,Created:'2026-11-17T00:01:00Z',State:{Running:true},Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.143',Labels:{'com.supabase.cli.project':project}}};
const valid=()=>structuredClone([env,sha,event,context,container,project,time]);
test('accepts only verified fresh exact-head disposable container',()=>assert.equal(assertFxRaceEnvironment(...valid()),container.Id));
for(const [name,mutate] of [
 ['wrong PR',a=>a[2].pull_request.number++],['non-draft',a=>a[2].pull_request.draft=false],
 ['manual',a=>a[0].GITHUB_EVENT_NAME='workflow_dispatch'],['wrong head',a=>a[1]='d'.repeat(40)],
 ['fork',a=>a[2].pull_request.head.repo.full_name='other/repo'],['wrong base',a=>a[2].pull_request.base.ref='release/production'],
 ['remote docker',a=>a[3].Endpoints.docker.Host='tcp://remote:2375'],['preexisting',a=>a[4].Created='2026-11-16T00:00:00Z'],
 ['stopped',a=>a[4].State.Running=false],['wrong project',a=>a[4].Config.Labels['com.supabase.cli.project']='other'],
 ['wrong image',a=>a[4].Config.Image='postgres:latest'],['no digest',a=>a[4].Image=''],
 ...['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','DOCKER_HOST','DOCKER_CONTEXT'].map(k=>[k,a=>a[0][k]='forbidden'])
])test(`rejects ${name}`,()=>{const args=valid();mutate(args);assert.throws(()=>assertFxRaceEnvironment(...args));});
test('races use actual independent backends and lifecycle triggers without bypasses',()=>{
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 for(const required of ['wait_event_type=\'Lock\'','pg_terminate_backend','idle_in_transaction_session_timeout','Promise.all([a.done,b.done])','contend(bootstrap,bootstrap)','contend(bootstrap,pause)','contend(pause,bootstrap)','contend(bootstrap,resume)','contend(resume+`select next_due_at','replay after pause must not reschedule paused game','replay must preserve resume boundary','supabase_migrations.schema_migrations'])assert(source.includes(required),required);
 assert(!/disable trigger|session_replication_role|drop constraint|update private\.fx_runtime_state/i.test(source));
});
test('bootstrap locks canonical lifecycle before advisory/runtime and never schedules paused games',()=>{
 const migration=readFileSync('backend/supabase/migrations/20261117035856_fx_bootstrap_temporal_provenance.sql','utf8');
 const lifecycle=migration.indexOf('select game_row.lifecycle_state into v_lifecycle_state');
 const gameLock=migration.indexOf('for update;',lifecycle);
 const advisory=migration.indexOf('perform pg_advisory_xact_lock(');
 const runtime=migration.indexOf('from private.fx_runtime_state as runtime');
 assert(lifecycle>0&&gameLock>lifecycle&&advisory>gameLock&&runtime>advisory);
 assert.equal((migration.match(/case when v_lifecycle_state = 'paused' then null/g)||[]).length,3);
 assert(migration.includes('else coalesce(private.fx_runtime_state.next_due_at, excluded.next_due_at) end'));
 assert.match(migration,/order by\s+fixing_row.effective_at desc,\s+fixing_row.calculated_at desc,\s+fixing_row.id desc\s+limit 1/);
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 assert(source.includes('initial paused bootstrap must not schedule'));
});
