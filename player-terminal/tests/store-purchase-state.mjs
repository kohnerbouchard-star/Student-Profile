import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transitionStorePurchase as transition } from "../src/features/store/store-purchase-state.js";

const selected = () => Object.freeze({ stage: "select", processing: false, quantity: 1,
  quote: null, receipt: null, item: Object.freeze({ itemKey: "item" }), offer: Object.freeze({ offerKey: "offer" }),
  sessionOwner: Object.freeze({ sessionVersion: 1 }), allocationDraft: Object.freeze([]) });
const review = () => transition(selected(), { type: "quote-reviewed", quantity: 2,
  quote: Object.freeze({ quoteKey: "quote-one" }), fundingIntent: Object.freeze({ allocations: [] }),
  allocationDraft: Object.freeze([]), request: Object.freeze({ generation: 1 }) });
const committed = () => transition(review(), { type: "settlement-committed", receipt: Object.freeze({ receiptKey: "receipt-one" }) });

test("quote review carries exact authoritative evidence and session without mutating selection", () => {
  const before = selected(), request = {}, quote = { quoteKey: "q" }, fundingIntent = {};
  const next = transition(before, { type: "quote-reviewed", quantity: 3, quote, request, fundingIntent });
  assert.equal(before.stage, "select"); assert.equal(next.stage, "review");
  assert.equal(next.quote, quote); assert.equal(next.quoteRequest, request); assert.equal(next.fundingIntent, fundingIntent);
  assert.equal(next.sessionOwner, before.sessionOwner); assert.equal(next.commandRequest, null);
});
test("settlement enters processing synchronously and repeated confirmation cannot transition twice", () => {
  const before = review(), pending = transition(before, { type: "settlement-started" });
  assert.equal(pending.processing, true); assert.equal(before.processing, false);
  assert.equal(transition(pending, { type: "settlement-started" }), pending);
  assert.equal(transition(selected(), { type: "settlement-started" }).stage, "select");
});
test("ambiguous response preserves quote and request lineage for same-command retry", () => {
  const before = review(), request = Object.freeze({ generation: 2 });
  const uncertain = transition(transition(before, { type: "settlement-started" }), { type: "settlement-uncertain", request, message: "Network interrupted" });
  const retry = transition(uncertain, { type: "settlement-started" });
  assert.equal(uncertain.processing, false); assert.equal(retry.quote, before.quote);
  assert.equal(retry.commandRequest, request); assert.equal(retry.quoteRequest, before.quoteRequest);
  assert.equal(retry.fundingIntent, before.fundingIntent); assert.equal(retry.error, "");
});
test("validated commit owns receipt and immutable deduplicated invalidation without inventing amounts", () => {
  const receipt = Object.freeze({ receiptKey: "r", totalAmount: "19.25" });
  const resources = ["store", "banking", "store"];
  const next = transition(review(), { type: "settlement-committed", receipt, invalidatedResources: resources });
  assert.equal(next.receipt, receipt); assert.equal(next.stage, "receipt"); assert.equal(next.processing, false);
  assert.deepEqual(next.invalidatedResources, ["store", "banking"]); assert(Object.isFrozen(next.invalidatedResources));
  assert.deepEqual(resources, ["store", "banking", "store"]);
});
test("commit preserves authoritative empty invalidation and bounded fallback only for absent evidence", () => {
  assert.deepEqual(transition(review(), { type: "settlement-committed", receipt: {}, invalidatedResources: [] }).invalidatedResources, []);
  assert.deepEqual(committed().invalidatedResources, ["dashboard", "store", "inventory", "banking", "bankingFx"]);
});
test("refresh failure keeps committed receipt and safe repeated read retries", () => {
  const receiptState = committed();
  const pending = transition(receiptState, { type: "refresh-finished", warnings: ["read failed", "receipt reread pending"] });
  assert.equal(pending.stage, "receipt"); assert.equal(pending.receipt, receiptState.receipt);
  assert.equal(pending.refreshState, "pending"); assert.equal(pending.refreshWarning, "read failed receipt reread pending");
  const retry = transition(pending, { type: "refresh-started" });
  assert.equal(transition(retry, { type: "refresh-started" }), retry);
  const pendingAgain = transition(retry, { type: "refresh-finished", warnings: ["still pending"] });
  const complete = transition(transition(pendingAgain, { type: "refresh-started" }), { type: "refresh-finished", warnings: [] });
  assert.equal(complete.receipt, receiptState.receipt); assert.equal(complete.quote, receiptState.quote);
  assert.equal(complete.refreshState, "complete"); assert.equal(complete.refreshWarning, "");
  assert.equal(transition(complete, { type: "refresh-started" }), complete);
});
test("committed receipt cannot return to settlement or selection through stale controls", () => {
  const current = committed();
  for (const event of [{ type: "settlement-started" }, { type: "settlement-uncertain", message: "late" },
    { type: "settlement-committed", receipt: { receiptKey: "wrong" } }, { type: "quote-required" },
    { type: "edit-selection" }, { type: "quote-reviewed" }, { type: "offer-invalidated" }]) {
    assert.equal(transition(current, event), current, event.type);
  }
});
test("invalidated quote clears replay intent and retains unavailable-offer refresh warning", () => {
  const before = review(), refreshed = { item: before.item, offer: { purchasable: false }, refreshPending: true };
  const next = transition(before, { type: "offer-invalidated", refreshed, message: "Quote stale." });
  assert.equal(next.stage, "select"); assert.equal(next.quote, null); assert.equal(next.commandRequest, null);
  assert.equal(next.fundingIntent, null); assert.equal(next.offer, refreshed.offer);
  assert.equal(next.refreshState, "pending"); assert.match(next.error, /remains unavailable/);
});
test("editing resets uncommitted evidence but cannot interrupt processing", () => {
  const before = review(), pending = transition(before, { type: "settlement-started" });
  assert.equal(transition(pending, { type: "edit-selection" }), pending);
  const next = transition(before, { type: "edit-selection" });
  assert.equal(next.quote, null); assert.equal(next.receipt, null); assert.equal(next.stage, "select");
  assert.equal(next.sessionOwner, before.sessionOwner);
});
test("expired and unavailable request paths preserve former quote-required behavior", () => {
  const before = review();
  assert.equal(transition(before, { type: "quote-required", message: "current quote required" }).quote, before.quote);
  assert.equal(transition(before, { type: "quote-required", expired: true, message: "expired" }).quote, null);
});
test("retired view stays retired and invalid event names fail explicitly", () => {
  assert.equal(transition(null, { type: "refresh-finished", warnings: [] }), null);
  assert.throws(() => transition(selected(), { type: "invent-command" }), /Unknown Store/);
});
test("state boundary is wired before command dispatch and owns no transport or replay key", async () => {
  const flow = await readFile(new URL("../src/features/store/store-purchase-flow.js", import.meta.url), "utf8");
  const state = await readFile(new URL("../src/features/store/store-purchase-state.js", import.meta.url), "utf8");
  assert.match(flow, /import \{ transitionStorePurchase \} from "\.\/store-purchase-state.js"/);
  const start = flow.indexOf('type: "settlement-started"');
  assert(start > 0 && start < flow.indexOf('api.execute("storeOfferPurchase"'));
  assert.match(flow.slice(start, flow.indexOf('api.execute("storeOfferPurchase"')), /if \(transaction === current\) return/);
  assert.doesNotMatch(state, /\bfetch\s*\(|api\.(execute|request)|randomUUID|localStorage|sessionStorage/);
});
