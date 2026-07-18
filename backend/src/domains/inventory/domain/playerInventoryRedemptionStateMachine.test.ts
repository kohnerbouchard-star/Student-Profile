import {
  canTransitionPlayerInventoryRedemption,
  reservationDispositionForTransition,
} from "./playerInventoryRedemptionStateMachine.ts";

declare const Deno: { test(name: string, run: () => void): void };

Deno.test("Redemption state machine permits only reviewed forward transitions", () => {
  for (
    const [from, to] of [
      ["pending", "approved"],
      ["pending", "rejected"],
      ["approved", "rejected"],
      ["approved", "fulfilled"],
    ] as const
  ) assert(canTransitionPlayerInventoryRedemption(from, to));

  for (
    const [from, to] of [
      ["pending", "fulfilled"],
      ["approved", "pending"],
      ["rejected", "pending"],
      ["rejected", "fulfilled"],
      ["fulfilled", "approved"],
      ["fulfilled", "rejected"],
    ] as const
  ) assert(!canTransitionPlayerInventoryRedemption(from, to));
});

Deno.test("Redemption state machine defines reservation effects and rejects repeated consumption", () => {
  assertEquals(reservationDispositionForTransition(null, "pending"), "reserve");
  assertEquals(
    reservationDispositionForTransition("pending", "approved"),
    "retain",
  );
  assertEquals(
    reservationDispositionForTransition("pending", "rejected"),
    "release",
  );
  assertEquals(
    reservationDispositionForTransition("approved", "rejected"),
    "release",
  );
  assertEquals(
    reservationDispositionForTransition("approved", "fulfilled"),
    "consume_once",
  );
  assertEquals(
    reservationDispositionForTransition("fulfilled", "fulfilled"),
    null,
  );
});

function assert(value: boolean): void {
  if (!value) throw new Error("Expected true");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Actual ${String(actual)}; expected ${String(expected)}`);
  }
}
