import {
  handleStockMarketSeedCopyRequest,
} from "./stockMarketSeedCopyHttpHandler.ts";
import type {
  StockMarketSeedCopyRepository,
} from "../contracts/stockMarketSeedCopyContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = "runner-secret";

Deno.test("stock seed copy rejects non-POST requests", async () => {
  const response = await handleStockMarketSeedCopyRequest(
    new Request("https://example.test/stock-market-seed-copy", { method: "GET" }),
    dependencies(),
  );

  assertEquals(response.status, 405);
});

Deno.test("stock seed copy rejects missing configured secret", async () => {
  const response = await handleStockMarketSeedCopyRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_runner_secret_not_configured");
});

Deno.test("stock seed copy rejects missing or invalid request secret", async () => {
  const missing = await handleStockMarketSeedCopyRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    dependencies(),
  );
  const invalid = await handleStockMarketSeedCopyRequest(
    request({ gameSessionId: GAME_SESSION_ID }, "wrong"),
    dependencies(),
  );

  assertEquals(missing.status, 401);
  assertEquals(invalid.status, 401);
});

Deno.test("stock seed copy rejects missing gameSessionId and multiple-session shape", async () => {
  const missing = await handleStockMarketSeedCopyRequest(request({}, SECRET), dependencies());
  const multiple = await handleStockMarketSeedCopyRequest(
    request({ gameSessionIds: [GAME_SESSION_ID] }, SECRET),
    dependencies(),
  );

  assertEquals(missing.status, 400);
  assertEquals(multiple.status, 400);
});

Deno.test("stock seed copy defaults mode to missing_only", async () => {
  const repository = new MockRepository();
  const response = await handleStockMarketSeedCopyRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({ repository }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.inputs[0], {
    gameSessionId: GAME_SESSION_ID,
    mode: "missing_only",
  });
});

Deno.test("stock seed copy returns success response shape", async () => {
  const response = await handleStockMarketSeedCopyRequest(
    request({ gameSessionId: GAME_SESSION_ID, mode: "reset_empty_only" }, SECRET),
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    gameSessionId: GAME_SESSION_ID,
    templatesAvailable: 20,
    assetsBefore: 0,
    assetsInserted: 20,
    baselineTicksInserted: 20,
    assetsAfter: 20,
  });
});

function dependencies(options: {
  readonly repository?: StockMarketSeedCopyRepository;
  readonly readRunnerSecret?: () => string | undefined;
} = {}) {
  const repository = options.repository ?? new MockRepository();

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

  return new Request("https://example.test/stock-market-seed-copy", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

class MockRepository implements StockMarketSeedCopyRepository {
  readonly inputs: { readonly gameSessionId: string; readonly mode: string }[] = [];

  async initialize(input: { readonly gameSessionId: string; readonly mode: "missing_only" | "reset_empty_only" }) {
    this.inputs.push(input);

    return {
      gameSessionId: input.gameSessionId,
      templatesAvailable: 20,
      assetsBefore: 0,
      assetsInserted: 20,
      baselineTicksInserted: 20,
      assetsAfter: 20,
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
