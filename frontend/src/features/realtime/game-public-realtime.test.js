import "./game-public-realtime.js";

const realtime = globalThis.Econovaria.features.realtime;
const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const CHANNEL = `game:${GAME_SESSION_ID}:public`;

Deno.test("game public realtime subscribes to supported dashboard public events", () => {
  const client = new FakeSupabaseRealtimeClient();

  const subscription = realtime.startGamePublicRealtimeSubscription({
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    supabaseClient: client,
  });

  assertEquals(client.topic, CHANNEL);
  assertEquals(client.createdChannel.handlers.map((handler) => handler.filter), [
    { event: "stock_tick" },
    { event: "market_news_posted" },
    { event: "market_status_changed" },
  ]);

  subscription.unsubscribe();
  assertEquals(client.removedChannels, 1);
});

Deno.test("game public realtime handles stock_tick and ignores unsupported events", () => {
  const handledPayloads = [];
  const ignored = realtime.handleGamePublicRealtimeBroadcast({
    payload: {
      gameSessionId: GAME_SESSION_ID,
      channel: CHANNEL,
      sequence: 1,
      eventType: "unsupported_event",
      payload: { ok: true },
    },
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: null },
    onStockTick: (payload) => handledPayloads.push(payload),
  });
  const handled = realtime.handleGamePublicRealtimeBroadcast({
    payload: stockTickEnvelope(2),
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: null },
    onStockTick: (payload) => handledPayloads.push(payload),
  });

  assertEquals(ignored, false);
  assertEquals(handled, true);
  assertEquals(handledPayloads.length, 1);
  assertEquals(handledPayloads[0].tick, 2);
});

Deno.test("game public realtime handles market_news_posted", () => {
  const handledPayloads = [];
  const handled = realtime.handleGamePublicRealtimeBroadcast({
    payload: marketNewsEnvelope(3),
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: null },
    onMarketNewsPosted: (payload) => handledPayloads.push(payload),
  });

  assertEquals(handled, true);
  assertEquals(handledPayloads.length, 1);
  assertEquals(handledPayloads[0].news.headline, "Aurora exports surge");
});

Deno.test("game public realtime handles market_status_changed", () => {
  const handledPayloads = [];
  const handled = realtime.handleGamePublicRealtimeBroadcast({
    payload: marketStatusEnvelope(4),
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: null },
    onMarketStatusChanged: (payload) => handledPayloads.push(payload),
  });

  assertEquals(handled, true);
  assertEquals(handledPayloads.length, 1);
  assertEquals(handledPayloads[0].status.status, "open");
});

Deno.test("game public realtime updates existing stocks without duplication", () => {
  const rows = [{
    assetId: "asset-1",
    stockAssetId: "asset-1",
    ticker: "AURA",
    companyName: "Aurora Works",
    currentPrice: 100,
    history: [{ label: "Tick 1", price: 100 }],
  }];
  const next = realtime.applyStockTickToMarketRows(rows, stockTickPayload(2));

  assertEquals(next.length, 1);
  assertEquals(next[0].stockAssetId, "asset-1");
  assertEquals(next[0].ticker, "AURA");
  assertEquals(next[0].currentPrice, 105);
  assertEquals(next[0].previousClose, 100);
  assertEquals(next[0].history.length, 2);
});

Deno.test("game public realtime applies market_news_posted to state", () => {
  const stateApi = createStateApi({
    news: [{ id: "old-news", headline: "Old headline" }],
  });

  const next = realtime.applyMarketNewsPostedToState(
    stateApi,
    marketNewsEnvelope(5).payload,
    marketNewsEnvelope(5),
  );

  assertEquals(next.news.length, 2);
  assertEquals(next.news[0].id, "news-5");
  assertEquals(next.news[0].headline, "Aurora exports surge");
  assertEquals(stateApi.getState().news[0].id, "news-5");
});

Deno.test("game public realtime upserts duplicate market news", () => {
  const stateApi = createStateApi({
    news: [{ id: "news-5", headline: "Old version" }],
  });

  const next = realtime.applyMarketNewsPostedToState(
    stateApi,
    {
      news: {
        id: "news-5",
        headline: "Updated version",
      },
    },
    marketNewsEnvelope(5),
  );

  assertEquals(next.news.length, 1);
  assertEquals(next.news[0].headline, "Updated version");
});

Deno.test("game public realtime ignores malformed market news state payload", () => {
  const stateApi = createStateApi({ news: [] });
  const next = realtime.applyMarketNewsPostedToState(
    stateApi,
    { news: { id: "missing-headline" } },
    marketNewsEnvelope(6),
  );

  assertEquals(next, null);
  assertEquals(stateApi.getState().news.length, 0);
});

Deno.test("game public realtime applies market_status_changed to state", () => {
  const stateApi = createStateApi({ marketStatus: null });
  const next = realtime.applyMarketStatusChangedToState(
    stateApi,
    marketStatusEnvelope(7).payload,
    marketStatusEnvelope(7),
  );

  assertEquals(next.marketStatus.status, "open");
  assertEquals(next.marketStatus.label, "Market Open");
  assertEquals(stateApi.getState().marketStatus.status, "open");
});

Deno.test("game public realtime ignores malformed market status state payload", () => {
  const stateApi = createStateApi({ marketStatus: null });
  const next = realtime.applyMarketStatusChangedToState(
    stateApi,
    { status: { reason: "missing status" } },
    marketStatusEnvelope(8),
  );

  assertEquals(next, null);
  assertEquals(stateApi.getState().marketStatus, null);
});

Deno.test("game public realtime triggers resync on sequence gap", () => {
  const resyncReasons = [];
  const handled = realtime.handleGamePublicRealtimeBroadcast({
    payload: stockTickEnvelope(4),
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: 2 },
    onResync: (reason) => resyncReasons.push(reason),
  });

  assertEquals(handled, false);
  assertEquals(resyncReasons, ["stock_tick_sequence_gap"]);
});

Deno.test("game public realtime triggers resync on public event scope mismatch", () => {
  const resyncReasons = [];
  const handled = realtime.handleGamePublicRealtimeBroadcast({
    payload: {
      ...marketNewsEnvelope(9),
      gameSessionId: "wrong-session",
    },
  }, {
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    state: { lastSequence: null },
    onResync: (reason) => resyncReasons.push(reason),
  });

  assertEquals(handled, false);
  assertEquals(resyncReasons, ["market_news_posted_scope_mismatch"]);
});

Deno.test("game public realtime triggers reconnect callback after initial subscribe", () => {
  const client = new FakeSupabaseRealtimeClient();
  const reconnects = [];

  realtime.startGamePublicRealtimeSubscription({
    gameSessionId: GAME_SESSION_ID,
    publicChannel: CHANNEL,
    supabaseClient: client,
    onReconnect: () => reconnects.push("reconnect"),
  });

  client.createdChannel.emitStatus("SUBSCRIBED");
  client.createdChannel.emitStatus("SUBSCRIBED");

  assertEquals(reconnects, ["reconnect"]);
});

Deno.test("game public realtime creates Supabase client with publishable key only", () => {
  const calls = [];
  globalThis.Econovaria.core = {
    constants: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
    },
  };
  globalThis.supabase = {
    createClient: (...args) => {
      calls.push(args);
      return { kind: "client" };
    },
  };

  const client = realtime.getGamePublicRealtimeSupabaseClient();

  assertEquals(client, { kind: "client" });
  assertEquals(calls[0][0], "https://example.supabase.co");
  assertEquals(calls[0][1], "publishable-key");
});

class FakeSupabaseRealtimeClient {
  constructor() {
    this.createdChannel = new FakeRealtimeChannel();
    this.topic = "";
    this.removedChannels = 0;
  }

  channel(topic) {
    this.topic = topic;
    return this.createdChannel;
  }

  removeChannel() {
    this.removedChannels += 1;
  }
}

class FakeRealtimeChannel {
  constructor() {
    this.handlers = [];
    this.statusCallback = null;
  }

  on(type, filter, callback) {
    this.handlers.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.statusCallback = callback;
    return this;
  }

  emitStatus(status) {
    if (this.statusCallback) this.statusCallback(status);
  }
}

function createStateApi(initialState) {
  let state = initialState;

  return {
    getState() {
      return state;
    },
    setState(nextState) {
      state = nextState;
      return state;
    },
  };
}

function stockTickEnvelope(sequence) {
  return {
    gameSessionId: GAME_SESSION_ID,
    channel: CHANNEL,
    sequence,
    eventType: "stock_tick",
    occurredAt: `tick-${sequence}`,
    payload: stockTickPayload(sequence),
  };
}

function stockTickPayload(tick) {
  return {
    tick,
    stocks: [{
      stockAssetId: "asset-1",
      ticker: "AURA",
      companyName: "Aurora Works",
      sector: "TECHNOLOGY",
      countryCode: "SOLVEND",
      currentPrice: 105,
      previousClose: 100,
      changePct: 5,
      volume: 1000,
    }],
  };
}

function marketNewsEnvelope(sequence) {
  return {
    gameSessionId: GAME_SESSION_ID,
    channel: CHANNEL,
    sequence,
    eventType: "market_news_posted",
    occurredAt: `tick-${sequence}`,
    payload: {
      tick: sequence,
      news: {
        id: `news-${sequence}`,
        headline: "Aurora exports surge",
        summary: "Port activity increased after new contracts cleared.",
        source: "Econovaria Wire",
        severity: "positive",
        countryCode: "SOLVEND",
        sector: "TECHNOLOGY",
        createdAt: `tick-${sequence}`,
      },
    },
  };
}

function marketStatusEnvelope(sequence) {
  return {
    gameSessionId: GAME_SESSION_ID,
    channel: CHANNEL,
    sequence,
    eventType: "market_status_changed",
    occurredAt: `tick-${sequence}`,
    payload: {
      tick: sequence,
      status: {
        status: "open",
        label: "Market Open",
        reason: "Scheduled session window started.",
        updatedAt: `tick-${sequence}`,
      },
    },
  };
}

function assertEquals(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
