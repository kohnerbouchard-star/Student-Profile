import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import { mutateAdminStoreItem } from "./adminStoreItemMutation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_USER_ID = "00000000-0000-4000-8000-000000000002";
const ITEM_ID = "00000000-0000-4000-8000-000000000003";
const IDENTITY = {
  idempotencyKey: "store-mutation-test-key",
  requestId: "store-mutation-request",
};

Deno.test("admin Store create derives game and staff RPC authority", async () => {
  const client = new FakeMutationClient(successRow(storeItemRow()));
  const result = await mutateAdminStoreItem(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "create",
    body: {
      gameSessionId: "00000000-0000-4000-8000-000000000099",
      itemKey: "trade_permit",
      name: "  Trade Permit  ",
      category: "LICENSES",
      currencyCode: "nrc",
      price: 25.456,
      stockQuantity: 4,
    },
    identity: IDENTITY,
  });

  assertEquals(result.status, 201);
  assertEquals(result.item.gameSessionId, GAME_SESSION_ID);
  assertEquals(client.calls.length, 1);
  assertEquals(client.calls[0]?.name, "admin_mutate_store_item_v1");
  assertEquals(client.calls[0]?.args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.calls[0]?.args.p_staff_user_id, STAFF_USER_ID);
  assertEquals(client.calls[0]?.args.p_item_id, null);
  assertEquals(client.calls[0]?.args.p_item_payload, {
    itemKey: "trade_permit",
    name: "Trade Permit",
    description: null,
    category: "licenses",
    price: 25.46,
    currencyCode: "NRC",
    stockQuantity: 4,
    status: "active",
    visibility: "visible",
    sortOrder: 0,
  });
  assertEquals(
    client.calls[0]?.args.p_idempotency_key,
    IDENTITY.idempotencyKey,
  );
  assertEquals(client.calls[0]?.args.p_request_id, IDENTITY.requestId);
});

Deno.test("admin Store delete is a local soft archive mutation", async () => {
  const client = new FakeMutationClient(successRow(
    storeItemRow({
      status: "archived",
      visibility: "hidden",
    }),
    200,
  ));

  const result = await mutateAdminStoreItem(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "archive",
    itemId: ITEM_ID,
    body: { status: "active", visibility: "visible", name: "ignored" },
    identity: IDENTITY,
  });

  assertEquals(result.item.status, "archived");
  assertEquals(client.calls[0]?.args.p_operation, "archive");
  assertEquals(client.calls[0]?.args.p_item_id, ITEM_ID);
  assertEquals(client.calls[0]?.args.p_item_payload, {
    status: "archived",
    visibility: "hidden",
  });
});

Deno.test("admin Store restock canonicalizes compatibility quantity aliases", async () => {
  const client = new FakeMutationClient(successRow(
    storeItemRow({ stock_quantity: 8 }),
    200,
  ));

  const result = await mutateAdminStoreItem(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "restock",
    itemId: ITEM_ID,
    body: { restockQuantity: "4" },
    identity: IDENTITY,
  });

  assertEquals(result.status, 200);
  assertEquals(result.quantityAdded, 4);
  assertEquals(result.item.stockQuantity, 8);
  assertEquals(client.calls[0]?.args.p_operation, "restock");
  assertEquals(client.calls[0]?.args.p_item_payload, { quantity: 4 });
  assertEquals(client.calls[0]?.args.p_request_payload, {
    operation: "restock",
    itemId: ITEM_ID,
    item: { quantity: 4 },
  });
});

Deno.test("admin Store rebalance canonicalizes price before persistence", async () => {
  const client = new FakeMutationClient(successRow(
    storeItemRow({ price: 44.57 }),
    200,
  ));

  const result = await mutateAdminStoreItem(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "rebalance",
    itemId: ITEM_ID,
    body: { targetPrice: "44.567" },
    identity: IDENTITY,
  });

  assertEquals(result.item.price, 44.57);
  assertEquals(client.calls[0]?.args.p_operation, "rebalance");
  assertEquals(client.calls[0]?.args.p_item_payload, { price: 44.57 });
});

Deno.test("admin Store mutation exposes an exact RPC replay", async () => {
  const client = new FakeMutationClient(successRow(storeItemRow(), 201, true));
  const result = await mutateAdminStoreItem(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "create",
    body: {
      name: "Trade Permit",
      currencyCode: "NRC",
    },
    identity: IDENTITY,
  });

  assertEquals(result.replayed, true);
  assertEquals(result.item.id, ITEM_ID);
});

Deno.test("admin Store mutation maps key reuse with another payload to 409", async () => {
  const client = new FakeMutationClient({
    data: null,
    error: { message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT" },
  });

  await assertMutationError(
    () =>
      mutateAdminStoreItem(client, {
        gameSessionId: GAME_SESSION_ID,
        staffUserId: STAFF_USER_ID,
        operation: "create",
        body: { name: "Trade Permit", currencyCode: "NRC" },
        identity: IDENTITY,
      }),
    409,
    "idempotency_key_conflict",
  );
});

Deno.test("admin Store database failure never returns a success result", async () => {
  const client = new FakeMutationClient({
    data: null,
    error: { message: "database connection failed" },
  });

  await assertMutationError(
    () =>
      mutateAdminStoreItem(client, {
        gameSessionId: GAME_SESSION_ID,
        staffUserId: STAFF_USER_ID,
        operation: "update",
        itemId: ITEM_ID,
        body: { price: 50 },
        identity: IDENTITY,
      }),
    500,
    "store_item_mutation_failed",
  );
});

class FakeMutationClient implements AdminMutationRpcClient {
  readonly calls: Array<{
    readonly name: string;
    readonly args: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly response: {
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    },
  ) {}

  rpc<T>(name: string, args: Record<string, unknown>): Promise<{
    readonly data: T | null;
    readonly error: { readonly message: string } | null;
  }> {
    this.calls.push({ name, args });
    return Promise.resolve({
      data: this.response.data as T | null,
      error: this.response.error,
    });
  }
}

function successRow(
  item: Record<string, unknown>,
  status = 201,
  replayed = false,
  response: Record<string, unknown> = {},
) {
  return {
    data: [{
      response_status: status,
      response_body: { item, ...response },
      was_replayed: replayed,
    }],
    error: null,
  };
}

function storeItemRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ITEM_ID,
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

async function assertMutationError(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof AdminMutationError)) {
      throw error;
    }
    assertEquals(error.status, status);
    assertEquals(error.code, code);
    return;
  }

  throw new Error("Expected AdminMutationError.");
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
