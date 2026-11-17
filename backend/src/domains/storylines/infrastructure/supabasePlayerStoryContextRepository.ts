import type { JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  PlayerStoryContextRepository,
} from "../contracts/playerStoryContextRepositoryContracts.ts";
import {
  PlayerStoryContextRepositoryError,
} from "../contracts/playerStoryContextRepositoryContracts.ts";
import {
  type AccountBalanceRow,
  CASH_SELECT,
  CONTRACT_PROGRESS_SELECT,
  CONTRACT_SELECT,
  COUNTRY_ASSIGNMENT_SELECT,
  COUNTRY_PROFILE_SELECT,
  type CountryAssignmentRow,
  type CountryInfo,
  type CountryProfileRow,
  type GameSessionContractRow,
  HOLDING_SELECT,
  PLAYER_SELECT,
  type PlayerContractProgressRow,
  type PlayerRow,
  type PlayerStoryContextTableName,
  STOCK_ASSET_SELECT,
  type StockAssetRow,
  type StockHoldingRow,
  STORY_FLAG_SELECT,
  STORY_RELATIONSHIP_SELECT,
  type StoryFlagRow,
  type StoryRelationshipRow,
  type SupabasePlayerStoryContextClient,
  type SupabasePlayerStoryContextQueryResponse,
} from "./playerStoryContextRows.ts";
import {
  balanceInValuationCurrency,
  buildRelationshipRecord,
  calculateExposurePct,
  groupBy,
  isActiveProgressStatus,
  isCompletedProgressStatus,
  isString,
  normalizeCurrencyCode,
  normalizeKey,
  uniqueSorted,
} from "./playerStoryContextProjection.ts";

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
