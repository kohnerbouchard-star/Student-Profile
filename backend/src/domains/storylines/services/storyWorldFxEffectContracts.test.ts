import {
  parseStoryEffect,
} from "../contracts/storyEffectContracts.ts";
import {
  executeStoryEffect,
} from "./storyEffectEngine.ts";
import type {
  StoryEffectExecutionDependencies,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";

Deno.test("Story World and FX effects parse as bounded game effects", () => {
  const route = parseStoryEffect({
    type: "world_route_state_change",
    payload: {
      routeIds: ["rte_meridian_north_v1"],
      status: "closed",
      reason: "meridian_disruption",
      costMultiplierBasisPoints: 15000,
      durationMultiplierBasisPoints: 20000,
    },
  });
  const location = parseStoryEffect({
    type: "world_location_state_change",
    payload: {
      locationIds: ["loc_lumenor_meridian_junction_v1"],
      availability: "conflict",
    },
  });
  const fx = parseStoryEffect({
    type: "currency_volatility",
    payload: {
      adjustmentsBasisPoints: {
        NRC: -250,
        YRC: -120,
        VAL: 0,
        XAL: 180,
      },
    },
  });

  assertEquals(route.type, "world_route_state_change");
  assertEquals(location.type, "world_location_state_change");
  assertEquals(fx.type, "currency_volatility");
});

Deno.test("Story World and FX effects execute through purpose-built game ports", async () => {
  const writes: string[] = [];
  const dependencies = buildDependencies(writes);

  const route = await executeStoryEffect({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    storylineEventId: "00000000-0000-4000-8000-000000000002",
    effectIndex: 0,
    now: "2026-08-12T04:00:00.000Z",
    effect: parseStoryEffect({
      type: "world_route_state_change",
      payload: {
        routeIds: ["rte_meridian_north_v1"],
        status: "restricted",
        reason: "meridian_disruption",
        costMultiplierBasisPoints: 12500,
        durationMultiplierBasisPoints: 17500,
      },
    }),
    dependencies,
  });

  const location = await executeStoryEffect({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    storylineEventId: "00000000-0000-4000-8000-000000000002",
    effectIndex: 1,
    now: "2026-08-12T04:00:00.000Z",
    effect: parseStoryEffect({
      type: "world_location_state_change",
      payload: {
        locationIds: ["loc_lumenor_meridian_junction_v1"],
        availability: "conflict",
      },
    }),
    dependencies,
  });

  const currency = await executeStoryEffect({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    storylineEventId: "00000000-0000-4000-8000-000000000002",
    effectIndex: 2,
    now: "2026-08-12T04:00:00.000Z",
    effect: parseStoryEffect({
      type: "currency_volatility",
      payload: {
        adjustmentsBasisPoints: {
          NRC: -250,
          VAL: 0,
          XAL: 180,
        },
      },
    }),
    dependencies,
  });

  assertEquals(route.status, "applied");
  assertEquals(location.status, "applied");
  assertEquals(currency.status, "applied");
  assertEquals(writes, ["route", "location", "currency"]);
});

Deno.test("currency volatility rejects non-official or out-of-bound adjustments", async () => {
  const result = await executeStoryEffect({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    storylineEventId: "00000000-0000-4000-8000-000000000002",
    effectIndex: 0,
    now: "2026-08-12T04:00:00.000Z",
    effect: parseStoryEffect({
      type: "currency_volatility",
      payload: {
        adjustmentsBasisPoints: {
          VAL: 0,
          BAD: 2000,
        },
      },
    }),
    dependencies: buildDependencies([]),
  });

  assertEquals(result.status, "failed");
});

function buildDependencies(writes: string[]): StoryEffectExecutionDependencies {
  const write = async (): Promise<StoryWriteResult> => ({});
  return {
    ledger: { recordCashAdjustment: write },
    policies: { upsertPolicy: write },
    flags: { setStoryFlag: write },
    impacts: { createPlayerImpact: write },
    world: {
      applyRouteState: async () => {
        writes.push("route");
        return {};
      },
      applyLocationState: async () => {
        writes.push("location");
        return {};
      },
    },
    currency: {
      applyCurrencyVolatility: async () => {
        writes.push("currency");
        return {};
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
