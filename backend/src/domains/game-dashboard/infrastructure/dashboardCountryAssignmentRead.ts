import { normalizeCurrencyCode, unique } from "./dashboardFinancialProjection.ts";
import {
  COUNTRY_ASSIGNMENT_SELECT,
  COUNTRY_PROFILE_SELECT,
  type CountryAssignmentRow,
  type CountryInfo,
  type CountryProfileRow,
  type SupabasePlayerGameDashboardClient,
} from "./dashboardReadRows.ts";
import { readFailed } from "./dashboardReadFailure.ts";

export async function readDashboardCountryAssignments(
  client: SupabasePlayerGameDashboardClient,
    gameSessionId: string,
  ): Promise<ReadonlyMap<string, CountryInfo>> {
    const response = await client
      .from("player_country_assignments")
      .select(COUNTRY_ASSIGNMENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false });

    if (response.error) {
      throw readFailed();
    }

    const assignments = (response.data ?? []) as CountryAssignmentRow[];
    const countryProfileIds = unique(
      assignments.map((assignment) => assignment.country_profile_id),
    );

    if (countryProfileIds.length === 0) {
      return new Map();
    }

    const countriesResponse = await client
      .from("country_profiles")
      .select(COUNTRY_PROFILE_SELECT)
      .in("id", countryProfileIds);

    if (countriesResponse.error) {
      throw readFailed();
    }

    const countryById = new Map(
      ((countriesResponse.data ?? []) as CountryProfileRow[])
        .map((country) => [country.id, country] as const),
    );
    const countryByPlayerId = new Map<string, CountryInfo>();

    for (const assignment of assignments) {
      if (countryByPlayerId.has(assignment.player_id)) {
        continue;
      }

      const country = countryById.get(assignment.country_profile_id);
      countryByPlayerId.set(assignment.player_id, {
        countryCode: country?.country_code ?? null,
        currencyCode: normalizeCurrencyCode(country?.currency_code),
      });
    }

    return countryByPlayerId;
  }
