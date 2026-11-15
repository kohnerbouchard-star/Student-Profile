import { handlePlayerContractAcceptanceRequest } from "../api/playerContractAcceptanceHttpHandler.ts";
import { handlePlayerContractPublicListRequest } from "../api/playerContractPublicListHttpHandler.ts";
import type {
  ContractRepository,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import type { PlayerContractAcceptanceRepository } from "../contracts/playerContractAcceptanceContracts.ts";
import {
  ACCEPTED_AT,
  APPROVED_AT,
  assertEqual,
  basePlayerDependencies,
  CapturingLedger,
  CONTRACT_ID,
  CONTRACT_KEY,
  contractRecord,
  GAME_ID,
  playerDependencies,
  playerRequest,
  PROGRESS_ID,
  progressRecord,
  readJson,
  RESUBMITTED_AT,
  REVISION_AT,
  REWARDED_AT,
  staffReview,
  staffReward,
  submit,
  SUBMITTED_AT,
  UUID_PATTERN,
} from "./playerContractFullLifecycleIntegration.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("full Contract lifecycle reaches rewarded completion with one ledger write", async () => {
  let now = ACCEPTED_AT;
  let progress: PlayerContractProgressRecord | null = null;
  let rewardMarks = 0;
  const playerBodies: unknown[] = [];
  const contract = contractRecord();
  const ledger = new CapturingLedger();

  const setProgress = (
    patch: Partial<PlayerContractProgressRecord>,
  ): PlayerContractProgressRecord => {
    const current = progress ?? progressRecord();
    progress = {
      ...current,
      ...patch,
      updatedAt: now,
    };
    return progress;
  };

  const repository: ContractRepository = {
    createContractTemplate: () => Promise.reject(new Error("not used")),
    getContractTemplateByKey: () => Promise.resolve(null),
    createGameSessionContract: () => Promise.reject(new Error("not used")),
    listGameSessionContracts: ({ gameSessionId }) =>
      Promise.resolve(gameSessionId === GAME_ID ? [contract] : []),
    getGameSessionContractById: ({ gameSessionId, contractId }) =>
      Promise.resolve(
        gameSessionId === GAME_ID && contractId === CONTRACT_ID ? contract : null,
      ),
    updateGameSessionContractStatus: () => Promise.resolve(null),
    listPlayerAvailableContracts: ({ gameSessionId }) =>
      Promise.resolve(gameSessionId === GAME_ID ? [contract] : []),
    getPlayerContractProgress: ({ gameSessionId, contractId, playerId }) =>
      Promise.resolve(
        progress?.gameSessionId === gameSessionId &&
            progress.contractId === contractId &&
            progress.playerId === playerId
          ? progress
          : null,
      ),
    upsertPlayerContractProgress: (input) =>
      Promise.resolve(setProgress({
        gameSessionId: input.gameSessionId,
        contractId: input.contractId,
        playerId: input.playerId,
        status: input.status ?? progress?.status ?? "available",
        evidencePayload: input.evidencePayload ?? progress?.evidencePayload ?? {},
        resultPayload: input.resultPayload ?? progress?.resultPayload ?? {},
        submittedAt: input.submittedAt ?? progress?.submittedAt ?? null,
        completedAt: input.completedAt ?? progress?.completedAt ?? null,
        rewardIssuedAt: input.rewardIssuedAt ?? progress?.rewardIssuedAt ?? null,
      })),
    listPlayerContractProgress: ({ gameSessionId, playerId, statuses }) =>
      Promise.resolve(
        progress && progress.gameSessionId === gameSessionId &&
            progress.playerId === playerId &&
            (!statuses?.length || statuses.includes(progress.status as never))
          ? [progress]
          : [],
      ),
    listContractProgressForStaff: ({ gameSessionId, contractId, playerId, statuses }) =>
      Promise.resolve(
        progress && progress.gameSessionId === gameSessionId &&
            progress.contractId === contractId &&
            (!playerId || progress.playerId === playerId) &&
            (!statuses?.length || statuses.includes(progress.status as never))
          ? [progress]
          : [],
      ),
    getContractProgressById: ({ gameSessionId, contractId, progressId }) =>
      Promise.resolve(
        progress?.gameSessionId === gameSessionId &&
            progress.contractId === contractId &&
            progress.id === progressId
          ? progress
          : null,
      ),
    reviewPlayerContractProgress: (input) =>
      Promise.resolve(
        progress?.id === input.progressId
          ? setProgress({
            status: input.status,
            resultPayload: input.resultPayload ?? progress.resultPayload,
            completedAt: input.completedAt !== undefined
              ? input.completedAt
              : progress.completedAt,
          })
          : null,
      ),
    markContractRewardIssued: (input) => {
      if (progress?.id !== input.progressId || progress.rewardIssuedAt !== null) {
        return Promise.resolve(null);
      }
      rewardMarks += 1;
      return Promise.resolve(setProgress({ rewardIssuedAt: input.rewardIssuedAt }));
    },
  };

  const acceptanceRepository: PlayerContractAcceptanceRepository = {
    acceptContract: () => {
      if (progress) {
        return Promise.resolve({
          outcome: "already_accepted" as const,
          contractKey: CONTRACT_KEY,
          progressStatus: "in_progress",
          acceptedAt: progress.createdAt,
        });
      }
      progress = progressRecord({
        status: "in_progress",
        createdAt: now,
        updatedAt: now,
      });
      return Promise.resolve({
        outcome: "accepted" as const,
        contractKey: CONTRACT_KEY,
        progressStatus: "in_progress",
        acceptedAt: now,
      });
    },
  };

  const initial = await handlePlayerContractPublicListRequest(
    playerRequest("GET", "/players/me/contracts"),
    playerDependencies(repository, () => now),
  );
  const initialBody = await readJson(initial);
  playerBodies.push(initialBody);
  assertEqual(initial.status, 200);
  assertEqual(initialBody.contracts[0].contractKey, CONTRACT_KEY);
  assertEqual(initialBody.progress, []);

  const accepted = await handlePlayerContractAcceptanceRequest(
    playerRequest("POST", `/players/me/contracts/${CONTRACT_KEY}/accept`),
    { kind: "accept", contractKey: CONTRACT_KEY },
    {
      ...basePlayerDependencies(),
      createRepository: () => acceptanceRepository,
      now: () => new Date(now),
    },
  );
  const acceptedBody = await readJson(accepted);
  playerBodies.push(acceptedBody);
  assertEqual(accepted.status, 200);
  assertEqual(acceptedBody.contract.status, "in_progress");
  assertEqual(acceptedBody.contract.acceptedAt, ACCEPTED_AT);

  now = SUBMITTED_AT;
  const submitted = await submit(
    repository,
    now,
    {
      memo: "Initial export plan",
      submissionUrl: "https://example.test/export-plan-v1",
    },
  );
  const submittedBody = await readJson(submitted);
  playerBodies.push(submittedBody);
  assertEqual(submitted.status, 200);
  assertEqual(submittedBody.progress.status, "submitted");
  assertEqual(submittedBody.progress.submittedAt, SUBMITTED_AT);

  now = REVISION_AT;
  const revision = await staffReview(
    repository,
    ledger,
    now,
    "request_revision",
    { feedback: "Add the cost breakdown and cite the source data." },
  );
  const revisionBody = await readJson(revision);
  assertEqual(revision.status, 200);
  assertEqual(revisionBody.progress.status, "in_progress");
  assertEqual(revisionBody.progress.evidencePayload.memo, "Initial export plan");
  assertEqual(revisionBody.progress.submittedAt, SUBMITTED_AT);

  const revisionRead = await handlePlayerContractPublicListRequest(
    playerRequest("GET", "/players/me/contracts"),
    playerDependencies(repository, () => now),
  );
  const revisionReadBody = await readJson(revisionRead);
  playerBodies.push(revisionReadBody);
  assertEqual(revisionReadBody.progress[0].status, "in_progress");
  assertEqual(
    revisionReadBody.progress[0].resultPayload.feedback,
    "Add the cost breakdown and cite the source data.",
  );

  now = RESUBMITTED_AT;
  const resubmitted = await submit(
    repository,
    now,
    {
      memo: "Revised export plan with cost breakdown",
      submissionUrl: "https://example.test/export-plan-v2",
      citations: ["National trade bulletin", "Port authority schedule"],
    },
  );
  const resubmittedBody = await readJson(resubmitted);
  playerBodies.push(resubmittedBody);
  assertEqual(resubmittedBody.progress.status, "submitted");
  assertEqual(resubmittedBody.progress.submittedAt, RESUBMITTED_AT);
  assertEqual(
    resubmittedBody.progress.resultPayload.feedback,
    "Add the cost breakdown and cite the source data.",
  );

  now = APPROVED_AT;
  const approved = await staffReview(
    repository,
    ledger,
    now,
    "approve",
    { decision: "approved", feedback: "Requirements satisfied." },
  );
  const approvedBody = await readJson(approved);
  assertEqual(approvedBody.progress.status, "completed");
  assertEqual(approvedBody.progress.completedAt, APPROVED_AT);
  assertEqual(approvedBody.progress.rewardIssuedAt, null);

  now = REWARDED_AT;
  const firstReward = await staffReward(repository, ledger, now);
  const firstRewardBody = await readJson(firstReward);
  assertEqual(firstRewardBody.rewardIssued, true);
  assertEqual(firstRewardBody.alreadyIssued, false);
  assertEqual(firstRewardBody.progress.rewardIssuedAt, REWARDED_AT);

  const replayReward = await staffReward(repository, ledger, now);
  const replayRewardBody = await readJson(replayReward);
  assertEqual(replayRewardBody.rewardIssued, false);
  assertEqual(replayRewardBody.alreadyIssued, true);
  assertEqual(ledger.inputs.length, 1);
  assertEqual(rewardMarks, 1);
  assertEqual(ledger.inputs[0].amount, 500);
  assertEqual(ledger.inputs[0].currencyCode, "ECO");
  assertEqual(
    ledger.inputs[0].requestId,
    `contract_reward:${GAME_ID}:${CONTRACT_ID}:${PROGRESS_ID}`,
  );

  const completed = await handlePlayerContractPublicListRequest(
    playerRequest("GET", "/players/me/contracts"),
    playerDependencies(repository, () => now),
  );
  const completedBody = await readJson(completed);
  playerBodies.push(completedBody);
  assertEqual(completedBody.progress[0].contractKey, CONTRACT_KEY);
  assertEqual(completedBody.progress[0].status, "completed");
  assertEqual(completedBody.progress[0].completedAt, APPROVED_AT);
  assertEqual(completedBody.progress[0].rewardIssuedAt, REWARDED_AT);
  assertEqual(
    completedBody.progress[0].evidencePayload.memo,
    "Revised export plan with cost breakdown",
  );
  assertEqual(completedBody.progress[0].resultPayload.decision, "approved");

  for (const body of playerBodies) {
    const serialized = JSON.stringify(body);
    if (UUID_PATTERN.test(serialized)) {
      throw new Error(`Player Contract response leaked an internal UUID: ${serialized}`);
    }
  }
});
