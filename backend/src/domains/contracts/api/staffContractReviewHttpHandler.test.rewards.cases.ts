import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import {
  assertEquals,
  assertErrorResponse,
  CapturingRewardLedgerWriter,
  CONTRACT_ID,
  contractRecord,
  dependencies,
  GAME_SESSION_ID,
  MockContractRepository,
  NOW,
  PLAYER_ID,
  PROGRESS_ID,
  progressRecord,
  request,
  rewardRoute,
} from "./staffContractReviewHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("staff can issue cash rewards for completed progress", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({
        rewardPayload: {
          cash: {
            amount: 500,
            currencyCode: "ECO",
          },
        },
      }),
    ],
    progress: [progressRecord({ status: "completed" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.rewardIssued, true);
  assertEquals(body.alreadyIssued, false);
  assertEquals(body.progress.rewardIssuedAt, NOW);
  assertEquals(body.rewardResult.appliedRewards[0].ledgerEntryId, "ledger-1");
  assertEquals(ledger.inputs[0].playerId, PLAYER_ID);
  assertEquals(ledger.inputs[0].amount, 500);
  assertEquals(repository.markRewardInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    rewardIssuedAt: NOW,
  });
});

Deno.test("staff reward issue is idempotent after rewardIssuedAt", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        status: "completed",
        rewardIssuedAt: "2026-06-25T12:05:00.000Z",
      }),
    ],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.rewardIssued, false);
  assertEquals(body.alreadyIssued, true);
  assertEquals(ledger.inputs.length, 0);
  assertEquals(repository.markRewardInputs.length, 0);
});

Deno.test("staff reward issue rejects unsupported rewards before ledger or mark", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({
        rewardPayload: {
          items: [{
            itemId: "00000000-0000-4000-8000-000000000901",
            quantity: 1,
          }],
        },
      }),
    ],
    progress: [progressRecord({ status: "completed" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );

  await assertErrorResponse(response, 400, "unsupported_reward_type");
  assertEquals(ledger.inputs.length, 0);
  assertEquals(repository.markRewardInputs.length, 0);
});

Deno.test("staff reward issue rejects non-completed progress and ledger failure leaves unmarked", async () => {
  const notCompletedRepository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const notCompleted = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository: notCompletedRepository }),
  );

  await assertErrorResponse(
    notCompleted,
    409,
    "contract_progress_not_completed",
  );
  assertEquals(notCompletedRepository.markRewardInputs.length, 0);

  const failedRepository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "completed" })],
  });
  const failed = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({
      repository: failedRepository,
      ledger: new CapturingRewardLedgerWriter("fail"),
    }),
  );

  await assertErrorResponse(failed, 500, "contract_reward_issue_failed");
  assertEquals(failedRepository.markRewardInputs.length, 0);
});
