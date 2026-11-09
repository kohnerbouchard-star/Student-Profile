import type {
  StockMarketNewsCreateResult,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
} from "../../stocks/news.ts";
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

const validPayload = {
  headline: " headline ",
  explanation: " explanation ",
  category: "macro",
  scope: "global",
  sentiment: "neutral",
  impactStrength: "low",
};

function writeInput() {
  return {
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    shockKey: "shock-1",
    idempotencyKey: "key-1",
    payload: { ...validPayload },
  };
}

Deno.test("story market news enforces game/source/provenance over payload and preserves other metadata", async () => {
  const repository = new FakeMarketNewsRepository();
  await new StockMarketStoryNewsWriter(repository).createMarketNews({
    ...writeInput(),
    payload: {
      ...validPayload,
      gameSessionId: "foreign-game",
      source: "admin",
      metadata: {
        retained: ["original"],
        sourceType: "forged",
        sourceStorylineEventId: "forged",
        storyShockKey: "forged",
      },
    },
  });
  assertEquals(repository.tickReads, ["game-1"]);
  assertEquals(repository.created[0]?.gameSessionId, "game-1");
  assertEquals(repository.created[0]?.source, "system");
  assertEquals(repository.created[0]?.headline, "headline");
  assertEquals(repository.created[0]?.durationTicks, 5);
  assertEquals(repository.created[0]?.metadata, {
    retained: ["original"],
    sourceType: "story_event",
    sourceStorylineEventId: "event-1",
    storyShockKey: "shock-1",
  });
});

Deno.test("story market news tick precedence includes zero and ignores invalid frozen ticks", async () => {
  for (
    const [explicit, frozen, expected, reads] of [
      [0, 8, 0, 0],
      [5, 8, 5, 0],
      [undefined, 0, 0, 0],
      [undefined, 8, 8, 0],
      ...[-1, 1.5, "8", Number.MAX_SAFE_INTEGER + 1].map((
        tick,
      ) => [undefined, tick, 13, 1]),
    ] as [number | undefined, number | string, number, number][]
  ) {
    const repository = new FakeMarketNewsRepository();
    await new StockMarketStoryNewsWriter(repository).createMarketNews({
      ...writeInput(),
      createdTick: explicit as number | undefined,
      payload: { ...validPayload, createdTick: frozen },
    });
    assertEquals(repository.created[0]?.createdTick, expected);
    assertEquals(repository.tickReads.length, reads);
  }
});

Deno.test("story market news rejects invalid explicit and computed ticks before persistence", async () => {
  for (const tick of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const repository = new FakeMarketNewsRepository();
    await assertRejects(
      () =>
        new StockMarketStoryNewsWriter(repository).createMarketNews({
          ...writeInput(),
          createdTick: tick,
          payload: { ...validPayload, createdTick: 4 },
        }),
      "Story market news createdTick is invalid.",
    );
    assertEquals(repository.created.length, 0);
    assertEquals(repository.tickReads.length, 0);
  }
  const repository = new FakeMarketNewsRepository();
  repository.currentTick = Number.MAX_SAFE_INTEGER;
  await assertRejects(
    () =>
      new StockMarketStoryNewsWriter(repository).createMarketNews(writeInput()),
    "Story market news createdTick is invalid.",
  );
  assertEquals(repository.created.length, 0);
});

Deno.test("story market news retains 128-character identities and deterministically hashes unsafe identities", async () => {
  for (
    const key of [
      "a".repeat(128),
      "a".repeat(129),
      "unsafe key",
      "_unsafe",
      "é",
    ]
  ) {
    const repository = new FakeMarketNewsRepository();
    const writer = new StockMarketStoryNewsWriter(repository);
    for (let repeat = 0; repeat < 2; repeat++) {
      await writer.createMarketNews({
        ...writeInput(),
        idempotencyKey: ` ${key} `,
        createdTick: 0,
      });
    }
    const first = repository.created[0]?.shockId;
    assertEquals(first, repository.created[1]?.shockId);
    assertEquals(
      key.length === 128
        ? first === key
        : /^story_market_news:[0-9a-f]{64}$/.test(first ?? ""),
      true,
    );
  }
  const repository = new FakeMarketNewsRepository();
  await assertRejects(
    () =>
      new StockMarketStoryNewsWriter(repository).createMarketNews({
        ...writeInput(),
        idempotencyKey: "  ",
        createdTick: 0,
      }),
    "Story market news idempotencyKey is required.",
  );
  assertEquals(repository.created.length, 0);
});

async function assertRejects(
  run: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      message,
    );
    return;
  }
  throw new Error(`Expected rejection: ${message}`);
}

class FakeMarketNewsRepository implements StockMarketNewsRepository {
  readonly created: StockMarketNewsInsertInput[] = [];
  readonly tickReads: string[] = [];
  currentTick = 12;

  async readCurrentTick(_gameSessionId: string): Promise<number> {
    this.tickReads.push(_gameSessionId);
    return this.currentTick;
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
