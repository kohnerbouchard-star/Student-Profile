import { SupabasePlayerInventoryReadRepository } from "./supabasePlayerInventoryReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const HOLDING = "00000000-0000-4000-8000-000000000101";
const ITEM = "00000000-0000-4000-8000-000000000201";
const NOW = "2026-07-18T07:00:00.000Z";

Deno.test("inventory repository joins scoped holdings to Store metadata", async () => {
  const repository = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [{
      id: HOLDING,
      game_session_id: GAME,
      player_id: PLAYER,
      store_item_id: ITEM,
      quantity_owned: 3,
      quantity_reserved: 1,
      created_at: NOW,
      updated_at: NOW,
    }],
    store_items: [{
      id: ITEM,
      game_session_id: GAME,
      item_key: "data_chip",
      name: "Data Chip",
      description: "Inventory item",
      category: "material",
      price: "4.50",
      currency_code: "ECO",
      status: "active",
      visibility: "visible",
    }],
  }) as never);

  const result = await repository.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
  });

  assertEquals(result.gameId, GAME);
  assertEquals(result.playerUuid, PLAYER);
  assertEquals(result.records[0], {
    internalHoldingUuid: HOLDING,
    internalStoreItemUuid: ITEM,
    gameId: GAME,
    playerUuid: PLAYER,
    itemKey: "data_chip",
    name: "Data Chip",
    description: "Inventory item",
    category: "material",
    unitValue: 4.5,
    currencyCode: "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    quantityOwned: 3,
    quantityReserved: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

Deno.test("inventory repository returns a valid empty result without querying item metadata", async () => {
  const accessed: string[] = [];
  const repository = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [],
    store_items: [],
  }, accessed) as never);

  const result = await repository.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
  });

  assertEquals(result.records, []);
  assertEquals(accessed, ["inventory_holdings"]);
});

Deno.test("inventory repository fails closed for missing metadata and persistence errors", async () => {
  const missingMetadata = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [{
      id: HOLDING,
      game_session_id: GAME,
      player_id: PLAYER,
      store_item_id: ITEM,
      quantity_owned: 1,
      quantity_reserved: 0,
      created_at: NOW,
      updated_at: NOW,
    }],
    store_items: [],
  }) as never);
  await assertRejects(() => missingMetadata.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
  }), "player_inventory_read_failed");

  const unavailable = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [],
    store_items: [],
  }, [], { table: "inventory_holdings", code: "42P01" }) as never);
  await assertRejects(() => unavailable.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
  }), "player_inventory_schema_not_applied");
});

function client(
  rows: Record<string, readonly Record<string, unknown>[]>,
  accessed: string[] = [],
  failure?: { readonly table: string; readonly code?: string },
) {
  return {
    from(tableName: string) {
      accessed.push(tableName);
      return {
        select() {
          return new FakeBuilder(
            failure?.table === tableName
              ? { data: null, error: { message: "relation does not exist", code: failure.code } }
              : { data: rows[tableName] ?? [], error: null },
          );
        },
      };
    },
  };
}

class FakeBuilder implements PromiseLike<{
  readonly data: readonly Record<string, unknown>[] | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
}> {
  constructor(private readonly response: {
    readonly data: readonly Record<string, unknown>[] | null;
    readonly error: { readonly message: string; readonly code?: string } | null;
  }) {}

  eq(): FakeBuilder {
    return this;
  }

  in(): FakeBuilder {
    return this;
  }

  order(): FakeBuilder {
    return this;
  }

  then<TResult1 = {
    readonly data: readonly Record<string, unknown>[] | null;
    readonly error: { readonly message: string; readonly code?: string } | null;
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      readonly data: readonly Record<string, unknown>[] | null;
      readonly error: { readonly message: string; readonly code?: string } | null;
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

async function assertRejects(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if ((error as { code?: string }).code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
