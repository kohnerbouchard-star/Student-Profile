import {
  SupabaseStockMarketSeedCopyRepository,
} from "./supabaseStockMarketSeedCopyRepository.ts";
import { StockMarketSeedCopyError } from "../contracts/stockMarketSeedCopyContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

Deno.test("stock seed copy repository calls initialize RPC for one game session", async () => {
  const client = new FakeClient({
    game_session_id: GAME_SESSION_ID,
    templates_available: 20,
    assets_before: 0,
    assets_inserted: 20,
    baseline_ticks_inserted: 20,
    assets_after: 20,
  });
  const repository = new SupabaseStockMarketSeedCopyRepository(client as any);
  const result = await repository.initialize({
    gameSessionId: GAME_SESSION_ID,
    mode: "missing_only",
  });

  assertEquals(client.calls[0].functionName, "initialize_stock_market_assets_for_game");
  assertEquals(client.calls[0].args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.calls[0].args.p_mode, "missing_only");
  assertEquals(result, {
    gameSessionId: GAME_SESSION_ID,
    templatesAvailable: 20,
    assetsBefore: 0,
    assetsInserted: 20,
    baselineTicksInserted: 20,
    assetsAfter: 20,
  });
});

Deno.test("stock seed copy repository maps missing game session to 404", async () => {
  await assertRejectsWithCode(
    () => new SupabaseStockMarketSeedCopyRepository(
      new FakeClient(null, { message: "GAME_SESSION_NOT_FOUND" }) as any,
    ).initialize({ gameSessionId: GAME_SESSION_ID, mode: "missing_only" }),
    "game_session_not_found",
  );
});

Deno.test("stock seed copy repository maps already initialized conflicts to 409", async () => {
  await assertRejectsWithCode(
    () => new SupabaseStockMarketSeedCopyRepository(
      new FakeClient(null, { message: "STOCK_MARKET_RESET_EMPTY_ONLY_CONFLICT" }) as any,
    ).initialize({ gameSessionId: GAME_SESSION_ID, mode: "reset_empty_only" }),
    "stock_market_already_initialized",
  );
});

Deno.test("stock seed copy repository maps missing schema to schema-not-applied", async () => {
  await assertRejectsWithCode(
    () => new SupabaseStockMarketSeedCopyRepository(
      new FakeClient(null, {
        code: "42P01",
        message: "relation initialize_stock_market_assets_for_game does not exist",
      }) as any,
    ).initialize({ gameSessionId: GAME_SESSION_ID, mode: "missing_only" }),
    "stock_market_schema_not_applied",
  );
});

async function assertRejectsWithCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketSeedCopyError) {
      assertEquals(error.code, code);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketSeedCopyError with code ${code}.`);
}

class FakeClient {
  readonly calls: { readonly functionName: string; readonly args: any }[] = [];

  constructor(
    private readonly row: Record<string, unknown> | null,
    private readonly error: { readonly code?: string; readonly message: string } | null = null,
  ) {}

  async rpc(functionName: string, args: any) {
    this.calls.push({ functionName, args });

    return {
      data: this.row ? [this.row] : null,
      error: this.error,
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
