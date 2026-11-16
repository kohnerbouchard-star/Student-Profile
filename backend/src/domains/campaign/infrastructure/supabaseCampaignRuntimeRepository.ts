import type {
  DatabaseResult,
  CampaignRow,
  CampaignExecutionRpcRow,
  CampaignClaimRpcRow,
  CampaignInitializeRpcRow,
  CampaignControlRpcRow,
  CampaignAuditRow,
} from "./campaignRuntimeRows.ts";
import {
  requireRows,
  mapCampaign,
  invalid,
  effectPayload,
  mapExecution,
  requireFirst,
  mapClaimedCommand,
  requireAcknowledgement,
  assertNoError,
  mapAdminStatus,
  requireRow,
  mapAudit,
} from "./campaignRuntimeRows.ts";
import type {
  CampaignEventDefinition,
  CampaignInstance,
  CampaignPhase,
  CampaignStatus,
} from "../contracts/campaignRuntimeContracts.ts";
import type {
  CampaignEffectWorkerRepository,
} from "../services/campaignEffectWorker.ts";
import type {
  CampaignSchedulerRepository,
} from "../services/campaignScheduler.ts";

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
  rpc(functionName: "complete_campaign_effect_command_v2" | "fail_campaign_effect_command_v2",
    args: Readonly<Record<string, unknown>>): Promise<DatabaseResult<boolean>>;
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
  const repository: CampaignSchedulerRepository = {
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
  };
  return Object.freeze(repository);
}

export function createSupabaseCampaignEffectWorkerRepository(
  client: CampaignRuntimeSupabaseClient,
): CampaignEffectWorkerRepository {
  const repository: CampaignEffectWorkerRepository = {
    claim: async ({ limit, claimedAt }) => {
      const result = await client.rpc<CampaignClaimRpcRow>(
        "claim_campaign_effect_commands_v1",
        { p_limit: limit, p_claimed_at: claimedAt },
      );
      return Object.freeze(requireRows(result, "campaign effect claim").map(
        mapClaimedCommand,
      ));
    },
    complete: async ({ commandId, attemptCount, completedAt }) => {
      const result = await client.rpc(
        "complete_campaign_effect_command_v2",
        {
          p_command_public_id: commandId,
          p_expected_attempt_count: attemptCount,
          p_completed_at: completedAt,
        },
      );
      return requireAcknowledgement(result);
    },
    fail: async ({ commandId, attemptCount, errorCode }) => {
      const result = await client.rpc(
        "fail_campaign_effect_command_v2",
        {
          p_command_public_id: commandId,
          p_expected_attempt_count: attemptCount,
          p_error_code: errorCode,
        },
      );
      return requireAcknowledgement(result);
    },
  };
  return Object.freeze(repository);
}

export function createSupabaseCampaignAdminRepository(
  client: CampaignRuntimeSupabaseClient,
): CampaignAdminRepository {
  const repository: CampaignAdminRepository = {
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
  };
  return Object.freeze(repository);
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
