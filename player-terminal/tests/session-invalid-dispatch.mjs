import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dispatchInvalidSession as dispatch } from '../src/core/dispatch-invalid-session.js';
import { dispatchInvalidSession as treasury } from '../src/features/business-treasury/business-treasury-flow-support.js';
const error = { status: '401', code: 'EXPIRED', requestId: 'fixture-request' };
function runtime(events) { return { CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, dispatchEvent(event) { events.push(event); } }; }
test('non-401 exits without reading config or runtime', () => {
  for (const value of [null, undefined, {}, {status:403}, {status:500}, {status:'bad'}]) assert.equal(dispatch(value, null, null), false);
});
test('401 calls host before exact event with the same frozen detail', () => {
  const events=[]; let detail; const config={onSessionInvalid(value) { assert.equal(this,config); detail=value; assert.ok(Object.isFrozen(value));events.push('host'); }};
  assert.equal(dispatch(error,config,runtime(events)),true);
  assert.equal(events[0],'host');assert.equal(events[1].type,'econovaria:player-session-invalid');assert.equal(events[1].detail,detail);
  assert.deepEqual(detail,{reason:'invalid_player_session',terminal:'player',status:401,code:'EXPIRED',requestId:'fixture-request'});
});
test('host throw and noncallable host still permit custom event', () => {
  for(const onSessionInvalid of [()=>{throw Error('host');},true]) {const events=[];assert.equal(dispatch({status:401}, {onSessionInvalid,sessionInvalidEvent:'custom:invalid'},runtime(events)),true);assert.equal(events[0].type,'custom:invalid');assert.equal(events[0].detail.code,'SESSION_INVALID');assert.equal(events[0].detail.requestId,'');}
});
test('falsey defaults and string conversion remain exact',()=>{const events=[];dispatch({status:401,code:0,requestId:12},{sessionInvalidEvent:0},runtime(events));assert.equal(events[0].type,'econovaria:player-session-invalid');assert.equal(events[0].detail.code,'SESSION_INVALID');assert.equal(events[0].detail.requestId,'12');});
test('missing dispatcher skips event construction, not host notification',()=>{let called=0;assert.equal(dispatch(error,{onSessionInvalid(){called++;}},{}),true);assert.equal(called,1);});
test('missing CustomEvent with dispatcher preserves original TypeError, no invented fallback',()=>{let called=0;assert.throws(()=>dispatch(error,{onSessionInvalid(){called++;}},{dispatchEvent(){}}),TypeError);assert.equal(called,1);});
test('dispatcher errors are not swallowed',()=>{const r=runtime([]);r.dispatchEvent=()=>{throw Error('dispatch failed');};assert.throws(()=>dispatch(error,{},r),/dispatch failed/);});
test('default runtime uses global event facilities',()=>{const keys=['CustomEvent','dispatchEvent'], saved=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k)),events=[];try {Object.assign(globalThis,runtime(events));dispatch(error,{});assert.equal(events.length,1);}finally{keys.forEach((k,i)=>saved[i]?Object.defineProperty(globalThis,k,saved[i]):delete globalThis[k]);}});
test('Treasury compatibility export is identical and Banking imports leaf',async()=>{assert.equal(treasury,dispatch);const banking=await readFile(new URL('../src/features/banking/banking-read-flow.js',import.meta.url),'utf8');assert.match(banking,/import \{ dispatchInvalidSession \} from "\.\.\/\.\.\/core\/dispatch-invalid-session.js"/);assert.doesNotMatch(banking,/function dispatchInvalidSession/);const leaf=await readFile(new URL('../src/core/dispatch-invalid-session.js',import.meta.url),'utf8');assert.doesNotMatch(leaf,/^import /m);});
