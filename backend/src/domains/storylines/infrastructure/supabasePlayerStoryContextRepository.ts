import type { JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  PlayerStoryContext,
  PlayerStoryRelationship,
  PlayerStoryRelationshipRole,
  PlayerStoryRelationshipStage,
} from "../contracts/playerStoryContext.ts";
import type {
  PlayerStoryContextRepository,
} from "../contracts/playerStoryContextRepositoryContracts.ts";
import {
  PlayerStoryContextRepositoryError,
} from "../contracts/playerStoryContextRepositoryContracts.ts";

type PlayerStoryContextTableName =
  | "players"
  | "player_country_assignments"
  | "country_profiles"
  | "account_balances"
  | "stock_holdings"
  | "game_session_stock_assets"
  | "game_session_contracts"
  | "player_contract_progress"
  | "player_story_relationships"
  | "game_session_story_flags";

interface SupabasePlayerStoryContextQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabasePlayerStoryContextQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabasePlayerStoryContextQueryError | null;
}

interface SupabasePlayerStoryContextClient {
  from(
    tableName: PlayerStoryContextTableName,
  ): SupabasePlayerStoryContextQueryBuilder;
}

interface SupabasePlayerStoryContextQueryBuilder {
  select(columns: string): SupabasePlayerStoryContextFilterBuilder;
}

interface SupabasePlayerStoryContextFilterBuilder
  extends PromiseLike<SupabasePlayerStoryContextQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabasePlayerStoryContextFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabasePlayerStoryContextFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabasePlayerStoryContextFilterBuilder;
}

interface PlayerRow {
  readonly id: string;
}

interface CountryAssignmentRow {
  readonly player_id: string;
  readonly country_profile_id: string;
  readonly assigned_at: string;
}

interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
  readonly currency_code?: string | null;
}

interface AccountBalanceRow {
  readonly player_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface StockHoldingRow {
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly quantity: number | string;
}

interface StockAssetRow {
  readonly id: string;
  readonly sector_key?: string | null;
  readonly country_code?: string | null;
  readonly current_price: number | string;
}

interface GameSessionContractRow {
  readonly id: string;
  readonly contract_key: string;
  readonly status: string;
  readonly visibility: string;
}

interface PlayerContractProgressRow {
  readonly player_id: string;
  readonly contract_id: string;
  readonly status: string;
}

interface StoryRelationshipRow {
  readonly player_id: string;
  readonly character_key: string;
  readonly character_name: string;
  readonly country_code: string | null;
  readonly relationship_role: string;
  readonly stage: string;
  readonly contact_count: number | string;
  readonly reply_count: number | string;
  readonly trust_score: number | string;
  readonly memory: Record<string, JsonValue>;
  readonly updated_at: string;
}

interface StoryFlagRow {
  readonly flag_key: string;
  readonly value: JsonValue;
  readonly created_at: string;
}

interface CountryInfo {
  readonly countryId: string | null;
  readonly countryCode: string | null;
  readonly currencyCode: string | null;
}

const PLAYER_SELECT = "id";
const COUNTRY_ASSIGNMENT_SELECT = "player_id,country_profile_id,assigned_at";
const COUNTRY_PROFILE_SELECT = "id,country_code,currency_code";
const CASH_SELECT = "player_id,account_type,balance,currency_code";
const HOLDING_SELECT = "player_id,stock_asset_id,quantity";
const STOCK_ASSET_SELECT = "id,sector_key,country_code,current_price";
const CONTRACT_SELECT = "id,contract_key,status,visibility";
const CONTRACT_PROGRESS_SELECT = "player_id,contract_id,status";
const STORY_RELATIONSHIP_SELECT =
  "player_id,character_key,character_name,country_code,relationship_role,stage,contact_count,reply_count,trust_score,memory,updated_at";
const STORY_FLAG_SELECT = "flag_key,value,created_at";

export class SupabasePlayerStoryContextRepository
  implements PlayerStoryContextRepository {
  constructor(private readonly client: SupabasePlayerStoryContextClient) {}

  async listPlayerStoryContexts(
    gameSessionId: string,
  ): Promise<readonly PlayerStoryContext[]> {
    const [
      players,
      countryByPlayerId,
      cashBalances,
      stockAssets,
      holdings,
      contracts,
      progressRows,
      relationshipRows,
      storyFlags,
    ] = await Promise.all([
      this.readActivePlayers(gameSessionId),
      this.readCountryAssignments(gameSessionId),
      this.readCashBalances(gameSessionId),
      this.readStockAssets(gameSessionId),
      this.readStockHoldings(gameSessionId),
      this.readGameSessionContracts(gameSessionId),
      this.readPlayerContractProgress(gameSessionId),
      this.readStoryRelationships(gameSessionId),
      this.readStoryFlags(gameSessionId),
    ]);

    const assetById = new Map(stockAssets.map((asset) => [asset.id, asset]));
    const holdingsByPlayerId = groupBy(
      holdings,
      (holding) => holding.player_id,
    );
    const cashByPlayerId = groupBy(
      cashBalances,
      (balance) => balance.player_id,
    );
    const progressByPlayerId = groupBy(
      progressRows,
      (progress) => progress.player_id,
    );
    const relationshipsByPlayerId = groupBy(
      relationshipRows,
      (relationship) => relationship.player_id,
    );
    const contractById = new Map(
      contracts.map((contract) => [contract.id, contract]),
    );
    const publicActiveContractKeys = contracts
      .filter((contract) =>
        contract.status === "active" && contract.visibility === "public"
      )
      .map((contract) => contract.contract_key)
      .sort();

    return players.map((player) => {
      const country = countryByPlayerId.get(player.id) ?? {
        countryId: null,
        countryCode: null,
        currencyCode: null,
      };
      const playerProgress = progressByPlayerId.get(player.id) ?? [];

      return {
        playerId: player.id,
        gameSessionId,
        homeCountryId: country.countryId,
        homeCountryCode: country.countryCode,
        currentCountryId: country.countryId,
        currentCountryCode: country.countryCode,
        cashBalance: balanceInValuationCurrency(
          cashByPlayerId.get(player.id) ?? [],
          country.currencyCode,
        ),
        resources: {},
        sectorExposurePct: calculateExposurePct(
          holdingsByPlayerId.get(player.id) ?? [],
          assetById,
          (asset) => normalizeKey(asset.sector_key),
        ),
        countryExposurePct: calculateExposurePct(
          holdingsByPlayerId.get(player.id) ?? [],
          assetById,
          (asset) => normalizeKey(asset.country_code),
        ),
        activeContractKeys: uniqueSorted([
          ...publicActiveContractKeys,
          ...playerProgress
            .filter((progress) => isActiveProgressStatus(progress.status))
            .map((progress) =>
              contractById.get(progress.contract_id)?.contract_key
            )
            .filter(isString),
        ]),
        completedContractKeys: uniqueSorted(
          playerProgress
            .filter((progress) => isCompletedProgressStatus(progress.status))
            .map((progress) =>
              contractById.get(progress.contract_id)?.contract_key
            )
            .filter(isString),
        ),
        storyFlags,
        relationships: buildRelationshipRecord(
          relationshipsByPlayerId.get(player.id) ?? [],
        ),
      };
    });
  }

  private async readActivePlayers(
    gameSessionId: string,
  ): Promise<readonly PlayerRow[]> {
    const response = await this.client
      .from("players")
      .select(PLAYER_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("id", { ascending: true });

    assertNoError(response, "players", "select");

    return (response.data ?? []) as PlayerRow[];
  }

  private async readCountryAssignments(
    gameSessionId: string,
  ): Promise<ReadonlyMap<string, CountryInfo>> {
    const response = await this.client
      .from("player_country_assignments")
      .select(COUNTRY_ASSIGNMENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("assigned_at", { ascending: false });

    assertNoError(response, "player_country_assignments", "select");

    const assignments = (response.data ?? []) as CountryAssignmentRow[];
    const countryIds = uniqueSorted(
      assignments.map((assignment) => assignment.country_profile_id),
    );

    if (countryIds.length === 0) {
      return new Map();
    }

    const countryResponse = await this.client
      .from("country_profiles")
      .select(COUNTRY_PROFILE_SELECT)
      .in("id", countryIds);

    assertNoError(countryResponse, "country_profiles", "select");

    const countryById = new Map(
      ((countryResponse.data ?? []) as CountryProfileRow[])
        .map((country) => [country.id, country]),
    );
    const countryByPlayerId = new Map<string, CountryInfo>();

    for (const assignment of assignments) {
      if (countryByPlayerId.has(assignment.player_id)) {
        continue;
      }

      const country = countryById.get(assignment.country_profile_id);
      countryByPlayerId.set(assignment.player_id, {
        countryId: assignment.country_profile_id,
        countryCode: country?.country_code ?? null,
        currencyCode: normalizeCurrencyCode(country?.currency_code),
      });
    }

    return countryByPlayerId;
  }

  private async readCashBalances(
    gameSessionId: string,
  ): Promise<readonly AccountBalanceRow[]> {
    const response = await this.client
      .from("account_balances")
      .select(CASH_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("account_type", "checking");

    assertNoError(response, "account_balances", "select");

    return (response.data ?? []) as AccountBalanceRow[];
  }

  private async readStockAssets(
    gameSessionId: string,
  ): Promise<readonly StockAssetRow[]> {
    const response = await this.client
      .from("game_session_stock_assets")
      .select(STOCK_ASSET_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true);

    assertNoError(response, "game_session_stock_assets", "select");

    return (response.data ?? []) as StockAssetRow[];
  }

  private async readStockHoldings(
    gameSessionId: string,
  ): Promise<readonly StockHoldingRow[]> {
    const response = await this.client
      .from("stock_holdings")
      .select(HOLDING_SELECT)
      .eq("game_session_id", gameSessionId);

    assertNoError(response, "stock_holdings", "select");

    return (response.data ?? []) as StockHoldingRow[];
  }

  private async readGameSessionContracts(
    gameSessionId: string,
  ): Promise<readonly GameSessionContractRow[]> {
    const response = await this.client
      .from("game_session_contracts")
      .select(CONTRACT_SELECT)
      .eq("game_session_id", gameSessionId);

    assertNoError(response, "game_session_contracts", "select");

    return (response.data ?? []) as GameSessionContractRow[];
  }

  private async readPlayerContractProgress(
    gameSessionId: string,
  ): Promise<readonly PlayerContractProgressRow[]> {
    const response = await this.client
      .from("player_contract_progress")
      .select(CONTRACT_PROGRESS_SELECT)
      .eq("game_session_id", gameSessionId);

    assertNoError(response, "player_contract_progress", "select");

    return (response.data ?? []) as PlayerContractProgressRow[];
  }

  private async readStoryRelationships(
    gameSessionId: string,
  ): Promise<readonly StoryRelationshipRow[]> {
    const response = await this.client
      .from("player_story_relationships")
      .select(STORY_RELATIONSHIP_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("updated_at", { ascending: true });

    assertNoError(response, "player_story_relationships", "select");

    return (response.data ?? []) as StoryRelationshipRow[];
  }

  private async readStoryFlags(
    gameSessionId: string,
  ): Promise<Record<string, JsonValue>> {
    const response = await this.client
      .from("game_session_story_flags")
      .select(STORY_FLAG_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("created_at", { ascending: true });

    assertNoError(response, "game_session_story_flags", "select");

    const flags: Record<string, JsonValue> = {};

    for (const row of (response.data ?? []) as StoryFlagRow[]) {
      flags[row.flag_key] = row.value;
    }

    return flags;
  }
}

function buildRelationshipRecord(
  rows: readonly StoryRelationshipRow[],
): Readonly<Record<string, PlayerStoryRelationship>> {
  const relationships: Record<string, PlayerStoryRelationship> = {};

  for (const row of rows) {
    const characterKey = normalizeKey(row.character_key);

    if (!characterKey) {
      continue;
    }

    relationships[characterKey] = {
      characterKey,
      characterName: normalizeKey(row.character_name) ?? characterKey,
      countryCode: normalizeKey(row.country_code),
      relationshipRole: normalizeRelationshipRole(row.relationship_role),
      stage: normalizeRelationshipStage(row.stage),
      contactCount: toNonNegativeInteger(row.contact_count),
      replyCount: toNonNegativeInteger(row.reply_count),
      trustScore: clampRelationshipTrust(row.trust_score),
      memory: isRecord(row.memory) ? row.memory : {},
    };
  }

  return relationships;
}

function balanceInValuationCurrency(
  rows: readonly AccountBalanceRow[],
  preferredCurrencyCode: string | null,
): number {
  const availableCurrencies = uniqueSorted(
    rows.map((row) => normalizeCurrencyCode(row.currency_code)).filter(isString),
  );
  const valuationCurrencyCode = normalizeCurrencyCode(preferredCurrencyCode) ??
    (availableCurrencies.length === 1 ? availableCurrencies[0] : null);

  if (!valuationCurrencyCode) {
    return 0;
  }

  return sum(
    rows.filter((row) =>
      normalizeCurrencyCode(row.currency_code) === valuationCurrencyCode
    ),
    (row) => toNumber(row.balance),
  );
}

function calculateExposurePct(
  holdings: readonly StockHoldingRow[],
  assetById: ReadonlyMap<string, StockAssetRow>,
  keyForAsset: (asset: StockAssetRow) => string | null,
): Readonly<Record<string, number>> {
  const valueByKey = new Map<string, number>();
  let totalValue = 0;

  for (const holding of holdings) {
    const asset = assetById.get(holding.stock_asset_id);

    if (!asset) {
      continue;
    }

    const key = keyForAsset(asset);
    const value = toNumber(holding.quantity) * toNumber(asset.current_price);

    if (!key || value <= 0) {
      continue;
    }

    totalValue += value;
    valueByKey.set(key, (valueByKey.get(key) ?? 0) + value);
  }

  if (totalValue <= 0) {
    return {};
  }

  const entries = [...valueByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, round((value / totalValue) * 100)] as const);

  return Object.fromEntries(entries);
}

function isActiveProgressStatus(status: string): boolean {
  return status === "in_progress" || status === "submitted";
}

function isCompletedProgressStatus(status: string): boolean {
  return status === "completed" || status === "approved";
}

function assertNoError(
  response: SupabasePlayerStoryContextQueryResponse,
  tableName: PlayerStoryContextTableName,
  operation: string,
): void {
  if (!response.error) {
    return;
  }

  throw new PlayerStoryContextRepositoryError(
    `player_story_context_${tableName}_${operation}_failed`,
    response.error.message,
    tableName,
    operation,
  );
}

function groupBy<T>(
  rows: readonly T[],
  keyForRow: (row: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : null;
}

function normalizeKey(value: string | null | undefined): string | null {
  const key = value?.trim();

  return key ? key : null;
}

function normalizeRelationshipRole(value: string): PlayerStoryRelationshipRole {
  if (
    value === "sponsor" ||
    value === "local_friend" ||
    value === "rival_peer" ||
    value === "gatekeeper" ||
    value === "former_home"
  ) {
    return value;
  }

  return "other";
}

function normalizeRelationshipStage(value: string): PlayerStoryRelationshipStage {
  if (
    value === "contacted" ||
    value === "engaged" ||
    value === "trusted" ||
    value === "strained" ||
    value === "broken"
  ) {
    return value;
  }

  return "contacted";
}

function toNonNegativeInteger(value: number | string): number {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function clampRelationshipTrust(value: number | string): number {
  return Math.max(-100, Math.min(100, Math.trunc(toNumber(value))));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sum<T>(rows: readonly T[], valueForRow: (row: T) => number): number {
  return round(rows.reduce((total, row) => total + valueForRow(row), 0));
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
