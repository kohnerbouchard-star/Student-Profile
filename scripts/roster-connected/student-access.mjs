import { createHash } from 'node:crypto';
import { runSql, sqlLiteral, assertNoUuid } from './auth-fixture.mjs';
import { absent, check, equal } from './evidence.mjs';

const BASE = 'http://127.0.0.1:4173';
const PREFIX = `${BASE}/functions/v1/player-web-session-api`;
const AUTH_KEY = 'econovaria.player.auth.v1';
const COOKIE = 'econovaria_player_session';
const DEVICE = 'econovaria.device.v1';
const CSRF = /^[A-Za-z0-9_-]{43}$/;
const keys = (value, expected, label) => {
  check(value && typeof value === 'object' && !Array.isArray(value), label);
  equal(Object.keys(value).sort(), [...expected].sort(), label);
};
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function wrongCode(code) {
  check(/^[A-F0-9]{32}$/.test(code), 'student-access-code-format');
  return (code[0] === '0' ? '1' : '0') + code.slice(1);
}
export function assertStudentDto(body, row, gameName) {
  assertNoUuid(body);
  keys(body,['ok','session','player','gameSession','balances','attendance','availableActions','csrfToken'],'student-status-fields');
  keys(body.session,['authenticated','status','expiresAt','absoluteExpiresAt'],'student-session-fields');
  keys(body.player,['displayName','rosterLabel','playerIdentifier','status','currencyCode'],'student-player-fields');
  keys(body.gameSession,['name','status'],'student-game-fields');
  keys(body.attendance,['status'],'student-attendance-fields');
  check(body.ok === true && body.session.authenticated === true && body.session.status === 'active','student-authenticated');
  check(validDate(body.session.expiresAt) && Date.parse(body.session.expiresAt)>Date.now() &&
    validDate(body.session.absoluteExpiresAt) && Date.parse(body.session.absoluteExpiresAt)>Date.now(),'student-session-expiry');
  check(CSRF.test(body.csrfToken),'student-csrf');
  equal(body.player.playerIdentifier,row.playerIdentifier,'student-exact-identifier');
  equal(body.player.displayName,row.displayName,'student-exact-name');
  check(body.player.rosterLabel === null && body.player.status === 'active' && /^[A-Z]{3,8}$/.test(body.player.currencyCode),'student-profile');
  equal(body.gameSession,{name:gameName,status:'active'},'student-game-projection');
  check(Array.isArray(body.balances) && body.balances.length>0,'student-bootstrap-balances');
  for(const balance of body.balances) {
    keys(balance,['accountType','balance','currencyCode'],'student-balance-fields');
    check(['checking','savings'].includes(balance.accountType) && Number.isFinite(balance.balance) && balance.currencyCode===body.player.currencyCode,'student-balance-values');
  }
  check(body.attendance.status==='not_configured','student-bootstrap-attendance');
  equal(body.availableActions,['dashboard.view','ledger.view','STORE_PURCHASE'],'student-bootstrap-actions');
}
// Source-bound control contracts from playerLoginHttpHandler.invalidPlayerLoginResponse
// and player-web-session-api errorBody/clearPlayerSessionResponse/handleLogout.
// No arbitrary message or private value is allowed even inside a known field.
export function assertStudentControlDto(body, phase) {
  assertNoUuid(body);
  if(phase==='logout') {
    keys(body,['ok'],'student-logout-fields');
    check(body.ok===true,'student-logout-state');
    return;
  }
  const expected={
    'wrong-code':['invalid_player_login','Game Code, Player ID, or Access Code is invalid.'],
    'missing-session':['player_session_missing','Player sign-in is required.'],
    'revoked-session':['player_session_invalid','Player sign-in is required.'],
  }[phase];
  check(expected,'student-control-phase');
  keys(body,['ok','error'],'student-control-fields');
  keys(body.error,['code','message','retryable'],'student-control-error-fields');
  check(body.ok===false && body.error.code===expected[0] && body.error.message===expected[1] &&
    body.error.retryable===false,'student-control-values');
}
export function assertStudentStorage(storage, body, forbidden) {
  keys(storage,['local','session','indexedDb','caches'],'student-storage-fields');
  check(Object.keys(storage.local).every(key=>key===DEVICE),'student-local-storage-keys');
  if(storage.local[DEVICE]) check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storage.local[DEVICE]),'student-public-device');
  keys(storage.session,body ? [AUTH_KEY] : [],'student-session-storage-keys');
  if(body) {
    const value=JSON.parse(storage.session[AUTH_KEY]);
    keys(value,['authenticated','sessionExpiresAt','absoluteExpiresAt','csrfToken','player','gameSession','storedAt'],'student-stored-dto-fields');
    equal({...value,storedAt:undefined},{authenticated:true,sessionExpiresAt:body.session.expiresAt,
      absoluteExpiresAt:body.session.absoluteExpiresAt,csrfToken:body.csrfToken,player:body.player,
      gameSession:body.gameSession,storedAt:undefined},'student-stored-dto-identity');
    check(validDate(value.storedAt) && Date.parse(value.storedAt)<=Date.now()+1000,'student-stored-time');
  }
  absent(JSON.stringify(storage),forbidden,'student-storage-secret-leak');
  check(storage.indexedDb===0 && storage.caches===0,'student-persistent-store');
}
async function storage(page) {
  return page.evaluate(async()=>({local:{...localStorage},session:{...sessionStorage},
    indexedDb:(await indexedDB.databases()).length,caches:(await caches.keys()).length}));
}
// Read-only identity proof binds the creation response's exact game ID, the
// normalized Game Code hash, imported STU identity and session foreign keys.
// Only counts, booleans, public identity and a material fingerprint leave SQL.
export async function accountSnapshot(game, joinCode, row) {
  const hash=createHash('sha256').update(joinCode.trim().replace(/\s+/g,'').toUpperCase()).digest('hex');
  return JSON.parse(await runSql(`with g as (select * from public.game_sessions where id::text=${sqlLiteral(game.gameId)}),
    p as (select p.* from public.players p join g on g.id=p.game_session_id where p.player_identifier=${sqlLiteral(row.playerIdentifier)}),
    c as (select c.* from public.player_access_credentials c join p on p.id=c.player_id and p.game_session_id=c.game_session_id where c.status='active'),
    s as (select s.* from public.player_sessions s join p on p.id=s.player_id and p.game_session_id=s.game_session_id)
    select jsonb_build_object('games',(select count(*) from g),'ready',(select coalesce(bool_and(status='active' and lifecycle_state='active' and provisioning_status='ready' and game_join_code_status='active' and game_join_code_hash=${sqlLiteral(hash)}),false) from g),
      'players',(select count(*) from p),'playerActive',(select coalesce(bool_and(status='active'),false) from p),
      'credentials',(select count(*) from c),'v2',(select coalesce(bool_and(credential_version='pbkdf2-sha256-v2' and credential_iterations=600000),false) from c),
      'material',(select md5(string_agg(concat_ws(':',credential_version,normalized_student_code_hash,credential_salt,credential_verifier,credential_iterations),',' order by id)) from c),
      'sessions',(select count(*) from s),'active',(select count(*) from s where status='active' and revoked_at is null and expires_at>clock_timestamp()),
      'revoked',(select count(*) from s where status='revoked' and revoked_at is not null))::text;`));
}
export function assertAccountReady(value) {
  check(value.games===1 && value.ready===true && value.players===1 && value.playerActive===true &&
    value.credentials===1 && value.v2===true && /^[0-9a-f]{32}$/.test(value.material),'student-canonical-ready');
}
export function assertAccountTransition(before, after, phase) {
  assertAccountReady(after);
  for(const key of ['games','ready','players','playerActive','credentials','v2','material']) equal(after[key],before[key],'student-auth-preserves-credential');
  if(phase==='wrong') equal(after,before,'student-wrong-code-no-session');
  else if(phase==='login') check(after.sessions===before.sessions+1 && after.active===1 && after.revoked===before.revoked,'student-session-created-in-exact-scope');
  else if(phase==='logout') check(after.sessions===before.sessions && after.active===0 && after.revoked===before.revoked+1,'student-session-server-revoked');
  else check(false,'student-auth-phase');
}

export async function verifyStudentAccess({game, gameName, cohorts, pageFor, privateValues, rosterValues, report}) {
  const joinCode=game.created.data?.joinCode;
  check(typeof joinCode==='string' && /^[A-Z0-9-]+$/.test(joinCode),'student-created-game-code');
  const created=game.created.data?.game;
  check(created?.id===game.gameId && created.gameId===game.gameId && created.status==='active' &&
    created.lifecycleState==='active' && created.provisioningStatus==='ready' && created.joinCodeStatus==='active','student-created-game-lifecycle');
  check(cohorts.length===2 && cohorts[0].count===30 && cohorts[1].count===40 &&
    cohorts[0].row.displayName===cohorts[1].row.displayName && cohorts[0].row.playerIdentifier!==cohorts[1].row.playerIdentifier,'student-representative-distinct-duplicates');
  privateValues.push(joinCode);
  const results=[];
  for(const {count,row} of cohorts) {
    report.stage=count===30 ? 'student-access-30' : 'student-access-40';
    const page=await pageFor(), context=page.context(), started=performance.now();
    // Public name/STU identity is allowed only in the exact validated native DTO.
    // privateValues contains every Access Code, never the public roster names.
    const forbidden=[...privateValues], bad=wrongCode(row.accessCode);
    forbidden.push(bad);privateValues.push(bad);
    let timer;
    const trackPayload=value=>{
      if(!value || typeof value!=='object') return;
      for(const [key,entry] of Object.entries(value)) {
        if(typeof entry==='string' && /^(?:token|sessionToken|accessToken|refreshToken|credential_salt|credential_verifier|csrfToken)$/.test(key)) {
          privateValues.push(entry);if(key!=='csrfToken') forbidden.push(entry);
        } else if(entry && typeof entry==='object') trackPayload(entry);
      }
    };
    const json=async response=>{const body=await response.json();trackPayload(body);return body;};
    const cookies=async()=>{const value=await context.cookies();for(const cookie of value){privateValues.push(cookie.value);forbidden.push(cookie.value);}return value;};
    const work=async()=>{
      const before=await accountSnapshot(game,joinCode,row);assertAccountReady(before);
      check(before.sessions===0 && before.active===0,'student-no-prior-session');
      await page.goto(`${BASE}/?mode=player`);await page.locator('#gameCode').waitFor({state:'visible'});
      check((await cookies()).length===0,'student-anonymous-cookies');
      assertStudentStorage(await storage(page),null,forbidden);
      await page.locator('#gameCode').fill(joinCode);await page.locator('#playerId').fill(row.playerIdentifier);
      const submit=async code=>{
        await page.locator('#playerAccessCode').fill(code);
        const pending=page.waitForResponse(response=>response.url()===`${PREFIX}/login` && response.request().method()==='POST');
        void pending.catch(()=>{});await page.locator('#playerForm button[type="submit"]').click();return pending;
      };
      const denied=await submit(bad), deniedBody=await json(denied);
      assertStudentControlDto(deniedBody,'wrong-code');
      equal(denied.request().postDataJSON(),{gameJoinCode:joinCode,playerIdentifier:row.playerIdentifier,accessCode:bad},'student-wrong-same-identity');
      check(denied.status()===401 && deniedBody.error?.code==='invalid_player_login','student-wrong-code-rejected');
      check((await cookies()).length===0,'student-wrong-code-no-cookie');
      const headers=await denied.request().allHeaders();
      check(headers.apikey?.startsWith('sb_publishable_') && headers['x-econovaria-device-id'],'student-own-public-headers');
      const get=async path=>page.evaluate(async ({url,apikey,device})=>{
        const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{apikey,'x-econovaria-device-id':device}});
        return {status:response.status,body:await response.json()};
      },{url:`${PREFIX}${path}`,apikey:headers.apikey,device:headers['x-econovaria-device-id']});
      const anonymous=await get('/status');trackPayload(anonymous.body);assertStudentControlDto(anonymous.body,'missing-session');
      check(anonymous.status===401 && anonymous.body.error?.code==='player_session_missing','student-wrong-code-anonymous-status');
      assertAccountTransition(before,await accountSnapshot(game,joinCode,row),'wrong');
      assertStudentStorage(await storage(page),null,forbidden);
      const accepted=await submit(row.accessCode), acceptedBody=await json(accepted);
      equal(accepted.request().postDataJSON(),{gameJoinCode:joinCode,playerIdentifier:row.playerIdentifier,accessCode:row.accessCode},'student-returned-code-unchanged');
      check(accepted.status()===200,'student-real-login-200');assertStudentDto(acceptedBody,row,gameName);
      await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/);
      await page.locator('.player-terminal-app-root').waitFor({state:'visible'});
      const authenticated=await get('/status');trackPayload(authenticated.body);
      check(authenticated.status===200,'student-fresh-status-200');assertStudentDto(authenticated.body,row,gameName);
      const signed=await accountSnapshot(game,joinCode,row);assertAccountTransition(before,signed,'login');
      const mountedCookies=await cookies();check(mountedCookies.length===1,'student-one-cookie');
      const cookie=mountedCookies[0];check(cookie.name===COOKIE && cookie.httpOnly===true && cookie.sameSite==='Strict' && cookie.path==='/' && cookie.value.length>40,'student-http-only-cookie');
      absent(JSON.stringify(mountedCookies),rosterValues,'student-cookie-roster-leak');
      assertStudentStorage(await storage(page),authenticated.body,forbidden);
      await page.getByRole('button',{name:'Open player profile',exact:true}).click();
      await page.locator('.player-terminal-profile-page').waitFor({state:'visible'});
      const logout=page.locator('[data-player-action="logout"]:visible').first();await logout.waitFor();
      const logoutPromise=page.waitForResponse(response=>response.url()===`${PREFIX}/logout` && response.request().method()==='POST');void logoutPromise.catch(()=>{});
      await logout.click();const loggedOut=await logoutPromise;check(loggedOut.status()===200,'student-real-logout-200');assertStudentControlDto(await json(loggedOut),'logout');
      await page.waitForURL(/reason=logged-out/);
      assertAccountTransition(signed,await accountSnapshot(game,joinCode,row),'logout');
      check((await cookies()).length===0,'student-logout-cookie-cleared');
      assertStudentStorage(await storage(page),null,forbidden);
      const protectedRead=await get('/proxy/players/me');trackPayload(protectedRead.body);assertStudentControlDto(protectedRead.body,'missing-session');
      check(protectedRead.status===401 && protectedRead.body.error?.code==='player_session_missing','student-logout-protected-denied');
      // Replay only the genuinely issued, now revoked cookie. Never fabricate a
      // session or inject browser cookies. This proves server-side invalidation.
      const replay=await page.request.get(`${PREFIX}/status`,{headers:{origin:BASE,apikey:headers.apikey,
        'x-econovaria-device-id':headers['x-econovaria-device-id'],cookie:`${cookie.name}=${cookie.value}`},maxRedirects:0});
      const replayBody=await json(replay);assertStudentControlDto(replayBody,'revoked-session');check(replay.status()===401 && replayBody.error?.code==='player_session_invalid','student-revoked-cookie-rejected');
      assertStudentStorage(await storage(page),null,forbidden);
      const elapsedMs=performance.now()-started;check(elapsedMs<120_000,'student-auth-deadline');
      results.push({cohort:count,representatives:1,wrongCodeRejected:true,returnedCodeAuthenticated:true,
        exactGameAndStudent:true,canonical600000Verifier:true,serverRevoked:true,revokedCookieDenied:true,storageValidated:true,elapsedMs});
    };
    try {await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('student-auth-deadline')),120_000);})]);}
    catch {throw new Error('student-access-check-failed');}
    finally {clearTimeout(timer);await context.close();}
  }
  report.studentAccess={representativeAccounts:2,totalImportedInCohorts:70,allCredentialsAuthenticated:false,
    lifecycleVerified:true,authenticationOutsideImportDeadline:true,cohorts:results};
}
