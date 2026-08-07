import assert from "node:assert/strict";
import test from "node:test";

import { createCraftingApiClient } from "../admin/v2/src/routes/crafting/CraftingApi.js";
import {
  createCraftingController,
  normalizeCraftingReadModel,
} from "../admin/v2/src/routes/crafting/CraftingController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_ID = "20000000-0000-4000-8000-000000000002";
const JOB_KEY = `cft_${"a".repeat(32)}`;
const SECOND_JOB_KEY = `cft_${"b".repeat(32)}`;

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function oversightData(overrides = {}) {
  return {
    schemaVersion: 1,
    pack: {
      packKey: "econovaria.physical-economy.v1",
      contentVersion: "1.0.0",
      contentDigest: "digest-not-presented",
      sourceCommit: "commit-not-presented",
      status: "active",
      activatedAt: "2026-08-07T00:00:00.000Z",
      durabilityEnabled: false,
      repairEnabled: false,
    },
    jobs: [],
    effects: [],
    supply: [],
    invariants: {
      negativeOwned: 0,
      negativeReserved: 0,
      reservedAboveOwned: 0,
      reservationProjectionMismatch: 0,
      duplicateOutputGrants: 0,
      repairEnabled: false,
      durabilityEnabled: false,
    },
    ...overrides,
  };
}

test("Crafting read model preserves supported oversight fields without inventing recipe or Inventory ownership data", () => {
  const longKoreanName = `초정밀 복합소재 제조법 ${"매우긴이름".repeat(35)}`;
  const model = normalizeCraftingReadModel({
    data: oversightData({
      jobs: [
        {
          jobKey: JOB_KEY,
          playerId: "학생 김민준",
          recipeKey: "advanced_composite",
          recipeName: longKoreanName,
          quantity: 2,
          status: "in_progress",
          difficulty: "advanced",
          countryCode: "LUM",
          qualityBand: "standard",
          startedAt: "2026-08-07T01:00:00.000Z",
          completesAt: "2026-08-07T01:05:00.000Z",
          recoveryVersion: 0,
        },
        {
          jobKey: SECOND_JOB_KEY,
          playerId: PRIVATE_ID,
          recipeKey: "advanced_composite",
          recipeName: "완성된 복합소재",
          quantity: 1,
          status: "claimed",
          qualityBand: "high",
          claimedAt: "2026-08-07T02:00:00.000Z",
        },
      ],
      effects: [{
        effectCode: "mobility_boost",
        handlerCode: "private_server_handler",
        kind: "temporary",
        scope: "player",
        durationSeconds: 900,
        stackingRule: "replace",
        maxStacks: 1,
        cooldownSeconds: 120,
        enabled: true,
        summary: "Temporary logistics mobility effect",
      }],
      supply: [{
        itemKey: "advanced_composite",
        countryCode: "LUM",
        scarcityBand: "constrained",
        availableQuantity: 4,
        reservedQuantity: 6,
        eventMultiplier: 1.25,
        routeMultiplier: 0.8,
        sourceEventKey: "event.route-disruption.001",
        expiresAt: "2026-08-08T00:00:00.000Z",
        version: 3,
      }],
      invariants: {
        negativeOwned: 0,
        negativeReserved: 0,
        reservedAboveOwned: 1,
        reservationProjectionMismatch: 0,
        duplicateOutputGrants: 0,
        repairEnabled: false,
        durabilityEnabled: false,
      },
    }),
  });

  assert.equal(model.jobs.length, 2);
  assert.equal(model.jobs[0].recipeName.startsWith("초정밀"), true);
  assert.ok(model.jobs[0].recipeName.length <= 240);
  assert.equal(model.jobs[1].playerLabel, "Player");
  assert.equal(model.recipes.length, 1);
  assert.equal(model.recipes[0].jobCount, 2);
  assert.equal(model.summary.activeJobCount, 1);
  assert.equal(model.summary.claimedJobCount, 1);
  assert.equal(model.summary.constrainedSupplyCount, 1);
  assert.equal(model.summary.invariantViolations, 1);
  assert.equal(model.supply[0].availableQuantity, 4);
  assert.equal(model.supply[0].reservedQuantity, 6);
  assert.equal("handlerCode" in model.effects[0], false);
  assert.equal("inputs" in model.recipes[0], false);
  assert.equal("outputs" in model.recipes[0], false);
  assert.equal("holdings" in model, false);
  assert.equal(JSON.stringify(model).includes(PRIVATE_ID), false);
  assert.equal(JSON.stringify(model).includes("private_server_handler"), false);
  assert.ok(Object.isFrozen(model));
});

test("Crafting read model handles an authoritative empty oversight response", () => {
  const model = normalizeCraftingReadModel({ data: oversightData({ pack: {} }) });
  assert.equal(model.isEmpty, true);
  assert.deepEqual(model.jobs, []);
  assert.deepEqual(model.recipes, []);
  assert.deepEqual(model.supply, []);
  assert.deepEqual(model.effects, []);
});

test("Crafting read model supports the authoritative 250-job ceiling with many observed recipes", () => {
  const jobs = Array.from({ length: 250 }, (_unused, index) => ({
    jobKey: `cft_${index.toString(16).padStart(32, "0")}`,
    playerId: `Player ${index + 1}`,
    recipeKey: `recipe_${index + 1}`,
    recipeName: `대량 제조 레시피 ${index + 1}`,
    quantity: 1,
    status: index % 2 === 0 ? "completed" : "in_progress",
    countryCode: "LUM",
    qualityBand: "standard",
  }));
  const model = normalizeCraftingReadModel({ data: oversightData({ jobs }) });

  assert.equal(model.jobs.length, 250);
  assert.equal(model.recipes.length, 250);
  assert.equal(model.summary.observedRecipeCount, 250);
  assert.equal(model.summary.activeJobCount, 125);
  assert.equal(model.recipes.every((recipe) => !("inputs" in recipe) && !("outputs" in recipe)), true);
});

test("Crafting API reads and mutates only the existing Admin Crafting routes", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/oversight")) return jsonResponse({ data: oversightData() });
    return jsonResponse({ data: { committed: true } });
  };
  const client = createCraftingApiClient({ fetchImpl, timeoutMs: 1_000 });

  await client.readCrafting({ gameId: GAME_ID, status: "failed", limit: 25 });
  await client.recoverCraftingJob({
    gameId: GAME_ID,
    jobKey: JOB_KEY,
    outcome: "requeue",
    reason: "Retry after authoritative reservation review",
    idempotencyKey: "admin.crafting.recover.test-001",
  });
  await client.applyCraftingSupply({
    gameId: GAME_ID,
    itemKey: "alloy_plate",
    input: {
      countryCode: "lum",
      scarcityBand: "Constrained",
      availableQuantity: 25,
      eventMultiplier: 1.25,
      routeMultiplier: 0.8,
      sourceEventKey: "event.route-disruption.001",
      expiresAt: "2026-08-08T00:00:00.000Z",
      unsupportedField: PRIVATE_ID,
    },
    idempotencyKey: "admin.crafting.supply.test-001",
  });

  assert.equal(
    calls[0].url,
    `/api/admin/games/${GAME_ID}/crafting/oversight?status=failed&limit=25`,
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, undefined);

  assert.equal(
    calls[1].url,
    `/api/admin/games/${GAME_ID}/crafting/jobs/${JOB_KEY}/recover`,
  );
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["Idempotency-Key"], "admin.crafting.recover.test-001");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    outcome: "requeue",
    reason: "Retry after authoritative reservation review",
    idempotencyKey: "admin.crafting.recover.test-001",
  });

  assert.equal(
    calls[2].url,
    `/api/admin/games/${GAME_ID}/crafting/supply/alloy_plate`,
  );
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    countryCode: "LUM",
    scarcityBand: "constrained",
    availableQuantity: 25,
    eventMultiplier: 1.25,
    routeMultiplier: 0.8,
    sourceEventKey: "event.route-disruption.001",
    expiresAt: "2026-08-08T00:00:00.000Z",
    idempotencyKey: "admin.crafting.supply.test-001",
  });
  assert.equal(JSON.stringify(calls).includes(PRIVATE_ID), false);
});

test("Crafting API converts permission and server failures to safe Admin envelopes", async () => {
  const rawLeak = "SELECT * FROM inventory_holdings USING service_role";
  const forbidden = createCraftingApiClient({
    fetchImpl: async () => jsonResponse({
      code: "staff_permission_denied",
      message: rawLeak,
      details: PRIVATE_ID,
    }, { status: 403, headers: { "x-request-id": "req-craft-403" } }),
    timeoutMs: 1_000,
  });
  await assert.rejects(
    () => forbidden.readCrafting({ gameId: GAME_ID }),
    (error) => {
      assert.equal(error.code, "PERMISSION_DENIED");
      assert.equal(error.requestId, "req-craft-403");
      assert.equal(JSON.stringify(error).includes(rawLeak), false);
      assert.equal(JSON.stringify(error).includes(PRIVATE_ID), false);
      return true;
    },
  );

  const unavailable = createCraftingApiClient({
    fetchImpl: async () => jsonResponse({
      code: "postgres_failed",
      message: rawLeak,
      details: PRIVATE_ID,
    }, { status: 503 }),
    timeoutMs: 1_000,
  });
  await assert.rejects(
    () => unavailable.readCrafting({ gameId: GAME_ID }),
    (error) => {
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(error.retryable, true);
      assert.equal(JSON.stringify(error).includes(rawLeak), false);
      return true;
    },
  );
});

test("Crafting controller enforces inventory.redeem before reads or mutations", async () => {
  let calls = 0;
  const api = {
    async readCrafting() {
      calls += 1;
      return { data: oversightData() };
    },
    async recoverCraftingJob() {
      calls += 1;
      return { data: { committed: true } };
    },
    async applyCraftingSupply() {
      calls += 1;
      return { data: { committed: true } };
    },
    cancelCraftingRequest() { return false; },
  };
  const denied = createCraftingController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });

  await denied.load();
  assert.equal(calls, 0);
  const recovery = await denied.recoverJob(
    {
      jobKey: JOB_KEY,
      recipeName: "Alloy Plate",
      playerLabel: "Jordan Kim",
    },
    { outcome: "requeue", reason: "Retry job" },
  );
  assert.equal(recovery.ok, false);
  assert.equal(recovery.error.code, "PERMISSION_DENIED");
  assert.equal(calls, 0);
  denied.destroy();
});

test("Crafting controller commits supported recovery with a stable idempotency key and refreshes authoritatively", async () => {
  const recoveries = [];
  let reads = 0;
  const api = {
    async readCrafting() {
      reads += 1;
      return { data: oversightData() };
    },
    async recoverCraftingJob(input) {
      recoveries.push(input);
      return { data: { committed: true } };
    },
    async applyCraftingSupply() {
      return { data: { committed: true } };
    },
    cancelCraftingRequest() { return false; },
  };
  const controller = createCraftingController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "inventory.redeem",
    cryptoObject: { randomUUID: () => "30000000-0000-4000-8000-000000000003" },
  });

  await controller.load();
  assert.equal(controller.getState().status, "ready");
  const result = await controller.recoverJob(
    {
      jobKey: JOB_KEY,
      recipeName: "Alloy Plate",
      playerLabel: "Jordan Kim",
    },
    { outcome: "requeue", reason: "Retry job after inventory review" },
  );
  assert.equal(result.ok, true);
  assert.equal(recoveries.length, 1);
  assert.match(
    recoveries[0].idempotencyKey,
    /^admin\.crafting\.recover\.30000000-0000-4000-8000-000000000003\.1$/,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(reads >= 2);
  controller.destroy();
});
