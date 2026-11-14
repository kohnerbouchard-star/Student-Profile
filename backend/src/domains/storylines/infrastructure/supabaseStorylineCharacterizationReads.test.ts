import {
  activation,
  activationCalls,
  bad,
  equal,
  event,
  eventCalls,
  failure,
  input,
  ok,
  overrideCalls,
  resolutionCalls,
  same,
  setup,
} from "./supabaseStorylineCharacterizationSupport.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline characterization exact sequential read admission and empty-event follow-through", async () => {
  let release!: (value: ReturnType<typeof ok>) => void;
  const pending = new Promise<ReturnType<typeof ok>>((resolve) => {
    release = resolve;
  });
  const { client, repository } = setup(
    ok([activation()]),
    pending,
    ok(null),
    ok(null),
  );
  const result = repository.listUnresolvedActiveStorylineEvents(input);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  equal(client.calls, [...activationCalls, ...eventCalls]);
  release(ok([]));
  equal(await result, []);
  equal(client.calls, [
    ...activationCalls,
    ...eventCalls,
    ...overrideCalls,
    ...resolutionCalls,
  ]);
});

for (const data of [null, []]) {
  Deno.test(`storyline characterization no activation short circuit ${JSON.stringify(data)}`, async () => {
    const { client, repository } = setup(ok(data));
    equal(await repository.listUnresolvedActiveStorylineEvents(input), []);
    equal(client.calls, activationCalls);
  });
}

for (
  const [index, table] of [
    "game_session_storylines",
    "storyline_events",
    "game_session_story_event_overrides",
    "story_event_resolutions",
  ].entries()
) {
  Deno.test(`storyline characterization error precedence at ${table}`, async () => {
    const responses = [
      ok([activation()]),
      ok([event("event")]),
      ok([]),
      ok([]),
    ];
    responses[index] = { ...bad(), data: [event("ignored")] };
    const { client, repository } = setup(...responses);
    await failure(
      () => repository.listUnresolvedActiveStorylineEvents(input),
      table,
    );
    equal(
      client.calls,
      [activationCalls, eventCalls, overrideCalls, resolutionCalls].slice(
        0,
        index + 1,
      ).flat(),
    );
  });
}

Deno.test("storyline characterization activation DTO exact shape and numeric normalization", async () => {
  const { repository } = setup(
    ok([
      activation({
        status: "unknown",
        accumulated_pause_seconds: "bad",
        time_scale: Infinity,
      }),
      activation({
        id: "second",
        paused_at: "pause",
        accumulated_pause_seconds: "-1.5",
        time_scale: "",
      }),
    ]),
  );
  equal(await repository.listActiveGameSessionStorylines("game"), [
    {
      id: "activation",
      gameSessionId: "game",
      storylineId: "story",
      status: "unknown",
      storyStartedAt: "2026-01-01T00:00:00Z",
      pausedAt: null,
      accumulatedPauseSeconds: 0,
      timeScale: 0,
      createdAt: "created",
    },
    {
      id: "second",
      gameSessionId: "game",
      storylineId: "story",
      status: "active",
      storyStartedAt: "2026-01-01T00:00:00Z",
      pausedAt: "pause",
      accumulatedPauseSeconds: -1.5,
      timeScale: 0,
      createdAt: "created",
    },
  ]);
});

Deno.test("storyline characterization duplicate activation wins, overrides admit, resolution removes and DTO identities survive", async () => {
  const row = event("kept", {
    is_active: false,
    act: "bad",
    sequence: "",
    scheduled_offset_seconds: "bad",
    scheduled_market_tick: "Infinity",
  });
  const { client, repository } = setup(
    ok([
      activation(),
      activation({ id: "last", game_session_id: "row-game", time_scale: "3" }),
    ]),
    ok([
      event("disabled", { is_active: false }),
      event("resolved"),
      event("orphan", { storyline_id: "missing" }),
      row,
      row,
    ]),
    ok([{ storyline_event_id: "kept", enabled: true }]),
    ok([{ storyline_event_id: "resolved", status: "failed" }]),
  );
  const rows = await repository.listUnresolvedActiveStorylineEvents(input);
  equal(client.calls[8], ["in", "storyline_id", ["story", "story"]]);
  equal(rows.length, 2);
  equal(rows[0], {
    id: "kept",
    storylineId: "story",
    gameSessionId: "row-game",
    gameSessionStorylineId: "last",
    storyStartedAt: "2026-01-01T00:00:00Z",
    accumulatedPauseSeconds: 10,
    timeScale: 3,
    eventKey: "key-kept",
    title: "title",
    description: "description",
    act: 0,
    sequence: 0,
    triggerType: "condition",
    scheduledOffsetSeconds: 0,
    scheduledAt: null,
    scheduledMarketTick: 0,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "unrecognized",
    createdAt: "created",
  });
  for (
    const [camel, snake] of [
      ["triggerCondition", "trigger_condition"],
      ["revealPayload", "reveal_payload"],
      ["publicNewsPayload", "public_news_payload"],
      ["playerRules", "player_rules"],
      ["policyPayloads", "policy_payloads"],
      ["flagPayloads", "flag_payloads"],
      ["contractUnlockPayloads", "contract_unlock_payloads"],
    ]
  ) {
    same((rows[0] as unknown as Record<string, unknown>)[camel], row[snake]);
    same((rows[1] as unknown as Record<string, unknown>)[camel], row[snake]);
  }
  equal(rows[0] === rows[1], false);
});

const triggers: Array<[string, Record<string, unknown>, boolean]> = [
  ["manual", {}, false],
  ["condition", {}, true],
  ...[null, undefined, "", "bad", "Infinity", Infinity, "5", 6, -1].map((
    value,
  ): [string, Record<string, unknown>, boolean] => ["market_tick", {
    scheduled_market_tick: value,
  }, value !== null && value !== undefined && value !== 6]),
  ...[
    null,
    undefined,
    "",
    "invalid",
    "2026-01-01T00:01:40.999Z",
    "2026-01-01T00:01:41Z",
  ].map((
    value,
  ): [string, Record<string, unknown>, boolean] => ["wall_clock_time", {
    scheduled_at: value,
  }, value === input.now]),
  ...[null, undefined, "", "bad", "Infinity", Infinity, "180", 180.1, -1].map((
    value,
  ): [string, Record<string, unknown>, boolean] => ["story_elapsed_time", {
    scheduled_offset_seconds: value,
  }, value !== null && value !== undefined && value !== 180.1]),
  ["unknown", { scheduled_offset_seconds: 180 }, true],
];
for (const [index, [trigger, changes, expected]] of triggers.entries()) {
  Deno.test(`storyline characterization trigger coercion ${index} ${trigger}`, async () => {
    const { repository } = setup(
      ok([activation({ paused_at: "2026-01-01T00:00:01Z" })]),
      ok([event("event", { trigger_type: trigger, ...changes })]),
      ok([]),
      ok([]),
    );
    equal(
      (await repository.listUnresolvedActiveStorylineEvents(input)).map((row) =>
        row.id
      ),
      expected ? ["event"] : [],
    );
  });
}

for (
  const [name, changes, now, limit] of [
    ["invalid start", { story_started_at: "bad" }, input.now, 0],
    [
      "future start",
      { story_started_at: "2027-01-01T00:00:00Z" },
      input.now,
      0,
    ],
    ["invalid now", {}, "bad", 0],
    ["pause exceeds elapsed", { accumulated_pause_seconds: 101 }, input.now, 0],
    ["negative scale", { time_scale: -2 }, input.now, 0],
    ["invalid scale", { time_scale: "bad" }, input.now, 0],
    ["negative pause", { accumulated_pause_seconds: -10 }, input.now, 220],
    ["fractional scale", { time_scale: 0.5 }, input.now, 45],
  ] as const
) {
  Deno.test(`storyline characterization elapsed boundary ${name}`, async () => {
    const { repository } = setup(
      ok([activation(changes)]),
      ok([
        event("boundary", {
          trigger_type: "story_elapsed_time",
          scheduled_offset_seconds: limit,
        }),
        event("above", {
          trigger_type: "story_elapsed_time",
          scheduled_offset_seconds: limit + 0.01,
        }),
      ]),
      ok([]),
      ok([]),
    );
    equal(
      (await repository.listUnresolvedActiveStorylineEvents({ ...input, now }))
        .map((row) => row.id),
      ["boundary"],
    );
  });
}

Deno.test("storyline characterization flag order, last duplicate identity, empty and error", async () => {
  const value = { nested: [1] };
  const { client, repository } = setup(
    ok([{ flag_key: "b", value: false }, { flag_key: "a", value: 1 }, {
      flag_key: "b",
      value,
    }]),
    ok(null),
    bad(""),
  );
  const flags = await repository.listGameSessionStoryFlags("game");
  equal(Object.keys(flags), ["b", "a"]);
  same(flags.b, value);
  equal(client.calls, [
    ["from", "game_session_story_flags"],
    [
      "select",
      "id,game_session_id,flag_key,value,source_story_event_id,created_at",
    ],
    ["eq", "game_session_id", "game"],
    ["order", "created_at", { ascending: true }],
    ["await"],
  ]);
  equal(await repository.listGameSessionStoryFlags("game"), {});
  await failure(
    () => repository.listGameSessionStoryFlags("game"),
    "game_session_story_flags",
    "select",
    "storyline_repository_query_failed",
    "Storyline repository query failed.",
  );
});

for (const index of [0, 2, 3]) {
  Deno.test(`storyline characterization waits for read stage ${index} before admitting next`, async () => {
    let release!: (value: ReturnType<typeof ok>) => void;
    const pending = new Promise<ReturnType<typeof ok>>((resolve) => {
      release = resolve;
    });
    const responses = [
      ok([activation()]),
      ok([event("event")]),
      ok([]),
      ok([]),
    ];
    const { client, repository } = setup(
      ...responses.map((response, current) =>
        current === index ? pending : response
      ),
    );
    const result = repository.listUnresolvedActiveStorylineEvents(input);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    equal(
      client.calls,
      [activationCalls, eventCalls, overrideCalls, resolutionCalls].slice(
        0,
        index + 1,
      ).flat(),
    );
    release(responses[index]);
    equal((await result).map((row) => row.id), ["event"]);
    equal(client.calls, [
      ...activationCalls,
      ...eventCalls,
      ...overrideCalls,
      ...resolutionCalls,
    ]);
  });
}

Deno.test("storyline characterization null events still read overrides and resolutions", async () => {
  const { client, repository } = setup(
    ok([activation()]),
    ok(null),
    ok(null),
    ok(null),
  );
  equal(await repository.listUnresolvedActiveStorylineEvents(input), []);
  equal(client.calls, [
    ...activationCalls,
    ...eventCalls,
    ...overrideCalls,
    ...resolutionCalls,
  ]);
});

Deno.test("storyline characterization override and resolution IDs stringify, event order stays returned order", async () => {
  const { repository } = setup(
    ok([activation()]),
    ok([
      event("2", { is_active: false, sequence: 100 }),
      event("1", { sequence: 1 }),
      event("3", { sequence: 0 }),
    ]),
    ok([{ storyline_event_id: 2, enabled: true }]),
    ok([{ storyline_event_id: 1 }]),
  );
  equal(
    (await repository.listUnresolvedActiveStorylineEvents(input)).map((row) =>
      row.id
    ),
    ["2", "3"],
  );
});

Deno.test("storyline characterization wall-clock invalid now excludes only wall-clock and positive elapsed", async () => {
  const { repository } = setup(
    ok([activation()]),
    ok([
      event("clock", {
        trigger_type: "wall_clock_time",
        scheduled_at: input.now,
      }),
      event("condition"),
      event("tick", { trigger_type: "market_tick", scheduled_market_tick: 0 }),
      event("elapsed", {
        trigger_type: "story_elapsed_time",
        scheduled_offset_seconds: 1,
      }),
    ]),
    ok([]),
    ok([]),
  );
  equal(
    (await repository.listUnresolvedActiveStorylineEvents({
      ...input,
      now: "invalid",
      currentMarketTick: NaN,
    })).map((row) => row.id),
    ["condition"],
  );
});

Deno.test("storyline characterization equality distinguishes nonfinite, absent and signed-zero values", () => {
  const symbol = Symbol("own-key");
  for (
    const [actual, expected] of [
      [NaN, null],
      [Infinity, null],
      [-Infinity, null],
      [0, -0],
      [{ value: undefined }, {}],
      [[undefined], [null]],
      [Array(1), [undefined]],
      [{ [symbol]: undefined }, {}],
      [{ nested: [NaN] }, { nested: [null] }],
    ]
  ) {
    let rejected = false;
    try {
      equal(actual, expected);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Equality accepted distinguishable values");
  }
  equal({ value: [NaN, Infinity, undefined, -0], [symbol]: true }, {
    [symbol]: true,
    value: [NaN, Infinity, undefined, -0],
  });
});
