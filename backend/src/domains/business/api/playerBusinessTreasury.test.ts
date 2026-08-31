import { createPlayerRequestApplicationContext } from "../../players/index.ts";
import type {
  BusinessTreasuryAccountV1,
  BusinessTreasuryFxOrderV1,
  BusinessTreasuryFxQuoteV1,
  BusinessTreasuryRepositoryV1,
  BusinessTreasurySnapshotV1,
} from "../contracts/businessTreasuryContracts.ts";
import { BusinessTreasuryError } from "../contracts/businessTreasuryContracts.ts";
import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import {
  parseBusinessTreasuryAccountOpenBody,
  parseBusinessTreasuryCancelBody,
  parseBusinessTreasuryConsumeBody,
  parseBusinessTreasuryQuoteBody,
} from "./playerBusinessTreasury.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000003";
const BUSINESS = `biz_${"a".repeat(32)}`;
const SOURCE_ACCOUNT = `bac_${"b".repeat(32)}`;
const TARGET_ACCOUNT = `bac_${"c".repeat(32)}`;
const QUOTE = `fxq_${"d".repeat(32)}`;
const ORDER = `fxo_${"e".repeat(32)}`;
const FIXING = `fxf_${"f".repeat(32)}`;
const IDEMPOTENCY = "business-treasury-test-0001";

Deno.test("Business treasury request parser accepts only canonical public intent", () => {
  assertEquals(
    parseBusinessTreasuryAccountOpenBody({
      currencyCode: " solv ",
      idempotencyKey: IDEMPOTENCY,
    }),
    {
      currencyCode: "SOLV",
      idempotencyKey: IDEMPOTENCY,
    },
  );
  assertEquals(
    parseBusinessTreasuryQuoteBody({
      sourceAccountKey: SOURCE_ACCOUNT.toUpperCase(),
      targetAccountKey: TARGET_ACCOUNT.toUpperCase(),
      targetCurrencyCode: "thd",
      sourceAmount: "123.450000",
      product: "STANDARD",
      idempotencyKey: IDEMPOTENCY,
    }),
    {
      sourceAccountKey: SOURCE_ACCOUNT,
      targetAccountKey: TARGET_ACCOUNT,
      targetCurrencyCode: "THD",
      sourceAmount: "123.45",
      product: "standard",
      idempotencyKey: IDEMPOTENCY,
    },
  );
  assertEquals(
    parseBusinessTreasuryConsumeBody({
      quoteKey: QUOTE.toUpperCase(),
      idempotencyKey: IDEMPOTENCY,
    }),
    { quoteKey: QUOTE, idempotencyKey: IDEMPOTENCY },
  );
  assertEquals(
    parseBusinessTreasuryQuoteBody({
      sourceAccountKey: SOURCE_ACCOUNT,
      targetCurrencyCode: "THD",
      sourceAmount: "99999999999999999999.123456789012345678",
      product: "instant",
      idempotencyKey: IDEMPOTENCY,
    }).sourceAmount,
    "99999999999999999999.123456789012345678",
  );
  assertEquals(
    parseBusinessTreasuryCancelBody({
      idempotencyKey: IDEMPOTENCY,
    }),
    { idempotencyKey: IDEMPOTENCY },
  );
});

Deno.test("Business treasury request parser rejects numeric money, UUIDs, and conflicting accounts", () => {
  for (
    const body of [
      {
        sourceAccountKey: SOURCE_ACCOUNT,
        targetCurrencyCode: "THD",
        sourceAmount: 1.25,
        product: "instant",
        idempotencyKey: IDEMPOTENCY,
      },
      {
        sourceAccountKey: GAME,
        targetCurrencyCode: "THD",
        sourceAmount: "1.25",
        product: "instant",
        idempotencyKey: IDEMPOTENCY,
      },
      {
        sourceAccountKey: SOURCE_ACCOUNT,
        targetAccountKey: SOURCE_ACCOUNT,
        targetCurrencyCode: "THD",
        sourceAmount: "1.25",
        product: "instant",
        idempotencyKey: IDEMPOTENCY,
      },
    ]
  ) {
    assertThrowsCode(
      () => parseBusinessTreasuryQuoteBody(body),
      "invalid_business_treasury_request",
    );
  }
});

Deno.test("Business treasury HTTP read consumes the exact authenticated application context once", async () => {
  const repository = new FakeTreasuryRepository();
  let injectedScopeResolverCalls = 0;
  const response = await handlePlayerBusinessRequest(
    request("GET", "/players/me/business/treasury"),
    { kind: "businessTreasuryRead" },
    dependencies(repository, () => {
      injectedScopeResolverCalls += 1;
      return Promise.reject(new Error("scope must not be re-resolved"));
    }),
    APPLICATION_CONTEXT,
  );

  assertEquals(response.status, 200);
  assertEquals(injectedScopeResolverCalls, 0);
  assertEquals(repository.calls[0], {
    command: "readSnapshot",
    input: { gameSessionId: GAME, playerId: PLAYER },
  });
  const body = await response.json();
  assertEquals(body, SNAPSHOT);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assertEquals(response.headers.get("vary")?.includes("Origin"), true);
  assertNoUuid(body);
});

Deno.test("Business treasury HTTP mutations preserve replay and committed-success semantics", async () => {
  const repository = new FakeTreasuryRepository();
  const cases = [
    {
      route: { kind: "businessTreasuryAccountOpen" } as const,
      path: "/players/me/business/treasury/accounts",
      body: { currencyCode: "THD", idempotencyKey: IDEMPOTENCY },
      status: 201,
      key: "account",
      value: ACCOUNT,
    },
    {
      route: { kind: "businessTreasuryFxQuote" } as const,
      path: "/players/me/business/treasury/fx/quotes",
      body: {
        sourceAccountKey: SOURCE_ACCOUNT,
        targetAccountKey: TARGET_ACCOUNT,
        targetCurrencyCode: "THD",
        sourceAmount: "12.345678901234567890",
        product: "standard",
        idempotencyKey: IDEMPOTENCY,
      },
      status: 201,
      key: "quote",
      value: QUOTE_DTO,
    },
    {
      route: { kind: "businessTreasuryFxStandard" } as const,
      path: "/players/me/business/treasury/fx/orders/standard",
      body: { quoteKey: QUOTE, idempotencyKey: IDEMPOTENCY },
      status: 202,
      key: "order",
      value: ORDER_DTO,
    },
    {
      route: { kind: "businessTreasuryFxInstant" } as const,
      path: "/players/me/business/treasury/fx/orders/instant",
      body: { quoteKey: QUOTE, idempotencyKey: IDEMPOTENCY },
      status: 201,
      key: "order",
      value: ORDER_DTO,
    },
    {
      route: {
        kind: "businessTreasuryFxCancel",
        orderKey: ORDER,
      } as const,
      path: `/players/me/business/treasury/fx/orders/${ORDER}/cancel`,
      body: { idempotencyKey: IDEMPOTENCY },
      status: 200,
      key: "order",
      value: ORDER_DTO,
    },
  ];

  for (const testCase of cases) {
    const response = await handlePlayerBusinessRequest(
      request("POST", testCase.path, testCase.body),
      testCase.route,
      dependencies(repository),
      APPLICATION_CONTEXT,
    );
    const body = await response.json();
    assertEquals(response.status, testCase.status);
    assertEquals(body.ok, true);
    assertEquals(body.outcome, "applied");
    assertEquals(body[testCase.key], testCase.value);
    assertEquals(body.refreshRequired, testCase.key !== "quote");
    assertNoUuid(body);
  }

  repository.outcome = "replayed";
  const replay = await handlePlayerBusinessRequest(
    request("POST", "/players/me/business/treasury/fx/orders/instant", {
      quoteKey: QUOTE,
      idempotencyKey: IDEMPOTENCY,
    }),
    { kind: "businessTreasuryFxInstant" },
    dependencies(repository),
    APPLICATION_CONTEXT,
  );
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).outcome, "replayed");

  repository.quoteError = new BusinessTreasuryError(
    "business_fx_same_currency_not_required",
    "Business FX requires different source and destination currencies.",
    409,
  );
  const rejected = await handlePlayerBusinessRequest(
    request("POST", "/players/me/business/treasury/fx/quotes", cases[1]?.body),
    { kind: "businessTreasuryFxQuote" },
    dependencies(repository),
    APPLICATION_CONTEXT,
  );
  const rejectedBody = await rejected.json();
  assertEquals(rejected.status, 409);
  assertEquals(
    rejectedBody.error.code,
    "business_fx_same_currency_not_required",
  );
});

Deno.test("Business treasury HTTP boundary rejects browser ownership scope before repository work", async () => {
  const repository = new FakeTreasuryRepository();
  const response = await handlePlayerBusinessRequest(
    request("POST", "/players/me/business/treasury/accounts", {
      currencyCode: "THD",
      idempotencyKey: IDEMPOTENCY,
      playerId: PLAYER,
    }),
    { kind: "businessTreasuryAccountOpen" },
    dependencies(repository),
    APPLICATION_CONTEXT,
  );
  assertEquals(response.status, 400);
  assertEquals(repository.calls.length, 0);
});

class FakeTreasuryRepository implements BusinessTreasuryRepositoryV1 {
  readonly calls: { readonly command: string; readonly input: unknown }[] = [];
  outcome: "applied" | "replayed" = "applied";
  quoteError: BusinessTreasuryError | null = null;

  readSnapshot(
    input: Parameters<BusinessTreasuryRepositoryV1["readSnapshot"]>[0],
  ) {
    this.calls.push({ command: "readSnapshot", input });
    return Promise.resolve(SNAPSHOT);
  }

  openCheckingAccount(
    input: Parameters<BusinessTreasuryRepositoryV1["openCheckingAccount"]>[0],
  ) {
    this.calls.push({ command: "openCheckingAccount", input });
    return Promise.resolve({ outcome: this.outcome, value: ACCOUNT });
  }

  createQuote(
    input: Parameters<BusinessTreasuryRepositoryV1["createQuote"]>[0],
  ) {
    this.calls.push({ command: "createQuote", input });
    if (this.quoteError) return Promise.reject(this.quoteError);
    return Promise.resolve({ outcome: this.outcome, value: QUOTE_DTO });
  }

  submitStandard(
    input: Parameters<BusinessTreasuryRepositoryV1["submitStandard"]>[0],
  ) {
    this.calls.push({ command: "submitStandard", input });
    return Promise.resolve({ outcome: this.outcome, value: ORDER_DTO });
  }

  executeInstant(
    input: Parameters<BusinessTreasuryRepositoryV1["executeInstant"]>[0],
  ) {
    this.calls.push({ command: "executeInstant", input });
    return Promise.resolve({ outcome: this.outcome, value: ORDER_DTO });
  }

  cancelStandard(
    input: Parameters<BusinessTreasuryRepositoryV1["cancelStandard"]>[0],
  ) {
    this.calls.push({ command: "cancelStandard", input });
    return Promise.resolve({ outcome: this.outcome, value: ORDER_DTO });
  }
}

const MONEY = Object.freeze({
  amount: "12.345678901234567890",
  currencyCode: "SOLV",
  precision: 18,
});
const TARGET_MONEY = Object.freeze({
  amount: "24.691357802469135780",
  currencyCode: "THD",
  precision: 18,
});
const ACCOUNT: BusinessTreasuryAccountV1 = Object.freeze({
  accountKey: SOURCE_ACCOUNT,
  accountKind: "checking",
  status: "active",
  currencyCode: "SOLV",
  precision: 18,
  posted: MONEY,
  held: { ...MONEY, amount: "0" },
  available: MONEY,
});
const QUOTE_DTO: BusinessTreasuryFxQuoteV1 = Object.freeze({
  quoteKey: QUOTE,
  product: "standard",
  sourceAccountKey: SOURCE_ACCOUNT,
  targetAccountKey: TARGET_ACCOUNT,
  sourceAmount: MONEY,
  referenceRate: "2.000000000000000000",
  customerRate: "1.990000000000000000",
  spreadRate: "0.005000000000000000",
  feeRate: "0.000000000000000000",
  feeAmount: { ...MONEY, amount: "0" },
  targetAmount: TARGET_MONEY,
  fixingKey: FIXING,
  policyVersion: "customer-fx-v1",
  expiresAt: "2026-08-31T00:03:00.000Z",
  settlesAt: "2026-09-01T08:00:00.000Z",
  requiresFx: true,
  roundingDisclosure: "Target credit is rounded to registry precision.",
});
const ORDER_DTO: BusinessTreasuryFxOrderV1 = Object.freeze({
  orderKey: ORDER,
  quoteKey: QUOTE,
  product: "standard",
  status: "pending",
  sourceAccountKey: SOURCE_ACCOUNT,
  targetAccountKey: TARGET_ACCOUNT,
  sourceAmount: MONEY,
  feeAmount: { ...MONEY, amount: "0" },
  targetAmount: TARGET_MONEY,
  referenceRate: "2.000000000000000000",
  customerRate: "1.990000000000000000",
  spreadRate: "0.005000000000000000",
  feeRate: "0.000000000000000000",
  fixingKey: FIXING,
  submittedAt: "2026-08-31T00:00:00.000Z",
  settlesAt: "2026-09-01T08:00:00.000Z",
  completedAt: null,
  receiptKey: null,
});
const SNAPSHOT: BusinessTreasurySnapshotV1 = Object.freeze({
  businessKey: BUSINESS,
  reportingCurrencyCode: "SOLV",
  generatedAt: "2026-08-31T00:00:00.000Z",
  accounts: Object.freeze([ACCOUNT]),
  rates: Object.freeze([]),
  orders: Object.freeze([ORDER_DTO]),
  receipts: Object.freeze([]),
});

const APPLICATION_CONTEXT = createPlayerRequestApplicationContext({
  scope: {
    gameId: GAME,
    playerUuid: PLAYER,
    activeSessionId: SESSION,
    sessionValid: true,
    sessionExpiresAt: "2026-08-31T01:00:00.000Z",
    authorizationContext: {
      actorType: "player",
      source: "player_session",
      gameScope: "session",
      resourceScope: "own_player",
    },
  },
  requestId: "business-treasury-request-0001",
});

function dependencies(
  repository: FakeTreasuryRepository,
  resolveScope = () => Promise.reject(new Error("unexpected scope resolution")),
) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope,
    createTreasuryRepository: () => repository,
  };
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "session-token",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function assertThrowsCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as { readonly code?: string }).code, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) throw new Error(`Internal UUID leaked: ${serialized}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
