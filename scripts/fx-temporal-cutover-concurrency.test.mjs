import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFxResumeBoundary,assertFxRaceEnvironment,renderFxRaceApply} from './fx-temporal-cutover-concurrency.mjs';
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
 for(const required of ['wait_event_type=\'Lock\'','pg_terminate_backend','idle_in_transaction_session_timeout','Promise.all([a.done,b.done])','contend(bootstrap,bootstrap)','contend(bootstrap,pause)','contend(pause,bootstrap)','contend(bootstrap,resume)','contend(resume+`select json_build_object','replay after pause must not reschedule paused game','replay must preserve resume boundary','supabase_migrations.schema_migrations'])assert(source.includes(required),required);
 assert(!/disable trigger|session_replication_role|drop constraint/i.test(source));
 assert.equal((source.match(/update private\.fx_runtime_state/g)||[]).length,1);
 assert(source.includes("update private.fx_runtime_state set next_due_at=clock_timestamp()-interval '1 day' where game_session_id='${workerGame}'"));
});
test('bootstrap locks canonical lifecycle before advisory/runtime and never schedules paused games',()=>{
 const migration=readFileSync('backend/supabase/migrations/20261117035856_fx_bootstrap_temporal_provenance.sql','utf8');
 const lifecycle=migration.indexOf('select game_row.lifecycle_state into v_lifecycle_state');
 const gameLock=migration.indexOf('for no key update;',lifecycle);
 assert(!migration.slice(lifecycle,gameLock).includes('for update;'),'Game lock must remain FK KEY SHARE compatible');
 const advisory=migration.indexOf('perform pg_advisory_xact_lock(');
 const runtime=migration.indexOf('from private.fx_runtime_state as runtime');
 assert(lifecycle>0&&gameLock>lifecycle&&advisory>gameLock&&runtime>advisory);
 assert.equal((migration.match(/case when v_lifecycle_state = 'paused' then null/g)||[]).length,3);
 assert(migration.includes('else coalesce(private.fx_runtime_state.next_due_at, excluded.next_due_at) end'));
 assert.match(migration,/order by\s+fixing_row.effective_at desc,\s+fixing_row.calculated_at desc,\s+fixing_row.id desc\s+limit 1/);
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 assert(source.includes('initial paused bootstrap must not schedule'));
});

test('worker races use real claim load apply and preserve fencing',()=>{
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 for(const term of ["['worker-first','bootstrap-first']",'contend(lock,replay,worker)',"contend(replay,`begin;${lock}${worker}commit;`)",
 'claim_due_fx_games_v1','load_fx_fixing_input_v1','apply_fx_fixing_v1','FX_RACE_CLAIM_MISSING','FX_RACE_APPLY_MISSING','FX_RACE_APPLY_NOT_IDEMPOTENT',
 'bootstrap replay must not rewind daily pointer','bootstrap replay must preserve worker schedule','successful worker must release its lease','exactly one daily fixing'])assert(source.includes(term),term);
 assert(!/insert into public\.fx_fixings|set lease_token/i.test(source));
 const canonical=readFileSync('scripts/canonical-fx-authority-database.mjs','utf8');
 const rendered=renderFxRaceApply(canonical,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 assert(rendered.includes('from fx_race_claim'));assert(rendered.includes('join fx_race_input'));
 assert(!rendered.includes('${'));assert(rendered.includes("'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid"));
 assert.throws(()=>renderFxRaceApply('missing markers','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));
 assert.throws(()=>renderFxRaceApply(canonical,"bad';drop table"));
});
test('serial shock receipt avoids reserved authorization alias and preserves comparison',()=>{
 const source=readFileSync('scripts/canonical-fx-authority-database.mjs','utf8');
 assert(!/as\s+authorization\b/i.test(source));
 assert.match(source,/persisted\.authorized_at\s*=\s*receipt\.authorized_at/);
 assert.match(source,/persisted\.authorization_hash\s*=\s*receipt\.authorization_hash/);
 assert.match(source,/persisted\.eligible_at\s*=\s*receipt\.eligible_at/);
});

test('tagged resume boundary ignores barrier output and fails closed on missing/ambiguous values',()=>{
 assert.equal(readFxResumeBoundary('1\n{"resumeDue":"2026-11-17 08:00:00+00"}\nHOLDER_READY\n'),'2026-11-17 08:00:00+00');
 for(const output of ['HOLDER_READY\n','{"resumeDue":null}\nHOLDER_READY\n','{"resumeDue":"x"}\n{"resumeDue":"y"}\n'])assert.throws(()=>readFxResumeBoundary(output));
});

test('both ready race fixtures satisfy canonical campaign provisioning metadata',()=>{
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 const updates=[...source.matchAll(/update public\.game_sessions set provisioning_status='ready',([^;]+);/g)];
 assert.equal(updates.length,2);
 for(const [,fields] of updates)for(const required of ["provisioning_pack_id='econovaria.beta-seed-pack.v1'","provisioning_pack_version='1.0.0-beta'","provisioning_pack_sha256=repeat('a',64)",'provisioning_source_game_session_id=id','provisioned_at=clock_timestamp()','provisioning_failure_code=null'])assert(fields.includes(required),required);
 assert(!/disable trigger|session_replication_role|drop constraint/i.test(source));
});

test('elapsed worker boundaries use an isolated copied policy without rewriting authority',()=>{
 const source=readFileSync('scripts/fx-temporal-cutover-concurrency.mjs','utf8');
 assert(source.includes("select 'fx-policy-v900',status,fixing_local_time,normal_movement_cap_basis_points,crisis_movement_cap_basis_points,parameters,clock_timestamp()-interval '5 days'"));
 assert(source.includes("from public.fx_policy_versions where policy_version='fx-policy-v1'"));
 assert(source.includes('FX_RACE_POLICY_FIXTURE_MISSING'));
 assert(!/update public\.fx_policy_versions|delete from public\.fx_policy_versions|disable trigger|session_replication_role/i.test(source));
 assert(source.indexOf('FX_RACE_POLICY_FIXTURE_MISSING')<source.indexOf("for(const order of ['worker-first','bootstrap-first'])"));
});

test('real clock proof initializes a separate game timezone before immutable bootstrap',()=>{
 const source=readFileSync('scripts/canonical-fx-authority-database.mjs','utf8');
 const long=source.slice(source.indexOf('// Dedicated PR-only extension.'));
 assert(long.includes('fixture.realClockGameId'));
 assert(long.includes('fixture.realClockPurchaseId'));
 assert(!long.includes('fixture.gameTwoId'));
 const settings=long.indexOf('insert into public.game_settings');
 const bootstrap=long.indexOf('select public.initialize_fx_authority_for_game_v1(');
 const queue=long.indexOf('select * from public.apply_story_currency_volatility_v1(');
 assert(settings>0&&bootstrap>settings&&queue>bootstrap);
 assert(!/update public\.game_settings|update private\.fx_runtime_state|disable trigger|session_replication_role/.test(long));
 for(const text of ["clock_timestamp() + interval '60 seconds'","interval '65 minutes'",'isolated real clock fixture retains its pre-bootstrap timezone and canonical schedule','insert into public.entitlements','insert into public.country_economic_snapshots','provisioning_pack_version=','real queued shock produces the exact economic NRC movement'])assert(long.includes(text),text);
});
