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
  "../admin/attendance-reward-settings-route-bridge-v2.js",
  import.meta.url,
);

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

// REF-012: execute the retained bridge before changing its request boundary.
// These synthetic transport fixtures do not certify DOM lifecycle or authentication.
async function attendanceBridgeFixture(options = {}) {
  const calls = [], events = [], cacheReads = [];
  const state = {
    mounted: true, activeGameId: "game-one", pending: false, draft: {},
    fields: { presentRewardAmount: "7.25", lateRewardAmount: "2.5", currencyMode: "fixed", applyDifficultyIncomeModifier: "false" },
    ...options,
  };
  const delegatedFetch = async (input, init) => {
    calls.push({ input, init });
    const response = options.reply
      ? await options.reply(input, init)
      : new Response("{}", { status: 200 });
    const clone = response.clone.bind(response);
    response.clone = () => {
      const copy = clone(), json = copy.json.bind(copy);
      copy.json = () => { const read = json(); cacheReads.push(read); return read; };
      return copy;
    };
    return response;
  };
  const window = {
    fetch: delegatedFetch,
    location: { href: "https://admin.example.test/admin/index.html" },
    sessionStorage: { getItem: () => null },
    EconovariaAttendanceRewardSettings: {
      getGameId: () => state.activeGameId,
      getDraftWindow: () => state.draft,
    },
    EconovariaAttendanceRewardSaveController: { combinedCoreSavePending: () => state.pending },
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-admin-attendance-reward-settings]") return state.mounted ? {} : null;
      const name = selector.match(/^\[data-attendance-reward-field="([^"]+)"\]$/)?.[1];
      return Object.hasOwn(state.fields, name) ? { value: state.fields[name] } : null;
    },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const source = await readFile(ATTENDANCE_SETTINGS_BRIDGE, "utf8");
  vm.runInNewContext(source, { window, document, Request, Headers, URL, URLSearchParams, CustomEvent }, {
    filename: "attendance-reward-settings-route-bridge-v2.js",
  });
  return {
    window, state, calls, events, delegatedFetch,
    current: (gameId) => window.EconovariaAttendanceRewardSettingsRouteBridge.getCurrentAttendanceWindow(gameId),
    async settleCache() { await Promise.allSettled(cacheReads); await Promise.resolve(); },
  };
}

const attendancePlain = (value) => JSON.parse(JSON.stringify(value));
const attendanceBody = (fixture, index = 0) => JSON.parse(fixture.calls[index].init.body);

test("REF-012 baseline installs one fetch wrapper and a frozen read API without issuing requests", async () => {
  const h = await attendanceBridgeFixture();
  assert.notEqual(h.window.fetch, h.delegatedFetch); // Baseline only; replacement must preserve fetch identity.
  assert.equal(Object.isFrozen(h.window.EconovariaAttendanceRewardSettingsRouteBridge), true);
  assert.equal(h.calls.length, 0);
  assert.equal(h.events.length, 0);
  h.state.activeGameId = "";
  assert.equal(h.current(), null);
});

test("REF-012 unrelated, unmounted, wrong-game and unsupported requests delegate unchanged", async () => {
  for (const item of [
    { path: "/api/admin/games/game-one/players", method: "PATCH" },
    { path: "/api/admin/games/game-one/settings/", method: "PATCH" },
    { path: "/api/admin/games/game-one/settings/difficulty/extra", method: "PATCH" },
    { path: "/api/admin/games/game-two/settings", method: "PATCH" },
    { path: "/api/admin/games/game-one/settings", method: "DELETE" },
    { path: "/api/admin/games/game-one/settings", method: "PATCH", mounted: false },
  ]) {
    const h = await attendanceBridgeFixture({ mounted: item.mounted ?? true, pending: true });
    const init = { method: item.method, body: "not-json", headers: { "X-Request-Id": "synthetic-request" } };
    const response = await h.window.fetch(item.path, init);
    assert.equal(response.ok, true);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].input, item.path);
    assert.equal(h.calls[0].init, init);
    assert.equal(h.events.length, 0);
  }
});

test("REF-012 matched POST PUT PATCH normalize the draft with one delegated mutation", async () => {
  for (const method of ["POST", "PUT", "PATCH"]) {
    for (const suffix of ["", "/difficulty"]) {
      const h = await attendanceBridgeFixture({ draft: { currencyCode: " krw " } });
      await h.window.fetch(`/api/admin/games/game-one/settings${suffix}`, { method, body: '{"incomeMultiplier":1.5}' });
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].init.method, method);
      assert.deepEqual(attendanceBody(h), {
        incomeMultiplier: 1.5,
        attendanceWindow: { timezone: "Asia/Seoul", presentRewardAmount: 7.25, lateRewardAmount: 2.5,
          currencyMode: "fixed", applyDifficultyIncomeModifier: false, currencyCode: "KRW" },
      });
      assert.equal(h.calls[0].init.headers.get("Content-Type"), "application/json");
      assert.equal(h.events.length, 0);
    }
  }
});

test("REF-012 supplied windows preserve exact values, enclosing payload and casing", async () => {
  const supplied = { timezone: "Etc/UTC", presentRewardAmount: 3, currencyCode: "usd", customPolicy: "retain" };
  for (const container of [null, "settings", "payload"]) {
    const settings = { attendanceWindow: supplied, incomeMultiplier: 1.25 };
    const source = container ? { [container]: settings, trace: "retain" } : { ...settings, trace: "retain" };
    const h = await attendanceBridgeFixture();
    await h.window.fetch("/api/admin/games/game-one/settings", { method: "PATCH", body: JSON.stringify(source) });
    assert.deepEqual(attendanceBody(h), source);
    assert.deepEqual(supplied, { timezone: "Etc/UTC", presentRewardAmount: 3, currencyCode: "usd", customPolicy: "retain" });
  }
});

test("REF-012 attendance selection preserves settings then payload then root precedence", async () => {
  for (const selected of ["settings", "payload", "root"]) {
    const h = await attendanceBridgeFixture();
    const source = { attendanceWindow: { selected: "root" } };
    if (selected !== "root") source.payload = { attendanceWindow: { selected: "payload" } };
    if (selected === "settings") source.settings = { attendanceWindow: { selected: "settings" } };
    await h.window.fetch("/api/admin/games/game-one/settings", { method: "PATCH", body: JSON.stringify(source) });
    assert.deepEqual(attendanceBody(h), source);
  }
  const h = await attendanceBridgeFixture();
  await h.window.fetch("/api/admin/games/game-one/settings", {
    method: "PATCH", body: JSON.stringify({ settings: { attendanceWindow: {} }, attendanceWindow: { ignored: true } }),
  });
  assert.equal(attendanceBody(h).settings.attendanceWindow.presentRewardAmount, 7.25);
  assert.deepEqual(attendanceBody(h).attendanceWindow, { ignored: true });
});

test("REF-012 malformed, array, form and plain-object bodies retain baseline normalization", async () => {
  for (const body of ["{bad-json", "[]", new URLSearchParams({ incomeMultiplier: "1.5" }), { incomeMultiplier: 1.5 }]) {
    const h = await attendanceBridgeFixture();
    await h.window.fetch("/api/admin/games/game-one/settings", { method: "PATCH", body });
    const result = attendanceBody(h);
    assert.equal(result.attendanceWindow.presentRewardAmount, 7.25);
    assert.equal(result.incomeMultiplier, body instanceof URLSearchParams ? "1.5" : typeof body === "object" ? 1.5 : undefined);
    assert.equal(h.calls.length, 1);
  }
});

test("REF-012 Request input remains unconsumed and preserves transport options and retry identity", async () => {
  const controller = new AbortController();
  const headers = new Headers({ "Content-Type": "text/plain", "X-Econovaria-CSRF-Token": "synthetic-csrf",
    "X-Idempotency-Key": "synthetic-retry-key", "X-Request-Id": "synthetic-retry-key" });
  const original = { attendanceWindow: { currencyCode: "USD", presentRewardAmount: 4 }, idempotencyKey: "synthetic-retry-key" };
  const request = new Request("https://admin.example.test/api/admin/games/game-one/settings/difficulty", {
    method: "PUT", headers, body: JSON.stringify(original), credentials: "include", cache: "no-store",
    redirect: "manual", referrer: "https://admin.example.test/admin/", referrerPolicy: "same-origin",
    mode: "same-origin", signal: controller.signal,
  });
  const h = await attendanceBridgeFixture();
  await h.window.fetch(request);
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(await request.json(), original);
  assert.deepEqual(attendanceBody(h), original);
  const outgoing = h.calls[0].init;
  for (const key of ["credentials", "cache", "redirect", "referrer", "referrerPolicy", "mode", "signal"]) {
    assert.equal(outgoing[key], request[key]);
  }
  for (const key of ["X-Econovaria-CSRF-Token", "X-Idempotency-Key", "X-Request-Id"]) {
    assert.equal(outgoing.headers.get(key), request.headers.get(key));
  }
  assert.equal(request.headers.get("Content-Type"), "text/plain");
  assert.equal(outgoing.headers.get("Content-Type"), "application/json");
  assert.notEqual(outgoing.headers, request.headers);
  assert.equal(h.calls.length, 1);
});

test("REF-012 init overrides preserve exact signal, headers and body identity", async () => {
  const h = await attendanceBridgeFixture();
  const request = new Request("https://admin.example.test/api/admin/games/game-one/settings", { method: "GET" });
  const signal = new AbortController().signal;
  const init = { method: "PATCH", headers: new Headers({ "X-Idempotency-Key": "override-key" }),
    body: '{"attendanceWindow":{"currencyCode":"USD"}}', signal, credentials: "include", cache: "reload" };
  await h.window.fetch(request, init);
  assert.equal(h.calls[0].init.signal, signal);
  assert.equal(h.calls[0].init.credentials, "include");
  assert.equal(h.calls[0].init.cache, "reload");
  assert.equal(h.calls[0].init.headers.get("X-Idempotency-Key"), "override-key");
  assert.deepEqual(attendanceBody(h), JSON.parse(init.body));
  assert.equal(init.headers.has("Content-Type"), false);
  assert.equal(request.bodyUsed, false);
});

test("REF-012 successful read envelopes cache per-game windows without consuming responses", async () => {
  const window = { timezone: "Etc/UTC", currencyCode: "usd", presentRewardAmount: 11, lateRewardAmount: 2, retainedField: "keep" };
  for (const payload of [
    { settings: { attendanceWindow: window } }, { data: { settings: { attendanceWindow: window } } },
    { data: { attendance_window: window } }, { settings: { settings: { attendanceWindow: window } } },
  ]) {
    for (const method of ["GET", "HEAD"]) {
      const reply = new Response(JSON.stringify(payload));
      const h = await attendanceBridgeFixture({ fields: {}, reply: () => reply });
      const response = await h.window.fetch("/api/admin/games/game-one/settings", { method });
      await h.settleCache();
      assert.equal(response, reply);
      assert.equal(response.bodyUsed, false);
      assert.equal(h.current("game-one").retainedField, "keep");
      assert.equal(h.current("game-one").presentRewardAmount, 11);
      assert.equal(h.current("game-one").timezone, "Etc/UTC");
      assert.equal(h.current("game-one").currencyCode, "USD");
      assert.equal(h.current("game-two").retainedField, undefined);
      const copy = h.current("game-one"); copy.timezone = "changed";
      assert.equal(h.current("game-one").timezone, "Etc/UTC");
      h.state.draft = { currencyCode: " eur " };
      assert.equal(h.current("game-one").currencyCode, "EUR");
      assert.deepEqual(await response.json(), payload);
      assert.equal(h.events.length, 0);
    }
  }
});

test("REF-012 failed or malformed reads leave cache empty and still return the response", async () => {
  for (const reply of [new Response("{}", { status: 503 }), new Response("not-json"), new Response('{"settings":{"attendanceWindow":[]}}')]) {
    const h = await attendanceBridgeFixture({ fields: {}, reply: () => reply });
    assert.equal(await h.window.fetch("/api/admin/games/game-one/settings"), reply);
    await h.settleCache();
    assert.equal(h.current().timezone, "Asia/Seoul");
    assert.equal(h.current().presentRewardAmount, 1);
    assert.equal(h.calls.length, 1);
    assert.equal(h.events.length, 0);
  }
});

test("REF-012 successful combined mutation emits exactly one existing lifecycle event", async () => {
  const supplied = { timezone: "Etc/UTC", presentRewardAmount: 5, lateRewardAmount: 1, currencyCode: "USD", retained: "value" };
  for (const pending of [false, true]) {
    const reply = new Response("{}", { status: 200 });
    const h = await attendanceBridgeFixture({ pending, reply: () => reply });
    const result = await h.window.fetch("/api/admin/games/game-one/settings", {
      method: "PATCH", body: JSON.stringify({ attendanceWindow: supplied }),
    });
    assert.equal(result, reply);
    assert.equal(result.bodyUsed, false);
    assert.equal(h.calls.length, 1);
    assert.equal(h.events.length, pending ? 1 : 0);
    assert.equal(h.current().retained, "value");
    if (pending) {
      assert.equal(h.events[0].type, "econovaria:attendance-reward-saved");
      assert.deepEqual(attendancePlain(h.events[0].detail), { gameId: "game-one", attendanceWindow: supplied, combined: true });
    }
  }
});

test("REF-012 denied conflict and dependency responses never acknowledge or retry writes", async () => {
  for (const status of [400, 403, 409, 503]) {
    const reply = new Response('{"message":"synthetic denial"}', { status });
    const h = await attendanceBridgeFixture({ pending: true, reply: () => reply });
    assert.equal(await h.window.fetch("/api/admin/games/game-one/settings", {
      method: "PATCH", body: '{"attendanceWindow":{"retained":"must-not-cache"}}',
    }), reply);
    assert.equal(h.calls.length, 1);
    assert.equal(h.events.length, 0);
    assert.equal(h.current().retained, undefined);
    assert.equal(reply.bodyUsed, false);
  }
});

test("REF-012 transport rejection propagates unchanged without retry or success event", async () => {
  const failure = new Error("synthetic offline");
  const h = await attendanceBridgeFixture({ pending: true, reply: () => { throw failure; } });
  await assert.rejects(h.window.fetch("/api/admin/games/game-one/settings", {
    method: "PATCH", body: "{}",
  }), (error) => error === failure);
  assert.equal(h.calls.length, 1);
  assert.equal(h.events.length, 0);
});
