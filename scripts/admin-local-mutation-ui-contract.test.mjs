import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const JOIN_CODE = new URL("../admin/game-code-wiring.js", import.meta.url);
const ATTENDANCE_SETTINGS = new URL(
  "../admin/attendance-reward-save-controller-v3.js",
  import.meta.url,
);
const ADMIN_TERMINAL = new URL(
  "../admin/dist/admin-overview-terminal.js",
  import.meta.url,
);
const CREATE_ACTION_ADAPTER = new URL(
  "../admin/create-action-adapter.js",
  import.meta.url,
);
const ATTENDANCE_SETTINGS_BRIDGE = new URL(
  "../admin/attendance-reward-request-adapter.js",
  import.meta.url,
);
const ADMIN_AUTH = new URL("../admin/admin-auth.js", import.meta.url);
const ADMIN_BOOTSTRAP = new URL("../admin/admin-bootstrap.js", import.meta.url);
const OLD_BRIDGE = new URL("../admin/attendance-reward-settings-route-bridge-v2.js", import.meta.url);

test("direct join-code rotation retains one stable key until success", async () => {
  const source = await readFile(JOIN_CODE, "utf8");
  assert.match(source, /RESET_KEY_PREFIX/);
  assert.match(source, /resetMutationMemory = new Map\(\)/);
  assert.match(source, /resetMutationMemory\.get\(storageKey\)/);
  assert.match(source, /resetMutationMemory\.delete\(storageKey\)/);
  assert.match(source, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(source, /sessionStorage\.setItem\(storageKey, key\)/);
  assert.match(source, /"X-Idempotency-Key": mutation\.key/);
  assert.match(source, /"X-Request-Id": mutation\.key/);
  assert.match(source, /idempotencyKey: mutation\.key/);
  assert.match(source, /if \(!response\.ok\)[\s\S]+completeResetMutation\(mutation\.storageKey\)/);
  assert.ok(
    source.lastIndexOf("completeResetMutation(mutation.storageKey)") >
      source.lastIndexOf("if (!response.ok)"),
  );
});

test("direct attendance-settings save binds a stable key to its payload", async () => {
  const source = await readFile(ATTENDANCE_SETTINGS, "utf8");
  assert.match(source, /mutationMemory = new Map\(\)/);
  assert.match(source, /mutationMemory\.get\(storageKey\)/);
  assert.match(source, /mutationMemory\.delete\(storageKey\)/);
  assert.match(source, /existing\.payload === payload/);
  assert.match(source, /sessionStorage\.setItem\(storageKey, JSON\.stringify\(\{ key, payload \}\)\)/);
  assert.match(source, /"X-Idempotency-Key": mutation\.key/);
  assert.match(source, /"X-Request-Id": mutation\.key/);
  assert.match(source, /idempotencyKey: mutation\.key/);
  assert.match(source, /if \(!response\.ok\)[\s\S]+completeSettingsMutation\(mutation\.storageKey\)/);
  assert.ok(
    source.lastIndexOf("completeSettingsMutation(mutation.storageKey)") >
      source.lastIndexOf("if (!response.ok)"),
  );
});

test("generic Admin mutations retain pending keys across retryable responses", async () => {
  const source = await readFile(ADMIN_TERMINAL, "utf8");
  assert.doesNotMatch(source, /ADMIN_TERMINAL_IDEMPOTENCY_TTL_MS/);
  assert.doesNotMatch(source, /createdAt[^\n]+delete feature\.apiIdempotencyKeys/);
  assert.match(
    source,
    /isAdminTerminalRetryableIdempotencyResponse\(response = null, data = null\)/,
  );
  assert.match(source, /code === "idempotency_request_in_progress" && retryable/);
  assert.match(
    source,
    /shouldClearAdminTerminalIdempotencyAfterResponse\(response, data\)/,
  );
  assert.match(source, /reason: "idempotency-in-progress"/);
  assert.ok(
    source.indexOf("if (retryableIdempotencyResponse)") <
      source.indexOf("if ([409, 412].includes(response.status))"),
  );
});

test("generic mutation identity follows the effective adapter and bridge payload", async () => {
  const source = await readFile(ADMIN_TERMINAL, "utf8");
  assert.match(source, /getAdminTerminalEffectiveIdempotencyPayload/);
  assert.match(source, /actionName === "submit-attendance-scan"/);
  assert.match(source, /code: payload\.code \|\| payload\.playerId \|\| payload\.scannedCode/);
  const scannerStart = source.indexOf('if (actionName === "submit-attendance-scan")');
  const settingsStart = source.indexOf('if (actionName === "save-settings")', scannerStart);
  assert.ok(scannerStart >= 0 && settingsStart > scannerStart);
  const scannerIdentity = source.slice(scannerStart, settingsStart);
  assert.doesNotMatch(scannerIdentity, /payload\.(?:scanMode|source)/);
  assert.match(source, /EconovariaAttendanceRewardSettings\?\.getDraftWindow\?\.\(\)/);
  assert.match(source, /EconovariaAttendanceRewardSettingsRouteBridge\?\.getCurrentAttendanceWindow/);
  assert.match(source, /form: getAdminTerminalNearestFormData\(action\)/);
  assert.match(
    source,
    /appendAdminTerminalIdempotency\(baseBody, actionName, method, endpoint, action\)/,
  );
});

test("Store Country stock and combined Settings identity use the exact outgoing command", async () => {
  const createAdapter = await readFile(CREATE_ACTION_ADAPTER, "utf8");
  const terminal = await readFile(ADMIN_TERMINAL, "utf8");
  const bridge = await readFile(ATTENDANCE_SETTINGS_BRIDGE, "utf8");

  assert.match(createAdapter, /stockMode === "Country"/);
  assert.match(createAdapter, /data-admin-terminal-store-country-stock/);
  assert.match(createAdapter, /Math\.trunc\(countryStockQuantity\)/);
  assert.match(terminal, /payload: effective\.payload/);
  assert.match(bridge, /suppliedAttendanceWindow/);
  assert.match(bridge, /Object\.keys\(suppliedAttendanceWindow\)\.length/);
  assert.match(bridge, /EconovariaAttendanceRewardSettingsRouteBridge = Object\.freeze/);
});

test("scanner result reads the local handler's sibling player and reward contracts", async () => {
  const source = await readFile(ADMIN_TERMINAL, "utf8");
  assert.match(source, /const player = payload\.player \|\| record\.player \|\| \{\}/);
  assert.match(source, /const reward = payload\.reward \|\| record\.reward \|\| \{\}/);
  assert.match(source, /player\.displayName \|\| player\.playerName/);
  assert.match(source, /reward\.amount \?\? record\.rewardAmount/);
  assert.match(source, /reward\.currencyCode \|\| record\.rewardCurrencyCode/);
});

test("generic Admin mutations use the canonical cookie-bound CSRF header", async () => {
  const source = await readFile(ADMIN_TERMINAL, "utf8");
  assert.match(source, /headers\["X-Econovaria-CSRF-Token"\] = csrfToken/);
  assert.doesNotMatch(source, /headers\["X-CSRF-Token"\]/);
});

test("join-code wiring mirrors only the authenticated session CSRF token", async () => {
  const source = await readFile(JOIN_CODE, "utf8");
  assert.match(source, /EconovariaAdminAuthSession\?\.read\?\.\(\)/);
  assert.match(source, /\^\[A-Za-z0-9_-\]\{43\}\$/);
  assert.doesNotMatch(source, /econovaria\.admin\.csrf\.v1/);
  assert.doesNotMatch(source, /sessionStorage\.setItem\(CSRF_TOKEN_KEY/);
});

// Synthetic transport characterization; real-page lifecycle coverage lives in
// admin-attendance-reward-settings-smoke.mjs, not in a mocked DOM assertion.
async function attendanceFixture(options = {}) {
  const calls = [], events = [], cacheReads = [];
  const state = { mounted: true, activeGameId: "game-one", pending: false, generation: 0,
    draft: {}, fields: { presentRewardAmount: "7.25", lateRewardAmount: "2.5",
      currencyMode: "fixed", applyDifficultyIncomeModifier: "false" }, ...options };
  const nativeFetch = async (input, init) => {
    calls.push({ input, init });
    const response = options.reply ? await options.reply(input, init) : new Response("{}");
    const clone = response.clone.bind(response);
    response.clone = () => {
      const copy = clone(), json = copy.json.bind(copy);
      copy.json = () => { const read = json(); cacheReads.push(read); return read; };
      return copy;
    };
    return response;
  };
  const window = { fetch: nativeFetch, location: { href: "https://admin.example.test/admin/" },
    sessionStorage: { getItem: () => null },
    EconovariaAttendanceRewardSettings: { getGameId: () => state.activeGameId, getDraftWindow: () => state.draft },
    EconovariaAttendanceRewardSaveController: { combinedCoreSavePending: () => state.pending,
      getContextIdentity: () => `${state.generation}:${state.activeGameId}` } };
  const document = { querySelector(selector) {
    if (selector === "[data-admin-attendance-reward-settings]") return state.mounted ? {} : null;
    const name = selector.match(/^\[data-attendance-reward-field="([^"]+)"\]$/)?.[1];
    return Object.hasOwn(state.fields, name) ? { value: state.fields[name] } : null;
  }, dispatchEvent(event) { events.push(event); return true; } };
  vm.runInNewContext(await readFile(ATTENDANCE_SETTINGS_BRIDGE, "utf8"),
    { window, document, Request, Response, Headers, URL, URLSearchParams, CustomEvent });
  const adapter = window.EconovariaAttendanceRewardRequestAdapter;
  // Exercise the explicit before/after boundary; do not replace window.fetch.
  window.EconovariaAdminAuth = { async request(input, init) {
    const prepared = await adapter.prepareRequest(input, init);
    const response = await nativeFetch(prepared.input, prepared.init);
    return adapter.observeResponse(response, prepared.metadata);
  } };
  return { window, document, adapter, state, calls, events, nativeFetch,
    current: (gameId) => adapter.getCurrentAttendanceWindow(gameId),
    async settleCache() { await Promise.allSettled(cacheReads); await Promise.resolve(); } };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const bodyOf = (h, index = 0) => JSON.parse(h.calls[index].init.body);
const SETTINGS = "/api/admin/games/game-one/settings";

test("REF-012 adapter preserves fetch identity and frozen generated identity read", async () => {
  const h = await attendanceFixture();
  assert.equal(h.window.fetch, h.nativeFetch);
  assert.equal(Object.isFrozen(h.adapter), true);
  assert.equal(h.window.EconovariaAttendanceRewardSettingsRouteBridge.getCurrentAttendanceWindow, h.adapter.getCurrentAttendanceWindow);
  assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0);
  h.state.activeGameId = ""; assert.equal(h.current(), null);
});

test("REF-012 adapter delegates unrelated, unmounted, wrong-game and unsupported inputs unchanged", async () => {
  for (const item of [
    { path: "/api/admin/games/game-one/players" }, { path: `${SETTINGS}/` },
    { path: `${SETTINGS}/difficulty/extra` }, { path: "/api/admin/games/game-two/settings" },
    { path: SETTINGS, method: "DELETE" }, { path: SETTINGS, mounted: false },
  ]) {
    const h = await attendanceFixture({ mounted: item.mounted ?? true, pending: true });
    const init = { method: item.method || "PATCH", body: "not-json" };
    await h.adapter.request(item.path, init);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].input, item.path);
    assert.equal(h.calls[0].init, init); assert.equal(h.events.length, 0);
  }
});

test("REF-012 adapter normalizes each matched method and difficulty alias once", async () => {
  for (const method of ["POST", "PUT", "PATCH"]) for (const suffix of ["", "/difficulty"]) {
    const h = await attendanceFixture({ draft: { currencyCode: " krw " } });
    await h.adapter.request(SETTINGS + suffix, { method, body: '{"incomeMultiplier":1.5}' });
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.method, method);
    assert.deepEqual(bodyOf(h), { incomeMultiplier: 1.5, attendanceWindow: { timezone: "Asia/Seoul",
      presentRewardAmount: 7.25, lateRewardAmount: 2.5, currencyMode: "fixed",
      applyDifficultyIncomeModifier: false, currencyCode: "KRW" } });
    assert.equal(h.calls[0].init.headers.get("Content-Type"), "application/json");
  }
});

test("REF-012 adapter preserves supplied windows, containers and original casing", async () => {
  const supplied = { timezone: "Etc/UTC", currencyCode: "usd", customPolicy: "retain", presentRewardAmount: 3 };
  for (const container of [null, "settings", "payload"]) {
    const fields = { attendanceWindow: supplied, incomeMultiplier: 1.25 };
    const source = container ? { [container]: fields, trace: "retain" } : { ...fields, trace: "retain" };
    const h = await attendanceFixture();
    await h.adapter.request(SETTINGS, { method: "PATCH", body: JSON.stringify(source) });
    assert.deepEqual(bodyOf(h), source); assert.equal(supplied.currencyCode, "usd");
  }
});

test("REF-012 adapter preserves window precedence including empty settings object", async () => {
  for (const selected of ["settings", "payload", "root"]) {
    const h = await attendanceFixture(), source = { attendanceWindow: { selected: "root" } };
    if (selected !== "root") source.payload = { attendanceWindow: { selected: "payload" } };
    if (selected === "settings") source.settings = { attendanceWindow: { selected: "settings" } };
    await h.adapter.request(SETTINGS, { method: "PATCH", body: JSON.stringify(source) });
    assert.deepEqual(bodyOf(h), source);
  }
  const h = await attendanceFixture();
  await h.adapter.request(SETTINGS, { method: "PATCH", body: JSON.stringify({ settings: { attendanceWindow: {} }, attendanceWindow: { ignored: true } }) });
  assert.equal(bodyOf(h).settings.attendanceWindow.presentRewardAmount, 7.25);
  assert.deepEqual(bodyOf(h).attendanceWindow, { ignored: true });
});

test("REF-012 adapter retains malformed, array, form and object body normalization", async () => {
  for (const body of ["{bad-json", "[]", new URLSearchParams({ incomeMultiplier: "1.5" }), { incomeMultiplier: 1.5 }]) {
    const h = await attendanceFixture();
    await h.adapter.request(SETTINGS, { method: "PATCH", body });
    assert.equal(bodyOf(h).attendanceWindow.presentRewardAmount, 7.25);
    assert.equal(bodyOf(h).incomeMultiplier, body instanceof URLSearchParams ? "1.5" : typeof body === "object" ? 1.5 : undefined);
    assert.equal(h.calls.length, 1);
  }
});

test("REF-012 adapter preserves Request ownership, options, signal and retry headers", async () => {
  const h = await attendanceFixture(), signal = new AbortController().signal;
  const source = { attendanceWindow: { presentRewardAmount: 4, currencyCode: "USD" }, idempotencyKey: "synthetic-retry-key" };
  const request = new Request("https://admin.example.test" + SETTINGS, { method: "PUT", body: JSON.stringify(source),
    headers: { "Content-Type": "text/plain", "X-Econovaria-CSRF-Token": "synthetic-csrf",
      "X-Idempotency-Key": "synthetic-retry-key", "X-Request-Id": "synthetic-retry-key" },
    credentials: "include", cache: "no-store", redirect: "manual", referrer: "https://admin.example.test/admin/",
    referrerPolicy: "same-origin", mode: "same-origin", signal });
  await h.adapter.request(request);
  assert.equal(request.bodyUsed, false); assert.deepEqual(await request.json(), source);
  assert.deepEqual(bodyOf(h), source);
  for (const key of ["credentials", "cache", "redirect", "referrer", "referrerPolicy", "mode", "signal"]) assert.equal(h.calls[0].init[key], request[key]);
  for (const key of ["X-Econovaria-CSRF-Token", "X-Idempotency-Key", "X-Request-Id"]) assert.equal(h.calls[0].init.headers.get(key), request.headers.get(key));
  assert.equal(request.headers.get("Content-Type"), "text/plain"); assert.notEqual(h.calls[0].init.headers, request.headers);
});

test("REF-012 adapter honors explicit Request init overrides without mutating inputs", async () => {
  const h = await attendanceFixture(), request = new Request("https://admin.example.test" + SETTINGS);
  const signal = new AbortController().signal, headers = new Headers({ "X-Idempotency-Key": "override-key" });
  const init = { method: "PATCH", headers, signal, credentials: "include", cache: "reload", body: '{"attendanceWindow":{"currencyCode":"USD"}}' };
  await h.adapter.request(request, init);
  assert.equal(h.calls[0].init.signal, signal); assert.equal(h.calls[0].init.credentials, "include");
  assert.equal(h.calls[0].init.cache, "reload"); assert.equal(h.calls[0].init.headers.get("X-Idempotency-Key"), "override-key");
  assert.deepEqual(bodyOf(h), JSON.parse(init.body)); assert.equal(headers.has("Content-Type"), false); assert.equal(request.bodyUsed, false);
});

test("REF-012 adapter caches successful read envelopes per game without consuming responses", async () => {
  const value = { timezone: "Etc/UTC", currencyCode: "usd", presentRewardAmount: 11, retained: "yes" };
  for (const payload of [{ settings: { attendanceWindow: value } }, { data: { settings: { attendanceWindow: value } } },
    { data: { attendance_window: value } }, { settings: { settings: { attendanceWindow: value } } }]) {
    for (const method of ["GET", "HEAD"]) {
      const response = new Response(JSON.stringify(payload));
      const h = await attendanceFixture({ fields: {}, reply: () => response });
      assert.equal(await h.adapter.request(SETTINGS, { method }), response); await h.settleCache();
      assert.equal(response.bodyUsed, false); assert.equal(h.current("game-one").retained, "yes");
      assert.equal(h.current("game-one").presentRewardAmount, 11); assert.equal(h.current("game-two").retained, undefined);
      h.current().timezone = "changed"; assert.equal(h.current().timezone, "Etc/UTC");
      h.state.draft = { currencyCode: " eur " }; assert.equal(h.current().currencyCode, "EUR");
      assert.deepEqual(await response.json(), payload); assert.equal(h.events.length, 0);
    }
  }
});

test("REF-012 adapter ignores failed, malformed and array read responses", async () => {
  for (const response of [new Response("{}", { status: 503 }), new Response("not-json"), new Response('{"settings":{"attendanceWindow":[]}}')]) {
    const h = await attendanceFixture({ fields: {}, reply: () => response });
    assert.equal(await h.adapter.request(SETTINGS), response); await h.settleCache();
    assert.equal(h.current().timezone, "Asia/Seoul"); assert.equal(h.current().presentRewardAmount, 1);
    assert.equal(h.calls.length, 1); assert.equal(h.events.length, 0);
  }
});

test("REF-012 adapter emits one owned combined event only for successful writes", async () => {
  for (const pending of [true, false]) for (const status of [200, 400, 403, 409, 503]) {
    const response = new Response("{}", { status }), value = { presentRewardAmount: 5, retained: "value" };
    const h = await attendanceFixture({ pending, reply: () => response });
    assert.equal(await h.adapter.request(SETTINGS, { method: "PATCH", body: JSON.stringify({ attendanceWindow: value }) }), response);
    assert.equal(h.calls.length, 1); assert.equal(response.bodyUsed, false);
    assert.equal(h.events.length, pending && status === 200 ? 1 : 0);
    assert.equal(h.current().retained, status === 200 ? "value" : undefined);
    if (h.events.length) {
      assert.equal(h.events[0].type, "econovaria:attendance-reward-saved");
      assert.deepEqual(plain(h.events[0].detail), { gameId: "game-one", attendanceWindow: value, combined: true });
    }
  }
});

test("REF-012 adapter propagates transport failure without retry or saved event", async () => {
  const failure = new Error("synthetic offline");
  const h = await attendanceFixture({ pending: true, reply: () => { throw failure; } });
  await assert.rejects(h.adapter.request(SETTINGS, { method: "PATCH", body: "{}" }), (error) => error === failure);
  assert.equal(h.calls.length, 1); assert.equal(h.events.length, 0);
});

test("REF-012 adapter does not acknowledge replaced contexts or newly dirty core settings", async () => {
  for (const change of ["game", "generation", "new-core-edit"]) {
    const h = await attendanceFixture({ pending: change !== "new-core-edit" });
    const prepared = await h.adapter.prepareRequest(SETTINGS, { method: "PATCH", body: "{}" });
    if (change === "game") h.state.activeGameId = "game-two";
    if (change === "generation") h.state.generation++;
    h.state.pending = true;
    await h.adapter.observeResponse(new Response("{}"), prepared.metadata);
    assert.equal(h.events.length, 0, change);
  }
});

test("REF-012 adapter refuses to send without its authenticated transport", async () => {
  const h = await attendanceFixture(); delete h.window.EconovariaAdminAuth;
  await assert.rejects(h.adapter.request(SETTINGS, { method: "PATCH", body: "{}" }), /Authenticated Admin transport/);
  assert.equal(h.calls.length, 0); assert.equal(h.window.fetch, h.nativeFetch);
});

test("REF-012 source wiring preserves explicit handoff and the existing Admin wrapper", async () => {
  const auth = await readFile(ADMIN_AUTH, "utf8"), controller = await readFile(ATTENDANCE_SETTINGS, "utf8");
  assert.match(auth, /await attendanceAdapter\.prepareRequest\(input, init\)/);
  assert.match(auth, /attendanceAdapter\.observeResponse\(response, attendanceMetadata\)/);
  assert.match(auth, /request: econovariaAdminRequest/);
  assert.match(auth, /window\.fetch = function econovariaAdminFetch/);
  assert.match(controller, /adapter\.request\(input, init\)/);
  assert.equal((controller.match(/await attendanceRequest\(/g) || []).length, 2);
  assert.match(controller, /getContextIdentity/);
});

test("REF-012 source bootstrap and retained read facade install no second fetch wrapper", async () => {
  const bootstrap = await readFile(ADMIN_BOOTSTRAP, "utf8");
  assert.match(bootstrap, /\.\/attendance-reward-request-adapter\.js/);
  assert.doesNotMatch(bootstrap, /attendance-reward-settings-route-bridge-v2\.js/);
  for (const path of [OLD_BRIDGE, ATTENDANCE_SETTINGS_BRIDGE]) assert.doesNotMatch(await readFile(path, "utf8"), /window\.fetch\s*=/);
  assert.match(await readFile(OLD_BRIDGE, "utf8"), /getCurrentAttendanceWindow: adapter\.getCurrentAttendanceWindow/);
});

async function authenticatedFixture(options = {}) {
  const h = await attendanceFixture(options);
  const session = options.anonymous ? null : { csrfToken: options.missingCsrf ? "" : "C".repeat(43) };
  Object.assign(h.window, {
    EconovariaRuntimeConfig: { supabasePublishableKey: "synthetic-publishable", adminBffApiUrl: "https://admin.example.test/api/admin" },
    EconovariaAdminAuthSession: { read: () => session, getUsableSession: async () => session,
      isExpired: () => Boolean(options.expired), refresh: async () => null, clear() {} },
    EconovariaAdminGameSelection: { read: () => options.noGame ? "" : "game-one", clear() {} },
    localStorage: { getItem: () => "00000000-0000-4000-8000-000000000001" },
    setTimeout() {},
  });
  vm.runInNewContext(await readFile(ADMIN_AUTH, "utf8"), {
    window: h.window, document: h.document, Request, Response, Headers, URL, Blob,
  });
  return h;
}

test("REF-012 integration uses the actual Admin normalizer and cookie CSRF transport once", async () => {
  for (const body of [{ incomeMultiplier: 1.25 }, new URLSearchParams({ incomeMultiplier: "1.25" }), '{"incomeMultiplier":1.25}']) {
    for (const direct of [false, true]) {
      const h = await authenticatedFixture({ pending: true });
      const send = direct ? h.adapter.request : h.window.fetch;
      const response = await send(SETTINGS + "/difficulty", { method: "PUT", body, headers: {
        "Authorization": "synthetic-untrusted", "Cookie": "synthetic-untrusted", "X-Econovaria-CSRF-Token": "synthetic-untrusted",
        "X-Idempotency-Key": "retained-key", "X-Request-Id": "retained-key",
      } });
      assert.equal(response.ok, true); assert.equal(h.calls.length, 1); assert.equal(h.events.length, 1);
      const { input, init } = h.calls[0];
      assert.equal(input, "https://admin.example.test" + SETTINGS); assert.equal(init.method, "PATCH");
      const command = JSON.parse(typeof init.body === "string" ? init.body : Buffer.from(init.body).toString());
      assert.equal(Number(command.incomeMultiplier), 1.25); assert.equal(command.attendanceWindow.presentRewardAmount, 7.25);
      assert.equal(init.headers.get("X-Econovaria-CSRF-Token"), "C".repeat(43));
      assert.equal(init.headers.get("X-Econovaria-Game-Id"), "game-one");
      assert.equal(init.headers.get("X-Idempotency-Key"), "retained-key");
      assert.equal(init.headers.get("X-Request-Id"), "retained-key");
      assert.equal(init.headers.has("authorization"), false); assert.equal(init.headers.has("cookie"), false);
      assert.equal(init.credentials, "include"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
    }
  }
});

test("REF-012 integration preserves anonymous expired missing-CSRF and missing-game denials", async () => {
  for (const [option, status] of [["anonymous", 401], ["expired", 401], ["missingCsrf", 401], ["noGame", 409]]) {
    const h = await authenticatedFixture({ [option]: true, pending: true });
    const response = await h.adapter.request(SETTINGS, { method: "PATCH", body: "{}" });
    assert.equal(response.status, status, option); assert.equal(h.calls.length, 0, option); assert.equal(h.events.length, 0, option);
  }
});

test("REF-012 integration preserves dependency and permission failure without acknowledgement", async () => {
  for (const failure of ["network", "permission"]) {
    const h = await authenticatedFixture({ pending: true, reply: () => {
      if (failure === "network") throw new Error("synthetic network outage");
      return new Response('{"message":"synthetic permission denial"}', { status: 403 });
    } });
    const response = await h.adapter.request(SETTINGS, { method: "PATCH", body: "{}" });
    assert.equal(response.status, failure === "network" ? 503 : 403);
    assert.equal(h.calls.length, 1); assert.equal(h.events.length, 0);
  }
});
