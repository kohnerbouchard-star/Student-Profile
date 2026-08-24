#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  BUSINESS_PHASE10_CHECKPOINT,
  STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER,
  assertStorePurchaseSettlementLockOrder,
  normalizeStorePurchaseSettlementCommand,
  parseStorePurchaseSettlementReceipt,
} from "./business-phase10-store-purchase-settlement-contracts.ts";

assert.equal(BUSINESS_PHASE10_CHECKPOINT, "BUSINESS-V2-10A1");
assert.deepEqual(STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER, [
  "seller_offer",
  "store_listing_holding",
  "buyer_checking",
  "business_cash",
  "buyer_inventory",
  "economic_posting",
  "purchase_receipt",
  "offer_completion",
]);
assert.doesNotThrow(() => assertStorePurchaseSettlementLockOrder());

const command = normalizeStorePurchaseSettlementCommand({
  gameSessionId: "11111111-1111-4111-8111-111111111111",
  buyerPlayerId: "22222222-2222-4222-8222-222222222222",
  offerKey: `sof_${"a".repeat(32)}`,
  quoteKey: `quote_${"b".repeat(32)}`,
  quantity: 3,
  expectedOfferVersion: 7,
  idempotencyKey: "purchase-foundation-0001",
  clientSubmittedAt: "2026-08-25T00:00:00.000Z",
});

assert.equal(command.quantity, 3);
assert.equal(command.offerKey, `sof_${"a".repeat(32)}`);

assert.throws(
  () =>
    normalizeStorePurchaseSettlementCommand({
      ...command,
      offerKey: "not-an-offer",
    }),
  /invalid public format/u,
);
assert.throws(
  () =>
    normalizeStorePurchaseSettlementCommand({
      ...command,
      quantity: 0,
    }),
  /positive integer/u,
);
assert.throws(
  () =>
    normalizeStorePurchaseSettlementCommand({
      ...command,
      idempotencyKey: "short",
    }),
  /8 to 160/u,
);

const receipt = parseStorePurchaseSettlementReceipt({
  receiptKey: `spr_${"c".repeat(32)}`,
  quoteKey: command.quoteKey,
  offerKey: command.offerKey,
  businessKey: `biz_${"d".repeat(32)}`,
  sellerPartyKey: `pty_${"e".repeat(32)}`,
  canonicalItemKey: "canonical.widget",
  buyerInventoryAccountKey: `iac_${"f".repeat(32)}`,
  inventoryTransactionKey: `itx_${"1".repeat(32)}`,
  quantity: 3,
  unitPrice: 12.5,
  finalTotalPrice: 37.5,
  currencyCode: "NRC",
  buyerDebitAmount: 37.5,
  sellerCreditAmount: 37.5,
  grossRevenue: 37.5,
  costOfGoodsSold: 18,
  offerVersionBefore: 7,
  offerVersionAfter: 8,
  remainingListedQuantity: 5,
  buyerInventoryQuantityOwned: 9,
  completedAt: "2026-08-25T00:00:01.000Z",
  replayed: false,
});

assert.equal(receipt.finalTotalPrice, 37.5);
assert.equal(receipt.offerVersionAfter, 8);

assert.throws(
  () =>
    parseStorePurchaseSettlementReceipt({
      ...receipt,
      sellerCreditAmount: 36,
    }),
  /must equal the final total price/u,
);
assert.throws(
  () =>
    parseStorePurchaseSettlementReceipt({
      ...receipt,
      offerVersionAfter: 9,
    }),
  /advance exactly once/u,
);
assert.throws(
  () =>
    assertStorePurchaseSettlementLockOrder([
      "buyer_checking",
      ...STORE_PURCHASE_SETTLEMENT_ROW_LOCK_ORDER.slice(1),
    ]),
  /diverges/u,
);

console.log(
  "Business Phase 10A.1 Store purchase settlement typed contract: PASS",
);
