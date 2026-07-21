import type {
  CampaignEffectDefinition,
  CampaignEventDefinition,
  CampaignInstance,
  CampaignPhase,
  CampaignStatus,
} from "../contracts/campaignRuntimeContracts.ts";
import { CampaignRuntimeError } from "../contracts/campaignRuntimeContracts.ts";
import type {
  CampaignEffectWorkerRepository,
  ClaimedCampaignEffectCommand,
} from "../services/campaignEffectWorker.ts";
import type {
  AtomicCampaignExecutionResult,
  CampaignSchedulerRepository,
} from "../services/campaignScheduler.ts";

interface DatabaseError {
  readonly code?: string;
  readonly message: string;
}

interface DatabaseResult<T> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

interface QueryBuilder<T = unknown> extends PromiseLike<DatabaseResult<T[]>> {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  maybeSingle(): Promise<DatabaseResult<T>>;
}

export interface CampaignRuntimeSupabaseClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  rpc<T = Record<string, unknown>>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DatabaseResult<T[]>>;
}

export interface CampaignSchedulePolicy {
  nextScheduledAt(input: {
    readonly instance: CampaignInstance;
    readonly event: CampaignEventDefinition;
    readonly occurredAt: string;
  }): string | null;
}

export interface CampaignAdminStatus {
  readonly campaignId: string;
  readonly status: CampaignStatus;
  readonly currentPhase: CampaignPhase;
  readonly revision: number;
  readonly eventSequence: number;
  readonly outcome: CampaignInstance["outcome"];
  readonly scheduledAt: string | null;
  readonly pausedAt: string | null;
  readonly disabledAt: string | null;
  readonly completedAt: string | null;
}

export interface CampaignAdminAuditRecord {
  readonly auditId: string;
  readonly actorType: "system" | "staff_user";
  readonly action: string;
  readonly fromStatus: CampaignStatus;
  readonly toStatus: CampaignStatus;
  readonly fromPhase: CampaignPhase;
  readonly toPhase: CampaignPhase;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface CampaignAdminRepository {
  initialize(input: {
    readonly gameId: string;
    readonly packId: string;
    readonly packVersion: string;
    readonly definitionId: string;
    readonly definitionDigest: string;
    readonly scheduledAt: string | null;
    readonly initializedAt: string;
  }): Promise<CampaignAdminStatus>;
  readStatus(input: {
    readonly gameId: string;
    readonly campaignId?: string;
  }): Promise<CampaignAdminStatus | null>;
  readAudit(input: {
    readonly gameId: string;
    readonly campaignId: string;
    readonly limit: number;
  }): Promise<readonly CampaignAdminAuditRecord[]>;
  control(input: {
    readonly gameId: string;
    readonly campaignId: string;
    readonly expectedRevision: number;
    readonly action: "pause" | "resume" | "emergency_disable" | "correct_phase";
    readonly correctedPhase: CampaignPhase | null;
    readonly actorStaffUserId: string;
    readonly reason: string;
    readonly occurredAt: string;
  }): Promise<CampaignAdminStatus>;
  readInstance(input: {
    readonly gameId: string;
    readonly campaignId: string;
  }): Promise<CampaignInstance>;
}

export function createSupabaseCampaignSchedulerRepository(
  client: CampaignRuntimeSupabaseClient,
  schedule: CampaignSchedulePolicy,
): CampaignSchedulerRepository {
  return Object.freeze({
    listDueCampaigns: async ({ dueAt, limit }) => {
      const result = await client.from<CampaignRow>("campaign_instances")
        .select("*")
        .eq("status", "active")
        .lte("scheduled_at", dueAt)
        .order("scheduled_at", { ascending: true })
        .order("public_id", { ascending: true })
        .limit(limit);
      return Object.freeze(requireRows(result, "due campaigns").map(mapCampaign));
    },
    executeEventAtomic: async (input) => {
      const nextScheduledAt = schedule.nextScheduledAt({
        instance: input.instance,
        event: input.event,
        occurredAt: input.occurredAt,
      });
      if (
        input.event.completeCampaign
          ? nextScheduledAt !== null
          : !nextScheduledAt ||
            Date.parse(nextScheduledAt) <= Date.parse(input.occurredAt)
      ) {
        throw invalid("Campaign schedule policy returned an invalid next time.");
      }
      const commands = input.event.effects.map((effect, index) => ({
        effectKind: effect.kind,
        idempotencyKey:
          `campaign:${input.instance.campaignInstanceId}:${input.instance.eventSequence + 1}:${index + 1}`,
        payload: effectPayload(effect),
      }));
      const result = await client.rpc<CampaignExecutionRpcRow>(
        "execute_campaign_event_atomic_v2",
        {
          p_game_session_id: input.instance.gameId,
          p_campaign_public_id: input.instance.campaignInstanceId,
          p_expected_revision: input.instance.revision,
          p_event_key: input.event.eventKey,
          p_trigger_key: input.triggerKey,
          p_expected_phase: input.event.phase,
          p_next_phase: input.event.nextPhase,
          p_complete_campaign: input.event.completeCampaign,
          p_prerequisite_event_keys: input.event.prerequisites,
          p_effect_commands: commands,
          p_next_scheduled_at: nextScheduledAt,
          p_actor_staff_user_id: input.actorStaffUserId,
          p_reason: input.reason,
          p_occurred_at: input.occurredAt,
        },
      );
      return mapExecution(requireFirst(result, "campaign execution"));
    },
  });
}

export function createSupabaseCampaignEffectWorkerRepository(
  client: CampaignRuntimeSupabaseClient,
): CampaignEffectWorkerRepository {
  return Object.freeze({
    claim: async ({ limit, claimedAt }) => {
      const result = await client.rpc<CampaignClaimRpcRow>(
        "claim_campaign_effect_commands_v1",
        { p_limit: limit, p_claimed_at: claimedAt },
      );
      return Object.freeze(requireRows(result, "campaign effect claim").map(
        mapClaimedCommand,
      ));
    },
    complete: async ({ commandId, completedAt }) => {
      const result = await client.rpc<{ complete_campaign_effect_command_v1: boolean }>(
        "complete_campaign_effect_command_v1",
        {
          p_command_public_id: commandId,
          p_completed_at: completedAt,
        },
      );
      requireRows(result, "campaign effect completion");
    },
    fail: async ({ commandId, errorCode }) => {
      const result = await client.rpc<{ fail_campaign_effect_command_v1: boolean }>(
        "fail_campaign_effect_command_v1",
        {
          p_command_public_id: commandId,
          p_error_code: errorCode,
        },
      );
      requireRows(result, "campaign effect failure");
    },
  });
}

export function createSupabaseCampaignAdminRepository(
  client: CampaignRuntimeSupabaseClient,
): CampaignAdminRepository {
  return Object.freeze({
    initialize: async (input) => {
      const result = await client.rpc<CampaignInitializeRpcRow>(
        "initialize_campaign_instance_v1",
        {
          p_game_session_id: input.gameId,
          p_pack_id: input.packId,
          p_pack_version: input.packVersion,
          p_definition_id: input.definitionId,
          p_definition_digest: input.definitionDigest,
          p_scheduled_at: input.scheduledAt,
          p_initialized_at: input.initializedAt,
        },
      );
      const row = requireFirst(result, "campaign initialization");
      return readStatusRequired(client, input.gameId, row.campaign_id);
    },
    readStatus: async ({ gameId, campaignId }) => {
      let query = client.from<CampaignRow>("campaign_instances")
        .select("*")
        .eq("game_session_id", gameId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (campaignId) query = query.eq("public_id", campaignId);
      const result = await query.maybeSingle();
      assertNoError(result, "campaign status");
      return result.data ? mapAdminStatus(result.data) : null;
    },
    readAudit: async ({ gameId, campaignId, limit }) => {
      const campaignResult = await client.from<CampaignRow>("campaign_instances")
        .select("id")
        .eq("game_session_id", gameId)
        .eq("public_id", campaignId)
        .maybeSingle();
      const campaign = requireRow(campaignResult, "campaign audit scope");
      const result = await client.from<CampaignAuditRow>("campaign_admin_audit")
        .select("*")
        .eq("game_session_id", gameId)
        .eq("campaign_instance_id", campaign.id)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      return Object.freeze(requireRows(result, "campaign audit").map(mapAudit));
    },
    control: async (input) => {
      const result = await client.rpc<CampaignControlRpcRow>(
        "control_campaign_instance_atomic_v1",
        {
          p_game_session_id: input.gameId,
          p_campaign_public_id: input.campaignId,
          p_expected_revision: input.expectedRevision,
          p_action: input.action,
          p_corrected_phase: input.correctedPhase,
          p_actor_staff_user_id: input.actorStaffUserId,
          p_reason: input.reason,
          p_occurred_at: input.occurredAt,
        },
      );
      requireFirst(result, "campaign control");
      return readStatusRequired(client, input.gameId, input.campaignId);
    },
    readInstance: async ({ gameId, campaignId }) => {
      const result = await client.from<CampaignRow>("campaign_instances")
        .select("*")
        .eq("game_session_id", gameId)
        .eq("public_id", campaignId)
        .maybeSingle();
      return mapCampaign(requireRow(result, "campaign instance"));
    },
  });
}

async function readStatusRequired(
  client: CampaignRuntimeSupabaseClient,
  gameId: string,
  campaignId: string,
): Promise<CampaignAdminStatus> {
  const result = await client.from<CampaignRow>("campaign_instances")
    .select("*")
    .eq("game_session_id", gameId)
    .eq("public_id", campaignId)
    .maybeSingle();
  return mapAdminStatus(requireRow(result, "campaign status"));
}

function mapCampaign(row: CampaignRow): CampaignInstance {
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

function mapAdminStatus(row: CampaignRow): CampaignAdminStatus {
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

function mapExecution(row: CampaignExecutionRpcRow): AtomicCampaignExecutionResult {
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

function mapClaimedCommand(
  row: CampaignClaimRpcRow,
): ClaimedCampaignEffectCommand {
  const effectKind = String(row.effect_kind);
  if (![
    "publish_news",
    "create_contract",
    "notify_players",
    "apply_market_shock",
    "set_store_scarcity",
    "set_route_state",
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

function mapAudit(row: CampaignAuditRow): CampaignAdminAuditRecord {
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

function effectPayload(effect: CampaignEffectDefinition): unknown {
  const { kind: _kind, ...payload } = effect;
  return payload;
}

function requireFirst<T>(
  result: DatabaseResult<T[]>,
  label: string,
): T {
  const rows = requireRows(result, label);
  if (rows.length !== 1) throw invalid(`${label} returned ${rows.length} rows.`);
  return rows[0]!;
}

function requireRows<T>(
  result: DatabaseResult<T[]>,
  label: string,
): readonly T[] {
  assertNoError(result, label);
  return Object.freeze(result.data ?? []);
}

function requireRow<T>(result: DatabaseResult<T>, label: string): T {
  assertNoError(result, label);
  if (!result.data) throw invalid(`${label} was not found.`);
  return result.data;
}

function assertNoError(
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

function campaignStatus(value: unknown): CampaignStatus {
  const status = String(value);
  if (!["active", "paused", "emergency_disabled", "completed"].includes(status)) {
    throw invalid("Campaign status is invalid.");
  }
  return status as CampaignStatus;
}

function campaignPhase(value: unknown): CampaignPhase {
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

function nonnegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw invalid(`${label} is invalid.`);
  }
  return number;
}

function timestamp(value: unknown, label: string): string {
  const result = String(value ?? "");
  if (!Number.isFinite(Date.parse(result))) throw invalid(`${label} is invalid.`);
  return result;
}

function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : timestamp(value, "campaign timestamp");
}

function invalid(message: string): CampaignRuntimeError {
  return new CampaignRuntimeError("campaign_event_invalid", message, false);
}

interface CampaignRow {
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
interface CampaignExecutionRpcRow {
  readonly execution_outcome: string;
  readonly campaign_id: string;
  readonly event_id: string;
  readonly status: unknown;
  readonly current_phase: unknown;
  readonly revision: unknown;
  readonly event_sequence: unknown;
  readonly outcome: unknown;
}
interface CampaignClaimRpcRow {
  readonly command_id: string;
  readonly game_session_id: string;
  readonly campaign_id: string;
  readonly idempotency_key: string;
  readonly effect_kind: unknown;
  readonly payload: unknown;
  readonly attempt_count: unknown;
}
interface CampaignInitializeRpcRow {
  readonly initialization_outcome: string;
  readonly campaign_id: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
}
interface CampaignControlRpcRow {
  readonly campaign_id: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: unknown;
  readonly paused_at: unknown;
  readonly disabled_at: unknown;
}
interface CampaignAuditRow {
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
