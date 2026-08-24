#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  parseStorePurchaseSettlementReceipt,
  roundMoney,
} from "./business-phase10-store-purchase-settlement-contracts.ts";

class SerialLock {
  #tail = Promise.resolve();

  async run(action) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function publicKey(prefix, fill) {
  return `${prefix}_${fill.repeat(32)}`;
}

function commandHash(command) {
  return JSON.stringify({
    game: command.game,
    buyer: command.buyer,
    offerKey: command.offerKey,
    quoteKey: command.quoteKey,
    quantity: command.quantity,
    expectedOfferVersion: command.expectedOfferVersion,
  });
}

class SettlementAuthority {
  constructor() {
    this.offers = new Map();
    this.buyerChecking = new Map();
    this.businessCash = new Map();
    this.buyerInventory = new Map();
    this.receipts = new Map();
    this.offerLocks = new Map();
    this.idempotencyLocks = new Map();
    this.receiptSequence = 0;
    this.transactionSequence = 0;
  }

  registerOffer({
    game,
    buyer,
    businessKey,
    sellerPartyKey,
    offerKey,
    quoteKey,
    itemKey,
    status = "active",
    version = 1,
    listedQuantity,
    reservedQuantity = 0,
    unitPrice,
    unitCost,
    currencyCode,
    buyerChecking,
    businessCash,
    buyerInventory = 0,
  }) {
    const offerScope = `${game}|${offerKey}`;
    this.offers.set(offerScope, {
      game,
      businessKey,
      sellerPartyKey,
      offerKey,
      quoteKey,
      itemKey,
      status,
      version,
      listedQuantity,
      reservedQuantity,
      unitPrice,
      unitCost,
      currencyCode,
    });
    this.buyerChecking.set(`${game}|${buyer}`, buyerChecking);
    this.businessCash.set(`${game}|${businessKey}`, businessCash);
    this.buyerInventory.set(`${game}|${buyer}|${itemKey}`, buyerInventory);
  }

  async settle(command, hooks = {}) {
    const idempotencyScope =
      `${command.game}|${command.buyer}|${command.idempotencyKey}`;
    return this.#idempotencyLock(idempotencyScope).run(async () => {
      const requestHash = commandHash(command);
      const existing = this.receipts.get(idempotencyScope);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new Error("STORE_PURCHASE_SETTLEMENT_IDEMPOTENCY_CONFLICT");
        }
        return {
          ...structuredClone(existing.receipt),
          replayed: true,
        };
      }

      const offerScope = `${command.game}|${command.offerKey}`;
      return this.#offerLock(offerScope).run(async () => {
        hooks.onOfferLocked?.();
        if (hooks.waitAfterOfferLock) {
          await hooks.waitAfterOfferLock;
        }

        const offer = this.offers.get(offerScope);
        if (!offer) {
          throw new Error("STORE_PURCHASE_SETTLEMENT_OFFER_NOT_FOUND");
        }
        if (offer.status !== "active") {
          throw new Error("STORE_PURCHASE_SETTLEMENT_OFFER_NOT_PURCHASABLE");
        }
        if (offer.version !== command.expectedOfferVersion) {
          throw new Error("STORE_PURCHASE_SETTLEMENT_OFFER_VERSION_CONFLICT");
        }
        if (offer.quoteKey !== command.quoteKey) {
          throw new Error("STORE_PURCHASE_SETTLEMENT_QUOTE_MISMATCH");
        }
        if (
          command.quantity < 1 ||
          command.quantity > offer.listedQuantity - offer.reservedQuantity
        ) {
          throw new Error("STORE_PURCHASE_SETTLEMENT_QUANTITY_UNAVAILABLE");
        }

        const total = roundMoney(offer.unitPrice * command.quantity);
        const buyerKey = `${command.game}|${command.buyer}`;
        const businessKey = `${command.game}|${offer.businessKey}`;
        const inventoryKey =
          `${command.game}|${command.buyer}|${offer.itemKey}`;

        const snapshot = {
          offer: structuredClone(offer),
          buyerChecking: this.buyerChecking.get(buyerKey),
          businessCash: this.businessCash.get(businessKey),
          buyerInventory: this.buyerInventory.get(inventoryKey) ?? 0,
          receiptSequence: this.receiptSequence,
          transactionSequence: this.transactionSequence,
        };

        try {
          if (snapshot.buyerChecking < total) {
            throw new Error(
              "STORE_PURCHASE_SETTLEMENT_INSUFFICIENT_BUYER_CHECKING",
            );
          }

          this.buyerChecking.set(
            buyerKey,
            roundMoney(snapshot.buyerChecking - total),
          );
          hooks.failAt === "after_buyer_debit" &&
            (() => {
              throw new Error("INJECTED_AFTER_BUYER_DEBIT");
            })();

          this.businessCash.set(
            businessKey,
            roundMoney(snapshot.businessCash + total),
          );
          hooks.failAt === "after_seller_credit" &&
            (() => {
              throw new Error("INJECTED_AFTER_SELLER_CREDIT");
            })();

          offer.listedQuantity -= command.quantity;
          this.buyerInventory.set(
            inventoryKey,
            snapshot.buyerInventory + command.quantity,
          );
          hooks.failAt === "after_inventory_transfer" &&
            (() => {
              throw new Error("INJECTED_AFTER_INVENTORY_TRANSFER");
            })();

          const versionBefore = offer.version;
          offer.version += 1;
          const receiptNumber = ++this.receiptSequence;
          const transactionNumber = ++this.transactionSequence;
          const receipt = parseStorePurchaseSettlementReceipt({
            receiptKey: publicKey(
              "spr",
              (receiptNumber % 16).toString(16),
            ),
            quoteKey: offer.quoteKey,
            offerKey: offer.offerKey,
            businessKey: offer.businessKey,
            sellerPartyKey: offer.sellerPartyKey,
            canonicalItemKey: offer.itemKey,
            buyerInventoryAccountKey: publicKey("iac", "b"),
            inventoryTransactionKey: publicKey(
              "itx",
              (transactionNumber % 16).toString(16),
            ),
            quantity: command.quantity,
            unitPrice: offer.unitPrice,
            finalTotalPrice: total,
            currencyCode: offer.currencyCode,
            buyerDebitAmount: total,
            sellerCreditAmount: total,
            grossRevenue: total,
            costOfGoodsSold: roundMoney(
              offer.unitCost * command.quantity,
            ),
            offerVersionBefore: versionBefore,
            offerVersionAfter: offer.version,
            remainingListedQuantity: offer.listedQuantity,
            buyerInventoryQuantityOwned:
              this.buyerInventory.get(inventoryKey),
            completedAt: command.completedAt,
            replayed: false,
          });

          hooks.failAt === "before_receipt_commit" &&
            (() => {
              throw new Error("INJECTED_BEFORE_RECEIPT_COMMIT");
            })();

          this.receipts.set(idempotencyScope, {
            requestHash,
            receipt: structuredClone(receipt),
          });
          return receipt;
        } catch (error) {
          this.offers.set(offerScope, snapshot.offer);
          this.buyerChecking.set(buyerKey, snapshot.buyerChecking);
          this.businessCash.set(businessKey, snapshot.businessCash);
          this.buyerInventory.set(inventoryKey, snapshot.buyerInventory);
          this.receiptSequence = snapshot.receiptSequence;
          this.transactionSequence = snapshot.transactionSequence;
          this.receipts.delete(idempotencyScope);
          throw error;
        }
      });
    });
  }

  async requestWithdrawal({ game, offerKey, expectedVersion }, hooks = {}) {
    const offerScope = `${game}|${offerKey}`;
    return this.#offerLock(offerScope).run(async () => {
      hooks.onOfferLocked?.();
      if (hooks.waitAfterOfferLock) {
        await hooks.waitAfterOfferLock;
      }
      const offer = this.offers.get(offerScope);
      if (!offer) throw new Error("STORE_WITHDRAWAL_OFFER_NOT_FOUND");
      if (offer.status !== "active") {
        throw new Error("STORE_WITHDRAWAL_OFFER_STATUS_INVALID");
      }
      if (offer.version !== expectedVersion) {
        throw new Error("STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT");
      }
      offer.status = "withdrawal_pending";
      offer.version += 1;
      return {
        offerKey,
        status: offer.status,
        version: offer.version,
      };
    });
  }

  state({ game, buyer, businessKey, offerKey, itemKey }) {
    return {
      offer: structuredClone(this.offers.get(`${game}|${offerKey}`)),
      buyerChecking: this.buyerChecking.get(`${game}|${buyer}`),
      businessCash: this.businessCash.get(`${game}|${businessKey}`),
      buyerInventory:
        this.buyerInventory.get(`${game}|${buyer}|${itemKey}`) ?? 0,
      receiptCount: this.receipts.size,
      transactionSequence: this.transactionSequence,
    };
  }

  #offerLock(scope) {
    if (!this.offerLocks.has(scope)) {
      this.offerLocks.set(scope, new SerialLock());
    }
    return this.offerLocks.get(scope);
  }

  #idempotencyLock(scope) {
    if (!this.idempotencyLocks.has(scope)) {
      this.idempotencyLocks.set(scope, new SerialLock());
    }
    return this.idempotencyLocks.get(scope);
  }
}

const authority = new SettlementAuthority();
const gameOne = "11111111-1111-4111-8111-111111111111";
const gameTwo = "22222222-2222-4222-8222-222222222222";
const buyerOne = "33333333-3333-4333-8333-333333333333";
const buyerTwo = "44444444-4444-4444-8444-444444444444";
const businessOne = publicKey("biz", "a");
const businessTwo = publicKey("biz", "b");
const partyOne = publicKey("pty", "c");
const partyTwo = publicKey("pty", "d");
const offerOne = publicKey("sof", "e");
const offerTwo = publicKey("sof", "f");
const quoteOne = publicKey("quote", "1");
const quoteTwo = publicKey("quote", "2");
const itemOne = "canonical.widget";
const itemTwo = "canonical.gadget";

authority.registerOffer({
  game: gameOne,
  buyer: buyerOne,
  businessKey: businessOne,
  sellerPartyKey: partyOne,
  offerKey: offerOne,
  quoteKey: quoteOne,
  itemKey: itemOne,
  listedQuantity: 10,
  unitPrice: 12,
  unitCost: 5,
  currencyCode: "NRC",
  buyerChecking: 100,
  businessCash: 20,
});

authority.registerOffer({
  game: gameTwo,
  buyer: buyerTwo,
  businessKey: businessTwo,
  sellerPartyKey: partyTwo,
  offerKey: offerTwo,
  quoteKey: quoteTwo,
  itemKey: itemTwo,
  listedQuantity: 7,
  unitPrice: 9,
  unitCost: 4,
  currencyCode: "NRC",
  buyerChecking: 80,
  businessCash: 11,
});

const purchaseGate = deferred();
const purchaseLocked = deferred();
const purchaseFirstCommand = {
  game: gameOne,
  buyer: buyerOne,
  offerKey: offerOne,
  quoteKey: quoteOne,
  quantity: 3,
  expectedOfferVersion: 1,
  idempotencyKey: "purchase-first-0001",
  completedAt: "2026-08-25T00:00:00.000Z",
};

const purchaseFirstPromise = authority.settle(purchaseFirstCommand, {
  onOfferLocked: purchaseLocked.resolve,
  waitAfterOfferLock: purchaseGate.promise,
});
await purchaseLocked.promise;

const withdrawalAfterPurchase = authority.requestWithdrawal({
  game: gameOne,
  offerKey: offerOne,
  expectedVersion: 2,
});
purchaseGate.resolve();

const purchaseFirstReceipt = await purchaseFirstPromise;
const withdrawalAfterReceipt = await withdrawalAfterPurchase;
assert.equal(purchaseFirstReceipt.offerVersionBefore, 1);
assert.equal(purchaseFirstReceipt.offerVersionAfter, 2);
assert.equal(purchaseFirstReceipt.remainingListedQuantity, 7);
assert.equal(purchaseFirstReceipt.costOfGoodsSold, 15);
assert.equal(withdrawalAfterReceipt.status, "withdrawal_pending");
assert.equal(withdrawalAfterReceipt.version, 3);

const purchaseFirstState = authority.state({
  game: gameOne,
  buyer: buyerOne,
  businessKey: businessOne,
  offerKey: offerOne,
  itemKey: itemOne,
});
assert.equal(purchaseFirstState.buyerChecking, 64);
assert.equal(purchaseFirstState.businessCash, 56);
assert.equal(purchaseFirstState.buyerInventory, 3);
assert.equal(purchaseFirstState.offer.listedQuantity, 7);

const replay = await authority.settle(purchaseFirstCommand);
assert.equal(replay.replayed, true);
assert.equal(replay.receiptKey, purchaseFirstReceipt.receiptKey);
const replayState = authority.state({
  game: gameOne,
  buyer: buyerOne,
  businessKey: businessOne,
  offerKey: offerOne,
  itemKey: itemOne,
});
assert.deepEqual(replayState, purchaseFirstState);

await assert.rejects(
  () =>
    authority.settle({
      ...purchaseFirstCommand,
      quantity: 2,
    }),
  /IDEMPOTENCY_CONFLICT/u,
);
assert.deepEqual(
  authority.state({
    game: gameOne,
    buyer: buyerOne,
    businessKey: businessOne,
    offerKey: offerOne,
    itemKey: itemOne,
  }),
  purchaseFirstState,
);

const withdrawalGate = deferred();
const withdrawalLocked = deferred();
const withdrawalFirst = authority.requestWithdrawal(
  {
    game: gameTwo,
    offerKey: offerTwo,
    expectedVersion: 1,
  },
  {
    onOfferLocked: withdrawalLocked.resolve,
    waitAfterOfferLock: withdrawalGate.promise,
  },
);
await withdrawalLocked.promise;

const beforeWithdrawalFirstPurchase = authority.state({
  game: gameTwo,
  buyer: buyerTwo,
  businessKey: businessTwo,
  offerKey: offerTwo,
  itemKey: itemTwo,
});
const purchaseAfterWithdrawal = authority.settle({
  game: gameTwo,
  buyer: buyerTwo,
  offerKey: offerTwo,
  quoteKey: quoteTwo,
  quantity: 2,
  expectedOfferVersion: 1,
  idempotencyKey: "withdrawal-first-0002",
  completedAt: "2026-08-25T00:00:01.000Z",
});
withdrawalGate.resolve();

const withdrawalFirstReceipt = await withdrawalFirst;
assert.equal(withdrawalFirstReceipt.status, "withdrawal_pending");
await assert.rejects(
  () => purchaseAfterWithdrawal,
  /OFFER_NOT_PURCHASABLE/u,
);

const afterWithdrawalFirstPurchase = authority.state({
  game: gameTwo,
  buyer: buyerTwo,
  businessKey: businessTwo,
  offerKey: offerTwo,
  itemKey: itemTwo,
});
assert.equal(
  afterWithdrawalFirstPurchase.buyerChecking,
  beforeWithdrawalFirstPurchase.buyerChecking,
);
assert.equal(
  afterWithdrawalFirstPurchase.businessCash,
  beforeWithdrawalFirstPurchase.businessCash,
);
assert.equal(
  afterWithdrawalFirstPurchase.buyerInventory,
  beforeWithdrawalFirstPurchase.buyerInventory,
);
assert.equal(afterWithdrawalFirstPurchase.offer.listedQuantity, 7);
assert.equal(afterWithdrawalFirstPurchase.offer.version, 2);
assert.equal(afterWithdrawalFirstPurchase.receiptCount, 1);

const rollbackOffer = publicKey("sof", "3");
const rollbackQuote = publicKey("quote", "4");
const rollbackBusiness = publicKey("biz", "5");
const rollbackParty = publicKey("pty", "6");
const rollbackBuyer = "55555555-5555-4555-8555-555555555555";
const rollbackGame = "66666666-6666-4666-8666-666666666666";
const rollbackItem = "canonical.rollback";

authority.registerOffer({
  game: rollbackGame,
  buyer: rollbackBuyer,
  businessKey: rollbackBusiness,
  sellerPartyKey: rollbackParty,
  offerKey: rollbackOffer,
  quoteKey: rollbackQuote,
  itemKey: rollbackItem,
  listedQuantity: 4,
  unitPrice: 10,
  unitCost: 6,
  currencyCode: "NRC",
  buyerChecking: 50,
  businessCash: 5,
  buyerInventory: 1,
});

const rollbackBefore = authority.state({
  game: rollbackGame,
  buyer: rollbackBuyer,
  businessKey: rollbackBusiness,
  offerKey: rollbackOffer,
  itemKey: rollbackItem,
});

await assert.rejects(
  () =>
    authority.settle(
      {
        game: rollbackGame,
        buyer: rollbackBuyer,
        offerKey: rollbackOffer,
        quoteKey: rollbackQuote,
        quantity: 2,
        expectedOfferVersion: 1,
        idempotencyKey: "rollback-purchase-0003",
        completedAt: "2026-08-25T00:00:02.000Z",
      },
      { failAt: "after_seller_credit" },
    ),
  /INJECTED_AFTER_SELLER_CREDIT/u,
);

assert.deepEqual(
  authority.state({
    game: rollbackGame,
    buyer: rollbackBuyer,
    businessKey: rollbackBusiness,
    offerKey: rollbackOffer,
    itemKey: rollbackItem,
  }),
  rollbackBefore,
);

assert.equal(
  authority.state({
    game: gameOne,
    buyer: buyerOne,
    businessKey: businessOne,
    offerKey: offerOne,
    itemKey: itemOne,
  }).buyerChecking,
  64,
  "Game-one state must remain isolated from other-game rollback and withdrawal.",
);

console.log(
  "Business Phase 10A.1 purchase/withdrawal, replay, rollback, and isolation simulation: PASS",
);
