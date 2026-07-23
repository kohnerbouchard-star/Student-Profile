import {
  applyMarketplaceReservationMutation,
  assertInventoryReservationProjectionReconciled,
  assertMarketplaceRefundInventoryAvailable,
  classifyInventoryReservationSource,
  type GenericInventoryReservationSnapshot,
  MARKETPLACE_RESERVATION_REASON,
  MarketplaceInventoryReservationError,
  type MarketplaceListingReservationState,
  reconcileInventoryReservationProjection,
} from "./marketplaceInventoryReservationAdapter.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000099";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const HOLDING = "00000000-0000-4000-8000-000000000003";
const ITEM = "00000000-0000-4000-8000-000000000004";
const LISTING = "00000000-0000-4000-8000-000000000005";

Deno.test("Marketplace classifies generic reservation sources without claiming Crafting authority", () => {
  assertEquals(classifyInventoryReservationSource(MARKETPLACE_RESERVATION_REASON), "marketplace_listing");
  assertEquals(classifyInventoryReservationSource("crafting_input"), "crafting_input");
  assertEquals(classifyInventoryReservationSource("equipment_action"), "equipment_action");
  assertEquals(classifyInventoryReservationSource("future_domain"), "unknown");
});

Deno.test("Marketplace reconciliation derives availability from all active generic reservations", () => {
  const reconciliation = reconcileInventoryReservationProjection({
    gameSessionId: GAME,
    playerId: PLAYER,
    inventoryHoldingId: HOLDING,
    quantityOwned: 12,
    quantityReservedProjection: 9,
    reservations: [
      reservation({ reasonType: MARKETPLACE_RESERVATION_REASON, sourceId: LISTING, quantity: 4 }),
      reservation({ reasonType: "crafting_input", sourceId: "craft-job-1", quantity: 3 }),
      reservation({ reasonType: "equipment_action", sourceId: "equip-action-1", quantity: 1 }),
      reservation({ reasonType: "future_domain", sourceId: "future-source-1", quantity: 1 }),
      reservation({ reasonType: MARKETPLACE_RESERVATION_REASON, sourceId: "old-listing", quantity: 9, status: "released" }),
    ],
  });

  assertEquals(reconciliation, {
    authoritativeReserved: 9,
    marketplaceReserved: 4,
    craftingReserved: 3,
    equipmentReserved: 1,
    unknownReserved: 1,
    projectionReserved: 9,
    drift: 0,
    availableQuantity: 3,
    activeReservationCount: 4,
  });
  assertInventoryReservationProjectionReconciled(reconciliation);
});

Deno.test("Marketplace detects projection drift and wrong-game reservation rows fail closed", () => {
  const drift = reconcileInventoryReservationProjection({
    gameSessionId: GAME,
    playerId: PLAYER,
    inventoryHoldingId: HOLDING,
    quantityOwned: 10,
    quantityReservedProjection: 2,
    reservations: [reservation({ quantity: 4 })],
  });
  assertEquals(drift.drift, -2);
  assertError(
    () => assertInventoryReservationProjectionReconciled(drift),
    "MARKETPLACE_RESERVATION_PROJECTION_DRIFT",
  );

  assertError(
    () => reconcileInventoryReservationProjection({
      gameSessionId: GAME,
      playerId: PLAYER,
      inventoryHoldingId: HOLDING,
      quantityOwned: 10,
      quantityReservedProjection: 0,
      reservations: [reservation({ gameSessionId: OTHER_GAME })],
    }),
    "MARKETPLACE_RESERVATION_SCOPE_MISMATCH",
  );
});

Deno.test("Marketplace cancellation and expiration release the full remaining reservation exactly once", () => {
  const initial = listingReservation(5);
  assertError(
    () => applyMarketplaceReservationMutation(initial, {
      action: "release",
      quantity: 2,
      expectedVersion: 1,
      operationKey: "marketplace.release.partial.0001",
      releaseReason: "listing_cancelled",
    }),
    "MARKETPLACE_RESERVATION_TRANSITION_INVALID",
  );

  const applied = applyMarketplaceReservationMutation(initial, {
    action: "release",
    quantity: 5,
    expectedVersion: 1,
    operationKey: "marketplace.release.cancel.0001",
    releaseReason: "listing_cancelled",
  });
  assertEquals(applied.outcome, "applied");
  assertEquals(applied.state.status, "released");
  assertEquals(applied.state.quantity, 5);
  assertEquals(applied.state.version, 2);

  const replayed = applyMarketplaceReservationMutation(applied.state, {
    action: "release",
    quantity: 5,
    expectedVersion: 1,
    operationKey: "marketplace.release.cancel.0001",
    releaseReason: "listing_cancelled",
  });
  assertEquals(replayed.outcome, "replayed");
  assertEquals(replayed.receipt, applied.receipt);

  assertError(
    () => applyMarketplaceReservationMutation(applied.state, {
      action: "release",
      quantity: 5,
      expectedVersion: 2,
      operationKey: "marketplace.release.expiry.0001",
      releaseReason: "listing_expired",
    }),
    "MARKETPLACE_RESERVATION_TRANSITION_INVALID",
  );
});

Deno.test("Concurrent buyers consume one listing reservation with stale-version and duplicate-request protection", () => {
  const initial = listingReservation(5);
  const first = applyMarketplaceReservationMutation(initial, {
    action: "consume",
    quantity: 3,
    expectedVersion: 1,
    operationKey: "marketplace.consume.order-1",
  });
  assertEquals(first.state.status, "active");
  assertEquals(first.state.quantity, 2);
  assertEquals(first.state.version, 2);

  assertError(
    () => applyMarketplaceReservationMutation(first.state, {
      action: "consume",
      quantity: 2,
      expectedVersion: 1,
      operationKey: "marketplace.consume.order-2",
    }),
    "MARKETPLACE_RESERVATION_STALE_VERSION",
  );

  const second = applyMarketplaceReservationMutation(first.state, {
    action: "consume",
    quantity: 2,
    expectedVersion: 2,
    operationKey: "marketplace.consume.order-2",
  });
  assertEquals(second.state.status, "consumed");
  assertEquals(second.state.version, 3);
  assertEquals(second.state.receipts.length, 2);

  const replayed = applyMarketplaceReservationMutation(second.state, {
    action: "consume",
    quantity: 2,
    expectedVersion: 2,
    operationKey: "marketplace.consume.order-2",
  });
  assertEquals(replayed.outcome, "replayed");
  assertEquals(replayed.state.version, 3);

  assertError(
    () => applyMarketplaceReservationMutation(second.state, {
      action: "consume",
      quantity: 1,
      expectedVersion: 3,
      operationKey: "marketplace.consume.order-2",
    }),
    "MARKETPLACE_RESERVATION_IDEMPOTENCY_CONFLICT",
  );
});

Deno.test("Marketplace refunds exclude inventory reserved by Crafting and other authoritative sources", () => {
  const reconciliation = reconcileInventoryReservationProjection({
    gameSessionId: GAME,
    playerId: PLAYER,
    inventoryHoldingId: HOLDING,
    quantityOwned: 10,
    quantityReservedProjection: 7,
    reservations: [
      reservation({ reasonType: MARKETPLACE_RESERVATION_REASON, quantity: 4 }),
      reservation({ reasonType: "crafting_input", sourceId: "craft-job-refund", quantity: 3 }),
    ],
  });

  assertMarketplaceRefundInventoryAvailable(reconciliation, 3);
  assertError(
    () => assertMarketplaceRefundInventoryAvailable(reconciliation, 4),
    "MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE",
  );
});

Deno.test("Marketplace cannot mutate Crafting-owned reservation sources", () => {
  const crafting = {
    ...listingReservation(2),
    reasonType: "crafting_input",
  } as unknown as MarketplaceListingReservationState;
  assertError(
    () => applyMarketplaceReservationMutation(crafting, {
      action: "consume",
      quantity: 1,
      expectedVersion: 1,
      operationKey: "marketplace.consume.foreign.0001",
    }),
    "MARKETPLACE_RESERVATION_SOURCE_INVALID",
  );
});

function listingReservation(quantity: number): MarketplaceListingReservationState {
  return {
    gameSessionId: GAME,
    playerId: PLAYER,
    inventoryHoldingId: HOLDING,
    storeItemId: ITEM,
    itemKey: "data-chip",
    reasonType: MARKETPLACE_RESERVATION_REASON,
    sourceId: LISTING,
    quantity,
    status: "active",
    version: 1,
    receipts: [],
  };
}

function reservation(
  overrides: Partial<GenericInventoryReservationSnapshot> = {},
): GenericInventoryReservationSnapshot {
  return {
    gameSessionId: GAME,
    playerId: PLAYER,
    inventoryHoldingId: HOLDING,
    storeItemId: ITEM,
    itemKey: "data-chip",
    reasonType: MARKETPLACE_RESERVATION_REASON,
    sourceId: LISTING,
    quantity: 1,
    status: "active",
    ...overrides,
  };
}

function assertError(run: () => unknown, code: string): void {
  let error: unknown;
  try {
    run();
  } catch (value) {
    error = value;
  }
  if (!(error instanceof MarketplaceInventoryReservationError)) {
    throw new Error(`Expected MarketplaceInventoryReservationError, received ${String(error)}`);
  }
  assertEquals(error.code, code);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
