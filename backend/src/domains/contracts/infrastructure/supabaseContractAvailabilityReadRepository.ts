import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";

// This optional targeting projection keeps the established one-or-two-read path.
// A missing/failed country read stays null; eligibility policy remains in the service.
export async function resolveActivePlayerCountryCode(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<string | null> {
  try {
    const client = serviceClient as any;
    const assignmentResponse = await client
      .from("player_country_assignments")
      .select("country_profile_id,assigned_at")
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const countryProfileId = String(
      assignmentResponse?.data?.country_profile_id ?? "",
    ).trim();
    if (assignmentResponse?.error || !countryProfileId) return null;

    const countryResponse = await client
      .from("country_profiles")
      .select("country_code")
      .eq("id", countryProfileId)
      .maybeSingle();
    const countryCode = String(
      countryResponse?.data?.country_code ?? "",
    ).trim().toUpperCase();
    return countryResponse?.error || !countryCode ? null : countryCode;
  } catch {
    return null;
  }
}
