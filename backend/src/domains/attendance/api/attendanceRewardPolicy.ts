import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { PlayerAttendanceWindowConfig } from "./attendanceHttpHelpers.ts";

interface PlayerCountryAssignmentRow {
  readonly country_profile_id: string;
  readonly assigned_at: string;
}

interface CountryProfileRow {
  readonly country_code: string;
  readonly currency_code: string;
}

interface DifficultyPolicyRow {
  readonly income_modifier: number | string;
}

interface CountryEconomicSnapshotRow {
  readonly exchange_rate_index: number | string;
  readonly snapshot_sequence: number | string;
}

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

export async function resolveAttendanceRewardPolicy(
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly configuredBaseAmount: number;
    readonly attendanceConfig: PlayerAttendanceWindowConfig;
  },
): Promise<AttendanceRewardPolicyResolution> {
  const incomeModifier = input.attendanceConfig.applyDifficultyIncomeModifier
    ? await readIncomeModifier(serviceClient, input.gameSessionId)
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

  const country = await readPlayerCountry(serviceClient, input.gameSessionId, input.playerId);
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
    serviceClient,
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
    configuredBaseAmount: roundCurrency(nonNegative(input.configuredBaseAmount, 0)),
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
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
): Promise<number> {
  const response = await serviceClient
    .from("game_difficulty_policy_settings")
    .select("income_modifier")
    .eq("game_session_id", gameSessionId)
    .eq("status", "active")
    .maybeSingle();

  if (response.error) throw policyReadFailed();
  const row = response.data as DifficultyPolicyRow | null;
  return boundedMultiplier(number(row?.income_modifier, 1));
}

async function readPlayerCountry(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<{
  readonly countryProfileId: string;
  readonly countryCode: string;
  readonly currencyCode: string;
} | null> {
  const assignmentResponse = await serviceClient
    .from("player_country_assignments")
    .select("country_profile_id,assigned_at")
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentResponse.error) throw policyReadFailed();
  const assignment = assignmentResponse.data as PlayerCountryAssignmentRow | null;
  if (!assignment?.country_profile_id) return null;

  const countryResponse = await serviceClient
    .from("country_profiles")
    .select("country_code,currency_code")
    .eq("id", assignment.country_profile_id)
    .eq("status", "active")
    .maybeSingle();

  if (countryResponse.error) throw policyReadFailed();
  const country = countryResponse.data as CountryProfileRow | null;
  if (!country?.country_code || !country.currency_code) return null;

  return {
    countryProfileId: assignment.country_profile_id,
    countryCode: country.country_code,
    currencyCode: country.currency_code,
  };
}

async function readExchangeRateIndex(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  countryProfileId: string,
): Promise<number> {
  const response = await serviceClient
    .from("country_economic_snapshots")
    .select("exchange_rate_index,snapshot_sequence")
    .eq("game_session_id", gameSessionId)
    .eq("country_profile_id", countryProfileId)
    .order("snapshot_sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) throw policyReadFailed();
  const row = response.data as CountryEconomicSnapshotRow | null;
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
