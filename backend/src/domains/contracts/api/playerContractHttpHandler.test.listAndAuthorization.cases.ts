import { handlePlayerContractRequest } from "./playerContractHttpHandler.ts";
import { readPlayerContractRoutePath } from "./playerContractRoutePaths.ts";
import {
  assertEquals,
  assertErrorResponse,
  CONTRACT_ID,
  contractRecord,
  contractsRoute,
  dependencies,
  GAME_SESSION_ID,
  HIDDEN_CONTRACT_ID,
  listRequest,
  MockContractRepository,
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  PROGRESS_ID,
  progressRecord,
  TARGETED_CONTRACT_ID,
} from "./playerContractHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player contract route paths parse list and submit routes", () => {
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts`,
    ),
    { kind: "contracts" },
  );
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts/${CONTRACT_ID}/submit`,
    ),
    { kind: "submit", contractId: CONTRACT_ID },
  );
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts/not-a-uuid/submit`,
    ),
    null,
  );
});

Deno.test("player contract list returns visible contracts and authenticated player progress", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({ id: CONTRACT_ID, title: "Public Active" }),
      contractRecord({
        id: TARGETED_CONTRACT_ID,
        title: "Targeted Active",
        visibility: "targeted",
        targetingPayload: {
          playerIds: [PLAYER_ID],
        },
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000104",
        gameSessionId: OTHER_GAME_SESSION_ID,
        contractKey: "other-session",
      }),
      contractRecord({
        id: HIDDEN_CONTRACT_ID,
        contractKey: "hidden",
        visibility: "hidden",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000105",
        contractKey: "draft",
        status: "draft",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000106",
        contractKey: "paused",
        status: "paused",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000107",
        contractKey: "archived",
        status: "archived",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000108",
        contractKey: "expired-by-time",
        expiresAt: "2026-06-25T12:00:00.000Z",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000109",
        contractKey: "unpublished",
        publishedAt: null,
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000110",
        contractKey: "future",
        publishedAt: "2026-06-26T12:00:00.000Z",
      }),
    ],
    progress: [
      progressRecord({ id: PROGRESS_ID, contractId: CONTRACT_ID }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000202",
        contractId: TARGETED_CONTRACT_ID,
        playerId: OTHER_PLAYER_ID,
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000203",
        gameSessionId: OTHER_GAME_SESSION_ID,
      }),
    ],
  });

  const response = await handlePlayerContractRequest(
    listRequest(),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(
    body.contracts.map((contract: { readonly contractId: string }) =>
      contract.contractId
    ),
    [CONTRACT_ID, TARGETED_CONTRACT_ID],
  );
  assertEquals(body.contracts[0].createdByStaffId, undefined);
  assertEquals(
    body.progress.map((progress: { readonly progressId: string }) =>
      progress.progressId
    ),
    [PROGRESS_ID],
  );
  assertEquals(repository.listAvailableInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    rosterLabel: "A-1",
  });
  assertEquals(repository.listProgressInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
});

Deno.test("player contract list rejects missing invalid revoked expired inactive sessions and mismatched scope", async () => {
  const missing = await handlePlayerContractRequest(
    listRequest({ authToken: null }),
    contractsRoute(),
    dependencies(),
  );
  await assertErrorResponse(missing, 401, "invalid_player_session");

  for (const sessionMode of ["invalid", "revoked", "expired", "inactive"]) {
    const response = await handlePlayerContractRequest(
      listRequest(),
      contractsRoute(),
      dependencies({ sessionMode }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }

  const mismatched = await handlePlayerContractRequest(
    listRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(mismatched, 401, "invalid_player_session_scope");
});

Deno.test("player contract list rejects client supplied identity", async () => {
  const withPlayerId = await handlePlayerContractRequest(
    listRequest({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    contractsRoute(),
    dependencies(),
  );
  const withPlayerSessionId = await handlePlayerContractRequest(
    listRequest({ extraQuery: `playerSessionId=${PLAYER_SESSION_ID}` }),
    contractsRoute(),
    dependencies(),
  );
  const withPlayerSessionHeader = await handlePlayerContractRequest(
    listRequest({ playerSessionIdHeader: PLAYER_SESSION_ID }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    withPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withPlayerSessionId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withPlayerSessionHeader,
    400,
    "invalid_player_contract_request",
  );
});
