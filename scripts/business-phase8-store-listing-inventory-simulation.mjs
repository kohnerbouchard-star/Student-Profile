#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = (value) => structuredClone(value);

class Mutex {
  #tail = Promise.resolve();

  async run(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class StoreListingAuthority {
  constructor() {
    this.businesses = new Map();
    this.offers = new Map();
    this.accounts = new Map();
    this.holdings = new Map();
    this.projections = new Map();
    this.transactions = new Map();
    this.offerLocks = new Map();
  }

  registerBusiness({ game, businessKey, partyKey, currencyCode }) {
    this.businesses.set(`${game}|${businessKey}`, {
      game,
      businessKey,
      partyKey,
      currencyCode,
      active: true,
    });
  }

  registerOffer({ game, businessKey, offerKey, itemKey, status = "draft" }) {
    const business = this.#business(game, businessKey);
    this.offers.set(`${game}|${offerKey}`, {
      game,
      businessKey,
      partyKey: business.partyKey,
      offerKey,
      itemKey,
      status,
      version: 1,
      accountKey: null,
    });
  }

  setFinishedGoods({
    game,
    businessKey,
    itemKey,
    owned,
    reserved = 0,
    averageUnitCost,
    currencyCode,
  }) {
    const business = this.#business(game, businessKey);
    assert.ok(Number.isInteger(owned) && owned >= 0);
    assert.ok(Number.isInteger(reserved) && reserved >= 0 && reserved <= owned);
    const accountKey = this.#finishedAccountKey(game, businessKey);
    this.accounts.set(`${game}|${accountKey}`, {
      game,
      accountKey,
      partyKey: business.partyKey,
      kind: "finished_goods",
      active: true,
    });
    this.holdings.set(`${game}|${accountKey}|${itemKey}`, {
      game,
      accountKey,
      itemKey,
      owned,
      reserved,
      averageUnitCost,
      currencyCode,
    });
    this.projections.set(`${game}|${businessKey}|${itemKey}`, {
      game,
      businessKey,
      accountKey,
      itemKey,
      kind: "finished_good",
      quantity: owned,
      unitCost: averageUnitCost,
      totalCostBasis: round4(owned * averageUnitCost),
      version: 1,
    });
  }

  async stock(request) {
    const lock = this.#lock(`${request.game}|${request.offerKey}`);
    return lock.run(async () => {
      await Promise.resolve();
      const snapshot = this.#snapshot();
      try {
        return this.#stockInTransaction(request);
      } catch (error) {
        this.#restore(snapshot);
        throw error;
      }
    });
  }

  aggregate(game, itemKey) {
    const offers = [...this.offers.values()]
      .filter(
        (offer) =>
          offer.game === game &&
          offer.itemKey === itemKey &&
          offer.status !== "retired" &&
          offer.accountKey !== null,
      )
      .map((offer) => {
        const holding = this.holdings.get(
          `${game}|${offer.accountKey}|${itemKey}`,
        );
        return {
          offerKey: offer.offerKey,
          availableQuantity: holding
            ? holding.owned - holding.reserved
            : 0,
          listedQuantity: holding?.owned ?? 0,
          version: offer.version,
        };
      })
      .sort((left, right) => left.offerKey.localeCompare(right.offerKey));
    return {
      itemKey,
      totalAvailableQuantity: offers.reduce(
        (sum, offer) => sum + offer.availableQuantity,
        0,
      ),
      offerCount: offers.length,
      offers,
    };
  }

  getOffer(game, offerKey) {
    return clone(this.offers.get(`${game}|${offerKey}`));
  }

  getFinishedHolding(game, businessKey, itemKey) {
    const accountKey = this.#finishedAccountKey(game, businessKey);
    return clone(this.holdings.get(`${game}|${accountKey}|${itemKey}`));
  }

  getProjection(game, businessKey, itemKey) {
    return clone(this.projections.get(`${game}|${businessKey}|${itemKey}`));
  }

  getListingHolding(game, offerKey, itemKey) {
    const offer = this.offers.get(`${game}|${offerKey}`);
    return offer?.accountKey
      ? clone(this.holdings.get(`${game}|${offer.accountKey}|${itemKey}`))
      : undefined;
  }

  transactionCount() {
    return this.transactions.size;
  }

  #stockInTransaction(request) {
    this.#validateRequest(request);
    const business = this.#business(request.game, request.businessKey);
    const offer = this.offers.get(`${request.game}|${request.offerKey}`);
    if (
      !offer ||
      offer.businessKey !== business.businessKey ||
      offer.partyKey !== business.partyKey
    ) {
      throw new Error("STORE_LISTING_STOCK_OFFER_NOT_FOUND");
    }
    if (offer.status === "retired") {
      throw new Error("STORE_LISTING_STOCK_OFFER_RETIRED");
    }

    const requestHash = digest({
      game: request.game,
      businessKey: business.businessKey,
      offerKey: offer.offerKey,
      quantity: request.quantity,
      expectedOfferVersion: request.expectedOfferVersion,
    });
    const replayKey = `${request.game}|business_store|stock_offer|${request.idempotencyKey}`;
    const existing = this.transactions.get(replayKey);
    if (existing) {
      if (
        existing.offerKey !== offer.offerKey ||
        existing.requestHash !== requestHash
      ) {
        throw new Error("STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT");
      }
      if (existing.status !== "committed") {
        throw new Error("STORE_LISTING_STOCK_IN_PROGRESS");
      }
      this.#assertProjectionMatchesHolding(business, offer.itemKey, "REPLAY");
      return this.#result({
        business,
        offer,
        transaction: existing,
        quantityAdded: request.quantity,
        replayed: true,
      });
    }

    if (offer.version !== request.expectedOfferVersion) {
      throw new Error("STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT");
    }

    const listingAccount = this.#ensureListingAccount(business, offer);
    if (offer.accountKey === null) {
      offer.accountKey = listingAccount.accountKey;
      offer.version += 1;
    } else if (offer.accountKey !== listingAccount.accountKey) {
      throw new Error("STORE_LISTING_STOCK_ACCOUNT_UNAVAILABLE");
    }

    const sourceHolding = this.#assertProjectionMatchesHolding(
      business,
      offer.itemKey,
      "",
    );
    const available = sourceHolding.owned - sourceHolding.reserved;
    if (available < request.quantity) {
      throw new Error("STORE_LISTING_STOCK_INSUFFICIENT_FINISHED_GOODS");
    }
    if (sourceHolding.currencyCode !== business.currencyCode) {
      throw new Error("STORE_LISTING_STOCK_COST_CURRENCY_MISMATCH");
    }

    const listingKey = `${request.game}|${listingAccount.accountKey}|${offer.itemKey}`;
    const priorListing = this.holdings.get(listingKey) ?? {
      game: request.game,
      accountKey: listingAccount.accountKey,
      itemKey: offer.itemKey,
      owned: 0,
      reserved: 0,
      averageUnitCost: 0,
      currencyCode: sourceHolding.currencyCode,
    };
    if (priorListing.currencyCode !== sourceHolding.currencyCode) {
      throw new Error("STORE_LISTING_STOCK_DESTINATION_CURRENCY_MISMATCH");
    }

    const nextListingOwned = priorListing.owned + request.quantity;
    const nextListingCost = nextListingOwned === 0
      ? 0
      : round4(
        (
          priorListing.owned * priorListing.averageUnitCost +
          request.quantity * sourceHolding.averageUnitCost
        ) / nextListingOwned,
      );
    sourceHolding.owned -= request.quantity;
    this.holdings.set(listingKey, {
      ...priorListing,
      owned: nextListingOwned,
      averageUnitCost: nextListingCost,
    });

    const projection = this.projections.get(
      `${request.game}|${business.businessKey}|${offer.itemKey}`,
    );
    projection.quantity = sourceHolding.owned;
    projection.unitCost = sourceHolding.averageUnitCost;
    projection.totalCostBasis = round4(
      sourceHolding.owned * sourceHolding.averageUnitCost,
    );
    projection.version += 1;

    if (offer.accountKey !== null && offer.version === request.expectedOfferVersion) {
      offer.version += 1;
    }

    const transaction = {
      transactionKey: `itx_${digest({ replayKey, requestHash }).slice(0, 32)}`,
      game: request.game,
      offerKey: offer.offerKey,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      status: "committed",
      quantity: request.quantity,
      sourceAccountKey: sourceHolding.accountKey,
      destinationAccountKey: listingAccount.accountKey,
      itemKey: offer.itemKey,
      averageUnitCost: sourceHolding.averageUnitCost,
      currencyCode: sourceHolding.currencyCode,
    };
    this.transactions.set(replayKey, transaction);
    this.#assertProjectionMatchesHolding(business, offer.itemKey, "POST");

    return this.#result({
      business,
      offer,
      transaction,
      quantityAdded: request.quantity,
      replayed: false,
    });
  }

  #result({ offer, transaction, quantityAdded, replayed }) {
    const listing = this.holdings.get(
      `${offer.game}|${offer.accountKey}|${offer.itemKey}`,
    );
    return {
      offerKey: offer.offerKey,
      offerStatus: offer.status,
      offerVersion: offer.version,
      inventoryAccountKey: offer.accountKey,
      transactionKey: transaction.transactionKey,
      quantityAdded,
      listedQuantity: listing.owned,
      availableQuantity: listing.owned - listing.reserved,
      averageUnitCost: listing.averageUnitCost,
      costCurrencyCode: listing.currencyCode,
      replayed,
    };
  }

  #ensureListingAccount(business, offer) {
    const accountKey = `iac_${digest({
      game: offer.game,
      partyKey: business.partyKey,
      offerKey: offer.offerKey,
      kind: "store_stock",
    }).slice(0, 32)}`;
    const mapKey = `${offer.game}|${accountKey}`;
    const existing = this.accounts.get(mapKey);
    if (existing) {
      if (
        existing.partyKey !== business.partyKey ||
        existing.kind !== "store_stock" ||
        existing.offerKey !== offer.offerKey ||
        !existing.active
      ) {
        throw new Error("STORE_LISTING_ACCOUNT_UNAVAILABLE");
      }
      return existing;
    }
    const account = {
      game: offer.game,
      accountKey,
      partyKey: business.partyKey,
      kind: "store_stock",
      offerKey: offer.offerKey,
      active: true,
    };
    this.accounts.set(mapKey, account);
    return account;
  }

  #assertProjectionMatchesHolding(business, itemKey, prefix) {
    const accountKey = this.#finishedAccountKey(
      business.game,
      business.businessKey,
    );
    const account = this.accounts.get(`${business.game}|${accountKey}`);
    const holding = this.holdings.get(
      `${business.game}|${accountKey}|${itemKey}`,
    );
    const projection = this.projections.get(
      `${business.game}|${business.businessKey}|${itemKey}`,
    );
    const label = prefix ? `${prefix}_` : "";
    if (
      !account ||
      account.partyKey !== business.partyKey ||
      account.kind !== "finished_goods" ||
      !account.active
    ) {
      throw new Error(`STORE_LISTING_STOCK_${label}FINISHED_ACCOUNT_UNAVAILABLE`);
    }
    if (!holding) {
      throw new Error(`STORE_LISTING_STOCK_${label}FINISHED_HOLDING_MISSING`);
    }
    if (!projection) {
      throw new Error(`STORE_LISTING_STOCK_${label}FINISHED_PROJECTION_MISSING`);
    }
    if (
      projection.accountKey !== accountKey ||
      projection.itemKey !== itemKey ||
      projection.kind !== "finished_good" ||
      projection.quantity !== holding.owned ||
      projection.unitCost !== holding.averageUnitCost ||
      projection.totalCostBasis !== round4(
        holding.owned * holding.averageUnitCost,
      )
    ) {
      throw new Error(`STORE_LISTING_STOCK_${label}FINISHED_PROJECTION_MISMATCH`);
    }
    return holding;
  }

  #validateRequest(request) {
    if (
      !request.game ||
      !/^biz_[0-9a-f]{32}$/u.test(request.businessKey) ||
      !/^sof_[0-9a-f]{32}$/u.test(request.offerKey) ||
      !Number.isInteger(request.quantity) ||
      request.quantity <= 0 ||
      !Number.isInteger(request.expectedOfferVersion) ||
      request.expectedOfferVersion <= 0 ||
      typeof request.idempotencyKey !== "string" ||
      request.idempotencyKey.trim().length < 8 ||
      request.idempotencyKey.trim().length > 160
    ) {
      throw new Error("STORE_LISTING_STOCK_REQUEST_INVALID");
    }
  }

  #business(game, businessKey) {
    const business = this.businesses.get(`${game}|${businessKey}`);
    if (!business?.active) {
      throw new Error("STORE_LISTING_STOCK_BUSINESS_NOT_FOUND");
    }
    return business;
  }

  #finishedAccountKey(game, businessKey) {
    return `iac_${digest({ game, businessKey, kind: "finished_goods" }).slice(0, 32)}`;
  }

  #lock(key) {
    if (!this.offerLocks.has(key)) this.offerLocks.set(key, new Mutex());
    return this.offerLocks.get(key);
  }

  #snapshot() {
    return {
      businesses: clone([...this.businesses]),
      offers: clone([...this.offers]),
      accounts: clone([...this.accounts]),
      holdings: clone([...this.holdings]),
      projections: clone([...this.projections]),
      transactions: clone([...this.transactions]),
    };
  }

  #restore(snapshot) {
    this.businesses = new Map(snapshot.businesses);
    this.offers = new Map(snapshot.offers);
    this.accounts = new Map(snapshot.accounts);
    this.holdings = new Map(snapshot.holdings);
    this.projections = new Map(snapshot.projections);
    this.transactions = new Map(snapshot.transactions);
  }
}

function round4(value) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function key(prefix, character) {
  return `${prefix}_${character.repeat(32)}`;
}

const authority = new StoreListingAuthority();
const gameOne = "game_1";
const gameTwo = "game_2";
const businessOne = key("biz", "1");
const businessTwo = key("biz", "2");
const offerOne = key("sof", "a");
const offerTwo = key("sof", "b");
const item = "widget.v1";

for (const [game, businessKey, partyKey, offerKey] of [
  [gameOne, businessOne, key("pty", "3"), offerOne],
  [gameTwo, businessTwo, key("pty", "4"), offerTwo],
]) {
  authority.registerBusiness({
    game,
    businessKey,
    partyKey,
    currencyCode: "NRC",
  });
  authority.registerOffer({ game, businessKey, offerKey, itemKey: item });
  authority.setFinishedGoods({
    game,
    businessKey,
    itemKey: item,
    owned: 20,
    reserved: game === gameOne ? 3 : 0,
    averageUnitCost: game === gameOne ? 4.25 : 6.5,
    currencyCode: "NRC",
  });
}

const firstRequest = {
  game: gameOne,
  businessKey: businessOne,
  offerKey: offerOne,
  quantity: 5,
  expectedOfferVersion: 1,
  idempotencyKey: "stock-widget-first-0001",
};
const firstWave = await Promise.all(
  Array.from({ length: 40 }, () => authority.stock(firstRequest)),
);
assert.equal(firstWave.filter((result) => !result.replayed).length, 1);
assert.equal(firstWave.filter((result) => result.replayed).length, 39);
assert.equal(new Set(firstWave.map((result) => result.transactionKey)).size, 1);
assert.equal(authority.transactionCount(), 1);
assert.equal(authority.getOffer(gameOne, offerOne).version, 2);
assert.equal(authority.getFinishedHolding(gameOne, businessOne, item).owned, 15);
assert.equal(authority.getProjection(gameOne, businessOne, item).quantity, 15);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).owned, 5);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).averageUnitCost, 4.25);

await assert.rejects(
  () => authority.stock({ ...firstRequest, quantity: 4 }),
  /IDEMPOTENCY_CONFLICT/u,
);
await assert.rejects(
  () => authority.stock({
    ...firstRequest,
    idempotencyKey: "stock-widget-stale-0002",
  }),
  /VERSION_CONFLICT/u,
);

const second = await authority.stock({
  ...firstRequest,
  quantity: 4,
  expectedOfferVersion: 2,
  idempotencyKey: "stock-widget-second-0003",
});
assert.equal(second.offerVersion, 3);
assert.equal(second.listedQuantity, 9);
assert.equal(second.averageUnitCost, 4.25);
assert.equal(authority.getFinishedHolding(gameOne, businessOne, item).owned, 11);
assert.equal(authority.getProjection(gameOne, businessOne, item).quantity, 11);
assert.equal(authority.getProjection(gameOne, businessOne, item).totalCostBasis, 46.75);

await assert.rejects(
  () => authority.stock({
    ...firstRequest,
    quantity: 9,
    expectedOfferVersion: 3,
    idempotencyKey: "stock-widget-reserved-0004",
  }),
  /INSUFFICIENT_FINISHED_GOODS/u,
  "Reserved Finished Goods must not be listable.",
);
assert.equal(authority.getOffer(gameOne, offerOne).version, 3);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).owned, 9);

await assert.rejects(
  () => authority.stock({
    ...firstRequest,
    businessKey: businessTwo,
    expectedOfferVersion: 3,
    idempotencyKey: "stock-widget-wrong-business-0005",
  }),
  /BUSINESS_NOT_FOUND|OFFER_NOT_FOUND/u,
);
await assert.rejects(
  () => authority.stock({
    ...firstRequest,
    game: gameTwo,
    businessKey: businessTwo,
    expectedOfferVersion: 3,
    idempotencyKey: "stock-widget-wrong-game-0006",
  }),
  /OFFER_NOT_FOUND/u,
);

const gameTwoResult = await authority.stock({
  game: gameTwo,
  businessKey: businessTwo,
  offerKey: offerTwo,
  quantity: 7,
  expectedOfferVersion: 1,
  idempotencyKey: "stock-widget-game-two-0007",
});
assert.equal(gameTwoResult.listedQuantity, 7);
assert.equal(gameTwoResult.averageUnitCost, 6.5);
assert.equal(authority.getFinishedHolding(gameTwo, businessTwo, item).owned, 13);
assert.equal(authority.getFinishedHolding(gameOne, businessOne, item).owned, 11);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).owned, 9);

const beforeRaceTransactions = authority.transactionCount();
const race = await Promise.allSettled(
  Array.from({ length: 12 }, (_, index) => authority.stock({
    ...firstRequest,
    quantity: 1,
    expectedOfferVersion: 3,
    idempotencyKey: `stock-widget-race-${String(index).padStart(4, "0")}`,
  })),
);
assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(race.filter((result) => result.status === "rejected").length, 11);
for (const rejected of race.filter((result) => result.status === "rejected")) {
  assert.match(String(rejected.reason), /VERSION_CONFLICT/u);
}
assert.equal(authority.transactionCount(), beforeRaceTransactions + 1);
assert.equal(authority.getOffer(gameOne, offerOne).version, 4);
assert.equal(authority.getFinishedHolding(gameOne, businessOne, item).owned, 10);
assert.equal(authority.getProjection(gameOne, businessOne, item).quantity, 10);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).owned, 10);

const accountKey = authority.getOffer(gameOne, offerOne).accountKey;
assert.equal(
  firstWave[0].inventoryAccountKey,
  accountKey,
  "Concurrent first placement must converge on one deterministic account.",
);
assert.equal(second.inventoryAccountKey, accountKey);

const aggregateOne = authority.aggregate(gameOne, item);
const aggregateTwo = authority.aggregate(gameTwo, item);
assert.equal(aggregateOne.offerCount, 1);
assert.equal(aggregateOne.totalAvailableQuantity, 10);
assert.equal(aggregateTwo.offerCount, 1);
assert.equal(aggregateTwo.totalAvailableQuantity, 7);

const projection = authority.projections.get(`${gameOne}|${businessOne}|${item}`);
projection.quantity += 1;
await assert.rejects(
  () => authority.stock({
    ...firstRequest,
    quantity: 1,
    expectedOfferVersion: 4,
    idempotencyKey: "stock-widget-projection-mismatch-0008",
  }),
  /FINISHED_PROJECTION_MISMATCH/u,
);
assert.equal(authority.getOffer(gameOne, offerOne).version, 4);
assert.equal(authority.getListingHolding(gameOne, offerOne, item).owned, 10);
projection.quantity -= 1;

console.log("Business Phase 8A Store-listing inventory simulation: PASS");
