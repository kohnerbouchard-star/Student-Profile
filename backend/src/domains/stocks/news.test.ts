import * as news from "./news.ts";
import * as canonical from "./contracts/stockMarketNewsContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const valid = {
  gameSessionId: " game-1 ",
  headline: " headline ",
  explanation: " explanation ",
  category: " macro ",
  scope: " global ",
  sentiment: " neutral ",
  impactStrength: " low ",
};

Deno.test("Stocks news public entry exposes only canonical producer runtime contracts", () => {
  assertEquals(
    Object.keys(news).sort(),
    [
      "STOCK_MARKET_NEWS_CATEGORIES",
      "STOCK_MARKET_NEWS_IMPACT_STRENGTHS",
      "STOCK_MARKET_NEWS_SCOPES",
      "STOCK_MARKET_NEWS_SENTIMENTS",
      "STOCK_MARKET_NEWS_SOURCES",
      "parseStockMarketNewsCreateRequest",
    ].sort(),
  );
  for (const key of Object.keys(news) as (keyof typeof news)[]) {
    if (news[key] !== canonical[key]) {
      throw new Error(`Non-canonical export: ${key}`);
    }
  }
});

Deno.test("Stocks news public parser retains normalization, defaults and metadata identity", () => {
  const parsed = news.parseStockMarketNewsCreateRequest(valid);
  assertEquals(parsed, {
    gameSessionId: "game-1",
    headline: "headline",
    explanation: "explanation",
    category: "macro",
    scope: "global",
    targetKey: null,
    sentiment: "neutral",
    impactStrength: "low",
    durationTicks: 5,
    source: "runner",
    metadata: {},
  });
  const metadata = { nested: { original: true } };
  const scoped = news.parseStockMarketNewsCreateRequest({
    ...valid,
    scope: "ticker",
    targetKey: " abc ",
    source: "system",
    durationTicks: 12,
    metadata,
  });
  assertEquals(scoped.targetKey, "ABC");
  assertEquals(scoped.source, "system");
  assertEquals(scoped.durationTicks, 12);
  if (scoped.metadata !== metadata) throw new Error("Metadata was copied.");
  for (const scope of ["country", "sector"]) {
    assertEquals(
      news.parseStockMarketNewsCreateRequest({
        ...valid,
        scope,
        targetKey: " MixedCase ",
      }).targetKey,
      "MixedCase",
    );
  }
  assertEquals(
    news.parseStockMarketNewsCreateRequest({
      ...valid,
      source: null,
      durationTicks: null,
      metadata: null,
      targetKey: 123,
    }),
    parsed,
  );
});

Deno.test("Stocks news public parser retains exact error identity, validation order and messages", () => {
  const cases: [unknown, string][] = [
    [null, "Request body must be a JSON object."],
    [[], "Request body must be a JSON object."],
    [{}, "gameSessionId is required."],
    [{ ...valid, headline: " " }, "headline is required."],
    [{ ...valid, explanation: 1 }, "explanation is required."],
    [{ ...valid, category: "MACRO" }, "category is invalid."],
    [{ ...valid, scope: "invalid" }, "scope is invalid."],
    [{ ...valid, sentiment: "invalid" }, "sentiment is invalid."],
    [{ ...valid, impactStrength: "invalid" }, "impactStrength is invalid."],
    [{ ...valid, source: "" }, "source is invalid."],
    [
      { ...valid, targetKey: "GLOBAL" },
      "targetKey must be omitted for global news.",
    ],
    ...["country", "sector", "ticker"].map((scope): [unknown, string] => [
      { ...valid, scope },
      "targetKey is required for country, sector, and ticker news.",
    ]),
    ...["5", 1.5, NaN].map((durationTicks): [unknown, string] => [
      { ...valid, durationTicks },
      "durationTicks must be an integer.",
    ]),
    ...[0, 13].map((durationTicks): [unknown, string] => [
      { ...valid, durationTicks },
      "durationTicks must be between 1 and 12.",
    ]),
    [
      { ...valid, metadata: [] },
      "metadata must be a JSON object when provided.",
    ],
  ];
  for (const [input, message] of cases) {
    let caught = false;
    try {
      news.parseStockMarketNewsCreateRequest(input);
    } catch (error) {
      caught = true;
      if (!(error instanceof canonical.StockMarketNewsError)) throw error;
      assertEquals(error.name, "StockMarketNewsError");
      assertEquals(error.code, "invalid_market_news_request");
      assertEquals(error.status, 400);
      assertEquals(error.message, message);
    }
    if (!caught) throw new Error(`Expected rejection: ${message}`);
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
