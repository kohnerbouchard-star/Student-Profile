import { handleCraftingOperation } from "./craftingOperations.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const JOB = `cft_${"a".repeat(32)}`;

Deno.test("Admin Crafting oversight calls only reviewed RPCs", async () => {
  const client = new Client();
  const read = await handleCraftingOperation(client, {
    request: new Request(`https://example.test/games/${GAME}/crafting/oversight?status=failed&limit=25`),
    gameId: GAME, staffUserId: STAFF, suffix: "/crafting/oversight",
  });
  assertEquals(read.status, 200);
  assertEquals(client.calls[0], ["read_admin_crafting_oversight_v1", {
    p_game_session_id: GAME, p_staff_user_id: STAFF, p_status: "failed", p_limit: 25,
  }]);

  const recovery = await handleCraftingOperation(client, {
    request: jsonRequest(`https://example.test/games/${GAME}/crafting/jobs/${JOB}/recover`, {
      outcome: "release_and_fail", reason: "Reservation audit recovery", idempotencyKey: "admin.craft.recover.001",
    }),
    gameId: GAME, staffUserId: STAFF, suffix: `/crafting/jobs/${JOB}/recover`,
  });
  assertEquals(recovery.status, 200);
  assertEquals(client.calls[1], ["recover_admin_crafting_job_v1", {
    p_game_session_id: GAME,
    p_staff_user_id: STAFF,
    p_job_public_id: JOB,
    p_outcome: "release_and_fail",
    p_reason: "Reservation audit recovery",
    p_idempotency_key: "admin.craft.recover.001",
  }]);
});

Deno.test("Admin Crafting normalizes bounded supply controls", async () => {
  const client = new Client();
  const response = await handleCraftingOperation(client, {
    request: jsonRequest("https://example.test", {
      countryCode: "lum",
      scarcityBand: "Constrained",
      availableQuantity: 25,
      eventMultiplier: 1.25,
      routeMultiplier: 0.8,
      sourceEventKey: "event.route-disruption.001",
      expiresAt: "2026-07-23T00:00:00.000Z",
      idempotencyKey: "admin.craft.supply.001",
    }),
    gameId: GAME,
    staffUserId: STAFF,
    suffix: "/crafting/supply/alloy_plate",
  });
  assertEquals(response.status, 200);
  assertEquals(client.calls[0], ["apply_admin_physical_economy_supply_v1", {
    p_game_session_id: GAME,
    p_staff_user_id: STAFF,
    p_item_key: "alloy_plate",
    p_country_code: "LUM",
    p_scarcity_band: "constrained",
    p_available_quantity: 25,
    p_event_multiplier: 1.25,
    p_route_multiplier: 0.8,
    p_source_event_key: "event.route-disruption.001",
    p_expires_at: "2026-07-23T00:00:00.000Z",
    p_idempotency_key: "admin.craft.supply.001",
  }]);
});

Deno.test("Admin Crafting rejects unsupported fields and unsafe identifiers", async () => {
  const client = new Client();
  const recovery = await handleCraftingOperation(client, {
    request: jsonRequest("https://example.test", {
      outcome: "requeue", reason: "Retry", idempotencyKey: "admin.craft.recover.002", playerUuid: STAFF,
    }),
    gameId: GAME, staffUserId: STAFF, suffix: `/crafting/jobs/${JOB}/recover`,
  });
  assertEquals(recovery.status, 400);

  for (const body of [
    {
      countryCode: "NORTHREACH",
      scarcityBand: "available",
      availableQuantity: 1,
      idempotencyKey: "admin.craft.supply.002",
    },
    {
      countryCode: "LUM",
      scarcityBand: "available",
      availableQuantity: 1,
      sourceEventKey: "unsafe event key",
      idempotencyKey: "admin.craft.supply.003",
    },
  ]) {
    const response = await handleCraftingOperation(client, {
      request: jsonRequest("https://example.test", body),
      gameId: GAME,
      staffUserId: STAFF,
      suffix: "/crafting/supply/alloy_plate",
    });
    assertEquals(response.status, 400);
  }
  assertEquals(client.calls.length, 0);
});

Deno.test("Admin Crafting maps divergent replay errors to conflict", async () => {
  const client = new Client({
    data: null,
    error: { message: "CRAFTING_RECOVERY_IDEMPOTENCY_CONFLICT", code: "P0001" },
  });
  const response = await handleCraftingOperation(client, {
    request: jsonRequest("https://example.test", {
      outcome: "requeue",
      reason: "Retry failed job",
      idempotencyKey: "admin.craft.recover.conflict",
    }),
    gameId: GAME,
    staffUserId: STAFF,
    suffix: `/crafting/jobs/${JOB}/recover`,
  });
  assertEquals(response.status, 409);
  assertEquals(response.body, {
    code: "crafting_admin_conflict",
    message: "Crafting state conflicts with the requested operation.",
  });
});

class Client {
  calls: [string, unknown][] = [];
  constructor(
    private readonly response: { data: unknown; error: { message?: string; code?: string } | null } = {
      data: { committed: true },
      error: null,
    },
  ) {}
  rpc(name: string, args: unknown) {
    this.calls.push([name, args]);
    return Promise.resolve(this.response);
  }
}
function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
