// Disposable local-only staff fixtures. Never persist browser traces or these return values.
import { execFile } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const owned = new WeakSet();
const secrets = new Map();
const mfaSecrets = new Map();
const statusUrls = new WeakMap();
const statusHeaders = new WeakMap();
const fail = (message) => { throw new Error(message); };

function localUrl(value, protocols, port, database = false) {
  let url;
  if (typeof value !== 'string' || value !== value.trim() || /[\\\r\n\t]/u.test(value)) fail('Local fixture URL is invalid.');
  const authority = value.match(/^[a-z]+:\/\/([^/?#]+)/iu)?.[1]?.split('@').at(-1);
  if (!authority || !new RegExp(`^(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):${port}$`, 'u').test(authority)) fail('Local fixture URL is not permitted.');
  try { url = new URL(value); } catch { fail('Local fixture URL is invalid.'); }
  if (!protocols.includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.port !== String(port) || url.search || url.hash ||
      (database ? url.pathname !== '/postgres' : !['', '/'].includes(url.pathname)) ||
      (!database && (url.username || url.password))) fail('Local fixture URL is not permitted.');
  return url;
}
export function validateDatabaseUrl(value) {
  return localUrl(value, ['postgres:', 'postgresql:'], 54322, true).href;
}
export function validateSupabaseUrl(value) {
  return localUrl(value, ['http:'], 54321).origin;
}
export function assertNoUuid(value) {
  if (UUID.test(JSON.stringify(value))) fail('Browser DTO exposed an internal identifier.');
  return value;
}

// Teacher-only contracts: web-session-api publicSession/handleLogin/handleStatus/
// handleMfaProxy, staffBootstrapHttpHandler, and gameProvisioningOperations.
// Never reuse this identity exception for roster or student response contracts.
export function assertTeacherDto(payload, endpoint) {
  try {
    const text = value => typeof value === 'string' && value.length <= 4096 && !UUID.test(value);
    const nullableText = value => value === null || text(value);
    const identity = value => typeof value === 'string' && new RegExp(`^${UUID.source}$`, 'iu').test(value);
    const positive = value => Number.isSafeInteger(value) && value > 0;
    const yes = value => value === true;
    const boolean = value => typeof value === 'boolean';
    const object = (value, fields) => {
      if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
          Object.keys(value).length !== Object.keys(fields).length) throw new Error();
      for (const [key, validate] of Object.entries(fields)) {
        if (!Object.hasOwn(value, key) || !validate(value[key])) throw new Error();
      }
      return true;
    };
    const gameFields = { id: identity, name: text, status: text, joinCode: nullableText,
      gameCode: nullableText, joinCodeStatus: text, createdAt: text, updatedAt: text };
    if (endpoint === 'create-game') {
      object(payload, { ok: yes, data: value => object(value, {
        game: game => object(game, { ...gameFields, gameId: identity, lifecycleState: text,
          provisioningStatus: value => value === 'ready', createdAt: nullableText, updatedAt: nullableText }),
        joinCode: text, joinCodeStatus: text,
      }) });
      if (payload.data.game.id !== payload.data.game.gameId ||
          payload.data.joinCode !== payload.data.game.joinCode ||
          payload.data.joinCode !== payload.data.game.gameCode ||
          payload.data.joinCodeStatus !== payload.data.game.joinCodeStatus) throw new Error();
    } else {
      if (!['login', 'status', 'mfa-verify'].includes(endpoint)) throw new Error();
      object(payload, { ok: yes, ...(endpoint === 'mfa-verify' ? { verified: yes } : {}),
        session: value => object(value, { authenticated: yes, expiresAt: text, absoluteExpiresAt: text,
          assuranceLevel: value => endpoint === 'mfa-verify' ? value === 'aal2' : ['aal1', 'aal2'].includes(value),
          mfaRequired: boolean }),
        user: value => object(value, { id: identity, email: nullableText, displayName: text,
          role: value => value === 'game_admin', permissionVersion: positive, securityVersion: positive }),
        activeGameSessions: value => Array.isArray(value) && value.length <= 1000 && value.every(game => object(game, gameFields)),
        csrfToken: value => text(value) && value.length > 0,
      });
      if (payload.activeGameSessions.some(game => game.joinCode !== game.gameCode)) throw new Error();
    }
    return payload;
  } catch { fail('Local teacher response contract is invalid.'); }
}

function execute(command, args, { input, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { env, timeout: 30_000, maxBuffer: 262_144 }, (error, stdout) => {
      if (error) reject(new Error('Local fixture command failed.'));
      else resolve(stdout.trim());
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export async function sql(databaseUrl, statement) {
  const url = new URL(validateDatabaseUrl(databaseUrl));
  // No connection password or SQL is placed in process arguments.
  return execute('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: `set standard_conforming_strings = on;\n${statement}\n`,
    env: { PATH: process.env.PATH, HOME: '/nonexistent', PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
      PGPORT: url.port, PGDATABASE: 'postgres', PGUSER: decodeURIComponent(url.username || 'postgres'),
      PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10', PSQLRC: '/dev/null' },
  });
}
export const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const literal = sqlLiteral;
export const runSql = (statement) => sql(process.env.DATABASE_URL || '', statement);
async function runtime() {
  const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL || '');
  const output = await execute('npx', ['supabase', 'status', '--workdir', 'backend', '-o', 'env']);
  const values = {};
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { fail('Local fixture status is invalid.'); }
    }
    values[match[1]] = value;
  }
  const apiUrl = validateSupabaseUrl(values.API_URL || values.SUPABASE_URL || '');
  const key = values.SERVICE_ROLE_KEY || values.SECRET_KEY;
  if (!key) fail('Local fixture credentials unavailable.');
  return { databaseUrl, apiUrl, key };
}
async function authRequest(config, path, method, body) {
  try {
    const response = await fetch(`${validateSupabaseUrl(config.apiUrl)}/auth/v1/admin/users${path}`, {
      method, headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) fail('Local fixture Auth operation failed.');
    return await response.json();
  } catch { fail('Local fixture Auth operation failed.'); }
}
export async function createFixture({ email, password = randomBytes(32).toString('base64url'), role = 'game_admin', permissionOverrides = {} }) {
  if (!/^[a-z0-9._+-]+@example\.(?:test|invalid)$/iu.test(email) || !['game_admin', 'system_admin'].includes(role) ||
      Object.entries(permissionOverrides).some(([key, value]) => !/^[a-z]+\.[a-z]+$/u.test(key) || typeof value !== 'boolean')) {
    fail('Local fixture input is invalid.');
  }
  const config = await runtime();
  const user = await authRequest(config, '', 'POST', { email, password, email_confirm: true, user_metadata: { display_name: 'Synthetic Roster Teacher' } });
  const authUserId = user.id || user.user?.id;
  if (typeof authUserId !== 'string' || !new RegExp(`^${UUID.source}$`, 'iu').test(authUserId)) fail('Local fixture identity is invalid.');
  const fixture = { email, password, authUserId, role };
  owned.add(fixture);
  secrets.set(fixture, config);
  try {
    await sql(config.databaseUrl, `insert into public.staff_users (supabase_auth_user_id,email,display_name,status,role,mfa_required)
      values (${literal(authUserId)}::uuid,lower(${literal(email)}),'Synthetic Roster Teacher','active',${literal(role)},true);`);
    await updateFixturePermissions(fixture, permissionOverrides, role);
    return fixture;
  } catch {
    fail('Local fixture creation failed.');
  }
}
export async function updateFixturePermissions(fixture, overrides, role = fixture.role) {
  if (!owned.has(fixture) || !['game_admin', 'system_admin'].includes(role) ||
      Object.entries(overrides).some(([key, value]) => !/^[a-z]+\.[a-z]+$/u.test(key) || typeof value !== 'boolean')) fail('Local fixture permissions are invalid.');
  const config = secrets.get(fixture), authUserId = fixture.authUserId;
  try {
    for (const [permission, enabled] of Object.entries(overrides)) {
      await sql(config.databaseUrl, enabled
        ? `insert into public.staff_permission_grants(staff_user_id,permission,reason) select id,${literal(permission)},'Synthetic roster test' from public.staff_users where supabase_auth_user_id=${literal(authUserId)}::uuid on conflict do nothing;`
        : `delete from public.staff_permission_grants where staff_user_id=(select id from public.staff_users where supabase_auth_user_id=${literal(authUserId)}::uuid) and permission=${literal(permission)};`);
    }
    const state = JSON.parse(await sql(config.databaseUrl, `select jsonb_build_object('permission_version',permission_version,'security_version',security_version) from public.staff_users where supabase_auth_user_id=${literal(authUserId)}::uuid;`));
    if (Object.values(state).some(value => !Number.isSafeInteger(value) || value < 1)) fail('Local fixture security state is invalid.');
    await authRequest(config, `/${authUserId}`, 'PUT', { app_metadata: { econovaria_role: role, ...state } });
  } catch { fail('Local fixture permission update failed.'); }
}
// Cleanup belongs to the disposable stack owner; never cascade-delete staff here.
export function forgetFixture(fixture) {
  owned.delete(fixture); secrets.delete(fixture); mfaSecrets.delete(fixture.email);
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.replace(/\s|=/gu, '').toUpperCase();
  if (!/^[A-Z2-7]+$/u.test(normalized)) fail('Local MFA enrollment is invalid.');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of normalized) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const key = Buffer.from(bytes), counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const code = String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  key.fill(0); counter.fill(0); digest.fill(0);
  return code;
}
// Attach rejection handling immediately: a failed click must not leave a raw Playwright rejection.
function observe(promise) { promise.catch(() => {}); return promise; }
const route = (response, suffix, method) => new URL(response.url()).pathname.endsWith(`/functions/v1/web-session-api/${suffix}`) && response.request().method() === method;
async function browserJson(response, endpoint) {
  if (!response.ok()) fail('Local browser authentication operation failed.');
  return assertTeacherDto(await response.json(), endpoint);
}
export async function browserSessionStatus(page) {
  try {
    const url = statusUrls.get(page);
    if (!url) fail('Local session status URL is unavailable.');
    return await browserJson(await page.request.get(url, { headers: statusHeaders.get(page) }), 'status');
  } catch { fail('Local browser session status failed.'); }
}
export async function login(page, { email, password, completeMfa = true, totpSecret }) {
  try {
    const base = process.env.ECONOVARIA_ROSTER_BASE_URL || process.env.ECONOVARIA_BROWSER_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:4173';
    const origin = new URL(base);
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.username || origin.password) fail('Local browser URL is invalid.');
    await page.goto(`${origin.origin}/?mode=admin`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator('#adminForm').waitFor({ state: 'visible' });
    await page.locator('#adminEmail').fill(email);
    await page.locator('#adminAccessCode').fill(password);
    const responsePromise = observe(page.waitForResponse(response => route(response, 'login', 'POST'), { timeout: 120_000 }));
    await page.locator('#adminForm button[type="submit"]').click();
    const response = await responsePromise;
    const signedIn = await browserJson(response, 'login');
    if (signedIn.session?.assuranceLevel !== 'aal1') fail('Local browser session is not AAL1.');
    const statusUrl = new URL(response.url()); statusUrl.pathname = statusUrl.pathname.replace(/\/login$/u, '/status');
    statusUrls.set(page, statusUrl.href);
    const loginHeaders = await response.request().allHeaders();
    const publicHeaders = {};
    for (const name of ['apikey', 'x-econovaria-device-id']) {
      if (loginHeaders[name]) publicHeaders[name] = loginHeaders[name];
    }
    if (!publicHeaders.apikey) fail('Local browser publishable key is unavailable.');
    statusHeaders.set(page, publicHeaders);
    if (!completeMfa) return { status: signedIn, authSecrets: [password], secrets: [password, signedIn.csrfToken].filter(Boolean) };
    const host = page.locator('#econovariaAdminMfaStep:not(.hidden)');
    await host.waitFor({ state: 'visible', timeout: 30_000 });
    let secret = totpSecret || mfaSecrets.get(email);
    if (!secret) {
      const secretNode = host.locator('.econovaria-mfa-secret');
      await secretNode.waitFor({ state: 'visible', timeout: 20_000 });
      secret = (await secretNode.textContent()).trim();
      mfaSecrets.set(email, secret);
      await host.locator('.econovaria-mfa-setup-continue').click();
    }
    const form = host.locator('.econovaria-mfa-form:not(.hidden)');
    await form.waitFor({ state: 'visible' });
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (remaining < 5) await page.waitForTimeout((remaining + 1) * 1000);
    const verifiedPromise = observe(page.waitForResponse(response => route(response, 'mfa/verify', 'POST'), { timeout: 60_000 }));
    await form.locator('.econovaria-mfa-code').fill(totp(secret));
    await form.locator('.econovaria-mfa-submit').click();
    const verified = await browserJson(await verifiedPromise, 'mfa-verify');
    if (verified.session?.assuranceLevel !== 'aal2') fail('Local browser session is not AAL2.');
    await page.locator('#econovariaAdminMfaStep').waitFor({ state: 'hidden' });
    const status = await browserSessionStatus(page);
    if (status.session?.assuranceLevel !== 'aal2') fail('Local browser status is not AAL2.');
    return { status, authSecrets: [password, secret], secrets: [password, secret, signedIn.csrfToken, verified.csrfToken, status.csrfToken].filter(Boolean) };
  } catch { fail('Local rendered staff login failed.'); }
}
export async function createOwnedGame(page, { email, password, gameName, licenseCode, alreadyAuthenticated = false }) {
  const authenticated = alreadyAuthenticated ? { authSecrets: [password, mfaSecrets.get(email)].filter(Boolean), secrets: [password, mfaSecrets.get(email)].filter(Boolean) } : await login(page, { email, password });
  try {
    if (alreadyAuthenticated) await page.goto(`${new URL(page.url()).origin}/?mode=admin`, { waitUntil: 'domcontentloaded' });
    await page.locator('#adminGamesStep:not(.hidden)').waitFor({ state: 'visible' });
    await page.locator('#createNewAdminGame').click();
    await page.locator('#adminNewLicenseCode').fill(licenseCode);
    await page.locator('#adminNewGameName').fill(gameName);
    await page.locator('#adminNewGameTimeZone').selectOption('Asia/Seoul');
    await page.locator('#adminNewGameDifficulty').selectOption('moderate');
    const createdPromise = observe(page.waitForResponse(response => route(response, 'proxy/games', 'POST'), { timeout: 180_000 }));
    const statusPromise = observe(page.waitForResponse(response => route(response, 'status', 'GET') && response.ok(), { timeout: 180_000 }));
    await page.locator('#adminCreateGameForm button[type="submit"]').click();
    const [createdResponse, statusResponse] = await Promise.all([createdPromise, statusPromise]);
    const created = await browserJson(createdResponse, 'create-game'), status = await browserJson(statusResponse, 'status');
    const gameId = created.data?.game?.id || created.data?.game?.gameId;
    if (!gameId || !status.activeGameSessions?.some(game => game.id === gameId)) fail('Local created game scope is invalid.');
    await page.locator('#adminGameList .game-row', { hasText: gameName }).first().click();
    await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/u, { timeout: 120_000 });
    await page.waitForFunction(() => { const node = document.getElementById('adminPreview'); return Boolean(node && !node.hidden && node.childElementCount); }, undefined, { timeout: 120_000 });
    return { gameId, publicGameId: gameId, created, status, authSecrets: authenticated.authSecrets, secrets: [...authenticated.secrets, status.csrfToken].filter(Boolean) };
  } catch { fail('Local rendered game creation failed.'); }
}
