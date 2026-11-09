import test from 'node:test';
import assert from 'node:assert/strict';
import { main, recoveryPlan, validateRecoveryRequest } from './security/staging-account-recovery.mjs';
const now = Date.parse('2026-10-05T21:30:00Z');
const request = {
  requestId: 'c0cc63d0-b8ea-4ac7-bb05-c5216a1aa125',
  projectRef: 'eecvbssdvarfcykcfrny',
  authUserId: 'ad242888-7558-4e50-8a10-f1fb530b142b',
  sourceCommit: 'a'.repeat(40), identityEvidenceRef: 'recovery-review/example-001',
  expiresAt: '2026-10-05T21:40:00Z',
};
test('planning is staging-bound, immutable and does not output the target identity', () => {
  const plan = recoveryPlan(request, now);
  assert.equal(plan.liveExecutionEnabled, false);
  assert.equal(plan.mode, 'plan-only');
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.steps));
  assert.ok(!JSON.stringify(plan).includes(request.authUserId));
});
test('rejects production, stale grants, broad requests and forged operator approval', () => {
  for (const change of [
    {projectRef:'cgiukdjwicykrmtkhudh'}, {expiresAt:'2026-10-05T21:30:00Z'},
    {expiresAt:'2026-10-06T21:30:00Z'}, {sourceCommit:'main'}, {authUserId:'*'},
    {actor:'security_operator'}, {mfaVerified:true}, {password:'should-not-be-accepted'},
    {identityEvidenceRef:'https://example.com/?token=secret'},
  ]) assert.throws(() => validateRecoveryRequest({...request,...change},now));
});
test('no live command can be enabled by arguments', async () => {
  for (const args of [[],['--apply'],['--apply','--approved'],['--plan','x','--apply']]) {
    await assert.rejects(main(args), /execution is disabled/);
  }
});

import { runApprovedRecovery } from './security/staging-account-recovery.mjs';
const factorId='f9205e5d-4c57-48af-83c3-a08865c1e519';
function adapters(overrides={}) {
  let phase='restricted';let factors=[{id:factorId,status:'verified'}];
  const events=[];
  const result={events,
    verifyOperatorApproval:async()=>({verified:true,principalKind:'system',identityChecksVerified:true,subject:'operator:test',authenticatedAt:now,request,factorIds:[factorId],...overrides}),
    store:{begin:async()=>events.push('restrict'),read:async()=>({phase}),advance:async(_req,expected,next)=>{
      assert.equal(phase,expected);if(next==='removed')assert.equal(factors.length,0);phase=next;events.push(next);
    }},
    provider:{revokeSessions:async()=>events.push('revoke'),listFactorMetadata:async()=>factors,deleteFactor:async(user,id)=>{
      assert.equal(user,request.authUserId);assert.equal(id,factorId);events.push('delete');factors=[];
    }},
    delivery:{prepare:async()=>({grantDigest:'c'.repeat(64),expiresAt:now+600_000}),send:async()=>events.push('send')},
  };return result;
}
test('system operator workflow orders restriction, revocation, exact deletion, grant and delivery',async()=>{
  const fake=adapters();const result=await runApprovedRecovery(request,fake,now);
  assert.equal(result.restricted,true);
  assert.deepEqual(fake.events,['restrict','revoking','revoke','revoked','removing','delete','removed','ready','send']);
});
test('application roles, stale authentication and mismatched approval cannot start recovery',async()=>{
  for(const change of [{principalKind:'game_admin'},{principalKind:'security_operator'},{verified:false},
    {authenticatedAt:now-300_001},{identityChecksVerified:false},{request:{...request,sourceCommit:'b'.repeat(40)}}]) {
    const fake=adapters(change);await assert.rejects(runApprovedRecovery(request,fake,now));assert.deepEqual(fake.events,[]);
  }
});
test('provider revocation failure and unexpected factors leave restriction in place without delivery',async()=>{
  const failed=adapters();failed.provider.revokeSessions=async()=>{throw Error('provider unavailable');};
  await assert.rejects(runApprovedRecovery(request,failed,now));assert.deepEqual(failed.events,['restrict','revoking']);
  const changed=adapters();changed.provider.listFactorMetadata=async()=>[{id:request.authUserId,status:'verified'}];
  await assert.rejects(runApprovedRecovery(request,changed,now));assert.deepEqual(changed.events,['restrict','revoking','revoke','revoked','removing']);
});
test('lost factor-deletion response requires reconciliation and cannot repeat provider effects',async()=>{
  const fake=adapters();const remove=fake.provider.deleteFactor;let first=true;
  fake.provider.deleteFactor=async(...args)=>{await remove(...args);if(first){first=false;throw Error('lost response');}};
  await assert.rejects(runApprovedRecovery(request,fake,now));
  await assert.rejects(runApprovedRecovery(request,fake,now), /not ready/);
  assert.equal(fake.events.filter(e=>e==='delete').length,1);
  assert.equal(fake.events.includes('send'),false);
});

import { createRecoveryDelivery, createRecoveryDeliveryStore, assessRecoveryReconciliation } from './security/staging-account-recovery.mjs';
function deliveryFixture() {
  let reserved=false,record=null,ready=false,issues=0,sends=0;
  const messages=new Map();
  const store={
    readDelivery:async()=>record,
    reserveDelivery:async()=>{if(reserved)return false;reserved=true;return true;},
    saveDelivery:async(_request,value)=>{record=structuredClone(value);return true;},
    deliveryReady:async()=>ready,
    acknowledgeDelivery:async()=>{record.delivered=true;return true;},
  };
  const provider={issueRecoveryToken:async()=>{issues++;return {authUserId:request.authUserId,projectRef:request.projectRef,tokenHash:'t'.repeat(32)};},
    sendRecovery:async(req,payload,{idempotencyKey})=>{sends++;assert.equal(req.authUserId,request.authUserId);messages.set(idempotencyKey,structuredClone(payload));return {acknowledged:true};},
  };
  return {store,provider,messages,key:Buffer.alloc(32,7),clock:()=>now,
    ready:()=>{ready=true;},getRecord:()=>record,counts:()=>({issues,sends})};
}
test('delivery reserves before issuance, persists encrypted material and reuses the exact link',async()=>{
  const f=deliveryFixture(),delivery=createRecoveryDelivery(f);
  const prepared=await delivery.prepare(request);const repeated=await delivery.prepare(request);
  assert.deepEqual(prepared,repeated);assert.equal(f.counts().issues,1);
  assert.ok(!JSON.stringify(f.getRecord()).includes('t'.repeat(32)));
  assert.ok(!JSON.stringify(prepared).includes('sealed'));
  await assert.rejects(delivery.send(request),/not ready/);assert.equal(f.counts().sends,0);
  f.ready();await delivery.send(request);await delivery.send(request);
  assert.equal(f.counts().sends,1);assert.equal(f.messages.size,1);
  const payload=[...f.messages.values()][0];assert.match(payload.grant,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(payload.tokenHash,'t'.repeat(32));
});
test('overlapping delivery preparations issue one token; lost issuance never issues another',async()=>{
  const f=deliveryFixture();f.provider.issueRecoveryToken=async()=>{throw Error('secret-provider-response');};
  const d=createRecoveryDelivery(f);
  const results=await Promise.allSettled([d.prepare(request),d.prepare(request)]);
  assert.ok(results.every(r=>r.status==='rejected' && !r.reason.message.includes('secret-provider')));
  await assert.rejects(d.prepare(request),/reconciliation/);assert.equal(f.getRecord(),null);
});
test('authenticated ciphertext rejects tampering, wrong keys and cross-attempt replay before sending',async()=>{
  const f=deliveryFixture(),d=createRecoveryDelivery(f);await d.prepare(request);f.ready();
  await assert.rejects(createRecoveryDelivery({...f,key:Buffer.alloc(32,8)}).send(request),/authentication/);
  await assert.rejects(d.send({...request,sourceCommit:'b'.repeat(40)}),/authentication/);
  const record=f.getRecord();const sealed=record.sealed;record.sealed=`${sealed[0]==='A'?'B':'A'}${sealed.slice(1)}`;
  await assert.rejects(d.send(request),/authentication/);assert.equal(f.counts().sends,0);
});
test('unknown send outcome is unacknowledged and retries with the same provider idempotency key',async()=>{
  const f=deliveryFixture();const send=f.provider.sendRecovery;let first=true;
  f.provider.sendRecovery=async(...args)=>{const result=await send(...args);if(first){first=false;throw Error('private delivery response');}return result;};
  const d=createRecoveryDelivery(f);await d.prepare(request);f.ready();
  await assert.rejects(d.send(request),/^Error: Recovery delivery outcome unknown$/);
  assert.notEqual(f.getRecord().delivered,true);await d.send(request);
  assert.equal(f.messages.size,1);assert.equal(f.counts().issues,1);assert.equal(f.getRecord().delivered,true);
});
test('delivery persistence adapter binds exact identity and fails closed on RPC errors',async()=>{
  const seen=[];const store=createRecoveryDeliveryStore(async(name,args)=>{seen.push({name,args});return {data:true,error:null};});
  await store.reserveDelivery(request);
  assert.deepEqual(seen[0],{name:'system_recovery_delivery_v1',args:{p_id:request.requestId,p_user:request.authUserId,p_source:request.sourceCommit,p_evidence:request.identityEvidenceRef,p_request_expires:request.expiresAt,p_action:'reserve',p_record:null}});
  await assert.rejects(createRecoveryDeliveryStore(async()=>({error:{message:'private'}})).readDelivery(request),/persistence unavailable/);
});
test('reconciliation is read-only, operator-bound and never assumes expired workers stopped',async()=>{
  const f=adapters();let reads=0;
  f.store.read=async()=>{reads++;return {phase:'completing',restricted:true};};
  const later=now+1_800_000;f.verifyOperatorApproval=async()=>({verified:true,principalKind:'system',identityChecksVerified:true,subject:'operator:test',authenticatedAt:later,request});
  const result=await assessRecoveryReconciliation(request,f,later);
  assert.equal(result.expired,true);assert.equal(result.restartAllowed,false);assert.equal(result.providerActionsAllowed,false);
  assert.equal(result.restricted,true);assert.equal(reads,1);assert.deepEqual(f.events,[]);
  f.verifyOperatorApproval=async()=>({verified:true,principalKind:'security_operator'});
  await assert.rejects(assessRecoveryReconciliation(request,f,later),/External operator/);assert.equal(reads,1);
});

import { deliverRecoveryNotice } from './security/staging-account-recovery.mjs';
test('lifecycle notices persist acknowledgement and never include grants or passwords',async()=>{
  let delivered=false,sends=0;
  const adapters={rpc:async(name,args)=>{assert.equal(name,'system_recovery_notice_v1');assert.equal(args.p_user,request.authUserId);if(args.p_ack)delivered=true;return {data:{kind:'completed',delivered},error:null};},
    provider:{sendNotice:async(req,payload,options)=>{sends++;assert.equal(req.requestId,request.requestId);assert.deepEqual(payload,{kind:'completed'});assert.equal(options.idempotencyKey,`recovery-notice:${request.requestId}:completed`);return {acknowledged:true};}}};
  await deliverRecoveryNotice(request,'completed',adapters,now);await deliverRecoveryNotice(request,'completed',adapters,now);
  assert.equal(delivered,true);assert.equal(sends,1);
});
test('unknown lifecycle notice outcome never acknowledges the outbox',async()=>{
  const actions=[];
  await assert.rejects(deliverRecoveryNotice(request,'started',{rpc:async(_name,args)=>{actions.push(args);return {data:{kind:'started',delivered:false}};},provider:{sendNotice:async()=>{throw Error('private');}}},now),/notice outcome unknown/);
  assert.equal(actions.length,1);assert.equal(actions[0].p_ack,undefined);
});
test('delivery requires explicit durable success, rejecting false, null and truthy strings',async()=>{
  for(const value of [false,null,'true']){
    for(const operation of ['reserveDelivery','saveDelivery','deliveryReady','acknowledgeDelivery']){
      const f=deliveryFixture(),d=createRecoveryDelivery(f);
      if(['deliveryReady','acknowledgeDelivery'].includes(operation)){await d.prepare(request);f.ready();}
      f.store[operation]=async()=>value;
      await assert.rejects(['reserveDelivery','saveDelivery'].includes(operation)?d.prepare(request):d.send(request));
      if(operation==='reserveDelivery')assert.equal(f.counts().issues,0);
      if(operation==='deliveryReady')assert.equal(f.counts().sends,0);
    }
  }
});

test('a stale operator worker cannot revoke after another worker acquired and advanced',async()=>{
  const f=adapters();let reads=0,release;
  const pause=new Promise(resolve=>{release=resolve;});const read=f.store.read;
  f.store.read=async(...args)=>{const state=await read(...args);if(++reads===1)await pause;return state;};
  const stale=runApprovedRecovery(request,f,now);
  while(reads===0)await new Promise(resolve=>setImmediate(resolve));
  await runApprovedRecovery(request,f,now);
  release();await assert.rejects(stale);
  assert.equal(f.events.filter(event=>event==='revoke').length,1);
  assert.equal(f.events.filter(event=>event==='delete').length,1);
});

import { restartExpiredRecovery } from './security/staging-account-recovery.mjs';
test('bounded restart requires fresh external approval of both exact attempts and performs only the atomic RPC',async()=>{
  const later=now+900_000;
  const next={...request,requestId:'c0cc63d0-b8ea-4ac7-bb05-c5216a1aa126',expiresAt:new Date(later+600_000).toISOString()};
  const calls=[];const approval={verified:true,principalKind:'system',identityChecksVerified:true,subject:'operator:restart',authenticatedAt:later,previous:request,request:next};
  const adapters={verifyRestartApproval:async()=>approval,rpc:async(name,args)=>{calls.push({name,args});return {data:next.requestId,error:null};}};
  const result=await restartExpiredRecovery(request,next,adapters,later);
  assert.deepEqual(result,{requestId:next.requestId,phase:'restricted',restricted:true});
  assert.equal(calls.length,1);assert.equal(calls[0].name,'system_recovery_restart_v1');
  assert.equal(calls[0].args.p_old_id,request.requestId);assert.equal(calls[0].args.p_new_id,next.requestId);
  for(const change of [{principalKind:'security_operator'},{authenticatedAt:later-300_001},{previous:{...request,sourceCommit:'b'.repeat(40)}},{request:{...next,authUserId:request.requestId}}]){
    await assert.rejects(restartExpiredRecovery(request,next,{...adapters,verifyRestartApproval:async()=>({...approval,...change})},later),/approval/);
  }
  assert.equal(calls.length,1);
  await assert.rejects(restartExpiredRecovery(request,next,{...adapters,rpc:async()=>({data:null,error:{message:'unresolved effect'}})},later),/restart unavailable/);
});

import { createRecoveryOperatorStore } from './security/staging-account-recovery.mjs';
test('operator store binds every RPC to the approved attempt and expiry without exposing private state',async()=>{
  const calls=[];
  const store=createRecoveryOperatorStore(async(name,args)=>{calls.push({name,args});return {data:name==='system_recovery_operator_state_v1'?{phase:'restricted',restricted:true}:null,error:null};});
  await store.begin(request,{subject:'operator:test'});
  assert.equal(calls[0].name,'system_recovery_begin_v1');assert.equal(calls[0].args.p_expires,request.expiresAt);
  assert.equal(calls[0].args.p_operator,'operator:test');assert.equal(calls[0].args.p_project,request.projectRef);
  assert.deepEqual(await store.read(request),{phase:'restricted',restricted:true});
  await store.advance(request,'removed','ready',{grantDigest:'c'.repeat(64),expiresAt:Date.parse(request.expiresAt)});
  assert.equal(Date.parse(calls[2].args.p_expires),Date.parse(request.expiresAt));assert.equal(calls[2].args.p_expected,'removed');
  for(const call of calls){assert.equal(call.args.p_id,request.requestId);assert.equal(call.args.p_user,request.authUserId);assert.equal(call.args.p_source,request.sourceCommit);}
  await assert.rejects(createRecoveryOperatorStore(async()=>({error:{message:'private-detail'}})).read(request),/^Error: Recovery operator persistence unavailable$/);
});
