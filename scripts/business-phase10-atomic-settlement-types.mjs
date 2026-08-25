#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  normalizeBusinessStoreOfferSettlementCommand,
  parseBusinessStoreOfferReceipt,
  StoreOfferSettlementContractError,
} from "../backend/src/domains/store/contracts/storeOfferSettlementContracts.ts";
import { settleBusinessStoreOffer } from "../backend/src/domains/store/application/settleBusinessStoreOffer.ts";
import { SupabaseStoreOfferSettlementRepository } from "../backend/src/domains/store/infrastructure/supabaseStoreOfferSettlementRepository.ts";

const command = normalizeBusinessStoreOfferSettlementCommand({
  gameSessionId: "11111111-1111-4111-8111-111111111111",
  buyerPlayerId: "22222222-2222-4222-8222-222222222222",
  offerKey: `sof_${"a".repeat(32)}`,
  quoteKey: `quote_${"b".repeat(32)}`,
  quantity: 3,
  expectedOfferVersion: 7,
  idempotencyKey: "settlement-command-0001",
});
assert.equal(command.quantity, 3);
assert.equal(
  normalizeBusinessStoreOfferSettlementCommand({
    ...command,
    expectedOfferVersion: 1_000_001,
  }).expectedOfferVersion,
  1_000_001,
);
for (
  const patch of [
    { quantity: 0 },
    { quantity: 1_000_001 },
    { quantity: "3" },
    { expectedOfferVersion: 0 },
    { expectedOfferVersion: "7" },
    { offerKey: "bad" },
    { quoteKey: "bad" },
    { idempotencyKey: "short" },
  ]
) {
  assert.throws(
    () =>
      normalizeBusinessStoreOfferSettlementCommand({ ...command, ...patch }),
    (error) =>
      error instanceof StoreOfferSettlementContractError &&
      error.code === "invalid_store_offer_settlement_command",
  );
}

const receipt = {
  receiptKey: `spr_${"c".repeat(32)}`,
  quoteKey: command.quoteKey,
  offerKey: command.offerKey,
  businessKey: `biz_${"d".repeat(32)}`,
  sellerPartyKey: `pty_${"e".repeat(32)}`,
  catalogItemKey: `itm_${"f".repeat(32)}`,
  canonicalItemKey: "business.widget",
  storeItemKey: "business_widget",
  buyerInventoryAccountKey: `iac_${"1".repeat(32)}`,
  inventoryTransactionKey: `itx_${"2".repeat(32)}`,
  quantity: 3,
  unitPrice: 12.5,
  totalPrice: 37.5,
  currencyCode: "NRC",
  buyerDebit: 37.5,
  businessCredit: 37.5,
  grossRevenue: 37.5,
  costOfGoodsSold: 15,
  grossMargin: 22.5,
  sourceUnitCost: 5,
  costCurrencyCode: "NRC",
  offerVersionBefore: 7,
  offerVersionAfter: 8,
  remainingListedQuantity: 17,
  completedAt: "2026-08-25T05:00:00.000Z",
  replayed: false,
};
assert.deepEqual(parseBusinessStoreOfferReceipt(receipt), receipt);
for (
  const [patch, pattern] of [
    [{ totalPrice: 37.50001 }, /at most four decimals/u],
    [{
      unitPrice: 0,
      totalPrice: 0,
      buyerDebit: 0,
      businessCredit: 0,
      grossRevenue: 0,
      grossMargin: -15,
    }, /economic invariants/u],
    [{
      totalPrice: 37.5555,
      buyerDebit: 37.5555,
      businessCredit: 37.5555,
      grossRevenue: 37.5555,
      grossMargin: 22.5555,
    }, /economic invariants/u],
    [{ buyerDebit: 30 }, /economic invariants/u],
    [{ costOfGoodsSold: 14 }, /economic invariants/u],
    [{ grossMargin: 20 }, /economic invariants/u],
    [{ costCurrencyCode: "ALT" }, /must match/u],
    [{ offerVersionAfter: 9 }, /economic invariants/u],
    [{ remainingListedQuantity: -1 }, /non-negative/u],
    [{ quantity: "3" }, /positive integer/u],
    [{ totalPrice: "37.5" }, /exact value/u],
    [{ internalReceiptId: "not-public" }, /public contract exactly/u],
  ]
) {
  assert.throws(
    () => parseBusinessStoreOfferReceipt({ ...receipt, ...patch }),
    pattern,
  );
}

let rpcCall;
const repository = new SupabaseStoreOfferSettlementRepository({
  rpc(name, args) {
    rpcCall = { name, args };
    return Promise.resolve({ data: receipt, error: null });
  },
});
assert.deepEqual(
  await settleBusinessStoreOffer(command, { settlementRepository: repository }),
  receipt,
);
assert.deepEqual(rpcCall, {
  name: "settle_business_store_offer_v2",
  args: {
    p_game_session_id: command.gameSessionId,
    p_buyer_player_id: command.buyerPlayerId,
    p_offer_key: command.offerKey,
    p_quote_key: command.quoteKey,
    p_quantity: command.quantity,
    p_expected_offer_version: command.expectedOfferVersion,
    p_idempotency_key: command.idempotencyKey,
  },
});

for (
  const [message, code] of [
    [
      "STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT",
      "store_offer_settlement_idempotency_conflict",
    ],
    [
      "STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS",
      "store_offer_settlement_insufficient_funds",
    ],
    [
      "STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK",
      "store_offer_settlement_insufficient_stock",
    ],
    [
      "STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED",
      "store_offer_settlement_inventory_reserved",
    ],
    [
      "STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED",
      "store_offer_settlement_quote_expired",
    ],
    [
      "STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT",
      "store_offer_settlement_offer_conflict",
    ],
    [
      "STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID",
      "store_offer_settlement_quote_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN",
      "store_offer_settlement_self_purchase_forbidden",
    ],
    [
      "STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE",
      "store_offer_settlement_custody_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_CATALOG_UNAVAILABLE",
      "store_offer_settlement_catalog_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_BUSINESS_UNAVAILABLE",
      "store_offer_settlement_party_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE",
      "store_offer_settlement_money_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE",
      "store_offer_settlement_inventory_unavailable",
    ],
    [
      "STORE_OFFER_SETTLEMENT_REQUEST_INVALID",
      "invalid_store_offer_settlement_command",
    ],
    [
      "UNEXPECTED_DATABASE_FAILURE",
      "store_offer_settlement_failed",
    ],
  ]
) {
  const failing = new SupabaseStoreOfferSettlementRepository({
    rpc() {
      return Promise.resolve({ data: null, error: { message } });
    },
  });
  await assert.rejects(
    failing.settleBusinessOffer(command),
    (error) =>
      error instanceof StoreOfferSettlementContractError &&
      error.code === code,
  );
}
console.log("Business Phase 10A.3 atomic settlement typed contract: PASS");
