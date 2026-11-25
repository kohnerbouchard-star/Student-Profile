import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertCapturedStagingFixture } from './run-captured-staging-purge-fixture.mjs';
const now=Date.parse('2026-11-25T12:00:00Z');
function fixture(){return {
 env:{REF032_RECONSTRUCT_PURGE_FIXTURE:'repository-only-v1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile',GITHUB_WORKFLOW:'Econovaria Staging Schema Rehearsal',GITHUB_JOB:'rehearse',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),PHASE15_ENVIRONMENT:'staging',PHASE15_EXPECTED_PROJECT_REF:'eecvbssdvarfcykcfrny',REF032_FIXTURE_CONTAINER_NOT_BEFORE:String(now-10000),RUNNER_TEMP:'/tmp/qualified',PHASE15_CAPTURE_DIR:'/tmp/qualified/u1/raw',PHASE15_WORK_DIR:'/tmp/qualified/u1/work'},
 context:{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}},
 container:{Id:'b'.repeat(64),Image:'sha256:'+'c'.repeat(64),Name:'/supabase_db_econovaria_phase15_staging',Created:new Date(now-5000).toISOString(),State:{Running:true},Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.147',Labels:{'com.supabase.cli.project':'econovaria_phase15_staging'}},HostConfig:{NetworkMode:'supabase_network_econovaria_phase15_staging'},NetworkSettings:{Networks:{}}}
};}
test('only exact captured staging context and fresh disconnected local Docker qualify',()=>{
 const f=fixture();assert.equal(assertCapturedStagingFixture(f.env,'a'.repeat(40),f.context,f.container,now),f.container.Id);
 const changes=[f=>f.env.REF032_RECONSTRUCT_PURGE_FIXTURE='',f=>f.env.GITHUB_WORKFLOW='Phase15 Readonly Rehearsal',f=>f.env.GITHUB_JOB='other',f=>f.env.GITHUB_EVENT_NAME='push',f=>f.env.GITHUB_RUN_ATTEMPT='2',f=>f.env.GITHUB_REF='refs/heads/feature',f=>f.env.GITHUB_SHA='d'.repeat(40),f=>f.env.PHASE15_ENVIRONMENT='production',f=>f.env.PHASE15_EXPECTED_PROJECT_REF='cgiukdjwicykrmtkhudh',f=>f.env.PHASE15_CAPTURE_DIR='/tmp/wrong',f=>f.env.PHASE15_WORK_DIR='/tmp/wrong',f=>f.env.DOCKER_HOST='tcp://remote',f=>f.env.PHASE15_REMOTE_DATABASE_URL='remote',f=>f.env.SUPABASE_ACCESS_TOKEN='fixture',f=>f.context.Endpoints.docker.Host='tcp://remote',f=>f.container.NetworkSettings.Networks={bridge:{}},f=>f.container.HostConfig.NetworkMode='host',f=>f.container.Created=new Date(now-20000).toISOString(),f=>f.container.Config.Labels['com.supabase.cli.project']='another',f=>f.container.Name='/unrelated',f=>f.container.State.Running=false];
 for(const mutate of changes){const f=fixture();mutate(f);assert.throws(()=>assertCapturedStagingFixture(f.env,'a'.repeat(40),f.context,f.container,now));}
});
test('fixture execution pins Docker ID/socket; native test prefix is literal',()=>{
 const source=readFileSync(new URL('./run-captured-staging-purge-fixture.mjs',import.meta.url),'utf8');
 assert(source.includes("'-h','/var/run/postgresql','-p','5432'"));
 assert(source.includes("'-i',id,'psql'"));
 assert(source.includes("'PGHOSTADDR='"));assert(source.includes("'PGSERVICE='"));
 const builder=readFileSync(new URL('./build-disposable-purge-control-fixture.mjs',import.meta.url),'utf8');
 assert(builder.includes("current_database() ~ '^ref032_disposable_[a-z0-9_]+$'"));
 assert(!builder.includes("like 'ref032_disposable_%'"));
 const workflow=readFileSync(new URL('../../../.github/workflows/econovaria-staging-schema-rehearsal.yml',import.meta.url),'utf8');
 assert.equal((workflow.match(/REF032_RECONSTRUCT_PURGE_FIXTURE/g)||[]).length,1);
 assert(workflow.indexOf('REF032_RECONSTRUCT_PURGE_FIXTURE')>workflow.indexOf('Restore and rehearse locally without hosted credentials'));
 const upload=workflow.slice(workflow.indexOf('Retain only bounded qualification results'));
 assert(upload.includes('/u1/sanitized/result.json'));assert(!/path:.*(?:private|raw|rehearsal.log)/.test(upload));
});
