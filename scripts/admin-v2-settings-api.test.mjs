import assert from "node:assert/strict";
import test from "node:test";

import { createSettingsApi } from "../admin/v2/src/routes/settings/SettingsApi.js";
import {
  createSettingsController,
  normalizeSettingsReadModel,
  validateSettingsDraft,
} from "../admin/v2/src/routes/settings/SettingsController.js";
import { getAdminNavigationRoute } from "../admin/v2/src/core/navigation-registry.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_ID = "20000000-0000-4000-8000-000000000002";
const KEY = "admin.settings.save.30000000-0000-4000-8000-000000000003.1";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

function readPayload(overrides = {}) {
  return {
    data: {
      difficultyBasePreset: "moderate",
      priceMultiplier: 1,
      incomeMultiplier: 1.1,
      shockFrequency: 0.9,
      shockSeverity: 1.2,
      recoverySupport: 1,
      tradeMultiplier: 1,
      attendanceWindow: {
        timezone: "Asia/Seoul",
        presentRewardAmount: 5,
        lateRewardAmount: 2,
        currencyMode: "player_country",
        applyDifficultyIncomeModifier: true,
        currencyCode: "ECO",
        serverCredential: "never-render-this",
        ownerSessionId: PRIVATE_ID,
      },
      configLastSaved: "2026-08-07T07:30:00.000Z",
      internalOwnerId: PRIVATE_ID,
      ...overrides,
    },
  };
}

function validDraft() {
  return {
    difficultyPreset: "moderate",
    difficultyBase: {
      difficultyPreset: "moderate",
      priceMultiplier: 1,
      incomeMultiplier: 1.1,
      shockFrequency: 0.9,
      shockSeverity: 1.2,
      recoverySupport: 1,
      tradeMultiplier: 1,
    },
    priceMultiplier: 1,
    incomeMultiplier: 1.1,
    shockFrequency: 0.9,
    shockSeverity: 1.2,
    recoverySupport: 1,
    tradeMultiplier: 1,
    attendanceWindowBase: {
      preservedServerField: "keep",
      timezone: "Asia/Seoul",
      currencyMode: "player_country",
      applyDifficultyIncomeModifier: true,
      currencyCode: "ECO",
    },
    attendanceWindow: {
      presentRewardAmount: 5,
      lateRewardAmount: 2,
    },
  };
}

test("Settings is the native V2 route with settings.manage authority", () => {
  const route = getAdminNavigationRoute("settings");
  assert.equal(route.migration, "v2");
  assert.deepEqual(route.permission.allOf, ["settings.manage"]);
  assert.equal(route.legacyDestination, null);
});

test("Settings API uses exact authoritative read and idempotent PATCH contracts", async () => {
  const calls = [];
  const api = createSettingsApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (init.method === "PATCH") {
        return jsonResponse({ ok: true, settings: { difficultyPreset: "moderate" } });
      }
      return jsonResponse(readPayload());
    },
    timeoutMs: 1_000,
  });

  await api.readSettings({ gameId: GAME_ID });
  const canonicalSettings = validateSettingsDraft(validDraft()).settings;
  await api.updateSettings({ gameId: GAME_ID, settings: canonicalSettings, idempotencyKey: KEY });

  assert.equal(calls[0].url, `/api/admin/games/${GAME_ID}/settings`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, `/api/admin/games/${GAME_ID}/settings`);
  assert.equal(calls[1].init.method, "PATCH");
  assert.equal(calls[1].init.headers["Idempotency-Key"], KEY);
  assert.equal(calls[1].init.credentials, "include");
  assert.equal("Authorization" in calls[1].init.headers, false);
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual(Object.keys(body), ["settings"]);
  assert.equal(body.settings.attendanceWindow.preservedServerField, "keep");
  assert.equal(body.settings.difficultyBase, undefined);
  assert.equal(body.settings.attendanceWindowBase, undefined);
});

test("Settings model exposes only supported presentation fields and no private IDs", () => {
  const model = normalizeSettingsReadModel(readPayload());
  assert.equal(model.difficultyPreset, "moderate");
  assert.equal(model.attendanceWindow.timezone, "Asia/Seoul");
  assert.equal(model.attendanceWindow.currencyMode, "player_country");
  assert.equal(JSON.stringify(model).includes(PRIVATE_ID), false);
  assert.equal(JSON.stringify(model).includes("never-render-this"), false);
  assert.equal(/secret|service_role|environment|credential/i.test(JSON.stringify(model)), false);
});

test("Settings model bounds long presentation values while preserving safe Unicode", () => {
  const model = normalizeSettingsReadModel(readPayload({
    configLastSaved: "x".repeat(500),
    attendanceWindow: {
      timezone: "Asia/Seoul",
      presentRewardAmount: 5,
      lateRewardAmount: 2,
      currencyMode: "player_country",
      applyDifficultyIncomeModifier: true,
      currencyCode: "ECO",
      safeNote: "설정".repeat(40),
      oversizedNote: "x".repeat(600),
    },
  }));
  assert.equal(model.configLastSaved.length, 80);
  assert.match(model.attendanceWindow.safeNote, /설정/);
  assert.equal(model.attendanceWindow.oversizedNote, undefined);
});

test("Settings validation enforces authoritative modifier and attendance boundaries", () => {
  const valid = validateSettingsDraft(validDraft());
  assert.equal(valid.ok, true);
  assert.equal(valid.settings.attendanceWindow.preservedServerField, "keep");
  assert.equal(valid.settings.attendanceWindow.currencyMode, "player_country");
  assert.equal(valid.settings.attendanceWindow.applyDifficultyIncomeModifier, true);
  assert.equal(valid.settings.difficultyPreset, undefined);
  assert.equal(valid.settings.priceMultiplier, undefined);

  const presetChange = validateSettingsDraft({ ...validDraft(), difficultyPreset: "hard" });
  assert.equal(presetChange.settings.difficultyPreset, "hard");
  assert.equal(presetChange.settings.priceMultiplier, undefined);

  const customChange = validateSettingsDraft({ ...validDraft(), priceMultiplier: 1.25 });
  assert.equal(customChange.settings.difficultyPreset, undefined);
  assert.equal(customChange.settings.priceMultiplier, 1.25);
  assert.equal(customChange.settings.incomeMultiplier, 1.1);

  const invalidPreset = validateSettingsDraft({ ...validDraft(), difficultyPreset: "invented-preset" });
  assert.equal(invalidPreset.ok, false);
  assert.equal(invalidPreset.errors.some(({ field }) => field === "difficultyPreset"), true);

  const invalid = validateSettingsDraft({
    ...validDraft(),
    priceMultiplier: 2.1,
    shockSeverity: 0.49,
    attendanceWindow: {
      ...validDraft().attendanceWindow,
      presentRewardAmount: -1,
      lateRewardAmount: 1000.01,
    },
  });
  assert.equal(invalid.ok, false);
  assert.deepEqual(new Set(invalid.errors.map(({ field }) => field)), new Set([
    "priceMultiplier",
    "shockSeverity",
    "presentRewardAmount",
    "lateRewardAmount",
  ]));
});

test("Settings controller fails closed on permission and retains idempotency across retryable failure", async () => {
  let allowed = false;
  let readCount = 0;
  const keys = [];
  let mutationCount = 0;
  const api = {
    async readSettings() { readCount += 1; return readPayload(); },
    cancelSettingsRequest() {},
    async updateSettings(input) {
      keys.push(input.idempotencyKey);
      mutationCount += 1;
      if (mutationCount === 1) {
        const error = new Error("retryable");
        error.code = "SERVICE_UNAVAILABLE";
        error.status = 503;
        error.retryable = true;
        throw error;
      }
      return { ok: true, settings: { difficultyPreset: "moderate" } };
    },
  };
  const controller = createSettingsController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => allowed,
    onChange() {},
    notify() {},
    cryptoObject: { randomUUID: () => "30000000-0000-4000-8000-000000000003" },
  });

  await controller.load();
  assert.equal(readCount, 0);
  const denied = await controller.save(validDraft());
  assert.equal(denied.ok, false);

  allowed = true;
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  const first = await controller.save(validDraft());
  const second = await controller.save(validDraft());
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(keys[0], keys[1]);
  controller.destroy();
});

test("Settings controller preserves last confirmed values as stale when refresh fails", async () => {
  let fail = false;
  const api = {
    async readSettings() {
      if (fail) {
        const error = new Error("upstream");
        error.code = "SERVICE_UNAVAILABLE";
        error.status = 503;
        error.retryable = true;
        throw error;
      }
      return readPayload();
    },
    cancelSettingsRequest() {},
    async updateSettings() { return { ok: true, settings: {} }; },
  };
  const controller = createSettingsController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => true,
  });
  await controller.load();
  fail = true;
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data.difficultyPreset, "moderate");
  const blocked = await controller.save(validDraft());
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, "CONFLICT");
  controller.destroy();
});
