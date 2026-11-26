import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const device = "123e4567-e89b-42d3-a456-426614174000";
const playerKey = "econovaria.player.auth.v1", adminKey = "econovaria.admin.auth.v1";
const playerCsrf = "p".repeat(43), adminCsrf = "a".repeat(43);
function fixture({ deviceValue = device, generate = () => device, blocked = false } = {}) {
  const sessions = new Map(), devices = new Map([["econovaria.device.v1", deviceValue]]), calls = [];
  let next = { ok: true }; let nextStatus = 200;
  const window = {
    localStorage: { getItem: (key) => { if (blocked) throw Error("blocked"); return devices.get(key); }, setItem: (key, value) => devices.set(key, value) },
    sessionStorage: { getItem: (key) => sessions.get(key) }, crypto: { randomUUID: generate },
    EconovariaAdminGameSelection: { read: () => " selected-game " },
    Econovaria: { core: { constants: { SUPABASE_URL: "https://fixture.test", SUPABASE_PUBLISHABLE_KEY: "public-fixture",
      PLAYER_API_URL: "/api/player", PLAYER_WEB_SESSION_API_URL: "/api/player-session", WEB_SESSION_API_URL: "/api/web-session", BOOTSTRAP_API_URL: "/api/bootstrap", ADMIN_BFF_API_URL: "/api/admin" } } },
  };
  const context = vm.createContext({ window, fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: nextStatus < 400, status: nextStatus, headers: { get: () => null }, json: async () => next };
  } });
  const statePath = "frontend/src/core/api-session-state.js";
  if (existsSync(new URL(statePath, root))) vm.runInContext(read(statePath), context);
  vm.runInContext(read("frontend/src/core/api.js"), context);
  return { api: window.Econovaria.core.api, core: window.Econovaria.core, window, calls, sessions, devices,
    respond(value, status = 200) { next = value; nextStatus = status; },
    state(key, csrfToken) { sessions.set(key, JSON.stringify({ authenticated: true, csrfToken })); } };
}
test("existing global and namespace facade identities are retained", () => {
  const f = fixture();
  for (const [key, value] of Object.entries(f.api)) assert.equal(value, f.core[key]);
  assert.equal(f.api.getOrCreateDeviceId(), device);
});
test("device identifier normalizes existing value without generating", () => {
  const f = fixture({ deviceValue: ` ${device.toUpperCase()} `, generate: () => { throw Error("must not generate"); } });
  assert.equal(f.api.getOrCreateDeviceId(), device);
});
test("invalid device gets secure replacement persisted", () => {
  const f = fixture({ deviceValue: "invalid" }); assert.equal(f.api.getOrCreateDeviceId(), device);
  assert.equal(f.devices.get("econovaria.device.v1"), device);
});
for (const options of [{ blocked: true }, { deviceValue: "invalid", generate: () => "bad" }]) test(`device failure remains fail-closed ${JSON.stringify(options)}`, () => {
  assert.throws(() => fixture(options).api.getOrCreateDeviceId(), /secure device identifier could not be initialized/);
});
test("Player response memory overrides stored fallback, stays isolated from Admin", async () => {
  const f = fixture(); f.state(playerKey, playerCsrf); f.state(adminKey, adminCsrf);
  f.respond({ ok: true, csrfToken: "q".repeat(43) }); await f.api.callPlayerBootstrapApi();
  f.respond({ ok: true }); await f.api.callPlayerLogoutApi();
  assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], "q".repeat(43));
  await f.api.callAdminMfaEnroll("test"); assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], adminCsrf);
  await f.api.callPlayerLogoutApi(); assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], playerCsrf);
});
test("Admin remembered response overrides stored state only for session transport, not BFF", async () => {
  const f = fixture(); f.state(adminKey, adminCsrf);
  f.respond({ ok: true, csrfToken: "b".repeat(43) }); await f.api.callAdminWebSessionStatus({ requireAal2: false });
  f.respond({ ok: true }); await f.api.callAdminMfaEnroll("test");
  assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], "b".repeat(43));
  await f.api.callLicensingActivationApi(null, { idempotencyKey: "request-12345678" });
  const { options } = f.calls.at(-1);
  assert.equal(options.headers["x-econovaria-csrf-token"], adminCsrf);
  assert.equal(options.headers["x-econovaria-game-id"], "selected-game");
  assert.equal(options.credentials, "include"); assert.equal(options.cache, "no-store");
  assert.equal(options.headers.Authorization, undefined);
});
test("invalid and failed response CSRF never replace remembered token", async () => {
  const f = fixture(); f.respond({ ok: true, csrfToken: adminCsrf }); await f.api.callAdminWebSessionStatus({ requireAal2: false });
  f.respond({ ok: true, csrfToken: "invalid" }); await f.api.callAdminWebSessionStatus({ requireAal2: false });
  f.respond({ ok: true, csrfToken: "z".repeat(43) }, 401); await f.api.callAdminWebSessionStatus({ requireAal2: false });
  f.respond({ ok: true }); await f.api.callAdminMfaEnroll("test");
  assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], adminCsrf);
});
for (const stored of ["invalid-json", JSON.stringify({ authenticated: false, csrfToken: adminCsrf }), JSON.stringify({ authenticated: true, csrfToken: "invalid" })]) test(`malformed/untrusted stored state denies BFF ${stored}`, async () => {
  const f = fixture(); f.sessions.set(adminKey, stored);
  const result = await f.api.callLicensingActivationApi(null, {});
  assert.equal(result.code, "staff_session_invalid"); assert.equal(f.calls.length, 0);
});
test("failed logout clears memory but retains original persisted fallback semantics", async () => {
  const f = fixture(); f.state(adminKey, adminCsrf);
  f.respond({ ok: true, csrfToken: "b".repeat(43) }); await f.api.callAdminWebSessionStatus({ requireAal2: false });
  f.respond({ ok: false }, 500); await f.api.callAdminWebSessionLogout();
  f.respond({ ok: true }); await f.api.callAdminMfaEnroll("test");
  assert.equal(f.calls.at(-1).options.headers["x-econovaria-csrf-token"], adminCsrf);
});
test("missing Player CSRF rejects without network; cookie sign-in remains included", async () => {
  const f = fixture(); assert.equal((await f.api.callPlayerLogoutApi()).code, "player_session_invalid"); assert.equal(f.calls.length, 0);
  await f.api.callPlayerLoginApi(" join ", " player ", " code ");
  const { url, options } = f.calls[0]; assert.equal(url, "/api/player-session/login"); assert.equal(options.credentials, "include");
  assert.deepEqual(JSON.parse(options.body), { gameJoinCode: "join", playerIdentifier: "player", accessCode: "code" });
});
test("classic state owner loads before API facade and remains guarded in aggregate", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('src="frontend/src/core/api-session-state.js"') < html.indexOf('src="frontend/src/core/api.js"'));
  assert.match(read("package.json"), /node --test scripts\/frontend-api-session-state\.test\.mjs/);
  for (const path of ["scripts/auth-boundary-contract.test.mjs", "scripts/security-audit-remediation-contract.test.mjs"]) {
    assert.ok(read(path).includes('"frontend/src/core/api-session-state.js"'));
  }
});
test("existing explicit API workflow selectors also cover extracted state and its tests", () => {
  for (const name of ["player-runtime-cutover-verify", "admin-shell-smoke", "beta-security-contract", "admin-mfa-browser", "admin-auth-boundary"]) {
    const workflow = read(`.github/workflows/${name}.yml`);
    const count = (path) => workflow.split(`      - "${path}"`).length - 1;
    assert.ok(count("frontend/src/core/api.js") > 0);
    assert.equal(count("frontend/src/core/api-session-state.js"), count("frontend/src/core/api.js"));
    assert.equal(count("scripts/frontend-api-session-state.test.mjs"), count("frontend/src/core/api.js"));
  }
});
