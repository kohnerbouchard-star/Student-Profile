import { handlePlayerGameDashboardRequest } from "./playerGameDashboardHttpHandler.ts";
import {
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_ID,
  OTHER_PLAYER_SESSION_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import {
  dependencies,
  request,
} from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import { playerSession } from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertErrorResponse } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player dashboard rejects missing player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard rejects invalid player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({
      client: new FakeClient({ ...tables(), player_sessions: [] }),
    }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard rejects revoked, expired, or inactive sessions", async () => {
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
    const response = await handlePlayerGameDashboardRequest(
      request(),
      dependencies({
        client: new FakeClient({ ...tables(), player_sessions: [session] }),
      }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player dashboard rejects mismatched gameSessionId", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player dashboard rejects runner secret and client-supplied identity", async () => {
  const withSecret = await handlePlayerGameDashboardRequest(
    request({ runnerSecret: "runner-secret" }),
    dependencies(),
  );
  const withPlayerId = await handlePlayerGameDashboardRequest(
    request({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );
  const withPlayerSessionId = await handlePlayerGameDashboardRequest(
    request({ extraQuery: `playerSessionId=${OTHER_PLAYER_SESSION_ID}` }),
    dependencies(),
  );
  const withPlayerSessionHeader = await handlePlayerGameDashboardRequest(
    request({ playerSessionIdHeader: OTHER_PLAYER_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
  await assertErrorResponse(
    withPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withPlayerSessionId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withPlayerSessionHeader,
    400,
    "invalid_game_dashboard_request",
  );
});
