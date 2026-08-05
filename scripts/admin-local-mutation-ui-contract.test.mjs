import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
