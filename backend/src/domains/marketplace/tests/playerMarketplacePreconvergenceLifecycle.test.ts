import {
  applyMarketplaceReservationMutation,
  assertMarketplaceRefundInventoryAvailable,
  MARKETPLACE_RESERVATION_REASON,
  type MarketplaceListingReservationState,
  reconcileInventoryReservationProjection,
} from "../infrastructure/marketplaceInventoryReservationAdapter.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type GameState = "active" | "paused" | "ended";
type SessionState = "active" | "expired";
type ListingStatus = "draft" | "active" | "moderation_hold" | "sold_out" | "cancelled" | "expired" | "rejected";

type Listing = {
  id: string;
  gameId: string;
  sellerId: string;
  itemKey: string;
  quantity: number;
  unitPrice: number;
  feeRate: number;
  taxRate: number;
  status: ListingStatus;
  version: number;
  reservation: MarketplaceListingReservationState;
};

type Order = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  subtotal: number;
  fee: number;
  tax: number;
  total: number;
  status: "completed" | "disputed" | "refunded";
};

type Context = {
  gameId: string;
  playerId: string;
  gameState: GameState;
  sessionState: SessionState;
};

const GAME = "game-marketplace-1";
const SELLER = "seller-1";
const BUYER = "buyer-1";
const HOLDING = "holding-seller-data-chip";
const BUYER_HOLDING = "holding-buyer-data-chip";
const ITEM = "item-data-chip";

Deno.test("Marketplace lifecycle settles partial and final purchases exactly once with server fees and taxes", () => {
  const state = fixture();
  const listing = createListing(state, context(SELLER), {
    id: "listing-1",
    quantity: 5,
    unitPrice: 20,
    feeRate: 0.025,
    taxRate: 0.05,
    key: "create-listing-1",
  });
  activateListing(listing, 1);

  assertEquals(searchListings(state, GAME).map((item) => item.id), ["listing-1"]);

  const first = purchase(state, context(BUYER), listing, 2, 2, "purchase-1");
  assertEquals(first, {
    id: "order-purchase-1",
    listingId: "listing-1",
    buyerId: BUYER,
    sellerId: SELLER,
    quantity: 2,
    subtotal: 40,
    fee: 1,
    tax: 2,
    total: 43,
    status: "completed",
  });
  assertEquals(listing.quantity, 3);
  assertEquals(listing.reservation.status, "active");
  assertEquals(listing.reservation.quantity, 3);
  assertEquals(state.cash.get(SELLER), 40);
  assertEquals(state.cash.get(BUYER), 957);
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 3);
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 2);
  assertEquals(state.fees, 1);
  assertEquals(state.taxes, 2);

  const replay = purchase(state, context(BUYER), listing, 2, 2, "purchase-1");
  assertEquals(replay, first);
  assertEquals(state.orders.size, 1);
  assertEquals(state.cash.get(SELLER), 40);

  const final = purchase(state, context(BUYER), listing, 3, 3, "purchase-2");
  assertEquals(final.quantity, 3);
  assertEquals(listing.status, "sold_out");
  assertEquals(listing.reservation.status, "consumed");
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 0);
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 5);
  assertEquals(state.orders.size, 2);
  assertBalanced(state);
});

Deno.test("Marketplace cancellation, expiration, and moderation rejection release the full seller reservation", () => {
  for (const terminal of ["cancelled", "expired", "rejected"] as const) {
    const state = fixture();
    const listing = createListing(state, context(SELLER), {
      id: `listing-${terminal}`,
      quantity: 4,
      unitPrice: 10,
      feeRate: 0.02,
      taxRate: 0.01,
      key: `create-${terminal}`,
    });
    activateListing(listing, 1);

    if (terminal === "cancelled") cancelListing(listing, 2, `cancel-${terminal}`);
    if (terminal === "expired") expireListing(listing, 2, `expire-${terminal}`);
    if (terminal === "rejected") {
      placeModerationHold(listing, 2);
      rejectListing(listing, 3, `reject-${terminal}`);
    }

    assertEquals(listing.status, terminal);
    assertEquals(listing.quantity, 0);
    assertEquals(listing.reservation.status, "released");
    assertEquals(searchListings(state, GAME), []);
    assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 5);
  }
});

Deno.test("Marketplace stale versions and concurrent buyers permit one deterministic winner", () => {
  const state = fixture();
  const listing = createListing(state, context(SELLER), {
    id: "listing-race",
    quantity: 1,
    unitPrice: 25,
    feeRate: 0,
    taxRate: 0,
    key: "create-race",
  });
  activateListing(listing, 1);

  const winner = purchase(state, context(BUYER), listing, 1, 2, "race-winner");
  assertEquals(winner.status, "completed");
  assertError(
    () => purchase(state, context("buyer-2"), listing, 1, 2, "race-loser"),
    "MARKETPLACE_STALE_VERSION",
  );
  assertEquals(state.orders.size, 1);
  assertEquals(listing.status, "sold_out");
});

Deno.test("Marketplace refunds respect Crafting and other active reservations", () => {
  const state = fixture();
  const listing = createListing(state, context(SELLER), {
    id: "listing-refund",
    quantity: 3,
    unitPrice: 30,
    feeRate: 0.02,
    taxRate: 0.03,
    key: "create-refund",
  });
  activateListing(listing, 1);
  const order = purchase(state, context(BUYER), listing, 3, 2, "purchase-refund");
  openDispute(order);

  state.crossDomainReservations = [
    { reasonType: "crafting_input", quantity: 2 },
    { reasonType: "equipment_action", quantity: 1 },
  ];
  assertError(() => refundOrder(state, order), "MARKETPLACE_REFUND_ITEM_UNAVAILABLE");

  state.crossDomainReservations = [{ reasonType: "crafting_input", quantity: 1 }];
  refundOrder(state, order);
  assertEquals(order.status, "refunded");
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 0);
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 5);
  assertEquals(state.cash.get(BUYER), 1000);
  assertEquals(state.cash.get(SELLER), 0);
  assertBalanced(state);
});

Deno.test("Marketplace denies wrong-game, pause, ended-game, and expired-session mutations", () => {
  const state = fixture();
  const listing = createListing(state, context(SELLER), {
    id: "listing-gates",
    quantity: 2,
    unitPrice: 10,
    feeRate: 0,
    taxRate: 0,
    key: "create-gates",
  });
  activateListing(listing, 1);

  assertError(
    () => purchase(state, { ...context(BUYER), gameId: "wrong-game" }, listing, 1, 2, "wrong-game"),
    "MARKETPLACE_WRONG_GAME",
  );
  assertError(
    () => purchase(state, { ...context(BUYER), gameState: "paused" }, listing, 1, 2, "paused"),
    "MARKETPLACE_GAME_PAUSED",
  );
  assertError(
    () => purchase(state, { ...context(BUYER), gameState: "ended" }, listing, 1, 2, "ended"),
    "MARKETPLACE_GAME_ENDED",
  );
  assertError(
    () => purchase(state, { ...context(BUYER), sessionState: "expired" }, listing, 1, 2, "expired-session"),
    "MARKETPLACE_SESSION_EXPIRED",
  );
  assertEquals(state.orders.size, 0);
});

function fixture() {
  return {
    listings: new Map<string, Listing>(),
    orders: new Map<string, Order>(),
    receipts: new Map<string, Order | Listing>(),
    cash: new Map<string, number>([[SELLER, 0], [BUYER, 1000], ["buyer-2", 1000]]),
    inventory: new Map<string, number>([[`${SELLER}:${ITEM}`, 5], [`${BUYER}:${ITEM}`, 0], [`buyer-2:${ITEM}`, 0]]),
    fees: 0,
    taxes: 0,
    crossDomainReservations: [] as Array<{ reasonType: string; quantity: number }>,
  };
}

function context(playerId: string): Context {
  return { gameId: GAME, playerId, gameState: "active", sessionState: "active" };
}

function createListing(
  state: ReturnType<typeof fixture>,
  ctx: Context,
  input: { id: string; quantity: number; unitPrice: number; feeRate: number; taxRate: number; key: string },
): Listing {
  gate(ctx, GAME);
  const replay = state.receipts.get(input.key);
  if (replay) return replay as Listing;
  const owned = state.inventory.get(`${ctx.playerId}:${ITEM}`) ?? 0;
  if (owned < input.quantity) throw new Error("MARKETPLACE_QUANTITY_UNAVAILABLE");
  const listing: Listing = {
    id: input.id,
    gameId: ctx.gameId,
    sellerId: ctx.playerId,
    itemKey: ITEM,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    feeRate: input.feeRate,
    taxRate: input.taxRate,
    status: "draft",
    version: 1,
    reservation: {
      gameSessionId: ctx.gameId,
      playerId: ctx.playerId,
      inventoryHoldingId: HOLDING,
      storeItemId: ITEM,
      itemKey: "data-chip",
      reasonType: MARKETPLACE_RESERVATION_REASON,
      sourceId: input.id,
      quantity: input.quantity,
      status: "active",
      version: 1,
      receipts: [],
    },
  };
  state.listings.set(listing.id, listing);
  state.receipts.set(input.key, listing);
  return listing;
}

function activateListing(listing: Listing, expectedVersion: number): void {
  stale(listing, expectedVersion);
  if (listing.status !== "draft") throw new Error("MARKETPLACE_LISTING_TRANSITION_INVALID");
  listing.status = "active";
  listing.version += 1;
}

function searchListings(state: ReturnType<typeof fixture>, gameId: string): Listing[] {
  return [...state.listings.values()].filter((listing) =>
    listing.gameId === gameId && listing.status === "active" && listing.quantity > 0
  );
}

function purchase(
  state: ReturnType<typeof fixture>,
  ctx: Context,
  listing: Listing,
  quantity: number,
  expectedVersion: number,
  key: string,
): Order {
  gate(ctx, listing.gameId);
  const replay = state.receipts.get(key);
  if (replay) return replay as Order;
  stale(listing, expectedVersion);
  if (listing.status !== "active" || listing.quantity < quantity) throw new Error("MARKETPLACE_QUANTITY_UNAVAILABLE");
  if (ctx.playerId === listing.sellerId) throw new Error("MARKETPLACE_SELF_PURCHASE");

  const subtotal = round(listing.unitPrice * quantity);
  const fee = round(subtotal * listing.feeRate);
  const tax = round(subtotal * listing.taxRate);
  const total = round(subtotal + fee + tax);
  const cash = state.cash.get(ctx.playerId) ?? 0;
  if (cash < total) throw new Error("MARKETPLACE_INSUFFICIENT_FUNDS");

  const mutation = applyMarketplaceReservationMutation(listing.reservation, {
    action: "consume",
    quantity,
    expectedVersion: listing.reservation.version,
    operationKey: `consume-${key}`,
  });
  listing.reservation = mutation.state;
  listing.quantity -= quantity;
  listing.version += 1;
  if (listing.quantity === 0) listing.status = "sold_out";

  state.cash.set(ctx.playerId, round(cash - total));
  state.cash.set(listing.sellerId, round((state.cash.get(listing.sellerId) ?? 0) + subtotal));
  state.fees = round(state.fees + fee);
  state.taxes = round(state.taxes + tax);
  state.inventory.set(`${listing.sellerId}:${ITEM}`, (state.inventory.get(`${listing.sellerId}:${ITEM}`) ?? 0) - quantity);
  state.inventory.set(`${ctx.playerId}:${ITEM}`, (state.inventory.get(`${ctx.playerId}:${ITEM}`) ?? 0) + quantity);

  const order: Order = {
    id: `order-${key}`,
    listingId: listing.id,
    buyerId: ctx.playerId,
    sellerId: listing.sellerId,
    quantity,
    subtotal,
    fee,
    tax,
    total,
    status: "completed",
  };
  state.orders.set(order.id, order);
  state.receipts.set(key, order);
  return order;
}

function cancelListing(listing: Listing, expectedVersion: number, key: string): void {
  releaseListing(listing, expectedVersion, key, "cancelled", "listing_cancelled");
}

function expireListing(listing: Listing, expectedVersion: number, key: string): void {
  releaseListing(listing, expectedVersion, key, "expired", "listing_expired");
}

function placeModerationHold(listing: Listing, expectedVersion: number): void {
  stale(listing, expectedVersion);
  listing.status = "moderation_hold";
  listing.version += 1;
}

function rejectListing(listing: Listing, expectedVersion: number, key: string): void {
  releaseListing(listing, expectedVersion, key, "rejected", "listing_rejected");
}

function releaseListing(
  listing: Listing,
  expectedVersion: number,
  key: string,
  status: ListingStatus,
  releaseReason: "listing_cancelled" | "listing_expired" | "listing_rejected",
): void {
  stale(listing, expectedVersion);
  const mutation = applyMarketplaceReservationMutation(listing.reservation, {
    action: "release",
    quantity: listing.quantity,
    expectedVersion: listing.reservation.version,
    operationKey: key,
    releaseReason,
  });
  listing.reservation = mutation.state;
  listing.quantity = 0;
  listing.status = status;
  listing.version += 1;
}

function openDispute(order: Order): void {
  if (order.status !== "completed") throw new Error("MARKETPLACE_ORDER_NOT_DISPUTABLE");
  order.status = "disputed";
}

function refundOrder(state: ReturnType<typeof fixture>, order: Order): void {
  if (order.status !== "disputed") throw new Error("MARKETPLACE_ORDER_NOT_REFUNDABLE");
  const buyerQuantity = state.inventory.get(`${order.buyerId}:${ITEM}`) ?? 0;
  const reservations = state.crossDomainReservations.map((reservation, index) => ({
    gameSessionId: GAME,
    playerId: order.buyerId,
    inventoryHoldingId: BUYER_HOLDING,
    storeItemId: ITEM,
    itemKey: "data-chip",
    reasonType: reservation.reasonType,
    sourceId: `source-${index}`,
    quantity: reservation.quantity,
    status: "active" as const,
  }));
  const reserved = reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
  const reconciliation = reconcileInventoryReservationProjection({
    gameSessionId: GAME,
    playerId: order.buyerId,
    inventoryHoldingId: BUYER_HOLDING,
    quantityOwned: buyerQuantity,
    quantityReservedProjection: reserved,
    reservations,
  });
  try {
    assertMarketplaceRefundInventoryAvailable(reconciliation, order.quantity);
  } catch {
    throw new Error("MARKETPLACE_REFUND_ITEM_UNAVAILABLE");
  }

  state.inventory.set(`${order.buyerId}:${ITEM}`, buyerQuantity - order.quantity);
  state.inventory.set(`${order.sellerId}:${ITEM}`, (state.inventory.get(`${order.sellerId}:${ITEM}`) ?? 0) + order.quantity);
  state.cash.set(order.buyerId, round((state.cash.get(order.buyerId) ?? 0) + order.total));
  state.cash.set(order.sellerId, round((state.cash.get(order.sellerId) ?? 0) - order.subtotal));
  state.fees = round(state.fees - order.fee);
  state.taxes = round(state.taxes - order.tax);
  order.status = "refunded";
}

function gate(ctx: Context, expectedGame: string): void {
  if (ctx.gameId !== expectedGame) throw new Error("MARKETPLACE_WRONG_GAME");
  if (ctx.sessionState === "expired") throw new Error("MARKETPLACE_SESSION_EXPIRED");
  if (ctx.gameState === "paused") throw new Error("MARKETPLACE_GAME_PAUSED");
  if (ctx.gameState === "ended") throw new Error("MARKETPLACE_GAME_ENDED");
}

function stale(listing: Listing, expectedVersion: number): void {
  if (listing.version !== expectedVersion) throw new Error("MARKETPLACE_STALE_VERSION");
}

function assertBalanced(state: ReturnType<typeof fixture>): void {
  const playerCash = [...state.cash.values()].reduce((sum, value) => sum + value, 0);
  assertEquals(round(playerCash + state.fees + state.taxes), 2000);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function assertError(run: () => unknown, code: string): void {
  let error: unknown;
  try { run(); } catch (value) { error = value; }
  if (!(error instanceof Error) || error.message !== code) {
    throw new Error(`Expected ${code}, received ${String(error)}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
