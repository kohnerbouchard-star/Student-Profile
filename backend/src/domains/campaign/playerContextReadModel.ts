import type { CampaignInstance, CampaignPhase } from "./contracts/campaignRuntimeContracts.ts";

export interface CampaignHistoryEntry {
  readonly publicEventId: string;
  readonly eventKey: string;
  readonly phase: CampaignPhase;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly summaryDefinitionId: string;
}

export interface PlayerCampaignContext {
  readonly status: CampaignInstance["status"];
  readonly phase: CampaignPhase;
  readonly outcome: CampaignInstance["outcome"];
  readonly sequence: number;
  readonly currentLocationAffected: boolean;
  readonly history: readonly CampaignHistoryEntry[];
}

export function buildPlayerCampaignContext(input: {
  readonly instance: CampaignInstance;
  readonly history: readonly CampaignHistoryEntry[];
  readonly playerLocationId: string;
  readonly affectedLocationIds: readonly string[];
}): PlayerCampaignContext {
  return Object.freeze({
    status: input.instance.status,
    phase: input.instance.currentPhase,
    outcome: input.instance.outcome,
    sequence: input.instance.eventSequence,
    currentLocationAffected: new Set(input.affectedLocationIds).has(input.playerLocationId),
    history: Object.freeze([...input.history]
      .filter((entry) => entry.sequence <= input.instance.eventSequence)
      .sort((left, right) => left.sequence - right.sequence)
      .slice(-50)),
  });
}
