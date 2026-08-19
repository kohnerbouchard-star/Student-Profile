import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type BusinessRecipeAccessDto,
  PlayerBusinessError,
} from "../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

export async function readBusinessRecipes(
  client: EdgeSupabaseClient,
  input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  },
): Promise<readonly BusinessRecipeAccessDto[]> {
  const response = await client.rpc<unknown>("read_owned_business_recipes_v2", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
  });
  if (response.error) throw mapRecipeReadError(response.error.message);
  if (!Array.isArray(response.data)) return [];
  return response.data
    .filter((value): value is Row => Boolean(value && typeof value === "object" && !Array.isArray(value)))
    .map(toRecipeAccessDto);
}

function toRecipeAccessDto(row: Row): BusinessRecipeAccessDto {
  return {
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
  };
}

function mapRecipeReadError(message: string): PlayerBusinessError {
  const code = message.trim().split(/\s+/u)[0] || "BUSINESS_RECIPE_READ_FAILED";
  const mapping: Record<string, [number, string]> = {
    BUSINESS_NOT_FOUND: [404, "Business was not found for this player."],
    BUSINESS_OWNERSHIP_AMBIGUOUS: [409, "Multiple open businesses are owned by this player."],
  };
  const mapped = mapping[code];
  return new PlayerBusinessError(
    code.toLowerCase(),
    mapped?.[1] ?? "Business recipes could not be loaded.",
    mapped?.[0] ?? 400,
  );
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}
function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}
