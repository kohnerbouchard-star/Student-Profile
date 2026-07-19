import {
  readStockMarketOpenState,
} from "./supabaseStockMarketWindowRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market status is evaluated with game scope and server time", async () => {
  const client = new FakeClient(true);
  const at = new Date("2026-07-20T00:00:00.000Z");
  const result = await readStockMarketOpenState(client, "game-1", at);

  assertEquals(result, true);
  assertEquals(client.calls, [{
    functionName: "is_stock_market_open_at",
    args: {
      p_game_session_id: "game-1",
      p_at: at.toISOString(),
    },
  }]);
});

class FakeClient {
  readonly calls: unknown[] = [];

  constructor(private readonly result: boolean) {}

  async rpc<T = unknown>(functionName: string, args: unknown): Promise<{
    data: T | null;
    error: null;
  }> {
    this.calls.push({ functionName, args });
    return { data: this.result as T, error: null };
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
