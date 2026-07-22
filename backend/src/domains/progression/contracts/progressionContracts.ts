export const PROGRESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PROGRESSION_SKILL_ID_PATTERN = /^skl_[a-z0-9_]{3,64}_v1$/;
export const PROGRESSION_REWARD_ID_PATTERN = /^rwd_[0-9a-f]{32}$/;
export const PROGRESSION_EVENT_ID_PATTERN = /^pev_[0-9a-f]{32}$/;
export const PROGRESSION_COMMAND_ID_PATTERN = /^pcd_[0-9a-f]{32}$/;
export const PROGRESSION_CORRECTION_ID_PATTERN = /^pcr_[0-9a-f]{32}$/;
export const PROGRESSION_IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const PROGRESSION_SOURCE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export const PROGRESSION_SOURCE_DOMAINS = [
  "contracts",
  "business",
  "crafting",
  "market",
  "story",
  "relationship",
  "country",
  "world",
  "messaging",
] as const;

export const PROGRESSION_EVENT_TYPES = [
  "contract.completed",
  "business.operation.completed",
  "crafting.recipe.completed",
  "market.order.settled",
  "story.chapter.completed",
  "relationship.interaction.positive",
  "relationship.interaction.negative",
  "country.service.completed",
  "world.travel.completed",
  "world.arrival.completed",
  "messaging.contribution.approved",
] as const;

export type ProgressionSourceDomain = typeof PROGRESSION_SOURCE_DOMAINS[number];
export type ProgressionEventType = typeof PROGRESSION_EVENT_TYPES[number];

export const PROGRESSION_EVENT_SOURCE_DOMAIN = Object.freeze({
  "contract.completed": "contracts",
  "business.operation.completed": "business",
  "crafting.recipe.completed": "crafting",
  "market.order.settled": "market",
  "story.chapter.completed": "story",
  "relationship.interaction.positive": "relationship",
  "relationship.interaction.negative": "relationship",
  "country.service.completed": "country",
  "world.travel.completed": "world",
  "world.arrival.completed": "world",
  "messaging.contribution.approved": "messaging",
} as const satisfies Readonly<Record<ProgressionEventType, ProgressionSourceDomain>>);

export interface ProgressionIntegrationCompatibilityFixtureV1 {
  readonly sourceDomain: ProgressionSourceDomain;
  readonly eventType: ProgressionEventType;
  readonly sourcePublicId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export const PROGRESSION_PREDECESSOR_EVENT_FIXTURES_V1 = Object.freeze([
  {
    sourceDomain: "business",
    eventType: "business.operation.completed",
    sourcePublicId: "business_operation_completion_fixture_001",
    idempotencyKey: "business.operation.completed:fixture:001",
    occurredAt: "2026-07-21T01:00:00.000Z",
  },
  {
    sourceDomain: "crafting",
    eventType: "crafting.recipe.completed",
    sourcePublicId: "crafting_recipe_completion_fixture_001",
    idempotencyKey: "crafting.recipe.completed:fixture:001",
    occurredAt: "2026-07-21T02:00:00.000Z",
  },
  {
    sourceDomain: "market",
    eventType: "market.order.settled",
    sourcePublicId: "market_order_settlement_fixture_001",
    idempotencyKey: "market.order.settled:fixture:001",
    occurredAt: "2026-07-21T03:00:00.000Z",
  },
  {
    sourceDomain: "story",
    eventType: "story.chapter.completed",
    sourcePublicId: "story_chapter_completion_fixture_001",
    idempotencyKey: "story.chapter.completed:fixture:001",
    occurredAt: "2026-07-21T04:00:00.000Z",
  },
] as const satisfies readonly ProgressionIntegrationCompatibilityFixtureV1[]);

export type PlayerProgressionRoute =
  | { readonly kind: "read" }
  | { readonly kind: "unlock"; readonly skillId: string }
  | { readonly kind: "claim"; readonly rewardId: string }
  | { readonly kind: "malformed" };

export interface TrustedProgressionEventV1 {
  readonly gameId: string;
  readonly playerUuid: string;
  readonly sourceDomain: ProgressionSourceDomain;
  readonly eventType: ProgressionEventType;
  readonly sourcePublicId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
}

export interface ProgressionEventResultV1 {
  readonly outcome: "applied" | "capped" | "replayed";
  readonly eventId: string;
  readonly experienceAwarded: number;
  readonly resultingExperience: number;
  readonly resultingLevel: number;
  readonly achievementsCompleted: number;
}

export class ProgressionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ProgressionError";
  }
}
