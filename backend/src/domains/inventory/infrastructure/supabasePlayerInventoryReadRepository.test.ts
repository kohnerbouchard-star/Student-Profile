import { SupabasePlayerInventoryReadRepository } from "./supabasePlayerInventoryReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const HOLDING = "00000000-0000-4000-8000-000000000101";
const GAME_ITEM = "00000000-0000-4000-8000-000000000151";
const STORE_ITEM = "00000000-0000-4000-8000-000000000201";
const ACCOUNT = "00000000-0000-4000-8000-000000000251";
const NOW = "2026-08-06T07:00:00.000Z";
const LIMIT = 200;

Deno.test("inventory repository preserves Store public metadata while joining canonical ownership", async () => {
  const repository = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [{
      id: HOLDING,
      game_session_id: GAME,
      player_id: PLAYER,
      store_item_id: STORE_ITEM,
      inventory_account_id: ACCOUNT,
      game_item_id: GAME_ITEM,
      quantity_owned: 3,
      quantity_reserved: 1,
      average_unit_cost: "3.75",
      cost_currency_code: "NRC",
      created_at: NOW,
      updated_at: NOW,
    }],
    game_items: [{
      id: GAME_ITEM,
      game_session_id: GAME,
      canonical_key: "sensor-board",
      name: "Sensor Board",
      description: "Canonical inventory item",
      item_class: "component",
      subtype: "electronics",
      status: "active",
      metadata: { effectEnabled: false, currencyCode: "NRC" },
    }],
    store_items: [{
      id: STORE_ITEM,
      game_session_id: GAME,
      game_item_id: GAME_ITEM,
      item_key: "beta-nort-sensor-board",
      name: "Northreach Sensor Board",
      description: "Store-facing catalog copy",
      category: "beta-components",
      price: "4.50",
      currency_code: "ECO",
      status: "active",
      visibility: "visible",
    }],
  }) as never);

  const result = await repository.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
  });

  assertEquals(result.gameId, GAME);
  assertEquals(result.playerUuid, PLAYER);
  assertEquals(result.records[0], {
    internalHoldingUuid: HOLDING,
    internalGameItemUuid: GAME_ITEM,
    internalStoreItemUuid: STORE_ITEM,
    gameId: GAME,
    playerUuid: PLAYER,
    itemKey: "beta-nort-sensor-board",
    name: "Northreach Sensor Board",
    description: "Store-facing catalog copy",
    category: "beta-components",
    unitValue: 4.5,
    currencyCode: "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    usable: false,
    quantityOwned: 3,
    quantityReserved: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

Deno.test("inventory repository reads crafted ownership without a Store offer", async () => {
  const accessed: string[] = [];
  const repository = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [{
      id: HOLDING,
      game_session_id: GAME,
      player_id: PLAYER,
      store_item_id: null,
      inventory_account_id: ACCOUNT,
      game_item_id: GAME_ITEM,
      quantity_owned: 2,
      quantity_reserved: 0,
      average_unit_cost: "2.25",
      cost_currency_code: "NRC",
      created_at: NOW,
      updated_at: NOW,
    }],
    game_items: [{
      id: GAME_ITEM,
      game_session_id: GAME,
      canonical_key: "field-repair-kit",
      name: "Field Repair Kit",
      description: "Crafted output",
      item_class: "consumable",
      subtype: "repair",
      status: "active",
      metadata: { effectEnabled: true, currencyCode: "ECO" },
    }],
    store_items: [],
  }, accessed) as never);

  const result = await repository.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
  });

  assertEquals(result.records[0]?.internalStoreItemUuid, null);
  assertEquals(result.records[0]?.itemKey, "field-repair-kit");
  assertEquals(result.records[0]?.name, "Field Repair Kit");
  assertEquals(result.records[0]?.category, "consumable");
  assertEquals(result.records[0]?.unitValue, 2.25);
  assertEquals(result.records[0]?.usable, true);
  assertEquals(result.records[0]?.currencyCode, "NRC");
  assertEquals(accessed, ["inventory_holdings", "game_items"]);
});

Deno.test("inventory repository returns a valid empty result without querying metadata", async () => {
  const accessed: string[] = [];
  const repository = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [],
    game_items: [],
    store_items: [],
  }, accessed) as never);

  const result = await repository.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
  });

  assertEquals(result.records, []);
  assertEquals(accessed, ["inventory_holdings"]);
});

Deno.test("inventory repository fails closed for missing canonical metadata, inconsistent Store provenance, and persistence errors", async () => {
  const holding = {
    id: HOLDING,
    game_session_id: GAME,
    player_id: PLAYER,
    store_item_id: STORE_ITEM,
    inventory_account_id: ACCOUNT,
    game_item_id: GAME_ITEM,
    quantity_owned: 1,
    quantity_reserved: 0,
    average_unit_cost: "1.00",
    cost_currency_code: "ECO",
    created_at: NOW,
    updated_at: NOW,
  };

  const missingMetadata = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [holding],
    game_items: [],
    store_items: [],
  }) as never);
  await assertRejects(() => missingMetadata.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
  }), "player_inventory_metadata_missing");

  const mismatchedStore = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [holding],
    game_items: [{
      id: GAME_ITEM,
      game_session_id: GAME,
      canonical_key: "data-chip",
      name: "Data Chip",
      description: null,
      item_class: "material",
      subtype: "general",
      status: "active",
      metadata: {},
    }],
    store_items: [{
      id: STORE_ITEM,
      game_session_id: GAME,
      game_item_id: "00000000-0000-4000-8000-000000000999",
      item_key: "beta-nort-data-chip",
      name: "Data Chip",
      description: null,
      category: "beta-materials",
      price: "1.00",
      currency_code: "ECO",
      status: "active",
      visibility: "visible",
    }],
  }) as never);
  await assertRejects(() => mismatchedStore.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
  }), "player_inventory_metadata_missing");

  const unavailable = new SupabasePlayerInventoryReadRepository(client({
    inventory_holdings: [],
    game_items: [],
    store_items: [],
  }, [], { table: "inventory_holdings", code: "42P01" }) as never);
  await assertRejects(() => unavailable.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    limit: LIMIT,
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

  gt(): FakeBuilder {
    return this;
  }

  in(): FakeBuilder {
    return this;
  }

  order(): FakeBuilder {
    return this;
  }

  limit(): FakeBuilder {
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
