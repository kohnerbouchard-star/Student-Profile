import {
  handleStockMarketReadRequest,
} from "./stockMarketReadHttpHandler.ts";
import type { StockMarketReadRepository } from "../contracts/stockMarketReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = "runner-secret";

Deno.test("stock market read rejects non-POST requests", async () => {
  const response = await handleStockMarketReadRequest(
    new Request("https://example.test/stock-market-read", { method: "GET" }),
    dependencies(),
  );

  assertEquals(response.status, 405);
});

Deno.test("stock market read rejects missing configured secret", async () => {
  const response = await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );

  assertEquals(response.status, 500);
});

Deno.test("stock market read rejects missing or invalid request secret", async () => {
  const missing = await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    dependencies(),
  );
  const invalid = await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID }, "wrong"),
    dependencies(),
  );

  assertEquals(missing.status, 401);
  assertEquals(invalid.status, 401);
});

Deno.test("stock market read rejects missing gameSessionId and multiple-session shape", async () => {
  const missing = await handleStockMarketReadRequest(request({}, SECRET), dependencies());
  const multiple = await handleStockMarketReadRequest(
    request({ gameSessionIds: [GAME_SESSION_ID] }, SECRET),
    dependencies(),
  );

  assertEquals(missing.status, 400);
  assertEquals(multiple.status, 400);
});

Deno.test("stock market read defaults board history off and ticker history on", async () => {
  const repository = new MockReadRepository();
  await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({ repository }),
  );
  await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID, ticker: "aura" }, SECRET),
    dependencies({ repository }),
  );

  assertEquals(repository.inputs[0].includeHistory, false);
  assertEquals(repository.inputs[1].ticker, "AURA");
  assertEquals(repository.inputs[1].includeHistory, true);
});

Deno.test("stock market read caps history limit and returns success shape", async () => {
  const repository = new MockReadRepository();
  const response = await handleStockMarketReadRequest(
    request({ gameSessionId: GAME_SESSION_ID, ticker: "AURA", historyLimit: 5000 }, SECRET),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs[0].historyLimit, 1000);
  assertEquals(body.ok, true);
  assertEquals(body.gameSessionId, GAME_SESSION_ID);
  assertEquals(body.ticker, "AURA");
  assertEquals(body.history.length, 1);
});

function dependencies(options: {
  readonly repository?: StockMarketReadRepository;
  readonly readRunnerSecret?: () => string | undefined;
} = {}) {
  const repository = options.repository ?? new MockReadRepository();

  return {
    createServiceClient: () => ({}) as any,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    readRunnerSecret: options.readRunnerSecret ?? (() => SECRET),
    createRepository: () => repository,
  };
}

function request(body: unknown, secret?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (secret) {
    headers.set("x-stock-market-runner-secret", secret);
  }

  return new Request("https://example.test/stock-market-read", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

class MockReadRepository implements StockMarketReadRepository {
  readonly inputs: {
    readonly gameSessionId: string;
    readonly ticker?: string;
    readonly includeHistory: boolean;
    readonly historyLimit: number;
  }[] = [];

  async read(input: {
    readonly gameSessionId: string;
    readonly ticker?: string;
    readonly includeHistory: boolean;
    readonly historyLimit: number;
  }) {
    this.inputs.push(input);

    return {
      gameSessionId: input.gameSessionId,
      ticker: input.ticker,
      tickIndex: 1,
      stocks: [],
      stock: input.ticker ? null : undefined,
      history: input.includeHistory
        ? [{ tickIndex: 0, price: 100, previousPrice: 100, changePct: 0, volume: 0, createdAt: "tick-0" }]
        : undefined,
    };
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
