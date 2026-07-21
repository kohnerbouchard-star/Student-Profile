import assert from "node:assert/strict";
import { resolveMarketplaceBackendRequest } from "../src/api/marketplace-backend-routes.js";
import { normalizePlayerMarketplace } from "../src/features/marketplace/marketplace-read-model.js";
import { renderMarketplacePage } from "../src/pages/marketplace-page.js";

const key = "marketplace:test:00000001";
const listingId = "lst_11111111111111111111111111111111";
const reservationId = "mpr_22222222222222222222222222222222";
const orderId = "ord_33333333333333333333333333333333";
const eligibleOrderId = "ord_66666666666666666666666666666666";
const disputeId = "dsp_44444444444444444444444444444444";

assert.deepEqual(resolveMarketplaceBackendRequest({ endpointKey: "marketplace" }), {
  endpointKey: "marketplace", method: "GET", path: "/players/me/marketplace/listings", payload: undefined
});
const create = resolveMarketplaceBackendRequest({ endpointKey: "marketplaceListing", payload: { itemKey: "data-chip", quantity: 2, unitPrice: 15, currencyCode: "lum", condition: "Like New", durationHours: 72, idempotencyKey: key } });
assert.equal(create.path, "/players/me/marketplace/listings");
assert.deepEqual(create.payload, { itemKey: "data-chip", quantity: 2, unitPrice: 15, currencyCode: "LUM", condition: "Like New", durationHours: 72, idempotencyKey: key });
for (const [endpointKey, action] of [["marketplaceActivate", "activate"], ["marketplacePurchase", "purchase"], ["marketplaceCancel", "cancel"]]) {
  const route = resolveMarketplaceBackendRequest({ endpointKey, payload: { listingId, quantity: 1, expectedVersion: 7, idempotencyKey: key } });
  assert.equal(route.path, `/players/me/marketplace/listings/${listingId}/${action}`);
  assert.equal(route.payload.expectedVersion, 7);
  assert.equal("listingId" in route.payload, false);
  assert.equal("playerId" in route.payload, false);
}
const disputeRoute = resolveMarketplaceBackendRequest({ endpointKey: "marketplaceDispute", payload: { orderId, reason: "The transferred item materially differed from the listing.", idempotencyKey: key } });
assert.equal(disputeRoute.path, `/players/me/marketplace/orders/${orderId}/disputes`);
assert.equal("orderId" in disputeRoute.payload, false);

const market = normalizePlayerMarketplace({ marketplace: {
  policy: { marketplaceEnabled: true, crossCountryTradingEnabled: true, moderationRequired: false, feeRate: 0.025, taxRate: 0.01, listingDurationHours: 168, purchaseReservationMinutes: 5, disputeWindowDays: 7, disputesEnabled: true },
  summary: { listingCount: 1, activeSellers: 1, volume: 30 },
  listings: [{ id: listingId, itemId: "data-chip", name: "Data Chip", description: "Encrypted market data.", category: "Equipment", image: null, country: "LUMENOR", condition: "Like New", seller: "Nova Trader", sellerReference: "PLAYER-42", unitPrice: 15, currencyCode: "LUM", quantity: 2, status: "active", version: 7, expiresAt: "2026-07-27T04:00:00.000Z", createdAt: "2026-07-20T04:00:00.000Z", updatedAt: "2026-07-20T04:00:00.000Z", mine: false }],
  myListings: [{ id: "lst_55555555555555555555555555555555", itemId: "data-chip", name: "Data Chip", description: "Encrypted market data.", category: "Equipment", country: "LUMENOR", condition: "Used", seller: "Me", unitPrice: 12, currencyCode: "LUM", quantity: 1, status: "draft", version: 1, expiresAt: "2026-07-27T04:00:00.000Z", createdAt: "2026-07-20T04:00:00.000Z", updatedAt: "2026-07-20T04:00:00.000Z", mine: true }],
  reservations: [{ id: reservationId, listingId, quantity: 1, total: 15.525, currencyCode: "LUM", status: "settled", version: 3, expiresAt: "2026-07-20T04:05:00.000Z" }],
  orders: [
    { id: orderId, reservationId, listingId, itemId: "data-chip", itemName: "Data Chip", quantity: 1, unitPrice: 15, subtotal: 15, feeAmount: 0.375, taxAmount: 0.15, total: 15.525, sellerProceeds: 15, currencyCode: "LUM", status: "completed", version: 2, role: "buyer", completedAt: "2026-07-20T04:01:00.000Z" },
    { id: eligibleOrderId, reservationId: "mpr_77777777777777777777777777777777", listingId, itemId: "data-chip", itemName: "Data Chip", quantity: 1, unitPrice: 15, subtotal: 15, feeAmount: 0.375, taxAmount: 0.15, total: 15.525, sellerProceeds: 15, currencyCode: "LUM", status: "completed", version: 1, role: "buyer", completedAt: "2026-07-20T04:03:00.000Z" }
  ],
  disputes: [{ id: disputeId, orderId, reason: "The transferred item materially differed from the listing.", status: "open", version: 1, openedAt: "2026-07-20T04:02:00.000Z" }]
} });
assert.equal(market.platformFeeRate, 2.5);
assert.equal(market.taxRate, 1);
assert.equal(market.myListings[0].status, "draft");
assert.equal(market.orders[0].reservationId, reservationId);

const html = renderMarketplacePage({
  session: { currencyCode: "LUM" }, marketplace: market,
  inventory: { items: [{ itemKey: "data-chip", name: "Data Chip", quantity: 3, quantityAvailable: 2 }] }
}, { marketplaceCategory: "All", marketplaceListingId: listingId });
for (const expected of [
  `value="${listingId}"`, "name=\"expectedVersion\"", "data-endpoint=\"marketplaceListing\"",
  "data-endpoint=\"marketplaceActivate\"", "data-endpoint=\"marketplaceCancel\"",
  "data-endpoint=\"marketplaceDispute\"", "Create a draft", "Disputes and refunds"
]) assert.match(html, new RegExp(expected));
assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
assert.throws(() => resolveMarketplaceBackendRequest({ endpointKey: "marketplacePurchase", payload: { listingId: "private-uuid", quantity: 1, expectedVersion: 1, idempotencyKey: key } }));
console.log("Marketplace connected lifecycle passed");
