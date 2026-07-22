import {
  applyCraftingInvariantCommand,
  assertCraftingInventoryInvariant,
  type CraftingInvariantState,
} from "./craftingInvariantModel.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertThrows(fn: () => unknown, message: string): void {
  try {
    fn();
  } catch (error) {
    if (String((error as Error).message).includes(message)) return;
    throw error;
  }
  throw new Error(`expected ${message}`);
}

function state(): CraftingInvariantState {
  return {
    inputs: {
      iron: { owned: 5, reserved: 2, consumed: 0, granted: 0, status: "active" },
      polymer: { owned: 3, reserved: 1, consumed: 0, granted: 0, status: "active" },
    },
    claimKey: null,
    cancellationKey: null,
    outputQuantity: 0,
    jobStatus: "in_progress",
  };
}

Deno.test("crafting claim consumes reservations and grants output exactly once", () => {
  const first = applyCraftingInvariantCommand(state(), { kind: "claim", idempotencyKey: "claim-1" });
  const replay = applyCraftingInvariantCommand(first, { kind: "claim", idempotencyKey: "claim-1" });
  assertEquals(replay, first);
  assertCraftingInventoryInvariant(replay);
  assertEquals(replay.inputs.iron, {
    owned: 3, reserved: 0, consumed: 2, granted: 0, status: "consumed",
  });
  assertEquals(replay.outputQuantity, 1);
});

Deno.test("a different claim key cannot replay a committed output", () => {
  const claimed = applyCraftingInvariantCommand(state(), { kind: "claim", idempotencyKey: "claim-1" });
  assertThrows(
    () => applyCraftingInvariantCommand(claimed, { kind: "claim", idempotencyKey: "claim-2" }),
    "claim_conflict",
  );
  assertEquals(claimed.outputQuantity, 1);
});

Deno.test("crafting cancellation releases reservations without consuming inputs", () => {
  const cancelled = applyCraftingInvariantCommand(state(), { kind: "cancel", idempotencyKey: "cancel-1" });
  const replay = applyCraftingInvariantCommand(cancelled, { kind: "cancel", idempotencyKey: "cancel-1" });
  assertEquals(replay, cancelled);
  assertCraftingInventoryInvariant(cancelled);
  assertEquals(cancelled.inputs.iron.owned, 5);
  assertEquals(cancelled.inputs.iron.reserved, 0);
  assertEquals(cancelled.outputQuantity, 0);
});

Deno.test("a different cancellation key cannot replay released reservations", () => {
  const cancelled = applyCraftingInvariantCommand(state(), { kind: "cancel", idempotencyKey: "cancel-1" });
  assertThrows(
    () => applyCraftingInvariantCommand(cancelled, { kind: "cancel", idempotencyKey: "cancel-2" }),
    "cancel_conflict",
  );
});

Deno.test("claim and cancellation race has one authoritative winner", () => {
  const claimed = applyCraftingInvariantCommand(state(), { kind: "claim", idempotencyKey: "claim-1" });
  assertThrows(
    () => applyCraftingInvariantCommand(claimed, { kind: "cancel", idempotencyKey: "cancel-1" }),
    "cancel_conflict",
  );
  const cancelled = applyCraftingInvariantCommand(state(), { kind: "cancel", idempotencyKey: "cancel-1" });
  assertThrows(
    () => applyCraftingInvariantCommand(cancelled, { kind: "claim", idempotencyKey: "claim-1" }),
    "claim_conflict",
  );
});

Deno.test("claim rejects missing or over-reserved material projections", () => {
  const missingReservation: CraftingInvariantState = {
    ...state(),
    inputs: {
      ...state().inputs,
      iron: { ...state().inputs.iron, reserved: 0 },
    },
  };
  const overReserved: CraftingInvariantState = {
    ...state(),
    inputs: {
      ...state().inputs,
      iron: { ...state().inputs.iron, owned: 1, reserved: 2 },
    },
  };
  assertThrows(
    () => applyCraftingInvariantCommand(missingReservation, { kind: "claim", idempotencyKey: "claim-missing" }),
    "reservation_invariant",
  );
  assertThrows(
    () => applyCraftingInvariantCommand(overReserved, { kind: "claim", idempotencyKey: "claim-over" }),
    "reservation_invariant",
  );
  assertThrows(() => assertCraftingInventoryInvariant(overReserved), "inventory_invariant");
});

Deno.test("cancellation permits a zero-reservation line without changing ownership", () => {
  const zeroReservation: CraftingInvariantState = {
    ...state(),
    inputs: {
      ...state().inputs,
      iron: { ...state().inputs.iron, reserved: 0 },
    },
  };
  const cancelled = applyCraftingInvariantCommand(
    zeroReservation,
    { kind: "cancel", idempotencyKey: "cancel-zero" },
  );
  assertCraftingInventoryInvariant(cancelled);
  assertEquals(cancelled.inputs.iron.owned, zeroReservation.inputs.iron.owned);
  assertEquals(cancelled.inputs.iron.status, "released");
});
