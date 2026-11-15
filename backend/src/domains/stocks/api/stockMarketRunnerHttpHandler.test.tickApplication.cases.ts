import { runStockMarketRunner } from "../application/runStockMarketRunner.ts";
import { handleStockMarketRunnerRequest } from "./stockMarketRunnerHttpHandler.ts";
import type { StockMarketEngineInput } from "../contracts/stockMarketEngineContracts.ts";
import {
  assertEquals,
  ASSET_ID,
  dependencies,
  engineResult,
  GAME_SESSION_ID,
  MockRunnerRepository,
  request,
  SECRET,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("stock market runner derives the default seed from one game session", async () => {
  const engineInputs: StockMarketEngineInput[] = [];
  const repository = new MockRunnerRepository();
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({
      repository,
      calculateNextTick: (input) => {
        engineInputs.push(input);
        return engineResult(input);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.loadedGameSessionIds, [GAME_SESSION_ID]);
  assertEquals(engineInputs.length, 1);
  assertEquals(
    engineInputs[0].seed,
    `stock-market-runner-v1:${GAME_SESSION_ID}`,
  );
});

Deno.test("stock tick application preserves loaded identity and commit-before-publish order", async () => {
  const initial = await new MockRunnerRepository().load({ gameSessionId: GAME_SESSION_ID, tickIndex: 7 });
  const loaded = { ...initial, assets: initial.assets.map(a => ({ ...a, recentReturns: Array.from({ length: 31 }, (_, i) => i / 100) })) };
  const stages: string[] = [];
  let payload: any;
  const result = await runStockMarketRunner({ gameSessionId: GAME_SESSION_ID, tickIndex: 7, seed: "  fixed  " }, {
    repository: {
      async load(input) { assertEquals(input, { gameSessionId: GAME_SESSION_ID, tickIndex: 7 }); stages.push("load"); return loaded; },
      async apply(value) { stages.push("apply"); payload = value; return { assetsUpdated: 1, ticksInserted: 1 }; },
    },
    calculateNextTick(input) {
      stages.push("calculate"); assertEquals(input.seed, "fixed");
      for (const key of ["assets", "macro", "countries", "sectors", "shocks"] as const) {
        if (input[key] !== loaded[key]) throw new Error(`Loaded ${key} identity changed`);
      }
      return engineResult(input);
    },
    publicRealtimePublisher: { async publish(envelope) {
      stages.push("publish"); assertEquals(payload.tickIndex, 7); assertEquals(envelope.eventType, "stock_tick");
      return { ok: true, message: { channel: envelope.channel, event: envelope.eventType, payload: envelope } };
    } },
  });
  assertEquals(stages, ["load", "calculate", "apply", "publish"]);
  assertEquals(result, { gameSessionId: GAME_SESSION_ID, tickIndex: 7, assetsProcessed: 1, ticksInserted: 1, generatedAt: "tick-7" });
  assertEquals(payload.assetUpdates[0].recent_returns, [...loaded.assets[0].recentReturns, 0.05].slice(-30));
  assertEquals(payload.tickRows[0].game_session_id, GAME_SESSION_ID);
  assertEquals(payload.tickRows[0].stock_asset_id, ASSET_ID);
});

for (const failAt of ["load", "calculate", "apply"]) {
  Deno.test(`stock tick application stops after ${failAt} failure without publication`, async () => {
    const stages: string[] = [], failure = new Error(`synthetic ${failAt}`);
    const stage = (name: string) => { stages.push(name); if (failAt === name) throw failure; };
    let caught: any;
    try {
      await runStockMarketRunner({ gameSessionId: GAME_SESSION_ID }, {
        repository: {
          async load(input) { stage("load"); return await new MockRunnerRepository().load(input); },
          async apply() { stage("apply"); return { assetsUpdated: 1, ticksInserted: 1 }; },
        },
        calculateNextTick(input) { stage("calculate"); return engineResult(input); },
        publicRealtimePublisher: { async publish() { throw new Error("Must not publish"); } },
      });
    } catch (error) { caught = error; }
    assertEquals(stages, ["load", "calculate", "apply"].slice(0, ["load", "calculate", "apply"].indexOf(failAt) + 1));
    if (failAt === "calculate") {
      assertEquals(caught?.code, "stock_market_engine_failed"); assertEquals(caught?.status, 500); assertEquals(caught?.message, failure.message);
    } else if (caught !== failure) throw new Error("Repository failure identity changed");
  });
}
