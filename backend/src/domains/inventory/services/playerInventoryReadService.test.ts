import {
  type PlayerInventoryReadRepository,
  PlayerInventoryReadPersistenceError,
  type PlayerInventoryRecord,
} from "../contracts/playerInventoryReadContracts.ts";
import { PlayerInventoryReadService } from "./playerInventoryReadService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-07-18T07:00:00.000Z";

Deno.test("inventory service returns deterministic UUID-private inventory summaries", async () => {
  const service = new PlayerInventoryReadService(repository([
    record({
      holdingUuid: "00000000-0000-4000-8000-000000000101",
      storeItemUuid: "00000000-0000-4000-8000-000000000201",
      itemKey: "field_permit",
      category: "access",
      owned: 2,
      reserved: 1,
      unitValue: 12.5,
      currencyCode: "NRC",
    }),
    record({
      holdingUuid: "00000000-0000-4000-8000-000000000102",
      storeItemUuid: "00000000-0000-4000-8000-000000000202",
      itemKey: "data_chip",
      category: "material",
      owned: 3,
      reserved: 0,
      unitValue: 4,
      currencyCode: "ECO",
    }),
  ]));

  const body = await service.readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  });

  assertEquals(body.items.map((item) => item.id), ["field_permit", "data_chip"]);
  assertEquals(body.items[0].quantityAvailable, 1);
  assertEquals(body.items[0].storeItemId, "field_permit");
  assertEquals(body.items[0].availableActions, ["inventory.use"]);
  assertEquals(body.items[0].itemVisibility, "player");
  assertEquals(body.summary, {
    itemTypes: 2,
    quantityOwned: 5,
    quantityReserved: 1,
    quantityAvailable: 4,
    values: [
      { currencyCode: "ECO", totalOwnedValue: 12 },
      { currencyCode: "NRC", totalOwnedValue: 25 },
    ],
  });
  assertEquals(body.categories, ["access", "material"]);
  assertEquals(body.emptyState, null);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("inventory service distinguishes empty inventory from persistence unavailability", async () => {
  const empty = await new PlayerInventoryReadService(repository([])).readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  });
  assertEquals(empty.items, []);
  assertEquals(empty.emptyState, { reason: "inventory_empty" });

  const unavailable = new PlayerInventoryReadService({
    readInventory: () => Promise.reject(
      new PlayerInventoryReadPersistenceError(
        "player_inventory_read_failed",
        "read failed",
      ),
    ),
  });
  await assertRejects(
    () => unavailable.readInventory({
      gameId: GAME,
      playerUuid: PLAYER,
      effectiveAt: NOW,
    }),
    "player_inventory_service_unavailable",
  );
});

Deno.test("inventory service rejects cross-scope, duplicate public IDs, and invalid reservations", async () => {
  const otherGame = "00000000-0000-4000-8000-000000000002";
  await assertRejects(
    () => new PlayerInventoryReadService({
      readInventory: () => Promise.resolve({
        gameId: otherGame,
        playerUuid: PLAYER,
        records: [],
      }),
    }).readInventory({ gameId: GAME, playerUuid: PLAYER, effectiveAt: NOW }),
    "player_inventory_scope_violation",
  );

  const duplicate = record({
    holdingUuid: "00000000-0000-4000-8000-000000000103",
    storeItemUuid: "00000000-0000-4000-8000-000000000203",
    itemKey: "data_chip",
  });
  await assertRejects(
    () => new PlayerInventoryReadService(repository([
      record({ itemKey: "data_chip" }),
      duplicate,
    ])).readInventory({ gameId: GAME, playerUuid: PLAYER, effectiveAt: NOW }),
    "player_inventory_scope_violation",
  );

  await assertRejects(
    () => new PlayerInventoryReadService(repository([
      record({ owned: 1, reserved: 2 }),
    ])).readInventory({ gameId: GAME, playerUuid: PLAYER, effectiveAt: NOW }),
    "player_inventory_scope_violation",
  );
});

Deno.test("inventory service fails closed above the 200-holding maximum", async () => {
  const records = Array.from({ length: 201 }, (_value, index) => record({
    holdingUuid: scopedUuid(index + 1000),
    storeItemUuid: scopedUuid(index + 2000),
    itemKey: `item_${index}`,
  }));

  await assertRejects(
    () => new PlayerInventoryReadService(repository(records)).readInventory({
      gameId: GAME,
      playerUuid: PLAYER,
      effectiveAt: NOW,
    }),
    "player_inventory_scope_violation",
  );
});

function repository(records: readonly PlayerInventoryRecord[]): PlayerInventoryReadRepository {
  return {
    readInventory: (input) => Promise.resolve({
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      records,
    }),
  };
}

function record(options: {
  readonly holdingUuid?: string;
  readonly storeItemUuid?: string;
  readonly itemKey?: string;
  readonly category?: string;
  readonly owned?: number;
  readonly reserved?: number;
  readonly unitValue?: number;
  readonly currencyCode?: string;
} = {}): PlayerInventoryRecord {
  return {
    internalHoldingUuid: options.holdingUuid ?? "00000000-0000-4000-8000-000000000100",
    internalStoreItemUuid: options.storeItemUuid ?? "00000000-0000-4000-8000-000000000200",
    gameId: GAME,
    playerUuid: PLAYER,
    itemKey: options.itemKey ?? "energy_cell_pack",
    name: "Energy Cell Pack",
    description: "Inventory item",
    category: options.category ?? "consumable",
    unitValue: options.unitValue ?? 5,
    currencyCode: options.currencyCode ?? "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    quantityOwned: options.owned ?? 2,
    quantityReserved: options.reserved ?? 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function scopedUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
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

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked into browser response: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
