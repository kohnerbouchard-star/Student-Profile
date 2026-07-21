import type { PlayerRequestScope } from "../../players/api/playerRequestScope.ts";
import {
  handlePlayerWorldRuntimeRequest,
  type PlayerWorldRuntimeService,
} from "./playerWorldRuntimeHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SCOPE: PlayerRequestScope = {
  playerUuid: "00000000-0000-4000-8000-000000000021",
  gameId: "00000000-0000-4000-8000-000000000001",
  activeSessionId: "00000000-0000-4000-8000-000000000011",
  sessionValid: true,
  sessionExpiresAt: "2026-07-22T00:00:00.000Z",
  authorizationContext: {
    actorType: "player",
    source: "player_session",
    gameScope: "session",
    resourceScope: "own_player",
  },
};
const JOURNEY = `trj_${"a".repeat(32)}`;
const QUOTE = `trq_${"b".repeat(32)}`;

Deno.test("context response is private and contains public runtime identifiers only", async () => {
  const response = await request("GET", "/players/me/world-runtime", null, service());
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store, private");
  const body = await response.text();
  for (const privateValue of [SCOPE.gameId, SCOPE.playerUuid, SCOPE.activeSessionId]) {
    assertEquals(body.includes(privateValue), false);
  }
  assertEquals(body.includes("loc_eldoran_capital_v1"), true);
});

Deno.test("arrival assignment accepts exact answers and server-derived scope", async () => {
  let captured: unknown = null;
  const response = await request(
    "POST",
    "/players/me/arrival-class",
    {
      answers: Array.from({ length: 8 }, (_, index) => ({
        questionId: `question-${index}`,
        optionId: `option-${index}`,
      })),
    },
    service({
      assignArrivalClass: async (input) => {
        captured = input;
        return context().arrival;
      },
    }),
    { "x-idempotency-key": "arrival-class-0001" },
  );
  assertEquals(response.status, 200);
  assertEquals((captured as { scope: PlayerRequestScope }).scope, SCOPE);
  assertEquals((captured as { idempotencyKey: string }).idempotencyKey, "arrival-class-0001");
  assertEquals(JSON.stringify(captured).includes("gameId"), true);
  assertEquals(JSON.stringify(await response.json()).includes(SCOPE.gameId), false);
});

Deno.test("travel quote, execution, completion, and residency use public IDs", async () => {
  const quoteResponse = await request(
    "POST",
    "/players/me/travel/quotes",
    { toLocationId: "loc_valerion_port_v1", allowedModes: ["land", "sea"] },
    service(),
  );
  assertEquals(quoteResponse.status, 200);
  assertEquals((await quoteResponse.json()).quote.publicQuoteId, QUOTE);

  const executeResponse = await request(
    "POST",
    "/players/me/travel",
    { quoteId: QUOTE },
    service(),
    { "x-idempotency-key": "travel-execute-0001" },
  );
  assertEquals(executeResponse.status, 200);
  assertEquals((await executeResponse.json()).journey.publicJourneyId, JOURNEY);

  const completeResponse = await request(
    "POST",
    `/players/me/travel/${JOURNEY}/complete`,
    {},
    service(),
  );
  assertEquals(completeResponse.status, 200);
  assertEquals((await completeResponse.json()).journey.publicJourneyId, JOURNEY);

  const residencyResponse = await request(
    "POST",
    "/players/me/residency",
    { countryId: "valerion", expectedRevision: 2 },
    service(),
  );
  assertEquals(residencyResponse.status, 200);
  assertEquals((await residencyResponse.json()).residency.pendingCountryId, "valerion");
});

Deno.test("request parsing rejects unknown keys, query parameters, internal IDs, and missing idempotency", async () => {
  const cases = [
    await request("GET", "/players/me/world-runtime?gameId=private", null, service()),
    await request("POST", "/players/me/travel/quotes", {
      toLocationId: SCOPE.gameId,
      allowedModes: ["land"],
    }, service()),
    await request("POST", "/players/me/travel", { quoteId: QUOTE, gameId: SCOPE.gameId }, service(), {
      "x-idempotency-key": "travel-execute-0002",
    }),
    await request("POST", "/players/me/travel", { quoteId: QUOTE }, service()),
    await request("POST", "/players/me/residency", {
      countryId: "valerion",
      expectedRevision: 1,
      demographicScore: 99,
    }, service()),
  ];
  assertEquals(cases.map((response) => response.status), [400, 400, 400, 400, 400]);
});

Deno.test("wrong methods, malformed JSON, and oversized bodies fail before service work", async () => {
  let calls = 0;
  const guarded = service({
    readContext: async () => {
      calls += 1;
      return context();
    },
  });
  const wrongMethod = await request("POST", "/players/me/world-runtime", {}, guarded);
  assertEquals(wrongMethod.status, 405);
  assertEquals(wrongMethod.headers.get("allow"), "GET");

  const malformed = await handlePlayerWorldRuntimeRequest(
    new Request("https://example.test/players/me/arrival-class", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "arrival-class-0002",
      },
      body: "{",
    }),
    { resolveScope: async () => SCOPE, service: guarded },
  );
  assertEquals(malformed.status, 400);

  const oversized = await handlePlayerWorldRuntimeRequest(
    new Request("https://example.test/players/me/arrival-class", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "20000",
        "x-idempotency-key": "arrival-class-0003",
      },
      body: JSON.stringify({ answers: [] }),
    }),
    { resolveScope: async () => SCOPE, service: guarded },
  );
  assertEquals(oversized.status, 413);
  assertEquals(calls, 0);
});

function context() {
  return {
    campaign: {
      status: "active" as const,
      phase: "arrival" as const,
      outcome: null,
      sequence: 1,
      currentLocationAffected: true,
      history: [],
    },
    arrival: {
      required: false,
      questionnaire: null,
      assignment: {
        classId: "analyst" as const,
        source: "questionnaire" as const,
        countryId: "eldoran",
        revision: 0,
        explanation: "Selected analyst by deterministic score.",
        scores: [{ classId: "analyst" as const, total: 18 }],
        economicRestrictions: [] as never[],
      },
    },
    travel: {
      state: {
        gameId: "not-public-in-response-contract",
        gameSessionId: "not-public-in-response-contract",
        playerUuid: "not-public-in-response-contract",
        currentLocationId: "loc_eldoran_capital_v1",
        status: "available" as const,
        activeJourneyId: null,
        arrivalAt: null,
        revision: 0,
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
      activeJourney: null,
    },
    residency: {
      currentCountryId: "eldoran",
      eligibleCountryIds: ["valerion"],
      pendingCountryId: "valerion",
      revision: 2,
      updatedAt: "2026-07-21T00:00:00.000Z",
    },
    world: {
      revision: 4,
      locations: [{
        publicLocationId: "loc_eldoran_capital_v1",
        availability: "normal" as const,
        revision: 0,
      }],
      routes: [{
        publicRouteId: "rte_eldoran_valerion_v1",
        status: "open" as const,
        reason: "normal" as const,
        costMultiplierBasisPoints: 10_000,
        durationMultiplierBasisPoints: 10_000,
        revision: 0,
      }],
    },
  };
}

function service(
  overrides: Partial<PlayerWorldRuntimeService> = {},
): PlayerWorldRuntimeService {
  return {
    readContext: async () => sanitizeContext(context()),
    assignArrivalClass: async () => context().arrival,
    createTravelQuote: async () => ({
      quote: {
        publicQuoteId: QUOTE,
        fromLocationId: "loc_eldoran_capital_v1",
        toLocationId: "loc_valerion_port_v1",
        currencyCode: "ELD",
        totalCostMinor: 100,
        totalDurationMinutes: 60,
        legs: [{
          publicRouteId: "rte_eldoran_valerion_v1",
          fromLocationId: "loc_eldoran_capital_v1",
          toLocationId: "loc_valerion_port_v1",
          mode: "land",
          costMinor: 100,
          durationMinutes: 60,
          routeRevision: 0,
        }],
        routeStateRevision: 4,
        status: "created",
        expiresAt: "2026-07-21T00:02:00.000Z",
      },
    }),
    executeTravel: async () => ({ journey: journey("in_transit") }),
    completeTravel: async () => ({ journey: journey("completed") }),
    requestResidencyChange: async () => context().residency,
    ...overrides,
  };
}

function journey(status: "in_transit" | "completed") {
  return {
    publicJourneyId: JOURNEY,
    publicQuoteId: QUOTE,
    fromLocationId: "loc_eldoran_capital_v1",
    toLocationId: "loc_valerion_port_v1",
    currencyCode: "ELD",
    totalCostMinor: 100,
    totalDurationMinutes: 60,
    status,
    departedAt: "2026-07-21T00:00:00.000Z",
    arrivalAt: "2026-07-21T01:00:00.000Z",
    completedAt: status === "completed" ? "2026-07-21T01:00:00.000Z" : null,
  };
}

function sanitizeContext(value: ReturnType<typeof context>) {
  return {
    ...value,
    travel: {
      ...value.travel,
      state: value.travel.state
        ? {
          currentLocationId: value.travel.state.currentLocationId,
          status: value.travel.state.status,
          activeJourneyId: value.travel.state.activeJourneyId,
          arrivalAt: value.travel.state.arrivalAt,
          revision: value.travel.state.revision,
          updatedAt: value.travel.state.updatedAt,
        } as never
        : null,
    },
  };
}

async function request(
  method: string,
  path: string,
  body: unknown,
  runtimeService: PlayerWorldRuntimeService,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handlePlayerWorldRuntimeRequest(
    new Request(`https://example.test${path}`, {
      method,
      headers: {
        ...(body === null ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === null ? undefined : JSON.stringify(body),
    }),
    {
      resolveScope: async () => SCOPE,
      service: runtimeService,
    },
  );
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
