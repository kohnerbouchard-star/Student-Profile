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
  assert.deepEqual(fake.events,['restrict','revoke','revoked','delete','removed','ready','send']);
});
test('application roles, stale authentication and mismatched approval cannot start recovery',async()=>{
  for(const change of [{principalKind:'game_admin'},{principalKind:'security_operator'},{verified:false},
    {authenticatedAt:now-300_001},{identityChecksVerified:false},{request:{...request,sourceCommit:'b'.repeat(40)}}]) {
    const fake=adapters(change);await assert.rejects(runApprovedRecovery(request,fake,now));assert.deepEqual(fake.events,[]);
  }
});
test('provider revocation failure and unexpected factors leave restriction in place without delivery',async()=>{
  const failed=adapters();failed.provider.revokeSessions=async()=>{throw Error('provider unavailable');};
  await assert.rejects(runApprovedRecovery(request,failed,now));assert.deepEqual(failed.events,['restrict']);
  const changed=adapters();changed.provider.listFactorMetadata=async()=>[{id:request.authUserId,status:'verified'}];
  await assert.rejects(runApprovedRecovery(request,changed,now));assert.deepEqual(changed.events,['restrict','revoke','revoked']);
});
test('retry after lost factor-deletion response does not delete a different factor',async()=>{
  const fake=adapters();const remove=fake.provider.deleteFactor;let first=true;
  fake.provider.deleteFactor=async(...args)=>{await remove(...args);if(first){first=false;throw Error('lost response');}};
  await assert.rejects(runApprovedRecovery(request,fake,now));
  await runApprovedRecovery(request,fake,now);
  assert.equal(fake.events.filter(e=>e==='delete').length,1);
  assert.equal(fake.events.at(-1),'send');
});
