#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const key = (prefix, value) => `${prefix}_${hash(value).slice(0, 32)}`;
const round4 = (value) => Math.round((value + Number.EPSILON) * 1e4) / 1e4;
const TWO_MINUTES = 120_000;

class Mutex {
  tail = Promise.resolve();
  async run(task) {
    const prior = this.tail;
    let release;
    this.tail = new Promise((resolve) => (release = resolve));
    await prior;
    try { return await task(); } finally { release(); }
  }
}

class QuoteAuthority {
  buyers = new Map();
  offers = new Map();
  quotes = new Map();
  replayKeys = new Map();
  locks = new Map();
  offerLocks = new Map();
  sequence = 0;
  economicMutations = 0;

  addBuyer(game, id, currency = "NRC") {
    this.buyers.set(`${game}|${id}`, { game, id, currency, active: true, country: "NORTHREACH" });
  }
  addOffer(game, input) {
    this.offers.set(`${game}|${input.offerKey}`, {
      game,
      status: "active",
      version: 1,
      currency: "NRC",
      unitPrice: 12.5,
      owned: 20,
      reserved: 0,
      ...input,
    });
  }
  mutex(map, keyValue) {
    if (!map.has(keyValue)) map.set(keyValue, new Mutex());
    return map.get(keyValue);
  }

  async quote(command, now, hooks = {}) {
    const scope = `${command.game}|${command.buyer}|${command.idempotencyKey}`;
    const requestHash = hash({
      authority: "business-offer-quote-v2",
      game: command.game,
      buyer: command.buyer,
      offerKey: command.offerKey,
      quantity: command.quantity,
      expectedOfferVersion: command.expectedOfferVersion,
    });
    return this.mutex(this.locks, scope).run(async () => {
      const existingKey = this.replayKeys.get(scope);
      if (existingKey) {
        const existing = this.quotes.get(existingKey);
        if (existing.requestHash !== requestHash) {
          throw new Error("STORE_OFFER_QUOTE_IDEMPOTENCY_CONFLICT");
        }
        return this.result(existing, now, true);
      }
      const buyer = this.buyers.get(`${command.game}|${command.buyer}`);
      if (!buyer?.active) throw new Error("STORE_OFFER_QUOTE_BUYER_UNAVAILABLE");
      return this.mutex(this.offerLocks, `${command.game}|${command.offerKey}`).run(async () => {
        hooks.locked?.();
        if (hooks.gate) await hooks.gate;
        const offer = this.offers.get(`${command.game}|${command.offerKey}`);
        if (!offer) throw new Error("STORE_OFFER_QUOTE_OFFER_NOT_FOUND");
        if (offer.status !== "active") throw new Error("STORE_OFFER_QUOTE_OFFER_STATUS_INVALID");
        if (offer.version !== command.expectedOfferVersion) {
          throw new Error("STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT");
        }
        if (offer.owner === command.buyer) {
          throw new Error("STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN");
        }
        if (buyer.currency !== offer.currency) {
          throw new Error("STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED");
        }
        if (offer.reserved !== 0) throw new Error("STORE_OFFER_QUOTE_INVENTORY_RESERVED");
        if (offer.owned < command.quantity) throw new Error("STORE_OFFER_QUOTE_INSUFFICIENT_STOCK");
        const quote = {
          quoteKey: key("quote", ++this.sequence),
          requestHash,
          offerKey: offer.offerKey,
          offerVersion: offer.version,
          businessKey: offer.businessKey,
          sellerPartyKey: offer.partyKey,
          catalogItemKey: offer.itemKey,
          canonicalItemKey: "business.widget",
          storeItemKey: "business_widget",
          inventoryAccountKey: offer.accountKey,
          buyerCountryCode: buyer.country,
          quantity: command.quantity,
          availableQuantityAtQuote: offer.owned,
          sellerUnitPrice: offer.unitPrice,
          finalUnitPrice: offer.unitPrice,
          sellerTotalPrice: round4(offer.unitPrice * command.quantity),
          finalTotalPrice: round4(offer.unitPrice * command.quantity),
          sellerCurrencyCode: offer.currency,
          buyerCurrencyCode: buyer.currency,
          exchangeRate: 1,
          pricingVersion: "business-offer-fixed-price-v2",
          createdAt: now,
          expiresAt: now + TWO_MINUTES,
        };
        this.quotes.set(quote.quoteKey, quote);
        this.replayKeys.set(scope, quote.quoteKey);
        return this.result(quote, now, false);
      });
    });
  }

  async withdraw(game, offerKey, expectedVersion, hooks = {}) {
    return this.mutex(this.offerLocks, `${game}|${offerKey}`).run(async () => {
      hooks.locked?.();
      if (hooks.gate) await hooks.gate;
      const offer = this.offers.get(`${game}|${offerKey}`);
      if (offer.status !== "active") throw new Error("STORE_WITHDRAWAL_OFFER_STATUS_INVALID");
      if (offer.version !== expectedVersion) throw new Error("STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT");
      offer.status = "withdrawal_pending";
      offer.version += 1;
      return { ...offer };
    });
  }

  result(quote, now, replayed) {
    return {
      ...quote,
      quoteStatus: now >= quote.expiresAt ? "expired" : "created",
      createdAt: new Date(quote.createdAt).toISOString(),
      expiresAt: new Date(quote.expiresAt).toISOString(),
      replayed,
      requestHash: undefined,
    };
  }
}

const game1 = "11111111-1111-4111-8111-111111111111";
const game2 = "22222222-2222-4222-8222-222222222222";
const buyer = "33333333-3333-4333-8333-333333333333";
const owner = "44444444-4444-4444-8444-444444444444";
const offerKey = `sof_${"a".repeat(32)}`;
const offer = {
  offerKey,
  owner,
  businessKey: `biz_${"b".repeat(32)}`,
  partyKey: `pty_${"c".repeat(32)}`,
  itemKey: `itm_${"d".repeat(32)}`,
  accountKey: `iac_${"e".repeat(32)}`,
};
const now = Date.parse("2026-08-25T01:00:00Z");
const command = {
  game: game1,
  buyer,
  offerKey,
  quantity: 3,
  expectedOfferVersion: 1,
  idempotencyKey: "offer-quote-0001",
};
const build = () => {
  const authority = new QuoteAuthority();
  authority.addBuyer(game1, buyer);
  authority.addBuyer(game1, owner);
  authority.addBuyer(game2, buyer);
  authority.addOffer(game1, offer);
  authority.addOffer(game2, { ...offer, owner, unitPrice: 99 });
  return authority;
};

const authority = build();
const created = await authority.quote(command, now);
assert.equal(created.finalTotalPrice, 37.5);
assert.equal(created.replayed, false);
assert.equal(authority.economicMutations, 0);

// Durable replay is independent of later mutable state.
Object.assign(authority.offers.get(`${game1}|${offerKey}`), {
  status: "paused", version: 9, unitPrice: 500, owned: 0,
});
authority.buyers.get(`${game1}|${buyer}`).active = false;
const replay = await authority.quote(command, now + 1000);
assert.equal(replay.finalTotalPrice, 37.5);
assert.equal(replay.offerVersion, 1);
assert.equal(replay.replayed, true);
await assert.rejects(
  authority.quote({ ...command, quantity: 4 }, now),
  /STORE_OFFER_QUOTE_IDEMPOTENCY_CONFLICT/,
);

const concurrent = build();
const concurrentReplay = await Promise.all([
  concurrent.quote(command, now), concurrent.quote(command, now),
]);
assert.deepEqual(concurrentReplay.map((item) => item.replayed).sort(), [false, true]);
assert.equal(concurrent.quotes.size, 1);

// quote-first and withdrawal-first serialize on the offer lock.
const quoteFirst = build();
let releaseQuote;
const quoteGate = new Promise((resolve) => (releaseQuote = resolve));
let quoteLocked;
const quoteLockedPromise = new Promise((resolve) => (quoteLocked = resolve));
const quotePromise = quoteFirst.quote(command, now, { locked: quoteLocked, gate: quoteGate });
await quoteLockedPromise;
const withdrawalPromise = quoteFirst.withdraw(game1, offerKey, 1);
releaseQuote();
assert.equal((await quotePromise).offerVersion, 1);
assert.equal((await withdrawalPromise).version, 2);

const withdrawalFirst = build();
let releaseWithdrawal;
const withdrawalGate = new Promise((resolve) => (releaseWithdrawal = resolve));
let withdrawalLocked;
const withdrawalLockedPromise = new Promise((resolve) => (withdrawalLocked = resolve));
const firstWithdrawal = withdrawalFirst.withdraw(game1, offerKey, 1, {
  locked: withdrawalLocked,
  gate: withdrawalGate,
});
await withdrawalLockedPromise;
const quoteAfterWithdrawal = withdrawalFirst.quote(command, now);
releaseWithdrawal();
await firstWithdrawal;
await assert.rejects(quoteAfterWithdrawal, /STORE_OFFER_QUOTE_OFFER_STATUS_INVALID/);

for (const [patch, error] of [
  [{ reserved: 1 }, "STORE_OFFER_QUOTE_INVENTORY_RESERVED"],
  [{ owned: 2 }, "STORE_OFFER_QUOTE_INSUFFICIENT_STOCK"],
]) {
  const test = build();
  Object.assign(test.offers.get(`${game1}|${offerKey}`), patch);
  await assert.rejects(test.quote(command, now), new RegExp(error));
}
const currency = build();
currency.buyers.get(`${game1}|${buyer}`).currency = "ALT";
await assert.rejects(currency.quote(command, now), /STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED/);
const self = build();
await assert.rejects(
  self.quote({ ...command, buyer: owner, idempotencyKey: "self-quote-0001" }, now),
  /STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN/,
);
const stale = build();
await assert.rejects(
  stale.quote({ ...command, expectedOfferVersion: 2 }, now),
  /STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT/,
);
const isolation = build();
const isolated = await isolation.quote(
  { ...command, game: game2, quantity: 1, idempotencyKey: "two-game-isolation" },
  now,
);
assert.equal(isolated.finalTotalPrice, 99, "two-game isolation must preserve game scope");
const expiry = build();
await expiry.quote(command, now);
assert.equal((await expiry.quote(command, now + TWO_MINUTES)).quoteStatus, "expired");
assert.equal(expiry.economicMutations, 0);

console.log("Business Phase 10A.2 offer-aware quote simulation: PASS");
