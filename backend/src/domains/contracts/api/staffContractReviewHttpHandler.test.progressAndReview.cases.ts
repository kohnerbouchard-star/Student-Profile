import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import { readStaffContractRoutePath } from "./contractRoutePaths.ts";
import {
  assertEquals,
  assertErrorResponse,
  CapturingRewardLedgerWriter,
  CONTRACT_ID,
  contractRecord,
  dependencies,
  FakeServiceClient,
  GAME_SESSION_ID,
  MockContractRepository,
  NOW,
  OTHER_CONTRACT_ID,
  OTHER_GAME_SESSION_ID,
  OTHER_PLAYER_ID,
  OTHER_PROGRESS_ID,
  OTHER_STAFF_ID,
  PLAYER_ID,
  PROGRESS_ID,
  progressRecord,
  progressRoute,
  request,
  reviewRoute,
  rewardRoute,
} from "./staffContractReviewHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("staff contract route paths parse progress review and reward issue routes", () => {
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    ),
    progressRoute(),
  );
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
    ),
    reviewRoute(),
  );
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    ),
    rewardRoute(),
  );
});

Deno.test("staff can list progress for one contract with filters", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({ id: PROGRESS_ID, status: "submitted" }),
      progressRecord({
        id: OTHER_PROGRESS_ID,
        playerId: OTHER_PLAYER_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000203",
        contractId: OTHER_CONTRACT_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000204",
        gameSessionId: OTHER_GAME_SESSION_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000205",
        status: "completed",
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
      query: `status=submitted&playerId=${PLAYER_ID}`,
    }),
    progressRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.contract.contractId, CONTRACT_ID);
  assertEquals(
    body.progress.map((row: { readonly progressId: string }) => row.progressId),
    [PROGRESS_ID],
  );
  assertEquals(repository.listStaffProgressInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    statuses: ["submitted"],
    playerId: PLAYER_ID,
  });
});

Deno.test("staff contract progress rejects missing staff and unauthorized game", async () => {
  const missing = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    }),
    progressRoute(),
    dependencies({ staffAuth: "missing" }),
  );
  const unauthorized = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    }),
    progressRoute(),
    dependencies({
      serviceClient: new FakeServiceClient([{
        id: GAME_SESSION_ID,
        name: "Period 1",
        status: "active",
        owner_staff_user_id: OTHER_STAFF_ID,
      }]),
    }),
  );

  await assertErrorResponse(missing, 401, "missing_staff_auth_user");
  await assertErrorResponse(unauthorized, 404, "game_session_not_found");
});

Deno.test("staff contract progress rejects invalid status filters", async () => {
  const response = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
      query: "status=reviewed",
    }),
    progressRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    response,
    400,
    "invalid_contract_progress_status_filter",
  );
});

Deno.test("staff can approve submitted progress without issuing rewards", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        resultPayload: {
          score: "approved",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "completed");
  assertEquals(body.progress.completedAt, NOW);
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(body.progress.resultPayload, { score: "approved" });
  assertEquals(repository.reviewInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    status: "completed",
    resultPayload: {
      score: "approved",
    },
    completedAt: NOW,
  });
  assertEquals(ledger.inputs.length, 0);
});

Deno.test("staff can reject submitted progress", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "reject",
        resultPayload: {
          reason: "Incomplete memo.",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "failed");
  assertEquals(body.progress.resultPayload, { reason: "Incomplete memo." });
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(repository.reviewInputs[0].completedAt, undefined);
});

Deno.test("staff can request revision without clearing evidence or submittedAt", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        status: "submitted",
        evidencePayload: {
          memo: "draft",
        },
        submittedAt: "2026-06-25T12:00:00.000Z",
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "request_revision",
        resultPayload: {
          note: "Add citations.",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "in_progress");
  assertEquals(body.progress.evidencePayload, { memo: "draft" });
  assertEquals(body.progress.submittedAt, "2026-06-25T12:00:00.000Z");
  assertEquals(body.progress.completedAt, null);
  assertEquals(body.progress.rewardIssuedAt, null);
});

Deno.test("staff review rejects invalid body action authority payload and issued rewards", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        rewardIssuedAt: "2026-06-25T12:05:00.000Z",
      }),
    ],
  });
  const invalidAction = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "maybe" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const invalidPayload = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        resultPayload: [],
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const staffId = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        staffId: OTHER_STAFF_ID,
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const alreadyIssued = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "approve" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(
    invalidAction,
    400,
    "invalid_contract_review_action",
  );
  await assertErrorResponse(invalidPayload, 400, "invalid_contract_request");
  await assertErrorResponse(staffId, 400, "staff_id_not_allowed");
  await assertErrorResponse(
    alreadyIssued,
    409,
    "contract_reward_already_issued",
  );
});

Deno.test("staff review rejects progress from another game or contract", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        gameSessionId: OTHER_GAME_SESSION_ID,
      }),
      progressRecord({
        id: OTHER_PROGRESS_ID,
        contractId: OTHER_CONTRACT_ID,
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "approve" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 404, "contract_progress_not_found");
});
