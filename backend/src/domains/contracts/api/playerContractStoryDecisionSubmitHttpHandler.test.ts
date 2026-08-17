import { handlePlayerContractPublicSubmitRequest } from "./playerContractPublicSubmitHttpHandler.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const CONTRACT_KEY = "contract.meridian.compare-financing-governance.v1";
const NOW = "2026-08-17T01:00:00.000Z";
const RATIONALE = "Shared governance is slower, but it preserves review rights when participating institutions disagree.";

Deno.test("Story decision submission commits deterministic evidence before roleplay rendering", async () => {
  const order: string[] = [];
  const captures: unknown[] = [];
  const repository = repositoryFor({
    onUpsert(input) {
      order.push("commit");
      captures.push(input);
    },
  });

  const response = await handlePlayerContractPublicSubmitRequest(
    storyRequest({ optionKey: "multilateral", rationale: RATIONALE }),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repository, {
      renderStoryRoleplay: async (_client, input) => {
        order.push("roleplay");
        assertEquals(input, {
          gameSessionId: GAME_ID,
          playerId: PLAYER_ID,
          contractKey: CONTRACT_KEY,
        });
        return {
          decisionKey: "meridian_model_recommendation",
          optionKey: "multilateral",
          characterKey: "character.eldoran.mera-dalen.v1",
          characterName: "Mera Dalen",
          dialogue: "Then you are choosing accountability over speed. What happens when delay starts costing households more than the coordination is worth?",
          generated: true,
        };
      },
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(order, ["commit", "roleplay"]);
  assertEquals((captures[0] as { evidencePayload?: unknown }).evidencePayload, {
    storyDecision: { optionKey: "multilateral", rationale: RATIONALE },
  });
  assertEquals(body.progress.status, "submitted");
  assertEquals(body.storyRoleplay, {
    decisionKey: "meridian_model_recommendation",
    optionKey: "multilateral",
    characterKey: "character.eldoran.mera-dalen.v1",
    characterName: "Mera Dalen",
    dialogue: "Then you are choosing accountability over speed. What happens when delay starts costing households more than the coordination is worth?",
    generated: true,
  });

  const serialized = JSON.stringify(body);
  for (const privateUuid of [GAME_ID, SESSION_ID, PLAYER_ID, CONTRACT_ID, PROGRESS_ID]) {
    assert(!serialized.includes(privateUuid), `Story response must not expose private UUID ${privateUuid}.`);
  }
});

Deno.test("Story decision remains committed when optional roleplay rendering fails", async () => {
  let commits = 0;
  const repository = repositoryFor({ onUpsert: () => { commits += 1; } });
  const response = await handlePlayerContractPublicSubmitRequest(
    storyRequest({ optionKey: "hybrid", rationale: "A hybrid keeps multiple safeguards available, but I would let resilience win when a single failure could shut down the whole system." }),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repository, {
      renderStoryRoleplay: async () => {
        throw new Error("renderer unavailable");
      },
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(commits, 1);
  assertEquals(body.progress.status, "submitted");
  assertEquals(Object.prototype.hasOwnProperty.call(body, "storyRoleplay"), false);
});

Deno.test("Story decision validates semantic option shape and substantive rationale before commit", async () => {
  let commits = 0;
  let renders = 0;
  const repository = repositoryFor({ onUpsert: () => { commits += 1; } });
  const deps = dependencies(repository, {
    renderStoryRoleplay: async () => {
      renders += 1;
      return null;
    },
  });

  for (const evidence of [
    { storyDecision: { optionKey: "", rationale: RATIONALE } },
    { storyDecision: { optionKey: "Not Allowed Spaces", rationale: RATIONALE } },
    { storyDecision: { optionKey: "finance_first", rationale: "too short" } },
    {},
  ]) {
    const response = await handlePlayerContractPublicSubmitRequest(
      new Request(`https://example.test/players/me/contracts/${CONTRACT_KEY}/submit`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-session-token": "player-token",
        },
        body: JSON.stringify({ evidencePayload: evidence }),
      }),
      { kind: "submit", contractKey: CONTRACT_KEY },
      deps,
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "invalid_player_contract_submit_request");
  }

  assertEquals(commits, 0);
  assertEquals(renders, 0);
});

function storyRequest(input: { readonly optionKey: string; readonly rationale: string }): Request {
  return new Request(`https://example.test/players/me/contracts/${CONTRACT_KEY}/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "player-token",
    },
    body: JSON.stringify({
      evidencePayload: {
        storyDecision: input,
      },
    }),
  });
}

function dependencies(
  repository: ContractRepository,
  options: {
    readonly renderStoryRoleplay?: (
      client: never,
      input: { readonly gameSessionId: string; readonly playerId: string; readonly contractKey: string },
    ) => Promise<any>;
  } = {},
) {
  return {
    readSupabaseEnv: () => ({ ok: true as const, value: {} as never }),
    createServiceClient: () => ({} as never),
    hashSessionToken: async () => "hash",
    resolvePlayerCountryCode: async () => "ELDORAN",
    resolvePlayerSession: async () => ({
      ok: true as const,
      session: {
        id: SESSION_ID,
        game_session_id: GAME_ID,
        player_id: PLAYER_ID,
        status: "active",
        expires_at: "2026-08-18T00:00:00.000Z",
        revoked_at: null,
      },
      gameSession: { id: GAME_ID, name: "Game", status: "active" },
      player: {
        id: PLAYER_ID,
        display_name: "Player",
        roster_label: "A-1",
        status: "active",
      },
    }),
    createRepository: () => repository,
    renderStoryRoleplay: options.renderStoryRoleplay as never,
    now: () => NOW,
  };
}

function repositoryFor(options: { readonly onUpsert?: (input: unknown) => void } = {}): ContractRepository {
  return {
    listPlayerAvailableContracts: async () => [contractRecord()],
    getPlayerContractProgress: async () => progressRecord({ status: "in_progress" }),
    upsertPlayerContractProgress: async (input: any) => {
      options.onUpsert?.(input);
      return progressRecord({
        status: input.status,
        evidencePayload: input.evidencePayload,
        resultPayload: input.resultPayload,
        submittedAt: input.submittedAt,
      });
    },
  } as unknown as ContractRepository;
}

function contractRecord(): GameSessionContractRecord {
  return {
    id: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractTemplateId: null,
    contractKey: CONTRACT_KEY,
    sourceType: "story",
    sourceId: null,
    createdByStaffId: null,
    title: "Compare Meridian Financing and Governance",
    description: "Choose a Meridian model recommendation.",
    instructions: "Select one model and explain the tradeoff.",
    category: "policy_analysis",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {},
    rewardPayload: { cashAmount: 300, currencyCode: "ECO" },
    completionMode: "manual_review",
    publishedAt: "2026-08-17T00:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: { issuer: "Meridian Forum" },
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: NOW,
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
    status: "in_progress",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: null,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
