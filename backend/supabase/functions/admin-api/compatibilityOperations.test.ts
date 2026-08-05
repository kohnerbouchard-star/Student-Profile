import type { AdminMutationRpcClient } from "../../../src/platform/supabase/adminMutation.ts";
import { handleCompatibilityOperation } from "./compatibilityOperations.ts";
import { handleLocalAdminGameMutation } from "./localGameMutations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_USER_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_ID = "00000000-0000-4000-8000-000000000003";
const DUPLICATE_ID = "00000000-0000-4000-8000-000000000004";
const IDENTITY = {
  idempotencyKey: "compatibility-mutation-key",
  requestId: "compatibility-request-id",
};

Deno.test("Contract archive and duplicate compatibility routes use only the local RPC", async () => {
  const service = new FakeCompatibilityService([
    successRow({
      contract: contractRow({ status: "archived" }),
      alreadyArchived: false,
    }, 200),
    successRow({
      contract: contractRow({
        id: DUPLICATE_ID,
        contract_key: "trade-drive-copy",
      }),
      sourceContractId: TARGET_ID,
    }, 201),
  ]);

  const archived = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/contracts/${TARGET_ID}/archive`,
    method: "POST",
    body: {},
    identity: IDENTITY,
  });
  const duplicated = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/contracts/${TARGET_ID}/duplicate`,
    method: "POST",
    body: {},
    identity: IDENTITY,
  });

  assertEquals(archived.status, 200);
  assertEquals(archived.body.data.archived, true);
  assertEquals(archived.body.data.alreadyArchived, false);
  assertEquals(archived.body.data.contract.id, TARGET_ID);
  assertEquals(archived.body.data.contract.key, "trade-drive");
  assertEquals(archived.body.data.contract.gameSessionId, undefined);
  assertEquals(archived.body.data.contract.createdByStaffId, undefined);
  assertEquals(duplicated.status, 201);
  assertEquals(duplicated.body.data.duplicated, true);
  assertEquals(duplicated.body.data.sourceContractId, TARGET_ID);
  assertEquals(duplicated.body.data.contract.id, DUPLICATE_ID);
  assertEquals(service.calls.map((call) => call.name), [
    "admin_mutate_contract_v1",
    "admin_mutate_contract_v1",
  ]);
  assertEquals(service.calls[0]?.args.p_operation, "archive");
  assertEquals(service.calls[1]?.args.p_operation, "duplicate");
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Store restock and rebalance compatibility routes use only the local RPC", async () => {
  const service = new FakeCompatibilityService([
    successRow({
      item: storeItemRow({ stock_quantity: 9 }),
    }, 200),
    successRow({ item: storeItemRow({ price: 44.57 }) }, 200),
  ]);

  const restocked = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/store/items/${TARGET_ID}/restock`,
    method: "POST",
    body: { amount: "5" },
    identity: IDENTITY,
  });
  const rebalanced = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/store/items/${TARGET_ID}/rebalance-price`,
    method: "POST",
    body: { targetPrice: "44.567" },
    identity: IDENTITY,
  });

  assertEquals(restocked.body.data.restocked, true);
  assertEquals(restocked.body.data.quantityAdded, 5);
  assertEquals(restocked.body.data.item.stock_quantity, 9);
  assertEquals(rebalanced.body.data.rebalanced, true);
  assertEquals(rebalanced.body.data.item.price, 44.57);
  assertEquals(service.calls.map((call) => call.name), [
    "admin_mutate_store_item_v1",
    "admin_mutate_store_item_v1",
  ]);
  assertEquals(service.calls[0]?.args.p_item_payload, { quantity: 5 });
  assertEquals(service.calls[1]?.args.p_item_payload, { price: 44.57 });
  assertEquals(
    service.calls[0]?.args.p_idempotency_key,
    IDENTITY.idempotencyKey,
  );
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Player archive and Settings reset compatibility routes are atomic local RPCs", async () => {
  const service = new FakeCompatibilityService([
    successRow({
      archived: true,
      destructiveDelete: false,
      alreadyArchived: false,
      player: { id: TARGET_ID, status: "archived" },
    }, 200),
    successRow({
      settings: {
        difficulty_preset: "moderate",
        attendance_window: {},
        business_market_window: {},
        stock_market_window: {},
        news_schedule: {},
        updated_at: "2026-08-05T00:00:00.000Z",
      },
      difficultyPolicy: { difficulty_preset: "moderate", source: "preset" },
    }, 200),
  ]);

  const archived = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/players/${TARGET_ID}/archive`,
    method: "POST",
    body: {},
    identity: IDENTITY,
  });
  const reset = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/settings/difficulty/reset`,
    method: "POST",
    body: {},
    identity: IDENTITY,
  });

  assertEquals(archived.body.data.player.status, "archived");
  assertEquals(reset.body.data.reset, true);
  assertEquals(reset.body.data.group, "difficulty");
  assertEquals(reset.body.data.settings.difficulty_preset, "moderate");
  assertEquals(service.calls.map((call) => call.name), [
    "admin_archive_player_v1",
    "admin_update_game_settings_v1",
  ]);
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Compatibility mutations reject missing stable identity before persistence", async () => {
  const service = new FakeCompatibilityService([]);
  const result = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/contracts/${TARGET_ID}/archive`,
    method: "POST",
    body: {},
  });

  assertEquals(result.status, 400);
  assertEquals(result.body.code, "idempotency_key_required");
  assertEquals(service.calls.length, 0);
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Compatibility operation bodies cannot cross the URL permission domain", async () => {
  const service = new FakeCompatibilityService([]);
  const result = await handleLocalAdminGameMutation(service as never, {
    request: mutationRequest(
      `/games/${GAME_SESSION_ID}/players`,
      "POST",
      {
        adminOperation: "archive-contract",
        contractId: TARGET_ID,
      },
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: "/players",
    gameSession: { id: GAME_SESSION_ID, name: "Test Game", status: "active" },
  });

  assertEquals(result.handled, true);
  if (!result.handled) {
    throw new Error("Expected the forged operation to fail closed.");
  }
  assertEquals(result.status, 400);
  assertEquals(
    result.body.code,
    "admin_compatibility_operation_route_mismatch",
  );
  assertEquals(service.calls.length, 0);
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Direct compatibility routes reject a conflicting body operation", async () => {
  const service = new FakeCompatibilityService([]);
  const result = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/contracts/${TARGET_ID}/archive`,
    method: "POST",
    body: { adminOperation: "archive-player", playerId: TARGET_ID },
    identity: IDENTITY,
  });

  assertEquals(result.status, 400);
  assertEquals(
    result.body.code,
    "admin_compatibility_operation_route_mismatch",
  );
  assertEquals(service.calls.length, 0);
});

Deno.test("Compatibility mutation database failures never return success", async () => {
  const service = new FakeCompatibilityService([{
    data: null,
    error: { message: "database unavailable" },
  }]);
  const result = await handleCompatibilityOperation(service, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    path: `/games/${GAME_SESSION_ID}/store/items/${TARGET_ID}/restock`,
    method: "POST",
    body: { quantity: 3 },
    identity: IDENTITY,
  });

  assertEquals(result.status, 500);
  assertEquals(result.body.code, "store_item_mutation_failed");
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Direct v606 Contract compatibility routes enter the local mutation dispatcher", async () => {
  const service = new FakeCompatibilityService([
    successRow({
      contract: contractRow({ status: "archived" }),
      alreadyArchived: false,
    }, 200),
  ]);
  const result = await handleLocalAdminGameMutation(service as never, {
    request: mutationRequest(
      `/games/${GAME_SESSION_ID}/contracts/${TARGET_ID}/archive`,
      "POST",
      {},
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: `/contracts/${TARGET_ID}/archive`,
    gameSession: { id: GAME_SESSION_ID, name: "Test Game", status: "active" },
  });

  assertEquals(result.handled, true);
  if (!result.handled) throw new Error("Expected local route handling.");
  assertEquals(result.status, 200);
  assertEquals((result.body.data as Record<string, unknown>).archived, true);
  assertEquals(
    service.calls[0]?.args.p_idempotency_key,
    IDENTITY.idempotencyKey,
  );
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Rewritten v606 Store compatibility operations keep the same local identity", async () => {
  const service = new FakeCompatibilityService([
    successRow({ item: storeItemRow({ stock_quantity: 6 }) }, 200),
  ]);
  const result = await handleLocalAdminGameMutation(service as never, {
    request: mutationRequest(
      `/games/${GAME_SESSION_ID}/store/items/${TARGET_ID}`,
      "PATCH",
      {
        adminOperation: "restock-store-item",
        itemId: TARGET_ID,
        quantity: 2,
      },
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: `/store/items/${TARGET_ID}`,
    gameSession: { id: GAME_SESSION_ID, name: "Test Game", status: "active" },
  });

  assertEquals(result.handled, true);
  if (!result.handled) throw new Error("Expected local route handling.");
  assertEquals(
    (result.body.data as Record<string, unknown>).quantityAdded,
    2,
  );
  assertEquals(service.calls[0]?.args.p_request_id, IDENTITY.requestId);
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Store image multipart fails closed before database mutation", async () => {
  const service = new FakeCompatibilityService([]);
  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      payload: { item: { name: "Image Item" } },
      idempotencyKey: IDENTITY.idempotencyKey,
    }),
  );
  form.append(
    "image",
    new File([new Uint8Array([1, 2, 3])], "item.png", {
      type: "image/png",
    }),
  );
  const result = await handleLocalAdminGameMutation(service as never, {
    request: new Request(
      `https://admin.test/games/${GAME_SESSION_ID}/store/items/${TARGET_ID}`,
      {
        method: "PATCH",
        headers: {
          "idempotency-key": IDENTITY.idempotencyKey,
          "x-request-id": IDENTITY.requestId,
        },
        body: form,
      },
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: `/store/items/${TARGET_ID}`,
    gameSession: { id: GAME_SESSION_ID, name: "Test Game", status: "active" },
  });

  assertEquals(result.handled, true);
  if (!result.handled) throw new Error("Expected local route handling.");
  assertEquals(result.status, 409);
  assertEquals(
    (result.body.error as Record<string, unknown>).code,
    "store_item_image_upload_not_configured",
  );
  assertEquals(service.calls.length, 0);
  assertEquals(service.directTableCalls, 0);
});

Deno.test("Direct Player archive and Settings reset suffixes enter the local dispatcher", async () => {
  const service = new FakeCompatibilityService([
    successRow({
      archived: true,
      destructiveDelete: false,
      alreadyArchived: false,
      player: { id: TARGET_ID, status: "archived" },
    }, 200),
    successRow({
      settings: {
        difficulty_preset: "moderate",
        attendance_window: {},
        business_market_window: {},
        stock_market_window: {},
        news_schedule: {},
        updated_at: "2026-08-05T00:00:00.000Z",
      },
      difficultyPolicy: null,
    }, 200),
  ]);
  const gameSession = {
    id: GAME_SESSION_ID,
    name: "Test Game",
    status: "active",
  };

  const archived = await handleLocalAdminGameMutation(service as never, {
    request: mutationRequest(
      `/games/${GAME_SESSION_ID}/players/${TARGET_ID}/archive`,
      "POST",
      {},
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: `/players/${TARGET_ID}/archive`,
    gameSession,
  });
  const reset = await handleLocalAdminGameMutation(service as never, {
    request: mutationRequest(
      `/games/${GAME_SESSION_ID}/settings/difficulty/reset`,
      "POST",
      {},
    ),
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    suffix: "/settings/difficulty/reset",
    gameSession,
  });

  assertEquals(archived.handled, true);
  assertEquals(reset.handled, true);
  assertEquals(service.calls.map((call) => call.name), [
    "admin_archive_player_v1",
    "admin_update_game_settings_v1",
  ]);
  assertEquals(service.directTableCalls, 0);
});

class FakeCompatibilityService implements AdminMutationRpcClient {
  readonly calls: Array<{
    readonly name: string;
    readonly args: Record<string, unknown>;
  }> = [];
  directTableCalls = 0;

  constructor(
    private readonly responses: Array<{
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    }>,
  ) {}

  rpc<T>(name: string, args: Record<string, unknown>): Promise<{
    readonly data: T | null;
    readonly error: { readonly message: string } | null;
  }> {
    this.calls.push({ name, args });
    const response = this.responses.shift() ?? {
      data: null,
      error: { message: "unexpected RPC" },
    };
    return Promise.resolve({
      data: response.data as T | null,
      error: response.error,
    });
  }

  from(_tableName: string): never {
    this.directTableCalls += 1;
    throw new Error("Direct table access is forbidden for these operations.");
  }
}

function successRow(
  responseBody: Record<string, unknown>,
  status: number,
  replayed = false,
) {
  return {
    data: [{
      response_status: status,
      response_body: responseBody,
      was_replayed: replayed,
    }],
    error: null,
  };
}

function mutationRequest(
  path: string,
  method: string,
  body: Record<string, unknown>,
): Request {
  return new Request(`https://admin.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": IDENTITY.idempotencyKey,
      "x-request-id": IDENTITY.requestId,
    },
    body: JSON.stringify(body),
  });
}

function contractRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: TARGET_ID,
    game_session_id: GAME_SESSION_ID,
    contract_template_id: null,
    contract_key: "trade-drive",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: STAFF_USER_ID,
    title: "Trade Drive",
    description: "Create an export plan.",
    instructions: "Submit the plan.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: {},
    completion_mode: "manual_review",
    published_at: null,
    deadline_at: null,
    expires_at: null,
    metadata: {},
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function storeItemRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: TARGET_ID,
    game_session_id: GAME_SESSION_ID,
    item_key: "trade_permit",
    name: "Trade Permit",
    description: null,
    category: "licenses",
    price: 25.46,
    currency_code: "NRC",
    stock_quantity: 4,
    status: "active",
    visibility: "visible",
    sort_order: 0,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
