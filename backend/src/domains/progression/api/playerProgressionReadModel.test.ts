import { ProgressionError } from "../contracts/progressionContracts.ts";
import { normalizePlayerProgressionReadModelV1 } from "./playerProgressionReadModel.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const valid = {
  playerName: "Player",
  title: "New Arrival",
  summary: "Balanced path.",
  level: 4,
  xp: 700,
  currentLevelXp: 675,
  nextLevelXp: 1050,
  skillPoints: 2,
  reputation: [{
    type: "story",
    scope: "campaign",
    name: "Story reputation",
    label: "Neutral",
    score: 0,
    displayScore: 100,
    public: false,
    icon: "book",
  }],
  milestones: [{
    id: "ach_first_step_v1",
    title: "First Step",
    detail: "Complete one event.",
    progress: 100,
    icon: "target",
  }],
  skills: [{
    id: "skl_market_literacy_v1",
    category: "Markets",
    track: "markets",
    tier: 1,
    name: "Market Literacy",
    description: "Learn.",
    cost: 1,
    minimumLevel: 2,
    prerequisiteSkillId: null,
    capability: "progression.markets.literacy",
    effectBasisPoints: 100,
    unlocked: true,
    unlockId: `pun_${"a".repeat(32)}`,
    icon: "chart",
  }],
  achievements: [{
    id: "ach_first_step_v1",
    name: "First Step",
    description: "Complete one event.",
    currentValue: 1,
    threshold: 1,
    progressText: "1 / 1",
    complete: true,
    completedAt: "2026-07-21T01:00:00.000Z",
    claimable: true,
    rewardId: `rwd_${"b".repeat(32)}`,
    rewardKind: "skill_points",
    rewardAmount: 1,
  }],
  licenses: [{
    id: `pun_${"a".repeat(32)}`,
    name: "Market Literacy",
    issuer: "Econovaria Progression Office",
    description: "Learn.",
    status: "Active",
    capability: "progression.markets.literacy",
    icon: "certificate",
  }],
};

Deno.test("Player Progression self read preserves private achievement and hidden reputation state without UUIDs", () => {
  const result = normalizePlayerProgressionReadModelV1(valid);
  assertEquals(
    (result.reputation as Array<{ public: boolean }>)[0].public,
    false,
  );
  assertEquals(
    (result.achievements as Array<{ claimable: boolean }>)[0].claimable,
    true,
  );
  assertNoUuid(JSON.stringify(result));
});

Deno.test("Player Progression self read rejects unexpected top-level and nested private fields", () => {
  for (const candidate of [
    { ...valid, playerUuid: "00000000-0000-4000-8000-000000000021" },
    {
      ...valid,
      achievements: [{ ...valid.achievements[0], staffUserId: "internal" }],
    },
    {
      ...valid,
      reputation: [{ ...valid.reputation[0], idempotencyKey: "secret" }],
    },
  ]) assertInvalid(candidate);
});

Deno.test("Player Progression self read rejects UUID-shaped strings and malformed public identifiers", () => {
  for (const candidate of [
    { ...valid, playerName: "00000000-0000-4000-8000-000000000021" },
    {
      ...valid,
      skills: [{
        ...valid.skills[0],
        unlockId: "00000000-0000-4000-8000-000000000021",
      }],
    },
    {
      ...valid,
      achievements: [{ ...valid.achievements[0], rewardId: "reward-raw" }],
    },
  ]) assertInvalid(candidate);
});

function assertInvalid(value: unknown): void {
  try {
    normalizePlayerProgressionReadModelV1(value);
  } catch (error) {
    if (
      error instanceof ProgressionError &&
      error.code === "player_progression_invalid_response"
    ) return;
    throw error;
  }
  throw new Error("Expected invalid read model");
}
function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
