import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMarketplaceApiClient } from "../admin/v2/src/routes/marketplace/MarketplaceApiClient.js";
import {
  createMarketplaceController,
  normalizeMarketplaceReadModel,
} from "../admin/v2/src/routes/marketplace/MarketplaceController.js";

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIRECTORY, "..");
const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_PLAYER_UUID = "40000000-0000-4000-8000-000000000004";
const LISTING_A = `lst_${"a".repeat(32)}`;
const LISTING_B = `lst_${"b".repeat(32)}`;
const LISTING_C = `lst_${"c".repeat(32)}`;
const RESERVATION_A = `mpr_${"d".repeat(32)}`;
const ORDER_A = `ord_${"e".repeat(32)}`;
const DISPUTE_A = `dsp_${"f".repeat(32)}`;
const AUDIT_A = `mae_${"1".repeat(32)}`;
const POSTING_A = `mfp_${"2".repeat(32)}`;
const RAW_DIAGNOSTIC = "SELECT secret FROM auth.users USING service_role backend/supabase";
const PRIVATE_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

function policy() {
  return {
    marketplaceEnabled: true,
    crossCountryTradingEnabled: true,
    moderationRequired: false,
    feeRate: 0.025,
    taxRate: 0.01,
    listingDurationHours: 168,
    purchaseReservationMinutes: 5,
    disputeWindowDays: 7,
    disputesEnabled: true,
    countryFeeOverrides: { KR: 0.01 },
    blockedCountryCodes: [],
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function player(displayName, id = "P-100") {
  return { id, displayName };
}

function snapshot({ listings = null, disputes = null } = {}) {
  const defaultListings = [
    {
      id: LISTING_A,
      seller: player("한울 협동조합 — 초정밀 부품 연구조 긴 이름", PRIVATE_PLAYER_UUID),
      countryCode: "KR",
      itemId: "초고밀도 다목적 정밀 부품 패키지 — 장문 한국어 상품명",
      quantityInitial: 4,
      quantityAvailable: 3,
      unitPrice: 1250.5,
      currencyCode: "ECO",
      condition: "new",
      status: "active",
      version: 2,
      expiresAt: "2026-08-09T00:00:00.000Z",
      moderationReason: null,
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T01:00:00.000Z",
    },
    {
      id: LISTING_B,
      seller: player("Jordan Kim", "P-101"),
      countryCode: "US",
      itemId: "Notebook",
      quantityInitial: 1,
      quantityAvailable: 0,
      unitPrice: 50,
      currencyCode: "ECO",
      condition: "used",
      status: "sold",
      version: 4,
      expiresAt: "2026-08-10T00:00:00.000Z",
      moderationReason: null,
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-07T02:00:00.000Z",
    },
    {
      id: LISTING_C,
      seller: player("Avery Montgomery-Rivera-Wojciechowski", "P-102"),
      countryCode: "CA",
      itemId: "Regional supply crate",
      quantityInitial: 2,
      quantityAvailable: 2,
      unitPrice: 90,
      currencyCode: "ECO",
      condition: "new",
      status: "cancelled",
      version: 3,
      expiresAt: "2026-08-10T00:00:00.000Z",
      moderationReason: "Seller cancelled listing.",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-07T02:00:00.000Z",
    },
  ];
  return {
    policy: policy(),
    listings: listings ?? defaultListings,
    reservations: [
      {
        id: RESERVATION_A,
        listingId: LISTING_A,
        buyer: player("Buyer One", "P-201"),
        seller: player("한울 협동조합", "P-200"),
        quantity: 1,
        total: 1250.5,
        currencyCode: "ECO",
        status: "completed",
        version: 2,
        expiresAt: "2026-08-07T01:10:00.000Z",
        releaseReason: null,
        createdAt: "2026-08-07T01:00:00.000Z",
        updatedAt: "2026-08-07T01:05:00.000Z",
      },
    ],
    orders: [
      {
        id: ORDER_A,
        reservationId: RESERVATION_A,
        listingId: LISTING_A,
        buyer: player("Buyer One", "P-201"),
        seller: player("한울 협동조합", "P-200"),
        itemId: "초고밀도 다목적 정밀 부품 패키지",
        quantity: 1,
        subtotal: 1250.5,
        feeAmount: 31.2625,
        taxAmount: 12.505,
        total: 1263.005,
        sellerProceeds: 1219.2375,
        currencyCode: "ECO",
        status: "completed",
        version: 3,
        completedAt: "2026-08-07T01:05:00.000Z",
        refundedAt: null,
        createdAt: "2026-08-07T01:00:00.000Z",
        updatedAt: "2026-08-07T01:05:00.000Z",
      },
    ],
    disputes: disputes ?? [
      {
        id: DISPUTE_A,
        orderId: ORDER_A,
        openedBy: player("Buyer One", PRIVATE_PLAYER_UUID),
        reason: "Item did not match the listing description.",
        status: "open",
        version: 1,
        resolutionNote: null,
        openedAt: "2026-08-07T02:00:00.000Z",
        resolvedAt: null,
        updatedAt: "2026-08-07T02:00:00.000Z",
      },
    ],
    audit: [
      {
        id: AUDIT_A,
        listingId: LISTING_A,
        reservationId: RESERVATION_A,
        orderId: ORDER_A,
        disputeId: DISPUTE_A,
        actorType: "player",
        action: "dispute_opened",
        metadata: {
          note: "Player raised a dispute",
          privateReference: PRIVATE_PLAYER_UUID,
          player_id: PRIVATE_PLAYER_UUID,
          secret: RAW_DIAGNOSTIC,
        },
        createdAt: "2026-08-07T02:00:00.000Z",
      },
    ],
    postings: [
      {
        id: POSTING_A,
        orderId: ORDER_A,
        postingGroup: "settlement",
        postingType: "seller_credit",
        amount: 1219.2375,
        currencyCode: "ECO",
        createdAt: "2026-08-07T01:05:00.000Z",
      },
    ],
  };
}

test("Marketplace API client uses only authoritative Marketplace moderation endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "GET") return jsonResponse({ data: snapshot() });
    return jsonResponse({ data: { result: { ok: true }, committed: true, refreshRequired: true } });
  };
  const client = createMarketplaceApiClient({ fetchImpl, timeoutMs: 1_000 });

  const read = await client.readMarketplace({ gameId: GAME_ID });
  await client.reviewListing({
    gameId: GAME_ID,
    listingId: LISTING_A,
    action: "hold",
    expectedVersion: 2,
    reason: "Administrator review",
    idempotencyKey: "admin.marketplace.listing.hold.0001",
  });
  await client.reviewDispute({
    gameId: GAME_ID,
    disputeId: DISPUTE_A,
    action: "refund",
    expectedVersion: 1,
    reason: "Evidence supports buyer refund",
    idempotencyKey: "admin.marketplace.dispute.refund.0001",
  });
  await client.updatePolicy({
    gameId: GAME_ID,
    policy: policy(),
    idempotencyKey: "admin.marketplace.policy.update.0001",
  });

  assert.equal(read.data.listings.length, 3);
  assert.deepEqual(calls.map(({ url, init }) => [init.method, url]), [
    ["GET", `/api/admin/games/${GAME_ID}/marketplace`],
    ["POST", `/api/admin/games/${GAME_ID}/marketplace/listings/${LISTING_A}/hold`],
    ["POST", `/api/admin/games/${GAME_ID}/marketplace/disputes/${DISPUTE_A}/refund`],
    ["PATCH", `/api/admin/games/${GAME_ID}/marketplace/policy`],
  ]);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "admin.marketplace.listing.hold.0001");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    expectedVersion: 2,
    reason: "Administrator review",
    idempotencyKey: "admin.marketplace.listing.hold.0001",
  });
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    expectedVersion: 1,
    reason: "Evidence supports buyer refund",
    idempotencyKey: "admin.marketplace.dispute.refund.0001",
  });
  assert.deepEqual(JSON.parse(calls[3].init.body), policy());
  assert.equal(calls.every(({ url }) => url.includes("/marketplace")), true);
  assert.equal(calls.some(({ url }) => /\/market(?:\/|$)/.test(url)), false);
});

test("Marketplace API client rejects unsupported mutations before transport", async () => {
  let fetchCount = 0;
  const client = createMarketplaceApiClient({
    fetchImpl: async () => {
      fetchCount += 1;
      return jsonResponse({ data: { committed: true } });
    },
  });
  await assert.rejects(
    client.reviewListing({ gameId: GAME_ID, listingId: LISTING_A, action: "delete", expectedVersion: 1, reason: "No", idempotencyKey: "admin.marketplace.bad.0001" }),
    (error) => error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    client.reviewDispute({ gameId: GAME_ID, disputeId: DISPUTE_A, action: "close", expectedVersion: 1, reason: "No", idempotencyKey: "admin.marketplace.bad.0002" }),
    (error) => error.code === "INVALID_REQUEST",
  );
  assert.equal(fetchCount, 0);
});

test("Marketplace client converts backend diagnostics to safe errors", async () => {
  const client = createMarketplaceApiClient({
    fetchImpl: async () => jsonResponse({
      error: { code: "marketplace_admin_unavailable", message: RAW_DIAGNOSTIC, details: RAW_DIAGNOSTIC },
    }, { status: 503, headers: { "x-request-id": "req-marketplace-safe" } }),
  });
  await assert.rejects(client.readMarketplace({ gameId: GAME_ID }), (error) => {
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    assert.equal(error.requestId, "req-marketplace-safe");
    assert.equal(error.userMessage.includes("service_role"), false);
    assert.equal(error.userMessage.includes("backend/supabase"), false);
    return true;
  });
});

test("Marketplace normalization covers zero, many, disputed, Korean, and private-ID stripping", () => {
  const empty = normalizeMarketplaceReadModel({ data: snapshot({ listings: [], disputes: [] }) });
  assert.equal(empty.listings.length, 0);
  assert.equal(empty.disputes.length, 0);
  assert.equal(empty.isEmpty, false, "orders/reservations keep a non-empty lifecycle snapshot non-empty");

  const singleSnapshot = snapshot({ disputes: [] });
  singleSnapshot.listings = [singleSnapshot.listings[0]];
  const single = normalizeMarketplaceReadModel({ data: singleSnapshot });
  assert.equal(single.listings.length, 1);

  const model = normalizeMarketplaceReadModel({ data: snapshot() });
  assert.equal(model.listings.length, 3);
  assert.equal(model.listings[0].effectiveStatus, "disputed");
  assert.equal(model.listings[1].status, "sold");
  assert.equal(model.listings[2].status, "cancelled");
  assert.match(model.listings[0].itemId, /초고밀도/);
  assert.match(model.listings[0].seller.displayName, /한울/);
  assert.equal(model.summary.openDisputes, 1);
  assert.equal(model.summary.soldListings, 1);
  assert.equal(model.summary.settledOrders, 1);

  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, PRIVATE_UUID_PATTERN);
  assert.equal(serialized.includes("service_role"), false);
  assert.equal(serialized.includes("backend/supabase"), false);
  assert.equal("id" in model.listings[0].seller, false, "player ownership references are not retained in the UI model");
  assert.equal("id" in model.disputes[0].openedBy, false, "dispute player references are display-name-only");
});

test("Marketplace controller enforces marketplace.moderate before reads or mutations", async () => {
  const calls = [];
  const api = {
    readMarketplace: async () => { calls.push("read"); return { data: snapshot() }; },
    cancelMarketplaceRequest: () => false,
    reviewListing: async () => { calls.push("listing"); return { data: { committed: true } }; },
    reviewDispute: async () => { calls.push("dispute"); return { data: { committed: true } }; },
    updatePolicy: async () => { calls.push("policy"); return { data: { committed: true } }; },
  };
  const controller = createMarketplaceController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => false,
    cryptoObject: { randomUUID: () => "30000000-0000-4000-8000-000000000003" },
  });
  await controller.load();
  const result = await controller.moderateListing({ id: LISTING_A, itemId: "Item", version: 1 }, "hold", "Review");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PERMISSION_DENIED");
  assert.deepEqual(calls, []);
  controller.destroy();
});

test("Marketplace controller commits only supported listing, dispute, and policy mutations", async () => {
  const calls = [];
  const api = {
    readMarketplace: async () => ({ data: snapshot() }),
    cancelMarketplaceRequest: () => false,
    reviewListing: async (input) => { calls.push(["listing", input]); return { data: { committed: true } }; },
    reviewDispute: async (input) => { calls.push(["dispute", input]); return { data: { committed: true } }; },
    updatePolicy: async (input) => { calls.push(["policy", input]); return { data: { committed: true } }; },
  };
  let sequence = 2;
  const controller = createMarketplaceController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "marketplace.moderate",
    cryptoObject: { randomUUID: () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}` },
  });
  await controller.load();
  const model = controller.getState().data;
  assert.equal((await controller.moderateListing(model.listings[0], "hold", "Review active listing")).ok, true);
  assert.equal((await controller.moderateDispute(model.disputes[0], "resolve-seller", "Seller fulfilled authoritative terms")).ok, true);
  assert.equal((await controller.savePolicy(model.policy)).ok, true);
  assert.deepEqual(calls.map(([kind]) => kind), ["listing", "dispute", "policy"]);
  assert.equal(calls[0][1].listingId, LISTING_A);
  assert.equal(calls[0][1].expectedVersion, 2);
  assert.equal(calls[1][1].disputeId, DISPUTE_A);
  assert.equal(calls[1][1].expectedVersion, 1);
  controller.destroy();
});

test("Marketplace source remains explicitly separate from financial Market and Player Marketplace routes", async () => {
  const [marketplaceClient, marketplaceRoute, navigation, marketClient, playerMarketplace, css] = await Promise.all([
    readFile(path.join(ROOT, "admin/v2/src/routes/marketplace/MarketplaceApiClient.js"), "utf8"),
    readFile(path.join(ROOT, "admin/v2/src/routes/marketplace/MarketplaceRoute.js"), "utf8"),
    readFile(path.join(ROOT, "admin/v2/src/core/navigation-registry.js"), "utf8"),
    readFile(path.join(ROOT, "admin/v2/src/api/admin-api-client.js"), "utf8"),
    readFile(path.join(ROOT, "player-terminal/src/api/marketplace-backend-routes.js"), "utf8"),
    readFile(path.join(ROOT, "admin/v2/styles/routes/marketplace.css"), "utf8"),
  ]);

  assert.match(marketplaceClient, /\/marketplace/);
  assert.doesNotMatch(marketplaceClient, /\/market\/assets|\/market\/trades|include=quotes|marketplaceSecurities/);
  assert.match(marketplaceRoute, /Marketplace is player-to-player trade/);
  assert.match(marketplaceRoute, /Financial Market instruments/);
  assert.match(marketplaceRoute, /does not expose an offers collection/);
  assert.match(marketplaceRoute, /function applyFilters/);
  assert.match(marketplaceRoute, /"active", "sold", "cancelled", "disputed"/);
  assert.match(navigation, /id: "market"[\s\S]*permission: "market\.manage"[\s\S]*migration: "v2"/);
  assert.match(navigation, /id: "marketplace"[\s\S]*permission: "marketplace\.moderate"[\s\S]*migration: "v2"/);
  assert.match(marketClient, /\/market\/assets\?include=quotes/);
  assert.match(playerMarketplace, /\/players\/me\/marketplace\/listings/);
  assert.match(playerMarketplace, /\/players\/me\/marketplace\/orders\/\$\{encodeURIComponent\(orderId\)\}\/disputes/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});
