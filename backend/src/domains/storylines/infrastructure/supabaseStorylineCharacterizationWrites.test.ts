import {
  bad,
  equal,
  failure,
  input,
  ok,
  resolution,
  RESOLUTION_SELECT,
  same,
  setup,
} from "./supabaseStorylineCharacterizationSupport.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
const resolutionInput = {
  gameSessionId: "game",
  storylineEventId: "event",
  resolvedAt: input.now,
};
const defaultRow = {
  game_session_id: "game",
  storyline_event_id: "event",
  resolved_at: input.now,
  resolved_market_tick: null,
  status: "resolved",
  result_payload: {},
};
const insertCalls = [
  ["from", "story_event_resolutions"],
  ["insert", defaultRow],
  ["select", RESOLUTION_SELECT],
  ["maybeSingle"],
  ["await"],
];
const existingCalls = [
  ["from", "story_event_resolutions"],
  ["select", RESOLUTION_SELECT],
  ["eq", "game_session_id", "game"],
  ["eq", "storyline_event_id", "event"],
  ["maybeSingle"],
  ["await"],
];

Deno.test("storyline characterization resolution default insert and exact DTO identity", async () => {
  const payload = { nested: [true] };
  const { client, repository } = setup(
    ok(resolution({ result_payload: payload })),
  );
  const result = await repository.createStoryEventResolution(resolutionInput);
  equal(client.calls, insertCalls);
  equal(result, {
    status: "inserted",
    resolution: {
      id: "resolution",
      gameSessionId: "game",
      storylineEventId: "event",
      resolvedAt: input.now,
      resolvedMarketTick: 5,
      status: "unrecognized",
      resultPayload: payload,
      createdAt: "created",
    },
  });
  same(result.resolution.resultPayload, payload);
});

for (const tick of [null, undefined, "bad", Infinity, "", "2.5"]) {
  Deno.test(`storyline characterization resolution nullable numeric ${String(tick)}`, async () => {
    const { repository } = setup(
      ok(resolution({ resolved_market_tick: tick })),
    );
    equal(
      (await repository.createStoryEventResolution(resolutionInput)).resolution
        .resolvedMarketTick,
      tick == null ? null : tick === "2.5" ? 2.5 : 0,
    );
  });
}

Deno.test("storyline characterization resolution supplied zero/status/payload and unique-conflict reread sequence", async () => {
  const payload = { preserved: true };
  const existing = resolution({ result_payload: payload });
  const { client, repository } = setup({
    ...bad("duplicate", "23505"),
    data: resolution({ id: "ignored" }),
  }, ok(existing));
  const result = await repository.createStoryEventResolution({
    ...resolutionInput,
    resolvedMarketTick: 0,
    status: "failed",
    resultPayload: payload,
  });
  equal(client.calls, [
    ["from", "story_event_resolutions"],
    ["insert", {
      ...defaultRow,
      resolved_market_tick: 0,
      status: "failed",
      result_payload: payload,
    }],
    ...insertCalls.slice(2),
    ...existingCalls,
  ]);
  same((client.calls[1][1] as Record<string, unknown>).result_payload, payload);
  equal(result.status, "existing");
  equal(result.resolution.id, "resolution");
  same(result.resolution.resultPayload, payload);
});

Deno.test("storyline characterization resolution nonunique error never falls back", async () => {
  const { client, repository } = setup({ ...bad(), data: resolution() });
  await failure(
    () => repository.createStoryEventResolution(resolutionInput),
    "story_event_resolutions",
    "insert",
  );
  equal(client.calls, insertCalls);
});

for (const existing of [false, true]) {
  Deno.test(`storyline characterization resolution missing row boundary ${existing}`, async () => {
    const { client, repository } = setup(
      ...(existing ? [bad("duplicate", "23505"), ok(null)] : [ok(null)]),
    );
    await failure(
      () => repository.createStoryEventResolution(resolutionInput),
      "story_event_resolutions",
      existing ? "select" : "insert",
      existing
        ? "story_resolution_conflict_missing_row"
        : "story_resolution_insert_missing_row",
      existing
        ? "Story event resolution already exists but could not be loaded."
        : "Story event resolution insert returned no row.",
    );
    equal(client.calls, [...insertCalls, ...(existing ? existingCalls : [])]);
  });
}

Deno.test("storyline characterization unique-conflict reread error beats missing data", async () => {
  const { client, repository } = setup(bad("duplicate", "23505"), bad());
  await failure(
    () => repository.createStoryEventResolution(resolutionInput),
    "story_event_resolutions",
  );
  equal(client.calls, [...insertCalls, ...existingCalls]);
});

const payload = { value: ["identity"] };
const impactInput = {
  gameSessionId: "game",
  playerId: "player",
  storylineEventId: "event",
  effectType: "cash_credit",
  impactLabel: "label",
  impactReason: "reason",
  amount: 0,
  payload,
  idempotencyKey: "not-persisted",
};
const policyInput = {
  gameSessionId: "game",
  policyKey: "policy",
  policyType: "tax_modifier",
  scopeType: "game",
  scopeKey: null,
  startsAt: input.now,
  expiresAt: null,
  durationSeconds: 300,
  payload,
  sourceStoryEventId: "event",
  idempotencyKey: "not-persisted",
};
const flagInput = {
  gameSessionId: "game",
  flagKey: "flag",
  value: payload,
  sourceStoryEventId: "event",
  idempotencyKey: "not-persisted",
};
const writers = [
  {
    names: ["createPlayerStoryImpact", "createPlayerImpact"],
    table: "player_story_impacts",
    method: "insert",
    input: impactInput,
    row: {
      game_session_id: "game",
      player_id: "player",
      storyline_event_id: "event",
      effect_type: "cash_credit",
      impact_label: "label",
      impact_reason: "reason",
      amount: 0,
      payload,
    },
  },
  {
    names: ["upsertGameSessionPolicy", "upsertPolicy"],
    table: "game_session_policies",
    method: "upsert",
    input: policyInput,
    row: {
      game_session_id: "game",
      policy_key: "policy",
      policy_type: "tax_modifier",
      scope_type: "game",
      scope_key: null,
      starts_at: input.now,
      expires_at: null,
      payload,
      source_story_event_id: "event",
      is_active: true,
    },
    conflict: "game_session_id,policy_key",
  },
  {
    names: ["setGameSessionStoryFlag", "setStoryFlag"],
    table: "game_session_story_flags",
    method: "upsert",
    input: flagInput,
    row: {
      game_session_id: "game",
      flag_key: "flag",
      value: payload,
      source_story_event_id: "event",
    },
    conflict: "game_session_id,flag_key",
  },
];
for (const writer of writers) {
  for (const name of writer.names) {
    const calls = [
      ["from", writer.table],
      writer.conflict
        ? [writer.method, writer.row, { onConflict: writer.conflict }]
        : [writer.method, writer.row],
      ["select", "id"],
      ["maybeSingle"],
      ["await"],
    ];
    Deno.test(`storyline characterization write payload/result/identity ${name}`, async () => {
      const { client, repository } = setup(
        ok({ id: "written", ignored: true }),
      );
      const invoke = repository[name as keyof typeof repository] as (
        value: never,
      ) => Promise<unknown>;
      equal(await invoke.call(repository, writer.input as never), {
        id: "written",
      });
      equal(client.calls, calls);
      const row = client.calls[1][1] as Record<string, unknown>;
      same(row.payload ?? row.value, payload);
    });
    for (const data of [null, {}, { id: "" }, { id: 0 }, { id: 42 }]) {
      Deno.test(`storyline characterization write missing/falsy/coerced ID ${name} ${JSON.stringify(data)}`, async () => {
        const { client, repository } = setup(ok(data));
        const invoke = repository[name as keyof typeof repository] as (
          value: never,
        ) => Promise<unknown>;
        equal(
          await invoke.call(repository, writer.input as never),
          data && "id" in data && data.id ? { id: data.id } : {},
        );
        equal(client.calls, calls);
      });
    }
    Deno.test(`storyline characterization write error precedence ${name}`, async () => {
      const { client, repository } = setup({
        ...bad(),
        data: { id: "ignored" },
      });
      const invoke = repository[name as keyof typeof repository] as (
        value: never,
      ) => Promise<unknown>;
      await failure(
        () => invoke.call(repository, writer.input as never),
        writer.table,
        writer.method,
      );
      equal(client.calls, calls);
    });
  }
}
