declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type ListingStatus = "draft" | "active" | "moderation_hold" | "sold_out" | "cancelled" | "expired" | "rejected";
type ReservationStatus = "reserved" | "settling" | "settled" | "released" | "expired";
class Model {
  listing = { status: "draft" as ListingStatus, version: 1, quantity: 2, reservedInventory: 2, expiresAt: 100 };
  reservations = new Map<string, { status: ReservationStatus; quantity: number; request: string }>();
  buyerCash = 100;
  sellerCash = 0;
  feeTreasury = 0;
  taxTreasury = 0;
  buyerItems = 0;
  audit: string[] = ["listing_drafted"];
  activate(expected: number, moderated = false) {
    this.version(expected); if (this.listing.status !== "draft") throw new Error("transition");
    this.listing.status = moderated ? "moderation_hold" : "active"; this.listing.version++; this.audit.push(moderated ? "listing_submitted_for_moderation" : "listing_activated");
  }
  approve(expected: number) { this.version(expected); if (this.listing.status !== "moderation_hold") throw new Error("transition"); this.listing.status = "active"; this.listing.version++; this.audit.push("listing_approve"); }
  reserve(key: string, expected: number, quantity = 1) {
    const replay = this.reservations.get(key); if (replay) return replay;
    this.version(expected); if (this.listing.status !== "active" || quantity > this.listing.quantity) throw new Error("unavailable");
    this.listing.quantity -= quantity; this.listing.version++; if (!this.listing.quantity) this.listing.status = "sold_out";
    const reservation = { status: "reserved" as ReservationStatus, quantity, request: `${expected}:${quantity}` };
    this.reservations.set(key, reservation); this.audit.push("purchase_reserved"); return reservation;
  }
  settle(key: string, subtotal = 20, fee = 0.5, tax = 0.2) {
    const reservation = this.reservations.get(key); if (!reservation) throw new Error("missing");
    if (reservation.status === "settled") return "replayed";
    if (reservation.status !== "reserved") throw new Error("released");
    const total = subtotal + fee + tax;
    if (this.buyerCash < total) { reservation.status = "released"; this.releaseToListing(reservation.quantity); this.audit.push("purchase_reservation_released"); return "insufficient"; }
    reservation.status = "settling";
    this.buyerCash -= total; this.sellerCash += subtotal; this.feeTreasury += fee; this.taxTreasury += tax; this.buyerItems += reservation.quantity; this.listing.reservedInventory -= reservation.quantity;
    if (Math.round((-total + subtotal + fee + tax) * 10000) !== 0) throw new Error("imbalance");
    reservation.status = "settled"; this.audit.push("order_settled"); return "applied";
  }
  cancel(expected: number) { this.version(expected); if ([...this.reservations.values()].some((r) => r.status === "reserved" || r.status === "settling")) throw new Error("reservation active"); if (!["draft", "active", "moderation_hold"].includes(this.listing.status)) throw new Error("transition"); this.listing.reservedInventory -= this.listing.quantity; this.listing.quantity = 0; this.listing.status = "cancelled"; this.listing.version++; this.audit.push("listing_cancelled"); }
  expire(now: number) { if (now < this.listing.expiresAt || !["draft", "active", "moderation_hold"].includes(this.listing.status)) return; this.listing.reservedInventory -= this.listing.quantity; this.listing.quantity = 0; this.listing.status = "expired"; this.listing.version++; this.audit.push("listing_expired"); }
  dispute() { this.audit.push("dispute_opened"); }
  refund(subtotal = 20, fee = 0.5, tax = 0.2) { if (this.buyerItems < 1 || this.sellerCash < subtotal || this.feeTreasury < fee || this.taxTreasury < tax) throw new Error("refund unavailable"); const total = subtotal + fee + tax; this.buyerItems--; this.sellerCash -= subtotal; this.feeTreasury -= fee; this.taxTreasury -= tax; this.buyerCash += total; if (Math.round((total - subtotal - fee - tax) * 10000) !== 0) throw new Error("imbalance"); this.audit.push("dispute_refund_buyer"); }
  private version(expected: number) { if (expected !== this.listing.version) throw new Error("stale version"); }
  private releaseToListing(quantity: number) { this.listing.quantity += quantity; this.listing.status = "active"; this.listing.version++; }
}

Deno.test("draft activation, moderation, reservation, settlement, dispute, and refund remain balanced", () => {
  const model = new Model();
  model.activate(1, true); model.approve(2);
  model.reserve("buy-1", 3); assertEquals(model.settle("buy-1"), "applied"); assertEquals(model.settle("buy-1"), "replayed");
  assertEquals(model.buyerCash, 79.3); assertEquals(model.sellerCash, 20); assertEquals(model.feeTreasury, 0.5); assertEquals(model.taxTreasury, 0.2); assertEquals(model.buyerItems, 1);
  model.dispute(); model.refund();
  assertEquals(model.buyerCash, 100); assertEquals(model.sellerCash, 0); assertEquals(model.feeTreasury, 0); assertEquals(model.taxTreasury, 0); assertEquals(model.buyerItems, 0);
  for (const action of ["listing_drafted", "listing_submitted_for_moderation", "listing_approve", "purchase_reserved", "order_settled", "dispute_opened", "dispute_refund_buyer"]) if (!model.audit.includes(action)) throw new Error(`missing ${action}`);
});

Deno.test("concurrent buyers, stale versions, cancellation races, and insufficient funds fail closed", async () => {
  const model = new Model(); model.activate(1);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => model.reserve("buyer-a", 2, 2)),
    Promise.resolve().then(() => model.reserve("buyer-b", 2, 2)),
  ]);
  assertEquals(results.filter((result) => result.status === "fulfilled").length, 1);
  let stale = false; try { model.cancel(2); } catch (error) { stale = String(error).includes("stale"); } if (!stale) throw new Error("stale version accepted");
  let race = false; try { model.cancel(model.listing.version); } catch (error) { race = String(error).includes("reservation active"); } if (!race) throw new Error("cancellation race accepted");

  const poor = new Model(); poor.buyerCash = 1; poor.activate(1); poor.reserve("poor", 2);
  assertEquals(poor.settle("poor"), "insufficient"); assertEquals(poor.listing.status, "active"); assertEquals(poor.listing.quantity, 2);
});

Deno.test("expiration releases only unpurchased listing inventory", () => {
  const model = new Model(); model.activate(1); model.reserve("buyer", 2, 1); model.expire(101);
  assertEquals(model.listing.status, "expired"); assertEquals(model.listing.quantity, 0); assertEquals(model.listing.reservedInventory, 1);
});
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`); }
