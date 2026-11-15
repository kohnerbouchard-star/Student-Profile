import {
  type WorldRuntimeAdminService,
  type Input,
  type OperationResult,
  CAMPAIGN_ID,
  PHASES,
  EFFECT_ID,
} from "./worldRuntimeContracts.ts";
import {
  rejectQuery,
  databaseError,
  publicRecord,
  success,
  optionalPublicId,
  boundedInteger,
  internalCampaignId,
  strictBody,
  enumText,
  publicId,
  nonnegativeInteger,
  uuid,
  text,
  rpcResult,
  strictEffects,
  boolean,
  nullableTimestamp,
  token,
  idempotency,
  tokenArray,
} from "./worldRuntimeValidation.ts";


export async function readCampaign(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  rejectQuery(input.request, []);
  const result = await service.from("campaign_instances")
    .select(
      "public_id,pack_id,pack_version,definition_id,definition_digest,status,current_phase,revision,event_sequence,outcome,scheduled_at,paused_at,disabled_at,completed_at,created_at,updated_at",
    )
    .eq("game_session_id", input.gameId)
    .order("created_at", { ascending: true })
    .limit(10);
  if (result.error) return databaseError(result.error);
  const campaigns = (result.data ?? []).map((row) => publicRecord(row));
  const now = Date.now();
  return success({
    campaigns,
    scheduler: {
      due: campaigns.filter((campaign) =>
        campaign.status === "active" &&
        typeof campaign.scheduled_at === "string" &&
        Date.parse(campaign.scheduled_at) <= now
      ).length,
      active: campaigns.filter((campaign) => campaign.status === "active").length,
      paused: campaigns.filter((campaign) => campaign.status === "paused").length,
      emergencyDisabled: campaigns.filter((campaign) =>
        campaign.status === "emergency_disabled"
      ).length,
    },
  });
}


export async function readCampaignHistory(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["campaignId", "limit"]);
  const campaignId = optionalPublicId(
    url.searchParams.get("campaignId"),
    CAMPAIGN_ID,
    "campaignId",
  );
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  let query = service.from("campaign_event_executions")
    .select(
      "public_id,event_key,trigger_key,from_phase,to_phase,sequence,actor_type,reason,occurred_at,created_at,campaign_instance_id",
    )
    .eq("game_session_id", input.gameId)
    .order("sequence", { ascending: false })
    .limit(limit);
  if (campaignId) {
    const campaign = await internalCampaignId(service, input.gameId, campaignId);
    query = query.eq("campaign_instance_id", campaign);
  }
  const result = await query;
  if (result.error) return databaseError(result.error);
  return success({ history: (result.data ?? []).map(publicRecord) });
}


export async function readCampaignEffects(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const url = new URL(input.request.url);
  rejectQuery(input.request, ["status", "limit"]);
  const status = url.searchParams.get("status")?.trim().toLowerCase() ?? "all";
  if (!["all", "pending", "processing", "completed", "failed"].includes(status)) {
    throw new Error("Effect status filter is invalid.");
  }
  const limit = boundedInteger(url.searchParams.get("limit"), 100, 1, 250);
  let query = service.from("campaign_effect_commands")
    .select(
      "public_id,idempotency_key,effect_kind,payload,status,attempt_count,last_error_code,claimed_at,completed_at,created_at,updated_at",
    )
    .eq("game_session_id", input.gameId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  const result = await query;
  if (result.error) return databaseError(result.error);
  const effects = (result.data ?? []).map(publicRecord);
  return success({
    effects,
    summary: {
      pending: effects.filter((row) => row.status === "pending").length,
      processing: effects.filter((row) => row.status === "processing").length,
      completed: effects.filter((row) => row.status === "completed").length,
      failed: effects.filter((row) => row.status === "failed").length,
    },
  });
}


export async function controlCampaign(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "action",
    "campaignId",
    "correctedPhase",
    "expectedRevision",
    "reason",
  ]);
  const action = enumText(body.action, [
    "pause",
    "resume",
    "emergency_disable",
    "correct_phase",
  ]);
  const correctedPhase = action === "correct_phase"
    ? enumText(body.correctedPhase, PHASES.slice(0, 7))
    : null;
  if (action !== "correct_phase" && body.correctedPhase !== null) {
    throw new Error("correctedPhase is only valid for a phase correction.");
  }
  const result = await service.rpc("control_campaign_instance_atomic_v1", {
    p_game_session_id: input.gameId,
    p_campaign_public_id: publicId(body.campaignId, CAMPAIGN_ID, "campaignId"),
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_action: action,
    p_corrected_phase: correctedPhase,
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_occurred_at: new Date().toISOString(),
  });
  return rpcResult(result, "campaign control");
}


export async function manualTrigger(
  service: WorldRuntimeAdminService,
  input: Input,
): Promise<OperationResult> {
  const body = await strictBody(input.request, [
    "campaignId",
    "completeCampaign",
    "effects",
    "eventKey",
    "expectedPhase",
    "expectedRevision",
    "nextPhase",
    "nextScheduledAt",
    "prerequisiteEventKeys",
    "reason",
    "requestId",
  ]);
  const effects = strictEffects(body.effects);
  const completeCampaign = boolean(body.completeCampaign);
  const nextPhase = enumText(body.nextPhase, PHASES);
  const nextScheduledAt = nullableTimestamp(body.nextScheduledAt);
  if (completeCampaign ? nextScheduledAt !== null : nextScheduledAt === null) {
    throw new Error(
      completeCampaign
        ? "Completed campaign events cannot schedule another event."
        : "Nonterminal campaign events require nextScheduledAt.",
    );
  }
  const result = await service.rpc("execute_campaign_event_atomic_v2", {
    p_game_session_id: input.gameId,
    p_campaign_public_id: publicId(body.campaignId, CAMPAIGN_ID, "campaignId"),
    p_expected_revision: nonnegativeInteger(body.expectedRevision),
    p_event_key: token(body.eventKey, 128),
    p_trigger_key: `manual:${idempotency(body.requestId)}`,
    p_expected_phase: enumText(body.expectedPhase, PHASES),
    p_next_phase: nextPhase,
    p_complete_campaign: completeCampaign,
    p_prerequisite_event_keys: tokenArray(body.prerequisiteEventKeys, 50),
    p_effect_commands: effects.map((effect, index) => ({
      effectKind: effect.effectKind,
      idempotencyKey:
        `manual:${String(body.requestId)}:${index + 1}:${effect.effectKind}`,
      payload: effect.payload,
    })),
    p_next_scheduled_at: nextScheduledAt,
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_occurred_at: new Date().toISOString(),
  });
  return rpcResult(result, "manual campaign trigger");
}


export async function recoverEffect(
  service: WorldRuntimeAdminService,
  input: Input,
  effectId: string,
): Promise<OperationResult> {
  const body = await strictBody(input.request, ["reason", "requestId"]);
  const result = await service.rpc("recover_campaign_effect_command_v1", {
    p_game_session_id: input.gameId,
    p_command_public_id: publicId(effectId, EFFECT_ID, "effectId"),
    p_actor_staff_user_id: uuid(input.staffUserId),
    p_reason: text(body.reason, 12, 1000),
    p_idempotency_key: idempotency(body.requestId),
    p_recovered_at: new Date().toISOString(),
  });
  return rpcResult(result, "campaign effect recovery");
}
