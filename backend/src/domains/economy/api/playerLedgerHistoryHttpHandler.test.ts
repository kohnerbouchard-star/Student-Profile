import { handlePlayerLedgerHistoryRequest } from "./playerLedgerHistoryHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player ledger rejects unsupported methods and server-only credentials", async () => {
  const wrongMethod = await handlePlayerLedgerHistoryRequest(
    request({ method: "POST" }),
    dependencies(),
  );
  const runnerSecret = await handlePlayerLedgerHistoryRequest(
    request({ runnerSecret: "must-not-leak" }),
    dependencies(),
  );

  await assertErrorResponse(wrongMethod, 405, "method_not_allowed");
  await assertErrorResponse(
    runnerSecret,
    400,
    "stock_runner_secret_not_allowed",
  );
});

Deno.test("player ledger rejects client-supplied identity and game scope", async () => {
  for (
    const url of [
      "https://example.test/players/me/ledger?playerId=player-1",
      "https://example.test/players/me/ledger?playerSessionId=session-1",
      "https://example.test/players/me/ledger?gameSessionId=game-1",
    ]
  ) {
    const response = await handlePlayerLedgerHistoryRequest(
      new Request(url, {
        headers: { "x-player-session-token": "player-token" },
      }),
      dependencies(),
    );
    await assertErrorResponse(
      response,
      400,
      "invalid_player_ledger_history_request",
    );
  }

  const conflictingGameHeaders = await handlePlayerLedgerHistoryRequest(
    request({
      gameSessionHeader: "game-1",
      legacyGameHeader: "game-2",
    }),
    dependencies(),
  );
  await assertErrorResponse(
    conflictingGameHeaders,
    400,
    "invalid_player_ledger_history_request",
  );
});

Deno.test("player ledger rejects unknown and duplicate query parameters", async () => {
  for (
    const url of [
      "https://example.test/players/me/ledger?offset=1",
      "https://example.test/players/me/ledger?limit=10&limit=20",
    ]
  ) {
    const response = await handlePlayerLedgerHistoryRequest(
      new Request(url, {
        headers: { "x-player-session-token": "player-token" },
      }),
      dependencies(),
    );
    await assertErrorResponse(
      response,
      400,
      "invalid_player_ledger_history_request",
    );
  }
});

function request(options: {
  readonly method?: string;
  readonly runnerSecret?: string;
  readonly gameSessionHeader?: string;
  readonly legacyGameHeader?: string;
} = {}): Request {
  const headers = new Headers({
    "x-player-session-token": "player-token",
  });
  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }
  if (options.gameSessionHeader) {
    headers.set("x-econovaria-game-session-id", options.gameSessionHeader);
  }
  if (options.legacyGameHeader) {
    headers.set("x-econovaria-game-id", options.legacyGameHeader);
  }
  return new Request("https://example.test/players/me/ledger", {
    method: options.method ?? "GET",
    headers,
  });
}

function dependencies(): Parameters<
  typeof handlePlayerLedgerHistoryRequest
>[1] {
  return {
    createServiceClient: () => {
      throw new Error(
        "service client must not be created for rejected requests",
      );
    },
  };
}

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  if (response.status !== status || body?.error?.code !== code) {
    throw new Error(
      `Expected ${status}/${code}, received ${response.status}/${body?.error?.code}`,
    );
  }
}
