import {
  toPublicPlayerContractListItemDto,
  toPublicPlayerContractProgressDto,
} from "./playerContractPublicListContracts.ts";
import type {
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "./contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000301";
const STAFF_ID = "00000000-0000-4000-8000-000000000401";
const NOW = "2026-07-18T12:00:00.000Z";

Deno.test("public Player Contract DTOs expose stable public keys and remove UUID-bearing fields", () => {
  const contract: GameSessionContractRecord = {
    id: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractTemplateId: TEMPLATE_ID,
    contractKey: "intro.trade-1",
    sourceType: "staff",
    sourceId: STAFF_ID,
    createdByStaffId: STAFF_ID,
    title: "Introductory trade mission",
    description: "Review the current trade environment.",
    instructions: "Submit a short response.",
    category: "Trade",
    status: "active",
    visibility: "targeted",
    targetingPayload: {
      playerIds: [PLAYER_ID],
      countryCodes: ["ELD"],
      rosterLabels: ["A-1"],
    },
    requirementsPayload: {
      items: [{ label: "Attach evidence", requirementId: CONTRACT_ID }],
      answerKey: "private-answer",
    },
    rewardPayload: {
      cashAmount: 50,
      currencyCode: "ECO",
      items: [{ itemId: TEMPLATE_ID, name: "Trade permit", quantity: 1 }],
    },
    completionMode: "manual_review",
    publishedAt: NOW,
    deadlineAt: "2026-07-20T12:00:00.000Z",
    expiresAt: "2026-07-21T12:00:00.000Z",
    metadata: {
      issuer: "Trade Ministry",
      summary: "Introductory mission",
      createdByStaffId: STAFF_ID,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
  const progress: PlayerContractProgressRecord = {
    id: PROGRESS_ID,
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "submitted",
    evidencePayload: {
      submissionUrl: "https://example.test/evidence",
      note: "Completed work.",
      playerId: PLAYER_ID,
    },
    resultPayload: {
      feedback: "Add one comparison.",
      progressId: PROGRESS_ID,
      correctAnswer: "private-answer",
    },
    submittedAt: NOW,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const item = toPublicPlayerContractListItemDto(contract);
  const publicProgress = toPublicPlayerContractProgressDto(
    progress,
    contract.contractKey,
  );
  const serialized = JSON.stringify({ item, publicProgress });

  assertEquals(item.contractKey, "intro.trade-1");
  assertEquals(item.targetingPayload, {
    countryCodes: ["ELD"],
    rosterLabels: ["A-1"],
  });
  assertEquals(item.metadata, {
    issuer: "Trade Ministry",
    summary: "Introductory mission",
  });
  assertEquals(publicProgress.contractKey, "intro.trade-1");
  assertEquals(publicProgress.evidencePayload, {
    submissionUrl: "https://example.test/evidence",
    note: "Completed work.",
  });
  assertEquals(publicProgress.resultPayload, {
    feedback: "Add one comparison.",
  });

  for (
    const privateValue of [
      CONTRACT_ID,
      GAME_ID,
      PLAYER_ID,
      PROGRESS_ID,
      TEMPLATE_ID,
      STAFF_ID,
      "private-answer",
    ]
  ) {
    assert(
      !serialized.includes(privateValue),
      `Public Player Contract DTOs must not expose ${privateValue}.`,
    );
  }
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}.`);
  }
}
