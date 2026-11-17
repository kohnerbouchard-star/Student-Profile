import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("admin status storage allowlist discards nested and top-level credentials", () => {
  const stored = new Map();
  let persist;
  const window = {
    Econovaria: {},
    document: { readyState: "loading", addEventListener() {} },
    sessionStorage: { setItem: (key, value) => stored.set(key, value) },
    createLoginGameSelection: (dependencies) => { persist = dependencies.persistSafeAdminStatus; return {}; },
    createLoginAccountEnrollment: () => ({}),
  };
  vm.runInNewContext(readFileSync(new URL("../frontend/src/core/login.js", import.meta.url), "utf8"), { window });
  const credentials = { password: "PASSWORD_SENTINEL", accessToken: "ACCESS_SENTINEL", refreshToken: "REFRESH_SENTINEL", sessionCookie: "COOKIE_SENTINEL" };
  persist({
    ...credentials,
    session: { ...credentials, authenticated: true, expiresAt: "expiry" },
    csrfToken: "a".repeat(43),
    user: { ...credentials, id: "staff", email: "staff@example.invalid", role: "game_admin" },
    activeGameSessions: [{ ...credentials, id: "game", name: "Classroom", status: "active" }],
  });
  assert.equal(stored.size, 1);
  const serialized = stored.get("econovaria.admin.auth.v1");
  for (const credential of Object.values(credentials)) assert.equal(serialized.includes(credential), false);
  const record = JSON.parse(serialized);
  assert.equal(record.csrfToken, "a".repeat(43));
  assert.equal(record.user.email, "staff@example.invalid");
  assert.deepEqual(record.activeGameSessions, [{ id: "game", name: "Classroom", status: "active" }]);
  assert.throws(() => persist({ session: { authenticated: false }, csrfToken: "a".repeat(43) }));
  assert.throws(() => persist({ session: { authenticated: true }, csrfToken: "invalid" }));
  assert.equal(stored.get("econovaria.admin.auth.v1"), serialized);
});
