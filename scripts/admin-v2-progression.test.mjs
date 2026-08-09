import assert from "node:assert/strict";
import test from "node:test";

import { createAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";
import { createProgressionApiClient } from "../admin/v2/src/routes/progression/ProgressionClient.js";
import {
  createProgressionController,
  normalizeProgressionReadModel,
} from "../admin/v2/src/routes/progression/ProgressionController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_PLAYER_UUID = "20000000-0000-4000-8000-000000000002";
const PLAYER_ID = "PLAYER-101";
const CORRECTION_ID = `pcr_${"a".repeat(32)}`;
const CREATED_AT = "2026-08-07T07:00:00.000Z";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function player(overrides = {}) {
  return {
    playerId: PLAYER_ID,
    playerUuid: PRIVATE_PLAYER_UUID,
    displayName: "김하늘 — 국제경제 연구반의 매우 긴 학생 이름",
    rosterLabel: "Y10-01",
    level: 42,
    experience: 987_654,
    availableSkillPoints: 19,
    skillCount: 17,
    achievementCount: 31,
    reputation: {
      country: 84,
      career: -21,
      story: 55,
      relationship: 12,
      inventedMetric: 999,
    },
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function correction(overrides = {}) {
  return {
    id: CORRECTION_ID,
    playerId: PLAYER_ID,
    staffUserId: "30000000-0000-4000-8000-000000000003",
    idempotencyKey: "private-do-not-display",
    displayName: "김하늘",
    correctionType: "reputation",
    amount: 5,
    reputationType: "country",
    reputationScope: "general",
    reason: "수업 기록 동기화 오류를 감사 가능한 방식으로 수정",
    beforeValue: 79,
    afterValue: 84,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function fulfilled(value) {
  return { status: "fulfilled", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}

test("Progression client uses only authoritative review, history, and correction contracts", async () => {
  const calls = [];
  const client = createProgressionApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("/corrections") && init.method === "GET") {
        return jsonResponse({ data: { corrections: [correction()] } });
      }
      if (init.method === "POST") {
        return jsonResponse({
          data: {
            outcome: "replayed",
            correction: {
              id: CORRECTION_ID,
              playerId: PLAYER_ID,
              correctionType: "experience",
              amount: 250,
              beforeValue: 700,
              afterValue: 950,
              createdAt: CREATED_AT,
            },
          },
        });
      }
      return jsonResponse({ data: { players: [player()] } });
    },
    timeoutMs: 1_000,
  });

  await client.readPlayers({ gameId: GAME_ID });
  await client.readCorrections({ gameId: GAME_ID, playerId: PLAYER_ID });
  const replay = await client.correctPlayer({
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    idempotencyKey: "admin.progression.correction.fixture.001",
    command: {
      correctionType: "experience",
      amount: 250,
      reputationType: null,
      reputationScope: null,
      reason: "Correct imported classroom record",
    },
  });

  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/progression?limit=100&offset=0`,
    `/api/admin/games/${GAME_ID}/progression/corrections?limit=100&offset=0&playerId=${PLAYER_ID}`,
    `/api/admin/games/${GAME_ID}/progression/players/${PLAYER_ID}/corrections`,
  ]);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.headers["Idempotency-Key"], "admin.progression.correction.fixture.001");
  assert.equal(JSON.parse(calls[2].init.body).idempotencyKey, "admin.progression.correction.fixture.001");
  calls.forEach(({ init }) => {
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal("Authorization" in init.headers, false);
  });
  assert.equal(replay.outcome, "replayed");
  assert.equal(client.createAchievement, undefined);
  assert.equal(client.setExperienceCurve, undefined);
  assert.equal(client.createPendingReview, undefined);
  await assert.rejects(
    client.readCorrections({ gameId: GAME_ID, playerId: "40000000-0000-4000-8000-000000000004" }),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("Progression read model handles zero, normal, and high records without UUID leakage", () => {
  const empty = normalizeProgressionReadModel({
    playersResult: fulfilled({ players: [] }),
    correctionsResult: fulfilled({ corrections: [] }),
  });
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.summary.playerCount, 0);

  const normal = normalizeProgressionReadModel({
    playersResult: fulfilled({ players: [player()] }),
    correctionsResult: fulfilled({ corrections: [correction()] }),
  });
  assert.equal(normal.isEmpty, false);
  assert.equal(normal.summary.playerCount, 1);
  assert.equal(normal.summary.highestLevel, 42);
  assert.equal(normal.summary.totalAchievements, 31);
  assert.equal(normal.summary.totalSkills, 17);
  assert.equal(normal.summary.correctionCount, 1);
  assert.equal(normal.players[0].displayName.includes("김하늘"), true);
  assert.equal(normal.players[0].experience, 987_654);
  assert.deepEqual(normal.players[0].reputation, {
    country: 84,
    career: -21,
    story: 55,
    relationship: 12,
  });
  assert.equal(normal.corrections[0].reason.includes("감사"), true);

  const highPlayers = Array.from({ length: 100 }, (_, index) => player({
    playerId: `PLAYER-${String(index + 1).padStart(3, "0")}`,
    displayName: `학생 ${index + 1}`,
    level: index + 1,
    experience: 1_000_000 + index,
    achievementCount: 50,
    skillCount: 25,
  }));
  const high = normalizeProgressionReadModel({
    playersResult: fulfilled({ players: highPlayers }),
    correctionsResult: fulfilled({ corrections: [] }),
  });
  assert.equal(high.summary.playerCount, 100);
  assert.equal(high.summary.highestLevel, 100);
  assert.equal(high.summary.totalAchievements, 5_000);
  assert.equal(high.summary.totalSkills, 2_500);

  const serialized = JSON.stringify(normal);
  assert.equal(serialized.includes(PRIVATE_PLAYER_UUID), false);
  assert.equal(serialized.includes("staffUserId"), false);
  assert.equal(serialized.includes("idempotencyKey"), false);
  assert.equal(serialized.includes("inventedMetric"), false);
});

test("Progression read model preserves partial safe failures instead of inventing missing data", () => {
  const error = createAdminErrorEnvelope({ code: "SERVICE_UNAVAILABLE", retryable: true });
  const model = normalizeProgressionReadModel({
    playersResult: fulfilled({ players: [player()] }),
    correctionsResult: rejected(error),
  });
  assert.equal(model.players.length, 1);
  assert.equal(model.corrections.length, 0);
  assert.equal(model.panels.players.status, "ready");
  assert.equal(model.panels.corrections.status, "failed");
  assert.equal(model.panels.corrections.error.code, "SERVICE_UNAVAILABLE");
});

test("Progression client preserves paused, ended, and unavailable lifecycle restrictions safely", async () => {
  for (const [progressionCode, retryable] of [
    ["progression_game_paused", true],
    ["progression_game_ended", false],
    ["progression_game_unavailable", false],
  ]) {
    const client = createProgressionApiClient({
      fetchImpl: async () => jsonResponse({
        code: progressionCode,
        message: "internal detail must not render",
        retryable,
      }, { status: 409 }),
      timeoutMs: 1_000,
    });
    await assert.rejects(
      client.correctPlayer({
        gameId: GAME_ID,
        playerId: PLAYER_ID,
        idempotencyKey: "admin.progression.correction.fixture.002",
        command: {
          correctionType: "experience",
          amount: 1,
          reputationType: null,
          reputationScope: null,
          reason: "Lifecycle test",
        },
      }),
      (error) => {
        assert.equal(error.code, "CONFLICT");
        assert.equal(error.progressionCode, progressionCode);
        assert.equal(error.retryable, retryable);
        assert.equal(error.userMessage.includes("internal detail"), false);
        return true;
      },
    );
  }
});

test("Progression controller gates reads and mutations on progression.review", async () => {
  let reads = 0;
  let writes = 0;
  const controller = createProgressionController({
    api: {
      async readPlayers() { reads += 1; return { players: [player()] }; },
      async readCorrections() { reads += 1; return { corrections: [] }; },
      async correctPlayer() { writes += 1; return { outcome: "applied" }; },
    },
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });

  const state = await controller.load();
  const correctionResult = await controller.correctPlayer(PLAYER_ID, {
    correctionType: "experience",
    amount: 5,
    reason: "Permission test",
  });
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.equal(state.hasResolved, false);
  assert.equal(correctionResult.ok, false);
  assert.equal(correctionResult.error.code, "PERMISSION_DENIED");
  controller.destroy();
});

test("Progression controller reuses a retryable correction idempotency key and accepts replay", async () => {
  const keys = [];
  let attempts = 0;
  const notifications = [];
  const controller = createProgressionController({
    api: {
      async readPlayers() { return { players: [] }; },
      async readCorrections() { return { corrections: [] }; },
      async correctPlayer(input) {
        keys.push(input.idempotencyKey);
        attempts += 1;
        if (attempts === 1) {
          throw createAdminErrorEnvelope({ code: "SERVICE_UNAVAILABLE", retryable: true });
        }
        return { outcome: "replayed", correction: correction({ correctionType: "experience" }) };
      },
    },
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "progression.review",
    notify: (notification) => notifications.push(notification),
    cryptoObject: { randomUUID: () => "40000000-0000-4000-8000-000000000004" },
  });
  const command = {
    correctionType: "experience",
    amount: 25,
    reason: "Retry idempotency test",
  };

  const first = await controller.correctPlayer(PLAYER_ID, command);
  const second = await controller.correctPlayer(PLAYER_ID, command);
  assert.equal(first.ok, false);
  assert.equal(first.error.retryable, true);
  assert.equal(second.ok, true);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(notifications.at(-1).title, "Correction already recorded");
  controller.destroy();
});
