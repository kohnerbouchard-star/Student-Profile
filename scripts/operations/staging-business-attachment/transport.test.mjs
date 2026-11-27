import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvalText,baseline,birthMatches,births,branch,canonical,checkReview,hash,owner,packetDigest,parseRequest,
  paths,phaseReceipt,predecessor,project,ref,repo,repoId,requestPath,validateContext,validateHistory,verifyPacket,workflow,workflowName} from './policy.mjs';
import {parseCommit,readPacket,stageDbEnv} from './sql.mjs';

const now=Date.parse('2026-11-27T04:00:00.000Z'),boot='a'.repeat(40),attach='b'.repeat(40),detach='c'.repeat(40);
const epoch='00000000-0000-4000-8000-000000000001';
const r=action=>({schemaVersion:1,target:'staging-business-open-only',projectRef:project,ledgerSha256:baseline,
  bootstrapHead:boot,expectedParent:action==='attach-open'?boot:attach,action,packetSha256:packetDigest(action),
  maintenance:{startsAt:'2026-11-27T03:55:00.000Z',endsAt:'2026-11-27T04:10:00.000Z',ownerEvidenceSha256:hash(action)},
  ...(action==='detach-open'?{attach:{head:attach,runId:'7001',receiptSha256:hash('attach proof')}}:{})});
const raw=o=>Buffer.from(canonical(o));
const a=r('attach-open'),d=r('detach-open');
test('exact canonical two-operation allowlist and byte/source pins',()=>{
  for(const o of [a,d]) {assert.deepEqual(parseRequest(raw(o),now),o); verifyPacket(o.action,readPacket);}
  for(const change of [{action:'hold'},{action:'undo'},{action:'remove-inert'},{lane:'auth'},
    {projectRef:'cgiukdjwicykrmtkhudh'},{sql:'select 1'},{packetSha256:hash('wrong')}])
    assert.throws(()=>parseRequest(raw({...a,...change}),now));
  assert.throws(()=>parseRequest(raw(a),now+3600_000));
  assert.throws(()=>parseRequest(Buffer.from(JSON.stringify(a)),now));
  assert.throws(()=>verifyPacket(a.action,()=>Buffer.from('wrong')));
});
test('sole actor, same ref, first attempt and exact no-interleaver source history',()=>{
  const git=(...x)=>x[0]==='status'?'':x[0]==='diff'?(x[2]===predecessor?paths.join('\n'):requestPath):
    x.length===2?canonical(a):{[boot]:predecessor,[attach]:boot,[detach]:attach}[x.at(-1)];
  validateHistory(a,git,attach,boot);validateHistory(d,git,detach,attach);
  const drift=(...x)=>x[0]==='show'&&x.at(-1)===boot?'d'.repeat(40):git(...x);
  assert.throws(()=>validateHistory(a,drift,attach,boot));
  const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW:workflowName,GITHUB_REPOSITORY:repo,
    GITHUB_REPOSITORY_ID:String(repoId),GITHUB_ACTOR_ID:String(owner),GITHUB_REF:ref,GITHUB_RUN_ATTEMPT:'1',
    GITHUB_SHA:attach,GITHUB_RUN_ID:'7001'};
  const event={ref,before:boot,after:attach,head_commit:{id:attach},repository:{full_name:repo,id:repoId,private:false,
    owner:{id:owner}},sender:{id:owner,type:'User'},created:false,forced:false,deleted:false};
  validateContext(env,event,attach);
  for(const patch of [{GITHUB_REF:'refs/heads/main'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_ACTOR_ID:'51'}])
    assert.throws(()=>validateContext({...env,...patch},event,attach));
  assert.throws(()=>validateContext(env,{...event,forced:true},attach));
});
function run(b,path,step) {
  return {priorRun:{id:Number(b.runId),head_sha:b.head,path,event:'push',run_attempt:1,head_branch:branch,
    repository:{id:repoId},actor:{id:owner},status:'completed',conclusion:'success'},
  priorJobs:{jobs:[{name:'operate',head_sha:b.head,run_id:Number(b.runId),status:'completed',conclusion:'success',
    steps:[{name:step,conclusion:'success'}]}]}};
}
function ctx(req) {
  const head=req===a?attach:detach, old='.github/workflows/staging-inert-sidecar.yml', step='Apply one inert packet';
  const c={req,head,raw:raw(req),runId:req===a?'7001':'7002',workflowDigest:hash('workflow'),
    environment:{id:18428073637,name:'staging',can_admins_bypass:false,
      deployment_branch_policy:{custom_branch_policies:true,protected_branches:false},
      protection_rules:[{id:7,type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:{id:owner}}]}]},
    liveBranch:{name:branch,protected:true,commit:{sha:head},protection:{}},rules:[],
    branchPolicies:{total_count:2,branch_policies:[{name:'main',id:8,type:'branch'},{name:branch,id:9,type:'branch'}]},
    priors:{business:run(births.business,old,step),auth:run(births.auth,old,step),
      attach:req.attach?run(req.attach,workflow,'Apply one open Business attachment phase'):null}};
  c.reviews=[{state:'approved',user:{id:owner,type:'User'},environments:[{name:'staging',id:18428073637}],
    comment:approvalText(c)}];return c;
}
test('native owner comment, live tip, existing policy and both terminal receipts',()=>{
  checkReview(ctx(a));checkReview(ctx(d));
  for(const change of [
    z=>z.priors.auth.priorRun.status='waiting',z=>z.priors.business.priorRun.head_sha=detach,z=>z.reviews[0].comment+=' stale',
    z=>z.reviews[0].user.id=19,z=>z.liveBranch.commit.sha=boot,z=>z.environment.can_admins_bypass=true,
    z=>z.branchPolicies.branch_policies[0].name='wrong',
  ]){const n=ctx(a);change(n);assert.throws(()=>checkReview(n));}
  const n=ctx(d);n.priors.attach.priorJobs.jobs[0].steps[0].conclusion='skipped';assert.throws(()=>checkReview(n));
});
test('only exact stage TLS direct/session and no other secrets or triggers in workflow',()=>{
  const root=new URL('../../../',import.meta.url).pathname;
  const valid='postgresql://postgres:test@db.'+project+'.supabase.co:5432/postgres';
  const ro=stageDbEnv(valid,root,true);assert.equal(ro.PGSSLMODE,'verify-full');assert.equal(ro.PGOPTIONS,'-c default_transaction_read_only=on');
  assert.match(ro.PGSSLROOTCERT,/supabase-prod-ca-2021\.crt$/);
  assert.equal(stageDbEnv('postgresql://postgres.'+project+':test@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres',root).PGOPTIONS,undefined);
  for(const v of [valid.replace(project,'cgiukdjwicykrmtkhudh'),valid.replace('5432','6543'),valid+'?sslmode=require'])
    assert.throws(()=>stageDbEnv(v,root));
  const w=readFileSync(new URL('../../../'+workflow,import.meta.url),'utf8');
  assert.match(w,/branches: \[chore\/staging-suffix-permission-preflight-20261126\]/);
  assert.match(w,/paths: \[scripts\/operations\/staging-business-attachment\/request\.json\]/);
  assert.match(w,/group: staging-campaign-exclusive-hold/);
  assert.equal((w.match(/STAGING_DATABASE_URL/g)||[]).length,1);
  assert.doesNotMatch(w,/SUPABASE_ACCESS_TOKEN|workflow_dispatch|production/);
});
test('immutable v1 births; distinct sanitized attach/detach receipts and commit marker required',()=>{
  assert.throws(()=>birthMatches('business',epoch));assert.throws(()=>birthMatches('auth',epoch));
  const pre={epoch,businessCatalog:births.business.catalogDigest,guardDigest:hash('zero guards')};
  const proof={epoch:'00000000-0000-4000-8000-000000000002',catalogDigest:pre.businessCatalog,guardDigest:hash('24 guards')};
  const result=parseCommit(JSON.stringify(proof)+'\nSTAGING_BUSINESS_OPEN_PHASE_COMMITTED_V1',ctx(a),pre);
  assert.equal(result.held,false);assert.equal(result.attached,true);assert.equal(result.guardCount,24);
  assert(!JSON.stringify(result).includes(proof.epoch));assert.notEqual(result.receiptSha256,births.business.receiptSha256);
  assert.throws(()=>parseCommit(JSON.stringify(proof),ctx(a),pre));
  const inverse=phaseReceipt({head:detach,runId:'7002',action:'detach-open',epoch,guardDigest:pre.guardDigest,
    catalogDigest:pre.businessCatalog,priorReceipt:result.receiptSha256});
  assert.notEqual(inverse,births.business.receiptSha256);assert.notEqual(inverse,result.receiptSha256);
});
