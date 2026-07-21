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
] as const;

export type ProgressionSourceDomain = typeof PROGRESSION_SOURCE_DOMAINS[number];
export type ProgressionEventType = typeof PROGRESSION_EVENT_TYPES[number];

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
