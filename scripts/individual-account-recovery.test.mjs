import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_TARGETS, validateIndividualRecovery, individualRecoveryDigest } from './security/individual-account-recovery.mjs';
import { recoveryPlan, runApprovedRecovery, createRecoveryDelivery, createRecoveryOperatorStore, createRecoveryDeliveryStore,
  assessRecoveryReconciliation, restartExpiredRecovery, main } from './security/staging-account-recovery.mjs';
const now=Date.parse('2026-10-07T22:00:00.000Z');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request=environment=>validateIndividualRecovery({version:'2',environment,projectRef:RECOVERY_TARGETS[environment],
  authUserId:uid(1),requestId:uid(2),sourceCommit:'a'.repeat(40),operation:'reset-individual-mfa',factorIds:[uid(3)],
  supportRequestRef:'support/individual-001',identityEvidenceRef:'identity/independent-001',expiresAt:new Date(now+600_000).toISOString()},now);
const target=r=>({environment:r.environment,projectRef:r.projectRef,supabaseUrl:`https://${r.projectRef}.supabase.co`,operatorSubject:'external:sole-admin'});
const approval=r=>({verified:true,principalKind:'system',identityChecksVerified:true,supportRequestVerified:true,
  subject:'external:sole-admin',authenticatedAt:now,request:r,factorIds:r.factorIds,confirmedOperationDigest:individualRecoveryDigest(r),productionConfirmed:true});
function fixture(r) {
  let phase='restricted';const events=[],state=new Map([[uid(1),[uid(3)]],[uid(9),[uid(8)]]]);
  return {events,state,target:target(r),verifyOperatorApproval:async()=>approval(r),
    store:{target:target(r),begin:async()=>events.push('restrict'),read:async()=>({phase,restricted:true}),
      advance:async(_r,expected,next)=>{if(phase!==expected)throw Error('already acquired');phase=next;events.push(next);}},
    provider:{target:target(r),revokeSessions:async u=>{assert.equal(u,r.authUserId);events.push('revoke');},
      listFactorMetadata:async u=>state.get(u).map(id=>({id,status:'verified'})),
      deleteFactor:async(u,id)=>{state.set(u,state.get(u).filter(f=>f!==id));events.push('delete');}},
    delivery:{target:target(r),prepare:async()=>({grantDigest:'b'.repeat(64),expiresAt:now+600_000}),send:async()=>events.push('send')},
  };
}
for (const environment of Object.keys(RECOVERY_TARGETS)) {
  test(`${environment}: explicit single-account plan and ordered isolated effects`,async()=>{
    const r=request(environment),f=fixture(r),plan=recoveryPlan(r,now);
    assert.equal(plan.liveExecutionEnabled,false);assert.equal(plan.environment,environment);
    assert.equal(plan.operationDigest,individualRecoveryDigest(r));assert.ok(!JSON.stringify(plan).includes(r.authUserId));
    assert.ok(Object.isFrozen(r.factorIds));await runApprovedRecovery(r,f,now);
    assert.deepEqual(f.events,['restrict','revoking','revoke','revoked','removing','delete','removed','ready','send']);
    assert.deepEqual(f.state.get(uid(9)),[uid(8)]);
  });
  test(`${environment}: bulk, implicit scope and altered approval rejected before effects`,async()=>{
    const r=request(environment);
    for(const change of [{environment:undefined},{projectRef:'unknown'},{authUserId:[uid(1),uid(9)]},
      {authUserId:'*'},{operation:'disable-all-mfa'},{accounts:[uid(1)]},{factorIds:[uid(3),uid(3)]},
      {supportRequestRef:''},{expiresAt:new Date(now-1).toISOString()}]) {
      const f=fixture(r);await assert.rejects(runApprovedRecovery({...r,...change},f,now));assert.deepEqual(f.events,[]);
    }
    for(const change of [{subject:'external:another-admin'},{principalKind:'game_admin'},{principalKind:'security_operator'},
      {supportRequestVerified:false},{authenticatedAt:now-300_001},{confirmedOperationDigest:'c'.repeat(64)},
      {factorIds:[]},{request:{...r,operation:'disable-all-mfa'}},...(environment==='production'?[{productionConfirmed:false}]:[])]) {
      const f=fixture(r);f.verifyOperatorApproval=async()=>({...approval(r),...change});
      await assert.rejects(runApprovedRecovery(r,f,now));assert.deepEqual(f.events,[]);
    }
  });
  test(`${environment}: swapped trusted bindings cannot reach a provider`,async()=>{
    const r=request(environment),other=request(environment==='staging'?'production':'staging');
    for(const part of ['target','store','provider','delivery']) {
      const f=fixture(r);if(part==='target')f.target=target(other);else f[part].target=target(other);
      await assert.rejects(runApprovedRecovery(r,f,now));assert.deepEqual(f.events,[]);
    }
    const f=fixture(r);f.provider.target={...f.provider.target,supabaseUrl:'https://wrong.invalid'};
    await assert.rejects(runApprovedRecovery(r,f,now));assert.deepEqual(f.events,[]);
  });
  test(`${environment}: ambiguous deletion cannot be repeated and reconciliation is read-only`,async()=>{
    const r=request(environment),f=fixture(r),remove=f.provider.deleteFactor;
    f.provider.deleteFactor=async(...args)=>{await remove(...args);throw Error('ambiguous');};
    await assert.rejects(runApprovedRecovery(r,f,now));await assert.rejects(runApprovedRecovery(r,f,now));
    assert.equal(f.events.filter(e=>e==='delete').length,1);
    const before=[...f.events],result=await assessRecoveryReconciliation(r,f,now);
    assert.equal(result.providerActionsAllowed,false);assert.equal(result.restartAllowed,false);assert.deepEqual(f.events,before);
  });
}
test('v2 RPC stores retain immutable operation metadata for every call',async()=>{
  const r=request('production'),calls=[],rpc=async(name,args)=>{calls.push({name,args});return {data:true};};
  const store=createRecoveryOperatorStore(rpc,target(r)),delivery=createRecoveryDeliveryStore(rpc,target(r));
  await store.begin(r,approval(r));await store.read(r);await store.advance(r,'restricted','revoking');await delivery.reserveDelivery(r);
  for(const {name,args} of calls) {
    assert.equal(name,'system_recovery_operator_v2');assert.deepEqual(args.p_request,r);assert.equal(args.p_digest,individualRecoveryDigest(r));
  }
  assert.deepEqual(calls.map(c=>c.args.p_action),['begin','read','advance','delivery']);
});
test('v2 encrypted delivery rejects changed support request, key and project before sending',async()=>{
  const r=request('production');let record=null,sends=0;
  const store={target:target(r),readDelivery:async()=>record,reserveDelivery:async()=>true,
    saveDelivery:async(_r,v)=>{record=v;return true;},deliveryReady:async()=>true,acknowledgeDelivery:async()=>true};
  const provider={target:target(r),issueRecoveryToken:async()=>({authUserId:r.authUserId,projectRef:r.projectRef,tokenHash:'t'.repeat(32)}),
    sendRecovery:async()=>{sends++;return {acknowledged:true};}};
  const options={key:Buffer.alloc(32,7),target:target(r),store,provider,clock:()=>now},d=createRecoveryDelivery(options);
  await d.prepare(r);await assert.rejects(d.send({...r,supportRequestRef:'support/changed-001'}),/authentication/);
  await assert.rejects(createRecoveryDelivery({...options,key:Buffer.alloc(32,8)}).send(r),/authentication/);
  await assert.rejects(d.send(request('staging')),/target binding/);assert.equal(sends,0);
  await d.send(r);assert.equal(sends,1);assert.ok(!JSON.stringify(record).includes('t'.repeat(32)));
});
test('restart requires fresh approval of both exact versioned requests',async()=>{
  const previous=request('production'),later=now+700_000;
  const fresh=validateIndividualRecovery({...previous,requestId:uid(4),expiresAt:new Date(later+600_000).toISOString()},later);
  let calls=0;const adapters={target:target(fresh),verifyRestartApproval:async()=>({...approval(fresh),authenticatedAt:later,previous}),
    rpc:async(name,args)=>{calls++;assert.equal(name,'system_recovery_operator_v2');assert.deepEqual(args.p_payload.previous,previous);return {data:fresh.requestId};}};
  await restartExpiredRecovery(previous,fresh,adapters,later);assert.equal(calls,1);
  adapters.verifyRestartApproval=async()=>({...approval(fresh),authenticatedAt:later,previous:{...previous,factorIds:[]}});
  await assert.rejects(restartExpiredRecovery(previous,fresh,adapters,later));assert.equal(calls,1);
});
test('live CLI still rejects execution switches',async()=>{
  for(const args of [['--execute','production'],['--approve','all'],['--live']])await assert.rejects(main(args),/disabled/);
});
