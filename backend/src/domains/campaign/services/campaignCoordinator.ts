import {
  type CampaignEventDefinition,
  type CampaignExecutionCommand,
  type CampaignExecutionResult,
  type CampaignInstance,
  type CampaignPhase,
  CampaignRuntimeError,
} from "../contracts/campaignRuntimeContracts.ts";
import { executeCampaignEvent } from "./campaignStateMachine.ts";

export type CampaignGameLifecycleState =
  | "draft"
  | "active"
  | "paused"
  | "ended"
  | "archived";

export interface CampaignAuditEntry {
  readonly auditKey: string;
  readonly gameId: string;
  readonly campaignInstanceId: string;
  readonly actorType: "system" | "staff_user";
  readonly actorId: string | null;
  readonly action: string;
  readonly fromStatus: CampaignInstance["status"];
  readonly toStatus: CampaignInstance["status"];
  readonly fromPhase: CampaignPhase;
  readonly toPhase: CampaignPhase;
  readonly reason: string | null;
  readonly occurredAt: string;
}

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

export interface CampaignTransaction {
  loadGameLifecycleForUpdate(input: {
    readonly gameId: string;
  }): Promise<CampaignGameLifecycleState>;
  loadCampaignForUpdate(input: {
    readonly gameId: string;
    readonly campaignInstanceId: string;
  }): Promise<CampaignInstance>;
  saveCampaign(instance: CampaignInstance): Promise<void>;
  enqueueCommands(commands: readonly CampaignExecutionCommand[]): Promise<void>;
  appendAudit(entry: CampaignAuditEntry): Promise<void>;
}

export interface CampaignRepository {
  withTransaction<T>(work: (transaction: CampaignTransaction) => Promise<T>): Promise<T>;
}

export interface CampaignCommandPorts {
  publishNews(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "publish_news" }>;
  }): Promise<void>;
  createContract(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "create_contract" }>;
  }): Promise<void>;
  notifyPlayers(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "notify_players" }>;
  }): Promise<void>;
  applyMarketShock(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "apply_market_shock" }>;
  }): Promise<void>;
  setStoreScarcity(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "set_store_scarcity" }>;
  }): Promise<void>;
  setRouteState(input: CampaignExecutionCommand & {
    readonly effect: Extract<CampaignExecutionCommand["effect"], { kind: "set_route_state" }>;
  }): Promise<void>;
}

export interface ManualCampaignActor {
  readonly staffUserId: string;
  readonly gameId: string;
  readonly permission: "campaign_control";
}

export async function executeScheduledCampaignEvent(input: {
  readonly repository: CampaignRepository;
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly event: CampaignEventDefinition;
  readonly scheduledFor: string;
  readonly occurredAt: string;
}): Promise<CampaignExecutionResult> {
  return executeCoordinated({
    repository: input.repository,
    campaignInstanceId: input.campaignInstanceId,
    gameId: input.gameId,
    event: input.event,
    triggerKey: `scheduler:${input.scheduledFor}`,
    occurredAt: input.occurredAt,
    actor: null,
  });
}

export async function executeManualCampaignEvent(input: {
  readonly repository: CampaignRepository;
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly event: CampaignEventDefinition;
  readonly requestId: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly actor: ManualCampaignActor;
}): Promise<CampaignExecutionResult> {
  if (
    input.actor.permission !== "campaign_control" ||
    input.actor.gameId !== input.gameId ||
    !input.actor.staffUserId.trim() ||
    input.reason.trim().length < 12 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.requestId)
  ) {
    throw new CampaignRuntimeError(
      "campaign_event_invalid",
      "Manual campaign triggers require server-resolved game ownership, permission, request id, and reviewable reason.",
      false,
    );
  }
  return executeCoordinated({
    repository: input.repository,
    campaignInstanceId: input.campaignInstanceId,
    gameId: input.gameId,
    event: input.event,
    triggerKey: `manual:${input.requestId}`,
    occurredAt: input.occurredAt,
    actor: input.actor,
    reason: input.reason.trim(),
  });
}

export function selectDueCampaignInstances(
  instances: readonly CampaignInstance[],
  now: string,
  limit = 100,
): readonly CampaignInstance[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new CampaignRuntimeError("campaign_event_invalid", "Scheduler bounds are invalid.", false);
  }
  return Object.freeze(instances
    .filter((instance) =>
      instance.status === "active" &&
      instance.scheduledAt !== null &&
      Date.parse(instance.scheduledAt) <= nowMs
    )
    .sort((left, right) =>
      String(left.scheduledAt).localeCompare(String(right.scheduledAt)) ||
      left.campaignInstanceId.localeCompare(right.campaignInstanceId)
    )
    .slice(0, limit));
}

export function applyCampaignControl(
  instance: CampaignInstance,
  input: {
    readonly gameId: string;
    readonly expectedRevision: number;
    readonly action: "pause" | "resume" | "emergency_disable" | "correct_phase";
    readonly correctedPhase?: CampaignPhase;
    readonly reason: string;
    readonly actor: ManualCampaignActor;
    readonly occurredAt: string;
  },
): { readonly instance: CampaignInstance; readonly audit: CampaignAuditEntry } {
  validateControl(instance, input);
  let status = instance.status;
  let phase = instance.currentPhase;
  let pausedAt = instance.pausedAt;
  let disabledAt = instance.disabledAt;

  switch (input.action) {
    case "pause":
      if (instance.status !== "active") throw notActiveControl("Only active campaigns may be paused.");
      status = "paused";
      pausedAt = input.occurredAt;
      break;
    case "resume":
      if (instance.status !== "paused") throw notActiveControl("Only paused campaigns may resume.");
      status = "active";
      pausedAt = null;
      break;
    case "emergency_disable":
      if (instance.status === "completed") throw notActiveControl("Completed campaigns cannot be disabled.");
      status = "emergency_disabled";
      disabledAt = input.occurredAt;
      break;
    case "correct_phase": {
      if (!input.correctedPhase || !isBoundedCorrection(instance.currentPhase, input.correctedPhase)) {
        throw new CampaignRuntimeError(
          "campaign_transition_invalid",
          "Manual phase correction is limited to the current, immediately previous, or immediately next campaign phase.",
          false,
        );
      }
      phase = input.correctedPhase;
      break;
    }
  }

  const next: CampaignInstance = Object.freeze({
    ...instance,
    status,
    currentPhase: phase,
    revision: instance.revision + 1,
    pausedAt,
    disabledAt,
    scheduledAt: status === "active" ? instance.scheduledAt : null,
    updatedAt: input.occurredAt,
  });
  return Object.freeze({
    instance: next,
    audit: Object.freeze({
      auditKey: `campaign-control:${instance.campaignInstanceId}:${next.revision}`,
      gameId: instance.gameId,
      campaignInstanceId: instance.campaignInstanceId,
      actorType: "staff_user",
      actorId: input.actor.staffUserId,
      action: input.action,
      fromStatus: instance.status,
      toStatus: next.status,
      fromPhase: instance.currentPhase,
      toPhase: next.currentPhase,
      reason: input.reason.trim(),
      occurredAt: input.occurredAt,
    }),
  });
}

export async function dispatchCampaignCommand(
  command: CampaignExecutionCommand,
  ports: CampaignCommandPorts,
): Promise<void> {
  switch (command.effect.kind) {
    case "publish_news":
      return ports.publishNews(command as Parameters<CampaignCommandPorts["publishNews"]>[0]);
    case "create_contract":
      return ports.createContract(command as Parameters<CampaignCommandPorts["createContract"]>[0]);
    case "notify_players":
      return ports.notifyPlayers(command as Parameters<CampaignCommandPorts["notifyPlayers"]>[0]);
    case "apply_market_shock":
      return ports.applyMarketShock(command as Parameters<CampaignCommandPorts["applyMarketShock"]>[0]);
    case "set_store_scarcity":
      return ports.setStoreScarcity(command as Parameters<CampaignCommandPorts["setStoreScarcity"]>[0]);
    case "set_route_state":
      return ports.setRouteState(command as Parameters<CampaignCommandPorts["setRouteState"]>[0]);
  }
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

async function executeCoordinated(input: {
  readonly repository: CampaignRepository;
  readonly campaignInstanceId: string;
  readonly gameId: string;
  readonly event: CampaignEventDefinition;
  readonly triggerKey: string;
  readonly occurredAt: string;
  readonly actor: ManualCampaignActor | null;
  readonly reason?: string;
}): Promise<CampaignExecutionResult> {
  return input.repository.withTransaction(async (transaction) => {
    const lifecycle = await transaction.loadGameLifecycleForUpdate({
      gameId: input.gameId,
    });
    if (lifecycle !== "active") {
      throw new CampaignRuntimeError(
        "campaign_game_not_active",
        `Campaign execution is unavailable while the game is ${lifecycle}.`,
        lifecycle === "paused",
      );
    }
    const current = await transaction.loadCampaignForUpdate({
      gameId: input.gameId,
      campaignInstanceId: input.campaignInstanceId,
    });
    const result = executeCampaignEvent(current, input.event, {
      gameId: input.gameId,
      expectedRevision: current.revision,
      triggerKey: input.triggerKey,
      occurredAt: input.occurredAt,
    });
    if (result.replayed) return result;
    await transaction.enqueueCommands(result.commands);
    await transaction.saveCampaign(result.instance);
    await transaction.appendAudit(Object.freeze({
      auditKey: `campaign-event:${result.executionKey}`,
      gameId: input.gameId,
      campaignInstanceId: input.campaignInstanceId,
      actorType: input.actor ? "staff_user" : "system",
      actorId: input.actor?.staffUserId ?? null,
      action: "execute_event",
      fromStatus: current.status,
      toStatus: result.instance.status,
      fromPhase: current.currentPhase,
      toPhase: result.instance.currentPhase,
      reason: input.reason ?? null,
      occurredAt: input.occurredAt,
    }));
    return result;
  });
}

function validateControl(
  instance: CampaignInstance,
  input: {
    readonly gameId: string;
    readonly expectedRevision: number;
    readonly reason: string;
    readonly actor: ManualCampaignActor;
    readonly occurredAt: string;
  },
): void {
  if (input.gameId !== instance.gameId || input.actor.gameId !== instance.gameId) {
    throw new CampaignRuntimeError("campaign_game_scope_mismatch", "Campaign control belongs to another game.", false);
  }
  if (input.expectedRevision !== instance.revision) {
    throw new CampaignRuntimeError("campaign_revision_conflict", "Campaign changed before control was applied.", true);
  }
  if (
    input.actor.permission !== "campaign_control" ||
    !input.actor.staffUserId.trim() ||
    input.reason.trim().length < 12 ||
    !Number.isFinite(Date.parse(input.occurredAt))
  ) {
    throw new CampaignRuntimeError("campaign_event_invalid", "Campaign control authorization or audit reason is invalid.", false);
  }
}

function isBoundedCorrection(current: CampaignPhase, corrected: CampaignPhase): boolean {
  const order: readonly CampaignPhase[] = [
    "arrival",
    "opportunity",
    "rivalry",
    "shortage",
    "meridian_disruption",
    "open_conflict",
    "adaptation",
  ];
  if (current === corrected) return true;
  if (["reconstruction", "continued_conflict"].includes(current)) return false;
  if (["reconstruction", "continued_conflict"].includes(corrected)) {
    return current === "adaptation";
  }
  return Math.abs(order.indexOf(current) - order.indexOf(corrected)) === 1;
}

function notActiveControl(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError("campaign_not_active", message, false);
}
