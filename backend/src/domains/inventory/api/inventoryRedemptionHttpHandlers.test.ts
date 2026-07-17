import {
  handlePlayerInventoryRedemptionRequest,
  handleStaffInventoryRedemptionRequest,
} from "./inventoryRedemptionHttpHandlers.ts";
import type {
  EdgeSupabaseClient,
  SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000011";
const SESSION_ID = "00000000-0000-4000-8000-000000000021";
const HOLDING_ID = "00000000-0000-4000-8000-000000000031";
const ITEM_ID = "00000000-0000-4000-8000-000000000041";
const REQUEST_ID = "00000000-0000-4000-8000-000000000051";
const STAFF_ID = "00000000-0000-4000-8000-000000000061";
const NOW = "2026-07-18T09:30:00.000Z";

Deno.test("player redemption creates a session-scoped request", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const response = await handlePlayerInventoryRedemptionRequest(
    playerRequest({ quantity: 2, note: "Workshop", idempotencyKey: "redeem-1" }),
    HOLDING_ID,
    playerDependencies(rpcClient((name, args) => {
      calls.push({ name, args });
      return success([{ ...redemptionRow(), request_outcome: "created" }]);
    })),
  );
  const body = await response.json();

  expectEqual(response.status, 201);
  expectEqual(body.outcome, "created");
  expectEqual(body.redemption.status, "pending");
  expectEqual(calls[0].name, "request_inventory_redemption");
  expectEqual(calls[0].args.p_game_session_id, GAME_ID);
  expectEqual(calls[0].args.p_player_id, PLAYER_ID);
  expectEqual(calls[0].args.p_quantity, 2);
  expectEqual(calls[0].args.p_idempotency_key, "redeem-1");
});

Deno.test("player redemption reports an idempotent replay", async () => {
  const response = await handlePlayerInventoryRedemptionRequest(
    playerRequest({ quantity: 1, idempotencyKey: "redeem-replay" }),
    HOLDING_ID,
    playerDependencies(rpcClient(() => success([{
      ...redemptionRow(),
      request_outcome: "replayed",
    }]))),
  );
  const body = await response.json();

  expectEqual(response.status, 200);
  expectEqual(body.outcome, "replayed");
});

Deno.test("player redemption rejects identity injection and mismatched scope", async () => {
  const client = rpcClient(() => success([]));
  const injected = await handlePlayerInventoryRedemptionRequest(
    playerRequest({
      quantity: 1,
      idempotencyKey: "injected",
      playerId: "00000000-0000-4000-8000-000000000099",
    }),
    HOLDING_ID,
    playerDependencies(client),
  );
  const mismatched = await handlePlayerInventoryRedemptionRequest(
    playerRequest(
      { quantity: 1, idempotencyKey: "wrong-game" },
      { gameSessionId: OTHER_GAME_ID },
    ),
    HOLDING_ID,
    playerDependencies(client),
  );

  await expectError(injected, 400, "invalid_player_request");
  await expectError(mismatched, 401, "invalid_player_session_scope");
});

Deno.test("player redemption maps idempotency and quantity conflicts", async () => {
  const conflict = await handlePlayerInventoryRedemptionRequest(
    playerRequest({ quantity: 1, idempotencyKey: "conflict" }),
    HOLDING_ID,
    playerDependencies(rpcClient(() => failure(
      "INVENTORY_REDEMPTION_IDEMPOTENCY_CONFLICT",
    ))),
  );
  const unavailable = await handlePlayerInventoryRedemptionRequest(
    playerRequest({ quantity: 8, idempotencyKey: "unavailable" }),
    HOLDING_ID,
    playerDependencies(rpcClient(() => failure(
      "INVENTORY_REDEMPTION_QUANTITY_UNAVAILABLE",
    ))),
  );

  await expectError(conflict, 409, "inventory_redemption_idempotency_conflict");
  await expectError(unavailable, 409, "inventory_redemption_insufficient_available");
});

Deno.test("staff redemption review forwards the owner-scoped action", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const response = await handleStaffInventoryRedemptionRequest(
    staffRequest("PATCH", { action: "approve", note: "Verified" }),
    GAME_ID,
    REQUEST_ID,
    {
      serviceClient: rpcClient((name, args) => {
        calls.push({ name, args });
        return success([{
          ...redemptionRow({ status: "approved", reviewed_at: NOW }),
          review_outcome: "approved",
        }]);
      }),
      staffUserId: STAFF_ID,
      now: () => NOW,
    },
  );
  const body = await response.json();

  expectEqual(response.status, 200);
  expectEqual(body.outcome, "approved");
  expectEqual(calls[0].name, "review_inventory_redemption");
  expectEqual(calls[0].args.p_staff_user_id, STAFF_ID);
  expectEqual(calls[0].args.p_action, "approve");
});

Deno.test("staff redemption maps ownership and transition failures", async () => {
  const forbidden = await handleStaffInventoryRedemptionRequest(
    staffRequest("PATCH", { action: "approve" }),
    OTHER_GAME_ID,
    REQUEST_ID,
    {
      serviceClient: rpcClient(() => failure(
        "INVENTORY_REDEMPTION_REVIEW_FORBIDDEN",
      )),
      staffUserId: STAFF_ID,
    },
  );
  const transition = await handleStaffInventoryRedemptionRequest(
    staffRequest("PATCH", { action: "fulfill" }),
    GAME_ID,
    REQUEST_ID,
    {
      serviceClient: rpcClient(() => failure(
        "INVENTORY_REDEMPTION_INVALID_TRANSITION",
      )),
      staffUserId: STAFF_ID,
    },
  );

  await expectError(forbidden, 403, "inventory_redemption_review_forbidden");
  await expectError(transition, 409, "inventory_redemption_invalid_transition");
});

Deno.test("staff redemption queue uses lowercase status values", async () => {
  const filters: Array<[string, unknown]> = [];
  const response = await handleStaffInventoryRedemptionRequest(
    staffRequest("GET", undefined, "?status=Approved"),
    GAME_ID,
    null,
    {
      serviceClient: queryClient(filters, {
        inventory_redemption_requests: [redemptionRow({ status: "approved" })],
        players: [{ id: PLAYER_ID, display_name: "Avery", roster_label: "A-1" }],
        store_items: [{ id: ITEM_ID, name: "Repair Kit", category: "Consumables" }],
      }),
      staffUserId: STAFF_ID,
      now: () => NOW,
    },
  );
  const body = await response.json();

  expectEqual(response.status, 200);
  expectEqual(body.summary.approved, 1);
  expectEqual(
    filters.some(([column, value]) => column === "status" && value === "approved"),
    true,
  );
});

Deno.test("staff redemption queue rejects unknown status values", async () => {
  const response = await handleStaffInventoryRedemptionRequest(
    staffRequest("GET", undefined, "?status=destroyed"),
    GAME_ID,
    null,
    { serviceClient: rpcClient(() => success([])), staffUserId: STAFF_ID },
  );

  await expectError(response, 400, "inventory_redemption_status_invalid");
});

function playerDependencies(client: EdgeSupabaseClient) {
  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    createServiceClient: (_env: SupabaseEnv) => client,
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve({
      ok: true as const,
      session: {
        id: SESSION_ID,
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        status: "active",
        expires_at: "2099-07-18T09:30:00.000Z",
        revoked_at: null,
      },
      gameSession: { id: GAME_ID, name: "Period 1", status: "active" },
      player: {
        id: PLAYER_ID,
        display_name: "Avery",
        roster_label: "A-1",
        status: "active",
      },
    }),
    now: () => NOW,
  };
}

function playerRequest(
  body: Record<string, unknown>,
  options: { gameSessionId?: string } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    "x-player-session-token": "player-token",
  });
  if (options.gameSessionId) {
    headers.set("x-econovaria-game-session-id", options.gameSessionId);
  }
  return new Request(`https://example.test/players/me/inventory/${HOLDING_ID}/redemptions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function staffRequest(
  method: string,
  body?: Record<string, unknown>,
  suffix = "",
): Request {
  return new Request(`https://example.test/staff/game-sessions/${GAME_ID}/inventory/redemptions${suffix}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function redemptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    game_session_id: GAME_ID,
    player_id: PLAYER_ID,
    inventory_holding_id: HOLDING_ID,
    store_item_id: ITEM_ID,
    quantity: 1,
    status: "pending",
    request_note: null,
    resolution_note: null,
    requested_at: NOW,
    reviewed_at: null,
    fulfilled_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function success(data: unknown) {
  return { data, error: null };
}

function failure(message: string) {
  return { data: null, error: { message } };
}

function rpcClient(
  resolver: (name: string, args: Record<string, unknown>) => {
    data: unknown;
    error: { message: string } | null;
  },
): EdgeSupabaseClient {
  return {
    rpc(name: string, args?: unknown) {
      return Promise.resolve(resolver(name, (args ?? {}) as Record<string, unknown>));
    },
  } as unknown as EdgeSupabaseClient;
}

function queryClient(
  filters: Array<[string, unknown]>,
  tableData: Record<string, unknown[]>,
): EdgeSupabaseClient {
  return {
    from(tableName: string) {
      return new QueryBuilder(filters, tableData[tableName] ?? []);
    },
  } as unknown as EdgeSupabaseClient;
}

class QueryBuilder implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(
    private readonly filters: Array<[string, unknown]>,
    private readonly rows: unknown[],
  ) {}
  select(_columns: string) { return this; }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  in(column: string, values: readonly unknown[]) {
    this.filters.push([column, values]);
    return this;
  }
  order(_column: string, _options?: unknown) { return this; }
  limit(_count: number) { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const value = { data: this.rows, error: null as null };
    return Promise.resolve(onfulfilled ? onfulfilled(value) : value as unknown as TResult1);
  }
}

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  expectEqual(response.status, status);
  expectEqual(body.ok, false);
  expectEqual(body.error.code, code);
}

function expectEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    );
  }
}
