import {
  type CampaignEventDefinition,
  type CampaignExecutionCommand,
  type CampaignExecutionResult,
  type CampaignInstance,
  CampaignRuntimeError,
  type CampaignPhase,
} from "../contracts/campaignRuntimeContracts.ts";

const ALLOWED_TRANSITIONS: Readonly<Record<CampaignPhase, readonly CampaignPhase[]>> = {
  arrival: ["arrival", "opportunity"],
  opportunity: ["opportunity", "rivalry"],
  rivalry: ["rivalry", "shortage"],
  shortage: ["shortage", "meridian_disruption"],
  meridian_disruption: ["meridian_disruption", "open_conflict"],
  open_conflict: ["open_conflict", "adaptation"],
  adaptation: ["adaptation", "reconstruction", "continued_conflict"],
  reconstruction: ["reconstruction"],
  continued_conflict: ["continued_conflict"],
};

export interface CreateCampaignInstanceInput {
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly definition: CampaignInstance["definition"];
  readonly now: string;
  readonly scheduledAt?: string | null;
}

export interface ExecuteCampaignEventInput {
  readonly gameId: string;
  readonly expectedRevision: number;
  readonly triggerKey: string;
  readonly occurredAt: string;
}

export function createCampaignInstance(
  input: CreateCampaignInstanceInput,
): CampaignInstance {
  requireNonEmpty(input.campaignInstanceId, "campaignInstanceId");
  requireNonEmpty(input.gameId, "gameId");
  requireNonEmpty(input.definition.packId, "definition.packId");
  requireNonEmpty(input.definition.packVersion, "definition.packVersion");
  requireNonEmpty(input.definition.definitionId, "definition.definitionId");
  requireNonEmpty(input.definition.definitionDigest, "definition.definitionDigest");
  requireIsoDate(input.now, "now");
  if (input.scheduledAt) requireIsoDate(input.scheduledAt, "scheduledAt");

  return Object.freeze({
    campaignInstanceId: input.campaignInstanceId,
    gameId: input.gameId,
    definition: Object.freeze({ ...input.definition }),
    status: "active",
    currentPhase: "arrival",
    revision: 0,
    eventSequence: 0,
    executedEventKeys: Object.freeze([]),
    completedEffectKeys: Object.freeze([]),
    outcome: null,
    scheduledAt: input.scheduledAt ?? null,
    pausedAt: null,
    disabledAt: null,
    completedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function executeCampaignEvent(
  instance: CampaignInstance,
  event: CampaignEventDefinition,
  input: ExecuteCampaignEventInput,
): CampaignExecutionResult {
  validateEvent(event);
  requireIsoDate(input.occurredAt, "occurredAt");
  requireNonEmpty(input.triggerKey, "triggerKey");

  if (input.gameId !== instance.gameId) {
    throw new CampaignRuntimeError(
      "campaign_game_scope_mismatch",
      "Campaign execution is scoped to a different game.",
      false,
    );
  }

  if (instance.status !== "active") {
    throw new CampaignRuntimeError(
      "campaign_not_active",
      `Campaign is ${instance.status}.`,
      instance.status === "paused",
    );
  }

  if (input.expectedRevision !== instance.revision) {
    throw new CampaignRuntimeError(
      "campaign_revision_conflict",
      "Campaign revision changed before execution.",
      true,
    );
  }

  if (event.phase !== instance.currentPhase) {
    throw new CampaignRuntimeError(
      "campaign_phase_conflict",
      `Event ${event.eventKey} does not belong to phase ${instance.currentPhase}.`,
      false,
    );
  }

  const executionKey = `${event.eventKey}:${input.triggerKey}`;
  if (instance.executedEventKeys.includes(executionKey)) {
    return Object.freeze({
      instance,
      commands: Object.freeze([]),
      executionKey,
      replayed: true,
    });
  }

  for (const prerequisite of event.prerequisites) {
    if (!instance.executedEventKeys.some((key) => key.startsWith(`${prerequisite}:`))) {
      throw new CampaignRuntimeError(
        "campaign_prerequisite_missing",
        `Campaign event prerequisite ${prerequisite} has not completed.`,
        true,
      );
    }
  }

  const nextPhase = event.nextPhase ?? instance.currentPhase;
  if (!ALLOWED_TRANSITIONS[instance.currentPhase].includes(nextPhase)) {
    throw new CampaignRuntimeError(
      "campaign_transition_invalid",
      `Transition ${instance.currentPhase} -> ${nextPhase} is not allowed.`,
      false,
    );
  }

  if (event.completeCampaign && !["reconstruction", "continued_conflict"].includes(nextPhase)) {
    throw new CampaignRuntimeError(
      "campaign_transition_invalid",
      "A campaign may complete only in an approved terminal outcome phase.",
      false,
    );
  }

  const sequence = instance.eventSequence + 1;
  const commands = event.effects.map((effect, index): CampaignExecutionCommand =>
    Object.freeze({
      idempotencyKey: campaignEffectKey(instance.campaignInstanceId, executionKey, index),
      campaignInstanceId: instance.campaignInstanceId,
      gameId: instance.gameId,
      eventKey: event.eventKey,
      sequence,
      effect: Object.freeze({ ...effect }),
    })
  );

  const completedEffectKeys = Object.freeze([
    ...instance.completedEffectKeys,
    ...commands.map((command) => command.idempotencyKey),
  ].slice(-512));
  const executedEventKeys = Object.freeze([
    ...instance.executedEventKeys,
    executionKey,
  ].slice(-256));
  const completed = event.completeCampaign;

  const nextInstance: CampaignInstance = Object.freeze({
    ...instance,
    status: completed ? "completed" : "active",
    currentPhase: nextPhase,
    revision: instance.revision + 1,
    eventSequence: sequence,
    executedEventKeys,
    completedEffectKeys,
    outcome: completed ? nextPhase as "reconstruction" | "continued_conflict" : null,
    completedAt: completed ? input.occurredAt : null,
    scheduledAt: null,
    updatedAt: input.occurredAt,
  });

  return Object.freeze({
    instance: nextInstance,
    commands: Object.freeze(commands),
    executionKey,
    replayed: false,
  });
}

export function campaignEffectKey(
  campaignInstanceId: string,
  executionKey: string,
  effectIndex: number,
): string {
  const source = `${campaignInstanceId}|${executionKey}|${effectIndex}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cex_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validateEvent(event: CampaignEventDefinition): void {
  requireNonEmpty(event.eventKey, "event.eventKey");
  if (event.effects.length === 0 || event.effects.length > 32) {
    throw new CampaignRuntimeError(
      "campaign_event_invalid",
      "Campaign events require between one and 32 bounded effects.",
      false,
    );
  }
  if (new Set(event.prerequisites).size !== event.prerequisites.length) {
    throw new CampaignRuntimeError(
      "campaign_event_invalid",
      "Campaign prerequisites must be unique.",
      false,
    );
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new CampaignRuntimeError(
      "campaign_event_invalid",
      `${field} is required.`,
      false,
    );
  }
}

function requireIsoDate(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CampaignRuntimeError(
      "campaign_event_invalid",
      `${field} must be an ISO timestamp.`,
      false,
    );
  }
}
