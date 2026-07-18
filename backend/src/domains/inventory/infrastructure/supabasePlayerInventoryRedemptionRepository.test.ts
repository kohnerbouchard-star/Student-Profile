import { PlayerInventoryRedemptionError } from "../contracts/playerInventoryRedemptionContracts.ts";
import { SupabasePlayerInventoryRedemptionRepository } from "./supabasePlayerInventoryRedemptionRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = `red_${"a".repeat(32)}`;

Deno.test("Redemption repository invokes server-scoped atomic request RPC and exposes public IDs only", async () => {
  const client = new FakeClient([row({ request_outcome: "created" })]);
  const repository = new SupabasePlayerInventoryRedemptionRepository(client);
  const result = await repository.request({
    gameId: GAME,
    playerUuid: PLAYER,
    itemId: "meal-pass",
    command: { quantity: 2, note: "Lunch", idempotencyKey: "redeem:001" },
  });
  assertEquals(client.calls, [{
    functionName: "request_inventory_redemption_atomic_v1",
    args: {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_item_key: "meal-pass",
      p_quantity: 2,
      p_request_note: "Lunch",
      p_idempotency_key: "redeem:001",
    },
  }]);
  assertEquals(result.outcome, "created");
  assertEquals(result.redemption.id, REQUEST_ID);
  assertNoUuid(JSON.stringify(result));
});

Deno.test("Redemption repository preserves exact idempotent replay", async () => {
  const repository = new SupabasePlayerInventoryRedemptionRepository(
    new FakeClient([row({ request_outcome: "replayed" })]),
  );
  const result = await repository.request({
    gameId: GAME,
    playerUuid: PLAYER,
    itemId: "meal-pass",
    command: { quantity: 2, note: "Lunch", idempotencyKey: "redeem:001" },
  });
  assertEquals(result.outcome, "replayed");
});

Deno.test("Redemption repository invokes player-scoped history RPC without internal IDs", async () => {
  const client = new FakeClient([row()]);
  const repository = new SupabasePlayerInventoryRedemptionRepository(client);
  const result = await repository.read({
    gameId: GAME,
    playerUuid: PLAYER,
    status: "pending",
    limit: 25,
    offset: 0,
    requestId: REQUEST_ID,
  });
  assertEquals(client.calls[0], {
    functionName: "read_player_inventory_redemptions_v1",
    args: {
      p_game_session_id: GAME,
      p_player_id: PLAYER,
      p_status: "pending",
      p_limit: 25,
      p_offset: 0,
      p_request_public_id: REQUEST_ID,
    },
  });
  assertEquals(result.length, 1);
  assertNoUuid(JSON.stringify(result));
});

Deno.test("Redemption repository maps availability, quantity, idempotency, and missing schema errors", async () => {
  for (
    const [message, code, status] of [
      [
        "INVENTORY_REDEMPTION_ITEM_NOT_AVAILABLE",
        "player_inventory_redemption_unavailable",
        404,
      ],
      [
        "INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE",
        "player_inventory_redemption_quantity_unavailable",
        409,
      ],
      [
        "INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT",
        "player_inventory_redemption_idempotency_conflict",
        409,
      ],
      [
        "function does not exist",
        "player_inventory_redemption_schema_not_applied",
        503,
      ],
    ] as const
  ) {
    const repository = new SupabasePlayerInventoryRedemptionRepository(
      new FakeClient(null, { message }),
    );
    await assertRejectsCode(
      () =>
        repository.read({
          gameId: GAME,
          playerUuid: PLAYER,
          status: null,
          limit: 25,
          offset: 0,
          requestId: null,
        }),
      code,
      status,
    );
  }
});

Deno.test("Redemption repository fails closed on malformed, mismatched, or excessive RPC data", async () => {
  for (
    const rows of [
      [row({ request_id: GAME })],
      [row({ item_id: "Meal Pass" })],
      [row({ status: "cancelled" })],
      [row({ quantity: 0 })],
      [row({ requested_at: "bad" })],
    ]
  ) {
    const repository = new SupabasePlayerInventoryRedemptionRepository(
      new FakeClient(rows),
    );
    await assertRejectsCode(
      () =>
        repository.read({
          gameId: GAME,
          playerUuid: PLAYER,
          status: null,
          limit: 25,
          offset: 0,
          requestId: null,
        }),
      "player_inventory_redemption_failed",
      500,
    );
  }
  const repository = new SupabasePlayerInventoryRedemptionRepository(
    new FakeClient([row(), row({ request_id: `red_${"b".repeat(32)}` })]),
  );
  await assertRejectsCode(
    () =>
      repository.read({
        gameId: GAME,
        playerUuid: PLAYER,
        status: null,
        limit: 1,
        offset: 0,
        requestId: null,
      }),
    "player_inventory_redemption_failed",
    500,
  );
});

class FakeClient {
  readonly calls: { readonly functionName: string; readonly args: unknown }[] =
    [];
  constructor(
    private readonly data: readonly Record<string, unknown>[] | null,
    private readonly error:
      | { readonly message: string; readonly code?: string }
      | null = null,
  ) {}
  rpc<T>(
    functionName: string,
    args: unknown,
  ): Promise<{
    data: T | null;
    error: { readonly message: string; readonly code?: string } | null;
  }> {
    this.calls.push({ functionName, args });
    return Promise.resolve({ data: this.data as T | null, error: this.error });
  }
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    request_outcome: "created",
    request_id: REQUEST_ID,
    item_id: "meal-pass",
    quantity: 2,
    status: "pending",
    request_note: "Lunch",
    resolution_note: null,
    requested_at: "2026-07-18T12:00:00.000Z",
    reviewed_at: null,
    fulfilled_at: null,
    updated_at: "2026-07-18T12:00:00.000Z",
    ...overrides,
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerInventoryRedemptionError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      return;
    }
    throw error;
  }
  throw new Error("Expected repository error");
}

function assertNoUuid(value: string): void {
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(value)
  ) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
