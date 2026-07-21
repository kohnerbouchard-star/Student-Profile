import type {
  PlayerTravelContext,
  TravelQuote,
  WorldRuntimeState,
} from "../contracts/worldRuntimeContracts.ts";
import {
  prepareStoredTravelQuote,
  validateStoredTravelQuoteForExecution,
} from "./playerTravelService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const NOW = "2026-07-21T00:00:00.000Z";
const STATE: WorldRuntimeState = {
  gameId: "game-1",
  definition: {
    packId: "econovaria.beta-seed-pack.v1",
    packVersion: "1.0.0-beta",
    definitionDigest: "sha256:world",
  },
  locationStates: [],
  routeStates: [
    {
      publicRouteId: "rte_land_1",
      status: "open",
      reason: "normal",
      costMultiplierBasisPoints: 10_000,
      durationMultiplierBasisPoints: 10_000,
      revision: 4,
      updatedAt: NOW,
    },
  ],
  executedCommandKeys: [],
  revision: 9,
  updatedAt: NOW,
};
const CONTEXT: PlayerTravelContext = {
  gameId: "game-1",
  gameSessionId: "session-1",
  playerUuid: "player-1",
  currentLocationId: "loc_origin",
  settlementCurrencyCode: "ELD",
  allowedModes: ["land"],
  residency: {
    gameId: "game-1",
    gameSessionId: "session-1",
    playerUuid: "player-1",
    currentCountryId: "eldoran",
    eligibleCountryIds: [],
    pendingCountryId: null,
    revision: 0,
    updatedAt: NOW,
  },
};
const QUOTE: TravelQuote = {
  gameId: "game-1",
  playerUuid: "player-1",
  fromLocationId: "loc_origin",
  toLocationId: "loc_destination",
  totalCostMinor: 125,
  totalDurationMinutes: 45,
  legs: [
    {
      publicRouteId: "rte_land_1",
      fromLocationId: "loc_origin",
      toLocationId: "loc_destination",
      mode: "land",
      costMinor: 125,
      durationMinutes: 45,
    },
  ],
  routeStateRevision: 9,
};

Deno.test("stored travel quote binds currency and every route revision", () => {
  const stored = prepareStoredTravelQuote({
    quote: QUOTE,
    state: STATE,
    context: CONTEXT,
    publicQuoteId: `trq_${"a".repeat(32)}`,
    createdAt: NOW,
  });
  assertEquals(stored.currencyCode, "ELD");
  assertEquals(stored.legs[0]?.routeRevision, 4);
  assertEquals(stored.expiresAt, "2026-07-21T00:02:00.000Z");
  validateStoredTravelQuoteForExecution({
    quote: stored,
    gameId: "game-1",
    playerUuid: "player-1",
    currentLocationId: "loc_origin",
    now: "2026-07-21T00:01:59.000Z",
  });
});

Deno.test("stored travel quote rejects missing currency, stale world revision, and closed routes", () => {
  assertThrowsCode(() => prepareStoredTravelQuote({
    quote: QUOTE,
    state: STATE,
    context: { ...CONTEXT, settlementCurrencyCode: undefined },
    publicQuoteId: `trq_${"a".repeat(32)}`,
    createdAt: NOW,
  }), "world_travel_quote_invalid");
  assertThrowsCode(() => prepareStoredTravelQuote({
    quote: { ...QUOTE, routeStateRevision: 8 },
    state: STATE,
    context: CONTEXT,
    publicQuoteId: `trq_${"a".repeat(32)}`,
    createdAt: NOW,
  }), "world_travel_quote_invalid");
  assertThrowsCode(() => prepareStoredTravelQuote({
    quote: QUOTE,
    state: {
      ...STATE,
      routeStates: [{ ...STATE.routeStates[0]!, status: "closed" }],
    },
    context: CONTEXT,
    publicQuoteId: `trq_${"a".repeat(32)}`,
    createdAt: NOW,
  }), "world_travel_quote_invalid");
});

Deno.test("execution validation rejects expiry, wrong scope, and stale origin", () => {
  const stored = prepareStoredTravelQuote({
    quote: QUOTE,
    state: STATE,
    context: CONTEXT,
    publicQuoteId: `trq_${"b".repeat(32)}`,
    createdAt: NOW,
  });
  assertThrowsCode(() => validateStoredTravelQuoteForExecution({
    quote: stored,
    gameId: "game-1",
    playerUuid: "player-1",
    currentLocationId: "loc_origin",
    now: "2026-07-21T00:02:00.000Z",
  }), "world_travel_quote_expired");
  assertThrowsCode(() => validateStoredTravelQuoteForExecution({
    quote: stored,
    gameId: "game-2",
    playerUuid: "player-1",
    currentLocationId: "loc_origin",
    now: "2026-07-21T00:01:00.000Z",
  }), "world_game_scope_mismatch");
  assertThrowsCode(() => validateStoredTravelQuoteForExecution({
    quote: stored,
    gameId: "game-1",
    playerUuid: "player-1",
    currentLocationId: "loc_other",
    now: "2026-07-21T00:01:00.000Z",
  }), "world_travel_quote_invalid");
});

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
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
