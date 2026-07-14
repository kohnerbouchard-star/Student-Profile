import { toPlayerContractDto, toStaffContractDto } from "./contractHttpContracts.ts";
import type { GameSessionContractRecord } from "./contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("player contract DTO removes nested quiz answer keys while staff DTO keeps them", () => {
  const contract: GameSessionContractRecord = {
    id: "00000000-0000-4000-8000-000000000001",
    gameSessionId: "00000000-0000-4000-8000-000000000002",
    contractTemplateId: null,
    contractKey: "quiz-contract",
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: "00000000-0000-4000-8000-000000000003",
    title: "Quiz contract",
    description: "Complete the quiz.",
    instructions: "Answer every question.",
    category: "general",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {
      quiz: {
        expectedAnswer: "Hidden requirement answer",
      },
    },
    rewardPayload: {},
    completionMode: "manual_review",
    publishedAt: "2026-07-15T00:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {
      materials: [{
        type: "quiz",
        questions: [{
          prompt: "What is scarcity?",
          correctAnswer: "Limited resources",
          correctChoice: "A",
          correctChoices: ["A"],
          answerKey: "A",
          acceptedAnswers: ["Limited resources"],
          required: true,
        }],
      }],
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };

  const staff = toStaffContractDto(contract);
  const player = toPlayerContractDto(contract);
  const staffJson = JSON.stringify(staff);
  const playerJson = JSON.stringify(player);

  assert(staffJson.includes("correctAnswer"), "Staff contract DTO should retain answer keys for review.");
  assert(!playerJson.includes("correctAnswer"), "Player DTO exposed correctAnswer.");
  assert(!playerJson.includes("correctChoice"), "Player DTO exposed correctChoice.");
  assert(!playerJson.includes("correctChoices"), "Player DTO exposed correctChoices.");
  assert(!playerJson.includes("answerKey"), "Player DTO exposed answerKey.");
  assert(!playerJson.includes("acceptedAnswers"), "Player DTO exposed acceptedAnswers.");
  assert(!playerJson.includes("expectedAnswer"), "Player DTO exposed expectedAnswer.");
  assert(playerJson.includes("What is scarcity?"), "Player DTO removed the visible quiz prompt.");
});
