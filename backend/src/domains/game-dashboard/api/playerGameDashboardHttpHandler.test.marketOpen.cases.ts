import { SupabasePlayerGameDashboardRepository } from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import { createDashboardStoreListingsReadQuery } from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { createPlayerContractsReadQuery } from "../../contracts/index.ts";
import {
  createStockMarketOpenStateReadRepository,
  createStockMarketReadRepository,
} from "../../stocks/index.ts";
import {
  GAME_SESSION_ID,
  OTHER_GAME_PLAYER_ID,
  OTHER_GAME_SESSION_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import { assertMarketOpenReadError } from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("dashboard market-open port preserves game, caller time and one clock evaluation", async () => {
  for (const [gameSessionId, open, expectedStatus] of [
    [GAME_SESSION_ID, true, "open"],
    [OTHER_GAME_SESSION_ID, false, "closed"],
  ] as const) {
    const client = new FakeClient(tables());
    const at = new Date("2026-07-20T12:34:56.789Z");
    const calls: unknown[] = [];
    const marketOpen = createStockMarketOpenStateReadRepository({
      rpc: <T>(functionName: string, args?: unknown) => {
        calls.push({ functionName, args });
        return Promise.resolve({ data: open as T, error: null });
      },
    });
    let clockCalls = 0;
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: createStockMarketReadRepository(client as any),
        stockMarketOpenStateReadRepository: {
          read: (gameId, receivedAt) => {
            if (receivedAt !== at) throw new Error("Caller Date was replaced");
            return marketOpen.read(gameId, receivedAt);
          },
        },
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
      },
      () => {
        clockCalls += 1;
        return at;
      },
    );
    const snapshot = await repository.read({
      gameSessionId,
      playerId: gameSessionId === GAME_SESSION_ID ? PLAYER_ID : OTHER_GAME_PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Synthetic player",
      playerRosterLabel: "A-1",
    });
    assertEquals(snapshot.gameSession.marketStatus, expectedStatus);
    assertEquals(clockCalls, 1);
    assertEquals(calls, [{
      functionName: "is_stock_market_open_at",
      args: { p_game_session_id: gameSessionId, p_at: at.toISOString() },
    }]);
    assertEquals(client.trace.filter((entry) =>
      (entry as { rpc?: string }).rpc === "is_stock_market_open_at"
    ), []);
  }
});

Deno.test("public market-open port rejects invalid dates before any RPC", async () => {
  let calls = 0;
  const repository = createStockMarketOpenStateReadRepository({
    rpc: <T>() => {
      calls += 1;
      return Promise.resolve({ data: true as T, error: null });
    },
  });
  for (const at of [new Date(NaN), "2026-07-20" as unknown as Date]) {
    await assertMarketOpenReadError(
      () => repository.read(GAME_SESSION_ID, at),
      "A valid server market-evaluation time is required.",
    );
    assertEquals(calls, 0);
  }
});

Deno.test("public market-open port rejects RPC errors and non-boolean data", async () => {
  for (const response of [
    { data: null, error: null },
    { data: 1, error: null },
    { data: "false", error: null },
    { data: true, error: { message: "Synthetic RPC failure" } },
  ]) {
    let calls = 0;
    const repository = createStockMarketOpenStateReadRepository({
      rpc: <T>() => {
        calls += 1;
        return Promise.resolve({
          data: response.data as T | null,
          error: response.error,
        });
      },
    });
    await assertMarketOpenReadError(
      () => repository.read(GAME_SESSION_ID, new Date("2026-07-20T00:00:00Z")),
      "Authoritative game market-session state could not be read.",
    );
    assertEquals(calls, 1);
  }
});

Deno.test("dashboard preserves market-open RPC rejection identity", async () => {
  const failure = new Error("Synthetic provider rejection");
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository({
        rpc: () => Promise.reject(failure),
      }),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
    () => new Date("2026-07-20T00:00:00Z"),
  );
  let caught: unknown;
  try {
    await repository.read({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Avery",
      playerRosterLabel: "A-1",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== failure) throw new Error("Market-open failure was replaced");
});
