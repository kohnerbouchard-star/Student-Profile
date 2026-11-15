import { handlePlayerStockMarketReadRequest } from "./playerStockMarketReadHttpHandler.ts";
import {
  assertEquals,
  assertErrorResponse,
  dependencies,
  FakeClient,
  GAME_SESSION_ID,
  OTHER_GAME_SESSION_ID,
  PLAYER_SESSION_ID,
  playerSession,
  request,
  tables,
} from "./playerStockMarketReadHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock read rejects missing player session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { authToken: null }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock read rejects invalid player session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies({
      resolvePlayerSession: async () => ({
        ok: false as const,
        status: 401,
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid or expired.",
          retryable: false,
        },
      }),
    }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock read rejects revoked, expired, and inactive sessions", async () => {
  for (
    const session of [
      playerSession({
        status: "revoked",
        revoked_at: "2026-06-24T00:00:00.000Z",
      }),
      playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
      playerSession({ status: "expired" }),
    ]
  ) {
    const response = await handlePlayerStockMarketReadRequest(
      request("read_portfolio"),
      "read_portfolio",
      dependencies({
        client: new FakeClient({ ...tables(), player_sessions: [session] }),
      }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player stock read rejects mismatched game session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { gameSessionId: OTHER_GAME_SESSION_ID }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player stock read rejects missing game or player session query", async () => {
  const missingGame = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { omitGameSessionId: true }),
    "read_portfolio",
    dependencies(),
  );
  const missingPlayer = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { omitPlayerSessionId: true }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(
    missingGame,
    400,
    "invalid_player_stock_read_request",
  );
  await assertErrorResponse(
    missingPlayer,
    400,
    "invalid_player_stock_read_request",
  );
});

Deno.test("player stock read rejects array-shaped or multiple session ids", async () => {
  const multipleGame = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", {
      extraQuery: `gameSessionId=${GAME_SESSION_ID}`,
    }),
    "read_portfolio",
    dependencies(),
  );
  const multiplePlayer = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", {
      extraQuery: `playerSessionId=${PLAYER_SESSION_ID}`,
    }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(
    multipleGame,
    400,
    "invalid_player_stock_read_request",
  );
  await assertErrorResponse(
    multiplePlayer,
    400,
    "invalid_player_stock_read_request",
  );
});

Deno.test("player stock read rejects invalid limits", async () => {
  const zero = await handlePlayerStockMarketReadRequest(
    request("read_orders", { limit: "0" }),
    "read_orders",
    dependencies(),
  );
  const decimal = await handlePlayerStockMarketReadRequest(
    request("read_trades", { limit: "1.5" }),
    "read_trades",
    dependencies(),
  );

  await assertErrorResponse(zero, 400, "invalid_player_stock_read_request");
  await assertErrorResponse(decimal, 400, "invalid_player_stock_read_request");
});

Deno.test("player stock read does not require or accept the runner secret", async () => {
  const withoutSecret = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies(),
  );
  const withSecret = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { runnerSecret: "runner-secret" }),
    "read_portfolio",
    dependencies(),
  );

  assertEquals(withoutSecret.status, 200);
  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
});
