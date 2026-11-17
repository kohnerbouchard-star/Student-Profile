import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_LISTING_STATUSES,
  normalizeMarketplaceReadModel,
} from "../admin/v2/src/routes/marketplace/MarketplaceReadModel.js";
import { normalizeMarketplaceReadModel as controllerReadModel } from "../admin/v2/src/routes/marketplace/MarketplaceController.js";

const id = (prefix, suffix = "a") => `${prefix}_${suffix.repeat(32)}`;
const PRIVATE_ID = "40000000-0000-4000-8000-000000000004";
const COLLECTIONS = { listings: "lst", reservations: "mpr", orders: "ord", disputes: "dsp", audit: "mae", postings: "mfp" };

test("Marketplace read model keeps the controller export and immutable listing vocabulary", () => {
  assert.equal(controllerReadModel, normalizeMarketplaceReadModel);
  assert.deepEqual(MARKETPLACE_LISTING_STATUSES, ["draft", "active", "moderation_hold", "sold", "cancelled", "expired", "rejected"]);
  assert.equal(Object.isFrozen(MARKETPLACE_LISTING_STATUSES), true);
});

test("Marketplace read model accepts existing response envelopes and rejects non-record responses", () => {
  const data = { listings: [{ id: id("lst"), status: "active" }] };
  const expected = normalizeMarketplaceReadModel(data);
  assert.deepEqual(normalizeMarketplaceReadModel({ data }), expected);
  assert.deepEqual(normalizeMarketplaceReadModel({ value: { data } }), expected);
  assert.deepEqual(normalizeMarketplaceReadModel({ data, value: { data: {} } }), expected);
  for (const invalid of [null, undefined, [], "response", 42]) {
    assert.throws(() => normalizeMarketplaceReadModel(invalid), (error) => error.code === "INVALID_RESPONSE" && error.retryable === true);
  }
  assert.equal(normalizeMarketplaceReadModel({}).isEmpty, true);
});

test("Marketplace collections enforce their public-ID families and retain source order", () => {
  for (const [collection, prefix] of Object.entries(COLLECTIONS)) {
    const model = normalizeMarketplaceReadModel({
      [collection]: [null, [], { id: PRIVATE_ID }, { id: id(prefix === "lst" ? "ord" : "lst") },
        { id: ` ${id(prefix, "b").toUpperCase()} ` }, { id: id(prefix) }],
    });
    assert.deepEqual(model[collection].map((row) => row.id), [id(prefix, "b"), id(prefix)]);
    assert.deepEqual(model[collection].map((row) => row.rowKey), [id(prefix, "b"), id(prefix)]);
  }
});

test("Marketplace normalization preserves fractional money and defensive display defaults", () => {
  const model = normalizeMarketplaceReadModel({ listings: [{
    id: id("lst"), itemId: PRIVATE_ID, seller: { id: PRIVATE_ID, displayName: PRIVATE_ID },
    quantityInitial: "3", quantityAvailable: 1.5, unitPrice: "12.375", version: 0,
    currencyCode: " eco ", countryCode: " kr ", condition: " new ", status: "future_state",
    createdAt: "invalid", moderationReason: `Hidden ${PRIVATE_ID}`,
  }] });
  const listing = model.listings[0];
  assert.equal(listing.itemId, "Unnamed item");
  assert.deepEqual(listing.seller, { displayName: "Player" });
  assert.equal(listing.quantityInitial, 3);
  assert.equal(listing.quantityAvailable, null);
  assert.equal(listing.unitPrice, 12.375);
  assert.equal(listing.version, 1);
  assert.equal(listing.currencyCode, "ECO");
  assert.equal(listing.countryCode, "KR");
  assert.equal(listing.status, "future_state");
  assert.equal(listing.createdAt, "");
  assert.equal(listing.moderationReason, "");
  for (const value of [-1, Infinity, NaN, "", null]) {
    assert.equal(normalizeMarketplaceReadModel({ postings: [{ id: id("mfp"), amount: value }] }).postings[0].amount, null);
  }
});

test("Marketplace policy normalization preserves bounded defaults and country filtering", () => {
  const model = normalizeMarketplaceReadModel({ policy: {
    marketplaceEnabled: false, crossCountryTradingEnabled: false, moderationRequired: true, disputesEnabled: false,
    feeRate: 10, taxRate: -1, listingDurationHours: 1000, purchaseReservationMinutes: 100, disputeWindowDays: 100,
    countryFeeOverrides: { kr: "0.1", us: 0.26, ca: -1, "invalid country": 0.01 },
    blockedCountryCodes: [" kr ", "KR", "us", PRIVATE_ID, "!"],
  } });
  assert.deepEqual(model.policy, {
    marketplaceEnabled: false, crossCountryTradingEnabled: false, moderationRequired: true, disputesEnabled: false,
    feeRate: 0.25, taxRate: 0, listingDurationHours: 720, purchaseReservationMinutes: 60, disputeWindowDays: 30,
    countryFeeOverrides: { KR: 0.1 }, blockedCountryCodes: ["KR", "US"], updatedAt: "",
  });
});

test("Marketplace dispute projection follows order links without changing listing or order state", () => {
  const input = {
    listings: [{ id: id("lst"), status: "active" }, { id: id("lst", "b"), status: "sold" }],
    orders: [{ id: id("ord"), listingId: id("lst"), status: "settled" }],
    disputes: [{ id: id("dsp"), orderId: id("ord"), status: "open" }],
  };
  const model = normalizeMarketplaceReadModel(input);
  assert.equal(model.listings[0].status, "active");
  assert.equal(model.listings[0].effectiveStatus, "disputed");
  assert.equal(model.listings[1].effectiveStatus, "sold");
  assert.equal(model.orders[0].status, "settled");
  assert.deepEqual(model.summary, { activeListings: 1, soldListings: 1, openDisputes: 1, settledOrders: 1 });
  input.disputes[0].status = "closed";
  assert.equal(normalizeMarketplaceReadModel(input).listings[0].effectiveStatus, "active");
  input.disputes[0] = { id: id("dsp"), orderId: id("ord", "b"), status: "open" };
  assert.equal(normalizeMarketplaceReadModel(input).listings[0].effectiveStatus, "active");
});

test("Marketplace normalization keeps collection, metadata and country bounds", () => {
  const input = Object.fromEntries(Object.entries(COLLECTIONS).map(([name, prefix]) =>
    [name, Array.from({ length: 505 }, (_, i) => ({ id: `${prefix}_${i.toString(16).padStart(32, "0")}` }))]));
  input.audit[0].metadata = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`key${i}`, i]));
  input.policy = {
    countryFeeOverrides: Object.fromEntries(Array.from({ length: 105 }, (_, i) => [`C${i}`, 0.1])),
    blockedCountryCodes: Array.from({ length: 105 }, (_, i) => `C${i}`),
  };
  const model = normalizeMarketplaceReadModel(input);
  for (const name of Object.keys(COLLECTIONS)) assert.equal(model[name].length, 500, name);
  assert.equal(Object.keys(model.audit[0].metadata).length, 30);
  assert.equal(Object.keys(model.policy.countryFeeOverrides).length, 100);
  assert.equal(model.policy.blockedCountryCodes.length, 100);
});

test("Marketplace read model removes private audit fields and deeply freezes only its output", () => {
  const input = { audit: [{ id: id("mae"), metadata: {
    note: "Allowed", count: 2, enabled: false, infinite: Infinity, nested: {}, privateReference: PRIVATE_ID,
    player_id: PRIVATE_ID, game_id: PRIVATE_ID, session: "hidden", token: "hidden", secret: "hidden",
  } }], policy: { countryFeeOverrides: { KR: 0.1 }, blockedCountryCodes: ["US"] } };
  const original = structuredClone(input);
  const model = normalizeMarketplaceReadModel(input);
  assert.deepEqual(model.audit[0].metadata, { note: "Allowed", count: 2, enabled: false });
  function assertFrozen(value) {
    if (value === null || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertFrozen);
  }
  assertFrozen(model);
  assert.deepEqual(input, original);
  assert.equal(Object.isFrozen(input.policy.countryFeeOverrides), false);
  input.policy.countryFeeOverrides.KR = 0.2;
  assert.equal(model.policy.countryFeeOverrides.KR, 0.1);
  assert.equal(model.isEmpty, true, "audit and postings alone do not make an actionable snapshot non-empty");
});
