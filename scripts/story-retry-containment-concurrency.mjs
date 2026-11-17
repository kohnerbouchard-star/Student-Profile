// Disposable database qualification only. Never accepts a database URL.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function assertStoryInvocation(env, sha, event) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_EVENT_NAME, 'pull_request');
  assert.equal(env.GITHUB_REPOSITORY, 'kohnerbouchard-star/Student-Profile');
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.equal(sha, event.pull_request?.head.sha);
  assert.equal(event.pull_request?.base.ref, 'main');
  for (const key of ['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','DOCKER_HOST','DOCKER_CONTEXT']) assert(!env[key], `External connection forbidden: ${key}`);
}

export function assertDisposableStoryEnvironment(env, sha, event, context, container, project, checkoutTime) {
  assertStoryInvocation(env, sha, event);
  assert.equal(context.Endpoints.docker.Host, 'unix:///var/run/docker.sock');
  assert.equal(container.State.Running, true);
  assert.match(container.Id, /^[a-f0-9]{64}$/);
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project);
  assert.match(container.Config.Image, /^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert(Date.parse(container.Created) >= checkoutTime, 'Preexisting database forbidden');
}

export function assertCleanStoryCheckout(status) {
  assert.equal(status, '', 'Dirty or untracked source cannot qualify an exact PR head');
}

export async function runConcurrency() {
  const run = (cmd,args) => execFileSync(cmd,args,{encoding:'utf8',timeout:30000}).trim();
  const sha=run('git',['rev-parse','HEAD']);
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assertStoryInvocation(process.env,sha,event);
  assertCleanStoryCheckout(run('git',['status','--porcelain','--untracked-files=all']));
  const project=readFileSync('backend/supabase/config.toml','utf8').match(/^project_id = "([\w-]+)"$/m)?.[1];
  assert(project);
  const container=JSON.parse(run('docker',['inspect',`supabase_db_${project}`]))[0];
  assertDisposableStoryEnvironment(process.env,sha,event,
    JSON.parse(run('docker',['context','inspect']))[0],container,project,statSync('.git').mtimeMs);
  // Rebuild this already-verified disposable DB from the clean exact-head source.
  // Never rely on a container label or an external attestation as schema proof.
  execFileSync('npx',['--no-install','supabase','db','reset','--workdir','backend','--local'],
    {encoding:'utf8',timeout:240000,stdio:['ignore','pipe','pipe']});
  assertCleanStoryCheckout(run('git',['status','--porcelain','--untracked-files=all']));
  assert.equal(JSON.parse(run('docker',['inspect',`supabase_db_${project}`]))[0].Id,container.Id,
    'Disposable database identity changed during reset');
  const args=['exec','-i',container.Id,'psql','-U','supabase_admin','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'];
  const sql = input => execFileSync('docker',args,{input:`set statement_timeout='15s'; set lock_timeout='10s';\n${input}`,encoding:'utf8',timeout:20000}).trim();
  const expectedVersions=readdirSync('backend/supabase/migrations').filter(n=>/^\d+_.+\.sql$/.test(n)).map(n=>n.split('_')[0]).sort();
  assert.deepEqual(sql('select version from supabase_migrations.schema_migrations order by version;').split('\n').filter(Boolean),expectedVersions,
    'Database migration versions differ from exact-head source');
  assert(sql(readFileSync('scripts/story-retry-containment-database.sql','utf8')).includes('STORY_RETRY_CONTAINMENT_DATABASE_ACCEPTANCE_PASSED'), 'Serial rollback proof did not complete');
  const sessions=new Set();
  function session(name) {
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
    sessions.add(child);
    let output='', errors='';
    child.stdout.on('data',b=>{output+=b;}); child.stderr.on('data',b=>{errors+=b;});
    const done=new Promise(resolve=>child.once('close',code=>{sessions.delete(child);resolve({code,output,errors});}));
    child.stdin.write(`set application_name='${name}'; set statement_timeout='20s'; set lock_timeout='15s'; set idle_in_transaction_session_timeout='30s';\n\\set VERBOSITY verbose\n`);
    return {child,done,get output(){return output;},write:s=>child.stdin.write(s+'\n'),end:()=>child.stdin.end()};
  }
  async function until(test, label) {
    const limit=Date.now()+10000;
    while(Date.now()<limit){if(test())return;await new Promise(r=>setTimeout(r,25));}
    throw new Error(`Timed out: ${label}`);
  }
  async function contend(first, second) {
    const tag=`story_retry_${randomUUID().replaceAll('-','')}`;
    const a=session(`${tag}_a`),b=session(`${tag}_b`);
    try {
      a.write(`begin;\n${first}\n\\echo HOLDER_READY`);
      await until(()=>a.output.includes('HOLDER_READY'),'holder ready');
      b.write(`${second}\n`);b.end();
      await until(()=>sql(`select count(*) from pg_stat_activity where application_name='${tag}_b' and wait_event_type='Lock';`)==='1','contender blocked on lock');
      a.write('commit;');a.end();
      let timer;
      const results=await Promise.race([
        Promise.all([a.done,b.done]),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Post-commit session completion timeout')),25000);})
      ]).finally(()=>clearTimeout(timer));
      assert.equal(results[0].code,0,results[0].errors);
      return results;
    } finally {
      // Terminate actual database backends, not merely the docker client process.
      try {sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name in('${tag}_a','${tag}_b') and pid<>pg_backend_pid();`);}
      finally {a.child.stdin.destroy();b.child.stdin.destroy();a.child.kill();b.child.kill();}
    }
  }
  const g='74000000-0000-4000-8000-000000000010', e='74000000-0000-4000-8000-000000000031';
  const owner='74000000-0000-4000-8000-000000000001',token='74000000-0000-4000-8000-000000000099';
  const claim=`select row_to_json(r) from public.claim_story_event_execution_v1('${g}','${e}','2026-08-12T03:00:00Z',4,'{"version":1,"effects":[]}',120) r;`;
  const release=key=>`select row_to_json(r) from public.release_story_execution_retry_hold_v1('${g}','${e}','STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',8,1,'${owner}','Reviewed disposable fixture recovery','${key}') r;`;
  function reset(kind) {
    sql(`delete from public.story_event_execution_claims where game_session_id='${g}'; delete from public.story_event_resolutions where game_session_id='${g}';`);
    if(kind==='absent')return;
    sql(claim);
    if(kind==='expired')sql(`update public.story_event_execution_claims set attempt_count=8618,lease_token='${token}',lease_expires_at=clock_timestamp()-interval '1 second' where game_session_id='${g}';`);
    if(kind==='held')sql(`update public.story_event_execution_claims set status='retryable_failed',attempt_count=8,lease_token=null,lease_expires_at=null,retry_hold_reason='STORY_EXECUTION_RETRY_BUDGET_EXHAUSTED',retry_hold_generation=1 where game_session_id='${g}';`);
  }
  const fixture=readFileSync('scripts/story-retry-containment-database.sql','utf8').split('do $test$')[0].replaceAll('73000000','74000000').replaceAll('story_retry_fixture','story_retry_concurrency_fixture').replaceAll('story-retry@example.test','story-retry-concurrency@example.test');
  let setup=false;
  try {
    sql(fixture+`update public.game_sessions set lifecycle_state='paused' where id='${g}'; commit;`);setup=true;
    reset('absent');let results=await contend(claim,claim);
    assert(results[0].output.includes('"claim_outcome":"acquired"'));
    assert(results[1].code===0&&results[1].output.includes('"claim_outcome":"busy"'));
    for(const operation of ['fail','finalize']){
      reset('expired');
      const call=operation==='fail'?`select * from public.fail_story_event_execution_v1('${g}','${e}','${token}','stale worker failure');`:`select * from public.finalize_story_event_execution_v1('${g}','${e}','${token}','{}');`;
      results=await contend(claim,call);
      assert(results[0].output.includes('"claim_outcome":"busy"'));
      assert(results[1].code!==0&&results[1].errors.includes('40001'),results[1].errors);
    }
    reset('expired');results=await contend(`select * from public.finalize_story_event_execution_v1('${g}','${e}','${token}','{}');`,claim);
    assert(results[1].code===0&&results[1].output.includes('"claim_outcome":"already_resolved"'));
    reset('held');results=await contend(release('fixture-release-key'),release('fixture-release-key'));
    assert(results[0].output.includes('"release_outcome":"released"'));
    assert(results[1].code===0&&results[1].output.includes('"release_outcome":"replayed"'));
    assert.equal(sql(`select count(*) from public.story_execution_retry_release_audit where game_session_id='${g}';`),'1');
    reset('held');results=await contend(release('fixture-release-before-claim'),claim);
    assert(results[1].code===0&&results[1].output.includes('"claim_outcome":"acquired"'));
    assert(results[1].output.includes('"attempt_count":9'));
    assert(results[1].output.includes('"effects": []')||results[1].output.includes('"effects":[]'));
    reset('held');results=await contend(release('fixture-release-a'),release('fixture-release-b'));
    assert(results[1].code!==0&&results[1].errors.includes('40001'),results[1].errors);
    // Synthetic fixture authority only; this does not bootstrap economic data.
    function prepareFxHeld() {
      reset('held');
      sql(`update public.story_event_execution_claims set execution_plan='{"version":1,"effects":[{"effect":{"type":"currency_volatility"}}]}' where game_session_id='${g}';
        insert into private.fx_runtime_state(game_session_id,cutover_status,blocked_reason,policy_version_id)
        select '${g}','ready',null,id from public.fx_policy_versions order by activated_at desc limit 1
        on conflict(game_session_id) do update set cutover_status='ready',blocked_reason=null;`);
    }
    const blockFx=`update private.fx_runtime_state set cutover_status='blocked',blocked_reason='FX_MACRO_SNAPSHOT_SET_INCOMPLETE' where game_session_id='${g}';`;
    prepareFxHeld();results=await contend(release('fixture-ready-before-block'),blockFx);
    assert.equal(results[1].code,0,results[1].errors);
    assert(sql(claim).includes('"claim_outcome":"busy"'),'New FX block must prevent execution after release');
    prepareFxHeld();results=await contend(blockFx,release('fixture-block-before-release'));
    assert(results[1].code!==0&&results[1].errors.includes('STORY_RETRY_RELEASE_FX_NOT_READY'),results[1].errors);
    const disableGame=`update public.game_sessions set lifecycle_state='draft',status='disabled' where id='${g}';`;
    reset('held');results=await contend(release('fixture-release-before-lifecycle'),disableGame);
    assert.equal(results[1].code,0,results[1].errors);
    let lifecycleDenied=false;
    try{sql(claim);}catch(error){lifecycleDenied=String(error.stderr).includes('STORY_EXECUTION_GAME_NOT_MUTABLE');}
    assert(lifecycleDenied,'Changed lifecycle must prevent execution after release');
    sql(`update public.game_sessions set lifecycle_state='paused',status='paused' where id='${g}';`);
    reset('held');results=await contend(disableGame,release('fixture-lifecycle-before-release'));
    assert(results[1].code!==0&&results[1].errors.includes('STORY_RETRY_RELEASE_OWNER_OR_GAME_INVALID'),results[1].errors);
    console.log('STORY_RETRY_CONCURRENCY_ACCEPTANCE_PASSED');
  } finally {
    for(const child of sessions)child.kill();
    if(setup)sql(`delete from public.game_sessions where id in('${g}','74000000-0000-4000-8000-000000000011'); delete from public.storylines where id='74000000-0000-4000-8000-000000000030'; delete from public.staff_users where id='${owner}';`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runConcurrency();
