import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import type {
  PlayerMarketplaceFundedOrderDto,
  PlayerMarketplaceFundedReservationDto,
  PlayerMarketplaceFundingRepository,
} from "../contracts/playerMarketplaceFundingContracts.ts";
import type {
  MarketplaceCommittedResult,
  PlayerMarketplaceRepository,
  PlayerMarketplaceScope,
  PlayerMarketplaceSnapshotDto,
} from "../contracts/playerMarketplaceContracts.ts";
import { handlePlayerMarketplaceRequest } from "./playerMarketplaceHttpHandler.ts";
import { readPlayerMarketplaceRoutePath } from "./playerMarketplaceRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const LISTING = "lst_11111111111111111111111111111111";
const RESERVATION = "mpr_22222222222222222222222222222222";
const ORDER = "ord_33333333333333333333333333333333";
const ACCOUNT = "bac_44444444444444444444444444444444";
const QUOTE = "pfq_55555555555555555555555555555555";
const FUNDING_RECEIPT = "pfr_66666666666666666666666666666666";
const BANK_TRANSACTION = "btx_77777777777777777777777777777777";
const FIXING = "fxf_88888888888888888888888888888888";
const NOW = "2026-08-27T22:00:00.000Z";
const EXPIRES = "2026-08-27T22:02:00.000Z";

type CreateInput = Parameters<PlayerMarketplaceRepository["createListing"]>[0];
type ActivateInput = Parameters<PlayerMarketplaceRepository["activateListing"]>[0];
type PurchaseInput = Parameters<PlayerMarketplaceRepository["purchase"]>[0];
type CancelInput = Parameters<PlayerMarketplaceRepository["cancel"]>[0];
type DisputeInput = Parameters<PlayerMarketplaceRepository["openDispute"]>[0];
type QuoteInput = Parameters<PlayerMarketplaceFundingRepository["createQuote"]>[0];
type SettlementInput = Parameters<PlayerMarketplaceFundingRepository["settle"]>[0];

Deno.test("Marketplace routes accept only reviewed public identifiers", () => {
  assertEquals(readPlayerMarketplaceRoutePath("/players/me/marketplace/listings"), { kind: "collection" });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/listings/${LISTING}/quotes`), {
    kind: "purchase", action: "quote", listingKey: LISTING,
  });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/listings/${LISTING}/purchase`), {
    kind: "purchase", action: "retired", listingKey: LISTING,
  });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/reservations/${RESERVATION}/settlements`), {
    kind: "purchase", action: "settlement", reservationKey: RESERVATION,
  });
  assertEquals(readPlayerMarketplaceRoutePath(`/players/me/marketplace/orders/${ORDER}/disputes`), { kind: "dispute", orderKey: ORDER });
  assertEquals(readPlayerMarketplaceRoutePath("/players/me/marketplace/listings/private/quotes"), { kind: "malformed" });
});

Deno.test("Marketplace read and non-purchase lifecycle writes remain private and public-id only", async () => {
  const repository = new CapturingRepository();
  const funding = new CapturingFundingRepository();
  const read = await invoke(repository, funding, "GET", "/players/me/marketplace/listings");
  assertEquals(read.status, 200);
  assertPrivate(read);
  assertNoUuid(await read.json());

  const created = await invoke(repository, funding, "POST", "/players/me/marketplace/listings", {
    itemKey: "data-chip", quantity: 2, unitPrice: 15, currencyCode: "LUM",
    condition: "Used", durationHours: 72, idempotencyKey: "marketplace.create.0001",
  });
  assertEquals(created.status, 201);
  assertEquals(repository.createInputs[0]?.gameSessionId, GAME);
  assertEquals(repository.createInputs[0]?.playerId, PLAYER);

  const activated = await invoke(repository, funding, "POST", `/players/me/marketplace/listings/${LISTING}/activate`, {
    expectedVersion: 1, idempotencyKey: "marketplace.activate.0001",
  });
  const cancelled = await invoke(repository, funding, "POST", `/players/me/marketplace/listings/${LISTING}/cancel`, {
    expectedVersion: 2, idempotencyKey: "marketplace.cancel.0001",
  });
  const disputed = await invoke(repository, funding, "POST", `/players/me/marketplace/orders/${ORDER}/disputes`, {
    reason: "The transferred item materially differed from the listing.",
    idempotencyKey: "marketplace.dispute.0001",
  });
  assertEquals(activated.status, 200);
  assertEquals(cancelled.status, 200);
  assertEquals(disputed.status, 201);
  assertEquals(funding.totalCalls(), 0);
});

Deno.test("Marketplace purchase uses explicit funding quote and settlement confirmation", async () => {
  const repository = new CapturingRepository();
  const funding = new CapturingFundingRepository();
  const quoted = await invoke(repository, funding, "POST", `/players/me/marketplace/listings/${LISTING}/quotes`, {
    quantity: 1,
    expectedVersion: 2,
    allocations: [{ sourceAccountKey: ACCOUNT, targetAmount: 15.53 }],
    idempotencyKey: "marketplace.quote.0001",
  });
  assertEquals(quoted.status, 201);
  const quoteBody = await quoted.json() as Record<string, any>;
  assertEquals(quoteBody.outcome, "applied");
  assertEquals(quoteBody.reservation.reservationKey, RESERVATION);
  assertEquals(quoteBody.reservation.fundingQuote.quoteKey, QUOTE);
  assertNoUuid(quoteBody);
  assertEquals(funding.quoteInputs[0]?.gameSessionId, GAME);
  assertEquals(funding.quoteInputs[0]?.playerId, PLAYER);
  assertEquals(funding.quoteInputs[0]?.effectiveAt, NOW);
  assertEquals(funding.quoteInputs[0]?.allocations, [
    { sourceAccountKey: ACCOUNT, targetAmount: 15.53 },
  ]);

  const settled = await invoke(repository, funding, "POST", `/players/me/marketplace/reservations/${RESERVATION}/settlements`, {
    idempotencyKey: "marketplace.settlement.0001",
    clientSubmittedAt: NOW,
  });
  assertEquals(settled.status, 200);
  const settlementBody = await settled.json() as Record<string, any>;
  assertEquals(settlementBody.order.orderKey, ORDER);
  assertEquals(settlementBody.order.fundingReceipt.receiptKey, FUNDING_RECEIPT);
  assertNoUuid(settlementBody);
  assertEquals(funding.settlementInputs[0]?.reservationKey, RESERVATION);
  assertEquals(funding.settlementInputs[0]?.clientSubmittedAt, NOW);

  const retired = await invoke(repository, funding, "POST", `/players/me/marketplace/listings/${LISTING}/purchase`, {
    quantity: 1, expectedVersion: 2, idempotencyKey: "marketplace.purchase.0001",
  });
  assertEquals(retired.status, 410);
  const retiredBody = await retired.json() as Record<string, any>;
  assertEquals(retiredBody.error.code, "player_marketplace_purchase_retired");
  assertEquals(repository.purchaseInputs.length, 0);
});

Deno.test("Marketplace funding rejects duplicate accounts and browser-authored scope privately", async () => {
  const repository = new CapturingRepository();
  const funding = new CapturingFundingRepository();
  const cases = [
    new Request("https://example.test/players/me/marketplace/listings?playerId=x", { headers: { "x-player-session-token": "token" } }),
    request("POST", `/players/me/marketplace/listings/${LISTING}/quotes`, {
      quantity: 1,
      expectedVersion: 2,
      allocations: [
        { sourceAccountKey: ACCOUNT, targetAmount: 10 },
        { sourceAccountKey: ACCOUNT, targetAmount: 5.53 },
      ],
      idempotencyKey: "marketplace.quote.duplicate",
    }),
    request("POST", `/players/me/marketplace/reservations/${RESERVATION}/settlements`, {
      idempotencyKey: "short",
      clientSubmittedAt: NOW,
    }),
  ];
  for (const input of cases) {
    const route = readPlayerMarketplaceRoutePath(new URL(input.url).pathname);
    if (!route) throw new Error("route missing");
    const response = await handlePlayerMarketplaceRequest(input, route, dependencies(repository, funding));
    if (response.status < 400) throw new Error("expected failure");
    assertPrivate(response);
    assertNoUuid(await response.json());
  }
  assertEquals(repository.totalCalls(), 0);
  assertEquals(funding.totalCalls(), 0);
});

Deno.test("expired Player sessions fail before Marketplace repository access", async () => {
  const repository = new CapturingRepository();
  const funding = new CapturingFundingRepository();
  const route = readPlayerMarketplaceRoutePath("/players/me/marketplace/listings");
  if (!route) throw new Error("route missing");
  const response = await handlePlayerMarketplaceRequest(
    request("GET", "/players/me/marketplace/listings"),
    route,
    dependencies(repository, funding, async () => {
      throw new EdgeActivationError("player_session_expired", "Player session expired.", 401);
    }),
  );
  assertEquals(response.status, 401);
  assertEquals(repository.totalCalls(), 0);
  assertEquals(funding.totalCalls(), 0);
});

async function invoke(
  repository: CapturingRepository,
  funding: CapturingFundingRepository,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const route = readPlayerMarketplaceRoutePath(path);
  if (!route) throw new Error("route missing");
  return handlePlayerMarketplaceRequest(request(method, path, body), route, dependencies(repository, funding));
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      "x-player-session-token": "token",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function dependencies(
  repository: CapturingRepository,
  funding: CapturingFundingRepository,
  resolveScope: () => Promise<unknown> = async () => ({ gameId: GAME, playerUuid: PLAYER }),
) {
  return {
    createServiceClient: () => ({}) as never,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: async () => resolveScope() as never,
    createRepository: () => repository,
    createFundingRepository: () => funding,
    now: () => new Date(NOW),
  };
}

class CapturingRepository implements PlayerMarketplaceRepository {
  createInputs: CreateInput[] = [];
  activateInputs: ActivateInput[] = [];
  purchaseInputs: PurchaseInput[] = [];
  cancelInputs: CancelInput[] = [];
  disputeInputs: DisputeInput[] = [];
  readInputs: PlayerMarketplaceScope[] = [];

  read(scope: PlayerMarketplaceScope): Promise<PlayerMarketplaceSnapshotDto> {
    this.readInputs.push(scope);
    return Promise.resolve(snapshot());
  }
  createListing(input: CreateInput): Promise<MarketplaceCommittedResult> {
    this.createInputs.push(input);
    return Promise.resolve(result(LISTING, "draft", 1));
  }
  activateListing(input: ActivateInput): Promise<MarketplaceCommittedResult> {
    this.activateInputs.push(input);
    return Promise.resolve(result(LISTING, "active", 2));
  }
  purchase(input: PurchaseInput): Promise<MarketplaceCommittedResult> {
    this.purchaseInputs.push(input);
    return Promise.resolve(result(ORDER, "completed", 2));
  }
  cancel(input: CancelInput): Promise<MarketplaceCommittedResult> {
    this.cancelInputs.push(input);
    return Promise.resolve(result(LISTING, "cancelled", 3));
  }
  openDispute(input: DisputeInput): Promise<MarketplaceCommittedResult> {
    this.disputeInputs.push(input);
    return Promise.resolve(result("dsp_99999999999999999999999999999999", "open", 1));
  }
  totalCalls(): number {
    return this.createInputs.length + this.activateInputs.length + this.purchaseInputs.length +
      this.cancelInputs.length + this.disputeInputs.length + this.readInputs.length;
  }
}

class CapturingFundingRepository implements PlayerMarketplaceFundingRepository {
  quoteInputs: QuoteInput[] = [];
  settlementInputs: SettlementInput[] = [];

  createQuote(input: QuoteInput): Promise<PlayerMarketplaceFundedReservationDto> {
    this.quoteInputs.push(input);
    return Promise.resolve(fundedReservation());
  }
  settle(input: SettlementInput): Promise<PlayerMarketplaceFundedOrderDto> {
    this.settlementInputs.push(input);
    return Promise.resolve(fundedOrder());
  }
  totalCalls(): number {
    return this.quoteInputs.length + this.settlementInputs.length;
  }
}

function result(targetId: string, status: string, version: number): MarketplaceCommittedResult {
  return { outcome: "applied", targetId, status, version, committedAt: NOW };
}

function fundedReservation(): PlayerMarketplaceFundedReservationDto {
  return {
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
  };
}

function fundedOrder(): PlayerMarketplaceFundedOrderDto {
  return {
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
      receiptKey: FUNDING_RECEIPT,
      quoteKey: QUOTE,
      bankTransactionKey: BANK_TRANSACTION,
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
    distributionBankTransactionKey: BANK_TRANSACTION,
  };
}

function snapshot(): PlayerMarketplaceSnapshotDto {
  return {
    policy: {
      marketplaceEnabled: true,
      crossCountryTradingEnabled: true,
      moderationRequired: false,
      feeRate: 0.025,
      taxRate: 0.01,
      listingDurationHours: 168,
      purchaseReservationMinutes: 5,
      disputeWindowDays: 7,
      disputesEnabled: true,
    },
    listings: [], myListings: [], reservations: [], orders: [], disputes: [],
    summary: { listingCount: 0, activeSellers: 0, volume: 0 },
  };
}

function assertPrivate(response: Response): void {
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(response.headers.get("pragma"), "no-cache");
}
function assertNoUuid(value: unknown): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(JSON.stringify(value))) {
    throw new Error("UUID leaked");
  }
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
