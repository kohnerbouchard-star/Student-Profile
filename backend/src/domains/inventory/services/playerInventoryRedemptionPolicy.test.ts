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
const APPLICATION_CONTEXT = Object.freeze({
  gameSessionId: GAME,
  actor: Object.freeze({
    kind: "player" as const,
    playerUuid: PLAYER,
    playerSessionId: "00000000-0000-4000-8000-000000000011",
  }),
  role: "player" as const,
  permissions: Object.freeze(["own_player"] as const),
  requestId: "request-player-inventory-policy-001",
});

Deno.test("inventory action policy prefers direct effects, exposes opt-in teacher redemption, and leaves passive items inert", async () => {
  const records = [
    record("automatic-token", { usable: true, redemptionMode: "teacher_approval" }),
    record("classroom-pass", { redemptionMode: "teacher_approval" }),
    record("steel-component"),
  ];
  const repository: PlayerInventoryReadRepository = {
    readInventory: ({ applicationContext }) => Promise.resolve({
      gameId: applicationContext.gameSessionId,
      playerUuid: applicationContext.actor.playerUuid,
      records,
    }),
  };

  const body = await new PlayerInventoryReadService(repository).readInventory({
    applicationContext: APPLICATION_CONTEXT,
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
