import { handlePlayerBankingPublicRequest } from "./playerBankingPublicHttpHandler.ts";
import { readPlayerBankingPublicRoutePath } from "./playerBankingPublicRoutePaths.ts";
import type {
  PlayerBankingPublicRepository,
} from "../contracts/playerBankingPublicContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";

Deno.test("Player Banking parser accepts only the reviewed collection route", () => {
  assertEquals(readPlayerBankingPublicRoutePath("/players/me/ledger"), {
    kind: "banking",
  });
  assertEquals(
    readPlayerBankingPublicRoutePath(
      "/functions/v1/classroom-api/players/me/ledger",
    ),
    { kind: "banking" },
  );
  assertEquals(readPlayerBankingPublicRoutePath("/players/me/ledger/private"), null);
});

Deno.test("Player Banking returns cross-currency public data and a safe next cursor", async () => {
  const repository = new FixtureRepository();
  const response = await handlePlayerBankingPublicRequest(
    request("GET", "/players/me/ledger?limit=2"),
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(body.currentBalances, [
    { accountType: "cash", balance: 1250, currencyCode: "ECO" },
    { accountType: "cash", balance: 40, currencyCode: "LUM" },
  ]);
  assertEquals(body.ledgerEntries.map((entry: any) => entry.entryKey), [
    "ledger_1",
    "ledger_2",
  ]);
  assertEquals(body.ledgerEntries.map((entry: any) => entry.currencyCode), [
    "ECO",
    "LUM",
  ]);
  assertEquals(body.pagination, {
    limit: 2,
    hasMore: true,
    nextCursor: "offset_2",
  });
  assertEquals(body.generatedAt, "2026-07-19T04:00:00.000Z");
  assertEquals(body.staleAt, "2026-07-19T04:02:00.000Z");
  assertEquals(repository.inputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    limit: 2,
    offset: 0,
  });
  assertNoUuid(body);
});

Deno.test("Player Banking cursor advances response-local public keys", async () => {
  const repository = new FixtureRepository();
  const response = await handlePlayerBankingPublicRequest(
    request("GET", "/players/me/ledger?limit=2&cursor=offset_2"),
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ledgerEntries.map((entry: any) => entry.entryKey), [
    "ledger_3",
    "ledger_4",
  ]);
  assertEquals(repository.inputs[0].offset, 2);
  assertNoUuid(body);
});

Deno.test("Player Banking empty state is a normal bounded response", async () => {
  const repository: PlayerBankingPublicRepository = {
    readPage: () => Promise.resolve({ balances: [], entries: [], hasMore: false }),
  };
  const response = await handlePlayerBankingPublicRequest(
    request("GET", "/players/me/ledger"),
    dependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.currentBalances, []);
  assertEquals(body.ledgerEntries, []);
  assertEquals(body.pagination.nextCursor, null);
  assertEquals(body.pagination.hasMore, false);
});

Deno.test("Player Banking rejects malformed pagination and browser-owned scope", async () => {
  const repository = new FixtureRepository();
  const cases = [
    request("GET", "/players/me/ledger?cursor=unsafe"),
    request("GET", "/players/me/ledger?limit=101"),
    request("GET", "/players/me/ledger?limit=2&limit=3"),
    request("GET", "/players/me/ledger?gameSessionId=anything"),
    request("GET", "/players/me/ledger", undefined, { "x-player-id": PLAYER_ID }),
    request("GET", "/players/me/ledger", { playerId: PLAYER_ID }),
  ];

  for (const candidate of cases) {
    const response = await handlePlayerBankingPublicRequest(
      candidate,
      dependencies(repository),
    );
    const body = await response.json();
    assertEquals(response.status, 400);
    assertEquals(body.error.code, "invalid_player_banking_request");
    assertNoUuid(body);
  }
  assertEquals(repository.inputs.length, 0);
});

class FixtureRepository implements PlayerBankingPublicRepository {
  readonly inputs: any[] = [];

  readPage(input: any) {
    this.inputs.push(input);
    return Promise.resolve({
      balances: [
        { accountType: "cash", balance: 1250, currencyCode: "ECO" },
        { accountType: "cash", balance: 40, currencyCode: "LUM" },
      ],
      entries: [
        {
          accountType: "cash",
          amount: 25,
          currencyCode: "ECO",
          entryType: "credit",
          sourceDomain: "contracts",
          sourceAction: "contract_reward",
          createdAt: "2026-07-19T03:59:00.000Z",
        },
        {
          accountType: "cash",
          amount: -4,
          currencyCode: "LUM",
          entryType: "debit",
          sourceDomain: "economy",
          sourceAction: "currency_adjustment",
          createdAt: "2026-07-19T03:58:00.000Z",
        },
      ],
      hasMore: true,
    });
  }
}

function dependencies(repository: PlayerBankingPublicRepository) {
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
    resolveScope: () => Promise.resolve({
      gameId: GAME_ID,
      playerUuid: PLAYER_ID,
    }),
    createRepository: () => repository,
    now: () => "2026-07-19T04:00:00.000Z",
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  const headers = new Headers({
    "x-player-session-token": "player-token",
    ...extraHeaders,
  });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized)) {
    throw new Error(`Player Banking response leaked an internal UUID: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
