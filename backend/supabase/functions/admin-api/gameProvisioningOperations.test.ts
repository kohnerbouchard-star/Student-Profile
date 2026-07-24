import { handleGameProvisioningOperation } from "./gameProvisioningOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "00000000-0000-4000-8000-000000000001";
const GAME_ID = "00000000-0000-4000-8000-000000000002";

Deno.test("POST games validates input and calls the full activation provisioning RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const service = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return {
        data: {
          outcome: "created",
          gameSessionId: GAME_ID,
          gameName: "Period 4 Economy",
          provisioningStatus: "ready",
          packId: "econovaria.beta-seed-pack.v1",
          packVersion: "1.0.0-beta",
          activationVersion: "full-game-feature-activation-v2",
          joinCode: "ECO-ABCD2345",
          joinCodeReissueRequired: false,
          counts: {
            marketAssets: 240,
            contracts: 30,
            storeItems: 50,
            worldLocations: 50,
            worldRoutes: 13,
            storylines: 1,
            storyEvents: 3,
            arrivalPackages: 10,
            arrivalClassGrants: 8,
          },
          contentGates: {
            crafting: "blocked",
            story: "active",
            arrivalGrantProcessor: "active",
            progressionInitialization: "active",
          },
        },
        error: null,
      };
    },
  };

  const result = await handleGameProvisioningOperation(service, {
    request: gameRequest({
      name: "Period 4 Economy",
      difficultyPreset: "hard",
      stockMarketWindow: { timezone: "Asia/Seoul" },
    }),
    path: "/games",
    staffUserId: STAFF_ID,
  });

  assertEquals(result.handled, true);
  assertEquals(result.status, 201);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "create_provisioned_game_v2");
  assertEquals(calls[0].args.p_staff_user_id, STAFF_ID);
  assertEquals(calls[0].args.p_game_name, "Period 4 Economy");
  assertEquals(calls[0].args.p_idempotency_key, "game.create.test.001");
  assertEquals(calls[0].args.p_pack_id, "econovaria.beta-seed-pack.v1");

  const body = result.body as Record<string, any>;
  assertEquals(body.data.game.id, GAME_ID);
  assertEquals(body.data.game.provisioningStatus, "ready");
  assertEquals(body.data.game.activationVersion, "full-game-feature-activation-v2");
  assertEquals(body.data.game.gameCode, "ECO-ABCD2345");
  assertEquals(body.data.joinCode, "ECO-ABCD2345");
  assertEquals(body.data.counts.marketAssets, 240);
  assertEquals(body.data.counts.storyEvents, 3);
  assertEquals(body.data.contentGates.story, "active");
  assertEquals(body.data.contentGates.arrivalGrantProcessor, "active");
});

Deno.test("replayed provisioning never returns the original plaintext Game Code", async () => {
  const service = {
    async rpc() {
      return {
        data: {
          outcome: "replayed",
          gameSessionId: GAME_ID,
          gameName: "Period 4 Economy",
          provisioningStatus: "ready",
          packId: "econovaria.beta-seed-pack.v1",
          packVersion: "1.0.0-beta",
          activationVersion: "full-game-feature-activation-v2",
          joinCode: null,
          joinCodeReissueRequired: true,
        },
        error: null,
      };
    },
  };

  const result = await handleGameProvisioningOperation(service, {
    request: gameRequest({
      name: "Period 4 Economy",
      difficulty: "moderate",
      timezone: "America/New_York",
    }),
    path: "/games",
    staffUserId: STAFF_ID,
  });

  assertEquals(result.status, 200);
  const body = result.body as Record<string, any>;
  assertEquals(body.data.replayed, true);
  assertEquals(body.data.joinCode, "");
  assertEquals(body.data.joinCodeReissueRequired, true);
  assertEquals(body.data.activationVersion, "full-game-feature-activation-v2");
});

Deno.test("invalid requests fail before any provisioning RPC call", async () => {
  let calls = 0;
  const service = {
    async rpc() {
      calls += 1;
      return { data: null, error: null };
    },
  };

  const missingKey = await handleGameProvisioningOperation(service, {
    request: new Request("https://example.test/admin-api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Missing key",
        difficultyPreset: "easy",
        stockMarketWindow: { timezone: "Asia/Seoul" },
      }),
    }),
    path: "/games",
    staffUserId: STAFF_ID,
  });
  assertEquals(missingKey.status, 400);

  const badTimezone = await handleGameProvisioningOperation(service, {
    request: gameRequest({
      name: "Bad timezone",
      difficultyPreset: "easy",
      stockMarketWindow: { timezone: "Moon/Base-One" },
    }),
    path: "/games",
    staffUserId: STAFF_ID,
  });
  assertEquals(badTimezone.status, 400);
  assertEquals(calls, 0);
});

Deno.test("database failures remain sanitized and non-joinable", async () => {
  const service = {
    async rpc() {
      return {
        data: {
          outcome: "failed",
          provisioningStatus: "failed",
          failureCode: "P0001",
          transactionRolledBack: true,
          joinCode: null,
        },
        error: null,
      };
    },
  };

  const result = await handleGameProvisioningOperation(service, {
    request: gameRequest({
      name: "Rollback game",
      difficultyPreset: "insane",
      stockMarketWindow: { timezone: "Europe/London" },
    }),
    path: "/games",
    staffUserId: STAFF_ID,
  });

  assertEquals(result.status, 503);
  const body = result.body as Record<string, any>;
  assertEquals(body.code, "game_provisioning_failed");
  assertEquals(body.data.transactionRolledBack, true);
  assertEquals("joinCode" in body, false);
  assertEquals(JSON.stringify(body).includes(GAME_ID), false);
});

function gameRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/admin-api/games", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": "game.create.test.001",
    },
    body: JSON.stringify(body),
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
