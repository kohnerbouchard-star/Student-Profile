import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  ListPlayerAvailableContractsInput,
} from "../contracts/contractRepositoryContracts.ts";

export interface PlayerContractAvailabilityInput
  extends ListPlayerAvailableContractsInput {
  readonly nowIso: string;
}

export async function listPlayerContractsAvailableNow(
  repository: ContractRepository,
  input: PlayerContractAvailabilityInput,
): Promise<readonly GameSessionContractRecord[]> {
  const activeInput: ListPlayerAvailableContractsInput = {
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    ...(input.countryCode ? { countryCode: input.countryCode } : {}),
    ...(input.rosterLabel ? { rosterLabel: input.rosterLabel } : {}),
  };
  const [activeContracts, scheduledContracts] = await Promise.all([
    repository.listPlayerAvailableContracts(activeInput),
    repository.listGameSessionContracts({
      gameSessionId: input.gameSessionId,
      statuses: ["scheduled"],
    }),
  ]);
  const contracts = new Map<string, GameSessionContractRecord>();

  for (const contract of [...activeContracts, ...scheduledContracts]) {
    if (!isContractAvailableNow(contract, input)) continue;
    contracts.set(contract.id, contract);
  }

  return [...contracts.values()].sort((left, right) => {
    const leftTime = Date.parse(left.publishedAt ?? left.createdAt);
    const rightTime = Date.parse(right.publishedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

export function isContractAvailableNow(
  contract: GameSessionContractRecord,
  input: PlayerContractAvailabilityInput,
): boolean {
  if (contract.gameSessionId !== input.gameSessionId) return false;
  if (!isLifecycleAvailable(contract, input.nowIso)) return false;
  if (contract.visibility === "public") return true;
  if (contract.visibility !== "targeted") return false;

  const targeting = contract.targetingPayload;
  if (stringArrayIncludes(targeting.playerIds, input.playerId)) return true;
  if (
    input.countryCode &&
    stringArrayIncludes(targeting.countryCodes, input.countryCode)
  ) {
    return true;
  }
  return Boolean(
    input.rosterLabel &&
      stringArrayIncludes(targeting.rosterLabels, input.rosterLabel),
  );
}

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

function isLifecycleAvailable(
  contract: GameSessionContractRecord,
  nowIso: string,
): boolean {
  if (contract.status !== "active" && contract.status !== "scheduled") {
    return false;
  }

  const nowMs = Date.parse(nowIso);
  const publishedAtMs = contract.publishedAt === null
    ? NaN
    : Date.parse(contract.publishedAt);
  const expiresAtMs = contract.expiresAt === null
    ? null
    : Date.parse(contract.expiresAt);

  return !Number.isNaN(nowMs) &&
    !Number.isNaN(publishedAtMs) &&
    publishedAtMs <= nowMs &&
    (expiresAtMs === null ||
      (!Number.isNaN(expiresAtMs) && expiresAtMs > nowMs));
}

function stringArrayIncludes(value: unknown, expected: string): boolean {
  const normalizedExpected = expected.trim().toUpperCase();
  return Array.isArray(value) && value.some((item) =>
    typeof item === "string" &&
    item.trim().toUpperCase() === normalizedExpected
  );
}
