import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { createFixture, createOwnedGame, login, browserSessionStatus, runSql, sqlLiteral, forgetFixture } from './auth-fixture.mjs';
import { check, equal, absent, publicReceipt, underDeadline } from './evidence.mjs';
import { snapshot, assertDelta, assertPersistedPrivacy } from './database.mjs';
import { verifyStudentAccess } from './student-access.mjs';

const BASE = 'http://127.0.0.1:4173';
const endpoint = game => `${BASE}/functions/v1/web-session-api/proxy/games/${encodeURIComponent(game)}/players/imports/csv`;
const namesFor = (count, prefix = '') => Array.from({length:count}, (_, i) =>
  prefix ? `Synthetic ${prefix} ${i + 1}` : ['Synthetic Repeated','Synthetic Repeated','Synthetic Jose\u0301','Synthetic 민준','Synthetic 李'][i % 5]);
const normalized = names => names.map(name => name.normalize('NFC'));
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject) => {timer = setTimeout(() => reject(new Error('late-response-deadline')),30_000);})]); }
  finally {clearTimeout(timer);}
};
const identifiers = receipt => receipt.students.map(row => row.playerIdentifier);
const codes = receipt => receipt.students.flatMap(row => row.accessCode ? [row.accessCode] : []);

export async function runBrowser(report, checkServerLogs, onBrowser = () => {}, beforeImports = async () => {}) {
  const browser = await chromium.launch({headless:true});
  onBrowser(browser);
  const contexts = [], fixtures = [], privateValues = [], authSecrets = [], rosterValues = [], accessCodes = [], allNames = [], allIdentifiers = [], logs = [];
  const publicHeaders = new WeakMap();
  let logBytes = 0, logOverflow = false;
  const pageFor = async () => {
    const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:'reduce', serviceWorkers:'block'});
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on('request', request => {
      if (!request.url().startsWith(`${BASE}/functions/v1/`)) return;
      const headers = request.headers();
      if (headers.apikey && headers['x-econovaria-device-id']) publicHeaders.set(page, {
        apikey:headers.apikey, device:headers['x-econovaria-device-id'],
      });
    });
    page.on('console', message => { logBytes += message.text().length; if (logBytes < 2_000_000) logs.push(message.text()); else logOverflow = true; });
    page.on('pageerror', error => { logBytes += String(error).length; if (logBytes < 2_000_000) logs.push(String(error)); else logOverflow = true; });
    page.on('dialog', dialog => void dialog.accept());
    return page;
  };
  const fixtureFor = async (email, permissionOverrides) => {
    const fixture = await createFixture({email,permissionOverrides}); fixtures.push(fixture); privateValues.push(fixture.password); return fixture;
  };
  const license = async code => runSql(`insert into public.purchase_codes(code_hash,status,max_redemptions,redeemed_count)
    values(encode(extensions.digest(${sqlLiteral(code)},'sha256'),'hex'),'active',1,0);`);
  const rememberReceipt = receipt => {
    const ids = identifiers(receipt), secrets = codes(receipt), names = receipt.students.map(row => row.displayName);
    allNames.push(...names); allIdentifiers.push(...ids); accessCodes.push(...secrets);
    privateValues.push(...secrets); rosterValues.push(...names,...ids,...secrets);
  };
  const privacy = async () => {
    check(!logOverflow, 'browser-log-overflow');
    absent(logs.join('\n'), [...rosterValues,...privateValues], 'browser-log-leak');
    for (const context of contexts) {
      for (const page of context.pages()) {
        if (!page.url().startsWith(BASE)) continue;
        const storage = await page.evaluate(async () => ({
          local:{...localStorage},session:{...sessionStorage},
          indexedDb:(await indexedDB.databases()).length,caches:(await caches.keys()).length,
        }));
        absent(JSON.stringify(storage), [...rosterValues,...authSecrets], 'browser-storage-roster-leak');
        absent(JSON.stringify(await context.cookies()), [...rosterValues,...authSecrets], 'browser-cookie-leak');
        check(storage.indexedDb === 0 && storage.caches === 0, 'browser-persistent-store');
      }
    }
    await checkServerLogs([...rosterValues,...privateValues]);
  };
  try {
    report.stage = 'real-auth-and-game';
    const teacher = await fixtureFor('roster.local@example.test');
    const page = await pageFor();
    const gameName = 'Synthetic Connected Roster';
    await license('ROSTER-SYNTHETIC-PRIMARY');
    const game = await createOwnedGame(page, {...teacher,gameName,licenseCode:'ROSTER-SYNTHETIC-PRIMARY'});
    privateValues.push(...game.secrets); authSecrets.push(...game.authSecrets);
    check(game.status.session?.assuranceLevel === 'aal2', 'real-aal2');
    check(await runSql(`select exists(select 1 from public.staff_permission_grants g join public.staff_users s on s.id=g.staff_user_id where s.email='roster.local@example.test' and s.mfa_required=true and g.permission='players.manage');`) === 't', 'real-players-manage');
    await license('ROSTER-SYNTHETIC-OTHER');
    const otherName = 'Synthetic Other Owned Roster';
    const other = await createOwnedGame(page,{...teacher,gameName:otherName,licenseCode:'ROSTER-SYNTHETIC-OTHER',alreadyAuthenticated:true});
    privateValues.push(...other.secrets); authSecrets.push(...other.authSecrets);
    const foreignTeacher = await fixtureFor('roster.foreign@example.test');
    const foreignPage = await pageFor();
    await license('ROSTER-SYNTHETIC-FOREIGN');
    const foreignName = 'Synthetic Foreign Roster';
    const foreign = await createOwnedGame(foreignPage,{...foreignTeacher,gameName:foreignName,licenseCode:'ROSTER-SYNTHETIC-FOREIGN'});
    privateValues.push(...foreign.secrets); authSecrets.push(...foreign.authSecrets);
    await beforeImports();
    await page.goto(`${BASE}/admin/v2.html?game=${encodeURIComponent(game.gameId)}#players`);
    const opener = page.getByRole('button',{name:'Import roster CSV',exact:true});
    await opener.waitFor();

    let calls = [], fault = '', faultError;
    const responseQueue = [];
    await page.route(endpoint(game.gameId), async route => {
      try {
        const request = route.request(), headers = await request.allHeaders();
        calls.push({key:headers['idempotency-key'],headers,body:request.postDataJSON()});
        const response = await route.fetch({timeout:30_000,maxRetries:0,maxRedirects:0});
        const payload = await response.json();
        responseQueue.push({status:response.status(),payload});
        if (fault === 'lost') {
          check(response.status() === 201, 'fault-real-server-success');
          const receipt = publicReceipt(payload,calls.at(-1).body.studentNames,false);
          rememberReceipt(receipt);
          // Prove the real transaction completed before discarding/delaying delivery.
          const committed = await snapshot(gameName);
          check(committed.receiptBodies.some(body => JSON.stringify(body.students.map(({row,displayName,playerIdentifier}) => ({row,displayName,playerIdentifier}))) === JSON.stringify(receipt.students.map(({row,displayName,playerIdentifier}) => ({row,displayName,playerIdentifier})))), 'fault-committed-before-drop');
          fault = ''; await route.abort('failed'); return;
        }
        await route.fulfill({response});
      } catch { faultError = true; await route.abort('failed').catch(() => {}); }
    });
    const preview = async (inputNames, header) => {
      rosterValues.push(...inputNames); // Include original NFD spellings as well as normalized receipts.
      const beforeCalls = calls.length;
      await opener.click();
      const dialog = page.getByRole('dialog',{name:'Import roster CSV'});
      await dialog.getByLabel('Roster CSV file').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(`${header ? 'Student name\n' : ''}${inputNames.join('\n')}`)});
      if (!header) await dialog.getByLabel('CSV heading').selectOption('absent');
      await dialog.getByText(new RegExp(`${inputNames.length} student rows passed local format checks`)).waitFor();
      check(await dialog.getByRole('button',{name:'Create students',exact:true}).isDisabled(), 'explicit-confirmation-required');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      check(calls.length === beforeCalls, 'preview-no-import');
      await dialog.getByRole('checkbox').check();
      return dialog;
    };
    const readRendered = async (dialog, names, replayed, started) => {
      await dialog.getByText(new RegExp(replayed ? `This import already created ${names.length} students` : `${names.length} students created`)).waitFor();
      check(!faultError, 'real-request-forward');
      const response = responseQueue.at(-1);
      check(response.status === 201, 'real-import-201');
      const receipt = publicReceipt(response.payload,names,replayed);
      equal(calls.at(-1).body,{studentNames:names},'names-only-request');
      check(/^admin\.players\.roster\.[0-9a-f-]{36}$/i.test(calls.at(-1).key), 'controller-generated-key');
      const rows = await dialog.locator('tbody tr').allTextContents();
      check(rows.length === names.length, 'rendered-row-count');
      for (const [index,row] of receipt.students.entries()) {
        check(rows[index].includes(row.displayName) && rows[index].includes(row.playerIdentifier) && (replayed || rows[index].includes(row.accessCode)), 'ordered-rendered-receipt');
      }
      if (replayed) absent(await dialog.innerText(), accessCodes, 'replay-no-codes');
      else rememberReceipt(receipt);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const elapsedMs = underDeadline(started);
      return {receipt,elapsedMs,key:calls.at(-1).key};
    };
    const close = async dialog => {
      await dialog.getByRole('button',{name:'Close',exact:true}).click();
      await dialog.waitFor({state:'detached'});
      absent(await page.locator('body').innerText(),accessCodes,'close-removes-codes');
      await page.locator('.admin-players-route[data-admin-v2-state="ready"]').waitFor();
    };
    report.stage = 'fresh-30-and-replay';
    const raw30 = namesFor(30), names30 = normalized(raw30);
    let before = await snapshot(gameName), dialog = await preview(raw30,true), started = performance.now();
    await dialog.getByRole('button',{name:'Create students',exact:true}).click();
    const thirty = await readRendered(dialog,names30,false,started);
    let after = await snapshot(gameName); assertDelta(before,after,30);
    await close(dialog);
    before = after; dialog = await preview(raw30,true); started = performance.now();
    await dialog.getByRole('button',{name:'Create students',exact:true}).click();
    const replay = await readRendered(dialog,names30,true,started);
    equal(replay.key,thirty.key,'same-controller-key'); equal(identifiers(replay.receipt),identifiers(thirty.receipt),'same-replay-identifiers');
    equal(await snapshot(gameName),before,'replay-zero-writes'); await close(dialog);
    report.timings = {fresh30Ms:thirty.elapsedMs,replay30Ms:replay.elapsedMs};

    report.stage = 'fresh-40-and-navigation';
    const raw40 = namesFor(40), names40 = normalized(raw40);
    before = await snapshot(gameName); dialog = await preview(raw40,false); started = performance.now();
    await dialog.getByRole('button',{name:'Create students',exact:true}).click();
    const forty = await readRendered(dialog,names40,false,started);
    after = await snapshot(gameName); assertDelta(before,after,40);
    check(!identifiers(forty.receipt).some(id => identifiers(thirty.receipt).includes(id)), 'repeat-names-new-students');
    report.timings.fresh40Ms = forty.elapsedMs;
    await page.evaluate(() => {location.hash = 'overview';}); await dialog.waitFor({state:'detached'});
    absent(await page.locator('body').innerText(),accessCodes,'navigation-removes-codes');
    await page.evaluate(() => {location.hash = 'players';}); await opener.waitFor();

    report.stage = 'committed-response-loss';
    const lostNames = namesFor(40,'Lost'); before = await snapshot(gameName);
    dialog = await preview(lostNames,false); fault = 'lost';
    const callIndex = calls.length; started = performance.now();
    await dialog.getByRole('button',{name:'Create students',exact:true}).click();
    await dialog.getByText(/The import result could not be confirmed/).waitFor();
    check(!faultError,'lost-real-commit'); underDeadline(started);
    after = await snapshot(gameName); assertDelta(before,after,40);
    const lostReceipt = publicReceipt(responseQueue.at(-1).payload,lostNames,false);
    check(calls.length === callIndex + 1,'no-automatic-retry');
    started = performance.now(); await dialog.getByRole('button',{name:'Retry same import'}).click();
    const retry = await readRendered(dialog,lostNames,true,started);
    equal(calls[callIndex].key,retry.key,'lost-response-stable-key');
    equal(identifiers(lostReceipt),identifiers(retry.receipt),'lost-response-same-students');
    equal(await snapshot(gameName),after,'lost-retry-zero-writes');
    report.timings.lostReplay40Ms = retry.elapsedMs; await close(dialog);

    report.stage = 'security-negatives';
    // Unroute only our observation/fault injector; all negatives still reach the real BFF/Edge.
    await page.unroute(endpoint(game.gameId));
    const rawPost = async (targetPage,targetGame,names,key,csrf) => {
      const headers = publicHeaders.get(targetPage);
      check(headers?.apikey?.startsWith('sb_publishable_') && Boolean(headers.device), 'target-page-public-headers');
      return targetPage.evaluate(async input => {
      const response = await fetch(input.url,{method:'POST',credentials:'include',cache:'no-store',headers:{
        apikey:input.apikey,'content-type':'application/json','idempotency-key':input.key,
        'x-econovaria-game-id':input.game,'x-econovaria-csrf-token':input.csrf,
        ...(input.device ? {'x-econovaria-device-id':input.device} : {}),
      },body:JSON.stringify({studentNames:input.names})});
      const body = await response.json(); return {status:response.status,code:body.code || body.error?.code};
    },{url:endpoint(targetGame),game:targetGame,names,key,csrf,apikey:headers.apikey,device:headers.device});
    };
    const unchanged = async operation => {
      const prior = await Promise.all([gameName,otherName,foreignName].map(snapshot));
      const result = await operation();
      equal(await Promise.all([gameName,otherName,foreignName].map(snapshot)),prior,'negative-zero-writes'); return result;
    };
    const status = await browserSessionStatus(page);
    const changed = await unchanged(() => rawPost(page,game.gameId,['Synthetic Changed'],thirty.key,status.csrfToken));
    check(changed.status === 409 && changed.code === 'idempotency_key_conflict','changed-names-conflict');
    const otherConflict = await unchanged(() => rawPost(page,other.gameId,names30,thirty.key,status.csrfToken));
    check(otherConflict.status === 409 && otherConflict.code === 'idempotency_key_conflict','other-owned-game-conflict');
    const foreignDenied = await unchanged(() => rawPost(page,foreign.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,status.csrfToken));
    check([403,404].includes(foreignDenied.status) && /game|ownership|forbidden/.test(foreignDenied.code),'foreign-game-denied');
    const badCsrf = await unchanged(() => rawPost(page,game.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,'0'.repeat(43)));
    equal(badCsrf,{status:403,code:'csrf_validation_failed'},'bad-csrf-denied');
    const anonymous = await pageFor();
    const anonymousProbe = anonymous.waitForRequest(request => request.url().endsWith('/functions/v1/web-session-api/status'));
    void anonymousProbe.catch(() => {});
    await anonymous.goto(`${BASE}/?mode=admin`); await anonymousProbe;
    const missing = await unchanged(() => rawPost(anonymous,game.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,status.csrfToken));
    check(missing.status === 401 && /session/.test(missing.code),'missing-session-denied');
    const aalFixture = await fixtureFor('roster.aal1@example.test'), aalPage = await pageFor();
    const aal1 = await login(aalPage,{...aalFixture,completeMfa:false}); privateValues.push(...aal1.secrets); authSecrets.push(...aal1.authSecrets);
    check(aal1.status.session?.assuranceLevel === 'aal1','genuine-aal1');
    const lowAssurance = await unchanged(() => rawPost(aalPage,game.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,aal1.status.csrfToken));
    equal(lowAssurance,{status:403,code:'staff_mfa_required'},'aal1-denied');
    const deniedFixture = await fixtureFor('roster.permission@example.test',{'players.manage':false}), deniedPage = await pageFor();
    const noPermission = await login(deniedPage,deniedFixture); privateValues.push(...noPermission.secrets); authSecrets.push(...noPermission.authSecrets);
    const denied = await unchanged(() => rawPost(deniedPage,game.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,noPermission.status.csrfToken));
    equal(denied,{status:403,code:'staff_permission_denied'},'fresh-permission-denied');
    report.security = {missingSession:true,badCsrf:true,genuineAal1:true,freshMissingPermission:true,foreignGame:true,changedNamesConflict:true,otherOwnedGameConflict:true};

    // A separate real request is held only after its successful committed response.
    report.stage = 'late-response-and-logout';
    let release, committedResolve, deliveredResolve;
    const committedPromise = new Promise(resolve => {committedResolve = resolve;});
    const deliveredPromise = new Promise(resolve => {deliveredResolve = resolve;});
    let lateError = false;
    const lateNames = namesFor(2,'Late'); before = await snapshot(gameName);
    await page.route(endpoint(game.gameId), async route => {
      try {
        const response = await route.fetch({timeout:30_000,maxRetries:0,maxRedirects:0});
        check(response.status() === 201,'late-real-201');
        const receipt = publicReceipt(await response.json(),lateNames,false); rememberReceipt(receipt);
        assertDelta(before,await snapshot(gameName),2);
        const hold = new Promise(resolve => {release = resolve;}); committedResolve(); await bounded(hold);
        await route.fulfill({response}).catch(() => {});
      } catch {lateError = true; committedResolve(); await route.abort('failed').catch(() => {});}
      finally {deliveredResolve();}
    });
    dialog = await preview(lateNames,false); // No observer is needed to inspect this request's credentials.
    await dialog.getByRole('button',{name:'Create students',exact:true}).click(); await bounded(committedPromise);
    check(!lateError,'late-response-committed');
    await page.keyboard.press('Escape'); check(await dialog.isVisible(),'busy-close-protected');
    await page.evaluate(() => {location.hash = 'overview';}); await dialog.waitFor({state:'detached'});
    release(); await bounded(deliveredPromise);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    absent(await page.locator('body').innerText(),accessCodes,'late-response-cannot-repopulate');
    await page.unroute(endpoint(game.gameId));
    await page.evaluate(() => {location.hash = 'players';}); await opener.waitFor();
    const beforeLogout = await snapshot(gameName);
    dialog = await preview(namesFor(2,'Logout'),false);
    const logoutResponsePromise = page.waitForResponse(response => response.url() === endpoint(game.gameId) && response.request().method() === 'POST');
    void logoutResponsePromise.catch(() => {});
    started = performance.now();
    await dialog.getByRole('button',{name:'Create students',exact:true}).click();
    const logoutResponse = await logoutResponsePromise;
    check(logoutResponse.status() === 201,'logout-fresh-201');
    const logoutReceipt = publicReceipt(await logoutResponse.json(),namesFor(2,'Logout'),false); rememberReceipt(logoutReceipt);
    await dialog.getByText(/2 students created/).waitFor();
    for (const value of codes(logoutReceipt)) check((await dialog.innerText()).includes(value),'logout-codes-visible-before');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    underDeadline(started);
    assertDelta(beforeLogout,await snapshot(gameName),2);
    // Invoke the existing shell Sign out action while a receipt is mounted. Its
    // confirmation and real session revocation run; no auth/session stub is used.
    await page.locator('.admin-shell-account-actions button').filter({hasText:'Sign out'}).evaluate(button => button.click());
    await page.waitForURL(/reason=signed-out/);
    absent(await page.locator('body').innerText(),accessCodes,'logout-removes-codes');
    check(await page.evaluate(() => sessionStorage.getItem('econovaria.admin.auth.v1')) === null,'logout-clears-session');
    const revoked = await rawPost(page,game.gameId,['Synthetic Denied'],`roster-negative-${randomUUID()}`,status.csrfToken);
    check(revoked.status === 401,'logout-session-revoked');
    const final = await snapshot(gameName);
    assertPersistedPrivacy(final,accessCodes,allNames,allIdentifiers);
    await privacy();
    // Authentication has legitimate session/throttle writes. Keep it after all
    // original import/replay/negative/logout snapshots and outside their timing.
    await verifyStudentAccess({game,gameName,cohorts:[{count:30,row:thirty.receipt.students[0]},
      {count:40,row:forty.receipt.students[1]}],pageFor,privateValues,rosterValues,report});
    await privacy(); // Student contexts were validated before logout and closed.
    report.counts = {players:final.players,countries:final.countries,activeCredentials:final.credentials,completedReceipts:final.completed,audits:final.audits};
    report.lifecycle = {close:true,navigation:true,lateResponse:true,logout:true};
    report.privacy = {browserStorage:true,browserLogs:true,serverLogs:true,persistedReceipts:true,aggregateAudit:true,publicDto:true};
    report.runtime = {node:process.versions.node,chromium:browser.version()};
    return {privateValues:[...privateValues,...rosterValues]};
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close();
    for (const fixture of fixtures) forgetFixture(fixture);
  }
}
