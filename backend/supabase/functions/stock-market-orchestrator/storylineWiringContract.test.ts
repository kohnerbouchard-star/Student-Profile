import { createStorylineRunnerAfterTick } from "../stock-market-runner/storylineRunnerAfterTick.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const ORCHESTRATOR = new URL("./index.ts", import.meta.url);
const STORY_HOOK = new URL("../stock-market-runner/storylineRunnerAfterTick.ts", import.meta.url);

Deno.test("scheduled stock orchestrator uses the canonical Stage 5+ Story hook", async () => {
  const source = await Deno.readTextFile(ORCHESTRATOR);

  for (const required of [
    'from "../stock-market-runner/storylineRunnerAfterTick.ts"',
    "createStorylineRunnerAfterTick,",
    "readRunnerSecret: () => internalSecret",
    "logStorylineRunnerFailure:",
  ]) {
    assertIncludes(source, required);
  }
});

Deno.test("canonical Story hook carries market news, override, World, and FX dependencies", async () => {
  const source = await Deno.readTextFile(STORY_HOOK);

  for (const required of [
    "withOptionalStoryEventOverrideReads",
    "StockMarketStoryNewsWriter",
    "SupabaseStoryWorldFxWriter",
    "marketNews,",
    "world: worldFx",
    "currency: worldFx",
  ]) {
    assertIncludes(source, required);
  }
});

Deno.test("canonical Story hook reads contexts lazily and prevents effects after a failed read", async () => {
  const reads: string[] = [];
  const failure = new Error("context transport unavailable");
  const hook = createStorylineRunnerAfterTick({
    from(table: string) { reads.push(table); throw failure; },
    rpc() { throw new Error("Story effects must not start after a failed context read."); },
  } as never);
  if (reads.length !== 0) throw new Error("Context reads must be lazy.");
  let observed: unknown;
  try {
    await hook({ gameSessionId: "game-1", currentMarketTick: 4, generatedAt: "2026-11-01T00:00:00Z" });
  } catch (error) {
    observed = error;
  }
  if (observed !== failure) throw new Error("The original context failure must propagate.");
  const expected = [
    "players", "player_country_assignments", "account_balances",
    "game_session_stock_assets", "stock_holdings", "game_session_contracts",
    "player_contract_progress", "player_story_relationships", "game_session_story_flags",
  ];
  if (JSON.stringify(reads) !== JSON.stringify(expected)) {
    throw new Error("Failed context reads must prevent all Story effect reads and writes.");
  }
});

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Missing scheduled Story wiring contract: ${expected}`);
  }
}
