export {};

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

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Missing scheduled Story wiring contract: ${expected}`);
  }
}
