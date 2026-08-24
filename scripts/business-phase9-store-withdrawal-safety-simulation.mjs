#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const FIVE_MINUTES_US = 5 * 60 * 1_000_000;
const ONE_MINUTE_US = 60 * 1_000_000;
const clone = (value) => structuredClone(value);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round4 = (value) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;

class Mutex {
  #tail = Promise.resolve();

  async run(operation) {
    const prior = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class WithdrawalAuthority {
  constructor() {
    this.businesses = new Map();
    this.offers = new Map();
    this.holdings = new Map();
    this.projections = new Map();
    this.requests = new Map();
    this.idempotency = new Map();
    this.transactions = new Map();
    this.offerLocks = new Map();
    this.requestLocks = new Map();
    this.sequence = 0;
  }

  registerOffer({
    game,
    businessKey,
    partyKey,
    offerKey,
    itemKey,
    status = "active",
    currencyCode = "NRC",
    finishedOwned = 0,
    finishedCost = 0,
    listedOwned,
    listedReserved = 0,
    listedCost,
  }) {
    assert.ok(["draft", "active", "paused"].includes(status));
    const business = {
      game,
      businessKey,
      partyKey,
      currencyCode,
      active: true,
    };
    this.businesses.set(`${game}|${businessKey}`, business);
    const listingAccountKey = key("iac", digest({ game, offerKey, kind: "store" }));
    const finishedAccountKey = key(
      "iac",
      digest({ game, businessKey, kind: "finished" }),
    );
    this.offers.set(`${game}|${offerKey}`, {
      game,
      businessKey,
      partyKey,
      offerKey,
      itemKey,
      status,
      resumeStatus: null,
      version: 1,
      unitPrice: 10,
      listingAccountKey,
      currentRequestKey: null,
      withdrawalRequestedAt: null,
      withdrawalEffectiveAt: null,
      withdrawalMode: null,
      withdrawalRequestedQuantity: null,
    });
    this.holdings.set(`${game}|${listingAccountKey}|${itemKey}`, {
      game,
      accountKey: listingAccountKey,
      itemKey,
      owned: listedOwned,
      reserved: listedReserved,
      averageUnitCost: listedCost,
      currencyCode,
    });
    this.holdings.set(`${game}|${finishedAccountKey}|${itemKey}`, {
      game,
      accountKey: finishedAccountKey,
      itemKey,
      owned: finishedOwned,
      reserved: 0,
      averageUnitCost: finishedCost,
      currencyCode,
    });
    this.projections.set(`${game}|${businessKey}|${itemKey}`, {
      game,
      businessKey,
      accountKey: finishedAccountKey,
      itemKey,
      quantity: finishedOwned,
      unitCost: finishedCost,
      totalCostBasis: round4(finishedOwned * finishedCost),
      version: 1,
    });
  }

  async requestWithdrawal(command, nowUs) {
    const offerLock = this.#offerLock(`${command.game}|${command.offerKey}`);
    return offerLock.run(async () => {
      await Promise.resolve();
      const business = this.#business(command.game, command.businessKey);
      const offer = this.#offer(command.game, command.offerKey);
      if (
        offer.businessKey !== business.businessKey ||
        offer.partyKey !== business.partyKey
      ) {
        throw new Error("STORE_WITHDRAWAL_OFFER_NOT_FOUND");
      }
      this.#validateRequest(command);
      const requestHash = digest({
        game: command.game,
        businessKey: command.businessKey,
        offerKey: command.offerKey,
        mode: command.mode,
        quantity: command.quantity,
        expectedOfferVersion: command.expectedOfferVersion,
      });
      const idempotencyKey = `${command.game}|${business.partyKey}|${command.idempotencyKey}`;
      const existingRequestKey = this.idempotency.get(idempotencyKey);
      if (existingRequestKey) {
        const existing = this.requests.get(existingRequestKey);
        if (
          existing.offerKey !== offer.offerKey ||
          existing.requestHash !== requestHash
        ) {
          throw new Error("STORE_WITHDRAWAL_IDEMPOTENCY_CONFLICT");
        }
        return this.#requestResult(existing, offer, true);
      }

      if (offer.version !== command.expectedOfferVersion) {
        throw new Error("STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT");
      }
      if (
        !["draft", "active", "paused"].includes(offer.status) ||
        offer.currentRequestKey !== null
      ) {
        throw new Error("STORE_WITHDRAWAL_OFFER_STATUS_INVALID");
      }
      const listing = this.#listingHolding(offer);
      const available = listing.owned - listing.reserved;
      if (command.mode === "reduce" && command.quantity > available) {
        throw new Error("STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE");
      }

      const requestKey = key("swr", digest({
        sequence: ++this.sequence,
        game: command.game,
        offerKey: command.offerKey,
        idempotencyKey: command.idempotencyKey,
      }));
      const request = {
        game: command.game,
        businessKey: command.businessKey,
        partyKey: business.partyKey,
        offerKey: offer.offerKey,
        itemKey: offer.itemKey,
        listingAccountKey: offer.listingAccountKey,
        requestKey,
        mode: command.mode,
        requestedQuantity: command.mode === "reduce" ? command.quantity : null,
        resumeStatus: offer.status,
        status: "pending",
        idempotencyKey: command.idempotencyKey,
        requestHash,
        requestedAtUs: nowUs,
        effectiveAtUs: nowUs + FIVE_MINUTES_US,
        nextAttemptAtUs: nowUs + FIVE_MINUTES_US,
        lastAttemptAtUs: null,
        lastBlockReason: null,
        attemptCount: 0,
        completedAtUs: null,
        returnedQuantity: null,
        transactionKey: null,
        version: 1,
      };
      this.requests.set(requestKey, request);
      this.idempotency.set(idempotencyKey, requestKey);

      offer.resumeStatus = offer.status;
      offer.status = "withdrawal_pending";
      offer.currentRequestKey = requestKey;
      offer.withdrawalRequestedAt = request.requestedAtUs;
      offer.withdrawalEffectiveAt = request.effectiveAtUs;
      offer.withdrawalMode = request.mode;
      offer.withdrawalRequestedQuantity = request.requestedQuantity;
      offer.version += 1;
      return this.#requestResult(request, offer, false);
    });
  }

  async processDue(asOfUs, limit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("STORE_WITHDRAWAL_PROCESS_LIMIT_INVALID");
    }
    const candidates = [...this.requests.values()]
      .filter(
        (request) =>
          request.status === "pending" &&
          request.effectiveAtUs <= asOfUs &&
          request.nextAttemptAtUs <= asOfUs,
      )
      .sort(
        (left, right) =>
          left.effectiveAtUs - right.effectiveAtUs ||
          left.requestKey.localeCompare(right.requestKey),
      )
      .slice(0, limit)
      .map((request) => request.requestKey);

    await Promise.resolve();
    const results = [];
    for (const requestKey of candidates) {
      const result = await this.#processRequest(requestKey, asOfUs);
      if (result) results.push(result);
    }
    return {
      asOfUs,
      selectedCount: results.length,
      completedCount: results.filter((item) => item.outcome === "completed").length,
      blockedCount: results.filter((item) => item.outcome === "blocked").length,
      results,
    };
  }

  async mutatePrice({ game, offerKey, expectedVersion, unitPrice }) {
    return this.#offerLock(`${game}|${offerKey}`).run(async () => {
      const offer = this.#offer(game, offerKey);
      if (offer.version !== expectedVersion) {
        throw new Error("STORE_SELLER_OFFER_VERSION_CONFLICT");
      }
      if (offer.status === "withdrawal_pending") {
        throw new Error("STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN");
      }
      offer.unitPrice = unitPrice;
      offer.version += 1;
      return clone(offer);
    });
  }

  async stock({ game, offerKey, quantity }) {
    return this.#offerLock(`${game}|${offerKey}`).run(async () => {
      const offer = this.#offer(game, offerKey);
      if (offer.status === "withdrawal_pending") {
        throw new Error("STORE_SELLER_OFFER_WITHDRAWAL_PENDING_MUTATION_FORBIDDEN");
      }
      const listing = this.#listingHolding(offer);
      listing.owned += quantity;
      offer.version += 1;
      return clone(listing);
    });
  }

  setListingReserved(game, offerKey, quantity) {
    const offer = this.#offer(game, offerKey);
    const holding = this.#listingHolding(offer);
    assert.ok(Number.isInteger(quantity) && quantity >= 0 && quantity <= holding.owned);
    holding.reserved = quantity;
  }

  depleteListing(game, offerKey, quantity) {
    const offer = this.#offer(game, offerKey);
    const holding = this.#listingHolding(offer);
    assert.ok(Number.isInteger(quantity) && quantity >= 0);
    assert.ok(holding.owned - holding.reserved >= quantity);
    holding.owned -= quantity;
  }

  aggregate(game, itemKey) {
    const offers = [...this.offers.values()]
      .filter(
        (offer) =>
          offer.game === game &&
          offer.itemKey === itemKey &&
          offer.status === "active",
      )
      .map((offer) => {
        const holding = this.#listingHolding(offer);
        return {
          offerKey: offer.offerKey,
          availableQuantity: holding.owned - holding.reserved,
        };
      });
    return {
      offerCount: offers.length,
      totalAvailableQuantity: offers.reduce(
        (sum, offer) => sum + offer.availableQuantity,
        0,
      ),
      offers,
    };
  }

  getOffer(game, offerKey) {
    return clone(this.#offer(game, offerKey));
  }

  getRequest(requestKey) {
    return clone(this.requests.get(requestKey));
  }

  getListing(game, offerKey) {
    return clone(this.#listingHolding(this.#offer(game, offerKey)));
  }

  getProjection(game, businessKey, itemKey) {
    return clone(this.projections.get(`${game}|${businessKey}|${itemKey}`));
  }

  getFinished(game, businessKey, itemKey) {
    const projection = this.projections.get(`${game}|${businessKey}|${itemKey}`);
    return clone(this.holdings.get(`${game}|${projection.accountKey}|${itemKey}`));
  }

  transactionCount() {
    return this.transactions.size;
  }

  corruptProjection(game, businessKey, itemKey, delta) {
    this.projections.get(`${game}|${businessKey}|${itemKey}`).quantity += delta;
  }

  async #processRequest(requestKey, asOfUs) {
    return this.#requestLock(requestKey).run(async () => {
      const request = this.requests.get(requestKey);
      if (
        !request ||
        request.status !== "pending" ||
        request.effectiveAtUs > asOfUs ||
        request.nextAttemptAtUs > asOfUs
      ) return null;

      const offerLock = this.#offerLock(`${request.game}|${request.offerKey}`);
      return offerLock.run(async () => {
        const requestAfterOfferLock = this.requests.get(requestKey);
        if (requestAfterOfferLock.status !== "pending") return null;
        const snapshot = this.#snapshot();
        try {
          const offer = this.#offer(request.game, request.offerKey);
          if (
            offer.status !== "withdrawal_pending" ||
            offer.currentRequestKey !== request.requestKey ||
            offer.listingAccountKey !== request.listingAccountKey ||
            offer.itemKey !== request.itemKey ||
            offer.withdrawalEffectiveAt !== request.effectiveAtUs
          ) {
            throw new Error("STORE_WITHDRAWAL_PROCESS_OFFER_SCOPE_INVALID");
          }
          if (asOfUs < request.effectiveAtUs) {
            throw new Error("STORE_WITHDRAWAL_PROCESS_TOO_EARLY");
          }
          const listing = this.#listingHolding(offer);
          if (listing.reserved > 0) {
            request.nextAttemptAtUs = Math.max(
              asOfUs + ONE_MINUTE_US,
              request.effectiveAtUs,
            );
            request.lastAttemptAtUs = asOfUs;
            request.lastBlockReason = "inventory_reserved";
            request.attemptCount += 1;
            request.version += 1;
            return {
              requestKey: request.requestKey,
              offerKey: offer.offerKey,
              outcome: "blocked",
              blockReason: "inventory_reserved",
              reservedQuantity: listing.reserved,
              nextAttemptAtUs: request.nextAttemptAtUs,
              offerVersion: offer.version,
            };
          }

          const business = this.#business(request.game, request.businessKey);
          const projection = this.projections.get(
            `${request.game}|${request.businessKey}|${request.itemKey}`,
          );
          const finished = this.holdings.get(
            `${request.game}|${projection.accountKey}|${request.itemKey}`,
          );
          this.#assertProjection(projection, finished);
          const returnQuantity = request.mode === "full"
            ? listing.owned
            : Math.min(request.requestedQuantity, listing.owned);
          let transactionKey = null;
          if (returnQuantity > 0) {
            const newFinishedOwned = finished.owned + returnQuantity;
            const newFinishedCost = newFinishedOwned === 0
              ? 0
              : round4(
                (
                  finished.owned * finished.averageUnitCost +
                  returnQuantity * listing.averageUnitCost
                ) / newFinishedOwned,
              );
            listing.owned -= returnQuantity;
            finished.owned = newFinishedOwned;
            finished.averageUnitCost = newFinishedCost;
            projection.quantity = finished.owned;
            projection.unitCost = finished.averageUnitCost;
            projection.totalCostBasis = round4(
              finished.owned * finished.averageUnitCost,
            );
            projection.version += 1;
            transactionKey = key("itx", digest({
              requestKey,
              source: offer.listingAccountKey,
              destination: projection.accountKey,
              itemKey: request.itemKey,
              returnQuantity,
              cost: listing.averageUnitCost,
              currency: business.currencyCode,
            }));
            this.transactions.set(transactionKey, {
              transactionKey,
              requestKey,
              returnQuantity,
              averageUnitCost: listing.averageUnitCost,
              currencyCode: business.currencyCode,
            });
          }
          this.#assertProjection(projection, finished);

          request.status = "completed";
          request.nextAttemptAtUs = null;
          request.lastAttemptAtUs = asOfUs;
          request.lastBlockReason = null;
          request.attemptCount += 1;
          request.completedAtUs = asOfUs;
          request.returnedQuantity = returnQuantity;
          request.transactionKey = transactionKey;
          request.version += 1;

          let nextStatus = request.mode === "full"
            ? "paused"
            : request.resumeStatus;
          if (nextStatus === "active" && listing.owned - listing.reserved <= 0) {
            nextStatus = "paused";
          }
          offer.status = nextStatus;
          offer.resumeStatus = null;
          offer.currentRequestKey = null;
          offer.withdrawalRequestedAt = null;
          offer.withdrawalEffectiveAt = null;
          offer.withdrawalMode = null;
          offer.withdrawalRequestedQuantity = null;
          offer.version += 1;

          return {
            requestKey: request.requestKey,
            offerKey: offer.offerKey,
            outcome: "completed",
            mode: request.mode,
            returnedQuantity: returnQuantity,
            remainingListedQuantity: listing.owned,
            offerStatus: offer.status,
            offerVersion: offer.version,
            inventoryAccountKey: offer.listingAccountKey,
            transactionKey,
            completedAtUs: asOfUs,
          };
        } catch (error) {
          this.#restore(snapshot);
          throw error;
        }
      });
    });
  }

  #requestResult(request, offer, replayed) {
    return {
      requestKey: request.requestKey,
      requestStatus: request.status,
      offerKey: offer.offerKey,
      offerStatus: offer.status,
      offerVersion: offer.version,
      mode: request.mode,
      requestedQuantity: request.requestedQuantity,
      requestedAtUs: request.requestedAtUs,
      effectiveAtUs: request.effectiveAtUs,
      nextAttemptAtUs: request.nextAttemptAtUs,
      returnedQuantity: request.returnedQuantity,
      transactionKey: request.transactionKey,
      replayed,
    };
  }

  #validateRequest(command) {
    if (
      !command.game ||
      !/^biz_[0-9a-f]{32}$/u.test(command.businessKey) ||
      !/^sof_[0-9a-f]{32}$/u.test(command.offerKey) ||
      !["full", "reduce"].includes(command.mode) ||
      (command.mode === "full" && command.quantity !== null) ||
      (command.mode === "reduce" &&
        (!Number.isInteger(command.quantity) || command.quantity <= 0)) ||
      !Number.isInteger(command.expectedOfferVersion) ||
      command.expectedOfferVersion < 1 ||
      typeof command.idempotencyKey !== "string" ||
      command.idempotencyKey.length < 8 ||
      command.idempotencyKey.length > 160
    ) {
      throw new Error("STORE_WITHDRAWAL_REQUEST_INVALID");
    }
  }

  #assertProjection(projection, holding) {
    if (
      !projection ||
      !holding ||
      projection.quantity !== holding.owned ||
      projection.unitCost !== holding.averageUnitCost ||
      projection.totalCostBasis !== round4(
        holding.owned * holding.averageUnitCost,
      )
    ) {
      throw new Error("STORE_WITHDRAWAL_PROCESS_FINISHED_PROJECTION_MISMATCH");
    }
  }

  #business(game, businessKey) {
    const business = this.businesses.get(`${game}|${businessKey}`);
    if (!business?.active) throw new Error("STORE_WITHDRAWAL_BUSINESS_NOT_FOUND");
    return business;
  }

  #offer(game, offerKey) {
    const offer = this.offers.get(`${game}|${offerKey}`);
    if (!offer) throw new Error("STORE_WITHDRAWAL_OFFER_NOT_FOUND");
    return offer;
  }

  #listingHolding(offer) {
    const holding = this.holdings.get(
      `${offer.game}|${offer.listingAccountKey}|${offer.itemKey}`,
    );
    if (!holding) throw new Error("STORE_WITHDRAWAL_LISTING_HOLDING_MISSING");
    return holding;
  }

  #offerLock(keyValue) {
    if (!this.offerLocks.has(keyValue)) this.offerLocks.set(keyValue, new Mutex());
    return this.offerLocks.get(keyValue);
  }

  #requestLock(keyValue) {
    if (!this.requestLocks.has(keyValue)) this.requestLocks.set(keyValue, new Mutex());
    return this.requestLocks.get(keyValue);
  }

  #snapshot() {
    return {
      offers: clone([...this.offers]),
      holdings: clone([...this.holdings]),
      projections: clone([...this.projections]),
      requests: clone([...this.requests]),
      transactions: clone([...this.transactions]),
    };
  }

  #restore(snapshot) {
    this.offers = new Map(snapshot.offers);
    this.holdings = new Map(snapshot.holdings);
    this.projections = new Map(snapshot.projections);
    this.requests = new Map(snapshot.requests);
    this.transactions = new Map(snapshot.transactions);
  }
}

function key(prefix, hex) {
  return `${prefix}_${hex.slice(0, 32)}`;
}

function literalKey(prefix, character) {
  return `${prefix}_${character.repeat(32)}`;
}

const authority = new WithdrawalAuthority();
const t0 = 1_800_000_000_000_000;
const item = "widget.v1";
const gameOne = "game_one";
const businessOne = literalKey("biz", "1");
const offerOne = literalKey("sof", "a");

authority.registerOffer({
  game: gameOne,
  businessKey: businessOne,
  partyKey: literalKey("pty", "2"),
  offerKey: offerOne,
  itemKey: item,
  status: "active",
  finishedOwned: 3,
  finishedCost: 2,
  listedOwned: 12,
  listedCost: 5,
});
assert.equal(authority.aggregate(gameOne, item).totalAvailableQuantity, 12);

const fullCommand = {
  game: gameOne,
  businessKey: businessOne,
  offerKey: offerOne,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-full-0001",
};
const fullRequest = await authority.requestWithdrawal(fullCommand, t0);
assert.equal(fullRequest.offerStatus, "withdrawal_pending");
assert.equal(fullRequest.offerVersion, 2);
assert.equal(fullRequest.effectiveAtUs - fullRequest.requestedAtUs, FIVE_MINUTES_US);
assert.equal(authority.aggregate(gameOne, item).offerCount, 0);

const replay = await authority.requestWithdrawal(fullCommand, t0 + 10);
assert.equal(replay.replayed, true);
assert.equal(replay.requestKey, fullRequest.requestKey);
assert.equal(replay.offerVersion, 2);
await assert.rejects(
  () => authority.requestWithdrawal({
    ...fullCommand,
    mode: "reduce",
    quantity: 1,
  }, t0 + 20),
  /IDEMPOTENCY_CONFLICT/u,
);
await assert.rejects(
  () => authority.mutatePrice({
    game: gameOne,
    offerKey: offerOne,
    expectedVersion: 2,
    unitPrice: 9,
  }),
  /WITHDRAWAL_PENDING_MUTATION_FORBIDDEN/u,
);
await assert.rejects(
  () => authority.stock({ game: gameOne, offerKey: offerOne, quantity: 1 }),
  /WITHDRAWAL_PENDING_MUTATION_FORBIDDEN/u,
);

const beforeBoundary = await authority.processDue(
  fullRequest.effectiveAtUs - 1,
  25,
);
assert.equal(beforeBoundary.selectedCount, 0, "One microsecond early must not process.");
const atBoundary = await authority.processDue(fullRequest.effectiveAtUs, 25);
assert.equal(atBoundary.completedCount, 1, "Exact five-minute boundary must process.");
assert.equal(atBoundary.results[0].returnedQuantity, 12);
assert.equal(atBoundary.results[0].offerStatus, "paused");
assert.equal(authority.getListing(gameOne, offerOne).owned, 0);
assert.equal(authority.getFinished(gameOne, businessOne, item).owned, 15);
assert.equal(authority.getFinished(gameOne, businessOne, item).averageUnitCost, 4.4);
assert.equal(authority.getProjection(gameOne, businessOne, item).totalCostBasis, 66);
assert.equal(authority.transactionCount(), 1);
const processorReplay = await authority.processDue(fullRequest.effectiveAtUs + 1, 25);
assert.equal(processorReplay.selectedCount, 0);
assert.equal(authority.transactionCount(), 1);

const gameTwo = "game_two";
const businessTwo = literalKey("biz", "3");
const offerTwo = literalKey("sof", "b");
authority.registerOffer({
  game: gameTwo,
  businessKey: businessTwo,
  partyKey: literalKey("pty", "4"),
  offerKey: offerTwo,
  itemKey: item,
  status: "active",
  finishedOwned: 2,
  finishedCost: 1,
  listedOwned: 10,
  listedCost: 4,
});
const reduction = await authority.requestWithdrawal({
  game: gameTwo,
  businessKey: businessTwo,
  offerKey: offerTwo,
  mode: "reduce",
  quantity: 6,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-reduce-0002",
}, t0 + 1_000_000);
authority.setListingReserved(gameTwo, offerTwo, 2);
const blocked = await authority.processDue(reduction.effectiveAtUs, 25);
assert.equal(blocked.blockedCount, 1);
assert.equal(blocked.results[0].reservedQuantity, 2);
assert.equal(authority.getListing(gameTwo, offerTwo).owned, 10);
assert.equal(authority.getOffer(gameTwo, offerTwo).version, 2);
const blockedRequest = authority.getRequest(reduction.requestKey);
assert.equal(blockedRequest.nextAttemptAtUs, reduction.effectiveAtUs + ONE_MINUTE_US);
assert.equal(blockedRequest.version, 2);
assert.equal(
  (await authority.processDue(blockedRequest.nextAttemptAtUs - 1, 25)).selectedCount,
  0,
);
authority.setListingReserved(gameTwo, offerTwo, 0);
authority.depleteListing(gameTwo, offerTwo, 3);
const reduced = await authority.processDue(blockedRequest.nextAttemptAtUs, 25);
assert.equal(reduced.completedCount, 1);
assert.equal(reduced.results[0].returnedQuantity, 6);
assert.equal(reduced.results[0].remainingListedQuantity, 1);
assert.equal(reduced.results[0].offerStatus, "active");
assert.equal(authority.getFinished(gameTwo, businessTwo, item).owned, 8);
assert.equal(authority.getFinished(gameTwo, businessTwo, item).averageUnitCost, 3.25);
assert.equal(authority.getProjection(gameTwo, businessTwo, item).totalCostBasis, 26);
assert.equal(authority.getListing(gameOne, offerOne).owned, 0, "Games must remain isolated.");

const gameThree = "game_three";
const businessThree = literalKey("biz", "5");
const offerThree = literalKey("sof", "c");
authority.registerOffer({
  game: gameThree,
  businessKey: businessThree,
  partyKey: literalKey("pty", "6"),
  offerKey: offerThree,
  itemKey: item,
  status: "active",
  listedOwned: 4,
  listedCost: 3,
});
const allReduction = await authority.requestWithdrawal({
  game: gameThree,
  businessKey: businessThree,
  offerKey: offerThree,
  mode: "reduce",
  quantity: 4,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-all-reduce-0003",
}, t0 + 2_000_000);
const allReductionResult = await authority.processDue(allReduction.effectiveAtUs, 25);
assert.equal(allReductionResult.results[0].offerStatus, "paused");
assert.equal(authority.getListing(gameThree, offerThree).owned, 0);

const gameFour = "game_four";
const businessFour = literalKey("biz", "7");
const offerFour = literalKey("sof", "d");
authority.registerOffer({
  game: gameFour,
  businessKey: businessFour,
  partyKey: literalKey("pty", "8"),
  offerKey: offerFour,
  itemKey: item,
  status: "active",
  listedOwned: 5,
  listedCost: 2.5,
});
const concurrent = await authority.requestWithdrawal({
  game: gameFour,
  businessKey: businessFour,
  offerKey: offerFour,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-concurrent-0004",
}, t0 + 3_000_000);
const transactionCountBeforeConcurrency = authority.transactionCount();
const workerResults = await Promise.all([
  authority.processDue(concurrent.effectiveAtUs, 100),
  authority.processDue(concurrent.effectiveAtUs, 100),
]);
assert.equal(
  workerResults.reduce((sum, result) => sum + result.completedCount, 0),
  1,
  "Duplicate workers must complete one request once.",
);
assert.equal(authority.transactionCount(), transactionCountBeforeConcurrency + 1);
assert.equal(authority.getOffer(gameFour, offerFour).version, 3);

const gameFive = "game_five";
const businessFive = literalKey("biz", "9");
const offerFive = literalKey("sof", "e");
authority.registerOffer({
  game: gameFive,
  businessKey: businessFive,
  partyKey: literalKey("pty", "a"),
  offerKey: offerFive,
  itemKey: item,
  status: "active",
  finishedOwned: 1,
  finishedCost: 1,
  listedOwned: 3,
  listedCost: 7,
});
const mismatch = await authority.requestWithdrawal({
  game: gameFive,
  businessKey: businessFive,
  offerKey: offerFive,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-projection-0005",
}, t0 + 4_000_000);
authority.corruptProjection(gameFive, businessFive, item, 1);
const beforeMismatchListing = authority.getListing(gameFive, offerFive).owned;
await assert.rejects(
  () => authority.processDue(mismatch.effectiveAtUs, 25),
  /FINISHED_PROJECTION_MISMATCH/u,
);
assert.equal(authority.getListing(gameFive, offerFive).owned, beforeMismatchListing);
assert.equal(authority.getOffer(gameFive, offerFive).status, "withdrawal_pending");
assert.equal(authority.getRequest(mismatch.requestKey).status, "pending");
authority.corruptProjection(gameFive, businessFive, item, -1);
const recoveredMismatch = await authority.processDue(mismatch.effectiveAtUs, 25);
assert.equal(
  recoveredMismatch.completedCount,
  1,
  "A repaired projection must allow the same pending withdrawal to complete exactly once.",
);
assert.equal(recoveredMismatch.results[0].requestKey, mismatch.requestKey);
assert.equal(authority.getRequest(mismatch.requestKey).status, "completed");
assert.equal(authority.getListing(gameFive, offerFive).owned, 0);

const replayWorkerGame = "game_replay_worker";
const replayWorkerBusiness = literalKey("biz", "0");
const replayWorkerOffer = literalKey("sof", "0");
authority.registerOffer({
  game: replayWorkerGame,
  businessKey: replayWorkerBusiness,
  partyKey: literalKey("pty", "b"),
  offerKey: replayWorkerOffer,
  itemKey: item,
  status: "active",
  listedOwned: 2,
  listedCost: 6,
});
const replayWorkerCommand = {
  game: replayWorkerGame,
  businessKey: replayWorkerBusiness,
  offerKey: replayWorkerOffer,
  mode: "full",
  quantity: null,
  expectedOfferVersion: 1,
  idempotencyKey: "withdraw-replay-worker-0006",
};
const replayWorkerRequest = await authority.requestWithdrawal(
  replayWorkerCommand,
  t0 + 5_000_000,
);
const transactionsBeforeReplayWorkerRace = authority.transactionCount();
const [replayDuringProcessing, replayWorkerProcessing] = await Promise.all([
  authority.requestWithdrawal(
    replayWorkerCommand,
    replayWorkerRequest.effectiveAtUs,
  ),
  authority.processDue(replayWorkerRequest.effectiveAtUs, 25),
]);
assert.equal(replayDuringProcessing.replayed, true);
assert.equal(replayDuringProcessing.requestKey, replayWorkerRequest.requestKey);
assert.equal(replayWorkerProcessing.completedCount, 1);
assert.equal(
  authority.transactionCount(),
  transactionsBeforeReplayWorkerRace + 1,
  "Concurrent replay and due processing must settle once without a lock cycle.",
);
assert.equal(
  authority.getRequest(replayWorkerRequest.requestKey).status,
  "completed",
);
assert.equal(authority.getOffer(replayWorkerGame, replayWorkerOffer).version, 3);

const gameSix = "game_six";
const batchOffers = [
  [literalKey("biz", "b"), literalKey("pty", "c"), literalKey("sof", "f"), 0],
  [literalKey("biz", "c"), literalKey("pty", "d"), literalKey("sof", "1"), 1],
  [literalKey("biz", "d"), literalKey("pty", "e"), literalKey("sof", "2"), 2],
];
const batchRequests = [];
for (const [businessKey, partyKey, offerKey, offset] of batchOffers) {
  authority.registerOffer({
    game: gameSix,
    businessKey,
    partyKey,
    offerKey,
    itemKey: item,
    status: "active",
    listedOwned: 1,
    listedCost: 1,
  });
  batchRequests.push(await authority.requestWithdrawal({
    game: gameSix,
    businessKey,
    offerKey,
    mode: "full",
    quantity: null,
    expectedOfferVersion: 1,
    idempotencyKey: `withdraw-batch-${String(offset).padStart(4, "0")}`,
  }, t0 + 10_000_000 + offset));
}
const batchAsOf = Math.max(...batchRequests.map((request) => request.effectiveAtUs));
const boundedBatch = await authority.processDue(batchAsOf, 2);
assert.equal(boundedBatch.selectedCount, 2);
const remainingPending = batchRequests.filter(
  (request) => authority.getRequest(request.requestKey).status === "pending",
);
assert.equal(remainingPending.length, 1);
assert.equal(
  remainingPending[0].effectiveAtUs,
  Math.max(...batchRequests.map((request) => request.effectiveAtUs)),
  "Bounded processing must preserve deterministic effective-time ordering.",
);

const ordinary = await authority.mutatePrice({
  game: gameTwo,
  offerKey: offerTwo,
  expectedVersion: 3,
  unitPrice: 11,
});
assert.equal(ordinary.unitPrice, 11);
assert.equal(ordinary.version, 4);

console.log("Business Phase 9A Store withdrawal safety simulation: PASS");
