import type { PlayerInventoryApplicationContext } from "../contracts/playerInventoryApplicationContext.ts";
import type {
  PlayerInventoryRedemptionDto,
  PlayerInventoryRedemptionRepository,
} from "../contracts/playerInventoryRedemptionContracts.ts";
import { PlayerInventoryRedemptionService } from "./playerInventoryRedemptionService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CONTEXT = Object.freeze({
  gameSessionId: "00000000-0000-4000-8000-000000000001",
  actor: Object.freeze({
    kind: "player" as const,
    playerUuid: "00000000-0000-4000-8000-000000000002",
    playerSessionId: "00000000-0000-4000-8000-000000000003",
  }),
  role: "player" as const,
  permissions: Object.freeze(["own_player"] as const),
  requestId: "request-player-redemption-service-001",
}) satisfies PlayerInventoryApplicationContext;

const REDEMPTION: PlayerInventoryRedemptionDto = {
  id: `red_${"a".repeat(32)}`,
  itemId: "meal-pass",
  quantity: 2,
  status: "pending",
  requestNote: "Lunch",
  resolutionNote: null,
  requestedAt: "2026-07-18T12:00:00.000Z",
  reviewedAt: null,
  fulfilledAt: null,
  updatedAt: "2026-07-18T12:00:00.000Z",
};

Deno.test("redemption service preserves exact context and command identity for requests", async () => {
  const repository = new CapturingRepository();
  const service = new PlayerInventoryRedemptionService(repository);
  const command = Object.freeze({
    quantity: 2,
    note: "Lunch",
    idempotencyKey: "redeem:001",
  });
  const input = Object.freeze({
    applicationContext: CONTEXT,
    itemId: "meal-pass",
    command,
  });

  const result = await service.requestRedemption(input);

  assertSame(repository.requestInputs[0], input);
  assertSame(repository.requestInputs[0]?.applicationContext, CONTEXT);
  assertSame(repository.requestInputs[0]?.command, command);
  assertEquals("idempotencyContext" in CONTEXT, false);
  assertEquals(
    repository.requestInputs[0]?.command.idempotencyKey,
    "redeem:001",
  );
  assertEquals(result, { outcome: "created", redemption: REDEMPTION });
});

Deno.test("redemption service preserves exact context identity for reads", async () => {
  const repository = new CapturingRepository();
  const service = new PlayerInventoryRedemptionService(repository);
  const input = Object.freeze({
    applicationContext: CONTEXT,
    status: "pending" as const,
    limit: 25,
    offset: 0,
    requestId: null,
  });

  const result = await service.readRedemptions(input);

  assertSame(repository.readInputs[0], input);
  assertSame(repository.readInputs[0]?.applicationContext, CONTEXT);
  assertEquals(result, [REDEMPTION]);
});

class CapturingRepository implements PlayerInventoryRedemptionRepository {
  readonly requestInputs: Parameters<
    PlayerInventoryRedemptionRepository["request"]
  >[0][] = [];
  readonly readInputs: Parameters<
    PlayerInventoryRedemptionRepository["read"]
  >[0][] = [];

  request(
    input: Parameters<PlayerInventoryRedemptionRepository["request"]>[0],
  ) {
    this.requestInputs.push(input);
    return Promise.resolve({
      outcome: "created" as const,
      redemption: REDEMPTION,
    });
  }

  read(input: Parameters<PlayerInventoryRedemptionRepository["read"]>[0]) {
    this.readInputs.push(input);
    return Promise.resolve([REDEMPTION]);
  }
}

function assertSame(actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error("Expected identical references");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
