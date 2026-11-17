import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import type { AttendanceRewardReadRepository } from "../contracts/attendanceRewardReadRepository.ts";
import type { PlayerAttendanceWindowConfig } from "../api/attendanceHttpHelpers.ts";

export interface AttendanceRewardPolicyResolution {
  readonly configuredBaseAmount: number;
  readonly effectiveAmount: number;
  readonly baseCurrencyCode: string;
  readonly currencyCode: string;
  readonly currencyMode: "player_country" | "fixed" | "fixed_fallback";
  readonly countryCode: string | null;
  readonly incomeModifier: number;
  readonly exchangeRateIndex: number;
}

export async function resolveAttendanceRewardPolicyFromRepository(
  repository: AttendanceRewardReadRepository,
  input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly configuredBaseAmount: number;
    readonly attendanceConfig: PlayerAttendanceWindowConfig;
    readonly difficultyPreset?: string | null;
  },
): Promise<AttendanceRewardPolicyResolution> {
  const incomeModifier = input.attendanceConfig.applyDifficultyIncomeModifier
    ? await readIncomeModifier(
      repository,
      input.gameSessionId,
      input.difficultyPreset,
    )
    : 1;

  if (input.attendanceConfig.currencyMode === "fixed") {
    return buildResolution({
      configuredBaseAmount: input.configuredBaseAmount,
      baseCurrencyCode: input.attendanceConfig.currencyCode,
      currencyCode: input.attendanceConfig.currencyCode,
      currencyMode: "fixed",
      countryCode: null,
      incomeModifier,
      exchangeRateIndex: 1,
    });
  }

  const country = await readPlayerCountry(
    repository,
    input.gameSessionId,
    input.playerId,
  );
  if (!country) {
    return buildResolution({
      configuredBaseAmount: input.configuredBaseAmount,
      baseCurrencyCode: input.attendanceConfig.currencyCode,
      currencyCode: input.attendanceConfig.currencyCode,
      currencyMode: "fixed_fallback",
      countryCode: null,
      incomeModifier,
      exchangeRateIndex: 1,
    });
  }

  const exchangeRateIndex = await readExchangeRateIndex(
    repository,
    input.gameSessionId,
    country.countryProfileId,
  );

  return buildResolution({
    configuredBaseAmount: input.configuredBaseAmount,
    baseCurrencyCode: input.attendanceConfig.currencyCode,
    currencyCode: country.currencyCode,
    currencyMode: "player_country",
    countryCode: country.countryCode,
    incomeModifier,
    exchangeRateIndex,
  });
}

export function calculateAttendanceRewardAmount(
  configuredBaseAmount: number,
  incomeModifier: number,
  exchangeRateIndex: number,
): number {
  return roundCurrency(
    nonNegative(configuredBaseAmount, 0) *
      boundedMultiplier(incomeModifier) *
      boundedMultiplier(exchangeRateIndex),
  );
}

export function selectAttendanceIncomeModifier(
  activePolicyValue: unknown,
  presetProfileValue: unknown,
): number {
  const active = optionalNumber(activePolicyValue);
  if (active !== null) return boundedMultiplier(active);
  const preset = optionalNumber(presetProfileValue);
  return boundedMultiplier(preset ?? 1);
}

function buildResolution(input: {
  readonly configuredBaseAmount: number;
  readonly baseCurrencyCode: string;
  readonly currencyCode: string;
  readonly currencyMode: AttendanceRewardPolicyResolution["currencyMode"];
  readonly countryCode: string | null;
  readonly incomeModifier: number;
  readonly exchangeRateIndex: number;
}): AttendanceRewardPolicyResolution {
  return {
    configuredBaseAmount: roundCurrency(
      nonNegative(input.configuredBaseAmount, 0),
    ),
    effectiveAmount: calculateAttendanceRewardAmount(
      input.configuredBaseAmount,
      input.incomeModifier,
      input.exchangeRateIndex,
    ),
    baseCurrencyCode: input.baseCurrencyCode,
    currencyCode: input.currencyCode,
    currencyMode: input.currencyMode,
    countryCode: input.countryCode,
    incomeModifier: boundedMultiplier(input.incomeModifier),
    exchangeRateIndex: boundedMultiplier(input.exchangeRateIndex),
  };
}

async function readIncomeModifier(
  repository: AttendanceRewardReadRepository,
  gameSessionId: string,
  difficultyPreset: string | null | undefined,
): Promise<number> {
  const response = await repository.readActiveDifficulty(gameSessionId);

  if (response.error) throw policyReadFailed();
  const row = response.data;
  const activeValue = optionalNumber(row?.income_modifier);
  if (activeValue !== null) {
    return selectAttendanceIncomeModifier(activeValue, null);
  }

  let presetKey = String(difficultyPreset ?? "").trim().toLowerCase();
  if (!presetKey) {
    const settingsResponse = await repository.readGameDifficulty(gameSessionId);
    if (settingsResponse.error) throw policyReadFailed();
    const settings = settingsResponse.data;
    presetKey = String(settings?.difficulty_preset ?? "").trim().toLowerCase();
  }

  if (!presetKey || presetKey === "custom") return 1;

  const profileResponse = await repository.readDifficultyProfile(presetKey);

  if (profileResponse.error) throw policyReadFailed();
  const profile = profileResponse.data;
  return selectAttendanceIncomeModifier(null, profile?.income_modifier);
}

async function readPlayerCountry(
  repository: AttendanceRewardReadRepository,
  gameSessionId: string,
  playerId: string,
): Promise<
  {
    readonly countryProfileId: string;
    readonly countryCode: string;
    readonly currencyCode: string;
  } | null
> {
  const assignmentResponse = await repository.readLatestAssignment(
    gameSessionId,
    playerId,
  );

  if (assignmentResponse.error) throw policyReadFailed();
  const assignment = assignmentResponse.data;
  if (!assignment?.country_profile_id) return null;

  const countryResponse = await repository.readActiveCountry(
    assignment.country_profile_id,
  );

  if (countryResponse.error) throw policyReadFailed();
  const country = countryResponse.data;
  if (!country?.country_code || !country.currency_code) return null;

  return {
    countryProfileId: assignment.country_profile_id,
    countryCode: country.country_code,
    currencyCode: country.currency_code,
  };
}

async function readExchangeRateIndex(
  repository: AttendanceRewardReadRepository,
  gameSessionId: string,
  countryProfileId: string,
): Promise<number> {
  const response = await repository.readLatestExchangeRate(
    gameSessionId,
    countryProfileId,
  );

  if (response.error) throw policyReadFailed();
  const row = response.data;
  return boundedMultiplier(number(row?.exchange_rate_index, 1));
}

function policyReadFailed(): EdgeActivationError {
  return new EdgeActivationError(
    "attendance_reward_policy_failed",
    "Attendance reward policy could not be resolved.",
    500,
  );
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedMultiplier(value: number): number {
  const normalized = Number.isFinite(value) ? value : 1;
  return Math.min(2, Math.max(0.5, normalized));
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
