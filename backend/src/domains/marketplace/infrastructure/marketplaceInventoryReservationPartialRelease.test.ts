import {
  applyMarketplaceReservationMutation,
  MARKETPLACE_RESERVATION_REASON,
  MarketplaceInventoryReservationError,
  type MarketplaceListingReservationState,
} from "./marketplaceInventoryReservationAdapter.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Marketplace purchase release may partially release a terminal buyer reservation", () => {
  const first = applyMarketplaceReservationMutation(state(6), {
    action: "release",
    quantity: 2,
    expectedVersion: 1,
    operationKey: "purchase-release-1",
    releaseReason: "purchase_released",
  });
  assertEquals(first.outcome, "applied");
  assertEquals(first.state.status, "active");
  assertEquals(first.state.quantity, 4);
  assertEquals(first.receipt.resultingQuantity, 4);

  const replay = applyMarketplaceReservationMutation(first.state, {
    action: "release",
    quantity: 2,
    expectedVersion: 1,
    operationKey: "purchase-release-1",
    releaseReason: "purchase_released",
  });
  assertEquals(replay.outcome, "replayed");
  assertEquals(replay.state.version, 2);
});

Deno.test("Marketplace final purchase release terminates the remaining authoritative reservation", () => {
  const result = applyMarketplaceReservationMutation(state(2), {
    action: "release",
    quantity: 2,
    expectedVersion: 1,
    operationKey: "purchase-release-final",
    releaseReason: "purchase_released",
  });
  assertEquals(result.state.status, "released");
  assertEquals(result.receipt.resultingQuantity, 0);
});

Deno.test("Marketplace cancellation, listing expiration, and rejection still require full release", () => {
  for (const releaseReason of ["listing_cancelled", "listing_expired", "listing_rejected"] as const) {
    assertError(() => applyMarketplaceReservationMutation(state(5), {
      action: "release",
      quantity: 2,
      expectedVersion: 1,
      operationKey: `partial-${releaseReason}`,
      releaseReason,
    }), "MARKETPLACE_RESERVATION_TRANSITION_INVALID");
  }
});

function state(quantity: number): MarketplaceListingReservationState {
  return {
    gameSessionId: "game-1",
    playerId: "seller-1",
    inventoryHoldingId: "holding-1",
    storeItemId: "item-1",
    itemKey: "data-chip",
    reasonType: MARKETPLACE_RESERVATION_REASON,
    sourceId: "listing-1",
    quantity,
    status: "active",
    version: 1,
    receipts: [],
  };
}

function assertError(run: () => unknown, code: string): void {
  let error: unknown;
  try { run(); } catch (value) { error = value; }
  if (!(error instanceof MarketplaceInventoryReservationError) || error.code !== code) {
    throw new Error(`Expected ${code}, received ${String(error)}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
