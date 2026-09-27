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
  const adapter = await readFile(ATTENDANCE_REQUEST_ADAPTER, "utf8");

  assert.match(createAdapter, /stockMode === "Country"/);
  assert.match(createAdapter, /data-admin-terminal-store-country-stock/);
  assert.match(createAdapter, /Math\.trunc\(countryStockQuantity\)/);
  assert.match(terminal, /payload: effective\.payload/);
  assert.match(adapter, /suppliedAttendanceWindow/);
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

// REF-012: the source-owned adapter replaces the Attendance-specific global fetch wrapper.
async function attendanceAdapterFixture(options = {}) {
  const events = [];
  const state = {
    mounted: true,
    activeGameId: "game-one",
    pending: false,
    draft: {},
    fields: {
      presentRewardAmount: "7.25",
      lateRewardAmount: "2.5",
      currencyMode: "fixed",
      applyDifficultyIncomeModifier: "false",
    },
    ...options,
  };
  const window = {
    fetch: options.fetch || (async () => new Response("{}", { status: 200 })),
    location: { href: "https://admin.example.test/admin/index.html" },
    sessionStorage: { getItem: () => null },
    EconovariaAttendanceRewardSettings: {
      getGameId: () => state.activeGameId,
      getDraftWindow: () => state.draft,
    },
    EconovariaAttendanceRewardSaveController: {
      combinedCoreSavePending: () => state.pending,
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === "[data-admin-attendance-reward-settings]") return state.mounted ? {} : null;
      const name = selector.match(/^\\[data-attendance-reward-field="([^"]+)"\\]$/)?.[1];
      return Object.hasOwn(state.fields, name) ? { value: state.fields[name] } : null;
    },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const source = await readFile(ATTENDANCE_REQUEST_ADAPTER, "utf8");
  const fetchIdentity = window.fetch;
  vm.runInNewContext(source, {
    window, document, Request, Response, Headers, URL, URLSearchParams, CustomEvent,
  }, { filename: "attendance-reward-request-adapter.js" });
  return { window, state, events, fetchIdentity, adapter: window.EconovariaAttendanceRewardRequestAdapter };
}

test("REF-012 adapter does not replace global fetch and retains the generated identity read", async () => {
  const h = await attendanceAdapterFixture();
  assert.equal(h.window.fetch, h.fetchIdentity);
  assert.equal(Object.isFrozen(h.adapter), true);
  assert.equal(typeof h.adapter.prepareRequest, "function");
  assert.equal(typeof h.adapter.observeResponse, "function");
  assert.equal(typeof h.adapter.request, "function");
  assert.equal(
    h.window.EconovariaAttendanceRewardSettingsRouteBridge.getCurrentAttendanceWindow,
    h.adapter.getCurrentAttendanceWindow,
  );
});

test("REF-012 adapter ignores unrelated, unmounted, wrong-game and unsupported requests", async () => {
  for (const item of [
    { path: "/api/admin/games/game-one/players", method: "PATCH" },
    { path: "/api/admin/games/game-one/settings/", method: "PATCH" },
    { path: "/api/admin/games/game-two/settings", method: "PATCH" },
    { path: "/api/admin/games/game-one/settings", method: "DELETE" },
    { path: "/api/admin/games/game-one/settings", method: "PATCH", mounted: false },
  ]) {
    const h = await attendanceAdapterFixture({ mounted: item.mounted ?? true });
    const request = new Request(new URL(item.path, h.window.location.href), {
      method: item.method,
      body: ["GET", "HEAD"].includes(item.method) ? undefined : "{}",
    });
    const prepared = await h.adapter.prepareRequest(request);
    assert.equal(prepared.request, request);
    assert.equal(prepared.metadata, null);
    assert.equal(request.bodyUsed, false);
  }
});

test("REF-012 adapter augments POST PUT PATCH exactly once while preserving supplied windows", async () => {
  for (const method of ["POST", "PUT", "PATCH"]) {
    const h = await attendanceAdapterFixture({ draft: { currencyCode: " krw " } });
    const request = new Request("https://admin.example.test/api/admin/games/game-one/settings/difficulty", {
      method,
      headers: { "X-Idempotency-Key": "stable-key", "X-Request-Id": "stable-key" },
      body: JSON.stringify({ incomeMultiplier: 1.5 }),
    });
    const prepared = await h.adapter.prepareRequest(request);
    const body = await prepared.request.json();
    assert.equal(request.bodyUsed, false);
    assert.equal(body.incomeMultiplier, 1.5);
    assert.deepEqual(JSON.parse(JSON.stringify(body.attendanceWindow)), {
      timezone: "Asia/Seoul",
      presentRewardAmount: 7.25,
      lateRewardAmount: 2.5,
      currencyMode: "fixed",
      applyDifficultyIncomeModifier: false,
      currencyCode: "KRW",
    });
    assert.equal(prepared.request.headers.get("X-Idempotency-Key"), "stable-key");
    assert.equal(prepared.request.headers.get("X-Request-Id"), "stable-key");
    assert.equal(prepared.request.headers.get("Content-Type"), "application/json");
    assert.equal(prepared.metadata.gameId, "game-one");
  }

  const h = await attendanceAdapterFixture();
  const supplied = { timezone: "Etc/UTC", presentRewardAmount: 3, currencyCode: "usd", customPolicy: "retain" };
  const request = new Request("https://admin.example.test/api/admin/games/game-one/settings", {
    method: "PATCH",
    body: JSON.stringify({ settings: { attendanceWindow: supplied }, trace: "retain" }),
  });
  const prepared = await h.adapter.prepareRequest(request);
  assert.deepEqual(JSON.parse(JSON.stringify(await prepared.request.json())), {
    settings: { attendanceWindow: supplied },
    trace: "retain",
  });
});

test("REF-012 adapter records successful reads without consuming the authoritative response", async () => {
  const h = await attendanceAdapterFixture({ fields: {} });
  const request = new Request("https://admin.example.test/api/admin/games/game-one/settings");
  const prepared = await h.adapter.prepareRequest(request);
  assert.equal(prepared.request, request);
  assert.equal(prepared.metadata.method, "GET");
  const payload = { data: { settings: { attendanceWindow: {
    timezone: "Etc/UTC", presentRewardAmount: 11, lateRewardAmount: 2, currencyCode: "USD", retained: "yes",
  } } } };
  const response = new Response(JSON.stringify(payload));
  assert.equal(await h.adapter.observeResponse(response, prepared.metadata), response);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(response.bodyUsed, false);
  assert.equal(h.adapter.getCurrentAttendanceWindow("game-one").retained, "yes");
  assert.deepEqual(await response.json(), payload);
});

test("REF-012 adapter acknowledges one successful combined save and never acknowledges denial", async () => {
  for (const status of [200, 400, 403, 409, 503]) {
    const h = await attendanceAdapterFixture({ pending: true });
    const request = new Request("https://admin.example.test/api/admin/games/game-one/settings", {
      method: "PATCH",
      body: JSON.stringify({ attendanceWindow: { presentRewardAmount: 5, currencyCode: "USD" } }),
    });
    const prepared = await h.adapter.prepareRequest(request);
    const response = new Response("{}", { status });
    assert.equal(await h.adapter.observeResponse(response, prepared.metadata), response);
    assert.equal(h.events.length, status === 200 ? 1 : 0);
    if (status === 200) {
      assert.equal(h.events[0].type, "econovaria:attendance-reward-saved");
      assert.equal(h.events[0].detail.combined, true);
    }
  }
});

test("REF-012 Admin auth owns adapter preparation and response observation", async () => {
  const source = await readFile(ADMIN_AUTH, "utf8");
  assert.match(source, /EconovariaAttendanceRewardRequestAdapter/);
  assert.match(source, /await attendanceAdapter\.prepareRequest\(request\)/);
  assert.match(source, /attendanceAdapter\.observeResponse\(response, attendanceMetadata\)/);
  assert.match(source, /request: econovariaAdminRequest/);
  assert.match(source, /window\.fetch = econovariaAdminFetch/);
  assert.doesNotMatch(source, /attendance-reward-settings-route-bridge-v2/);
});

test("REF-012 Attendance controller explicitly invokes the adapter for read and write", async () => {
  const source = await readFile(ATTENDANCE_SETTINGS, "utf8");
  assert.match(source, /function attendanceRequest\(input, init\)/);
  assert.match(source, /EconovariaAttendanceRewardRequestAdapter/);
  assert.match(source, /adapter\.request\(input, init\)/);
  assert.equal((source.match(/await attendanceRequest\(/g) || []).length, 2);
});

test("REF-012 bootstrap loads only the explicit adapter and legacy bridge has no active reference", async () => {
  const source = await readFile(ADMIN_BOOTSTRAP, "utf8");
  assert.match(source, /\.\/attendance-reward-request-adapter\.js/);
  assert.doesNotMatch(source, /attendance-reward-settings-route-bridge-v2\.js/);
  const adapter = await readFile(ATTENDANCE_REQUEST_ADAPTER, "utf8");
  assert.doesNotMatch(adapter, /window\.fetch\s*=/);
  assert.doesNotMatch(adapter, /delegatedFetch/);
});
