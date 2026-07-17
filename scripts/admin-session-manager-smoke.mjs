import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("admin/auth-session-manager.js", "utf8");

function token(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp, sub: "staff-1" })}.signature`;
}

function createRuntime(fetch) {
  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const window = {
    fetch,
    sessionStorage,
    dispatchEvent() {}
  };
  window.window = window;
  vm.runInNewContext(source, {
    window,
    atob: (value) => Buffer.from(value, "base64").toString("utf8"),
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    String
  });
  return { manager: window.EconovariaAdminAuthSession, sessionStorage };
}

{
  let calls = 0;
  const { manager, sessionStorage } = createRuntime(async () => {
    calls += 1;
    throw new Error("unexpected fetch");
  });
  const current = { accessToken: token(Math.floor(Date.now() / 1000) + 3600), refreshToken: "r1" };
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(current));
  assert.equal((await manager.getUsableSession()).accessToken, current.accessToken);
  assert.equal(calls, 0, "valid sessions must not refresh");
}

{
  let calls = 0;
  let releaseFetch;
  const pending = new Promise((resolve) => { releaseFetch = resolve; });
  const { manager, sessionStorage } = createRuntime(async (url, init) => {
    calls += 1;
    assert.match(url, /grant_type=refresh_token/);
    assert.equal(JSON.parse(init.body).refresh_token, "old-refresh");
    await pending;
    return new Response(JSON.stringify({
      access_token: token(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: "rotated-refresh",
      user: { id: "staff-1" }
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token(Math.floor(Date.now() / 1000) - 5),
    refreshToken: "old-refresh"
  }));
  const first = manager.getUsableSession();
  const second = manager.getUsableSession();
  releaseFetch();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1, "concurrent callers must share one refresh");
  assert.equal(one.refreshToken, "rotated-refresh");
  assert.equal(two.accessToken, one.accessToken);
  assert.equal(JSON.parse(sessionStorage.getItem("econovaria.admin.auth.v1")).refreshToken, "rotated-refresh");
}

{
  const { manager, sessionStorage } = createRuntime(async () => new Response("rejected", { status: 401 }));
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token(Math.floor(Date.now() / 1000) - 5),
    refreshToken: "revoked"
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", "game-1");
  await assert.rejects(() => manager.getUsableSession(), /rejected/);
  assert.equal(sessionStorage.getItem("econovaria.admin.auth.v1"), null);
  assert.equal(sessionStorage.getItem("econovaria.admin.selected-game.v1"), null);
}

console.log("Admin session refresh, rotation, deduplication, and rejection handling passed.");
