import {
  applyMarketplaceReservationMutation,
  assertMarketplaceRefundInventoryAvailable,
  MARKETPLACE_RESERVATION_REASON,
  type MarketplaceListingReservationState,
  reconcileInventoryReservationProjection,
} from "../infrastructure/marketplaceInventoryReservationAdapter.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type Gate = {
  gameId: string;
  playerId: string;
  gameState: "active" | "paused" | "ended";
  sessionState: "active" | "expired";
};

type Listing = {
  id: string;
  gameId: string;
  sellerId: string;
  quantity: number;
  unitPrice: number;
  feeRate: number;
  taxRate: number;
  status: "draft" | "active" | "moderation_hold" | "sold_out" | "cancelled" | "expired" | "rejected";
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

const GAME = "game-marketplace-1";
const SELLER = "seller-1";
const BUYER = "buyer-1";
const ITEM = "item-data-chip";
const SELLER_HOLDING = "holding-seller";
const BUYER_HOLDING = "holding-buyer";

Deno.test("Marketplace create, activation, search, fee/tax settlement, replay, and Inventory transfer are exact", () => {
  const state = fixture();
  const listing = createListing(state, gate(SELLER), "listing-1", 5, 20, 0.025, 0.05, "create-1");
  activate(listing, 1);
  assertEquals(search(state).map((item) => item.id), ["listing-1"]);

  const first = purchase(state, gate(BUYER), listing, 2, 2, "purchase-1");
  assertEquals(first.subtotal, 40);
  assertEquals(first.fee, 1);
  assertEquals(first.tax, 2);
  assertEquals(first.total, 43);
  assertEquals(listing.quantity, 3);
  assertEquals(listing.reservation.quantity, 3);
  assertEquals(listing.reservation.status, "active");
  assertEquals(state.cash.get(SELLER), 40);
  assertEquals(state.cash.get(BUYER), 957);
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 3);
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 2);

  const replay = purchase(state, gate(BUYER), listing, 2, 2, "purchase-1");
  assertEquals(replay, first);
  assertEquals(state.orders.size, 1);
  assertEquals(state.cash.get(SELLER), 40);

  const final = purchase(state, gate(BUYER), listing, 3, 3, "purchase-2");
  assertEquals(final.status, "completed");
  assertEquals(listing.status, "sold_out");
  assertEquals(listing.reservation.status, "consumed");
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 0);
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 5);
  assertConserved(state);
});

Deno.test("Marketplace cancellation, expiration, and moderation reversal release the full seller reservation", () => {
  for (const terminal of ["cancelled", "expired", "rejected"] as const) {
    const state = fixture();
    const listing = createListing(state, gate(SELLER), `listing-${terminal}`, 4, 10, 0, 0, `create-${terminal}`);
    activate(listing, 1);
    if (terminal === "cancelled") terminate(listing, 2, terminal, "listing_cancelled");
    if (terminal === "expired") terminate(listing, 2, terminal, "listing_expired");
    if (terminal === "rejected") {
      moderate(listing, 2);
      terminate(listing, 3, terminal, "listing_rejected");
    }
    assertEquals(listing.status, terminal);
    assertEquals(listing.quantity, 0);
    assertEquals(listing.reservation.status, "released");
    assertEquals(search(state), []);
    assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 5);
  }
});

Deno.test("Marketplace concurrent purchase races and stale versions allow one winner", () => {
  const state = fixture();
  const listing = createListing(state, gate(SELLER), "listing-race", 1, 25, 0, 0, "create-race");
  activate(listing, 1);
  const winner = purchase(state, gate(BUYER), listing, 1, 2, "race-winner");
  assertEquals(winner.status, "completed");
  assertError(
    () => purchase(state, gate("buyer-2"), listing, 1, 2, "race-loser"),
    "MARKETPLACE_STALE_VERSION",
  );
  assertEquals(state.orders.size, 1);
});

Deno.test("Marketplace disputes and refunds include Crafting and other active reservation sources", () => {
  const state = fixture();
  const listing = createListing(state, gate(SELLER), "listing-refund", 3, 30, 0.02, 0.03, "create-refund");
  activate(listing, 1);
  const order = purchase(state, gate(BUYER), listing, 3, 2, "purchase-refund");
  dispute(order);

  state.crossDomainReservations = [
    { reasonType: "crafting_input", quantity: 2 },
    { reasonType: "equipment_action", quantity: 1 },
  ];
  assertError(() => refund(state, order), "MARKETPLACE_REFUND_ITEM_UNAVAILABLE");

  state.crossDomainReservations = [];
  refund(state, order);
  assertEquals(order.status, "refunded");
  assertEquals(state.inventory.get(`${BUYER}:${ITEM}`), 0);
  assertEquals(state.inventory.get(`${SELLER}:${ITEM}`), 5);
  assertEquals(state.cash.get(BUYER), 1000);
  assertEquals(state.cash.get(SELLER), 0);
  assertConserved(state);
});

Deno.test("Marketplace denies wrong game, paused games, ended games, expired sessions, and self purchase", () => {
  const state = fixture();
  const listing = createListing(state, gate(SELLER), "listing-gates", 2, 10, 0, 0, "create-gates");
  activate(listing, 1);
  assertError(
    () => purchase(state, { ...gate(BUYER), gameId: "wrong-game" }, listing, 1, 2, "wrong"),
    "MARKETPLACE_WRONG_GAME",
  );
  assertError(
    () => purchase(state, { ...gate(BUYER), gameState: "paused" }, listing, 1, 2, "paused"),
    "MARKETPLACE_GAME_PAUSED",
  );
  assertError(
    () => purchase(state, { ...gate(BUYER), gameState: "ended" }, listing, 1, 2, "ended"),
    "MARKETPLACE_GAME_ENDED",
  );
  assertError(
    () => purchase(state, { ...gate(BUYER), sessionState: "expired" }, listing, 1, 2, "session"),
    "MARKETPLACE_SESSION_EXPIRED",
  );
  assertError(
    () => purchase(state, gate(SELLER), listing, 1, 2, "self"),
    "MARKETPLACE_SELF_PURCHASE",
  );
  assertEquals(state.orders.size, 0);
});

function fixture() {
  return {
    listings: new Map<string, Listing>(),
    orders: new Map<string, Order>(),
    receipts: new Map<string, Listing | Order>(),
    cash: new Map<string, number>([[SELLER, 0], [BUYER, 1000], ["buyer-2", 1000]]),
    inventory: new Map<string, number>([
      [`${SELLER}:${ITEM}`, 5],
      [`${BUYER}:${ITEM}`, 0],
      [`buyer-2:${ITEM}`, 0],
    ]),
    fees: 0,
    taxes: 0,
    crossDomainReservations: [] as Array<{ reasonType: string; quantity: number }>,
  };
}

function gate(playerId: string): Gate {
  return { gameId: GAME, playerId, gameState: "active", sessionState: "active" };
}

function createListing(
  state: ReturnType<typeof fixture>,
  ctx: Gate,
  id: string,
  quantity: number,
  unitPrice: number,
  feeRate: number,
  taxRate: number,
  key: string,
): Listing {
  enforceGate(ctx, GAME);
  const prior = state.receipts.get(key);
  if (prior) return prior as Listing;
  if ((state.inventory.get(`${ctx.playerId}:${ITEM}`) ?? 0) < quantity) {
    throw new Error("MARKETPLACE_QUANTITY_UNAVAILABLE");
  }
  const listing: Listing = {
    id,
    gameId: ctx.gameId,
    sellerId: ctx.playerId,
    quantity,
    unitPrice,
    feeRate,
    taxRate,
    status: "draft",
    version: 1,
    reservation: {
      gameSessionId: ctx.gameId,
      playerId: ctx.playerId,
      inventoryHoldingId: SELLER_HOLDING,
      storeItemId: ITEM,
      itemKey: "data-chip",
      reasonType: MARKETPLACE_RESERVATION_REASON,
      sourceId: id,
      quantity,
      status: "active",
      version: 1,
      receipts: [],
    },
  };
  state.listings.set(id, listing);
  state.receipts.set(key, listing);
  return listing;
}

function activate(listing: Listing, expectedVersion: number): void {
  assertVersion(listing, expectedVersion);
  if (listing.status !== "draft") throw new Error("MARKETPLACE_LISTING_TRANSITION_INVALID");
  listing.status = "active";
  listing.version += 1;
}

function moderate(listing: Listing, expectedVersion: number): void {
  assertVersion(listing, expectedVersion);
  listing.status = "moderation_hold";
  listing.version += 1;
}

function search(state: ReturnType<typeof fixture>): Listing[] {
  return [...state.listings.values()].filter((listing) =>
    listing.gameId === GAME && listing.status === "active" && listing.quantity > 0
  );
}

function purchase(
  state: ReturnType<typeof fixture>,
  ctx: Gate,
  listing: Listing,
  quantity: number,
  expectedVersion: number,
  key: string,
): Order {
  enforceGate(ctx, listing.gameId);
  const prior = state.receipts.get(key);
  if (prior) return prior as Order;
  assertVersion(listing, expectedVersion);
  if (ctx.playerId === listing.sellerId) throw new Error("MARKETPLACE_SELF_PURCHASE");
  if (listing.status !== "active" || listing.quantity < quantity) {
    throw new Error("MARKETPLACE_QUANTITY_UNAVAILABLE");
  }

  const subtotal = round(listing.unitPrice * quantity);
  const fee = round(subtotal * listing.feeRate);
  const tax = round(subtotal * listing.taxRate);
  const total = round(subtotal + fee + tax);
  const buyerCash = state.cash.get(ctx.playerId) ?? 0;
  if (buyerCash < total) throw new Error("MARKETPLACE_INSUFFICIENT_FUNDS");

  listing.reservation = applyMarketplaceReservationMutation(listing.reservation, {
    action: "consume",
    quantity,
    expectedVersion: listing.reservation.version,
    operationKey: `consume-${key}`,
  }).state;
  listing.quantity -= quantity;
  listing.version += 1;
  if (listing.quantity === 0) listing.status = "sold_out";

  state.cash.set(ctx.playerId, round(buyerCash - total));
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

function terminate(
  listing: Listing,
  expectedVersion: number,
  status: "cancelled" | "expired" | "rejected",
  releaseReason: "listing_cancelled" | "listing_expired" | "listing_rejected",
): void {
  assertVersion(listing, expectedVersion);
  listing.reservation = applyMarketplaceReservationMutation(listing.reservation, {
    action: "release",
    quantity: listing.quantity,
    expectedVersion: listing.reservation.version,
    operationKey: `${status}-${listing.id}`,
    releaseReason,
  }).state;
  listing.quantity = 0;
  listing.status = status;
  listing.version += 1;
}

function dispute(order: Order): void {
  if (order.status !== "completed") throw new Error("MARKETPLACE_ORDER_NOT_DISPUTABLE");
  order.status = "disputed";
}

function refund(state: ReturnType<typeof fixture>, order: Order): void {
  if (order.status !== "disputed") throw new Error("MARKETPLACE_ORDER_NOT_REFUNDABLE");
  const buyerOwned = state.inventory.get(`${order.buyerId}:${ITEM}`) ?? 0;
  const reservations = state.crossDomainReservations.map((entry, index) => ({
    gameSessionId: GAME,
    playerId: order.buyerId,
    inventoryHoldingId: BUYER_HOLDING,
    storeItemId: ITEM,
    itemKey: "data-chip",
    reasonType: entry.reasonType,
    sourceId: `cross-domain-${index}`,
    quantity: entry.quantity,
    status: "active" as const,
  }));
  const reserved = reservations.reduce((sum, entry) => sum + entry.quantity, 0);
  const reconciliation = reconcileInventoryReservationProjection({
    gameSessionId: GAME,
    playerId: order.buyerId,
    inventoryHoldingId: BUYER_HOLDING,
    quantityOwned: buyerOwned,
    quantityReservedProjection: reserved,
    reservations,
  });
  try {
    assertMarketplaceRefundInventoryAvailable(reconciliation, order.quantity);
  } catch {
    throw new Error("MARKETPLACE_REFUND_ITEM_UNAVAILABLE");
  }

  state.inventory.set(`${order.buyerId}:${ITEM}`, buyerOwned - order.quantity);
  state.inventory.set(`${order.sellerId}:${ITEM}`, (state.inventory.get(`${order.sellerId}:${ITEM}`) ?? 0) + order.quantity);
  state.cash.set(order.buyerId, round((state.cash.get(order.buyerId) ?? 0) + order.total));
  state.cash.set(order.sellerId, round((state.cash.get(order.sellerId) ?? 0) - order.subtotal));
  state.fees = round(state.fees - order.fee);
  state.taxes = round(state.taxes - order.tax);
  order.status = "refunded";
}

function enforceGate(ctx: Gate, expectedGameId: string): void {
  if (ctx.gameId !== expectedGameId) throw new Error("MARKETPLACE_WRONG_GAME");
  if (ctx.gameState === "paused") throw new Error("MARKETPLACE_GAME_PAUSED");
  if (ctx.gameState === "ended") throw new Error("MARKETPLACE_GAME_ENDED");
  if (ctx.sessionState === "expired") throw new Error("MARKETPLACE_SESSION_EXPIRED");
}

function assertVersion(listing: Listing, expectedVersion: number): void {
  if (listing.version !== expectedVersion) throw new Error("MARKETPLACE_STALE_VERSION");
}

function assertConserved(state: ReturnType<typeof fixture>): void {
  const cash = [...state.cash.values()].reduce((sum, value) => sum + value, 0);
  assertEquals(round(cash + state.fees + state.taxes), 2000);
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
