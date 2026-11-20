import type {
  CampaignEffectPorts,
  PurposeBuiltCommand,
} from "../services/campaignEffectWorker.ts";

type AnyRecord = Record<string, unknown>;

type EffectKind =
  | "publish_news"
  | "notify_players"
  | "apply_market_shock"
  | "set_store_scarcity";

interface DatabaseError {
  readonly code?: string;
  readonly message?: string;
}

interface DatabaseResult<T = unknown> {
  readonly data: T | null;
  readonly error: DatabaseError | null;
}

interface QueryBuilder extends PromiseLike<DatabaseResult<unknown[]>> {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: readonly unknown[]): QueryBuilder;
  maybeSingle(): PromiseLike<DatabaseResult<unknown>>;
}

export interface CampaignEffectSupabaseClient {
  from(tableName: string): QueryBuilder;
  rpc(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DatabaseResult<unknown>>;
}

interface EffectDefinitionRow {
  readonly effect_kind: string;
  readonly payload: AnyRecord;
}

interface CampaignDefinitionIdentity {
  readonly packId: string;
  readonly packVersion: string;
}

const campaignDefinitionCache = new Map<string, CampaignDefinitionIdentity>();
const effectDefinitionCache = new Map<string, EffectDefinitionRow>();

export function createSupabaseCampaignEffectPorts(
  client: CampaignEffectSupabaseClient,
  appliedAt: string,
): CampaignEffectPorts {
  return {
    async publishNews(command) {
      assertAudience(command, "all_players");
      const definition = await readEffectDefinition(
        client,
        command,
        command.effect.newsDefinitionId,
        "publish_news",
      );
      await publishMarketEvent(client, command, definition.payload, 0, appliedAt);
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
        client,
        command,
        command.effect.notificationDefinitionId,
        "notify_players",
      );
      const payload = definition.payload;
      await rpc(client, "publish_campaign_notification_v1", {
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
        client,
        command,
        command.effect.marketShockDefinitionId,
        "apply_market_shock",
      );
      await publishMarketEvent(
        client,
        command,
        definition.payload,
        command.effect.magnitudeBasisPoints,
        appliedAt,
      );
    },

    async setStoreScarcity(command) {
      await assertTargetLocations(
        client,
        command.gameId,
        command.effect.targetLocationIds,
      );
      const definition = await readEffectDefinition(
        client,
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
      await rpc(client, "apply_campaign_store_scarcity_v1", {
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
      await rpc(client, "apply_world_route_state_v1", {
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
  client: CampaignEffectSupabaseClient,
  command:
    | PurposeBuiltCommand<"publish_news">
    | PurposeBuiltCommand<"apply_market_shock">,
  payload: AnyRecord,
  magnitudeBasisPoints: number,
  publishedAt: string,
): Promise<void> {
  await rpc(client, "publish_campaign_market_event_v1", {
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
  client: CampaignEffectSupabaseClient,
  command: { readonly gameId: string; readonly campaignId: string },
  definitionId: string,
  expectedKind: EffectKind,
): Promise<EffectDefinitionRow> {
  const identity = await readCampaignIdentity(
    client,
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
  client: CampaignEffectSupabaseClient,
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
  client: CampaignEffectSupabaseClient,
  gameId: string,
  ids: readonly string[],
): Promise<void> {
  const result = await client
    .from("world_location_states")
    .select("public_location_id")
    .eq("game_session_id", gameId)
    .in("public_location_id", ids);
  assertQuery(result, "campaign_effect_location_read_failed");
  if ((result.data?.length ?? 0) !== ids.length) {
    throw failure(
      "campaign_effect_location_invalid",
      "Campaign effect targets an unknown World location.",
    );
  }
}

async function rpc(
  client: CampaignEffectSupabaseClient,
  functionName: string,
  args: AnyRecord,
): Promise<void> {
  const result = await client.rpc(functionName, args);
  assertQuery(
    result,
    `campaign_${functionName.replace(/[^a-z0-9]+/g, "_")}_failed`,
  );
}

function assertAudience(
  command:
    | PurposeBuiltCommand<"publish_news">
    | PurposeBuiltCommand<"notify_players">,
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

function assertQuery(
  result: { readonly error: DatabaseError | null },
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

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
