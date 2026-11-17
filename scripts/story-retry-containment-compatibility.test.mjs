import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('busy containment response parses and exits before any effect in verified deployed-compatible code',()=>{
 execFileSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 import {SupabaseStoryEventExecutionRepository} from './backend/src/domains/storylines/infrastructure/supabaseStoryEventExecutionRepository.ts';
 import {resolveCandidate} from './backend/src/domains/storylines/services/storylineEventResolution.ts';
 const row={claim_outcome:'busy',claim_id:'fixture',lease_token:null,lease_expires_at:null,effective_at:'2026-08-12T03:00:00Z',effective_market_tick:4,attempt_count:8618,execution_plan:{},resolution_id:null};
 const repository=new SupabaseStoryEventExecutionRepository({async rpc(){return {data:[row],error:null};}});
 const input={gameSessionId:'game',storylineEventId:'event',effectiveAt:row.effective_at,effectiveMarketTick:4,executionPlan:null};
 const claim=await repository.claim(input);
 assert.equal(claim.outcome,'busy'); assert.equal(claim.leaseExpiresAt,null); assert.deepEqual(claim.executionPlan,{});
 const forbidden=new Proxy({}, {get(){throw new Error('Effect/dependency access is forbidden for busy');}});
 const result=await resolveCandidate({id:'event',eventKey:'fixture',triggerType:'elapsed_time'},
   {gameSessionId:'game',now:row.effective_at,currentMarketTick:4,executionRepository:repository,playerContexts:[],repository:forbidden,effectDependencies:forbidden},{});
 assert.equal(result.status,'skipped'); assert.equal(result.reason,'execution_in_progress');
 for(const invalid of [{...row,effective_at:null},{...row,attempt_count:-1}]){
   const bad=new SupabaseStoryEventExecutionRepository({async rpc(){return {data:[invalid],error:null};}});
   await assert.rejects(()=>bad.claim(input));
 }
 `],{stdio:['ignore','pipe','pipe'],timeout:30000});
});
