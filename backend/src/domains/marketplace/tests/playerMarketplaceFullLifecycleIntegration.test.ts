export {};

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type ListingStatus = "draft" | "active" | "moderation_hold" | "sold_out" | "cancelled" | "expired" | "rejected";
type ReservationStatus = "reserved" | "settling" | "settled" | "released" | "expired";
type GameStatus = "active" | "paused" | "ended";
type DisputeStatus = "none" | "open" | "resolved_buyer" | "resolved_seller" | "rejected";

class Model {
  listing = { status: "draft" as ListingStatus, version: 1, quantity: 2, reservedInventory: 2, expiresAt: 100 };
  reservations = new Map<string, { status: ReservationStatus; quantity: number; fingerprint: string; orderId: string | null }>();
  gameStatus: GameStatus = "active";
  sessionActive = true;
  buyerCash = 100;
  sellerCash = 0;
  feeTreasury = 0;
  taxTreasury = 0;
  buyerItems = 0;
  settlementPostingGroups = 0;
  inventoryTransfers = 0;
  releaseCount = 0;
  disputeStatus: DisputeStatus = "none";
  disputeCommand: string | null = null;
  audit: string[] = ["listing_drafted"];

  activate(expected: number, moderated = false) {
    this.guard();
    this.version(expected);
    if (this.listing.status !== "draft") throw new Error("transition");
    this.listing.status = moderated ? "moderation_hold" : "active";
    this.listing.version++;
    this.audit.push(moderated ? "listing_submitted_for_moderation" : "listing_activated");
  }

  approve(expected: number) {
    this.guard();
    this.version(expected);
    if (this.listing.status !== "moderation_hold") throw new Error("transition");
    this.listing.status = "active";
    this.listing.version++;
    this.audit.push("listing_approve");
  }

  reserve(key: string, expected: number, quantity = 1) {
    this.guard();
    const fingerprint = `${expected}:${quantity}`;
    const replay = this.reservations.get(key);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error("idempotency conflict");
      return replay;
    }
    this.version(expected);
    if (this.listing.status !== "active" || quantity > this.listing.quantity) throw new Error("unavailable");
    this.listing.quantity -= quantity;
    this.listing.version++;
    if (!this.listing.quantity) this.listing.status = "sold_out";
    const reservation = { status: "reserved" as ReservationStatus, quantity, fingerprint, orderId: null };
    this.reservations.set(key, reservation);
    this.audit.push("purchase_reserved");
    return reservation;
  }

  settle(key: string, subtotal = 20, fee = 0.5, tax = 0.2) {
    this.guard();
    const reservation = this.reservations.get(key);
    if (!reservation) throw new Error("missing");
    if (reservation.status === "settled") return { outcome: "replayed", orderId: reservation.orderId };
    if (reservation.status !== "reserved") throw new Error("released");
    const total = subtotal + fee + tax;
    if (this.buyerCash < total) {
      reservation.status = "released";
      this.releaseToListing(reservation.quantity);
      this.audit.push("purchase_reservation_released");
      return { outcome: "insufficient", orderId: null };
    }
    reservation.status = "settling";
    this.buyerCash -= total;
    this.sellerCash += subtotal;
    this.feeTreasury += fee;
    this.taxTreasury += tax;
    this.buyerItems += reservation.quantity;
    this.listing.reservedInventory -= reservation.quantity;
    if (Math.round((-total + subtotal + fee + tax) * 10000) !== 0) throw new Error("imbalance");
    reservation.orderId = `ord_${key}`;
    reservation.status = "settled";
    this.settlementPostingGroups++;
    this.inventoryTransfers++;
    this.audit.push("order_settled");
    return { outcome: "applied", orderId: reservation.orderId };
  }

  cancel(expected: number) {
    this.guard();
    this.version(expected);
    if ([...this.reservations.values()].some((row) => row.status === "reserved" || row.status === "settling")) {
      throw new Error("reservation active");
    }
    if (!["draft", "active", "moderation_hold"].includes(this.listing.status)) throw new Error("transition");
    this.releaseRemaining("cancelled");
    this.audit.push("listing_cancelled");
  }

  expire(now: number) {
    if (now < this.listing.expiresAt || !["draft", "active", "moderation_hold"].includes(this.listing.status)) return;
    this.releaseRemaining("expired");
    this.audit.push("listing_expired");
  }

  dispute(key: string) {
    this.guard();
    if (this.disputeCommand === key) return "replayed";
    if (this.disputeCommand !== null || this.disputeStatus !== "none") throw new Error("idempotency conflict");
    if (this.settlementPostingGroups !== 1) throw new Error("not disputable");
    this.disputeCommand = key;
    this.disputeStatus = "open";
    this.audit.push("dispute_opened");
    return "applied";
  }

  refund(key: string, subtotal = 20, fee = 0.5, tax = 0.2) {
    this.guard();
    if (this.disputeStatus === "resolved_buyer" && this.disputeCommand === key) return "replayed";
    if (this.disputeStatus !== "open") throw new Error("terminal conflict");
    if (this.buyerItems < 1 || this.sellerCash < subtotal || this.feeTreasury < fee || this.taxTreasury < tax) {
      throw new Error("refund unavailable");
    }
    const total = subtotal + fee + tax;
    this.buyerItems--;
    this.sellerCash -= subtotal;
    this.feeTreasury -= fee;
    this.taxTreasury -= tax;
    this.buyerCash += total;
    if (Math.round((total - subtotal - fee - tax) * 10000) !== 0) throw new Error("imbalance");
    this.disputeCommand = key;
    this.disputeStatus = "resolved_buyer";
    this.audit.push("dispute_refund_buyer");
    return "applied";
  }

  resolveSeller() {
    if (this.disputeStatus !== "open") throw new Error("terminal conflict");
    this.disputeStatus = "resolved_seller";
  }

  private guard() {
    if (!this.sessionActive) throw new Error("session expired");
    if (this.gameStatus !== "active") throw new Error(`game ${this.gameStatus}`);
  }

  private version(expected: number) {
    if (expected !== this.listing.version) throw new Error("stale version");
  }

  private releaseToListing(quantity: number) {
    this.listing.quantity += quantity;
    this.listing.status = "active";
    this.listing.version++;
    this.releaseCount++;
  }

  private releaseRemaining(status: "cancelled" | "expired") {
    if (this.listing.status === status) return;
    this.listing.reservedInventory -= this.listing.quantity;
    this.listing.quantity = 0;
    this.listing.status = status;
    this.listing.version++;
    this.releaseCount++;
  }
}

Deno.test("draft activation, moderation, settlement replay, dispute, and refund remain balanced", () => {
  const model = new Model();
  model.activate(1, true);
  model.approve(2);
  model.reserve("buy-1", 3);
  const applied = model.settle("buy-1");
  const replayed = model.settle("buy-1");
  assertEquals(applied.outcome, "applied");
  assertEquals(replayed, { outcome: "replayed", orderId: applied.orderId });
  assertEquals(model.settlementPostingGroups, 1);
  assertEquals(model.inventoryTransfers, 1);
  assertEquals(model.buyerCash, 79.3);
  assertEquals(model.sellerCash, 20);
  assertEquals(model.feeTreasury, 0.5);
  assertEquals(model.taxTreasury, 0.2);
  assertEquals(model.buyerItems, 1);
  assertEquals(model.dispute("dispute-1"), "applied");
  assertEquals(model.refund("refund-1"), "applied");
  assertEquals(model.refund("refund-1"), "replayed");
  assertEquals(model.buyerCash, 100);
  assertEquals(model.sellerCash, 0);
  assertEquals(model.feeTreasury, 0);
  assertEquals(model.taxTreasury, 0);
  assertEquals(model.buyerItems, 0);
  for (const action of [
    "listing_drafted", "listing_submitted_for_moderation", "listing_approve",
    "purchase_reserved", "order_settled", "dispute_opened", "dispute_refund_buyer",
  ]) if (!model.audit.includes(action)) throw new Error(`missing ${action}`);
});

Deno.test("concurrent buyers, stale versions, cancellation races, and insufficient funds fail closed", async () => {
  const model = new Model();
  model.activate(1);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => model.reserve("buyer-a", 2, 2)),
    Promise.resolve().then(() => model.reserve("buyer-b", 2, 2)),
  ]);
  assertEquals(results.filter((result) => result.status === "fulfilled").length, 1);
  assertThrows(() => model.cancel(2), "stale");
  assertThrows(() => model.cancel(model.listing.version), "reservation active");

  const poor = new Model();
  poor.buyerCash = 1;
  poor.activate(1);
  poor.reserve("poor", 2);
  assertEquals(poor.settle("poor").outcome, "insufficient");
  assertEquals(poor.listing.status, "active");
  assertEquals(poor.listing.quantity, 2);
  assertEquals(poor.releaseCount, 1);
});

Deno.test("idempotency fingerprints and terminal dispute transitions reject conflicting retries", () => {
  const model = new Model();
  model.activate(1);
  model.reserve("same-key", 2, 1);
  assertEquals(model.reserve("same-key", 2, 1).quantity, 1);
  assertThrows(() => model.reserve("same-key", 3, 2), "idempotency conflict");
  model.settle("same-key");
  model.dispute("open-key");
  model.resolveSeller();
  assertThrows(() => model.refund("refund-key"), "terminal conflict");
});

Deno.test("cancellation and expiration release only remaining Inventory once", () => {
  const cancelled = new Model();
  cancelled.activate(1);
  cancelled.cancel(2);
  assertEquals(cancelled.listing.status, "cancelled");
  assertEquals(cancelled.listing.reservedInventory, 0);
  assertEquals(cancelled.releaseCount, 1);
  assertThrows(() => cancelled.cancel(3), "transition");

  const expired = new Model();
  expired.activate(1);
  expired.reserve("buyer", 2, 1);
  expired.expire(101);
  expired.expire(102);
  assertEquals(expired.listing.status, "expired");
  assertEquals(expired.listing.quantity, 0);
  assertEquals(expired.listing.reservedInventory, 1);
  assertEquals(expired.releaseCount, 1);
});

Deno.test("paused, ended, and expired-session mutation attempts fail before state changes", () => {
  for (const status of ["paused", "ended"] as const) {
    const model = new Model();
    model.gameStatus = status;
    assertThrows(() => model.activate(1), `game ${status}`);
    assertEquals(model.listing, { status: "draft", version: 1, quantity: 2, reservedInventory: 2, expiresAt: 100 });
  }
  const expired = new Model();
  expired.sessionActive = false;
  assertThrows(() => expired.activate(1), "session expired");
  assertEquals(expired.audit, ["listing_drafted"]);
});

function assertThrows(run: () => unknown, fragment: string): void {
  let thrown = "";
  try { run(); } catch (error) { thrown = String(error); }
  if (!thrown.includes(fragment)) throw new Error(`Expected ${fragment}, received ${thrown || "no error"}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
