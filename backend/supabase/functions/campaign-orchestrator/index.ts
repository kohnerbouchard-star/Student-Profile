import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type {
  CampaignEffectDefinition,
  CampaignInstance,
  CampaignPhase,
  CampaignStatus,
} from "../../../src/domains/campaign/contracts/campaignRuntimeContracts.ts";
import {
  createSupabaseCampaignProgramProvider,
  createVersionedCampaignSchedulePolicy,
  type CampaignProgramSupabaseClient,
  type CampaignSchedulePolicy,
} from "../../../src/domains/campaign/infrastructure/supabaseCampaignProgramProvider.ts";
import {
  runCampaignEffectWorker,
  type CampaignEffectPorts,
  type CampaignEffectWorkerRepository,
  type ClaimedCampaignEffectCommand,
  type PurposeBuiltCommand,
} from "../../../src/domains/campaign/services/campaignEffectWorker.ts";
import {
  runCampaignScheduler,
  type AtomicCampaignExecutionResult,
  type CampaignSchedulerRepository,
} from "../../../src/domains/campaign/services/campaignScheduler.ts";

const SCHEDULER_NAME = "econovaria-campaign-runtime-scheduler-v1";
const MAX_CAMPAIGNS_PER_RUN = 25;
const MAX_EFFECTS_PER_RUN = 100;

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AnyRecord = Record<string, unknown>;

type EffectKind =
  | "publish_news"
  | "notify_players"
  | "apply_market_shock"
  | "set_store_scarcity";

interface EffectDefinitionRow {
  readonly effect_kind: string;
  readonly payload: AnyRecord;
}

interface CampaignDefinitionIdentity {
  readonly packId: string;
  readonly packVersion: string;
}

interface CampaignRow {
  readonly public_id: string;
  readonly game_session_id: string;
  readonly pack_id: string;
  readonly pack_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: number | string;
  readonly event_sequence: number | string;
  readonly outcome?: string | null;
  readonly scheduled_at?: string | null;
  readonly paused_at?: string | null;
  readonly disabled_at?: string | null;
  readonly completed_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CampaignExecutionRow {
  readonly execution_outcome: string;
  readonly campaign_id: string;
  readonly event_id: string;
  readonly status: string;
  readonly current_phase: string;
  readonly revision: number | string;
  readonly event_sequence: number | string;
  readonly outcome?: string | null;
}

interface CampaignClaimRow {
  readonly command_id: string;
  readonly game_session_id: string;
  readonly campaign_id: string;
  readonly idempotency_key: string;
  readonly effect_kind: string;
  readonly payload: unknown;
  readonly attempt_count: number | string;
}

const campaignDefinitionCache = new Map<string, CampaignDefinitionIdentity>();
const effectDefinitionCache = new Map<string, EffectDefinitionRow>();

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }

  const token = request.headers.get("x-econovaria-scheduler-token")?.trim() ?? "";
  if (!(await verifySchedulerToken(token))) {
    return json({ code: "campaign_scheduler_unauthorized" }, 401);
  }

  const now = new Date().toISOString();
  const runId = `campaign-run:${now.replace(/[^0-9]/g, "")}:${crypto.randomUUID().replaceAll("-", "")}`;

  try {
    const scheduler = await runCampaignScheduler({
      repository: createSchedulerRepository(
        createVersionedCampaignSchedulePolicy(),
      ),
      programs: createSupabaseCampaignProgramProvider(
        client as unknown as CampaignProgramSupabaseClient,
      ),
      dueAt: now,
      runId,
      limit: MAX_CAMPAIGNS_PER_RUN,
    });

    const effects = await runCampaignEffectWorker({
      repository: createEffectWorkerRepository(),
      ports: createEffectPorts(now),
      claimedAt: now,
      limit: MAX_EFFECTS_PER_RUN,
    });

    return json({ ok: true, runId, scheduler, effects });
  } catch (error) {
    console.error("campaign-orchestrator failed", safeError(error));
    return json({
      ok: false,
      code: readCode(error, "campaign_orchestrator_failed"),
    }, 500);
  }
});

function createSchedulerRepository(
  schedule: CampaignSchedulePolicy,
): CampaignSchedulerRepository {
  return Object.freeze({
    async listDueCampaigns({ dueAt, limit }) {
      const result = await client
        .from("campaign_instances")
        .select("*")
        .eq("status", "active")
        .lte("scheduled_at", dueAt)
        .order("scheduled_at", { ascending: true })
        .order("public_id", { ascending: true })
        .limit(limit);
      assertQuery(result, "campaign_due_read_failed");
      return Object.freeze(
        ((result.data ?? []) as CampaignRow[]).map(mapCampaign),
      );
    },

    async executeEventAtomic(input) {
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
        throw failure(
          "campaign_schedule_policy_invalid",
          "Campaign schedule policy returned an invalid next time.",
        );
      }

      const commands = input.event.effects.map((effect, index) => ({
        effectKind: effect.kind,
        idempotencyKey:
          `campaign:${input.instance.campaignInstanceId}:${input.instance.eventSequence + 1}:${index + 1}`,
        payload: effectPayload(effect),
      }));

      const result = await client.rpc("execute_campaign_event_atomic_v2", {
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
      });
      assertQuery(result, "campaign_execution_failed");
      const row = firstRpcRow(result.data) as CampaignExecutionRow | null;
      if (!row) {
        throw failure(
          "campaign_execution_missing_row",
          "Campaign execution returned no authoritative row.",
        );
      }
      return mapExecution(row);
    },
  });
}

function createEffectWorkerRepository(): CampaignEffectWorkerRepository {
  return Object.freeze({
    async claim({ limit, claimedAt }) {
      const result = await client.rpc("claim_campaign_effect_commands_v1", {
        p_limit: limit,
        p_claimed_at: claimedAt,
      });
      assertQuery(result, "campaign_effect_claim_failed");
      const rows = Array.isArray(result.data) ? result.data : [];
      return Object.freeze(
        rows.map((row) => mapClaimedCommand(row as CampaignClaimRow)),
      );
    },

    async complete({ commandId, completedAt }) {
      const result = await client.rpc("complete_campaign_effect_command_v1", {
        p_command_public_id: commandId,
        p_completed_at: completedAt,
      });
      assertQuery(result, "campaign_effect_completion_failed");
    },

    async fail({ commandId, errorCode }) {
      const result = await client.rpc("fail_campaign_effect_command_v1", {
        p_command_public_id: commandId,
        p_error_code: errorCode,
      });
      assertQuery(result, "campaign_effect_failure_record_failed");
    },
  });
}

function createEffectPorts(appliedAt: string): CampaignEffectPorts {
  return {
    async publishNews(command) {
      assertAudience(command, "all_players");
      const definition = await readEffectDefinition(
        command,
        command.effect.newsDefinitionId,
        "publish_news",
      );
      await publishMarketEvent(command, definition.payload, 0, appliedAt);
    },

    async publishCutscene() {
      throw failure(
        "campaign_cutscene_adapter_unavailable",
        "No canonical campaign cutscene definition is enabled in this program version.",
      );
    },

    async createContract() {
      throw failure(
        "campaign_contract_adapter_unavailable",
        "Campaign contract publication is not enabled until a versioned contract definition is present.",
      );
    },

    async notifyPlayers(command) {
      assertAudience(command, "all_players");
      const definition = await readEffectDefinition(
        command,
        command.effect.notificationDefinitionId,
        "notify_players",
      );
      const payload = definition.payload;
      await rpc("publish_campaign_notification_v1", {
        p_game_session_id: command.gameId,
        p_idempotency_key: command.idempotencyKey,
        p_title: requiredText(payload.title, "notification title"),
        p_summary: requiredText(payload.summary, "notification summary"),
        p_priority: requiredText(payload.priority, "notification priority"),
        p_display_mode: requiredText(
          payload.displayMode,
          "notification display mode",
        ),
        p_notification_type: requiredText(
          payload.notificationType,
          "notification type",
        ),
        p_published_at: appliedAt,
      });
    },

    async applyMarketShock(command) {
      const definition = await readEffectDefinition(
        command,
        command.effect.marketShockDefinitionId,
        "apply_market_shock",
      );
      await publishMarketEvent(
        command,
        definition.payload,
        command.effect.magnitudeBasisPoints,
        appliedAt,
      );
    },

    async setStoreScarcity(command) {
      await assertTargetLocations(
        command.gameId,
        command.effect.targetLocationIds,
      );
      const definition = await readEffectDefinition(
        command,
        command.effect.scarcityDefinitionId,
        "set_store_scarcity",
      );
      const payload = definition.payload;
      const durationDays = boundedInteger(
        payload.durationDays,
        1,
        365,
        "scarcity duration",
      );
      await rpc("apply_campaign_store_scarcity_v1", {
        p_game_session_id: command.gameId,
        p_idempotency_key: command.idempotencyKey,
        p_definition_id: command.effect.scarcityDefinitionId,
        p_item_keys: stringArray(payload.itemKeys, "scarcity item keys"),
        p_scarcity_band: requiredText(payload.scarcityBand, "scarcity band"),
        p_event_multiplier: boundedNumber(
          payload.eventMultiplier,
          0.5,
          4,
          "scarcity multiplier",
        ),
        p_expires_at: new Date(
          Date.parse(appliedAt) + durationDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        p_applied_at: appliedAt,
      });
    },

    async setRouteState(command) {
      const revisionResult = await client
        .from("world_runtime_instances")
        .select("revision")
        .eq("game_session_id", command.gameId)
        .maybeSingle();
      assertQuery(revisionResult, "campaign_world_runtime_read_failed");
      if (!revisionResult.data) {
        throw failure(
          "campaign_world_runtime_missing",
          "World runtime revision could not be read.",
        );
      }
      const revision = boundedInteger(
        (revisionResult.data as { revision: unknown }).revision,
        0,
        Number.MAX_SAFE_INTEGER,
        "world revision",
      );
      const multipliers = routeMultipliers(command.effect.state);
      await rpc("apply_world_route_state_v1", {
        p_game_session_id: command.gameId,
        p_expected_revision: revision,
        p_command_key: command.idempotencyKey,
        p_public_route_ids: command.effect.routeDefinitionIds,
        p_status: command.effect.state,
        p_reason: command.effect.reason,
        p_cost_multiplier_basis_points: multipliers.cost,
        p_duration_multiplier_basis_points: multipliers.duration,
        p_applied_at: appliedAt,
      });
    },

    async applyPlayerImpact() {
      throw failure(
        "campaign_player_impact_adapter_unavailable",
        "No canonical campaign player-impact definition is enabled in this program version.",
      );
    },
  };
}

async function publishMarketEvent(
  command: PurposeBuiltCommand<"publish_news" | "apply_market_shock">,
  payload: AnyRecord,
  magnitudeBasisPoints: number,
  publishedAt: string,
): Promise<void> {
  await rpc("publish_campaign_market_event_v1", {
    p_game_session_id: command.gameId,
    p_idempotency_key: command.idempotencyKey,
    p_headline: requiredText(payload.headline, "market headline"),
    p_explanation: requiredText(payload.explanation, "market explanation"),
    p_category: requiredText(payload.category, "market category"),
    p_scope: requiredText(payload.scope, "market scope"),
    p_target_key: optionalText(payload.targetKey),
    p_sentiment: requiredText(payload.sentiment, "market sentiment"),
    p_magnitude_basis_points: magnitudeBasisPoints,
    p_duration_ticks: boundedInteger(
      payload.durationTicks,
      1,
      52,
      "market duration",
    ),
    p_published_at: publishedAt,
  });
}

async function readEffectDefinition(
  command: { readonly gameId: string; readonly campaignId: string },
  definitionId: string,
  expectedKind: EffectKind,
): Promise<EffectDefinitionRow> {
  const identity = await readCampaignIdentity(
    command.gameId,
    command.campaignId,
  );
  const cacheKey = `${identity.packId}|${identity.packVersion}|${definitionId}`;
  const cached = effectDefinitionCache.get(cacheKey);
  if (cached) {
    if (cached.effect_kind !== expectedKind) throw definitionKindMismatch();
    return cached;
  }

  const result = await client
    .from("campaign_effect_definitions")
    .select("effect_kind,payload")
    .eq("pack_id", identity.packId)
    .eq("pack_version", identity.packVersion)
    .eq("definition_id", definitionId)
    .eq("status", "active")
    .maybeSingle();
  assertQuery(result, "campaign_effect_definition_read_failed");
  if (!result.data) {
    throw failure(
      "campaign_effect_definition_missing",
      `Campaign effect definition ${definitionId} is unavailable.`,
    );
  }
  const row = result.data as EffectDefinitionRow;
  if (row.effect_kind !== expectedKind || !isRecord(row.payload)) {
    throw definitionKindMismatch();
  }
  effectDefinitionCache.set(cacheKey, row);
  return row;
}

async function readCampaignIdentity(
  gameId: string,
  campaignId: string,
): Promise<CampaignDefinitionIdentity> {
  const cacheKey = `${gameId}|${campaignId}`;
  const cached = campaignDefinitionCache.get(cacheKey);
  if (cached) return cached;

  const result = await client
    .from("campaign_instances")
    .select("pack_id,pack_version")
    .eq("game_session_id", gameId)
    .eq("public_id", campaignId)
    .maybeSingle();
  assertQuery(result, "campaign_instance_identity_read_failed");
  if (!result.data) {
    throw failure(
      "campaign_instance_missing",
      "Campaign instance could not be resolved for effect delivery.",
    );
  }
  const row = result.data as { pack_id: unknown; pack_version: unknown };
  const identity = Object.freeze({
    packId: requiredText(row.pack_id, "campaign pack id"),
    packVersion: requiredText(row.pack_version, "campaign pack version"),
  });
  campaignDefinitionCache.set(cacheKey, identity);
  return identity;
}

async function assertTargetLocations(
  gameId: string,
  ids: readonly string[],
): Promise<void> {
  const result = await client
    .from("world_location_states")
    .select("public_location_id")
    .eq("game_session_id", gameId)
    .in("public_location_id", [...ids]);
  assertQuery(result, "campaign_effect_location_read_failed");
  if ((result.data?.length ?? 0) !== ids.length) {
    throw failure(
      "campaign_effect_location_invalid",
      "Campaign effect targets an unknown World location.",
    );
  }
}

async function verifySchedulerToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const tokenSha256 = await sha256Hex(token);
  const result = await client.rpc("verify_runtime_scheduler_token_v1", {
    p_scheduler_name: SCHEDULER_NAME,
    p_token_sha256: tokenSha256,
  });
  return !result.error && result.data === true;
}

async function rpc(functionName: string, args: AnyRecord): Promise<void> {
  const result = await client.rpc(functionName, args);
  assertQuery(
    result,
    `campaign_${functionName.replace(/[^a-z0-9]+/g, "_")}_failed`,
  );
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
    revision: nonnegativeInteger(row.revision, "campaign revision"),
    eventSequence: nonnegativeInteger(
      row.event_sequence,
      "campaign event sequence",
    ),
    executedEventKeys: Object.freeze([]),
    completedEffectKeys: Object.freeze([]),
    outcome: row.outcome === "reconstruction" ||
        row.outcome === "continued_conflict"
      ? row.outcome
      : null,
    scheduledAt: nullableTimestamp(row.scheduled_at),
    pausedAt: nullableTimestamp(row.paused_at),
    disabledAt: nullableTimestamp(row.disabled_at),
    completedAt: nullableTimestamp(row.completed_at),
    createdAt: requiredTimestamp(row.created_at, "campaign createdAt"),
    updatedAt: requiredTimestamp(row.updated_at, "campaign updatedAt"),
  });
}

function mapExecution(row: CampaignExecutionRow): AtomicCampaignExecutionResult {
  return Object.freeze({
    executionOutcome: row.execution_outcome === "replayed"
      ? "replayed"
      : "executed",
    campaignId: requiredText(row.campaign_id, "campaign id"),
    eventId: requiredText(row.event_id, "event id"),
    status: campaignStatus(row.status),
    currentPhase: campaignPhase(row.current_phase),
    revision: nonnegativeInteger(row.revision, "campaign revision"),
    eventSequence: nonnegativeInteger(
      row.event_sequence,
      "campaign event sequence",
    ),
    outcome: row.outcome === "reconstruction" ||
        row.outcome === "continued_conflict"
      ? row.outcome
      : null,
  });
}

function mapClaimedCommand(
  row: CampaignClaimRow,
): ClaimedCampaignEffectCommand {
  const effectKind = String(row.effect_kind);
  const allowed: readonly CampaignEffectDefinition["kind"][] = [
    "publish_news",
    "publish_cutscene",
    "create_contract",
    "notify_players",
    "apply_market_shock",
    "set_store_scarcity",
    "set_route_state",
    "apply_player_impact",
  ];
  if (!allowed.includes(effectKind as CampaignEffectDefinition["kind"])) {
    throw failure(
      "campaign_effect_kind_invalid",
      "Claimed campaign effect kind is invalid.",
    );
  }
  return Object.freeze({
    commandId: requiredText(row.command_id, "effect command id"),
    gameId: requiredText(row.game_session_id, "effect game id"),
    campaignId: requiredText(row.campaign_id, "effect campaign id"),
    idempotencyKey: requiredText(
      row.idempotency_key,
      "effect idempotency key",
    ),
    effectKind: effectKind as CampaignEffectDefinition["kind"],
    payload: row.payload,
    attemptCount: boundedInteger(
      row.attempt_count,
      1,
      25,
      "effect attempt count",
    ),
  });
}

function effectPayload(effect: CampaignEffectDefinition): unknown {
  const { kind: _kind, ...payload } = effect;
  return payload;
}

function campaignStatus(value: unknown): CampaignStatus {
  const status = String(value);
  if (!["active", "paused", "emergency_disabled", "completed"].includes(status)) {
    throw failure("campaign_status_invalid", "Campaign status is invalid.");
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
  ].includes(phase)) {
    throw failure("campaign_phase_invalid", "Campaign phase is invalid.");
  }
  return phase as CampaignPhase;
}

function assertAudience(
  command: PurposeBuiltCommand<"publish_news" | "notify_players">,
  expected: "all_players",
): void {
  if (command.effect.audience !== expected) {
    throw failure(
      "campaign_effect_audience_unsupported",
      "This canonical effect adapter only accepts all_players.",
    );
  }
}

function routeMultipliers(
  state: "open" | "restricted" | "closed",
): { cost: number; duration: number } {
  if (state === "restricted") return { cost: 14_000, duration: 16_000 };
  return { cost: 10_000, duration: 10_000 };
}

function requiredText(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw failure(
      "campaign_effect_definition_invalid",
      `${label} is missing.`,
    );
  }
  return text;
}

function optionalText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw failure(
      "campaign_effect_definition_invalid",
      `${label} is invalid.`,
    );
  }
  return Object.freeze([
    ...new Set(value.map((entry) => String(entry).trim())),
  ]);
}

function nonnegativeInteger(value: unknown, label: string): number {
  return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw failure(
      "campaign_effect_definition_invalid",
      `${label} is invalid.`,
    );
  }
  return number;
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw failure(
      "campaign_effect_definition_invalid",
      `${label} is invalid.`,
    );
  }
  return number;
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw failure("campaign_timestamp_invalid", `${label} is invalid.`);
  }
  return text;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requiredTimestamp(value, "campaign timestamp");
}

function firstRpcRow(value: unknown): unknown | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return isRecord(value) ? value : null;
}

function assertQuery(
  result: { readonly error: { readonly code?: string; readonly message?: string } | null },
  code: string,
): void {
  if (!result.error) return;
  throw failure(
    code,
    `${code}: ${result.error.code ?? "database_error"}.`,
  );
}

function definitionKindMismatch(): Error & { code: string } {
  return failure(
    "campaign_effect_definition_kind_mismatch",
    "Campaign effect definition kind does not match the queued command.",
  );
}

function failure(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function readCode(error: unknown, fallback: string): string {
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(error.code)
  ) {
    return error.code;
  }
  return fallback;
}

function safeError(error: unknown): AnyRecord {
  return {
    code: readCode(error, "campaign_orchestrator_failed"),
    message: error instanceof Error
      ? error.message
      : "Unknown campaign orchestrator failure.",
  };
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
