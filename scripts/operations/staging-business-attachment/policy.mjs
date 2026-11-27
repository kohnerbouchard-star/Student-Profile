import assert from 'node:assert/strict';
import {approvalComment} from '../staging-suffix-permission-preflight/run.mjs';
import {baseline,branch,canonical,hash,isHash,owner,project,receiptDigest,ref,repo,repoId,runPattern,shape,uuid}
  from '../staging-inert-sidecar/policy.mjs';

export {baseline,branch,canonical,hash,isHash,owner,project,ref,repo,repoId,runPattern,shape,uuid};
export const predecessor='aa5bf196d4eb9e5d056bf7f852827b318be837b8';
export const sourceZip='1efbe24882fd6e437a03625961a3af90aaff9d79573e1c99486173c83273aa9b';
export const dir='scripts/operations/staging-business-attachment/';
export const requestPath=dir+'request.json';
export const workflow='.github/workflows/staging-business-attachment.yml';
const oldWorkflow='.github/workflows/staging-inert-sidecar.yml';
export const workflowName='Staging Business Attachment (Open Only)';
const oldStep='Apply one inert packet', newStep='Apply one open Business attachment phase';
const environmentId=18428073637;
const sha=x=>typeof x==='string' && /^(?!0{40}$)[a-f0-9]{40}$/u.test(x);
const run=x=>typeof x==='string' && runPattern.test(x);

export const births=Object.freeze({
  business:Object.freeze({head:'1769d51bf4370f4d1ea630350553865d2a5d3271',runId:'45933309970',
    catalogDigest:'4ee2193d408d59305288749d96b0cbb4906bc82213fa82b0e410b17652e4748b',
    receiptSha256:'b23b4bcf4f8f21a84b4d93c79afc983ff8d48bdd16ff209afbfaa26da9d2c308'}),
  auth:Object.freeze({head:predecessor,runId:'45933718158',
    catalogDigest:'64ec5cd906956f84023df190ac2f4d86511207d7abd517f6ff999bd0a6408ff7',
    receiptSha256:'496fbf17ff53067850f5061e0eaf384b26959b860cf8c11d5f04219130f74a90'}),
});
export const operations=Object.freeze({
  'attach-open':Object.freeze({file:'attach-economic-writers.sql',
    sha256:'e2aac82d13cc3cf5e7d923f9bba6504f222d1feb09e642e07386a54de5297e6e'}),
  'detach-open':Object.freeze({file:'detach-economic-writers.sql',
    sha256:'86a823ace20f457aab9c238bfb316b52206a69e6fc34059033114b18a9fbef8b'}),
});
export const paths=[workflow,...['README.md','policy.mjs','sql.mjs','run.mjs','transport.test.mjs','native-qualification.py',
  ...Object.values(operations).map(x=>x.file)].map(x=>dir+x)].sort();
const birthSetDigest=hash(canonical(births));

export function packetDigest(action) {
  assert(Object.hasOwn(operations,action));
  return hash(canonical({domain:'econovaria-stage-business-attachment-packet-v1',sourceZip,
    action,member:operations[action]}));
}
export function verifyPacket(action, read) {
  assert(Object.hasOwn(operations,action));
  const member=operations[action], raw=read(member.file);
  assert(Buffer.isBuffer(raw) && hash(raw)===member.sha256,'BUSINESS_PACKET_DRIFT');
  return raw.toString('utf8');
}
function utc(value) {
  assert(typeof value==='string');
  const t=Date.parse(value);
  assert(Number.isFinite(t) && new Date(t).toISOString()===value);
  return t;
}
export function parseRequest(raw, now=Date.now(), historical=false) {
  assert(Buffer.isBuffer(raw) && raw.length>0 && raw.length<=3072);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),o=JSON.parse(text);
  assert(Buffer.from(canonical(o)).equals(raw),'BUSINESS_REQUEST_NOT_CANONICAL');
  shape(o,'schemaVersion target projectRef ledgerSha256 bootstrapHead expectedParent action packetSha256 maintenance'+
    (o.action==='detach-open'?' attach':''));
  assert.equal(o.schemaVersion,1);assert.equal(o.target,'staging-business-open-only');
  assert.equal(o.projectRef,project);assert.equal(o.ledgerSha256,baseline);
  assert(sha(o.bootstrapHead)&&sha(o.expectedParent));
  assert.equal(o.packetSha256,packetDigest(o.action));
  shape(o.maintenance,'startsAt endsAt ownerEvidenceSha256');
  const start=utc(o.maintenance.startsAt), end=utc(o.maintenance.endsAt);
  assert(start>=Date.parse('2026-11-27T03:23:29.000Z') && end>start && end-start<=30*60_000);
  if(!historical) assert(start<=now && now<end,'BUSINESS_WINDOW_CLOSED');
  assert(isHash(o.maintenance.ownerEvidenceSha256));
  if(o.action==='detach-open') {
    shape(o.attach,'head runId receiptSha256');
    assert(sha(o.attach.head)&&run(o.attach.runId)&&isHash(o.attach.receiptSha256));
  }
  return o;
}
export function validateContext(env,event,head) {
  for(const [k,v] of Object.entries({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_WORKFLOW:workflowName,
    GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:String(repoId),GITHUB_ACTOR_ID:String(owner),GITHUB_REF:ref,
    GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:head})) assert.equal(env[k],v);
  assert(run(env.GITHUB_RUN_ID));
  assert(sha(head)&&sha(event.before)&&event.before!==head);
  assert.equal(event.after,head); assert.equal(event.head_commit?.id,head); assert.equal(event.ref,ref);
  assert.equal(event.repository?.full_name,repo);assert.equal(event.repository?.id,repoId);
  assert.equal(event.repository?.private,false);assert.equal(event.repository?.owner?.id,owner);
  assert.equal(event.sender?.id,owner);assert.equal(event.sender?.type,'User');
  for(const k of ['created','forced','deleted']) assert.equal(event[k],false);
}
export function validateHistory(req,git,head,before) {
  const parent=h=>git('show','-s','--format=%P',h);
  const names=(a,b)=>git('diff','--name-only',a,b).split('\n').sort();
  const boot=req.bootstrapHead;
  assert.equal(parent(boot),predecessor,'BUSINESS_BOOTSTRAP_REPIN_REQUIRED');
  assert.deepEqual(names(predecessor,boot),paths,'BUSINESS_BOOTSTRAP_SCOPE_DRIFT');
  assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  assert.equal(req.expectedParent,before);
  assert.equal(parent(head),before);
  assert.deepEqual(names(before,head),[requestPath]);
  if(req.action==='attach-open') { assert.equal(before,boot); return; }
  assert.equal(before,req.attach.head);
  assert.equal(parent(before),boot);
  assert.deepEqual(names(boot,before),[requestPath]);
  const prior=parseRequest(Buffer.from(git('show',before+':'+requestPath),'utf8'),Date.now(),true);
  assert.equal(prior.action,'attach-open');
  assert.equal(prior.bootstrapHead,boot);assert.equal(prior.expectedParent,boot);
  assert.notEqual(prior.maintenance.ownerEvidenceSha256,req.maintenance.ownerEvidenceSha256);
  assert(utc(prior.maintenance.startsAt)<=utc(req.maintenance.startsAt));
}
export const tokenOf=({head,runId,raw})=>hash(canonical({head,runId,request:hash(raw),birthSetDigest}));
export function birthMatches(lane,epoch) {
  const b=births[lane];
  assert(b && typeof epoch==='string' && uuid.test(epoch));
  assert.equal(receiptDigest({lane,...b,epoch}),b.receiptSha256,'BUSINESS_PRIOR_INERT_RECEIPT_DRIFT');
}
export function phaseReceipt({head,runId,action,epoch,catalogDigest,guardDigest,priorReceipt}) {
  assert(sha(head)&&run(runId)&&Object.hasOwn(operations,action)&&uuid.test(epoch));
  assert([catalogDigest,guardDigest,priorReceipt].every(isHash));
  return hash(canonical({domain:'econovaria-staging-business-open-receipt-v1',project,ledger:baseline,
    head,runId,action,epochSha256:hash(epoch),catalogDigest,guardDigest,priorReceipt}));
}
export function validateTerminalRun(identity, observed, workflowPath, stepName) {
  const {priorRun,priorJobs}=observed;
  assert.equal(priorRun?.id,Number(identity.runId));assert.equal(priorRun.head_sha,identity.head);
  assert.equal(priorRun.event,'push');assert.equal(priorRun.run_attempt,1);assert.equal(priorRun.head_branch,branch);
  assert.equal(priorRun.repository?.id,repoId);assert.equal(priorRun.actor?.id,owner);
  assert.equal(priorRun.path,workflowPath);assert.equal(priorRun.status,'completed');assert.equal(priorRun.conclusion,'success');
  const jobs=priorJobs?.jobs?.filter(j=>j.name==='operate')??[];
  assert.equal(jobs.length,1);assert.equal(jobs[0].head_sha,identity.head);assert.equal(jobs[0].run_id,Number(identity.runId));
  assert(jobs[0].status==='completed' && jobs[0].conclusion==='success' &&
    jobs[0].steps?.some(s=>s.name===stepName && s.conclusion==='success'));
}
export function approvalText(ctx) {
  const {req,raw,head,runId,workflowDigest,environment,liveBranch,rules,branchPolicies}=ctx;
  const line=approvalComment({head,runId,workflowSha256:workflowDigest,environment,branch:liveBranch,rules,branchPolicies});
  return [line.replace('econovaria-staging-preflight-root-reviewed-v1','econovaria-staging-business-open-owner-reviewed-v1'),
    project,req.bootstrapHead,req.expectedParent,req.action,req.packetSha256,hash(raw),birthSetDigest,
    req.attach?.receiptSha256??births.business.receiptSha256,req.maintenance.ownerEvidenceSha256].join(' ');
}
export function checkReview(ctx) {
  const list=ctx.reviews.filter(x=>x.environments?.some(y=>y.id===environmentId&&y.name==='staging'));
  assert.equal(list.length,1);
  assert.equal(list[0].state,'approved');assert.equal(list[0].user?.id,owner);assert.equal(list[0].user?.type,'User');
  assert.equal(list[0].comment,approvalText(ctx));
  for(const [lane,b] of Object.entries(births)) validateTerminalRun(b,ctx.priors[lane],oldWorkflow,oldStep);
  if(ctx.req.action==='detach-open') {
    assert.notEqual(ctx.runId,ctx.req.attach.runId);
    validateTerminalRun(ctx.req.attach,ctx.priors.attach,workflow,newStep);
  }
}
