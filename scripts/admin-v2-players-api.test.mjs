import assert from "node:assert/strict";
import test from "node:test";

import { createAdminApiClient } from "../admin/v2/src/api/admin-api-client.js";
import { getAdminNavigationRoute } from "../admin/v2/src/core/navigation-registry.js";
import {
  createPlayersController,
  normalizePlayersReadModel,
} from "../admin/v2/src/routes/players/PlayersController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PLAYER_ID = "40000000-0000-4000-8000-000000000004";
const IDEMPOTENCY = "admin.players.test.10000000-0000-4000-8000-000000000099.1";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "players-test" },
  });
}

function roster(players) {
  return { data: { players, roster: players, totalPlayers: players.length } };
}

function playerRow(overrides = {}) {
  return {
    id: PLAYER_ID,
    playerId: PLAYER_ID,
    displayName: "Avery Student",
    rosterLabel: "Cohort A",
    status: "active",
    countryName: "Northreach",
    countryCode: "NRC",
    sessionStatus: "online",
    online: true,
    lastActiveAt: "2026-08-07T03:00:00.000Z",
    flagCount: 1,
    flagged: true,
    adminSettings: {
      displayName: "Avery — Admin label",
      status: "review",
      countryAssignment: "Northreach advisory",
      adminNote: "Follow up after simulation.",
    },
    ...overrides,
  };
}


test("Players is the only route flipped in the existing native V2 baseline", () => {
  for (const routeId of ["overview", "store", "market", "players"]) {
    assert.equal(getAdminNavigationRoute(routeId)?.migration, "v2", `${routeId} is not native V2`);
  }
  assert.equal(getAdminNavigationRoute("marketplace")?.migration, "planned");
  assert.equal(getAdminNavigationRoute("attendance")?.migration, "legacy");
});

test("Players API uses only the same-origin Admin BFF paths and authoritative payload fields", async () => {
  const calls = [];
  const api = createAdminApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      if (init.method === "GET") return jsonResponse(roster([playerRow()]));
      if (url.endsWith("/settings")) {
        return jsonResponse({ data: { saved: true, settings: { displayName: "Admin label" } } });
      }
      if (url.endsWith("/access-code/reset")) {
        return jsonResponse({
          ok: true,
          player: { displayName: "Avery Student", rosterLabel: "Cohort A", playerIdentifier: "CARD-22", status: "active" },
          accessCode: { studentCode: null, status: "unchanged", createdAt: null, credentialVersion: null },
          sessionsRevoked: false,
        });
      }
      return jsonResponse({
        ok: true,
        player: { id: PLAYER_ID, displayName: "Created Student", rosterLabel: "Cohort B", playerIdentifier: "CARD-23", status: "active" },
        accessCode: { studentCode: "ABCD-23", status: "active", createdAt: "2026-08-07T03:00:00.000Z" },
      }, 201);
    },
  });

  await api.readPlayers({ gameId: GAME_ID });
  await api.createPlayer({
    gameId: GAME_ID,
    player: {
      displayName: "Created Student",
      rosterLabel: "Cohort B",
      playerIdentifier: "CARD-23",
      accessCode: "ABCD-23",
      unsupportedOwnerId: "must-not-leave-browser",
    },
    idempotencyKey: IDEMPOTENCY,
  });
  await api.updatePlayerSettings({
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    settings: {
      displayName: "Admin label",
      status: "review",
      countryAssignment: "Northreach advisory",
      adminNote: "Needs follow up",
      playerId: "must-not-be-sent",
    },
    idempotencyKey: `${IDEMPOTENCY}.profile`,
  });
  await api.updatePlayerCredentials({
    gameId: GAME_ID,
    playerId: PLAYER_ID,
    credentials: {
      playerIdentifier: "CARD-22",
      internalUuid: "must-not-be-sent",
    },
    idempotencyKey: `${IDEMPOTENCY}.credentials`,
  });

  assert.equal(calls[0].url, `/api/admin/games/${GAME_ID}/players`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");

  assert.equal(calls[1].url, `/api/admin/games/${GAME_ID}/players`);
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(calls[1].body, {
    displayName: "Created Student",
    rosterLabel: "Cohort B",
    playerIdentifier: "CARD-23",
    accessCode: "ABCD-23",
  });

  assert.equal(calls[2].url, `/api/admin/games/${GAME_ID}/players/${PLAYER_ID}/settings`);
  assert.equal(calls[2].init.method, "PATCH");
  assert.deepEqual(calls[2].body, {
    settings: {
      displayName: "Admin label",
      status: "review",
      countryAssignment: "Northreach advisory",
      adminNote: "Needs follow up",
    },
  });

  assert.equal(calls[3].url, `/api/admin/games/${GAME_ID}/players/${PLAYER_ID}/access-code/reset`);
  assert.equal(calls[3].init.method, "POST");
  assert.deepEqual(calls[3].body, { playerIdentifier: "CARD-22" });

  for (const call of calls) {
    const headers = new Headers(call.init.headers || {});
    assert.equal(headers.has("authorization"), false);
    if (call.init.method !== "GET") {
      assert.match(headers.get("idempotency-key") || "", /^admin\.players\./);
      assert.equal(headers.get("content-type"), "application/json");
    }
  }
});

test("Players normalization preserves long and Korean names while keeping private UUIDs out of presentation fields", () => {
  const rows = Array.from({ length: 42 }, (_, index) => playerRow({
    id: `40000000-0000-4000-8000-${String(index + 4).padStart(12, "0")}`,
    playerId: `40000000-0000-4000-8000-${String(index + 4).padStart(12, "0")}`,
    displayName: index === 0
      ? "김하늘 — 국제 경제 시뮬레이션 연구 프로젝트 참가자"
      : index === 1
        ? "Alexandria Montgomery-Rivera-Wojciechowski — Cooperative Economic Systems Fellowship Participant"
        : `Player ${index + 1}`,
    rosterLabel: `Cohort ${index + 1}`,
    sessionStatus: index % 3 === 0 ? "online" : index % 3 === 1 ? "recently_active" : "offline",
    adminSettings: index === 2
      ? { adminNote: `unsafe ${PLAYER_ID}` }
      : {},
  }));
  const model = normalizePlayersReadModel(roster(rows));
  assert.equal(model.players.length, 42);
  assert.match(model.players[0].displayName, /김하늘/);
  assert.match(model.players[1].displayName, /Montgomery-Rivera-Wojciechowski/);
  assert.equal(model.players[2].adminProfile.adminNote, "");
  for (const player of model.players) {
    const presentation = {
      rowKey: player.rowKey,
      displayName: player.displayName,
      rosterLabel: player.rosterLabel,
      status: player.status,
      countryName: player.countryName,
      countryCode: player.countryCode,
      sessionStatus: player.sessionStatus,
      adminProfile: player.adminProfile,
    };
    assert.doesNotMatch(JSON.stringify(presentation), PRIVATE_UUID_PATTERN);
    assert.match(player.rowKey, /^player-row-\d+$/);
  }
});

test("Players controller does not issue a protected roster request without players.manage", async () => {
  let reads = 0;
  const api = {
    readPlayers: async () => { reads += 1; return roster([]); },
    cancelPlayersRequest: () => false,
    createPlayer: async () => ({ ok: true }),
    updatePlayerSettings: async () => ({ data: { saved: true, settings: {} } }),
    updatePlayerCredentials: async () => ({ ok: true }),
  };
  const controller = createPlayersController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });
  const before = controller.getState();
  const after = await controller.load();
  assert.equal(reads, 0);
  assert.equal(after, before);
  assert.equal(after.requestVersion, 0);
  controller.destroy();
});

test("Players controller reaches empty, ready, refreshing, stale, and safe failed states", async () => {
  const reads = [
    roster([]),
    roster([playerRow()]),
    new Promise((resolve) => setTimeout(() => resolve(roster([playerRow()])), 20)),
    () => Promise.reject(Object.assign(new Error("SELECT * FROM private.players"), { status: 503, code: "UPSTREAM_UNAVAILABLE", retryable: true })),
  ];
  const api = {
    readPlayers: async () => {
      const next = reads.shift();
      return typeof next === "function" ? next() : next;
    },
    cancelPlayersRequest: () => false,
    createPlayer: async () => ({ ok: true }),
    updatePlayerSettings: async () => ({ data: { saved: true, settings: {} } }),
    updatePlayerCredentials: async () => ({ ok: true }),
  };
  const controller = createPlayersController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => true,
  });

  await controller.load();
  assert.equal(controller.getState().status, "empty");
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  const pending = controller.load();
  assert.equal(controller.getState().status, "refreshing");
  await pending;
  assert.equal(controller.getState().status, "ready");
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.doesNotMatch(controller.getState().error.userMessage, /SELECT \* FROM/i);
  controller.destroy();
});
