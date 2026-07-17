import {
  isContractAvailableNow,
  listPlayerContractsAvailableNow,
} from "./playerContractAvailabilityService.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  ListGameSessionContractsInput,
  ListPlayerAvailableContractsInput,
} from "../contracts/contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-07-15T12:00:00.000Z";

Deno.test("due scheduled country contract is available without a scheduler promotion", async () => {
  const scheduled = contract({
    id: "00000000-0000-4000-8000-000000000010",
    status: "scheduled",
    visibility: "targeted",
    targetingPayload: { countryCodes: ["NORTHREACH"] },
    publishedAt: "2026-07-15T11:00:00.000Z",
  });
  const repository = repositoryWith([], [scheduled]);

  const available = await listPlayerContractsAvailableNow(repository, {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    countryCode: "northreach",
    nowIso: NOW,
  });

  assert(available.length === 1, `Expected one due scheduled contract, received ${available.length}.`);
  assert(available[0].id === scheduled.id, "Wrong scheduled contract was returned.");
  assert(repository.activeInputs[0].countryCode === "northreach", "Country code was not forwarded to the active repository query.");
  assert(repository.listInputs[0].statuses?.[0] === "scheduled", "Scheduled repository query was not issued.");
});

Deno.test("future scheduled and nonmatching country contracts remain hidden", () => {
  const future = contract({
    status: "scheduled",
    visibility: "targeted",
    targetingPayload: { countryCodes: ["NORTHREACH"] },
    publishedAt: "2026-07-15T13:00:00.000Z",
  });
  const wrongCountry = contract({
    status: "scheduled",
    visibility: "targeted",
    targetingPayload: { countryCodes: ["YRETHIA"] },
    publishedAt: "2026-07-15T11:00:00.000Z",
  });
  const input = {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    countryCode: "NORTHREACH",
    nowIso: NOW,
  };

  assert(!isContractAvailableNow(future, input), "Future scheduled contract was exposed early.");
  assert(!isContractAvailableNow(wrongCountry, input), "Contract for another country was exposed.");
});

function contract(overrides: Partial<GameSessionContractRecord> = {}): GameSessionContractRecord {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    gameSessionId: GAME_ID,
    contractTemplateId: null,
    contractKey: "availability-contract",
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: null,
    title: "Availability contract",
    description: "",
    instructions: "",
    category: "general",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {},
    rewardPayload: {},
    completionMode: "manual_review",
    publishedAt: "2026-07-15T10:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-15T09:00:00.000Z",
    ...overrides,
  };
}

function repositoryWith(
  active: readonly GameSessionContractRecord[],
  scheduled: readonly GameSessionContractRecord[],
) {
  const activeInputs: ListPlayerAvailableContractsInput[] = [];
  const listInputs: ListGameSessionContractsInput[] = [];
  return {
    activeInputs,
    listInputs,
    async listPlayerAvailableContracts(input: ListPlayerAvailableContractsInput) {
      activeInputs.push(input);
      return active;
    },
    async listGameSessionContracts(input: ListGameSessionContractsInput) {
      listInputs.push(input);
      return scheduled;
    },
  } as unknown as ContractRepository & {
    activeInputs: ListPlayerAvailableContractsInput[];
    listInputs: ListGameSessionContractsInput[];
  };
}
