import {
  buildGamePublicRealtimeEnvelope,
  buildGamePublicRealtimeStockTickEnvelope,
  GamePublicRealtimePublisher,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
import {
  assertEquals,
  ASSET_ID,
  GAME_SESSION_ID,
  WALL_CLOCK_TIME,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("public realtime boundary projects only the canonical game tick envelope", async () => {
  const envelope = buildGamePublicRealtimeStockTickEnvelope({
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 7,
    generatedAt: WALL_CLOCK_TIME,
    assets: [{ assetId: ASSET_ID, ticker: "AURA", countryCode: "SOLVEND" }],
    rows: [{ ticker: "AURA", companyName: "Aurora", sector: "TECH", currentPrice: 12, previousClose: 10 }],
    ticks: [{ assetId: ASSET_ID, ticker: "AURA", changePct: 20, volume: 8 }],
  });
  assertEquals(envelope, {
    gameSessionId: GAME_SESSION_ID, channel: `game:${GAME_SESSION_ID}:public`,
    sequence: 7, eventType: "stock_tick", occurredAt: WALL_CLOCK_TIME,
    payload: { tick: 7, stocks: [{
      stockAssetId: ASSET_ID, ticker: "AURA", companyName: "Aurora", sector: "TECH",
      countryCode: "SOLVEND", currentPrice: 12, previousClose: 10, changePct: 20, volume: 8,
    }] },
  });
  const sent: unknown[] = [];
  const result = await new GamePublicRealtimePublisher({
    async send(message) { sent.push(message); return { ok: true }; },
  }).publish(envelope);
  assertEquals(result.ok, true);
  assertEquals(sent, [{ channel: envelope.channel, event: "stock_tick", payload: envelope }]);
});

Deno.test("public realtime boundary rejects mismatched stock projection sources", () => {
  for (const missing of ["asset", "row"]) {
    let caught: unknown;
    try {
      buildGamePublicRealtimeStockTickEnvelope({
        gameSessionId: GAME_SESSION_ID, tickIndex: 7, generatedAt: WALL_CLOCK_TIME,
        assets: missing === "asset" ? [] : [{ assetId: ASSET_ID, ticker: "AURA", countryCode: "SOLVEND" }],
        rows: missing === "row" ? [] : [{ ticker: "AURA", companyName: "Aurora", sector: "TECH", currentPrice: 12, previousClose: 10 }],
        ticks: [{ assetId: ASSET_ID, ticker: "AURA", changePct: 20, volume: 8 }],
      });
    } catch (error) { caught = error; }
    assertEquals(caught instanceof Error ? caught.message : caught,
      "Stock tick public realtime source did not match the calculated tick.");
  }
});

Deno.test("public realtime boundary retains privacy, channel and sequence guards before transport", async () => {
  let sent = 0;
  const publisher = new GamePublicRealtimePublisher({
    async send() { sent++; return { ok: true }; },
  });
  const valid = buildGamePublicRealtimeEnvelope({
    gameSessionId: GAME_SESSION_ID, sequence: 0, eventType: "stock_tick",
    occurredAt: WALL_CLOCK_TIME, payload: { tick: 0, stocks: [] },
  });
  assertEquals((await publisher.publish(valid)).ok, true);
  sent = 0;
  const messages = [
    "Public realtime channel must match the game session.",
    "sequence must be a non-negative integer or null.",
    "Public realtime payload contains private field payload.nested.playerSessionToken.",
  ];
  for (const [index, envelope] of [
    { ...valid, channel: "game:another:public" as const },
    { ...valid, sequence: -1 },
    { ...valid, payload: { ...valid.payload, nested: { playerSessionToken: "private" } } },
  ].entries()) {
    const result = await publisher.publish(envelope);
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.code, "invalid_game_public_realtime_event");
      assertEquals(result.error.message, messages[index]);
    }
  }
  assertEquals(sent, 0);
});
