import type {
  PlayerTravelContext,
  WorldDefinitionBundle,
  WorldLocationDefinition,
  WorldRouteDefinition,
} from "../contracts/worldRuntimeContracts.ts";
import {
  applyLocationAvailability,
  applyRouteStateCommand,
  createResidencyState,
  createWorldRuntimeState,
  quoteTravel,
  requestResidencyChange,
  validateWorldDefinition,
} from "./worldRouteGraph.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const BUNDLE = buildBundle();
const NOW = "2026-07-21T00:00:00.000Z";

Deno.test("world definition requires exactly 50 verified public locations", () => {
  validateWorldDefinition(BUNDLE);
  assertEquals(BUNDLE.locations.length, 50);
  assertEquals(new Set(BUNDLE.locations.map((location) => location.publicLocationId)).size, 50);
  assertThrowsCode(
    () => validateWorldDefinition({ ...BUNDLE, locations: BUNDLE.locations.slice(0, 49) }),
    "world_definition_invalid",
  );
  assertThrowsCode(
    () => validateWorldDefinition({
      ...BUNDLE,
      routes: [...BUNDLE.routes, {
        ...BUNDLE.routes[0]!,
        publicRouteId: "rte_invalid_endpoint",
        toLocationId: "loc_missing",
      }],
    }),
    "world_definition_invalid",
  );
});

Deno.test("land, sea, air, and Meridian routes quote deterministically", () => {
  const state = createWorldRuntimeState(BUNDLE, "game-1", NOW);
  const cases = [
    ["loc_c0_capital", "loc_c0_city", "land", "rte_land_c0_0"],
    ["loc_c0_port", "loc_c1_port", "sea", "rte_sea_0"],
    ["loc_c0_airport", "loc_c1_airport", "air", "rte_air_0"],
    ["loc_c0_meridian", "loc_c1_meridian", "meridian", "rte_meridian_0"],
  ] as const;
  for (const [from, to, mode, routeId] of cases) {
    const quote = quoteTravel(BUNDLE, state, context(from, [mode]), to);
    assertEquals(quote.legs.length, 1);
    assertEquals(quote.legs[0]?.publicRouteId, routeId);
    assertEquals(quote.legs[0]?.mode, mode);
    assertEquals(quote.totalCostMinor >= 0, true);
    assertEquals(quote.totalDurationMinutes > 0, true);
  }
});

Deno.test("route closures, restrictions, shortages, conflict, and reopening are replay safe", () => {
  const initial = createWorldRuntimeState(BUNDLE, "game-1", NOW);
  const closed = applyRouteStateCommand(initial, BUNDLE, {
    commandKey: "campaign:war:close-sea-0",
    gameId: "game-1",
    publicRouteIds: ["rte_sea_0"],
    status: "closed",
    reason: "war",
    costMultiplierBasisPoints: 10_000,
    durationMultiplierBasisPoints: 10_000,
    expectedRevision: 0,
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertThrowsCode(
    () => quoteTravel(BUNDLE, closed, context("loc_c0_port", ["sea"]), "loc_c1_port"),
    "world_route_not_found",
  );
  const replay = applyRouteStateCommand(closed, BUNDLE, {
    commandKey: "campaign:war:close-sea-0",
    gameId: "game-1",
    publicRouteIds: ["rte_sea_0"],
    status: "closed",
    reason: "war",
    costMultiplierBasisPoints: 10_000,
    durationMultiplierBasisPoints: 10_000,
    expectedRevision: 0,
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(replay.revision, closed.revision);

  const reopened = applyRouteStateCommand(closed, BUNDLE, {
    commandKey: "campaign:recovery:reopen-sea-0",
    gameId: "game-1",
    publicRouteIds: ["rte_sea_0"],
    status: "restricted",
    reason: "recovery",
    costMultiplierBasisPoints: 12_500,
    durationMultiplierBasisPoints: 15_000,
    expectedRevision: 1,
    occurredAt: "2026-07-21T02:00:00.000Z",
  });
  const base = quoteTravel(BUNDLE, initial, context("loc_c0_port", ["sea"]), "loc_c1_port");
  const restricted = quoteTravel(BUNDLE, reopened, context("loc_c0_port", ["sea"]), "loc_c1_port");
  assertEquals(restricted.totalCostMinor > base.totalCostMinor, true);
  assertEquals(restricted.totalDurationMinutes > base.totalDurationMinutes, true);

  const shortage = applyLocationAvailability({
    state: reopened,
    bundle: BUNDLE,
    gameId: "game-1",
    commandKey: "campaign:shortage:c1-port",
    publicLocationIds: ["loc_c1_port"],
    availability: "shortage",
    expectedRevision: 2,
    occurredAt: "2026-07-21T03:00:00.000Z",
  });
  const shortageQuote = quoteTravel(BUNDLE, shortage, context("loc_c0_port", ["sea"]), "loc_c1_port");
  assertEquals(shortageQuote.totalCostMinor > restricted.totalCostMinor, true);

  const conflict = applyLocationAvailability({
    state: shortage,
    bundle: BUNDLE,
    gameId: "game-1",
    commandKey: "campaign:war:c1-port",
    publicLocationIds: ["loc_c1_port"],
    availability: "conflict",
    expectedRevision: 3,
    occurredAt: "2026-07-21T04:00:00.000Z",
  });
  const conflictQuote = quoteTravel(BUNDLE, conflict, context("loc_c0_port", ["sea"]), "loc_c1_port");
  assertEquals(conflictQuote.totalDurationMinutes > restricted.totalDurationMinutes, true);
});

Deno.test("impossible routes, closed locations, forbidden modes, and wrong games fail closed", () => {
  const initial = createWorldRuntimeState(BUNDLE, "game-1", NOW);
  assertThrowsCode(
    () => quoteTravel(BUNDLE, initial, context("loc_c0_capital", ["land"]), "loc_c1_capital"),
    "world_route_not_found",
  );
  assertThrowsCode(
    () => quoteTravel(BUNDLE, initial, context("loc_c0_port", []), "loc_c1_port"),
    "world_travel_mode_forbidden",
  );
  const closed = applyLocationAvailability({
    state: initial,
    bundle: BUNDLE,
    gameId: "game-1",
    commandKey: "admin:close:c1-port",
    publicLocationIds: ["loc_c1_port"],
    availability: "closed",
    expectedRevision: 0,
    occurredAt: "2026-07-21T01:00:00.000Z",
  });
  assertThrowsCode(
    () => quoteTravel(BUNDLE, closed, context("loc_c0_port", ["sea"]), "loc_c1_port"),
    "world_location_unavailable",
  );
  assertThrowsCode(
    () => quoteTravel(BUNDLE, initial, { ...context("loc_c0_port", ["sea"]), gameId: "game-2" }, "loc_c1_port"),
    "world_game_scope_mismatch",
  );
});

Deno.test("later residency uses public eligibility only and is revision safe", () => {
  const residency = createResidencyState({
    gameId: "game-1",
    gameSessionId: "session-1",
    playerUuid: "player-1",
    currentCountryId: "country-0",
    currencyCode: "ELD",
    eligibleCountryIds: ["country-1", "country-2", "country-1"],
    now: NOW,
  });
  assertEquals(residency.eligibleCountryIds, ["country-1", "country-2"]);
  const requested = requestResidencyChange(residency, {
    gameId: "game-1",
    expectedRevision: 0,
    countryId: "country-2",
    requestedAt: "2026-07-21T01:00:00.000Z",
  });
  assertEquals(requested.pendingCountryId, "country-2");
  assertThrowsCode(() => requestResidencyChange(requested, {
    gameId: "game-1",
    expectedRevision: 0,
    countryId: "country-1",
    requestedAt: "2026-07-21T02:00:00.000Z",
  }), "world_revision_conflict");
  assertThrowsCode(() => requestResidencyChange(requested, {
    gameId: "game-1",
    expectedRevision: 1,
    countryId: "country-9",
    requestedAt: "2026-07-21T02:00:00.000Z",
  }), "world_command_invalid");
});

function context(
  currentLocationId: string,
  allowedModes: PlayerTravelContext["allowedModes"],
): PlayerTravelContext {
  return {
    gameId: "game-1",
    gameSessionId: "session-1",
    playerUuid: "player-1",
    currentLocationId,
    allowedModes,
    residency: createResidencyState({
      gameId: "game-1",
      gameSessionId: "session-1",
      playerUuid: "player-1",
      currentCountryId: "country-0",
      currencyCode: "ELD",
      eligibleCountryIds: ["country-1"],
      now: NOW,
    }),
  };
}

function buildBundle(): WorldDefinitionBundle {
  const locations: WorldLocationDefinition[] = [];
  const routes: WorldRouteDefinition[] = [];
  const kinds = ["capital", "city", "port", "airport", "meridian_hub"] as const;
  for (let country = 0; country < 10; country += 1) {
    for (const kind of kinds) {
      locations.push({
        publicLocationId: `loc_c${country}_${kind === "meridian_hub" ? "meridian" : kind}`,
        countryId: `country-${country}`,
        name: `Country ${country} ${kind}`,
        kind,
        enabled: true,
      });
    }
    const chain = ["capital", "city", "port", "airport", "meridian"];
    for (let index = 0; index < chain.length - 1; index += 1) {
      routes.push({
        publicRouteId: `rte_land_c${country}_${index}`,
        fromLocationId: `loc_c${country}_${chain[index]}`,
        toLocationId: `loc_c${country}_${chain[index + 1]}`,
        mode: "land",
        bidirectional: true,
        baseCostMinor: 100 + index * 25,
        baseDurationMinutes: 30 + index * 10,
      });
    }
  }
  for (let country = 0; country < 9; country += 1) {
    routes.push({
      publicRouteId: `rte_sea_${country}`,
      fromLocationId: `loc_c${country}_port`,
      toLocationId: `loc_c${country + 1}_port`,
      mode: "sea",
      bidirectional: true,
      baseCostMinor: 500,
      baseDurationMinutes: 240,
    });
    routes.push({
      publicRouteId: `rte_air_${country}`,
      fromLocationId: `loc_c${country}_airport`,
      toLocationId: `loc_c${country + 1}_airport`,
      mode: "air",
      bidirectional: true,
      baseCostMinor: 900,
      baseDurationMinutes: 90,
    });
    routes.push({
      publicRouteId: `rte_meridian_${country}`,
      fromLocationId: `loc_c${country}_meridian`,
      toLocationId: `loc_c${country + 1}_meridian`,
      mode: "meridian",
      bidirectional: true,
      baseCostMinor: 1_200,
      baseDurationMinutes: 20,
    });
  }
  return {
    definition: {
      packId: "econovaria.beta-seed-pack.v1",
      packVersion: "1.0.0-beta",
      definitionDigest: "sha256:world-definition",
    },
    locations,
    routes,
  };
}

function assertThrowsCode(run: () => unknown, expectedCode: string): void {
  try {
    run();
  } catch (error) {
    assertEquals((error as { code?: string }).code, expectedCode);
    return;
  }
  throw new Error(`Expected error ${expectedCode}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
