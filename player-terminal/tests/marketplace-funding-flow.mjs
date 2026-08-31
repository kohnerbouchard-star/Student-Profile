import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isEndpointEnabled } from "../src/api/capabilities.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { resolveMarketplaceBackendRequest } from "../src/api/marketplace-backend-routes.js";
import { WRITE_INVALIDATIONS, resourcesForRoute } from "../src/api/resource-plan.js";
import {
  normalizeMarketplaceFundingOrder,
  normalizeMarketplaceFundingQuote,
} from "../src/features/marketplace/marketplace-funding-read-model.js";

const LISTING = "lst_11111111111111111111111111111111";
const RESERVATION = "mpr_22222222222222222222222222222222";
const ORDER = "ord_33333333333333333333333333333333";
const ACCOUNT = "bac_44444444444444444444444444444444";
const QUOTE = "pfq_55555555555555555555555555555555";
const RECEIPT = "pfr_66666666666666666666666666666666";
const TRANSACTION = "btx_77777777777777777777777777777777";
const FIXING = "fxf_88888888888888888888888888888888";
const NOW = "2026-08-27T22:00:00.000Z";
const EXPIRES = "2026-08-27T22:02:00.000Z";

const quoteFixture = Object.freeze({
  ok: true,
  outcome: "applied",
  reservation: {
    reservationKey: RESERVATION,
    listingKey: LISTING,
    itemKey: "data-chip",
    quantity: 1,
    unitPrice: 15,
    subtotal: 15,
    feeRate: 0.025,
    taxRate: 0.01,
    feeAmount: 0.38,
    taxAmount: 0.15,
    buyerTotal: 15.53,
    sellerProceeds: 15,
    currencyCode: "LUM",
    status: "reserved",
    version: 1,
    listingVersion: 3,
    expiresAt: EXPIRES,
    replayed: false,
    fundingQuote: {
      quoteKey: QUOTE,
      fundingContextKind: "marketplace.purchase",
      fundingContextKey: RESERVATION,
      targetCurrencyCode: "LUM",
      targetMinorUnit: 2,
      targetAmount: 15.53,
      fixingKey: FIXING,
      policyVersion: "retail-checkout-v1",
      requiresFx: true,
      expiresAt: EXPIRES,
      lines: [{
        lineNumber: 1,
        sourceAccountKey: ACCOUNT,
        sourceCurrencyCode: "ECO",
        sourceMinorUnit: 2,
        targetCurrencyCode: "LUM",
        targetMinorUnit: 2,
        postedAmount: 100,
        heldAmount: 0,
        availableAmount: 100,
        targetContribution: 15.53,
        sourceDebit: 8.12,
        referenceRate: 2,
        customerRate: 1.98,
        effectiveRate: 1.9126,
        spreadRate: 0.01,
        requiresFx: true,
        roundingDisclosure: "Source debit is rounded up to the source minor unit.",
      }],
    },
  },
});

const orderFixture = Object.freeze({
  ok: true,
  outcome: "applied",
  order: {
    orderKey: ORDER,
    reservationKey: RESERVATION,
    listingKey: LISTING,
    itemKey: "data-chip",
    quantity: 1,
    unitPrice: 15,
    subtotal: 15,
    feeAmount: 0.38,
    taxAmount: 0.15,
    buyerTotal: 15.53,
    sellerProceeds: 15,
    currencyCode: "LUM",
    status: "completed",
    version: 2,
    completedAt: NOW,
    refundedAt: null,
    replayed: false,
    fundingReceipt: {
      receiptKey: RECEIPT,
      quoteKey: QUOTE,
      bankTransactionKey: TRANSACTION,
      targetAccountKey: ACCOUNT,
      fundingContextKind: "marketplace.purchase",
      fundingContextKey: RESERVATION,
      targetCurrencyCode: "LUM",
      targetAmount: 15.53,
      targetReserveDrawAmount: 0,
      sourceDomain: "marketplace",
      sourceAction: "marketplace_purchase_funding",
      createdAt: NOW,
      lines: [{
        lineNumber: 1,
        sourceAccountKey: ACCOUNT,
        sourceCurrencyCode: "ECO",
        targetContribution: 15.53,
        sourceDebit: 8.12,
        referenceRate: 2,
        customerRate: 1.98,
        effectiveRate: 1.9126,
        spreadRate: 0.01,
        requiresFx: true,
      }],
    },
    distributionBankTransactionKey: TRANSACTION,
  },
});

test("Marketplace backend routing separates quote from settlement confirmation", () => {
  assert.equal(
    PLAYER_ENDPOINTS.marketplacePurchase.path,
    "/marketplace/listings/:listingId/quotes",
  );
  assert.equal(
    PLAYER_ENDPOINTS.marketplaceSettlement.path,
    "/marketplace/reservations/:reservationId/settlements",
  );
  const quote = resolveMarketplaceBackendRequest({
    endpointKey: "marketplacePurchase",
    payload: {
      quantity: 1,
      expectedVersion: 3,
      allocations: [{ sourceAccountKey: ACCOUNT, targetAmount: 15.53 }],
      idempotencyKey: "marketplace.quote.0001",
    },
    params: { listingId: LISTING },
  });
  assert.deepEqual(quote, {
    endpointKey: "marketplacePurchase",
    method: "POST",
    path: `/players/me/marketplace/listings/${LISTING}/quotes`,
    payload: {
      quantity: 1,
      expectedVersion: 3,
      allocations: [{ sourceAccountKey: ACCOUNT, targetAmount: 15.53 }],
      idempotencyKey: "marketplace.quote.0001",
    },
  });
  const settlement = resolveMarketplaceBackendRequest({
    endpointKey: "marketplaceSettlement",
    payload: {
      reservationId: RESERVATION,
      clientSubmittedAt: NOW,
      idempotencyKey: "marketplace.settlement.0001",
    },
    params: { reservationId: RESERVATION },
  });
  assert.deepEqual(settlement, {
    endpointKey: "marketplaceSettlement",
    method: "POST",
    path: `/players/me/marketplace/reservations/${RESERVATION}/settlements`,
    payload: {
      idempotencyKey: "marketplace.settlement.0001",
      clientSubmittedAt: NOW,
    },
  });
});

test("Marketplace quote and receipt public evidence validates without internal identity", () => {
  const quote = normalizeMarketplaceFundingQuote(quoteFixture);
  assert.equal(quote.reservationKey, RESERVATION);
  assert.equal(quote.fundingQuote.quoteKey, QUOTE);
  assert.equal(quote.fundingQuote.lines[0].sourceAccountKey, ACCOUNT);
  assert.equal(quote.fundingQuote.lines[0].requiresFx, true);
  assert.equal(quote.buyerTotal, 15.53);

  const order = normalizeMarketplaceFundingOrder(orderFixture);
  assert.equal(order.orderKey, ORDER);
  assert.equal(order.fundingReceipt.receiptKey, RECEIPT);
  assert.equal(order.fundingReceipt.bankTransactionKey, TRANSACTION);
  assert.equal(order.distributionBankTransactionKey, TRANSACTION);
});

test("Marketplace funding public parser rejects UUIDs and incoherent totals", () => {
  const uuidLeak = structuredClone(quoteFixture);
  uuidLeak.reservation.internalId = "00000000-0000-4000-8000-000000000001";
  assert.throws(() => normalizeMarketplaceFundingQuote(uuidLeak), /incomplete data/u);

  const mismatch = structuredClone(quoteFixture);
  mismatch.reservation.buyerTotal = 16;
  assert.throws(() => normalizeMarketplaceFundingQuote(mismatch), /incomplete data/u);

  assert.throws(() => resolveMarketplaceBackendRequest({
    endpointKey: "marketplacePurchase",
    payload: {
      quantity: 1,
      expectedVersion: 3,
      allocations: [
        { sourceAccountKey: ACCOUNT, targetAmount: 10 },
        { sourceAccountKey: ACCOUNT, targetAmount: 5.53 },
      ],
      idempotencyKey: "marketplace.quote.duplicate",
    },
    params: { listingId: LISTING },
  }), /allocations is invalid/u);
});

test("Marketplace quote is non-mutating while settlement refreshes every affected authority", () => {
  assert.deepEqual(WRITE_INVALIDATIONS.marketplacePurchase, []);
  assert.deepEqual(
    WRITE_INVALIDATIONS.marketplaceSettlement,
    ["dashboard", "marketplace", "inventory", "banking", "bankingFx"],
  );
  assert.ok(resourcesForRoute("marketplace").optional.includes("bankingFx"));
  const capabilities = {
    actions: { marketplacePurchase: true },
  };
  assert.equal(isEndpointEnabled(capabilities, "marketplacePurchase"), true);
  assert.equal(isEndpointEnabled(capabilities, "marketplaceSettlement"), true);
});

test("Marketplace source cutover contains constrained forms and legacy purchase tombstone", async () => {
  const [page, flow, main, route, handler] = await Promise.all([
    readFile(new URL("../src/pages/marketplace-page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/features/marketplace/marketplace-funding-flow.js", import.meta.url), "utf8"),
    readFile(new URL("../src/main.js", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/domains/marketplace/api/playerMarketplaceRoutePaths.ts", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/domains/marketplace/api/playerMarketplaceHttpHandler.ts", import.meta.url), "utf8"),
  ]);
  for (const token of [
    'data-player-marketplace-funding-form="quote"',
    'name="sourceAccountKey"',
    'name="targetAmount"',
    'data-player-marketplace-funding-form="settlement"',
    "Reference",
    "Customer",
    "Effective",
  ]) assert.ok(page.includes(token), `Marketplace page missing ${token}`);
  assert.ok(!page.includes('data-endpoint="marketplacePurchase"'));
  assert.ok(flow.includes('api.execute(\n        "marketplacePurchase"'));
  assert.ok(flow.includes('api.execute(\n        "marketplaceSettlement"'));
  assert.ok(flow.includes("let ownsQuotePending = true"));
  assert.ok(flow.includes("releaseQuotePending();\n      updateMarketplace"));
  assert.ok(flow.includes("if (!ownsQuotePending) return"));
  assert.ok(main.includes("installMarketplaceFundingFlow"));
  assert.ok(route.includes("/settlements"));
  assert.ok(route.includes("|quotes"));
  assert.ok(handler.includes("player_marketplace_purchase_retired"));
  assert.ok(handler.includes("createFundingRepository"));
});
