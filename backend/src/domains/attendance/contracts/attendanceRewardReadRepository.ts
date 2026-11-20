export interface PlayerCountryAssignmentRow {
  readonly country_profile_id: string;
  readonly assigned_at: string;
}

export interface CountryProfileRow {
  readonly country_code: string;
  readonly currency_code: string;
}

export interface DifficultyPolicyRow {
  readonly income_modifier: number | string;
}

export interface GameSettingsDifficultyRow {
  readonly difficulty_preset: string;
}

export interface DifficultyProfileRow {
  readonly income_modifier: number | string;
}

export interface CountryEconomicSnapshotRow {
  readonly exchange_rate_index: number | string;
  readonly snapshot_sequence: number | string;
}

export interface AttendanceRewardReadResult<T> {
  readonly data: T | null;
  readonly error: unknown;
}

export interface AttendanceRewardReadRepository {
  readActiveDifficulty(
    gameSessionId: string,
  ): Promise<AttendanceRewardReadResult<DifficultyPolicyRow>>;
  readGameDifficulty(
    gameSessionId: string,
  ): Promise<AttendanceRewardReadResult<GameSettingsDifficultyRow>>;
  readDifficultyProfile(
    presetKey: string,
  ): Promise<AttendanceRewardReadResult<DifficultyProfileRow>>;
  readLatestAssignment(
    gameSessionId: string,
    playerId: string,
  ): Promise<AttendanceRewardReadResult<PlayerCountryAssignmentRow>>;
  readActiveCountry(
    countryProfileId: string,
  ): Promise<AttendanceRewardReadResult<CountryProfileRow>>;
  readLatestExchangeRate(
    gameSessionId: string,
    countryProfileId: string,
  ): Promise<AttendanceRewardReadResult<CountryEconomicSnapshotRow>>;
}
