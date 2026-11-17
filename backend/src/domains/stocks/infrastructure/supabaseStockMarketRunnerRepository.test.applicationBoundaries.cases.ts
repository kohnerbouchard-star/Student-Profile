import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import {
  assertEquals,
  assertRejectsWithCode,
  FakeSupabaseClient,
  GAME_SESSION_ID,
} from "./supabaseStockMarketRunnerRepository.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock runner apply empty result and missing game stop at their original boundaries", async () => {
  const client = new FakeSupabaseClient({});
  const repository = new SupabaseStockMarketRunnerRepository(client as any);
  await assertRejectsWithCode(
    () => repository.load({ gameSessionId: GAME_SESSION_ID }),
    "game_session_not_found",
  );
  assertEquals(client.operations, ["read:game_sessions"]);
  await assertRejectsWithCode(
    () =>
      repository.apply({
        gameSessionId: GAME_SESSION_ID,
        tickIndex: 1,
        assetUpdates: [],
        tickRows: [],
      }),
    "stock_market_tick_apply_failed",
  );
});
