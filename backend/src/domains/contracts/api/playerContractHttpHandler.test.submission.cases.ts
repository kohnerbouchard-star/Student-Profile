import { handlePlayerContractRequest } from "./playerContractHttpHandler.ts";
import {
  assertEquals,
  assertErrorResponse,
  CONTRACT_ID,
  contractRecord,
  dependencies,
  GAME_SESSION_ID,
  MockContractRepository,
  NOW,
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_ID,
  PLAYER_ID,
  progressRecord,
  submitRequest,
  submitRoute,
} from "./playerContractHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player contract submit derives player identity and writes submitted progress only", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord({ id: CONTRACT_ID })],
  });
  const response = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        evidencePayload: {
          memo: "Export plan attached.",
        },
      },
    }),
    submitRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();
  const upsertInput = repository.upsertInputs[0];

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.contract.contractId, CONTRACT_ID);
  assertEquals(body.contract.createdByStaffId, undefined);
  assertEquals(body.progress.playerId, PLAYER_ID);
  assertEquals(body.progress.status, "submitted");
  assertEquals(body.progress.submittedAt, NOW);
  assertEquals(body.progress.completedAt, null);
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(upsertInput.playerId, PLAYER_ID);
  assertEquals(upsertInput.status, "submitted");
  assertEquals(upsertInput.evidencePayload, { memo: "Export plan attached." });
  assertEquals(upsertInput.resultPayload, {});
  assertEquals(upsertInput.submittedAt, NOW);
  assertEquals("completedAt" in upsertInput, false);
  assertEquals("rewardIssuedAt" in upsertInput, false);
});

Deno.test("player contract submit rejects client supplied identity and invalid evidence", async () => {
  const withQueryPlayerId = await handlePlayerContractRequest(
    submitRequest({
      extraQuery: `playerId=${OTHER_PLAYER_ID}`,
      body: { gameSessionId: GAME_SESSION_ID },
    }),
    submitRoute(),
    dependencies(),
  );
  const withBodyPlayerId = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        playerId: OTHER_PLAYER_ID,
      },
    }),
    submitRoute(),
    dependencies(),
  );
  const withArrayEvidence = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        evidencePayload: [],
      },
    }),
    submitRoute(),
    dependencies(),
  );
  const withInvalidJson = await handlePlayerContractRequest(
    submitRequest({ rawBody: "{not-json" }),
    submitRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    withQueryPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withBodyPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withArrayEvidence,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withInvalidJson,
    400,
    "invalid_player_contract_request",
  );
});

Deno.test("player contract submit rejects mismatched game session unavailable and hidden lifecycle contracts", async () => {
  const mismatched = await handlePlayerContractRequest(
    submitRequest({ body: { gameSessionId: OTHER_GAME_SESSION_ID } }),
    submitRoute(),
    dependencies(),
  );

  await assertErrorResponse(mismatched, 401, "invalid_player_session_scope");

  for (
    const contract of [
      null,
      contractRecord({ id: CONTRACT_ID, gameSessionId: OTHER_GAME_SESSION_ID }),
      contractRecord({ id: CONTRACT_ID, visibility: "hidden" }),
      contractRecord({ id: CONTRACT_ID, status: "draft" }),
      contractRecord({ id: CONTRACT_ID, status: "paused" }),
      contractRecord({ id: CONTRACT_ID, status: "archived" }),
      contractRecord({
        id: CONTRACT_ID,
        expiresAt: "2026-06-25T12:00:00.000Z",
      }),
      contractRecord({ id: CONTRACT_ID, publishedAt: null }),
      contractRecord({
        id: CONTRACT_ID,
        publishedAt: "2026-06-26T12:00:00.000Z",
      }),
    ]
  ) {
    const repository = new MockContractRepository({
      contracts: contract ? [contract] : [],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({ body: { gameSessionId: GAME_SESSION_ID } }),
      submitRoute(),
      dependencies({ repository }),
    );

    await assertErrorResponse(response, 404, "contract_not_available");
    assertEquals(repository.upsertInputs.length, 0);
  }
});

Deno.test("player contract submit updates in-progress and submitted rows preserving results", async () => {
  for (const existingStatus of ["in_progress", "submitted"]) {
    const repository = new MockContractRepository({
      contracts: [contractRecord({ id: CONTRACT_ID })],
      progress: [
        progressRecord({
          contractId: CONTRACT_ID,
          status: existingStatus,
          resultPayload: {
            review: "pending",
          },
        }),
      ],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({
        body: {
          gameSessionId: GAME_SESSION_ID,
          evidencePayload: {
            revision: existingStatus,
          },
        },
      }),
      submitRoute(),
      dependencies({ repository }),
    );
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.progress.status, "submitted");
    assertEquals(repository.upsertInputs[0].resultPayload, {
      review: "pending",
    });
    assertEquals(repository.upsertInputs[0].submittedAt, NOW);
    assertEquals("completedAt" in repository.upsertInputs[0], false);
    assertEquals("rewardIssuedAt" in repository.upsertInputs[0], false);
  }
});

Deno.test("player contract submit rejects locked existing progress", async () => {
  for (const status of ["completed", "expired", "failed", "dismissed"]) {
    const repository = new MockContractRepository({
      contracts: [contractRecord({ id: CONTRACT_ID })],
      progress: [progressRecord({ contractId: CONTRACT_ID, status })],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({ body: { gameSessionId: GAME_SESSION_ID } }),
      submitRoute(),
      dependencies({ repository }),
    );

    await assertErrorResponse(response, 409, "contract_progress_locked");
    assertEquals(repository.upsertInputs.length, 0);
  }
});
