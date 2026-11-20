import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import { StockMarketRunnerError } from "../contracts/stockMarketRunnerContracts.ts";
import {
  assertEquals,
  FakeSupabaseClient,
  GAME_SESSION_ID,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

for (
  const [error, code] of [
    [
      { code: "42P01", message: "STOCK_TICK_ALREADY_EXISTS" },
      "stock_market_schema_not_applied",
    ],
    [{ message: "stock_tick_already_exists" }, "stock_tick_already_exists"],
    [{ message: "private database detail" }, "stock_market_tick_apply_failed"],
  ] as const
) {
  Deno.test(`stock runner persistence error retains precedence and safe message for ${code}`, async () => {
    const client = new FakeSupabaseClient({});
    client.rpcError = error;
    let caught: unknown;
    try {
      await new SupabaseStockMarketRunnerRepository(client as any).apply({
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 1,
        assetUpdates: [],
        tickRows: [],
      });
    } catch (failure) {
      caught = failure;
    }
    if (!(caught instanceof StockMarketRunnerError)) {
      throw new Error("Expected domain error");
    }
    assertEquals(caught.code, code);
    assertEquals(
      caught.status,
      code === "stock_tick_already_exists" ? 409 : 500,
    );
    assertEquals(
      caught.message,
      {
        stock_market_schema_not_applied:
          "Stock market runner schema is not applied.",
        stock_tick_already_exists:
          "A stock price tick already exists for this game session and tick index.",
        stock_market_tick_apply_failed:
          "Stock market tick could not be persisted.",
      }[code],
    );
    assertEquals(client.rpcCalls.length, 1);
  });
}
