import { parseStoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectExecutionDependencies,
  StoryMarketNewsWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import { executeStoryEffect } from "./storyEffectEngine.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story market news effect writes one game-scoped deterministic shock identity", async () => {
  const writes: StoryMarketNewsWriteInput[] = [];
  const dependencies = fakeDependencies(writes);

  const result = await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-customs-intrusion",
    effectIndex: 7,
    now: "2026-08-12T00:00:00.000Z",
    playerContext: {
      playerId: "player-1",
      gameSessionId: "game-1",
      homeCountryId: null,
      homeCountryCode: null,
      currentCountryId: null,
      currentCountryCode: "YRETHIA",
      cashBalance: 100,
      resources: {},
      sectorExposurePct: {},
      countryExposurePct: {},
      activeContractKeys: [],
      completedContractKeys: [],
      storyFlags: {},
    },
    dependencies,
    effect: parseStoryEffect({
      type: "market_news_post",
      payload: {
        shockKey: "meridian-customs-security-intrusion-v1",
        headline: "Meridian verification records diverge",
        explanation: "Cargo and payment records no longer reconcile reliably.",
        category: "supply_chain",
        scope: "global",
        sentiment: "negative",
        impactStrength: "medium",
        durationTicks: 5,
      },
    }),
  });

  assertEquals(result.status, "applied");
  assertEquals(result.playerId, null);
  assertEquals(writes.length, 1);
  assertEquals(writes[0]?.shockKey, "meridian-customs-security-intrusion-v1");
  assertEquals(
    writes[0]?.idempotencyKey,
    "story_market_news:game-1:event-customs-intrusion:meridian-customs-security-intrusion-v1",
  );
});

Deno.test("story market news effect uses the same game shock identity across player matches", async () => {
  const writes: StoryMarketNewsWriteInput[] = [];
  const dependencies = fakeDependencies(writes);
  const effect = parseStoryEffect({
    type: "market_news_post",
    payload: {
      shockKey: "meridian-customs-security-intrusion-v1",
      headline: "Meridian verification records diverge",
      explanation: "Cargo and payment records no longer reconcile reliably.",
      category: "supply_chain",
      scope: "global",
      sentiment: "negative",
      impactStrength: "medium",
      durationTicks: 5,
    },
  });

  await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-customs-intrusion",
    effectIndex: 0,
    now: "2026-08-12T00:00:00.000Z",
    dependencies,
    effect,
  });
  await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-customs-intrusion",
    effectIndex: 31,
    now: "2026-08-12T00:00:00.000Z",
    dependencies,
    effect,
  });

  assertEquals(writes.length, 2);
  assertEquals(writes[0]?.idempotencyKey, writes[1]?.idempotencyKey);
});

Deno.test("story market news effect stays unsupported when no market writer is wired", async () => {
  const dependencies = fakeDependencies([]);
  const result = await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    now: "2026-08-12T00:00:00.000Z",
    dependencies: { ...dependencies, marketNews: undefined },
    effect: parseStoryEffect({
      type: "market_news_post",
      payload: {
        shockKey: "shock-1",
        headline: "Headline",
        explanation: "Explanation",
        category: "macro",
        scope: "global",
        sentiment: "mixed",
        impactStrength: "low",
      },
    }),
  });

  assertEquals(result.status, "skipped");
});

Deno.test("story market news effect fails closed when shockKey is missing", async () => {
  const result = await executeStoryEffect({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    now: "2026-08-12T00:00:00.000Z",
    dependencies: fakeDependencies([]),
    effect: parseStoryEffect({
      type: "market_news_post",
      payload: {
        headline: "Headline",
        explanation: "Explanation",
        category: "macro",
        scope: "global",
        sentiment: "mixed",
        impactStrength: "low",
      },
    }),
  });

  assertEquals(result.status, "failed");
});

function fakeDependencies(
  marketNewsWrites: StoryMarketNewsWriteInput[],
): StoryEffectExecutionDependencies {
  return {
    ledger: {
      async recordCashAdjustment() {
        return {};
      },
    },
    policies: {
      async upsertPolicy() {
        return {};
      },
    },
    flags: {
      async setStoryFlag() {
        return {};
      },
    },
    impacts: {
      async createPlayerImpact() {
        return {};
      },
    },
    marketNews: {
      async createMarketNews(input) {
        marketNewsWrites.push(input);
        return { id: "market-news-1" };
      },
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
