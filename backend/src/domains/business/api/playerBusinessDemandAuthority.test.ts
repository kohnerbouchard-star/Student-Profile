import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";
import { executePlayerBusinessMutation } from "./playerBusinessMutationExecutor.ts";
import {
  PlayerBusinessError,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;

Deno.test("Player Business rejects browser-authored demand before scope resolution", async () => {
  let scopeCalls = 0;
  let executeCalls = 0;
  const response = await handlePlayerBusinessRequest(
    request({ ...validBody(), baseDemandUnits: 50_000 }),
    { kind: "businessProductCreate" },
    dependencies({
      resolveScope: () => {
        scopeCalls += 1;
        return Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID });
      },
      execute: () => {
        executeCalls += 1;
        return Promise.resolve({ outcome: "unexpected" });
      },
    }),
  );

  assertEquals(response.status, 400);
  const body = await response.json();
  assertEquals(body.error.code, "invalid_business_request");
  assertEquals(
    body.error.message,
    "Unexpected request field: baseDemandUnits.",
  );
  assertEquals(scopeCalls, 0);
  assertEquals(executeCalls, 0);
});

Deno.test("Player Business retained product command supplies neutral server-owned demand", async () => {
  let command = "";
  let args: Record<string, unknown> = {};
  const response = await handlePlayerBusinessRequest(
    request(validBody()),
    { kind: "businessProductCreate" },
    dependencies({
      execute: (nextCommand, nextArgs) => {
        command = nextCommand;
        args = { ...nextArgs };
        return Promise.resolve({ outcome: "applied" });
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(command, "submit_business_product_v1");
  assertEquals(args.p_base_demand_units, 0);
  assertEquals(Object.hasOwn(args, "baseDemandUnits"), false);
});

Deno.test("Player Business retires direct acquisition before any economic command", async () => {
  let executeCalls = 0;
  let economicContextCalls = 0;
  const response = await handlePlayerBusinessRequest(
    request({
      legalName: "Retired Acquisition LLC",
      entityType: "sole_proprietorship",
      industryCode: "manufacturing",
      capitalization: 100,
      acquireBusinessKey: BUSINESS_KEY,
      idempotencyKey: "business-direct-acquisition-retired-0001",
    }, "/players/me/businesses"),
    { kind: "businessCreate", operation: "directCreate" },
    dependencies({
      readEconomicContext: () => {
        economicContextCalls += 1;
        return Promise.resolve({ countryCode: "NRC", currencyCode: "NRC" });
      },
      execute: () => {
        executeCalls += 1;
        return Promise.resolve({ outcome: "unexpected" });
      },
    }),
  );

  assertEquals(response.status, 410);
  const body = await response.json();
  assertEquals(body.error.code, "business_direct_acquisition_retired");
  assertEquals(economicContextCalls, 0);
  assertEquals(executeCalls, 0);
});

Deno.test("Player Business rejects malformed retired acquisition intent before scope resolution", async () => {
  for (
    const acquireBusinessKey of [
      null,
      "",
      "   ",
      123,
      {},
      [],
      "00000000-0000-4000-8000-000000000001",
      `pla_${"a".repeat(32)}`,
    ]
  ) {
    let scopeCalls = 0;
    let executeCalls = 0;
    const response = await handlePlayerBusinessRequest(
      request({
        legalName: "Malformed Acquisition LLC",
        entityType: "sole_proprietorship",
        industryCode: "manufacturing",
        capitalization: 100,
        acquireBusinessKey,
        idempotencyKey: "business-direct-acquisition-malformed-0001",
      }, "/players/me/businesses"),
      { kind: "businessCreate", operation: "directCreate" },
      dependencies({
        resolveScope: () => {
          scopeCalls += 1;
          return Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID });
        },
        execute: () => {
          executeCalls += 1;
          return Promise.resolve({ outcome: "unexpected" });
        },
      }),
    );

    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error.code, "invalid_business_request");
    assertEquals(body.error.message, "acquireBusinessKey is invalid.");
    assertEquals(scopeCalls, 0);
    assertEquals(executeCalls, 0);
  }
});

Deno.test("Player Business mutation executor fails closed on malformed retired acquisition intent", async () => {
  let economicContextCalls = 0;
  let executeCalls = 0;
  const repository = {
    readEconomicContext: () => {
      economicContextCalls += 1;
      return Promise.resolve({ countryCode: "NRC", currencyCode: "NRC" });
    },
    readBusiness: () => Promise.reject(new Error("Unexpected read.")),
    execute: () => {
      executeCalls += 1;
      return Promise.resolve({ outcome: "unexpected" });
    },
  } as PlayerBusinessRepository;

  for (const acquireBusinessKey of [null, 123, {}, `pla_${"a".repeat(32)}`]) {
    let observed: unknown;
    try {
      await executePlayerBusinessMutation(
        repository,
        { kind: "businessCreate", operation: "directCreate" },
        {
          legalName: "Malformed Acquisition LLC",
          entityType: "sole_proprietorship",
          industryCode: "manufacturing",
          capitalization: 100,
          acquireBusinessKey,
          idempotencyKey: "business-direct-acquisition-malformed-0002",
        },
        { gameSessionId: GAME_ID, playerId: PLAYER_ID },
      );
    } catch (error) {
      observed = error;
    }

    assertEquals(observed instanceof PlayerBusinessError, true);
    assertEquals((observed as PlayerBusinessError).status, 400);
    assertEquals(
      (observed as PlayerBusinessError).code,
      "invalid_business_request",
    );
  }

  assertEquals(economicContextCalls, 0);
  assertEquals(executeCalls, 0);
});

Deno.test("Player Business retained direct formation sends no acquisition intent", async () => {
  let command = "";
  let args: Record<string, unknown> = {};
  const response = await handlePlayerBusinessRequest(
    request({
      legalName: "Neutral Formation LLC",
      entityType: "sole_proprietorship",
      industryCode: "manufacturing",
      capitalization: 100,
      idempotencyKey: "business-direct-formation-neutral-0001",
    }, "/players/me/businesses"),
    { kind: "businessCreate", operation: "directCreate" },
    dependencies({
      execute: (nextCommand, nextArgs) => {
        command = nextCommand;
        args = { ...nextArgs };
        return Promise.resolve({ outcome: "applied" });
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(command, "create_or_acquire_player_business_v1");
  assertEquals(args.p_acquire_business_key, null);
});

function validBody(): Record<string, unknown> {
  return {
    businessKey: BUSINESS_KEY,
    name: "Alloy Form",
    category: "manufacturing",
    unitPrice: 10,
    unitInputCost: 4,
    unitLaborCost: 1,
    capacityUnits: 100,
    qualityScore: 60,
    idempotencyKey: "business-product-authority-0001",
  };
}

function dependencies(overrides: {
  readonly resolveScope?: () => Promise<{
    readonly gameId: string;
    readonly playerUuid: string;
  }>;
  readonly execute?: (
    command: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>;
  readonly readEconomicContext?: () => Promise<{
    readonly countryCode: string;
    readonly currencyCode: string;
  }>;
} = {}) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: overrides.resolveScope ??
      (() => Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID })),
    createRepository: () => ({
      readEconomicContext: overrides.readEconomicContext ??
        (() => Promise.resolve({ countryCode: "NRC", currencyCode: "NRC" })),
      readBusiness: () => Promise.reject(new Error("Unexpected read.")),
      execute: overrides.execute ??
        (() => Promise.resolve({ outcome: "applied" })),
    }),
  };
}

function request(
  body: unknown,
  path = "/players/me/business/products",
): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "session-token",
    },
    body: JSON.stringify(body),
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
