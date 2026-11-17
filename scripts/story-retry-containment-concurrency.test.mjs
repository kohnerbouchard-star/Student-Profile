import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {assertDisposableStoryEnvironment,assertCleanStoryCheckout,readStoryCheckoutMarker} from './story-retry-containment-concurrency.mjs';
function valid(){return {
 env:{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile'},
 sha:'a'.repeat(40),event:{pull_request:{head:{sha:'a'.repeat(40)},base:{ref:'main'}}},
 context:{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}},
 container:{Id:'b'.repeat(64),State:{Running:true},Created:'2026-11-17T01:00:00Z',Config:{Labels:{'com.supabase.cli.project':'fixture'},Image:'public.ecr.aws/supabase/postgres:17.6.1.143'}},
 project:'fixture',checkoutTime:Date.parse('2026-11-17T00:00:00Z')};}
function check(v){return assertDisposableStoryEnvironment(v.env,v.sha,v.event,v.context,v.container,v.project,v.checkoutTime);}
test('accepts only exact-head fresh disposable local Docker qualification',()=>check(valid()));
for(const [label,change] of [
 ['manual invocation',v=>v.env.GITHUB_ACTIONS='false'],
 ['workflow dispatch',v=>v.env.GITHUB_EVENT_NAME='workflow_dispatch'],
 ['wrong repository',v=>v.env.GITHUB_REPOSITORY='other/repo'],
 ['different head',v=>v.sha='c'.repeat(40)],
 ['remote Docker',v=>v.context.Endpoints.docker.Host='tcp://remote:2375'],
 ['preexisting database',v=>v.container.Created='2026-01-01T00:00:00Z'],
 ['wrong project',v=>v.project='production'],
 ['unreviewed image',v=>v.container.Config.Image='postgres:latest'],
 ['stopped container',v=>v.container.State.Running=false],
 ...['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','DOCKER_HOST','DOCKER_CONTEXT'].map(key=>[key,v=>v.env[key]='forbidden'])
])test(`rejects ${label}`,()=>{const v=valid();change(v);assert.throws(()=>check(v));});

test('requires a clean tracked checkout',()=>{assertCleanStoryCheckout('');for(const status of [' M scripts/test.mjs','?? scripts/test.mjs','M  backend/supabase/config.toml'])assert.throws(()=>assertCleanStoryCheckout(status));});

test('freshness uses stable checkout HEAD, not clean-status-mutated git directory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'story-git-marker-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git('init');git('config','user.email','fixture@example.test');git('config','user.name','Fixture');
  writeFileSync(join(dir,'fixture'),'x');git('add','fixture');git('commit','-m','fixture');
  const head=join(dir,git('rev-parse','--git-path','HEAD'));
  const marker=readStoryCheckoutMarker(head), directoryTime=statSync(join(dir,'.git')).mtimeMs;
  await new Promise(r=>setTimeout(r,30));
  const created=Date.now();
  await new Promise(r=>setTimeout(r,30));
  assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  assert(statSync(join(dir,'.git')).mtimeMs>directoryTime);
  assert.equal(readStoryCheckoutMarker(head),marker);
  const v=valid();v.checkoutTime=marker;v.container.Created=new Date(created).toISOString();check(v);
  v.container.Created=new Date(marker-1000).toISOString();assert.throws(()=>check(v));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
