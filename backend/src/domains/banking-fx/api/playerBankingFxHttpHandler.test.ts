import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestApplicationContext } from "../../players/api/playerRequestScope.ts";
import {
  PlayerBankingFxError,
  type PlayerBankingFxRepository,
} from "../contracts/playerBankingFxContracts.ts";
import { handlePlayerBankingFxRequest } from "./playerBankingFxHttpHandler.ts";
import { encodePlayerBankingFxCursor } from "./playerBankingFxRequestParser.ts";
import { readPlayerBankingFxRoutePath } from "./playerBankingFxRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const SESSION = "00000000-0000-4000-8000-000000000011";
const ACCOUNT = `bac_${"a".repeat(32)}`;
const TARGET_ACCOUNT = `bac_${"b".repeat(32)}`;
const QUOTE = `fxq_${"c".repeat(32)}`;
const ORDER = `fxo_${"d".repeat(32)}`;
const RECEIPT = `fxr_${"e".repeat(32)}`;
const FIXING = `fxf_${"f".repeat(32)}`;
const HISTORY_CURSOR = encodePlayerBankingFxCursor(
  "2026-08-27T00:00:00.000Z",
  FIXING,
);
const HISTORY_NEXT_CURSOR = encodePlayerBankingFxCursor(
  "2026-08-26T00:00:00.000Z",
  FIXING,
);

Deno.test("Player Banking FX overview returns only public hold-aware projections", async () => {
  const repository = new FixtureRepository();
  const response = await invoke(
    request("GET", "/players/me/banking/fx"),
    repository,
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assertEquals(body.generatedAt, "2026-08-26T00:00:00.000Z");
  assertEquals(body.accounts, [BANK_ACCOUNT]);
  assertEquals(body.balances, [BANK_ACCOUNT]);
  assertEquals(body.currencies, FX_CURRENCIES);
  assertEquals(body.fixing, FX_FIXING);
  assertEquals(body.pendingOrders, [FX_ORDER]);
  assertEquals(body.completedOrders, []);
  assertEquals(repository.overviewScopes, [{
    gameSessionId: GAME,
    playerId: PLAYER,
  }]);
  assertNoUuid(body);
});

Deno.test("Player Banking FX history and orders parse bounded filters and cursors", async () => {
  const repository = new FixtureRepository();
  const historyResponse = await invoke(
    request(
      "GET",
      `/players/me/banking/fx/history?sourceCurrencyCode=eco&targetCurrencyCode=nrc&range=30d&limit=1&cursor=${
        encodeURIComponent(HISTORY_CURSOR)
      }`,
    ),
    repository,
  );
  const history = await historyResponse.json();
  assertEquals(historyResponse.status, 200);
  assertEquals(repository.historyInputs[0], {
    gameSessionId: GAME,
    playerId: PLAYER,
    sourceCurrencyCode: "ECO",
    targetCurrencyCode: "NRC",
    range: "30d",
    limit: 1,
    cursor: HISTORY_CURSOR,
    beforeAt: "2026-08-27T00:00:00.000Z",
    beforeKey: FIXING,
  });
  assertEquals(history.points, [FX_HISTORY]);
  assertEquals(history.pagination, {
    cursor: HISTORY_CURSOR,
    limit: 1,
    hasMore: true,
    nextCursor: HISTORY_NEXT_CURSOR,
  });

  const ordersResponse = await invoke(
    request("GET", "/players/me/banking/fx/orders?status=pending&limit=10"),
    repository,
  );
  const orders = await ordersResponse.json();
  assertEquals(ordersResponse.status, 200);
  assertEquals(repository.ordersInputs[0], {
    gameSessionId: GAME,
    playerId: PLAYER,
    status: "pending",
    limit: 10,
    cursor: null,
    beforeAt: null,
    beforeKey: null,
  });
  assertEquals(orders.orders, [FX_ORDER]);
  assertNoUuid(history);
  assertNoUuid(orders);
});

Deno.test("Player Banking FX mutations forward canonical public intent and server scope", async () => {
  const repository = new FixtureRepository();
  const quoteResponse = await invoke(
    request("POST", "/players/me/banking/fx/quotes", {
      sourceAccountKey: ACCOUNT.toUpperCase(),
      targetCurrencyCode: "nrc",
      sourceAmount: "100.500000000000000001",
      product: "standard",
      idempotencyKey: "fx-quote-request-001",
    }),
    repository,
  );
  assertEquals(quoteResponse.status, 201);
  assertEquals(repository.quoteInputs[0], {
    gameSessionId: GAME,
    playerId: PLAYER,
    sourceAccountKey: ACCOUNT,
    targetCurrencyCode: "NRC",
    sourceAmount: "100.500000000000000001",
    product: "standard",
    idempotencyKey: "fx-quote-request-001",
  });
  assertEquals((await quoteResponse.json()).quote, FX_QUOTE);

  for (
    const testCase of [
      {
        path: "/players/me/banking/fx/orders/standard",
        expectedStatus: 202,
        inputs: repository.standardInputs,
      },
      {
        path: "/players/me/banking/fx/orders/instant",
        expectedStatus: 201,
        inputs: repository.instantInputs,
      },
    ]
  ) {
    const response = await invoke(
      request("POST", testCase.path, {
        quoteKey: QUOTE,
        idempotencyKey: "fx-consume-request-001",
      }),
      repository,
    );
    assertEquals(response.status, testCase.expectedStatus);
    assertEquals(testCase.inputs[0], {
      gameSessionId: GAME,
      playerId: PLAYER,
      quoteKey: QUOTE,
      idempotencyKey: "fx-consume-request-001",
    });
    assertEquals((await response.json()).order, FX_ORDER);
  }

  const cancelResponse = await invoke(
    request("POST", `/players/me/banking/fx/orders/${ORDER}/cancel`, {
      idempotencyKey: "fx-cancel-request-001",
    }),
    repository,
  );
  assertEquals(cancelResponse.status, 200);
  assertEquals(repository.cancelInputs[0], {
    gameSessionId: GAME,
    playerId: PLAYER,
    orderKey: ORDER,
    idempotencyKey: "fx-cancel-request-001",
  });
  assertNoUuid(await cancelResponse.json());
});

Deno.test("Player Banking FX rejects malformed methods, identity, query, and JSON before repository access", async () => {
  const repository = new FixtureRepository();
  const cases = [
    request("POST", "/players/me/banking/fx", {}),
    request("GET", "/players/me/banking/fx?gameSessionId=unsafe"),
    request("GET", "/players/me/banking/fx/history?sourceCurrencyCode=ECO"),
    request("GET", "/players/me/banking/fx/orders?status=unsafe"),
    request("GET", "/players/me/banking/fx/orders?cursor=offset_1000001"),
    request("POST", "/players/me/banking/fx/quotes?debug=1", quoteBody()),
    request("POST", "/players/me/banking/fx/quotes", {
      ...quoteBody(),
      playerId: PLAYER,
    }),
    request("POST", "/players/me/banking/fx/orders/standard", {
      quoteKey: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "fx-consume-request-001",
    }),
    request("POST", "/players/me/banking/fx/quotes", {
      ...quoteBody(),
      sourceAmount: "0.0000000000000000001",
    }),
    request("POST", "/players/me/banking/fx/quotes", {
      ...quoteBody(),
      sourceAmount: 100,
    }),
    request(
      "GET",
      "/players/me/banking/fx",
      undefined,
      { "x-player-id": PLAYER },
    ),
    request("GET", "/players/me/banking/fx/private"),
  ];
  for (const candidate of cases) {
    const response = await invoke(candidate, repository);
    const body = await response.json();
    assertEquals([400, 405].includes(response.status), true);
    assertEquals(
      ["invalid_player_banking_fx_request", "method_not_allowed"].includes(
        body.error.code,
      ),
      true,
    );
    assertNoUuid(body);
  }
  assertEquals(repository.callCount(), 0);
});

Deno.test("Player Banking FX preserves reviewed economic error contracts", async () => {
  const repository = new FixtureRepository();
  repository.createQuote = () =>
    Promise.reject(
      new PlayerBankingFxError(
        "FX_LIQUIDITY_UNAVAILABLE",
        "FX liquidity is currently unavailable.",
        409,
        true,
      ),
    );
  const response = await invoke(
    request("POST", "/players/me/banking/fx/quotes", quoteBody()),
    repository,
  );
  const body = await response.json();
  assertEquals(response.status, 409);
  assertEquals(body.error, {
    code: "FX_LIQUIDITY_UNAVAILABLE",
    message: "FX liquidity is currently unavailable.",
    retryable: true,
  });
});

class FixtureRepository implements PlayerBankingFxRepository {
  readonly overviewScopes: unknown[] = [];
  readonly historyInputs: unknown[] = [];
  readonly ordersInputs: unknown[] = [];
  readonly quoteInputs: unknown[] = [];
  readonly standardInputs: unknown[] = [];
  readonly instantInputs: unknown[] = [];
  readonly cancelInputs: unknown[] = [];

  readOverview(scope: any) {
    this.overviewScopes.push(scope);
    return Promise.resolve({
      accounts: [BANK_ACCOUNT],
      currencies: FX_CURRENCIES,
      fixing: FX_FIXING,
      pendingOrders: [FX_ORDER],
      completedOrders: [],
    });
  }

  listHistory(input: any) {
    this.historyInputs.push(input);
    return Promise.resolve({ items: [FX_HISTORY], hasMore: true });
  }

  listOrders(input: any) {
    this.ordersInputs.push(input);
    return Promise.resolve({ items: [FX_ORDER], hasMore: false });
  }

  createQuote(input: any): Promise<any> {
    this.quoteInputs.push(input);
    return Promise.resolve({ outcome: "applied", value: FX_QUOTE });
  }

  submitStandard(input: any) {
    this.standardInputs.push(input);
    return Promise.resolve({ outcome: "applied" as const, value: FX_ORDER });
  }

  executeInstant(input: any) {
    this.instantInputs.push(input);
    return Promise.resolve({ outcome: "applied" as const, value: FX_ORDER });
  }

  cancelStandard(input: any) {
    this.cancelInputs.push(input);
    return Promise.resolve({ outcome: "replayed" as const, value: FX_ORDER });
  }

  callCount(): number {
    return [
      this.overviewScopes,
      this.historyInputs,
      this.ordersInputs,
      this.quoteInputs,
      this.standardInputs,
      this.instantInputs,
      this.cancelInputs,
    ].reduce((sum, inputs) => sum + inputs.length, 0);
  }
}

const BANK_ACCOUNT = {
  accountKey: ACCOUNT,
  accountKind: "checking",
  accountType: "checking",
  balance: 1000,
  currencyCode: "ECO",
  postedAmount: 1000,
  heldAmount: 100,
  availableAmount: 900,
};

const FX_FIXING = {
  fixingKey: FIXING,
  effectiveAt: "2026-08-26T00:00:00.000Z",
  calculatedAt: "2026-08-26T00:00:01.000Z",
  nextFixingAt: "2026-08-27T00:00:00.000Z",
  overdue: false,
  policyVersion: "fx-policy-v1",
};

const FX_CURRENCIES = [
  { currencyCode: "ECO", minorUnit: 2 },
  { currencyCode: "NRC", minorUnit: 2 },
];

const FX_QUOTE = {
  quoteKey: QUOTE,
  product: "standard" as const,
  sourceAccountKey: ACCOUNT,
  targetAccountKey: TARGET_ACCOUNT,
  sourceCurrencyCode: "ECO",
  targetCurrencyCode: "NRC",
  sourceMinorUnit: 2,
  targetMinorUnit: 2,
  sourceAmountMode: "source_debit" as const,
  sourceAmount: "100.5",
  referenceRate: "1.2",
  customerRate: "1.194",
  spreadRate: "0.005",
  feeAmount: "0",
  targetAmount: "119.99",
  fixingKey: FIXING,
  policyVersion: "fx-policy-v1",
  expiresAt: "2026-08-26T00:02:00.000Z",
  settlesAt: "2026-08-27T00:00:00.000Z",
  requiresFx: true,
  roundingDisclosure: "Target credit is rounded once to NRC minor units.",
};

const FX_ORDER = {
  orderKey: ORDER,
  quoteKey: QUOTE,
  product: "standard" as const,
  status: "pending",
  sourceCurrencyCode: "ECO",
  targetCurrencyCode: "NRC",
  sourceAmount: "100.5",
  feeAmount: "0",
  targetAmount: "119.99",
  submittedAt: "2026-08-26T00:00:20.000Z",
  settlesAt: "2026-08-27T00:00:00.000Z",
  completedAt: null,
  receiptKey: RECEIPT,
};

const FX_HISTORY = {
  fixingKey: FIXING,
  effectiveAt: "2026-08-26T00:00:00.000Z",
  sourceCurrencyCode: "ECO",
  targetCurrencyCode: "NRC",
  referenceRate: "1.2",
};

function quoteBody() {
  return {
    sourceAccountKey: ACCOUNT,
    targetCurrencyCode: "NRC",
    sourceAmount: "100",
    product: "instant",
    idempotencyKey: "fx-quote-request-001",
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers = new Headers({
    "x-player-session-token": "player-session-secret",
    ...extraHeaders,
  });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

function invoke(
  candidate: Request,
  repository: PlayerBankingFxRepository,
): Promise<Response> {
  const route = readPlayerBankingFxRoutePath(new URL(candidate.url).pathname);
  if (!route) {
    throw new Error("Test path did not resolve to Player Banking FX.");
  }
  return handlePlayerBankingFxRequest(candidate, route, {
    createServiceClient: () => ({}) as EdgeSupabaseClient,
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    createRepository: () => repository,
    now: () => new Date("2026-08-26T00:00:00.000Z"),
  }, APPLICATION_CONTEXT);
}

const APPLICATION_CONTEXT = Object.freeze({
  gameSessionId: GAME,
  actor: Object.freeze({
    kind: "player" as const,
    playerUuid: PLAYER,
    playerSessionId: SESSION,
  }),
}) as PlayerRequestApplicationContext;

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu
      .test(serialized)
  ) {
    throw new Error(
      `Player FX response leaked an internal UUID: ${serialized}`,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
