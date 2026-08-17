import type {
  PlayerInventoryReadRepository,
  PlayerInventoryRecord,
} from "../contracts/playerInventoryReadContracts.ts";
import { PlayerInventoryReadService } from "./playerInventoryReadService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-08-17T03:20:00.000Z";

Deno.test("inventory action policy prefers direct effects, exposes opt-in teacher redemption, and leaves passive items inert", async () => {
  const records = [
    record("automatic-token", { usable: true, redemptionMode: "teacher_approval" }),
    record("classroom-pass", { redemptionMode: "teacher_approval" }),
    record("steel-component"),
  ];
  const repository: PlayerInventoryReadRepository = {
    readInventory: ({ gameId, playerUuid }) => Promise.resolve({ gameId, playerUuid, records }),
  };

  const body = await new PlayerInventoryReadService(repository).readInventory({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  });
  const byKey = new Map(body.items.map((item) => [item.itemKey, item.availableActions]));

  assertEquals(byKey.get("automatic-token"), ["inventory.use"]);
  assertEquals(byKey.get("classroom-pass"), ["inventory.redeem"]);
  assertEquals(byKey.get("steel-component"), []);
});

function record(
  itemKey: string,
  options: { usable?: boolean; redemptionMode?: "teacher_approval" | null } = {},
): PlayerInventoryRecord {
  return {
    internalHoldingUuid: uuid(itemKey, 1),
    internalGameItemUuid: uuid(itemKey, 2),
    internalStoreItemUuid: null,
    gameId: GAME,
    playerUuid: PLAYER,
    itemKey,
    name: itemKey,
    description: null,
    category: "test",
    unitValue: 1,
    currencyCode: "ECO",
    itemStatus: "active",
    itemVisibility: "visible",
    usable: options.usable ?? false,
    redemptionMode: options.redemptionMode ?? null,
    quantityOwned: 1,
    quantityReserved: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function uuid(seed: string, suffix: number): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `00000000-0000-4000-8000-${String((hash + suffix) % 1_000_000_000_000).padStart(12, "0")}`;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
