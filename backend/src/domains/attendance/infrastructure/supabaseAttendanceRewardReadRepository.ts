import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type {
  AttendanceRewardReadRepository,
  AttendanceRewardReadResult,
  CountryEconomicSnapshotRow,
  CountryProfileRow,
  DifficultyPolicyRow,
  DifficultyProfileRow,
  GameSettingsDifficultyRow,
  PlayerCountryAssignmentRow,
} from "../contracts/attendanceRewardReadRepository.ts";

export class SupabaseAttendanceRewardReadRepository
  implements AttendanceRewardReadRepository {
  constructor(private readonly serviceClient: EdgeSupabaseClient) {}

  async readActiveDifficulty(
    gameSessionId: string,
  ): Promise<AttendanceRewardReadResult<DifficultyPolicyRow>> {
    return await this.serviceClient
      .from("game_difficulty_policy_settings")
      .select("income_modifier")
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .maybeSingle() as AttendanceRewardReadResult<DifficultyPolicyRow>;
  }

  async readGameDifficulty(
    gameSessionId: string,
  ): Promise<AttendanceRewardReadResult<GameSettingsDifficultyRow>> {
    return await this.serviceClient
      .from("game_settings")
      .select("difficulty_preset")
      .eq("game_session_id", gameSessionId)
      .maybeSingle() as AttendanceRewardReadResult<GameSettingsDifficultyRow>;
  }

  async readDifficultyProfile(
    presetKey: string,
  ): Promise<AttendanceRewardReadResult<DifficultyProfileRow>> {
    return await this.serviceClient
      .from("difficulty_policy_profiles")
      .select("income_modifier")
      .eq("preset_key", presetKey)
      .eq("status", "active")
      .maybeSingle() as AttendanceRewardReadResult<DifficultyProfileRow>;
  }

  async readLatestAssignment(
    gameSessionId: string,
    playerId: string,
  ): Promise<AttendanceRewardReadResult<PlayerCountryAssignmentRow>> {
    return await this.serviceClient
      .from("player_country_assignments")
      .select("country_profile_id,assigned_at")
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle() as AttendanceRewardReadResult<PlayerCountryAssignmentRow>;
  }

  async readActiveCountry(
    countryProfileId: string,
  ): Promise<AttendanceRewardReadResult<CountryProfileRow>> {
    return await this.serviceClient
      .from("country_profiles")
      .select("country_code,currency_code")
      .eq("id", countryProfileId)
      .eq("status", "active")
      .maybeSingle() as AttendanceRewardReadResult<CountryProfileRow>;
  }

  async readLatestExchangeRate(
    gameSessionId: string,
    countryProfileId: string,
  ): Promise<AttendanceRewardReadResult<CountryEconomicSnapshotRow>> {
    return await this.serviceClient
      .from("country_economic_snapshots")
      .select("exchange_rate_index,snapshot_sequence")
      .eq("game_session_id", gameSessionId)
      .eq("country_profile_id", countryProfileId)
      .order("snapshot_sequence", { ascending: false })
      .limit(1)
      .maybeSingle() as AttendanceRewardReadResult<CountryEconomicSnapshotRow>;
  }
}
