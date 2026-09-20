import type {
  StockMarketNewsCreateResult,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
} from "../../stocks/contracts/stockMarketNewsContracts.ts";
import { StockMarketStoryNewsWriter } from "./stockMarketStoryNewsWriter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story market news writer schedules a deterministic system shock for the next tick", async () => {
  const repository = new FakeMarketNewsRepository();
  const writer = new StockMarketStoryNewsWriter(repository);

  const result = await writer.createMarketNews({
    gameSessionId: "game-1",
    storylineEventId: "story-event-1",
    shockKey: "meridian-customs-security-intrusion-v1",
    idempotencyKey:
      "story_market_news:game-1:story-event-1:meridian-customs-security-intrusion-v1",
    payload: {
      shockKey: "meridian-customs-security-intrusion-v1",
      headline: "Meridian verification records diverge",
      explanation: "Cargo and payment records no longer reconcile reliably.",
      category: "supply_chain",
      scope: "global",
      sentiment: "negative",
      impactStrength: "medium",
      durationTicks: 5,
      metadata: { attribution: "unresolved" },
    },
  });

  assertEquals(result.id, "news-1");
  assertEquals(repository.created.length, 1);
  assertEquals(repository.created[0]?.createdTick, 13);
  assertEquals(repository.created[0]?.source, "system");
  assertEquals(
    repository.created[0]?.shockId,
    "story_market_news:game-1:story-event-1:meridian-customs-security-intrusion-v1",
  );
  assertEquals(repository.created[0]?.metadata, {
    attribution: "unresolved",
    sourceType: "story_event",
    sourceStorylineEventId: "story-event-1",
    storyShockKey: "meridian-customs-security-intrusion-v1",
  });
});

Deno.test("story market news writer bounds UUID-derived shock identities for browser reads", async () => {
  const repository = new FakeMarketNewsRepository();
  const writer = new StockMarketStoryNewsWriter(repository);
  const gameSessionId = "9fb2d0a0-cc20-48e6-b069-2f93f49d1fc4";
  const storylineEventId = "68cea474-b682-46d0-ac27-927da1d9f8c9";
  const shockKey = "meridian-customs-security-intrusion-v1";
  const idempotencyKey = [
    "story_market_news",
    gameSessionId,
    storylineEventId,
    shockKey,
  ].join(":");
  const input = {
    gameSessionId,
    storylineEventId,
    shockKey,
    idempotencyKey,
    payload: {
      shockKey,
      headline: "Meridian verification records diverge",
      explanation: "Cargo and payment records no longer reconcile reliably.",
      category: "supply_chain",
      scope: "global",
      sentiment: "negative",
      impactStrength: "medium",
      durationTicks: 5,
    },
  };

  assertEquals(idempotencyKey.length > 128, true);
  await writer.createMarketNews(input);
  await writer.createMarketNews(input);

  const first = repository.created[0]?.shockId ?? "";
  const second = repository.created[1]?.shockId ?? "";
  assertEquals(repository.created.length, 2);
  assertEquals(first, second);
  assertEquals(/^story_market_news:[0-9a-f]{64}$/.test(first), true);
  assertEquals(first.length, 82);
  assertEquals(first.includes(gameSessionId), false);
  assertEquals(first.includes(storylineEventId), false);
});

class FakeMarketNewsRepository implements StockMarketNewsRepository {
  readonly created: StockMarketNewsInsertInput[] = [];

  async readCurrentTick(_gameSessionId: string): Promise<number> {
    return 12;
  }

  async create(
    input: StockMarketNewsInsertInput,
  ): Promise<StockMarketNewsCreateResult> {
    this.created.push(input);
    return {
      news: {
        id: "news-1",
        shockId: input.shockId,
        category: input.category,
        sentiment: input.sentiment,
        source: input.source,
        scope: input.scope,
        targetKey: input.targetKey,
        headline: input.headline,
        explanation: input.explanation,
        createdTick: input.createdTick,
        expiresTick: input.createdTick + input.durationTicks,
        createdAt: "2026-08-12T00:00:00.000Z",
      },
    };
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
