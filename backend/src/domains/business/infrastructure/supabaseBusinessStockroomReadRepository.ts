import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessRecipeAccessDto,
  type BusinessStockroomItemDto,
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
): Promise<readonly BusinessStockroomItemDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_stockroom_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) throw mapBusinessPhysicalEconomyReadError(response.error.message, "stockroom");
  return arrayRows(response.data).map((row) => ({
    itemKey: text(row.item_key),
    canonicalKey: text(row.canonical_key),
    name: text(row.item_name, "Unnamed item"),
    itemClass: text(row.item_class, "legacy"),
    subtype: text(row.item_subtype, "general"),
    quantityOwned: number(row.quantity_owned),
    quantityReserved: number(row.quantity_reserved),
    quantityAvailable: number(row.quantity_available),
    averageUnitCost: number(row.average_unit_cost),
    costCurrencyCode: nullableText(row.cost_currency_code),
    version: integer(row.holding_version, 1),
  }));
}

export async function readBusinessRecipes(
  client: EdgeSupabaseClient,
  input: BusinessReadScope,
): Promise<readonly BusinessRecipeAccessDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_recipes_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) throw mapBusinessPhysicalEconomyReadError(response.error.message, "recipes");
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

function mapBusinessPhysicalEconomyReadError(
  message: string,
  resource: "stockroom" | "recipes",
): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] || "BUSINESS_PHYSICAL_ECONOMY_READ_FAILED";
  const mappings: Record<string, [number, string]> = {
    PLAYER_REQUIRED: [401, "Player session scope is required."],
    BUSINESS_NOT_FOUND: [404, "Business was not found for this player."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple active Business ownership positions require resolution."],
  };
  const mapped = mappings[code];
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? (resource === "stockroom"
      ? "The Business Stockroom could not be loaded."
      : "Business recipes could not be loaded."),
    mapped?.[0] ?? 400,
  );
}

function arrayRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}
function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}
function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}
function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}
