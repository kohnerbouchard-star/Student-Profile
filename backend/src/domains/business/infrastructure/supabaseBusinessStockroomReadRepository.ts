import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidStockroomResult,
  parseStockroomEnvelope,
  parseStockroomItems,
  parseStockroomLocations,
} from "../application/stockroom/businessStockroomResultParser.ts";
import { buildBusinessStockroomSnapshot } from "../application/stockroom/businessStockroomSnapshot.ts";
import {
  type BusinessEquipmentDto,
  type BusinessRecipeAccessDto,
  type BusinessStockroomSnapshotDto,
  PlayerBusinessError,
} from "../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;
type BusinessReadScope = {
  readonly gameSessionId: string;
  readonly playerId: string;
};

export async function readBusinessStockroom(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<BusinessStockroomSnapshotDto> {
  const response = await client.rpc<unknown>(
    "read_owned_business_stockroom_snapshot_v2",
    {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
    },
  );
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(
      response.error.message,
      "stockroom",
    );
  }

  const envelope = parseStockroomEnvelope(response.data);
  const snapshot = buildBusinessStockroomSnapshot(
    parseStockroomLocations(envelope.locations),
    parseStockroomItems(envelope.items),
  );
  if (snapshot.businessKey !== envelope.businessKey) {
    throw invalidStockroomResult(
      "Stockroom snapshot Business key does not match its holdings.",
    );
  }
  return snapshot;
}

export async function readBusinessRecipes(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<readonly BusinessRecipeAccessDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_recipes_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(response.error.message, "recipes");
  }
  return arrayRows(response.data).map((row) => ({
    accessKey: text(row.access_key),
    recipeKey: text(row.recipe_key),
    name: text(row.recipe_name, "Unnamed recipe"),
    category: text(row.recipe_category, "general"),
    tier: integer(row.recipe_tier, 1),
    workshopTier: integer(row.workshop_tier, 1),
    baseDurationSeconds: integer(row.base_duration_seconds, 1),
    difficultyProfile: text(row.difficulty_profile, "standard"),
    description: text(row.description, "Approved deterministic recipe."),
    availability: {
      enabled: Boolean(row.availability_enabled),
      availableInBusinessCountry: Boolean(row.available_in_business_country),
      availableNow: Boolean(row.available_now),
      scarcityBand: text(row.scarcity_band, "unavailable"),
      eventDurationMultiplier: number(row.event_duration_multiplier, 1),
      routeDisruptionMultiplier: number(row.route_disruption_multiplier, 1),
    },
    sourceType: text(row.source_type),
    grantedAt: text(row.granted_at),
  }));
}

export async function readBusinessEquipment(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<readonly BusinessEquipmentDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_equipment_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) {
    throw mapBusinessPhysicalEconomyReadError(response.error.message, "equipment");
  }

  const rows = arrayRowsStrict(response.data, "business_equipment_result_invalid");
  const businessKeys = new Set<string>();
  const installationKeys = new Set<string>();
  const equipmentKeys = new Set<string>();
  return rows.map((row) => {
    const businessKey = publicKey(row.business_key, "biz");
    const installationKey = publicKey(row.installation_key, "bei");
    const equipmentKey = publicKey(row.equipment_key, "eqp");
    const itemKey = publicKey(row.item_key, "itm");
    const installationStatus = enumText(
      row.installation_status,
      ["installed", "offline"] as const,
    );
    const periodKey = text(row.period_key);
    const capacityMinutes = nonNegativeInteger(row.capacity_minutes);
    const reservedMinutes = nonNegativeInteger(row.reserved_minutes);
    const consumedMinutes = nonNegativeInteger(row.consumed_minutes);
    const availableMinutes = nonNegativeInteger(row.available_minutes);
    const idleMinutes = nonNegativeInteger(row.idle_minutes);
    const utilizationBasisPoints = boundedInteger(
      row.utilization_basis_points,
      0,
      10_000,
    );
    if (
      !/^equipment:[1-9][0-9]*$/u.test(periodKey) ||
      reservedMinutes + consumedMinutes > capacityMinutes ||
      availableMinutes > capacityMinutes ||
      idleMinutes !== availableMinutes ||
      installationKeys.has(installationKey) ||
      equipmentKeys.has(equipmentKey)
    ) {
      throw invalidEquipmentResult();
    }
    if (businessKeys.size && !businessKeys.has(businessKey)) {
      throw invalidEquipmentResult();
    }
    businessKeys.add(businessKey);
    installationKeys.add(installationKey);
    equipmentKeys.add(equipmentKey);
    return {
      businessKey,
      installationKey,
      equipmentKey,
      itemKey,
      canonicalKey: canonicalKey(row.canonical_key),
      itemName: requiredText(row.item_name),
      equipmentSlot: requiredText(row.equipment_slot),
      capabilityKeys: stringArray(row.capability_keys),
      installationStatus,
      periodKey,
      capacityMinutes,
      reservedMinutes,
      consumedMinutes,
      availableMinutes,
      idleMinutes,
      utilizationBasisPoints,
      durabilitySupported: strictBoolean(row.durability_supported),
      repairSupported: strictBoolean(row.repair_supported),
    } satisfies BusinessEquipmentDto;
  });
}

function mapBusinessPhysicalEconomyReadError(
  message: string,
  resource: "stockroom" | "recipes" | "equipment",
): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] ||
    "BUSINESS_PHYSICAL_ECONOMY_READ_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_REQUIRED: [401, "Player session scope is required."],
    BUSINESS_NOT_FOUND: [404, "Business was not found for this player."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [
      409,
      "Multiple active Business ownership positions require resolution.",
    ],
    BUSINESS_STOCKROOM_LOCATIONS_INCOMPLETE: [
      500,
      "Canonical Business Stockroom locations are incomplete.",
    ],
  };
  const mapped = mappings[code];
  const resourceMessage = resource === "stockroom"
    ? "The Business Stockroom could not be loaded."
    : resource === "recipes"
    ? "Business recipes could not be loaded."
    : "Business equipment could not be loaded.";
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? resourceMessage,
    mapped?.[0] ?? 400,
  );
}

function invalidEquipmentResult(): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_equipment_result_invalid",
    "Business equipment returned invalid public evidence.",
    500,
  );
}

function arrayRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function arrayRowsStrict(value: unknown, _code: string): Row[] {
  if (!Array.isArray(value) || value.some((entry) => !isRow(entry))) {
    throw invalidEquipmentResult();
  }
  return value;
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

function requiredText(value: unknown): string {
  const result = text(value);
  if (!result || /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(result)) {
    throw invalidEquipmentResult();
  }
  return result;
}

function publicKey(value: unknown, prefix: string): string {
  const result = text(value).toLowerCase();
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw invalidEquipmentResult();
  }
  return result;
}

function canonicalKey(value: unknown): string {
  const result = text(value);
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(result)) {
    throw invalidEquipmentResult();
  }
  return result;
}

function strictBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidEquipmentResult();
  return value;
}

function enumText<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  const result = text(value).toLowerCase();
  if (!allowed.includes(result)) throw invalidEquipmentResult();
  return result as T[number];
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw invalidEquipmentResult();
  const result = value.map((entry) => requiredText(entry));
  if (new Set(result).size !== result.length) throw invalidEquipmentResult();
  return result;
}

function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}

function nonNegativeInteger(value: unknown): number {
  return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidEquipmentResult();
  }
  return parsed;
}
