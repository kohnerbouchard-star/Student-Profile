export const CAMPAIGN_PHASES = [
  "arrival",
  "opportunity",
  "rivalry",
  "shortage",
  "meridian_disruption",
  "open_conflict",
  "adaptation",
  "reconstruction",
  "continued_conflict",
] as const;

export type CampaignPhase = typeof CAMPAIGN_PHASES[number];

export const CAMPAIGN_STATUSES = [
  "active",
  "paused",
  "emergency_disabled",
  "completed",
] as const;

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export interface CampaignDefinitionRef {
  readonly packId: string;
  readonly packVersion: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
}

export interface CampaignInstance {
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly definition: CampaignDefinitionRef;
  readonly status: CampaignStatus;
  readonly currentPhase: CampaignPhase;
  readonly revision: number;
  readonly eventSequence: number;
  readonly executedEventKeys: readonly string[];
  readonly completedEffectKeys: readonly string[];
  readonly outcome: "reconstruction" | "continued_conflict" | null;
  readonly scheduledAt: string | null;
  readonly pausedAt: string | null;
  readonly disabledAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CampaignEffectDefinition =
  | {
      readonly kind: "publish_news";
      readonly newsDefinitionId: string;
      readonly audience: "all_players" | "affected_locations";
    }
  | {
      readonly kind: "create_contract";
      readonly contractDefinitionId: string;
      readonly targetLocationIds: readonly string[];
    }
  | {
      readonly kind: "notify_players";
      readonly notificationDefinitionId: string;
      readonly audience: "all_players" | "affected_locations";
    }
  | {
      readonly kind: "apply_market_shock";
      readonly marketShockDefinitionId: string;
      readonly magnitudeBasisPoints: number;
    }
  | {
      readonly kind: "set_store_scarcity";
      readonly scarcityDefinitionId: string;
      readonly targetLocationIds: readonly string[];
    }
  | {
      readonly kind: "set_route_state";
      readonly routeDefinitionIds: readonly string[];
      readonly state: "open" | "restricted" | "closed";
      readonly reason: "shortage" | "meridian_disruption" | "war" | "recovery";
    };

export interface CampaignEventDefinition {
  readonly eventKey: string;
  readonly phase: CampaignPhase;
  readonly nextPhase: CampaignPhase | null;
  readonly completeCampaign: boolean;
  readonly prerequisites: readonly string[];
  readonly effects: readonly CampaignEffectDefinition[];
}

export interface CampaignExecutionCommand {
  readonly idempotencyKey: string;
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly eventKey: string;
  readonly sequence: number;
  readonly effect: CampaignEffectDefinition;
}

export interface CampaignExecutionResult {
  readonly instance: CampaignInstance;
  readonly commands: readonly CampaignExecutionCommand[];
  readonly executionKey: string;
  readonly replayed: boolean;
}

export class CampaignRuntimeError extends Error {
  constructor(
    readonly code:
      | "campaign_game_scope_mismatch"
      | "campaign_not_active"
      | "campaign_revision_conflict"
      | "campaign_phase_conflict"
      | "campaign_transition_invalid"
      | "campaign_prerequisite_missing"
      | "campaign_event_invalid",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CampaignRuntimeError";
  }
}
