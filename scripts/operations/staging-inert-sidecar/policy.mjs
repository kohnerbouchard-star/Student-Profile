// Staging inert transport policy. This module cannot connect to PostgreSQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {approvalComment} from '../staging-suffix-permission-preflight/run.mjs';

export const repo='kohnerbouchard-star/Student-Profile', repoId=1264495890, owner=287640607;
export const branch='chore/staging-suffix-permission-preflight-20261126', ref='refs/heads/'+branch;
export const project='eecvbssdvarfcykcfrny', baseline='abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312';
export const predecessor='ed0967b76c8f8f9b1a9ed2a0fa973c42530698c2';
export const workflow='.github/workflows/staging-inert-sidecar.yml', workflowName='Staging Sidecar Maintenance (Inert Only)';
export const dir='scripts/operations/staging-inert-sidecar/', requestPath=dir+'request.json';
const environmentId=18428073637;
const sha1=/^(?!0{40}$)[a-f0-9]{40}$/u, sha256=/^(?!([a-f0-9])\1{63}$)[a-f0-9]{64}$/u;
export const runPattern=/^[1-9][0-9]{0,14}$/u;
export const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
export const hash=b=>createHash('sha256').update(b).digest('hex');
const gitHead=s=>typeof s==='string'&&sha1.test(s);
export const isHash=s=>typeof s==='string'&&sha256.test(s);
const permitted=Object.freeze({
  business:Object.freeze({
    install:[['business/install-inert.sql','532c43d5b66a502cae70c47465fe66cfa34edea3ad3b4fce41fa3a11377195b5']],
    undo:[['business/remove-inert.sql','79847423d55072175b28daa2479492af267ff8e5e6b8a4d72a2b5b9b044fe03f']],
  }),
  auth:Object.freeze({
    install:[['auth/review.mjs','5781cc76b5eade32c0ffb2530278cd156fc80433c2a9557edef468c7487b21c5'],
      ['auth/original/install-inert.sql','54bad91a017d06665a24afd2b35e3f8b73f7b3a3eb2303e82f99bb5a92bc985c']],
    undo:[['auth/review.mjs','5781cc76b5eade32c0ffb2530278cd156fc80433c2a9557edef468c7487b21c5'],
      ['auth/original/remove-unbound.sql','3bd4b57676d295e9ee8f8cbe7372af0bd94ace5748d1aa8c67b790d874a371f7']],
  }),
});
export const bootstrapPaths=[workflow,...[
  'policy.mjs','sql.mjs','run.mjs','business/install-inert.sql','business/remove-inert.sql',
  'auth/review.mjs','auth/original/install-inert.sql','auth/original/remove-unbound.sql',
].map(x=>dir+x)].sort();
const lanes=['business','auth'], changesAllowed=['install','undo'];

function plainObject(value) { return value!==null && typeof value==='object' && !Array.isArray(value); }
function sort(value) {
  if(Array.isArray(value)) return value.map(sort);
  if(plainObject(value)) return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));
  return value;
}
export const canonical=value=>JSON.stringify(sort(value),null,2)+'\n';
export function shape(object, keys) {
  assert(plainObject(object)); assert.deepEqual(Object.keys(object).sort(), keys.split(' ').sort());
}
function utc(x) {
  assert.equal(typeof x,'string');
  const t=Date.parse(x); assert(Number.isFinite(t) && new Date(t).toISOString()===x); return t;
}
function pinsFor(lane,verb) {
  assert(lanes.includes(lane) && changesAllowed.includes(verb));
  return permitted[lane][verb];
}
export function packetDigest(lane,action) {
  return hash(canonical({lane,action,domain:'econovaria-stage-inert-sidecar-packet-v1',files:pinsFor(lane,action)}));
}
export function verifyPacket(lane,action,read) {
  for(const [path,expected] of pinsFor(lane,action)) assert.equal(hash(read(path)),expected,'SIDECAR_AUTHORED_PACKET_DRIFT');
}
export function parseRequest(raw,now=Date.now(),historical=false) {
  assert(Buffer.isBuffer(raw) && raw.length>0 && raw.length<=4096);
  const s=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  assert(Buffer.from(s,'utf8').equals(raw),'SIDECAR_NON_CANONICAL_BYTES');
  const o=JSON.parse(s);
  assert.equal(s,canonical(o),'SIDECAR_REQUEST_NOT_CANONICAL');
  shape(o,'schemaVersion target projectRef ledgerSha256 bootstrapHead expectedParent lane action packetSha256 maintenance'+
    (o.action==='undo'?' install':''));
  assert.equal(o.schemaVersion,1); assert.equal(o.target,'staging-inert-only');
  assert.equal(o.projectRef,project); assert.equal(o.ledgerSha256,baseline);
  assert(gitHead(o.bootstrapHead) && gitHead(o.expectedParent)); assert.notEqual(o.bootstrapHead,predecessor);
  assert.notEqual(o.expectedParent,predecessor);
  assert.equal(o.packetSha256,packetDigest(o.lane,o.action));
  const m=o.maintenance;
  shape(m,'startsAt endsAt ownerEvidenceSha256 recoveryEvidenceSha256');
  const first=utc(m.startsAt), last=utc(m.endsAt);
  assert(first>=Date.parse('2026-11-27T01:20:00.000Z') && last>first && last-first<=45*60_000);
  if(!historical) assert(first<=now && now<last,'SIDECAR_MAINTENANCE_WINDOW_CLOSED');
  assert(isHash(m.ownerEvidenceSha256) && isHash(m.recoveryEvidenceSha256));
  assert.notEqual(m.ownerEvidenceSha256,m.recoveryEvidenceSha256);
  if(o.action==='undo') {
    shape(o.install,'head runId catalogDigest receiptSha256');
    assert(gitHead(o.install.head)); assert(typeof o.install.runId==='string' && runPattern.test(o.install.runId));
    assert(isHash(o.install.catalogDigest) && isHash(o.install.receiptSha256));
  }
  return o;
}

export function validateContext(env,event,head) {
  const expectations={GITHUB_ACTIONS:'true',GITHUB_WORKFLOW:workflowName,GITHUB_EVENT_NAME:'push',
    GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:String(repoId),GITHUB_ACTOR_ID:String(owner),
    GITHUB_REF:ref,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:head};
  for(const [k,v] of Object.entries(expectations)) assert.equal(env[k],v);
  assert(typeof env.GITHUB_RUN_ID==='string' && runPattern.test(env.GITHUB_RUN_ID));
  assert(gitHead(head) && gitHead(event.before) && head!==event.before);
  assert.equal(event.ref,ref);assert.equal(event.after,head);assert.equal(event.head_commit?.id,head);
  assert.equal(event.repository?.id,repoId);assert.equal(event.repository?.full_name,repo);
  assert.equal(event.repository?.private,false);assert.equal(event.repository?.owner?.id,owner);
  assert.equal(event.sender?.id,owner);assert.equal(event.sender?.type,'User');
  for(const k of ['created','forced','deleted']) assert.equal(event[k],false);
}

export function validateHistory(req,git,head,before,now=Date.now()) {
  const parent=h=>git('show','-s','--format=%P',h);
  const names=(a,b)=>git('diff','--name-only',a,b).split('\n').sort();
  const boot=req.bootstrapHead;
  assert.equal(req.expectedParent,before);
  assert.equal(parent(head),before);
  assert.equal(parent(boot),predecessor,'SIDECAR_BOOTSTRAP_WRONG_PREDECESSOR');
  assert.deepEqual(names(predecessor,boot),bootstrapPaths,'SIDECAR_BOOTSTRAP_SCOPE_CHANGED');
  assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  const trail=git('rev-list','--reverse','--ancestry-path','--max-count=5',boot+'..'+head).split('\n');
  assert(trail.length>=1 && trail.length<=4 && trail.at(-1)===head);
  const state=new Map(), approvals=new Set();
  let last=boot;
  for(const commit of trail) {
    assert(gitHead(commit));assert.equal(parent(commit),last);
    assert.deepEqual(names(last,commit),[requestPath]);
    const prior=parseRequest(Buffer.from(git('show',commit+':'+requestPath),'utf8'),now,true);
    assert.equal(prior.bootstrapHead,boot);assert.equal(prior.expectedParent,last);
    const unique=prior.maintenance.ownerEvidenceSha256;
    assert(!approvals.has(unique),'SIDECAR_OWNER_EVIDENCE_REUSED');approvals.add(unique);
    if(prior.action==='install') {
      assert(!state.has(prior.lane),'SIDECAR_INSTALL_ALREADY_ISSUED');
      state.set(prior.lane,{head:commit,undone:false});
    } else {
      const first=state.get(prior.lane);
      assert(first && !first.undone && first.head===prior.install.head,'SIDECAR_UNDO_ORIGIN_MISMATCH');
      first.undone=true;
    }
    last=commit;
  }
}

export function nativeComment({req,raw,head,runId,workflowDigest,environment,liveBranch,rules,branchPolicies}) {
  return [
    approvalComment({head,runId,workflowSha256:workflowDigest,environment,branch:liveBranch,rules,branchPolicies})
      .replace('econovaria-staging-preflight-root-reviewed-v1','econovaria-staging-inert-sidecar-owner-reviewed-v1'),
    project,req.bootstrapHead,req.expectedParent,req.lane,req.action,req.packetSha256,hash(raw),
    req.maintenance.ownerEvidenceSha256,req.maintenance.recoveryEvidenceSha256,
  ].join(' ');
}

export function checkNativeReview({req,raw,head,runId,workflowDigest,environment,liveBranch,rules,branchPolicies,reviews,priorRun,priorJobs}) {
  const comment=nativeComment({req,raw,head,runId,workflowDigest,environment,liveBranch,rules,branchPolicies});
  assert(Array.isArray(reviews));
  const list=reviews.filter(row=>row.environments?.some(e=>e.id===environmentId && e.name==='staging'));
  assert.equal(list.length,1); const [review]=list;
  assert.equal(review.state,'approved'); assert.equal(review.user?.id,owner); assert.equal(review.user?.type,'User');
  assert.equal(review.comment,comment);
  if(req.action==='undo') {
    assert.equal(priorRun?.id,Number(req.install.runId)); assert.equal(priorRun.head_sha,req.install.head);
    assert.equal(priorRun.event,'push'); assert.equal(priorRun.run_attempt,1); assert.equal(priorRun.head_branch,branch);
    assert.equal(priorRun.repository?.id,repoId); assert.equal(priorRun.actor?.id,owner); assert.equal(priorRun.path,workflow);
    assert.equal(priorRun.status,'completed'); assert.equal(priorRun.conclusion,'success');
    const jobs=priorJobs?.jobs?.filter(j=>j.name==='operate')??[];
    assert.equal(jobs.length,1); const [job]=jobs;
    assert.equal(job.head_sha,req.install.head); assert.equal(job.run_id,Number(req.install.runId));
    assert(job.conclusion==='success' && job.steps?.some(s=>s.name==='Apply one inert packet' && s.conclusion==='success'));
  }
}
export function tokenOf({req,raw,head,runId}) {
  return hash(canonical({runId,head,op:hash(raw),packet:req.packetSha256}));
}
export function issueAuthProof(review,time) {
  assert(isHash(review) && Number.isSafeInteger(time));
  return time+':'+hash('staging-auth-v20-metadata-get-v1\n'+review+'\n'+time);
}
export function validateAuthProof(value,review,req,now=Date.now()) {
  if(req.lane==='business') {assert(!value);return;}
  assert(typeof value==='string' && /^\d{13}:[a-f0-9]{64}$/.test(value));
  const checkedAt=Number(value.split(':')[0]);
  assert(checkedAt>=Date.parse(req.maintenance.startsAt) && checkedAt<Date.parse(req.maintenance.endsAt));
  assert(checkedAt<=now && now-checkedAt<=90000);
  assert.equal(value,issueAuthProof(review,checkedAt));
}
export function receiptDigest({lane,head,runId,epoch,catalogDigest}) {
  assert(lanes.includes(lane) && gitHead(head) && typeof runId==='string' && runPattern.test(runId));
  assert(typeof epoch==='string' && uuid.test(epoch) && isHash(catalogDigest));
  return hash(canonical({namespace:'econovaria-staging-inert-birth-receipt-v1',project,lane,head,runId,
    epochSha256:hash(epoch),catalogDigest,ledgerSha256:baseline}));
}
export function readPinnedCertificate(root) {
  const path=root+'scripts/operations/live-migration-reconciliation/supabase-prod-ca-2021.crt';
  assert.equal(hash(readFileSync(path)),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  return path;
}
