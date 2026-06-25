import {
  buildStockMarketNewsInsertRow,
  parseStockMarketNewsCreateRequest,
  StockMarketNewsError,
} from "./stockMarketNewsContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("market news parses geopolitical sector news", () => {
  const input = parseStockMarketNewsCreateRequest({
    gameSessionId: "game-1",
    headline: "Border escalation drives emergency steel procurement",
    explanation: "Government procurement lifts steel, oil, logistics, and defense demand.",
    category: "war_conflict",
    scope: "sector",
    targetKey: "HEAVY_INDUSTRY_MANUFACTURING",
    sentiment: "positive",
    impactStrength: "medium",
    durationTicks: 5,
    metadata: {
      affectedResources: ["steel", "oil"],
    },
  });

  assertEquals(input.category, "war_conflict");
  assertEquals(input.scope, "sector");
  assertEquals(input.targetKey, "HEAVY_INDUSTRY_MANUFACTURING");
  assertEquals(input.sentiment, "positive");
  assertEquals(input.impactStrength, "medium");
  assertEquals(input.durationTicks, 5);
});

Deno.test("market news parses natural disaster resource story through sector scope", () => {
  const input = parseStockMarketNewsCreateRequest({
    gameSessionId: "game-1",
    headline: "Flooding damages Eldoran grain fields",
    explanation: "Crop supply is expected to tighten across agricultural producers and food logistics.",
    category: "natural_disaster",
    scope: "sector",
    targetKey: "AGRICULTURE_COMMODITIES",
    sentiment: "negative",
    impactStrength: "high",
    durationTicks: 6,
  });

  assertEquals(input.category, "natural_disaster");
  assertEquals(input.scope, "sector");
  assertEquals(input.targetKey, "AGRICULTURE_COMMODITIES");
});

Deno.test("market news requires targetKey for scoped news", () => {
  const error = assertThrows(
    () =>
      parseStockMarketNewsCreateRequest({
        gameSessionId: "game-1",
        headline: "Port strike disrupts freight",
        explanation: "Shipping delays increase logistics costs.",
        category: "supply_chain",
        scope: "sector",
        sentiment: "negative",
        impactStrength: "medium",
      }),
    StockMarketNewsError,
  );

  assertEquals(error.code, "invalid_market_news_request");
});

Deno.test("market news rejects targetKey for global news", () => {
  assertThrows(
    () =>
      parseStockMarketNewsCreateRequest({
        gameSessionId: "game-1",
        headline: "Global liquidity conditions improve",
        explanation: "Risk appetite rises across public markets.",
        category: "macro",
        scope: "global",
        targetKey: "GLOBAL",
        sentiment: "positive",
        impactStrength: "low",
      }),
    StockMarketNewsError,
  );
});

Deno.test("market news rejects excessive duration", () => {
  assertThrows(
    () =>
      parseStockMarketNewsCreateRequest({
        gameSessionId: "game-1",
        headline: "Long disruption",
        explanation: "This duration is intentionally invalid.",
        category: "resource_shock",
        scope: "sector",
        targetKey: "ENERGY",
        sentiment: "negative",
        impactStrength: "medium",
        durationTicks: 99,
      }),
    StockMarketNewsError,
  );
});

Deno.test("market news insert row maps positive news to bounded decaying shock", () => {
  const parsed = parseStockMarketNewsCreateRequest({
    gameSessionId: "game-1",
    headline: "Infrastructure bill lifts materials demand",
    explanation: "Public works spending boosts steel and construction suppliers.",
    category: "policy",
    scope: "sector",
    targetKey: "HEAVY_INDUSTRY_MANUFACTURING",
    sentiment: "positive",
    impactStrength: "high",
    durationTicks: 4,
  });

  const row = buildStockMarketNewsInsertRow({
    ...parsed,
    shockId: "news-1",
    createdTick: 14,
  });

  assertEquals(row.game_session_id, "game-1");
  assertEquals(row.shock_id, "news-1");
  assertEquals(row.category, "policy");
  assertEquals(row.visibility, "public");
  assertEquals(row.scope, "sector");
  assertEquals(row.target_key, "HEAVY_INDUSTRY_MANUFACTURING");
  assertEquals(row.created_tick, 14);
  assertEquals(row.expires_tick, 18);
  assertEquals(row.is_active, true);
  assertEquals(row.magnitude > 0, true);
  assertEquals(row.magnitude <= 0.05, true);
  assertEquals(row.decay > 0, true);
  assertEquals(row.decay <= 1, true);
});


function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}

function assertThrows<TError extends Error>(
  run: () => unknown,
  expectedErrorClass: new (...args: never[]) => TError,
): TError {
  try {
    run();
  } catch (error) {
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(`Expected ${expectedErrorClass.name}, got ${String(error)}`);
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
}
