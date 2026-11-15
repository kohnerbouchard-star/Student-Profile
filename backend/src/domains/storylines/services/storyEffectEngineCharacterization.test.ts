import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type { StoryEffect } from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectExecutionDependencies,
  StoryEffectExecutionInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import {
  executeStoryEffect,
  executeStoryEffects,
} from "./storyEffectEngine.ts";

declare const Deno: { test(name: string, run: () => Promise<void>): void };

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  }
}

const player: PlayerStoryContext = {
  playerId: "player-a",
  gameSessionId: "game-a",
  homeCountryId: null,
  homeCountryCode: null,
  currentCountryId: null,
  currentCountryCode: null,
  cashBalance: 10,
  resources: {},
  sectorExposurePct: {},
  countryExposurePct: {},
  activeContractKeys: [],
  completedContractKeys: [],
  storyFlags: {},
};
const route: JsonObject = {
  routeIds: ["rte_a", "rte_b"],
  status: "restricted",
  reason: "war",
  costMultiplierBasisPoints: 1000,
  durationMultiplierBasisPoints: 50000,
};
function fixture(effect: StoryEffect) {
  const writes: { kind: string; value: unknown }[] = [];
  const writer = (kind: string) => async (value: unknown) => {
    writes.push({ kind, value });
    return { id: kind };
  };
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: { recordCashAdjustment: writer("ledger") },
    impacts: { createPlayerImpact: writer("impact") },
    policies: { upsertPolicy: writer("policy") },
    flags: { setStoryFlag: writer("flag") },
    marketNews: { createMarketNews: writer("news") },
    world: {
      applyRouteState: writer("route"),
      applyLocationState: writer("location"),
    },
    currency: { applyCurrencyVolatility: writer("currency") },
  };
  const input: StoryEffectExecutionInput = {
    gameSessionId: "game-a",
    storylineEventId: "event-a",
    effectIndex: 7,
    now: "2026-01-01T00:00:00.000Z",
    playerContext: player,
    effect,
    dependencies,
  };
  return { input, writes };
}

for (
  const [key, value, message] of [
    ["routeIds", [], "is invalid."],
    ["routeIds", ["rte_a", "rte_a"], "contains duplicates."],
    ["routeIds", [" rte_a"], "is invalid."],
    [
      "routeIds",
      Array.from({ length: 101 }, (_, i) => `rte_${i}`),
      "is invalid.",
    ],
    ["status", "OPEN", "is invalid."],
    ["reason", "unknown", "is invalid."],
    ["costMultiplierBasisPoints", 999, "is invalid."],
    ["costMultiplierBasisPoints", "1000", "is invalid."],
    ["durationMultiplierBasisPoints", 50001, "is invalid."],
    ["durationMultiplierBasisPoints", 1000.5, "is invalid."],
  ] as const
) {
  Deno.test(`effect entrypoint rejects route ${key} ${JSON.stringify(value)}`, async () => {
    const { input, writes } = fixture({
      type: "world_route_state_change",
      payload: { ...route, [key]: value as never },
    });
    equal(await executeStoryEffect(input), {
      status: "failed",
      effectType: input.effect.type,
      effectIndex: 7,
      playerId: null,
      errorMessage: `world_route_state_change payload ${key} ${message}`,
    });
    equal(writes, []);
  });
}

for (
  const [adjustments, message] of [
    [null, "payload adjustmentsBasisPoints must be a JSON object."],
    [[], "payload adjustmentsBasisPoints must be a JSON object."],
    [{}, "requires at least one nonzero adjustment."],
    [{ NRC: 0 }, "requires at least one nonzero adjustment."],
    [{ ECO: 1 }, "keeps ECO as the zero-adjustment numeraire."],
    [
      { BAD: 1 },
      "adjustments must use official currency codes and integer basis points between -1500 and 1500.",
    ],
    [
      { NRC: 1501 },
      "adjustments must use official currency codes and integer basis points between -1500 and 1500.",
    ],
    [
      { NRC: -1501 },
      "adjustments must use official currency codes and integer basis points between -1500 and 1500.",
    ],
    [
      { NRC: 0.5 },
      "adjustments must use official currency codes and integer basis points between -1500 and 1500.",
    ],
  ] as const
) {
  Deno.test(`effect entrypoint rejects currency ${JSON.stringify(adjustments)}`, async () => {
    const { input, writes } = fixture({
      type: "currency_volatility",
      payload: { adjustmentsBasisPoints: adjustments as never },
    });
    const result = await executeStoryEffect(input);
    equal(result, {
      status: "failed",
      effectType: "currency_volatility",
      effectIndex: 7,
      playerId: null,
      errorMessage: `currency_volatility ${message}`,
    });
    equal(writes, []);
  });
}

Deno.test("game effect writers retain exact scope, keys, boundary values and frozen collections", async () => {
  const payloads: StoryEffect[] = [
    { type: "world_route_state_change", payload: route },
    {
      type: "world_location_state_change",
      payload: { locationIds: ["loc_a"], availability: "shortage" },
    },
    {
      type: "currency_volatility",
      payload: { adjustmentsBasisPoints: { ECO: 0, NRC: -1500, YRC: 1500 } },
    },
    { type: "market_news_post", payload: { shockKey: "  shock-a  " } },
  ];
  const { input, writes } = fixture(payloads[0]);
  const result = await executeStoryEffects({ ...input, effects: payloads });
  equal([result.appliedCount, result.skippedCount, result.failedCount], [
    4,
    0,
    0,
  ]);
  equal(result.results.map((r) => r.playerId), [null, null, null, null]);
  equal(writes.map((w) => w.kind), ["route", "location", "currency", "news"]);
  equal(
    writes.map((w) => (w.value as { idempotencyKey: string }).idempotencyKey),
    [
      "story_route:event-a:0",
      "story_location:event-a:1",
      "story_fx:event-a:2",
      "story_market_news:game-a:event-a:shock-a",
    ],
  );
  const values = writes.map((w) => w.value as Record<string, unknown>);
  for (const value of values) {
    equal([value.gameSessionId, value.storylineEventId], ["game-a", "event-a"]);
  }
  equal(values[0].costMultiplierBasisPoints, 1000);
  equal(values[0].durationMultiplierBasisPoints, 50000);
  equal(values[2].adjustmentsBasisPoints, { ECO: 0, NRC: -1500, YRC: 1500 });
  equal(
    values[3].payload === ("payload" in payloads[3] && payloads[3].payload),
    true,
  );
  equal(Object.isFrozen(values[0].routeIds), true);
  equal(Object.isFrozen(values[1].locationIds), true);
  equal(Object.isFrozen(values[2].adjustmentsBasisPoints), true);
});

Deno.test("missing optional writer precedes malformed game payload validation", async () => {
  for (
    const type of [
      "market_news_post",
      "world_route_state_change",
      "world_location_state_change",
      "currency_volatility",
    ] as const
  ) {
    const { input, writes } = fixture({ type, payload: {} });
    const {
      marketNews: _news,
      world: _world,
      currency: _currency,
      ...dependencies
    } = input.dependencies;
    equal(await executeStoryEffect({ ...input, dependencies }), {
      status: "skipped",
      effectType: type,
      effectIndex: 7,
      playerId: null,
      reason: "unsupported_effect_type",
    });
    equal(writes, []);
  }
});

Deno.test("route validation preserves first failure and batch continues after thrown non-Error", async () => {
  const { input, writes } = fixture({
    type: "world_route_state_change",
    payload: { routeIds: ["rte_a", "rte_a"], status: "bad" },
  });
  const first = await executeStoryEffect(input);
  equal(
    first.status === "failed" && first.errorMessage,
    "world_route_state_change payload routeIds contains duplicates.",
  );
  const result = await executeStoryEffects({
    ...input,
    dependencies: {
      ...input.dependencies,
      currency: {
        async applyCurrencyVolatility() {
          throw "currency failure";
        },
      },
    },
    effects: [
      {
        type: "currency_volatility",
        payload: { adjustmentsBasisPoints: { NRC: 1 } },
      },
      { type: "story_flag_set", flagKey: "flag-a", value: true },
    ],
  });
  equal(result.results[0], {
    status: "failed",
    effectType: "currency_volatility",
    effectIndex: 0,
    playerId: null,
    errorMessage: "currency failure",
  });
  equal([result.appliedCount, result.failedCount], [1, 1]);
  equal(writes.map((w) => w.kind), ["flag"]);
});

Deno.test("policy scope, payload override, expiry and policy-before-impact order are retained", async () => {
  const { input, writes } = fixture({
    type: "tax_modifier",
    policyKey: "tax-a",
    durationSeconds: 120,
    label: "label",
    reason: "reason",
    payload: { label: "old", reason: "old", rate: 5 },
  });
  const result = await executeStoryEffect(input);
  equal(result.status === "applied" && result.appliedWriteIds, [
    "policy",
    "impact",
  ]);
  const policy = writes[0].value as Record<string, unknown>;
  equal([policy.scopeType, policy.scopeKey, policy.expiresAt], [
    "player",
    "player-a",
    "2026-01-01T00:02:00.000Z",
  ]);
  equal(policy.payload, { label: "label", reason: "reason", rate: 5 });
  equal(
    policy.idempotencyKey,
    "story_effect:game-a:event-a:7:tax_modifier:player-a:policy",
  );
  writes.length = 0;
  await executeStoryEffect({
    ...input,
    policyScope: { scopeType: "global", scopeKey: null },
  });
  equal(writes.map((w) => w.kind), ["policy"]);
  equal(
    (writes[0].value as Record<string, unknown>).idempotencyKey,
    "story_effect:game-a:event-a:7:tax_modifier:game:policy",
  );
});

Deno.test("policy null duration bypasses invalid now while finite duration fails before writes", async () => {
  const { input, writes } = fixture({
    type: "immigration_lock",
    policyKey: "lock",
    durationSeconds: null,
    label: null,
    reason: null,
    payload: {},
  });
  equal(
    (await executeStoryEffect({ ...input, now: "invalid" })).status,
    "applied",
  );
  equal(writes.map((w) => w.kind), ["policy"]);
  writes.length = 0;
  equal(
    await executeStoryEffect({
      ...input,
      now: "invalid",
      effect: { ...input.effect, durationSeconds: 1 } as StoryEffect,
    }),
    {
      status: "failed",
      effectType: "immigration_lock",
      effectIndex: 7,
      playerId: "player-a",
      errorMessage: "now must be an ISO date string.",
    },
  );
  equal(writes, []);
});

Deno.test("policy writer rejection prevents impact and preserves player failure scope", async () => {
  const { input, writes } = fixture({
    type: "tax_modifier",
    policyKey: "tax",
    durationSeconds: null,
    label: "label",
    reason: "reason",
    payload: {},
  });
  const result = await executeStoryEffect({
    ...input,
    dependencies: {
      ...input.dependencies,
      policies: {
        async upsertPolicy() {
          throw new Error("policy rejected");
        },
      },
    },
  });
  equal(result, {
    status: "failed",
    effectType: "tax_modifier",
    effectIndex: 7,
    playerId: "player-a",
    errorMessage: "policy rejected",
  });
  equal(writes, []);
});
