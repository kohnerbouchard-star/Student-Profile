import type { JsonValue } from "../../../supabase/tableTypes.ts";

export type PlayerStoryRelationshipRole =
  | "sponsor"
  | "local_friend"
  | "rival_peer"
  | "gatekeeper"
  | "former_home"
  | "other";

export type PlayerStoryRelationshipStage =
  | "contacted"
  | "engaged"
  | "trusted"
  | "strained"
  | "broken";

export interface PlayerStoryRelationship {
  readonly characterKey: string;
  readonly characterName: string;
  readonly countryCode: string | null;
  readonly relationshipRole: PlayerStoryRelationshipRole;
  readonly stage: PlayerStoryRelationshipStage;
  readonly contactCount: number;
  readonly replyCount: number;
  readonly trustScore: number;
  readonly memory: Readonly<Record<string, JsonValue>>;
}

export interface PlayerStoryContext {
  readonly playerId: string;
  readonly gameSessionId: string;
  readonly homeCountryId: string | null;
  readonly homeCountryCode: string | null;
  readonly currentCountryId: string | null;
  readonly currentCountryCode: string | null;
  readonly cashBalance: number | null;
  readonly resources: Readonly<Record<string, number>>;
  readonly sectorExposurePct: Readonly<Record<string, number>>;
  readonly countryExposurePct: Readonly<Record<string, number>>;
  readonly activeContractKeys: readonly string[];
  readonly completedContractKeys: readonly string[];
  readonly storyFlags: Readonly<Record<string, JsonValue>>;
  readonly relationships?: Readonly<Record<string, PlayerStoryRelationship>>;
}
