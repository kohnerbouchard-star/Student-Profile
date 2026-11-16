import type {
  CampaignEffectDefinition,
  CampaignInstance,
  CampaignPhase,
  CampaignStatus,
} from "../contracts/campaignRuntimeContracts.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";
import type { ClaimedCampaignEffectCommand } from "../services/campaignEffectWorker.ts";
import type { AtomicCampaignExecutionResult } from "../services/campaignScheduler.ts";
import type {
  CampaignAdminStatus,
  CampaignAdminAuditRecord,
} from "./supabaseCampaignRuntimeRepository.ts";

export interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

export interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

export function mapCampaign(row: CampaignRow): CampaignInstance {
  return Object.freeze({
    campaignInstanceId: row.public_id,
    gameId: row.game_session_id,
    definition: Object.freeze({
      packId: row.pack_id,
      packVersion: row.pack_version,
      definitionId: row.definition_id,
      definitionDigest: row.definition_digest,
    }),
    status: campaignStatus(row.status),
    currentPhase: campaignPhase(row.current_phase),
    revision: nonnegative(row.revision, "campaign revision"),
    eventSequence: nonnegative(row.event_sequence, "campaign sequence"),
    executedEventKeys: Object.freeze([]),
    completedEffectKeys: Object.freeze([]),
    outcome: row.outcome === "reconstruction" || row.outcome === "continued_conflict"
      ? row.outcome
      : null,
    scheduledAt: nullableTimestamp(row.scheduled_at),
    pausedAt: nullableTimestamp(row.paused_at),
    disabledAt: nullableTimestamp(row.disabled_at),
    completedAt: nullableTimestamp(row.completed_at),
    createdAt: timestamp(row.created_at, "campaign creation"),
    updatedAt: timestamp(row.updated_at, "campaign update"),
  });
}

export function mapAdminStatus(row: CampaignRow): CampaignAdminStatus {
  const campaign = mapCampaign(row);
  return Object.freeze({
    campaignId: campaign.campaignInstanceId,
    status: campaign.status,
    currentPhase: campaign.currentPhase,
    revision: campaign.revision,
    eventSequence: campaign.eventSequence,
    outcome: campaign.outcome,
    scheduledAt: campaign.scheduledAt,
    pausedAt: campaign.pausedAt,
    disabledAt: campaign.disabledAt,
    completedAt: campaign.completedAt,
  });
}

export function mapExecution(row: CampaignExecutionRpcRow): AtomicCampaignExecutionResult {
  return Object.freeze({
    executionOutcome: row.execution_outcome === "replayed" ? "replayed" : "executed",
    campaignId: row.campaign_id,
    eventId: row.event_id,
    status: campaignStatus(row.status),
    currentPhase: campaignPhase(row.current_phase),
    revision: nonnegative(row.revision, "campaign revision"),
    eventSequence: nonnegative(row.event_sequence, "campaign sequence"),
    outcome: row.outcome === "reconstruction" || row.outcome === "continued_conflict"
      ? row.outcome
      : null,
  });
}

export function mapClaimedCommand(
  row: CampaignClaimRpcRow,
): ClaimedCampaignEffectCommand {
  const effectKind = String(row.effect_kind);
  if (![
    "publish_news",
    "publish_cutscene",
    "create_contract",
    "notify_players",
    "apply_market_shock",
    "set_store_scarcity",
    "set_route_state",
    "apply_player_impact",
  ].includes(effectKind)) {
    throw invalid("Claimed campaign effect kind is invalid.");
  }
  return Object.freeze({
    commandId: row.command_id,
    gameId: row.game_session_id,
    campaignId: row.campaign_id,
    idempotencyKey: row.idempotency_key,
    effectKind: effectKind as ClaimedCampaignEffectCommand["effectKind"],
    payload: row.payload,
    attemptCount: nonnegative(row.attempt_count, "effect attempt"),
  });
}

export function mapAudit(row: CampaignAuditRow): CampaignAdminAuditRecord {
  return Object.freeze({
    auditId: row.public_id,
    actorType: row.actor_type === "staff_user" ? "staff_user" : "system",
    action: row.action,
    fromStatus: campaignStatus(row.from_status),
    toStatus: campaignStatus(row.to_status),
    fromPhase: campaignPhase(row.from_phase),
    toPhase: campaignPhase(row.to_phase),
    reason: typeof row.reason === "string" ? row.reason : null,
    occurredAt: timestamp(row.occurred_at, "campaign audit time"),
  });
}

export function effectPayload(effect: CampaignEffectDefinition): unknown {
  const { kind: _kind, ...payload } = effect;
  return payload;
}

export function requireFirst<T>(
  result: DatabaseResult<T[]>,
  label: string,
): T {
  const rows = requireRows(result, label);
  if (rows.length !== 1) throw invalid(`${label} returned ${rows.length} rows.`);
  return rows[0]!;
}

export function requireAcknowledgement(result: DatabaseResult<boolean>): boolean {
  assertNoError(result, "campaign effect acknowledgement");
  if (typeof result.data !== "boolean") throw invalid("Campaign acknowledgement must be boolean.");
  return result.data;
}

export function requireRows<T>(
  result: DatabaseResult<T[]>,
  label: string,
): readonly T[] {
  assertNoError(result, label);
  return Object.freeze(result.data ?? []);
}

export function requireRow<T>(result: DatabaseResult<T>, label: string): T {
  assertNoError(result, label);
  if (!result.data) throw invalid(`${label} was not found.`);
  return result.data;
}

export function assertNoError(
  result: DatabaseResult<unknown>,
  label: string,
): void {
  if (result.error) {
    throw new CampaignRuntimeError(
      result.error.code === "40001"
        ? "campaign_revision_conflict"
        : "campaign_event_invalid",
      `${label} failed: ${result.error.code ?? "database_error"}.`,
      result.error.code === "40001",
    );
  }
}

export function campaignStatus(value: unknown): CampaignStatus {
  const status = String(value);
  if (!["active", "paused", "emergency_disabled", "completed"].includes(status)) {
    throw invalid("Campaign status is invalid.");
  }
  return status as CampaignStatus;
}

export function campaignPhase(value: unknown): CampaignPhase {
  const phase = String(value);
  if (![
    "arrival",
    "opportunity",
    "rivalry",
    "shortage",
    "meridian_disruption",
    "open_conflict",
    "adaptation",
    "reconstruction",
    "continued_conflict",
  ].includes(phase)) throw invalid("Campaign phase is invalid.");
  return phase as CampaignPhase;
}

export function nonnegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw invalid(`${label} is invalid.`);
  }
  return number;
}

export function timestamp(value: unknown, label: string): string {
  const result = String(value ?? "");
  if (!Number.isFinite(Date.parse(result))) throw invalid(`${label} is invalid.`);
  return result;
}

export function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : timestamp(value, "campaign timestamp");
}

export function invalid(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError("campaign_event_invalid", message, false);
}

export interface CampaignRow {
  readonly id: string;
  readonly public_id: string;
  readonly game_session_id: string;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly status: unknown;
  readonly current_phase: unknown;
  readonly revision: unknown;
  readonly event_sequence: unknown;
  readonly outcome: unknown;
  readonly scheduled_at: unknown;
  readonly paused_at: unknown;
  readonly disabled_at: unknown;
  readonly completed_at: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}
export interface CampaignExecutionRpcRow {
  readonly execution_outcome: string;
  readonly campaign_id: string;
  readonly event_id: string;
  readonly status: unknown;
  readonly current_phase: unknown;
  readonly revision: unknown;
  readonly event_sequence: unknown;
  readonly outcome: unknown;
}
export interface CampaignClaimRpcRow {
  readonly command_id: string;
  readonly game_session_id: string;
  readonly campaign_id: string;
  readonly idempotency_key: string;
  readonly effect_kind: unknown;
  readonly payload: unknown;
  readonly attempt_count: unknown;
}
export interface CampaignInitializeRpcRow {
  readonly initialization_outcome: string;
  readonly campaign_id: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
}
export interface CampaignControlRpcRow {
  readonly campaign_id: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
  readonly paused_at: unknown;
  readonly disabled_at: unknown;
}
export interface CampaignAuditRow {
  readonly public_id: string;
  readonly actor_type: unknown;
  readonly action: string;
  readonly from_status: unknown;
  readonly to_status: unknown;
  readonly from_phase: unknown;
  readonly to_phase: unknown;
  readonly reason: unknown;
  readonly occurred_at: unknown;
}
