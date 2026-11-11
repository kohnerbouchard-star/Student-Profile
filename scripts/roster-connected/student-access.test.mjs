import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { wrongCode, assertStudentDto, assertStudentControlDto, assertStudentStorage, assertAccountReady, assertAccountTransition, accountSnapshot, verifyStudentAccess } from './student-access.mjs';

const source=await readFile(new URL('./student-access.mjs',import.meta.url),'utf8');
const repo=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const row={displayName:'Synthetic Repeated',playerIdentifier:`STU-${'A'.repeat(24)}`,accessCode:'B'.repeat(32)};
const future=new Date(Date.now()+3600_000).toISOString();
const dto=()=>({ok:true,session:{authenticated:true,status:'active',expiresAt:future,absoluteExpiresAt:future},
  player:{displayName:row.displayName,rosterLabel:null,playerIdentifier:row.playerIdentifier,status:'active',currencyCode:'USD'},
  gameSession:{name:'Synthetic Game',status:'active'},balances:[{accountType:'checking',balance:0,currencyCode:'USD'}],
  attendance:{status:'not_configured'},availableActions:['dashboard.view','ledger.view','STORE_PURCHASE'],csrfToken:'X'.repeat(43)});
const storage=body=>({local:{'econovaria.device.v1':'12345678-1234-4234-8234-123456789abc'},
  session:body ? {'econovaria.player.auth.v1':JSON.stringify({authenticated:true,sessionExpiresAt:body.session.expiresAt,
    absoluteExpiresAt:body.session.absoluteExpiresAt,csrfToken:body.csrfToken,player:body.player,gameSession:body.gameSession,storedAt:new Date().toISOString()})} : {},indexedDb:0,caches:0});
const ready=()=>({games:1,ready:true,players:1,playerActive:true,credentials:1,v2:true,material:'a'.repeat(32),sessions:0,active:0,revoked:0});

test('wrong-code control changes exactly one uppercase-hex character and keeps its format',()=>{
  for(const value of ['0'.repeat(32),'F'.repeat(32),'ABCDEF0123456789'.repeat(2)]) {
    const wrong=wrongCode(value);assert.match(wrong,/^[A-F0-9]{32}$/);assert.notEqual(wrong,value);assert.equal(wrong.slice(1),value.slice(1));
  }
  for(const value of ['a'.repeat(32),'0'.repeat(31),'not-a-code']) assert.throws(()=>wrongCode(value),/student-access-code-format/);
});
test('student status validates exact public identity, genuine bootstrap and no private fields',()=>{
  assert.doesNotThrow(()=>assertStudentDto(dto(),row,'Synthetic Game'));
  for(const mutate of [x=>x.player.playerIdentifier='STU-OTHER',x=>x.gameSession.name='Other',x=>x.session.authenticated=false,
    x=>x.session.token='synthetic-raw-token',x=>x.player.id='12345678-1234-1234-1234-123456789abc',x=>x.player.verifier='private',
    x=>x.gameSession.id='private',x=>x.balances[0].accountType=row.accessCode,x=>x.availableActions=[row.accessCode],x=>x.availableActions=[],x=>x.availableActions=['12345678-1234-4234-8234-123456789abc'],x=>x.balances[0].accountType='12345678-1234-4234-8234-123456789abc',x=>x.session.expiresAt='2000-01-01',x=>x.extra=true,x=>x.balances[0].id='private']) {
    const value=dto();mutate(value);assert.throws(()=>assertStudentDto(value,row,'Synthetic Game'),error=>!error.message.includes('synthetic-raw-token'));
  }
});
test('student storage permits only source-defined public DTO and device identity, never credentials',()=>{
  const body=dto();assert.doesNotThrow(()=>assertStudentStorage(storage(body),body,[row.accessCode]));
  assert.doesNotThrow(()=>assertStudentStorage(storage(null),null,[row.accessCode]));
  for(const mutate of [x=>x.local.receipt=row.accessCode,x=>x.session.other='private',x=>x.indexedDb=1,x=>x.caches=1,
    x=>{const value=JSON.parse(x.session['econovaria.player.auth.v1']);value.sessionToken='synthetic-raw-token';x.session['econovaria.player.auth.v1']=JSON.stringify(value);},
    x=>{const value=JSON.parse(x.session['econovaria.player.auth.v1']);value.player.playerIdentifier='STU-OTHER';x.session['econovaria.player.auth.v1']=JSON.stringify(value);}]) {
    const value=storage(body);mutate(value);assert.throws(()=>assertStudentStorage(value,body,[row.accessCode]),error=>!error.message.includes('synthetic-raw-token'));
  }
  assert.throws(()=>assertStudentStorage(storage(body),null,[]));
  assert.throws(()=>assertStudentStorage(storage(body),body,[body.player.displayName]),/student-storage-secret-leak/);
});
test('account state proves supported lifecycle, unchanged600000 material, wrong-code absence and revocation',()=>{
  const before=ready(),signed={...before,sessions:1,active:1},revoked={...signed,active:0,revoked:1};
  assertAccountReady(before);assertAccountTransition(before,{...before},'wrong');
  assertAccountTransition(before,signed,'login');assertAccountTransition(signed,revoked,'logout');
  for(const field of ['games','players','credentials']) assert.throws(()=>assertAccountReady({...before,[field]:0}));
  for(const field of ['ready','playerActive','v2']) assert.throws(()=>assertAccountReady({...before,[field]:false}));
  assert.throws(()=>assertAccountTransition(before,signed,'wrong'));
  assert.throws(()=>assertAccountTransition(before,{...signed,material:'b'.repeat(32)},'login'));
  assert.throws(()=>assertAccountTransition(signed,{...revoked,active:1},'logout'));
});
test('new journey binds genuine rendered auth and exact-game FKs without lifecycle writes or fake sessions',()=>{
  for(const needle of ['#gameCode','#playerId','#playerAccessCode','#playerForm button[type="submit"]','invalid_player_login',
    'student-returned-code-unchanged','student-wrong-same-identity','student-fresh-status-200','student-session-server-revoked',
    'student-revoked-cookie-rejected',"'/proxy/players/me'",'s.player_id','s.game_session_id',
    "game_join_code_hash=",'credential_iterations=600000','120_000','await context.close()']) {
    assert.ok(source.includes(needle),needle);
  }
  assert.doesNotMatch(source,/route\.(?:fulfill|abort)|addCookies|storageState|recordHar|recordVideo|\.screenshot|tracing\.start|console\.(?:log|error|warn)|\bupdate public\.|\binsert into public\./);
  assert.match(source,/cookie:`\$\{cookie\.name\}=\$\{cookie\.value\}`/);
  assert.match(source,/throw new Error\('student-access-check-failed'\)/);
});
test('source contracts bind permitted session DTO, real v2 verifier and generated-code format',async()=>{
  const [login,host,api,handler,kdf,importer]=await Promise.all([
    repo('frontend/src/core/login.js'),repo('player-terminal/host-runtime.js'),repo('frontend/src/core/api.js'),
    repo('backend/src/domains/players/api/playerLoginHttpHandler.ts'),repo('backend/src/security/playerCredentialHashing.ts'),
    repo('backend/src/domains/players/application/importPlayerRoster.ts')]);
  for(const field of ['authenticated','sessionExpiresAt','absoluteExpiresAt','csrfToken','player','gameSession','storedAt']) {
    assert.ok(login.includes(field));assert.ok(host.includes(field));
  }
  assert.ok(api.includes('"playerWebSession", "/login"'));assert.ok(api.includes('credentials: "include"'));
  assert.ok(handler.includes('dependencies.verifyCredential ?? verifyPlayerCredential'));
  assert.ok(kdf.includes('PLAYER_CREDENTIAL_ITERATIONS = 600_000'));assert.ok(importer.includes(').join("").toUpperCase()'));
});
test('student authentication is strictly after all original import/privacy assertions and owns separate evidence',async()=>{
  const browser=await readFile(new URL('./browser.mjs',import.meta.url),'utf8');
  assert.ok(browser.indexOf('await verifyStudentAccess(')>browser.indexOf('assertPersistedPrivacy(final,'));
  assert.ok(browser.includes('row:thirty.receipt.students[0]'));assert.ok(browser.includes('row:forty.receipt.students[1]'));
  assert.ok(source.includes('allCredentialsAuthenticated:false'));assert.ok(source.includes('authenticationOutsideImportDeadline:true'));
  assert.ok(browser.includes("absent(JSON.stringify(storage), [...rosterValues,...authSecrets], 'browser-storage-roster-leak')"));
});


test('account proof reads exact game/STU/session scope through private stdin without emitting secrets',async t=>{
  const old=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://postgres@localhost:54322/postgres';
  let captured;
  t.mock.method(childProcess,'execFile',(command,args,options,callback)=>{
    const stdin=new EventEmitter();stdin.end=input=>{captured={command,args,options,input};callback(null,JSON.stringify(ready()));};return {stdin};
  });syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined) delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old;});
  const game={gameId:'12345678-1234-4234-8234-123456789abc'},code='SYNTHETIC-PRIVATE-JOIN';
  assert.deepEqual(await accountSnapshot(game,code,row),ready());
  assert.equal(captured.command,'psql');assert.ok(captured.input.includes(game.gameId));assert.ok(captured.input.includes(row.playerIdentifier));
  assert.ok(captured.input.includes(createHash('sha256').update(code).digest('hex')));
  assert.ok(!captured.input.includes(code));assert.ok(!captured.input.includes(row.accessCode));
  assert.doesNotMatch(JSON.stringify(captured.args),/STU-|12345678|PRIVATE-JOIN/);
  assert.doesNotMatch(captured.input,/\b(?:insert|update|delete|alter|create)\b/i);
  assert.match(captured.input,/p\.game_session_id=s\.game_session_id/);
});

test('student journey closes its context and sanitizes a browser failure without publishing partial success',async t=>{
  const old=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://postgres@localhost:54322/postgres';
  t.mock.method(childProcess,'execFile',(_command,_args,_options,callback)=>{
    const stdin=new EventEmitter();stdin.end=()=>callback(null,JSON.stringify(ready()));return {stdin};
  });syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined) delete process.env.DATABASE_URL;else process.env.DATABASE_URL=old;});
  let closed=0;const report={},privateValues=[row.accessCode];
  const context={close:async()=>{closed++;}},page={context:()=>context,goto:async()=>{throw new Error('synthetic-browser-secret');}};
  const game={gameId:'12345678-1234-4234-8234-123456789abc'};
  game.created={data:{joinCode:'SYNTHETIC-JOIN',game:{id:game.gameId,gameId:game.gameId,status:'active',lifecycleState:'active',provisioningStatus:'ready',joinCodeStatus:'active'}}};
  await assert.rejects(verifyStudentAccess({game,gameName:'Synthetic Game',cohorts:[{count:30,row},{count:40,row:{...row,playerIdentifier:`STU-${'C'.repeat(24)}`}}],
    pageFor:async()=>page,privateValues,rosterValues:[row.displayName,row.playerIdentifier,row.accessCode],report}),error=>error.message==='student-access-check-failed' && !error.stack.includes('synthetic-browser-secret'));
  assert.equal(closed,1);assert.equal(report.studentAccess,undefined);assert.ok(privateValues.includes('SYNTHETIC-JOIN'));assert.ok(privateValues.includes(wrongCode(row.accessCode)));
});


test('control responses accept only frozen public denial/logout shapes and reject every private-field seam',()=>{
  const controls={
    'wrong-code':{ok:false,error:{code:'invalid_player_login',message:'Game Code, Player ID, or Access Code is invalid.',retryable:false}},
    'missing-session':{ok:false,error:{code:'player_session_missing',message:'Player sign-in is required.',retryable:false}},
    'revoked-session':{ok:false,error:{code:'player_session_invalid',message:'Player sign-in is required.',retryable:false}},
    logout:{ok:true},
  };
  const uuid='12345678-1234-4234-8234-123456789abc';
  for(const [phase,body] of Object.entries(controls)) {
    assert.doesNotThrow(()=>assertStudentControlDto(body,phase));
    const targets=[x=>x,...(phase==='logout' ? [] : [x=>x.error])];
    for(const target of targets) for(const key of ['id','player_id','game_id','credential_salt','credential_verifier','sessionToken','accessCode','extra']) {
      for(const value of [uuid,row.accessCode,'synthetic-private-token']) {
        const mutated=structuredClone(body);target(mutated)[key]=value;
        assert.throws(()=>assertStudentControlDto(mutated,phase),error=>!error.message.includes(value));
      }
    }
    // A secret nested in an otherwise permitted field must not evade key checks.
    for(const path of [[],...(phase==='logout' ? [] : [['error']])]) {
      const target=path.length ? body.error : body;
      for(const key of Object.keys(target)) for(const value of [uuid,row.accessCode,'synthetic-private-token',{nested:uuid}]) {
        const mutated=structuredClone(body);(path.length ? mutated.error : mutated)[key]=value;
        assert.throws(()=>assertStudentControlDto(mutated,phase),error=>!error.message.includes(uuid) && !error.message.includes(row.accessCode));
      }
      for(const key of Object.keys(target)) {
        const mutated=structuredClone(body);delete (path.length ? mutated.error : mutated)[key];
        assert.throws(()=>assertStudentControlDto(mutated,phase));
      }
    }
    assert.throws(()=>assertStudentControlDto(body,'unsupported'));
  }
  assert.throws(()=>assertStudentControlDto(controls['wrong-code'],'missing-session'));
  assert.throws(()=>assertStudentControlDto({...controls['wrong-code'],error:{...controls['wrong-code'].error,retryable:true}},'wrong-code'));
});

test('all actual student JSON response paths apply source-bound control or success contracts',async()=>{
  const [runtime,handler,edge,bootstrap,accounts]=await Promise.all([
    repo('backend/supabase/functions/player-web-session-api/runtime.ts'),repo('backend/src/domains/players/api/playerLoginHttpHandler.ts'),
    repo('backend/src/platform/supabase/edgeResponse.ts'),repo('backend/src/domains/players/api/playerSessionBootstrapHttpHandler.ts'),
    repo('backend/supabase/migrations/20260806093000_provision_player_banking_and_credit_v1.sql')]);
  assert.match(runtime,/return \{ ok: false, error: \{ code, message, retryable \} \}/);
  assert.ok(runtime.includes('body: unknown = errorBody(code, "Player sign-in is required.")'));
  assert.ok(runtime.includes('200, "signed_out", { ok: true }'));assert.ok(runtime.includes('forwardJsonResponse(request, upstream, loginBytes.body)'));
  assert.ok(handler.includes('message: "Game Code, Player ID, or Access Code is invalid."'));
  assert.match(edge,/ok: false,[\s\S]*error,/);
  for(const action of ['dashboard.view','ledger.view','STORE_PURCHASE']) assert.ok(bootstrap.includes(`"${action}"`));
  for(const type of ['checking','savings']) assert.ok(accounts.includes(`'${type}'`));
  for(const exact of ["assertStudentControlDto(deniedBody,'wrong-code')","assertStudentControlDto(anonymous.body,'missing-session')",
    "assertStudentControlDto(protectedRead.body,'missing-session')","assertStudentControlDto(await json(loggedOut),'logout')",
    "assertStudentControlDto(replayBody,'revoked-session')",'assertStudentDto(acceptedBody,row,gameName)','assertStudentDto(authenticated.body,row,gameName)']) assert.ok(source.includes(exact),exact);
});
