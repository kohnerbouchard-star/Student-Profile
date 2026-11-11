import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { validateDatabaseUrl, validateSupabaseUrl, assertTeacherDto, assertNoUuid, sql, sqlLiteral, createFixture, forgetFixture, login } from './auth-fixture.mjs';

const source = await readFile(new URL('./auth-fixture.mjs', import.meta.url), 'utf8');
const repoFile = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('accepts only literal loopback hosts and the dedicated stack ports', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.ok(validateDatabaseUrl(`postgres://postgres:synthetic@${host}:54322/postgres`));
    assert.ok(validateDatabaseUrl(`postgresql://postgres@${host}:54322/postgres`));
    assert.equal(validateSupabaseUrl(`http://${host}:54321/`), `http://${host}:54321`);
  }
  for (const host of ['remote.test', '127.1', '2130706433', '0x7f000001', 'localhost.', 'LOCALHOST', '%6cocalhost', '[::ffff:127.0.0.1]']) {
    assert.throws(() => validateDatabaseUrl(`postgres://postgres@${host}:54322/postgres`), /Local fixture URL/);
    assert.throws(() => validateSupabaseUrl(`http://${host}:54321`), /Local fixture URL/);
  }
});

test('rejects remote redirection, path, protocol, credential and query variations', () => {
  for (const url of ['postgres://localhost:54323/postgres', 'postgres://localhost:54322/other', 'postgres://localhost:54322/postgres?host=remote', 'postgres://localhost:54322/postgres#fragment', 'http://localhost:54322/postgres', ' postgres://localhost:54322/postgres', 'postgres://local\nhost:54322/postgres']) assert.throws(() => validateDatabaseUrl(url));
  for (const url of ['https://localhost:54321', 'http://localhost:54322', 'http://localhost:54321/auth', 'http://user:pass@localhost:54321', 'http://localhost:54321?host=remote', 'http://localhost:54321#fragment']) assert.throws(() => validateSupabaseUrl(url));
});

test('browser DTO assertion rejects nested UUIDs without echoing the payload', () => {
  const value = { nested: [{ id: '12345678-1234-1234-1234-123456789abc' }], sensitive: 'synthetic-canary' };
  assert.throws(() => assertNoUuid(value), error => error.message === 'Browser DTO exposed an internal identifier.');
  assert.deepEqual(assertNoUuid({ id: 'game_public_123', session: { assuranceLevel: 'aal2' } }), { id: 'game_public_123', session: { assuranceLevel: 'aal2' } });
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
});

test('SQL travels only through stdin, uses bounded output and removes inherited connection settings', async t => {
  let captured;
  t.mock.method(childProcess, 'execFile', (command, args, options, callback) => {
    const stdin = new EventEmitter();
    stdin.end = input => { captured = { command, args, options, input }; callback(null, 'result\n'); };
    return { stdin };
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.equal(await sql('postgres://postgres:synthetic-password@127.0.0.1:54322/postgres', 'select 7;'), 'result');
  assert.equal(captured.command, 'psql');
  assert.deepEqual(captured.args, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
  assert.match(captured.input, /standard_conforming_strings = on;\nselect 7;/u);
  assert.equal(captured.options.maxBuffer, 262_144);
  assert.equal(captured.options.timeout, 30_000);
  assert.equal(captured.options.env.PGPASSWORD, 'synthetic-password');
  assert.equal(captured.options.env.PGHOST, '127.0.0.1');
  assert.equal(captured.options.env.PGOPTIONS, undefined);
});

test('subprocess errors discard raw stdout, stderr and underlying error details', async t => {
  t.mock.method(childProcess, 'execFile', (_command, _args, _options, callback) => {
    const stdin = new EventEmitter();
    stdin.end = () => callback(new Error('synthetic-secret-canary'), 'synthetic-secret-canary', 'synthetic-secret-canary');
    return { stdin };
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(sql('postgres://postgres@localhost:54322/postgres', 'select 1;'), error => error.message === 'Local fixture command failed.' && !error.stack.includes('canary'));
});

test('fixture requires MFA and synchronizes actual counters after permission removal', async t => {
  const originalDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://postgres@localhost:54322/postgres';
  const sqlInputs = [], authCalls = [];
  t.mock.method(childProcess, 'execFile', (command, _args, _options, callback) => {
    const stdin = new EventEmitter();
    stdin.end = input => {
      if (command === 'npx') callback(null, 'API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="synthetic-service-key"');
      else { sqlInputs.push(input); callback(null, input.includes('jsonb_build_object') ? '{"permission_version":29,"security_version":41}' : ''); }
    };
    return { stdin };
  });
  syncBuiltinESMExports();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    authCalls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: '12345678-1234-4234-8234-123456789abc' }) };
  });
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); if (originalDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabase; });
  const fixture = await createFixture({ email: 'fixture@example.test', permissionOverrides: { 'players.manage': false } });
  assert.ok(fixture.password.length >= 32);
  assert.match(sqlInputs[0], /role,mfa_required\)[\s\S]*'game_admin',true/u);
  assert.match(sqlInputs[1], /delete from public.staff_permission_grants[\s\S]*permission='players.manage'/u);
  assert.match(sqlInputs[2], /'permission_version',permission_version,'security_version',security_version/u);
  assert.deepEqual(authCalls[1].body.app_metadata, { econovaria_role: 'game_admin', permission_version: 29, security_version: 41 });
  assert.equal(authCalls[0].options.redirect, 'error');
  assert.equal(authCalls[0].body.password, fixture.password);
  forgetFixture(fixture);
});

test('permission override schema matches the canonical grant authority', async () => {
  const schema = await repoFile('backend/supabase/migrations/20260726095000_add_staff_permission_grants_v2.sql');
  const guard = await repoFile('backend/supabase/functions/admin-api/adminSecurityGuard.ts');
  assert.match(schema, /create table if not exists public.staff_permission_grants/u);
  assert.match(schema, /'players.manage'/u);
  assert.match(schema, /after insert or update or delete on public.staff_permission_grants/u);
  assert.match(guard, /\.from\("staff_permission_grants"\)/u);
  assert.match(guard, /staff_permission_denied/u);
});

test('rendered MFA selectors support enrollment and existing-factor verification', async () => {
  const frontend = await repoFile('frontend/src/core/admin-mfa.js');
  for (const selector of ['econovaria-mfa-secret', 'econovaria-mfa-setup-continue', 'econovaria-mfa-form', 'econovaria-mfa-code', 'econovaria-mfa-submit']) {
    assert.ok(frontend.includes(selector)); assert.ok(source.includes(selector));
  }
  assert.match(frontend, /enrollment \? "econovaria-mfa-form hidden" : "econovaria-mfa-form"/u);
  assert.match(source, /totpSecret \|\| mfaSecrets.get\(email\)/u);
  assert.match(source, /if \(!completeMfa\) return/u);
  assert.match(source, /signedIn.session\?\.assuranceLevel !== 'aal1'/u);
  assert.match(source, /status.session\?\.assuranceLevel !== 'aal2'/u);
});

test('game creation uses canonical rendered login, licensing, response and Admin V2 navigation', async () => {
  const canonical = await repoFile('scripts/admin-browser-reconnaissance.mjs');
  for (const selector of ['#adminForm', '#adminEmail', '#adminAccessCode', '#adminNewLicenseCode', '#adminNewGameName', '#adminNewGameTimeZone', '#adminNewGameDifficulty', '#adminCreateGameForm', '#adminGameList .game-row']) {
    assert.ok(source.includes(selector)); assert.ok(canonical.includes(selector));
  }
  assert.match(source, /route\(response, 'proxy\/games', 'POST'\)/u);
  assert.match(source, /alreadyAuthenticated/u);
  assert.match(source, /document.getElementById\('adminPreview'\)/u);
  assert.match(source, /statusUrls.set\(page, statusUrl.href\)/u);
  assert.match(source, /page.request.get\(url, \{ headers: statusHeaders.get\(page\) \}\)/u);
});

test('no logging, filesystem artifacts, traces, token fabrication or cascading deletion', () => {
  assert.doesNotMatch(source, /console\.|process\.(?:stdout|stderr)|writeFile|appendFile|screenshot\(|tracing\.|recordVideo|recordHar/u);
  assert.doesNotMatch(source, /delete from public.staff_users|signJwt|createJWT|access_token:/u);
  assert.match(source, /function observe\(promise\) \{ promise.catch\(\(\) => \{\}\); return promise; \}/u);
  assert.equal((source.match(/= observe\(page.waitForResponse/g) || []).length, 4);
});

test('rendered login sanitizes browser failures and immediately observes pending response rejection', async () => {
  const page = {
    goto: async () => {},
    locator: () => ({ waitFor: async () => {}, fill: async () => {}, click: async () => { throw new Error('synthetic-browser-secret'); } }),
    waitForResponse: () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('synthetic-response-secret')), 5)),
  };
  await assert.rejects(login(page, { email: 'fixture@example.test', password: 'synthetic-password' }), error => error.message === 'Local rendered staff login failed.' && !error.stack.includes('synthetic-browser-secret'));
  await new Promise(resolve => setTimeout(resolve, 15));
});

 test('status requests forward only observed browser publishable and device headers', async () => {
  const gateway = await repoFile('scripts/local-staging-gateway.py');
  assert.match(gateway, /self.headers.get\("apikey"\)/u);
  assert.match(source, /const loginHeaders = await response.request\(\).allHeaders\(\)/u);
  assert.match(source, /for \(const name of \['apikey', 'x-econovaria-device-id'\]\)/u);
  assert.match(source, /statusHeaders.set\(page, publicHeaders\)/u);
  assert.doesNotMatch(source, /page.request.get\(url\)/u);
  assert.doesNotMatch(source, /publicHeaders\.(?:Authorization|authorization)|statusHeaders.set\(page, loginHeaders/u);
});

const teacherId = '12345678-1234-4234-8234-123456789abc';
const gameId = '22345678-1234-4234-8234-123456789abc';
function teacherDto(endpoint = 'status') {
  const game = { id: gameId, name: 'Synthetic game', status: 'active', joinCode: 'SYNTHETIC', gameCode: 'SYNTHETIC', joinCodeStatus: 'active', createdAt: '2026-11-11T00:00:00Z', updatedAt: '2026-11-11T00:00:00Z' };
  if (endpoint === 'create-game') return { ok: true, data: { game: { ...game, gameId, lifecycleState: 'active', provisioningStatus: 'ready' }, joinCode: game.joinCode, joinCodeStatus: game.joinCodeStatus } };
  return { ok: true, ...(endpoint === 'mfa-verify' ? { verified: true } : {}),
    session: { authenticated: true, expiresAt: '2026-11-11T01:00:00Z', absoluteExpiresAt: '2026-11-11T02:00:00Z', assuranceLevel: endpoint === 'login' ? 'aal1' : 'aal2', mfaRequired: true },
    user: { id: teacherId, email: 'fixture@example.test', displayName: 'Synthetic Teacher', role: 'game_admin', permissionVersion: 7, securityVersion: 9 },
    activeGameSessions: [game], csrfToken: 'synthetic-csrf-token',
  };
}
function invalidTeacher(payload, endpoint) {
  assert.throws(() => assertTeacherDto(payload, endpoint), error => error.message === 'Local teacher response contract is invalid.' && !error.stack.includes(teacherId) && !error.stack.includes(gameId) && !error.stack.includes('secret-canary'));
}

test('exact teacher endpoint DTOs accept only documented UUID identity slots', () => {
  for (const endpoint of ['login', 'status', 'mfa-verify', 'create-game']) {
    const payload = teacherDto(endpoint);
    assert.equal(assertTeacherDto(payload, endpoint), payload);
    assert.throws(() => assertNoUuid(payload), /Browser DTO exposed an internal identifier/u);
  }
  const noGames = teacherDto('login'); noGames.activeGameSessions = []; noGames.user.email = null;
  assert.equal(assertTeacherDto(noGames, 'login'), noGames);
  const nullCodes = teacherDto(); nullCodes.activeGameSessions[0].joinCode = null; nullCodes.activeGameSessions[0].gameCode = null;
  assert.equal(assertTeacherDto(nullCodes, 'status'), nullCodes);
  const created = teacherDto('create-game'); created.data.game.createdAt = null; created.data.game.updatedAt = null;
  assert.equal(assertTeacherDto(created, 'create-game'), created);
});

test('teacher DTO validator rejects every undocumented property at every object boundary', () => {
  for (const endpoint of ['login', 'status', 'mfa-verify', 'create-game']) {
    const paths = endpoint === 'create-game' ? [[], ['data'], ['data', 'game']] : [[], ['session'], ['user'], ['activeGameSessions', 0]];
    for (const path of paths) {
      for (const field of ['privateId', 'supabaseAuthUserId', 'accessToken', 'refreshToken', 'password', 'totpSecret', 'credentialVerifier', 'salt', 'unknown']) {
        for (const value of [teacherId, 'secret-canary', { id: teacherId }]) {
          const payload = teacherDto(endpoint);
          const target = path.reduce((value, key) => value[key], payload);
          target[field] = value;
          invalidTeacher(payload, endpoint);
        }
      }
    }
  }
});

test('UUID exception cannot escape identity fields through strings or nested values', () => {
  for (const endpoint of ['login', 'status', 'mfa-verify', 'create-game']) {
    const original = teacherDto(endpoint);
    const walk = (value, path = []) => {
      for (const [key, field] of Object.entries(value)) {
        const next = [...path, key];
        if (field && typeof field === 'object') { walk(field, next); continue; }
        // All existing identity slots are tested separately below.
        if (key === 'id' || key === 'gameId') continue;
        for (const replacement of [teacherId, `prefix-${teacherId}-suffix`, { id: teacherId }, [teacherId]]) {
          const payload = structuredClone(original);
          next.slice(0, -1).reduce((value, key) => value[key], payload)[key] = replacement;
          invalidTeacher(payload, endpoint);
        }
      }
    };
    walk(original);
  }
});

test('identity values cannot contain credentials, arbitrary objects, arrays or partial UUIDs', () => {
  for (const endpoint of ['login', 'status', 'mfa-verify', 'create-game']) {
    const paths = endpoint === 'create-game' ? [['data', 'game', 'id'], ['data', 'game', 'gameId']] : [['user', 'id'], ['activeGameSessions', 0, 'id']];
    for (const path of paths) for (const value of ['', `prefix-${teacherId}`, `${teacherId}-secret-canary`, null, 7, { id: teacherId }, [teacherId]]) {
      const payload = teacherDto(endpoint);
      path.slice(0, -1).reduce((value, key) => value[key], payload)[path.at(-1)] = value;
      invalidTeacher(payload, endpoint);
    }
  }
});

test('teacher contracts reject missing fields, wrong endpoint envelopes and malformed scalar types', () => {
  for (const endpoint of ['login', 'status', 'mfa-verify', 'create-game']) {
    const original = teacherDto(endpoint);
    const walk = (value, path = []) => {
      for (const key of Object.keys(value)) {
        const payload = structuredClone(original), target = path.reduce((value, key) => value[key], payload);
        delete target[key]; invalidTeacher(payload, endpoint);
        if (value[key] && !Array.isArray(value[key]) && typeof value[key] === 'object') walk(value[key], [...path, key]);
      }
    };
    walk(original);
    for (const value of [null, [], false, '', { ...original, unexpected: 'secret-canary' }]) invalidTeacher(value, endpoint);
  }
  for (const endpoint of ['student-status', 'roster', '', undefined, 'status/extra']) invalidTeacher(teacherDto(), endpoint);
  invalidTeacher(teacherDto('mfa-verify'), 'status');
  invalidTeacher(teacherDto('status'), 'mfa-verify');
  invalidTeacher(teacherDto('create-game'), 'login');
  for (const value of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    const payload = teacherDto(); payload.user.permissionVersion = value; invalidTeacher(payload, 'status');
  }
  const oversized = teacherDto(); oversized.user.displayName = 'x'.repeat(4097); invalidTeacher(oversized, 'status');
  const badMfa = teacherDto('mfa-verify'); badMfa.session.assuranceLevel = 'aal1'; invalidTeacher(badMfa, 'mfa-verify');
  const disagree = teacherDto('create-game'); disagree.data.game.gameId = teacherId; invalidTeacher(disagree, 'create-game');
});

test('teacher schema is bound to the pinned production projections, not a general UUID allowlist', async () => {
  const bff = await repoFile('backend/supabase/functions/web-session-api/index.ts');
  const bootstrap = await repoFile('backend/src/domains/auth/api/staffBootstrapHttpHandler.ts');
  const provision = await repoFile('backend/supabase/functions/admin-api/gameProvisioningOperations.ts');
  const session = bff.slice(bff.indexOf('function publicSession('), bff.indexOf('function parseAccessExpiry('));
  assert.match(session, /authenticated: true,[\s\S]*expiresAt:[\s\S]*absoluteExpiresAt:[\s\S]*assuranceLevel,[\s\S]*mfaRequired,/u);
  assert.match(bff, /id: login.user.id,[\s\S]*email: login.user.email,[\s\S]*displayName: login.user.displayName,[\s\S]*role: "game_admin",[\s\S]*permissionVersion: login.user.permissionVersion,[\s\S]*securityVersion: login.user.securityVersion,/u);
  assert.match(bff, /verified: true,[\s\S]*session: publicSession\(elevated, "aal2", true\)/u);
  assert.match(bff, /\.\.\.resolved.payload.user,[\s\S]*displayName: bootstrap.body.staff.displayName/u);
  assert.match(bootstrap, /id: session.id,[\s\S]*name: session.name,[\s\S]*status: session.status,[\s\S]*joinCode: session.game_join_code,[\s\S]*gameCode: session.game_join_code,[\s\S]*joinCodeStatus: session.game_join_code_status,[\s\S]*createdAt: session.created_at,[\s\S]*updatedAt: session.updated_at/u);
  for (const field of ['id', 'gameId', 'name', 'status', 'lifecycleState', 'provisioningStatus', 'joinCodeStatus', 'joinCode', 'gameCode', 'createdAt', 'updatedAt']) assert.match(provision, new RegExp(`\\b${field}[:,]`));
  assert.match(source, /browserJson\(response, 'login'\)/u);
  assert.match(source, /browserJson\(await verifiedPromise, 'mfa-verify'\)/u);
  assert.match(source, /browserJson\(createdResponse, 'create-game'\)/u);
  assert.match(source, /browserJson\(statusResponse, 'status'\)/u);
  assert.match(source, /return assertTeacherDto\(await response.json\(\), endpoint\)/u);
  // Roster/student remain on strict UUID rejection, including seemingly familiar keys.
  for (const payload of [{ user: { id: teacherId } }, { students: [{ playerIdentifier: teacherId }] }, { game: { id: gameId } }]) assert.throws(() => assertNoUuid(payload));
});

test('source projection field sets stay exactly aligned with teacher fixture schemas', async () => {
  const bff = await repoFile('backend/supabase/functions/web-session-api/index.ts');
  const bootstrap = await repoFile('backend/src/domains/auth/api/staffBootstrapHttpHandler.ts');
  const provision = await repoFile('backend/supabase/functions/admin-api/gameProvisioningOperations.ts');
  const keys = (sourceText, start, end, indent) => {
    const offset = sourceText.indexOf(start); assert.ok(offset >= 0);
    const stop = sourceText.indexOf(end, offset + start.length); assert.ok(stop > offset);
    return [...sourceText.slice(offset + start.length, stop).matchAll(new RegExp(`^ {${indent}}([a-zA-Z][a-zA-Z0-9]*)(?::|,)`, 'gm'))].map(match => match[1]).sort();
  };
  assert.deepEqual(keys(bff, 'function publicSession(', 'function parseAccessExpiry(', 4), ['absoluteExpiresAt', 'assuranceLevel', 'authenticated', 'expiresAt', 'mfaRequired']);
  assert.deepEqual(keys(bff, 'displayName: login.user.displayName,', '    activeGameSessions:', 6), ['permissionVersion', 'role', 'securityVersion']);
  assert.deepEqual(keys(bootstrap, 'activeGameSessions: ((sessionsResponse.data', '      })),', 8), ['createdAt', 'gameCode', 'id', 'joinCode', 'joinCodeStatus', 'name', 'status', 'updatedAt']);
  assert.deepEqual(keys(provision, '        game: {', '        },', 10), ['createdAt', 'gameCode', 'gameId', 'id', 'joinCode', 'joinCodeStatus', 'lifecycleState', 'name', 'provisioningStatus', 'status', 'updatedAt']);
});
