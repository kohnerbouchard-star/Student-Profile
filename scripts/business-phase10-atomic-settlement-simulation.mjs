#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicKey = (prefix, value) => `${prefix}_${digest(value).slice(0, 32)}`;
const round4 = (value) =>
  Math.round((value + Number.EPSILON) * 10_000) / 10_000;
class Mutex {
  tail = Promise.resolve();
  async run(task) {
    const prior = this.tail;
    let release;
    this.tail = new Promise((resolve) => (release = resolve));
    await prior;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

class AtomicSettlementAuthority {
  games = new Map();
  locks = new Map();
  idempotencyLocks = new Map();
  sequence = 0;
  seededPurchases = 0;
  mutex(map, key) {
    if (!map.has(key)) map.set(key, new Mutex());
    return map.get(key);
  }
  addGame(
    game,
    {
      buyer = "buyer",
      owner = "owner",
      coOwner = "co-owner",
      stock = 8,
      buyerCash = 100,
      businessCash = 20,
    } = {},
  ) {
    const offerKey = publicKey("sof", `${game}:offer`);
    const quoteKey = publicKey("quote", `${game}:quote`);
    this.games.set(game, {
      buyers: new Map([
        [buyer, { active: true, checking: buyerCash, inventory: 0 }],
        [owner, { active: true, checking: 100, inventory: 0 }],
        [coOwner, { active: true, checking: 100, inventory: 0 }],
      ]),
      business: {
        owner,
        owners: new Set([owner, coOwner]),
        active: true,
        cash: businessCash,
      },
      offer: {
        offerKey,
        status: "active",
        version: 1,
        stock,
        reserved: 0,
        unitPrice: 12.5,
        sourceUnitCost: 4.1234,
        currency: "NRC",
      },
      quotes: new Map([[quoteKey, {
        quoteKey,
        buyer,
        status: "created",
        version: 1,
        offerVersion: 1,
        quantity: 2,
        total: 25,
        expiresAt: 10_000,
      }]]),
      receipts: new Map(),
      activities: [],
      accountingEvidence: [],
      ledger: [],
      inventoryTransactions: [],
      inventoryLines: [],
      inventoryEvents: [],
    });
    return { game, buyer, owner, coOwner, offerKey, quoteKey };
  }
  snapshot(game) {
    return structuredClone(this.games.get(game));
  }
  restore(game, snapshot) {
    this.games.set(game, snapshot);
  }
  state(game) {
    return structuredClone(this.games.get(game));
  }
  requestHash(command) {
    return digest({
      authority: "business-store-offer-settlement-v2",
      ...command,
    });
  }
  async settle(command, now = 1_000, hooks = {}) {
    const scope = `${command.game}|${command.buyer}|${command.idempotencyKey}`;
    return this.mutex(this.idempotencyLocks, scope).run(async () => {
      const game = this.games.get(command.game);
      const requestHash = this.requestHash(command);
      const replay = [...game.receipts.values()].find((item) =>
        item.buyer === command.buyer &&
        item.idempotencyKey === command.idempotencyKey
      );
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new Error("STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT");
        }
        return { ...replay, replayed: true };
      }
      return this.mutex(this.locks, `${command.game}|${command.offerKey}`).run(
        async () => {
          hooks.locked?.();
          if (hooks.gate) await hooks.gate;
          const before = this.snapshot(command.game);
          try {
            const current = this.games.get(command.game);
            const buyer = current.buyers.get(command.buyer);
            const offer = current.offer;
            const quote = current.quotes.get(command.quoteKey);
            if (!buyer?.active || !current.business.active) {
              throw new Error("STORE_OFFER_SETTLEMENT_PARTY_UNAVAILABLE");
            }
            if (current.business.owners.has(command.buyer)) {
              throw new Error("STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN");
            }
            if (
              offer.offerKey !== command.offerKey || offer.status !== "active"
            ) throw new Error("STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID");
            if (offer.version !== command.expectedOfferVersion) {
              throw new Error("STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT");
            }
            if (
              !quote || quote.buyer !== command.buyer ||
              quote.status !== "created"
            ) throw new Error("STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID");
            if (quote.expiresAt <= now) {
              throw new Error("STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED");
            }
            if (
              quote.offerVersion !== offer.version ||
              quote.quantity !== command.quantity ||
              quote.total !== round4(offer.unitPrice * command.quantity)
            ) throw new Error("STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH");
            if (quote.total !== Math.round(quote.total * 100) / 100) {
              throw new Error(
                "STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE",
              );
            }
            if (offer.reserved !== 0) {
              throw new Error("STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED");
            }
            if (offer.stock < command.quantity) {
              throw new Error("STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK");
            }
            if (buyer.checking < quote.total) {
              throw new Error("STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS");
            }
            const receiptKey = publicKey(
              "spr",
              `${command.game}:${++this.sequence}`,
            );
            buyer.checking -= quote.total;
            current.ledger.push({
              side: "buyer_debit",
              amount: -quote.total,
              receiptKey,
            });
            this.inject(hooks.failStage, "after_buyer_debit");
            current.business.cash += quote.total;
            current.ledger.push({
              side: "business_credit",
              amount: quote.total,
              receiptKey,
            });
            this.inject(hooks.failStage, "after_business_credit");
            offer.stock -= command.quantity;
            buyer.inventory += command.quantity;
            current.inventoryTransactions.push({
              quantity: command.quantity,
              receiptKey,
            });
            current.inventoryLines.push(
              {
                side: "listing",
                quantityDelta: -command.quantity,
                unitCost: offer.sourceUnitCost,
                currency: offer.currency,
                receiptKey,
              },
              {
                side: "buyer",
                quantityDelta: command.quantity,
                unitCost: offer.sourceUnitCost,
                currency: offer.currency,
                receiptKey,
              },
            );
            current.inventoryEvents.push({
              type: "PURCHASED",
              quantityDelta: command.quantity,
              receiptKey,
            });
            this.inject(hooks.failStage, "after_inventory_post");
            const cogs = round4(offer.sourceUnitCost * command.quantity);
            const margin = round4(quote.total - cogs);
            current.accountingEvidence.push({
              receiptKey,
              grossRevenue: quote.total,
              cogs,
              margin,
            });
            current.activities.push({
              eventType: "business.store.sale.completed",
              receiptKey,
              grossRevenue: quote.total,
              cogs,
              margin,
            });
            this.inject(hooks.failStage, "after_activity");
            const receipt = {
              receiptKey,
              game: command.game,
              buyer: command.buyer,
              offerKey: command.offerKey,
              quoteKey: command.quoteKey,
              quantity: command.quantity,
              totalPrice: quote.total,
              cogs,
              margin,
              remaining: offer.stock,
              offerVersionBefore: offer.version,
              offerVersionAfter: offer.version + 1,
              idempotencyKey: command.idempotencyKey,
              requestHash,
              replayed: false,
            };
            current.receipts.set(receiptKey, receipt);
            this.inject(hooks.failStage, "after_receipt");
            quote.status = "used";
            quote.version += 1;
            this.inject(hooks.failStage, "after_quote_consumption");
            offer.version += 1;
            this.inject(hooks.failStage, "after_offer_version");
            return receipt;
          } catch (error) {
            this.restore(command.game, before);
            throw error;
          }
        },
      );
    });
  }
  async withdraw(gameKey, expectedVersion, hooks = {}) {
    const game = this.games.get(gameKey);
    return this.mutex(this.locks, `${gameKey}|${game.offer.offerKey}`).run(
      async () => {
        hooks.locked?.();
        if (hooks.gate) await hooks.gate;
        if (
          game.offer.status !== "active" ||
          game.offer.version !== expectedVersion
        ) throw new Error("STORE_WITHDRAWAL_CONFLICT");
        game.offer.status = "withdrawal_pending";
        game.offer.version += 1;
        return { ...game.offer };
      },
    );
  }
  inject(actual, expected) {
    if (actual === expected) {
      throw new Error(`STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:${expected}`);
    }
  }
  seededPurchase() {
    this.seededPurchases += 1;
    return this.seededPurchases;
  }
}

const build = (options) => {
  const authority = new AtomicSettlementAuthority();
  const fixture = authority.addGame("game-a", options);
  return { authority, fixture };
};
const commandFor = (fixture, patch = {}) => ({
  game: fixture.game,
  buyer: fixture.buyer,
  offerKey: fixture.offerKey,
  quoteKey: fixture.quoteKey,
  quantity: 2,
  expectedOfferVersion: 1,
  idempotencyKey: "settlement-0001",
  ...patch,
});

const { authority, fixture } = build();
const purchased = await authority.settle(commandFor(fixture));
assert.equal(purchased.totalPrice, 25);
assert.equal(purchased.cogs, 8.2468);
assert.equal(purchased.margin, 16.7532);
let state = authority.state(fixture.game);
assert.equal(state.buyers.get(fixture.buyer).checking, 75);
assert.equal(state.business.cash, 45);
assert.equal(state.buyers.get(fixture.buyer).inventory, 2);
assert.equal(state.offer.stock, 6);
assert.equal(state.ledger.length, 2);
assert.equal(state.inventoryTransactions.length, 1);
assert.equal(state.inventoryLines.length, 2);
assert.equal(state.inventoryEvents.length, 1);
assert.equal(state.accountingEvidence.length, 1);
assert.equal(state.activities.length, 1);
assert.equal(state.receipts.size, 1);
assert.equal(state.quotes.get(fixture.quoteKey).version, 2);
authority.games.get(fixture.game).offer.status = "paused";
authority.games.get(fixture.game).business.active = false;
authority.games.get(fixture.game).buyers.get(fixture.buyer).active = false;
state = authority.state(fixture.game);
const replay = await authority.settle(commandFor(fixture));
assert.equal(replay.receiptKey, purchased.receiptKey);
assert.equal(replay.replayed, true);
assert.deepEqual(
  authority.state(fixture.game),
  state,
  "matching replay must not mutate",
);
await assert.rejects(
  authority.settle(commandFor(fixture, { quantity: 1 })),
  /IDEMPOTENCY_CONFLICT/u,
);

const rollbackStages = [
  "after_buyer_debit",
  "after_business_credit",
  "after_inventory_post",
  "after_activity",
  "after_receipt",
  "after_quote_consumption",
  "after_offer_version",
];
for (const failStage of rollbackStages) {
  const test = build();
  const before = test.authority.state(test.fixture.game);
  await assert.rejects(
    test.authority.settle(commandFor(test.fixture), 1_000, { failStage }),
    new RegExp(failStage),
  );
  assert.deepEqual(
    test.authority.state(test.fixture.game),
    before,
    `${failStage} must roll back all state`,
  );
}

for (
  const [options, pattern] of [[{ buyerCash: 20 }, /INSUFFICIENT_FUNDS/u], [{
    stock: 1,
  }, /INSUFFICIENT_STOCK/u]]
) {
  const test = build(options);
  const before = test.authority.state(test.fixture.game);
  await assert.rejects(
    test.authority.settle(commandFor(test.fixture)),
    pattern,
  );
  assert.deepEqual(test.authority.state(test.fixture.game), before);
}
const reserved = build();
reserved.authority.games.get(reserved.fixture.game).offer.reserved = 1;
await assert.rejects(
  reserved.authority.settle(commandFor(reserved.fixture)),
  /INVENTORY_RESERVED/u,
);
const coOwner = build();
await assert.rejects(
  coOwner.authority.settle(
    commandFor(coOwner.fixture, { buyer: coOwner.fixture.coOwner }),
  ),
  /SELF_PURCHASE/u,
);
for (
  const [mutate, now, pattern] of [
    [
      (test) => {
        test.authority.games.get(test.fixture.game).quotes.get(
          test.fixture.quoteKey,
        ).total = 24;
      },
      1_000,
      /QUOTE_MISMATCH/u,
    ],
    [() => {}, 10_000, /QUOTE_EXPIRED/u],
  ]
) {
  const test = build();
  mutate(test);
  const before = test.authority.state(test.fixture.game);
  await assert.rejects(
    test.authority.settle(commandFor(test.fixture), now),
    pattern,
  );
  assert.deepEqual(test.authority.state(test.fixture.game), before);
}

const purchaseFirst = build();
let releasePurchase;
const purchaseGate = new Promise((resolve) => (releasePurchase = resolve));
let purchaseLocked;
const purchaseLock = new Promise((resolve) => (purchaseLocked = resolve));
const purchasePromise = purchaseFirst.authority.settle(
  commandFor(purchaseFirst.fixture),
  1_000,
  { locked: purchaseLocked, gate: purchaseGate },
);
await purchaseLock;
const laterWithdrawal = purchaseFirst.authority.withdraw(
  purchaseFirst.fixture.game,
  1,
);
releasePurchase();
await purchasePromise;
await assert.rejects(laterWithdrawal, /WITHDRAWAL_CONFLICT/u);

const withdrawalFirst = build();
let releaseWithdrawal;
const withdrawalGate = new Promise((resolve) => (releaseWithdrawal = resolve));
let withdrawalLocked;
const withdrawalLock = new Promise((resolve) => (withdrawalLocked = resolve));
const firstWithdrawal = withdrawalFirst.authority.withdraw(
  withdrawalFirst.fixture.game,
  1,
  { locked: withdrawalLocked, gate: withdrawalGate },
);
await withdrawalLock;
const laterPurchase = withdrawalFirst.authority.settle(
  commandFor(withdrawalFirst.fixture),
);
releaseWithdrawal();
await firstWithdrawal;
await assert.rejects(laterPurchase, /OFFER_STATUS_INVALID/u);

const concurrentPurchases = build({ stock: 2 });
const secondQuote = publicKey("quote", "game-a:quote-two");
concurrentPurchases.authority.games.get("game-a").quotes.set(secondQuote, {
  quoteKey: secondQuote,
  buyer: fixture.buyer,
  status: "created",
  offerVersion: 1,
  quantity: 2,
  total: 25,
  expiresAt: 10_000,
});
const results = await Promise.allSettled([
  concurrentPurchases.authority.settle(commandFor(concurrentPurchases.fixture)),
  concurrentPurchases.authority.settle(
    commandFor(concurrentPurchases.fixture, {
      quoteKey: secondQuote,
      idempotencyKey: "settlement-0002",
    }),
  ),
]);
assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
assert.equal(concurrentPurchases.authority.state("game-a").offer.stock, 0);

const sameIdempotency = build({ stock: 2 });
const sameResults = await Promise.all([
  sameIdempotency.authority.settle(commandFor(sameIdempotency.fixture)),
  sameIdempotency.authority.settle(commandFor(sameIdempotency.fixture)),
]);
assert.deepEqual(
  sameResults.map((item) => item.replayed).sort(),
  [false, true],
);
assert.equal(sameIdempotency.authority.state("game-a").receipts.size, 1);
assert.equal(sameIdempotency.authority.state("game-a").ledger.length, 2);

const differentBuyers = build({ stock: 2 });
const secondBuyer = "buyer-two";
const secondBuyerQuote = publicKey("quote", "game-a:buyer-two");
const differentBuyerState = differentBuyers.authority.games.get("game-a");
differentBuyerState.buyers.set(secondBuyer, {
  active: true,
  checking: 100,
  inventory: 0,
});
differentBuyerState.quotes.set(secondBuyerQuote, {
  quoteKey: secondBuyerQuote,
  buyer: secondBuyer,
  status: "created",
  version: 1,
  offerVersion: 1,
  quantity: 2,
  total: 25,
  expiresAt: 10_000,
});
const pressure = await Promise.allSettled([
  differentBuyers.authority.settle(commandFor(differentBuyers.fixture)),
  differentBuyers.authority.settle(commandFor(differentBuyers.fixture, {
    buyer: secondBuyer,
    quoteKey: secondBuyerQuote,
    idempotencyKey: "settlement-buyer-two",
  })),
]);
assert.equal(pressure.filter((item) => item.status === "fulfilled").length, 1);
assert.equal(differentBuyers.authority.state("game-a").offer.stock, 0);
assert.equal(differentBuyers.authority.state("game-a").receipts.size, 1);

const isolated = new AtomicSettlementAuthority();
const gameA = isolated.addGame("game-a");
const gameB = isolated.addGame("game-b", { stock: 5, buyerCash: 200 });
await isolated.settle(commandFor(gameA));
const untouched = isolated.state("game-b");
assert.equal(untouched.offer.stock, 5);
assert.equal(
  untouched.buyers.get(gameB.buyer).checking,
  200,
  "two-game isolation",
);
assert.equal(
  isolated.seededPurchase(),
  1,
  "retained seeded purchase path remains independent",
);
console.log("Business Phase 10A.3 atomic settlement simulation: PASS");
