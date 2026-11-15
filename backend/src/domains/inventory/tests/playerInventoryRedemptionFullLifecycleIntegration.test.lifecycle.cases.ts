import { handlePlayerInventoryRedemptionRequest } from "../api/playerInventoryRedemptionHttpHandler.ts";
import {
  adminQueue,
  adminReview,
  assertEquals,
  assertNoUuid,
  GAME,
  OTHER_GAME,
  playerApplicationContext,
  playerDependencies,
  playerHttpRequest,
  playerRequest,
  readReviewOutcome,
  readReviewStatus,
  SharedRedemptionState,
} from "./playerInventoryRedemptionFullLifecycleIntegration.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("connected Store-owned Inventory redemption lifecycle is idempotent, scoped, and UUID-private", async () => {
  const state = new SharedRedemptionState();

  const created = await playerRequest(state, {
    quantity: 2,
    note: "Use at the classroom store.",
    idempotencyKey: "redeem:meal-pass:001",
  });
  assertEquals(created.status, 201);
  const createdBody = await created.json();
  assertEquals(createdBody.outcome, "created");
  const requestId = createdBody.redemption.id as string;
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });
  assertEquals(state.transitions.map((entry) => entry.to), ["pending"]);
  assertEquals(state.inventoryEvents, ["redemption_requested"]);
  assertNoUuid(createdBody);

  const replay = await playerRequest(state, {
    quantity: 2,
    note: "Use at the classroom store.",
    idempotencyKey: "redeem:meal-pass:001",
  });
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).outcome, "replayed");
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });
  assertEquals(state.transitions.length, 1);
  assertEquals(state.inventoryEvents.length, 1);

  const conflict = await playerRequest(state, {
    quantity: 1,
    note: "Changed payload for the same key.",
    idempotencyKey: "redeem:meal-pass:001",
  });
  assertEquals(conflict.status, 409);
  assertEquals(
    (await conflict.json()).error.code,
    "player_inventory_redemption_idempotency_conflict",
  );
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });
  assertEquals(state.transitions.length, 1);
  assertEquals(state.inventoryEvents.length, 1);

  const pendingQueue = await adminQueue(state, GAME, "pending");
  assertEquals(pendingQueue.status, 200);
  const pendingBody = pendingQueue.body as {
    data: { redemptions: Array<{ id: string; status: string }> };
  };
  assertEquals(pendingBody.data.redemptions, [{
    ...pendingBody.data.redemptions[0],
    id: requestId,
    status: "pending",
  }]);
  assertNoUuid(pendingBody);

  const approved = await adminReview(
    state,
    GAME,
    requestId,
    "approve",
    "Approved for pickup.",
    "admin:approve:001",
  );
  assertEquals(approved.status, 200);
  assertEquals(readReviewOutcome(approved), "applied");
  assertEquals(readReviewStatus(approved), "approved");
  assertEquals(state.holding, { quantityOwned: 4, quantityReserved: 2 });

  const approveReplay = await adminReview(
    state,
    GAME,
    requestId,
    "approve",
    "Approved for pickup.",
    "admin:approve:001",
  );
  assertEquals(readReviewOutcome(approveReplay), "replayed");
  assertEquals(state.transitions.map((entry) => entry.to), ["pending", "approved"]);

  const fulfilled = await adminReview(
    state,
    GAME,
    requestId,
    "fulfill",
    "Handed to player.",
    "admin:fulfill:001",
  );
  assertEquals(fulfilled.status, 200);
  assertEquals(readReviewStatus(fulfilled), "fulfilled");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.inventoryEvents, [
    "redemption_requested",
    "redemption_fulfillment_release",
    "redemption_fulfilled",
  ]);

  const fulfillReplay = await adminReview(
    state,
    GAME,
    requestId,
    "fulfill",
    "Handed to player.",
    "admin:fulfill:001",
  );
  assertEquals(readReviewOutcome(fulfillReplay), "replayed");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.transitions.map((entry) => entry.to), [
    "pending",
    "approved",
    "fulfilled",
  ]);

  const playerHistory = await handlePlayerInventoryRedemptionRequest(
    playerHttpRequest("GET", `/players/me/inventory/redemptions/${requestId}`),
    { kind: "item", requestId },
    playerDependencies(state),
  );
  assertEquals(playerHistory.status, 200);
  const playerHistoryBody = await playerHistory.json();
  assertEquals(playerHistoryBody.redemption.status, "fulfilled");
  assertNoUuid(playerHistoryBody);

  const secondCreated = await playerRequest(state, {
    quantity: 1,
    note: "Changed my mind after review.",
    idempotencyKey: "redeem:meal-pass:002",
  });
  const secondId = (await secondCreated.json()).redemption.id as string;
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 1 });

  const rejected = await adminReview(
    state,
    GAME,
    secondId,
    "reject",
    "Request withdrawn.",
    "admin:reject:002",
  );
  assertEquals(rejected.status, 200);
  assertEquals(readReviewStatus(rejected), "rejected");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });
  assertEquals(state.inventoryEvents.at(-1), "redemption_rejected");

  const invalidFulfill = await adminReview(
    state,
    GAME,
    secondId,
    "fulfill",
    "Must not consume twice.",
    "admin:fulfill:invalid",
  );
  assertEquals(invalidFulfill.status, 409);
  assertEquals((invalidFulfill.body as { code: string }).code, "inventory_redemption_transition_invalid");
  assertEquals(state.holding, { quantityOwned: 2, quantityReserved: 0 });

  const wrongGameQueue = await adminQueue(state, OTHER_GAME, "pending");
  assertEquals(wrongGameQueue.status, 404);
  assertNoUuid(wrongGameQueue.body);

  const wrongGamePlayerRead = await handlePlayerInventoryRedemptionRequest(
    playerHttpRequest("GET", "/players/me/inventory/redemptions"),
    { kind: "collection" },
    playerDependencies(state),
    playerApplicationContext(OTHER_GAME),
  );
  assertEquals(wrongGamePlayerRead.status, 404);
  assertEquals(
    (await wrongGamePlayerRead.json()).error.code,
    "player_inventory_redemption_unavailable",
  );

  const allHistory = await handlePlayerInventoryRedemptionRequest(
    playerHttpRequest("GET", "/players/me/inventory/redemptions"),
    { kind: "collection" },
    playerDependencies(state),
  );
  assertEquals(allHistory.status, 200);
  const allHistoryBody = await allHistory.json();
  assertEquals(allHistoryBody.requests.map((item: { status: string }) => item.status), [
    "rejected",
    "fulfilled",
  ]);
  assertNoUuid(allHistoryBody);
});
