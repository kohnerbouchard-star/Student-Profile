import { handlePlayerContractPublicSubmitRequest } from "../api/playerContractPublicSubmitHttpHandler.ts";
import { handleStaffContractRequest } from "../api/staffContractHttpHandler.ts";
import type { StaffContractRoute } from "../api/contractRoutePaths.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import type {
  ContractCashRewardWriteInput,
  ContractRewardLedgerWriter,
} from "../services/contractRewardService.ts";

export const GAME_ID = "00000000-0000-4000-8000-000000000001";

export const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000021";

export const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";

export const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";

export const STAFF_ID = "00000000-0000-4000-8000-000000000301";

export const CONTRACT_KEY = "aurora-export-drive";

export const ACCEPTED_AT = "2026-07-19T01:00:00.000Z";

export const SUBMITTED_AT = "2026-07-19T01:01:00.000Z";

export const REVISION_AT = "2026-07-19T01:02:00.000Z";

export const RESUBMITTED_AT = "2026-07-19T01:03:00.000Z";

export const APPROVED_AT = "2026-07-19T01:04:00.000Z";

export const REWARDED_AT = "2026-07-19T01:05:00.000Z";

export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function basePlayerDependencies() {
  return {
    readSupabaseEnv: environment,
    createServiceClient: () => ({} as never),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(activeSession()),
  };
}

export function playerDependencies(
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

export async function submit(
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

export async function staffReview(
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

export async function staffReward(
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

export function staffDependencies(
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

export function environment() {
  return {
    ok: true as const,
    value: {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service-role",
    },
  };
}

export function activeSession() {
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

export function playerRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ "x-player-session-token": "player-token" });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

export function staffRequest(method: string, path: string, body?: unknown): Request {
  const headers = new Headers({ authorization: "Bearer staff-token" });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(`https://example.test${path}`, init);
}

export function reviewRoute(): StaffContractRoute {
  return {
    kind: "review",
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

export function rewardRoute(): StaffContractRoute {
  return {
    kind: "issueRewards",
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

export function reviewPath(): string {
  return `/staff/game-sessions/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`;
}

export function rewardPath(): string {
  return `/staff/game-sessions/${GAME_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`;
}

export class CapturingLedger implements ContractRewardLedgerWriter {
  readonly inputs: ContractCashRewardWriteInput[] = [];

  recordCashReward(input: ContractCashRewardWriteInput) {
    this.inputs.push(input);
    return Promise.resolve({ id: `ledger-${this.inputs.length}`, balance: 10_500 });
  }
}

export class FakeServiceClient {
  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  from(table: string): FakeGameSessionQuery {
    if (table !== "game_sessions") throw new Error(`Unexpected table ${table}`);
    return new FakeGameSessionQuery(this.rows);
  }
}

export class FakeGameSessionQuery {
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

export function contractRecord(): GameSessionContractRecord {
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

export function progressRecord(
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

export async function readJson(response: Response): Promise<any> {
  return await response.json();
}

export function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
