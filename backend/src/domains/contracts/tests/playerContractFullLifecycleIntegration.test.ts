import { handlePlayerContractAcceptanceRequest } from "../api/playerContractAcceptanceHttpHandler.ts";
import { handlePlayerContractPublicListRequest } from "../api/playerContractPublicListHttpHandler.ts";
import { handlePlayerContractPublicSubmitRequest } from "../api/playerContractPublicSubmitHttpHandler.ts";
import { handleStaffContractRequest } from "../api/staffContractHttpHandler.ts";
import type { StaffContractRoute } from "../api/contractRoutePaths.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import type {
  PlayerContractAcceptanceRepository,
} from "../contracts/playerContractAcceptanceContracts.ts";
import type {
  ContractCashRewardWriteInput,
  ContractRewardLedgerWriter,
} from "../services/contractRewardService.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const STAFF_ID = "00000000-0000-4000-8000-000000000301";
const CONTRACT_KEY = "aurora-export-drive";
const ACCEPTED_AT = "2026-07-19T01:00:00.000Z";
const SUBMITTED_AT = "2026-07-19T01:01:00.000Z";
const REVISION_AT = "2026-07-19T01:02:00.000Z";
const RESUBMITTED_AT = "2026-07-19T01:03:00.000Z";
const APPROVED_AT = "2026-07-19T01:04:00.000Z";
const REWARDED_AT = "2026-07-19T01:05:00.000Z";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

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

function basePlayerDependencies() {
  return {
    readSupabaseEnv: environment,
    createServiceClient: () => ({} as never),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(activeSession()),
  };
}

function playerDependencies(
  repository: ContractRepository,
  now: () => string,
) {
  return {
    ...basePlayerDependencies(),
    resolvePlayerCountryCode: () => Promise.resolve("NR"),
    createRepository: () => repository,
    now,
  };
}

async function submit(
  repository: ContractRepository,
  now: string,
  evidencePayload: Record<string, unknown>,
): Promise<Response> {
  return await handlePlayerContractPublicSubmitRequest(
    playerRequest("POST", `/players/me/contracts/${CONTRACT_KEY}/submit`, {
      evidencePayload,
    }),
    { kind: "submit", contractKey: CONTRACT_KEY },
    playerDependencies(repository, () => now),
  );
}

async function staffReview(
  repository: ContractRepository,
  ledger: ContractRewardLedgerWriter,
  now: string,
  action: "approve" | "request_revision",
  resultPayload: Record<string, unknown>,
): Promise<Response> {
  return await handleStaffContractRequest(
    staffRequest("POST", reviewPath(), { action, resultPayload }),
    reviewRoute(),
    staffDependencies(repository, ledger, now),
  );
}

async function staffReward(
  repository: ContractRepository,
  ledger: ContractRewardLedgerWriter,
  now: string,
): Promise<Response> {
  return await handleStaffContractRequest(
    staffRequest("POST", rewardPath()),
    rewardRoute(),
    staffDependencies(repository, ledger, now),
  );
}

function staffDependencies(
  repository: ContractRepository,
  ledger: ContractRewardLedgerWriter,
  now: string,
) {
  const serviceClient = new FakeServiceClient([{
    id: GAME_ID,
    name: "Period 1",
    status: "active",
    owner_staff_user_id: STAFF_ID,
  }]);
  return {
    readSupabaseEnv: environment,
    resolveStaffForRequest: () => Promise.resolve({
      ok: true as const,
      staff: { id: STAFF_ID, email: "teacher@example.test" },
      serviceClient: serviceClient as never,
    }),
    createRepository: () => repository,
    createRewardLedgerWriter: () => ledger,
    now: () => now,
  };
}

function environment() {
  return {
    ok: true as const,
    value: {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service-role",
    },
  };
}

function activeSession() {
  return {
    ok: true as const,
    session: {
      id: PLAYER_SESSION_ID,
      game_session_id: GAME_ID,
      player_id: PLAYER_ID,
      status: "active",
      expires_at: "2026-07-20T00:00:00.000Z",
      revoked_at: null,
    },
    gameSession: { id: GAME_ID, name: "Period 1", status: "active" },
    player: {
      id: PLAYER_ID,
      display_name: "Avery",
      roster_label: "A-1",
      status: "active",
    },
  };
}

function playerRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ "x-player-session-token": "player-token" });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

function staffRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ authorization: "Bearer staff-token" });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

function reviewRoute(): StaffContractRoute {
  return {
    kind: "review",
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

function rewardRoute(): StaffContractRoute {
  return {
    kind: "issueRewards",
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

function reviewPath(): string {
  return `/staff/game-sessions/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`;
}

function rewardPath(): string {
  return `/staff/game-sessions/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`;
}

class CapturingLedger implements ContractRewardLedgerWriter {
  readonly inputs: ContractCashRewardWriteInput[] = [];

  recordCashReward(input: ContractCashRewardWriteInput) {
    this.inputs.push(input);
    return Promise.resolve({ id: `ledger-${this.inputs.length}`, balance: 10_500 });
  }
}

class FakeServiceClient {
  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  from(table: string): FakeGameSessionQuery {
    if (table !== "game_sessions") throw new Error(`Unexpected table ${table}`);
    return new FakeGameSessionQuery(this.rows);
  }
}

class FakeGameSessionQuery {
  private readonly filters: { column: string; value: unknown }[] = [];

  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.rows.find((row) =>
        this.filters.every((filter) => row[filter.column] === filter.value)
      ) ?? null,
      error: null,
    });
  }
}

function contractRecord(): GameSessionContractRecord {
  return {
    id: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractTemplateId: null,
    contractKey: CONTRACT_KEY,
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: STAFF_ID,
    title: "Aurora Export Drive",
    description: "Prepare a complete export plan.",
    instructions: "Submit evidence, respond to review, and complete revision.",
    category: "trade",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: { manualText: "Submit an export plan with citations." },
    rewardPayload: { cash: { amount: 500, currencyCode: "ECO" } },
    completionMode: "manual_review",
    publishedAt: "2026-07-19T00:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: { issuer: "Aurora Trade Ministry" },
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function progressRecord(
  overrides: Partial<PlayerContractProgressRecord> = {},
): PlayerContractProgressRecord {
  return {
    id: PROGRESS_ID,
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "available",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: null,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: ACCEPTED_AT,
    updatedAt: ACCEPTED_AT,
    ...overrides,
  };
}

async function readJson(response: Response): Promise<any> {
  return await response.json();
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
