import type { ApplyStockMarketRunnerTickRpcRow } from "../../../supabase/tableTypes.ts";
import type {
  StockMarketCountryInput,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketSectorInput,
  StockMarketShockInput,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  type StockMarketRunnerApplyResult,
  StockMarketRunnerError,
  type StockMarketRunnerLoadedState,
  type StockMarketRunnerLoadInput,
  type StockMarketRunnerPersistencePayload,
  type StockMarketRunnerRepository,
} from "../contracts/stockMarketRunnerContracts.ts";

import {
  COUNTRY_SNAPSHOT_SELECT,
  type CountryEconomicSnapshotRow,
  type CountryProfileRow,
  type GameSessionRow,
  type GameSessionStockAssetRow,
  STOCK_ASSET_SELECT,
  STOCK_EVENT_SELECT,
  STOCK_REGIME_SELECT,
  type StockMarketEventRow,
  type StockMarketRegimeRow,
  type StockPriceTickIndexRow,
} from "./stockMarketRunnerRows.ts";
import {
  isTickInWindow,
  normalizeKey,
  readLatestCountrySnapshots,
  toNumber,
  toStockMarketAssetInput,
  toStockMarketCountryInput,
  toStockMarketMacroInput,
  toStockMarketRegimeInput,
  toStockMarketShockInput,
} from "./stockMarketRunnerRowMapping.ts";

// Preserve the existing adapter API while giving pure translation a single owner.
export {
  readLatestCountrySnapshots,
  toStockMarketAssetInput,
  toStockMarketCountryInput,
  toStockMarketMacroInput,
} from "./stockMarketRunnerRowMapping.ts";

interface SupabaseRunnerQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseRunnerQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseRunnerQueryError | null;
  readonly count?: number | null;
  readonly status?: number;
  readonly statusText?: string;
}

type RunnerTableName =
  | "game_sessions"
  | "game_session_stock_assets"
  | "stock_price_ticks"
  | "stock_market_events"
  | "stock_market_regimes"
  | "country_profiles"
  | "country_economic_snapshots";

interface SupabaseStockMarketRunnerClient {
  from(tableName: RunnerTableName): SupabaseStockMarketRunnerQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseRunnerQueryResponse<Data>>;
}

interface SupabaseStockMarketRunnerQueryBuilder {
  select(columns: string): SupabaseStockMarketRunnerFilterBuilder;
}

interface SupabaseStockMarketRunnerFilterBuilder
  extends PromiseLike<SupabaseRunnerQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseStockMarketRunnerFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseStockMarketRunnerFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseStockMarketRunnerFilterBuilder;
  limit(count: number): SupabaseStockMarketRunnerFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseRunnerQueryResponse<unknown>>;
}

export class SupabaseStockMarketRunnerRepository
  implements StockMarketRunnerRepository {
  constructor(private readonly client: SupabaseStockMarketRunnerClient) {}

  async load(
    input: StockMarketRunnerLoadInput,
  ): Promise<StockMarketRunnerLoadedState> {
    await this.assertGameSessionExists(input.gameSessionId);
    const consumed = await this.client.rpc(
      "consume_business_market_events_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_limit: 1000,
      },
    );
    if (consumed.error) {
      throw mapPersistenceError(
        consumed.error,
        "stock_market_state_load_failed",
      );
    }

    const tickIndex = input.tickIndex ??
      await this.readNextTickIndex(input.gameSessionId);

    await this.assertTickDoesNotExist(input.gameSessionId, tickIndex);

    const assetRows = await this.readActiveAssets(input.gameSessionId);

    if (assetRows.length === 0) {
      throw new StockMarketRunnerError(
        "no_active_stock_assets",
        "No active stock assets exist for this game session.",
        409,
      );
    }

    const assets = assetRows.map(toStockMarketAssetInput);
    const countryInputs = await this.readCountryInputs(
      input.gameSessionId,
      assets.map((asset) => asset.countryCode),
    );

    return {
      gameSessionId: input.gameSessionId,
      tickIndex,
      assets,
      macro: countryInputs.macro,
      countries: countryInputs.countries,
      sectors: [],
      shocks: await this.readActiveShocks(input.gameSessionId, tickIndex),
      regime: await this.readActiveRegime(input.gameSessionId, tickIndex),
    };
  }

  async apply(
    payload: StockMarketRunnerPersistencePayload,
  ): Promise<StockMarketRunnerApplyResult> {
    const response = await this.client.rpc<
      readonly ApplyStockMarketRunnerTickRpcRow[]
    >("apply_stock_market_runner_tick", {
      p_game_session_id: payload.gameSessionId,
      p_tick_index: payload.tickIndex,
      p_asset_updates: payload.assetUpdates,
      p_tick_rows: payload.tickRows,
    });

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_tick_apply_failed",
      );
    }

    const row = response.data?.[0];

    if (!row) {
      throw new StockMarketRunnerError(
        "stock_market_tick_apply_failed",
        "Stock market tick persistence returned no result.",
        500,
      );
    }

    return {
      assetsUpdated: Number(row.assets_updated),
      ticksInserted: Number(row.ticks_inserted),
    };
  }

  private async assertGameSessionExists(gameSessionId: string): Promise<void> {
    const response = await this.client
      .from("game_sessions")
      .select("id")
      .eq("id", gameSessionId)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    const row = response.data as GameSessionRow | null;

    if (!row?.id) {
      throw new StockMarketRunnerError(
        "game_session_not_found",
        "Game session could not be found.",
        404,
      );
    }
  }

  private async readNextTickIndex(gameSessionId: string): Promise<number> {
    const response = await this.client
      .from("stock_price_ticks")
      .select("tick_index")
      .eq("game_session_id", gameSessionId)
      .order("tick_index", { ascending: false })
      .limit(1);

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    const rows = (response.data ?? []) as StockPriceTickIndexRow[];
    const latestTickIndex = rows.length > 0 ? toNumber(rows[0].tick_index) : 0;

    return Math.max(0, Math.trunc(latestTickIndex)) + 1;
  }

  private async assertTickDoesNotExist(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<void> {
    const response = await this.client
      .from("stock_price_ticks")
      .select("tick_index")
      .eq("game_session_id", gameSessionId)
      .eq("tick_index", tickIndex)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    if (response.data) {
      throw new StockMarketRunnerError(
        "stock_tick_already_exists",
        "A stock price tick already exists for this game session and tick index.",
        409,
      );
    }
  }

  private async readActiveAssets(
    gameSessionId: string,
  ): Promise<readonly GameSessionStockAssetRow[]> {
    const response = await this.client
      .from("game_session_stock_assets")
      .select(STOCK_ASSET_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("ticker", { ascending: true });

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    return (response.data ?? []) as GameSessionStockAssetRow[];
  }

  private async readActiveShocks(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<readonly StockMarketShockInput[]> {
    const response = await this.client
      .from("stock_market_events")
      .select(STOCK_EVENT_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("created_tick", { ascending: true });

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    return ((response.data ?? []) as StockMarketEventRow[])
      .filter((row) =>
        isTickInWindow(row.created_tick, row.expires_tick, tickIndex)
      )
      .map(toStockMarketShockInput);
  }

  private async readActiveRegime(
    gameSessionId: string,
    tickIndex: number,
  ): Promise<StockMarketRegimeInput | undefined> {
    const response = await this.client
      .from("stock_market_regimes")
      .select(STOCK_REGIME_SELECT)
      .eq("game_session_id", gameSessionId)
      .eq("is_active", true)
      .order("starts_tick", { ascending: false });

    if (response.error) {
      throw mapPersistenceError(
        response.error,
        "stock_market_state_load_failed",
      );
    }

    const row = ((response.data ?? []) as StockMarketRegimeRow[])
      .filter((candidate) =>
        isTickInWindow(candidate.starts_tick, candidate.ends_tick, tickIndex)
      )
      .sort((left, right) =>
        toNumber(right.starts_tick) - toNumber(left.starts_tick)
      )[0];

    return row ? toStockMarketRegimeInput(row) : undefined;
  }

  private async readCountryInputs(
    gameSessionId: string,
    countryCodes: readonly string[],
  ): Promise<{
    readonly macro: StockMarketMacroInput;
    readonly countries: readonly StockMarketCountryInput[];
    readonly sectors: readonly StockMarketSectorInput[];
  }> {
    const representedCountryCodes = [...new Set(countryCodes.map(normalizeKey))]
      .filter(Boolean);

    if (representedCountryCodes.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    const profileResponse = await this.client
      .from("country_profiles")
      .select("id,country_code")
      .in("country_code", representedCountryCodes)
      .eq("status", "active");

    if (profileResponse.error) {
      throw mapPersistenceError(
        profileResponse.error,
        "stock_market_state_load_failed",
      );
    }

    const profiles = (profileResponse.data ?? []) as CountryProfileRow[];

    if (profiles.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    const profileById = new Map(
      profiles.map((
        profile,
      ) => [profile.id, normalizeKey(profile.country_code)]),
    );
    const snapshotResponse = await this.client
      .from("country_economic_snapshots")
      .select(COUNTRY_SNAPSHOT_SELECT)
      .eq("game_session_id", gameSessionId)
      .in("country_profile_id", profiles.map((profile) => profile.id))
      .order("snapshot_sequence", { ascending: false })
      .order("effective_at", { ascending: false });

    if (snapshotResponse.error) {
      throw mapPersistenceError(
        snapshotResponse.error,
        "stock_market_state_load_failed",
      );
    }

    const latestSnapshots = readLatestCountrySnapshots(
      (snapshotResponse.data ?? []) as CountryEconomicSnapshotRow[],
      profileById,
    );

    if (latestSnapshots.length === 0) {
      return {
        macro: { gameSessionId },
        countries: [],
        sectors: [],
      };
    }

    return {
      macro: toStockMarketMacroInput(gameSessionId, latestSnapshots),
      countries: latestSnapshots.map(({ snapshot, countryCode }) =>
        toStockMarketCountryInput(snapshot, countryCode)
      ),
      sectors: [],
    };
  }
}

function mapPersistenceError(
  error: SupabaseRunnerQueryError,
  defaultCode:
    | "stock_market_state_load_failed"
    | "stock_market_tick_apply_failed",
): StockMarketRunnerError {
  const normalizedMessage = error.message.toUpperCase();

  if (isSchemaNotAppliedError(error)) {
    return new StockMarketRunnerError(
      "stock_market_schema_not_applied",
      "Stock market runner schema is not applied.",
      500,
    );
  }

  if (normalizedMessage.includes("STOCK_TICK_ALREADY_EXISTS")) {
    return new StockMarketRunnerError(
      "stock_tick_already_exists",
      "A stock price tick already exists for this game session and tick index.",
      409,
    );
  }

  return new StockMarketRunnerError(
    defaultCode,
    defaultCode === "stock_market_tick_apply_failed"
      ? "Stock market tick could not be persisted."
      : "Stock market state could not be loaded.",
    500,
  );
}

function isSchemaNotAppliedError(error: SupabaseRunnerQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
