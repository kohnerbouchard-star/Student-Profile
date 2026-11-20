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

class OfferAuthority {
  constructor() {
    this.presentations = new Map();
    this.parties = new Map();
    this.businesses = new Map();
    this.accounts = new Map();
    this.holdings = new Map();
    this.offers = new Map();
    this.idempotency = new Map();
    this.locks = new Map();
  }

  registerPresentation({ game, storeItem, catalogItem, canonicalItem, currency, name }) {
    this.presentations.set(`${game}|${storeItem}`, {
      game,
      storeItem,
      catalogItem,
      canonicalItem,
      currency,
      name,
      active: true,
      visible: true,
    });
  }

  registerParty({ game, party, kind, name }) {
    this.parties.set(`${game}|${party}`, { game, party, kind, name, active: true });
  }

  registerBusiness({ game, business, party, currency, products }) {
    this.businesses.set(`${game}|${business}`, {
      game,
      business,
      party,
      currency,
      products: new Set(products),
      active: true,
    });
  }

  registerStoreStockAccount({ game, account, party }) {
    this.accounts.set(`${game}|${account}`, {
      game,
      account,
      party,
      kind: "store_stock",
      active: true,
    });
  }

  setHolding({ game, account, catalogItem, owned, reserved = 0 }) {
    assert.ok(Number.isInteger(owned) && Number.isInteger(reserved));
    assert.ok(owned >= 0 && reserved >= 0 && reserved <= owned);
    this.holdings.set(`${game}|${account}|${catalogItem}`, { owned, reserved });
  }

  createDirectOffer({ game, storeItem, party, account, sellerKind, price }) {
    const presentation = this.#presentation(game, storeItem);
    const offer = {
      offerKey: `sof_${digest({ game, storeItem, party, sellerKind }).slice(0, 32)}`,
      game,
      storeItem,
      catalogItem: presentation.catalogItem,
      party,
      account,
      sellerKind,
      price,
      currency: presentation.currency,
      status: "active",
      version: 1,
      requestHash: digest({ game, storeItem, party, account, sellerKind, price }),
    };
    this.#validateOffer(offer, null);
    this.offers.set(offer.offerKey, offer);
    return clone(offer);
  }

  async createBusinessDraft(request) {
    const business = this.businesses.get(`${request.game}|${request.business}`);
    if (!business?.active) throw new Error("STORE_SELLER_OFFER_BUSINESS_NOT_FOUND");
    const presentation = this.#presentation(request.game, request.storeItem);
    if (!business.products.has(presentation.catalogItem)) {
      throw new Error("STORE_SELLER_OFFER_BUSINESS_PRODUCT_NOT_OWNED");
    }
    if (business.currency !== presentation.currency) {
      throw new Error("STORE_SELLER_OFFER_BUSINESS_CURRENCY_MISMATCH");
    }

    const lock = this.#lock(
      `${request.game}|seller|${business.party}|${presentation.catalogItem}`,
    );
    return lock.run(async () => {
      await Promise.resolve();
      const replayKey = `${request.game}|${business.party}|${request.idempotencyKey}`;
      const requestHash = digest({
        game: request.game,
        business: request.business,
        storeItem: request.storeItem,
        catalogItem: presentation.catalogItem,
        price: request.price,
      });
      const existingKey = this.idempotency.get(replayKey);
      if (existingKey) {
        const existing = this.offers.get(existingKey);
        if (existing.requestHash !== requestHash) {
          throw new Error("STORE_SELLER_OFFER_IDEMPOTENCY_CONFLICT");
        }
        return { offer: clone(existing), alreadyCreated: true };
      }

      const current = [...this.offers.values()].find(
        (offer) =>
          offer.game === request.game &&
          offer.party === business.party &&
          offer.catalogItem === presentation.catalogItem &&
          offer.sellerKind === "business" &&
          offer.status !== "retired",
      );
      if (current) throw new Error("STORE_SELLER_OFFER_BUSINESS_CURRENT_EXISTS");

      const offer = {
        offerKey: `sof_${digest({ replayKey, requestHash }).slice(0, 32)}`,
        game: request.game,
        storeItem: request.storeItem,
        catalogItem: presentation.catalogItem,
        party: business.party,
        account: null,
        sellerKind: "business",
        price: request.price,
        currency: presentation.currency,
        status: "draft",
        version: 1,
        requestHash,
      };
      this.#validateOffer(offer, null);
      this.offers.set(offer.offerKey, offer);
      this.idempotency.set(replayKey, offer.offerKey);
      return { offer: clone(offer), alreadyCreated: false };
    });
  }

  async mutate({ game, offerKey, expectedVersion, price, status, account }) {
    return this.#lock(`${game}|offer|${offerKey}`).run(async () => {
      await Promise.resolve();
      const current = this.offers.get(offerKey);
      if (!current || current.game !== game) {
        throw new Error("STORE_SELLER_OFFER_NOT_FOUND");
      }
      if (current.version !== expectedVersion) {
        throw new Error("STORE_SELLER_OFFER_VERSION_CONFLICT");
      }
      const next = {
        ...current,
        price: price ?? current.price,
        status: status ?? current.status,
        account: account ?? current.account,
        version: current.version + 1,
      };
      this.#validateOffer(next, current);
      this.offers.set(offerKey, next);
      return clone(next);
    });
  }

  aggregate(game) {
    const groups = new Map();
    for (const offer of this.offers.values()) {
      if (offer.game !== game || offer.status !== "active") continue;
      const presentation = this.#presentation(game, offer.storeItem);
      const account = this.accounts.get(`${game}|${offer.account}`);
      if (!account?.active || account.kind !== "store_stock" || account.party !== offer.party) {
        continue;
      }
      const holding = this.holdings.get(
        `${game}|${offer.account}|${offer.catalogItem}`,
      );
      const available = Math.max(
        (holding?.owned ?? 0) - (holding?.reserved ?? 0),
        0,
      );
      const group = groups.get(offer.catalogItem) ?? {
        catalogItem: offer.catalogItem,
        canonicalItem: presentation.canonicalItem,
        storeItem: presentation.storeItem,
        name: presentation.name,
        currency: presentation.currency,
        offers: [],
      };
      group.offers.push({
        offerKey: offer.offerKey,
        party: offer.party,
        sellerKind: offer.sellerKind,
        price: offer.price,
        available,
        version: offer.version,
      });
      groups.set(offer.catalogItem, group);
    }

    return [...groups.values()].map((group) => {
      group.offers.sort(
        (a, b) =>
          Number(b.available > 0) - Number(a.available > 0) ||
          a.price - b.price ||
          a.sellerKind.localeCompare(b.sellerKind) ||
          a.offerKey.localeCompare(b.offerKey),
      );
      const availableOffers = group.offers.filter((offer) => offer.available > 0);
      return {
        ...group,
        bestPrice: availableOffers.length
          ? Math.min(...availableOffers.map((offer) => offer.price))
          : null,
        totalAvailable: group.offers.reduce(
          (sum, offer) => sum + offer.available,
          0,
        ),
        sellerCount: new Set(availableOffers.map((offer) => offer.party)).size,
        offerCount: group.offers.length,
      };
    });
  }

  #presentation(game, storeItem) {
    const presentation = this.presentations.get(`${game}|${storeItem}`);
    if (!presentation?.active || !presentation.visible) {
      throw new Error("STORE_SELLER_OFFER_STORE_ITEM_NOT_FOUND");
    }
    return presentation;
  }

  #validateOffer(next, previous) {
    const party = this.parties.get(`${next.game}|${next.party}`);
    if (!party?.active) throw new Error("STORE_SELLER_OFFER_SELLER_UNAVAILABLE");
    if (next.sellerKind === "seeded" && party.kind !== "store") {
      throw new Error("STORE_SELLER_OFFER_SEEDED_PARTY_INVALID");
    }
    if (next.sellerKind === "npc" && !["country", "system"].includes(party.kind)) {
      throw new Error("STORE_SELLER_OFFER_NPC_PARTY_INVALID");
    }
    if (next.sellerKind === "business" && party.kind !== "business") {
      throw new Error("STORE_SELLER_OFFER_BUSINESS_PARTY_INVALID");
    }
    if (previous?.status === "retired" && next.status !== "retired") {
      throw new Error("STORE_SELLER_OFFER_RETIRED_TERMINAL");
    }
    if (previous && previous.account !== null && next.account !== previous.account) {
      throw new Error("STORE_SELLER_OFFER_CUSTODY_BINDING_IMMUTABLE");
    }
    const transitions = new Set([
      "draft->draft",
      "draft->active",
      "draft->retired",
      "active->active",
      "active->paused",
      "active->retired",
      "paused->paused",
      "paused->active",
      "paused->retired",
      "retired->retired",
    ]);
    if (previous && !transitions.has(`${previous.status}->${next.status}`)) {
      throw new Error("STORE_SELLER_OFFER_TRANSITION_INVALID");
    }
    if (next.status !== "active") return;

    const account = this.accounts.get(`${next.game}|${next.account}`);
    if (
      !account?.active ||
      account.kind !== "store_stock" ||
      account.party !== next.party
    ) {
      throw new Error("STORE_SELLER_OFFER_CUSTODY_ACCOUNT_INVALID");
    }
    const conflict = [...this.offers.values()].some(
      (offer) =>
        offer.offerKey !== next.offerKey &&
        offer.game === next.game &&
        offer.status === "active" &&
        offer.account === next.account,
    );
    if (conflict) throw new Error("STORE_SELLER_OFFER_ACTIVE_ACCOUNT_CONFLICT");
  }

  #lock(key) {
    if (!this.locks.has(key)) this.locks.set(key, new Mutex());
    return this.locks.get(key);
  }
}

const authority = new OfferAuthority();
for (const game of ["game_1", "game_2"]) {
  authority.registerPresentation({
    game,
    storeItem: "widget",
    catalogItem: "itm_widget",
    canonicalItem: "widget.v1",
    currency: "NRC",
    name: "Widget",
  });
  authority.registerParty({ game, party: "store", kind: "store", name: "Store" });
  authority.registerParty({ game, party: "npc", kind: "system", name: "Supplier" });
  authority.registerParty({
    game,
    party: "business_party",
    kind: "business",
    name: "Player Works",
  });
  authority.registerBusiness({
    game,
    business: "business_1",
    party: "business_party",
    currency: "NRC",
    products: ["itm_widget"],
  });
  for (const [account, party] of [
    ["store_stock", "store"],
    ["npc_stock", "npc"],
    ["business_stock", "business_party"],
  ]) {
    authority.registerStoreStockAccount({ game, account, party });
  }
  authority.createDirectOffer({
    game,
    storeItem: "widget",
    party: "store",
    account: "store_stock",
    sellerKind: "seeded",
    price: 10,
  });
  authority.createDirectOffer({
    game,
    storeItem: "widget",
    party: "npc",
    account: "npc_stock",
    sellerKind: "npc",
    price: game === "game_1" ? 9 : 11,
  });
  authority.setHolding({
    game,
    account: "store_stock",
    catalogItem: "itm_widget",
    owned: 5,
  });
  authority.setHolding({
    game,
    account: "npc_stock",
    catalogItem: "itm_widget",
    owned: 3,
    reserved: 1,
  });
}

const request = {
  game: "game_1",
  business: "business_1",
  storeItem: "widget",
  price: 8,
  idempotencyKey: "business-widget-offer-0001",
};
const drafts = await Promise.all(
  Array.from({ length: 40 }, () => authority.createBusinessDraft(request)),
);
assert.equal(drafts.filter((result) => !result.alreadyCreated).length, 1);
assert.equal(drafts.filter((result) => result.alreadyCreated).length, 39);
assert.equal(new Set(drafts.map((result) => result.offer.offerKey)).size, 1);

await assert.rejects(
  () => authority.createBusinessDraft({ ...request, price: 7 }),
  /IDEMPOTENCY_CONFLICT/u,
);
await assert.rejects(
  () => authority.createBusinessDraft({
    ...request,
    idempotencyKey: "business-widget-offer-0002",
  }),
  /BUSINESS_CURRENT_EXISTS/u,
);

const beforeActivation = authority.aggregate("game_1");
assert.equal(beforeActivation.length, 1);
assert.equal(beforeActivation[0].offerCount, 2);
assert.equal(beforeActivation[0].bestPrice, 9);
assert.equal(beforeActivation[0].totalAvailable, 7);

const businessOffer = drafts[0].offer;
authority.setHolding({
  game: "game_1",
  account: "business_stock",
  catalogItem: "itm_widget",
  owned: 4,
  reserved: 1,
});
const activated = await authority.mutate({
  game: "game_1",
  offerKey: businessOffer.offerKey,
  expectedVersion: 1,
  account: "business_stock",
  status: "active",
});
assert.equal(activated.version, 2);
await assert.rejects(
  () => authority.mutate({
    game: "game_1",
    offerKey: businessOffer.offerKey,
    expectedVersion: 1,
    price: 7.5,
  }),
  /VERSION_CONFLICT/u,
);

const gameOne = authority.aggregate("game_1");
assert.equal(gameOne.length, 1, "Multiple offers must render as one catalog card.");
assert.equal(gameOne[0].offerCount, 3);
assert.equal(gameOne[0].sellerCount, 3);
assert.equal(gameOne[0].bestPrice, 8);
assert.equal(gameOne[0].totalAvailable, 10);
assert.deepEqual(gameOne[0].offers.map((offer) => offer.price), [8, 9, 10]);

const gameTwo = authority.aggregate("game_2");
assert.equal(gameTwo.length, 1);
assert.equal(gameTwo[0].offerCount, 2);
assert.equal(gameTwo[0].bestPrice, 10);
assert.equal(gameTwo[0].totalAvailable, 7);
assert.notDeepEqual(gameOne[0].offers, gameTwo[0].offers);

const retired = await authority.mutate({
  game: "game_1",
  offerKey: businessOffer.offerKey,
  expectedVersion: 2,
  status: "retired",
});
assert.equal(retired.status, "retired");
await assert.rejects(
  () => authority.mutate({
    game: "game_1",
    offerKey: businessOffer.offerKey,
    expectedVersion: 3,
    status: "active",
  }),
  /RETIRED_TERMINAL/u,
);

const replacement = await authority.createBusinessDraft({
  ...request,
  idempotencyKey: "business-widget-offer-0003",
  price: 7.75,
});
assert.equal(replacement.alreadyCreated, false);
assert.notEqual(replacement.offer.offerKey, businessOffer.offerKey);

console.log(JSON.stringify({
  checkpoint: "7A",
  concurrentDraftAttempts: drafts.length,
  uniqueBusinessDrafts: 1,
  gameOneCards: gameOne.length,
  gameOneOfferCount: gameOne[0].offerCount,
  gameOneSellerCount: gameOne[0].sellerCount,
  gameOneTotalAvailable: gameOne[0].totalAvailable,
  gameTwoCards: gameTwo.length,
  crossGameIsolation: true,
}));
console.log("Business Phase 7A Store seller-offer simulation: PASS");
