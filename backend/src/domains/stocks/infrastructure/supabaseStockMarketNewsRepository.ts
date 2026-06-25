import type {
  JsonObject,
} from "../../../supabase/tableTypes.ts";
import {
  buildStockMarketNewsInsertRow,
  type StockMarketNewsCreateResult,
  type StockMarketNewsDto,
  StockMarketNewsError,
  type StockMarketNewsInsertInput,
  type StockMarketNewsRepository,
} from "../contracts/stockMarketNewsContracts.ts";

interface SupabaseMarketNewsQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseMarketNewsQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseMarketNewsQueryError | null;
}

type MarketNewsTableName =
  | "game_sessions"
  | "stock_price_ticks"
  | "stock_market_events";

interface SupabaseMarketNewsClient {
  from(tableName: MarketNewsTableName): SupabaseMarketNewsQueryBuilder;
}

interface SupabaseMarketNewsQueryBuilder {
  select(columns: string): SupabaseMarketNewsFilterBuilder;
  insert(row: unknown): SupabaseMarketNewsInsertBuilder;
}

interface SupabaseMarketNewsFilterBuilder
  extends PromiseLike<SupabaseMarketNewsQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseMarketNewsFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabaseMarketNewsFilterBuilder;
  limit(count: number): SupabaseMarketNewsFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseMarketNewsQueryResponse<unknown>>;
}

interface SupabaseMarketNewsInsertBuilder {
  select(columns: string): {
    maybeSingle(): PromiseLike<SupabaseMarketNewsQueryResponse<unknown>>;
  };
}

interface GameSessionRow {
  readonly id: string;
}

interface LatestTickRow {
  readonly tick_index: number | string;
}

interface StockMarketEventInsertedRow {
  readonly id: string;
  readonly shock_id: string;
  readonly category?: string | null;
  readonly sentiment?: string | null;
  readonly source?: string | null;
  readonly scope: string;
  readonly target_key?: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
  readonly created_at: string;
}

const GAME_SESSION_SELECT = "id";
const LATEST_TICK_SELECT = "tick_index";
const INSERTED_NEWS_SELECT = [
  "id",
  "shock_id",
  "category",
  "sentiment",
  "source",
  "scope",
  "target_key",
  "headline",
  "explanation",
  "created_tick",
  "expires_tick",
  "created_at",
].join(",");

export class SupabaseStockMarketNewsRepository
  implements StockMarketNewsRepository {
  constructor(private readonly client: SupabaseMarketNewsClient) {}

  async readCurrentTick(gameSessionId: string): Promise<number> {
    await this.assertGameSessionExists(gameSessionId);

    const response = await this.client
      .from("stock_price_ticks")
      .select(LATEST_TICK_SELECT)
      .eq("game_session_id", gameSessionId)
      .order("tick_index", { ascending: false })
      .limit(1);

    if (response.error) {
      throw mapMarketNewsPersistenceError(
        response.error,
        "market_news_create_failed",
      );
    }

    const rows = (response.data ?? []) as LatestTickRow[];
    const latestTick = rows[0]?.tick_index;

    if (latestTick === undefined || latestTick === null) {
      return 0;
    }

    return Math.trunc(toNumber(latestTick));
  }

  async create(
    input: StockMarketNewsInsertInput,
  ): Promise<StockMarketNewsCreateResult> {
    await this.assertGameSessionExists(input.gameSessionId);

    const row = buildStockMarketNewsInsertRow(input);
    const response = await this.client
      .from("stock_market_events")
      .insert(row)
      .select(INSERTED_NEWS_SELECT)
      .maybeSingle();

    if (response.error) {
      throw mapMarketNewsPersistenceError(
        response.error,
        "market_news_create_failed",
      );
    }

    if (!response.data) {
      throw new StockMarketNewsError(
        "market_news_create_failed",
        "Market news could not be created.",
        500,
      );
    }

    return {
      news: toStockMarketNewsDto(response.data as StockMarketEventInsertedRow),
    };
  }

  private async assertGameSessionExists(gameSessionId: string): Promise<void> {
    const response = await this.client
      .from("game_sessions")
      .select(GAME_SESSION_SELECT)
      .eq("id", gameSessionId)
      .maybeSingle();

    if (response.error) {
      throw mapMarketNewsPersistenceError(
        response.error,
        "market_news_game_session_not_found",
      );
    }

    if (!(response.data as GameSessionRow | null)?.id) {
      throw new StockMarketNewsError(
        "market_news_game_session_not_found",
        "Game session was not found.",
        404,
      );
    }
  }
}

function toStockMarketNewsDto(row: StockMarketEventInsertedRow): StockMarketNewsDto {
  return {
    id: row.id,
    shockId: row.shock_id,
    category: row.category ?? "sector",
    sentiment: row.sentiment ?? "neutral",
    source: row.source ?? "runner",
    scope: row.scope,
    targetKey: row.target_key ?? null,
    headline: row.headline,
    explanation: row.explanation,
    createdTick: Math.trunc(toNumber(row.created_tick)),
    expiresTick: row.expires_tick === null || row.expires_tick === undefined
      ? null
      : Math.trunc(toNumber(row.expires_tick)),
    createdAt: row.created_at,
  };
}

function mapMarketNewsPersistenceError(
  error: SupabaseMarketNewsQueryError,
  fallbackCode: StockMarketNewsError["code"],
): StockMarketNewsError {
  if (error.code === "42P01" || error.code === "42703") {
    return new StockMarketNewsError(
      "market_news_schema_not_applied",
      "Market news schema is not applied.",
      500,
    );
  }

  if (error.code === "23503") {
    return new StockMarketNewsError(
      "market_news_game_session_not_found",
      "Game session was not found.",
      404,
    );
  }

  return new StockMarketNewsError(
    fallbackCode,
    error.message || "Market news persistence failed.",
    fallbackCode === "market_news_game_session_not_found" ? 404 : 500,
  );
}

function toNumber(value: number | string): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
}

export function toMarketNewsRealtimePayload(
  news: StockMarketNewsDto,
): JsonObject {
  return {
    id: news.id,
    headline: news.headline,
    explanation: news.explanation,
    category: news.category,
    sentiment: news.sentiment,
    source: news.source,
    scope: news.scope,
    targetKey: news.targetKey,
    createdTick: news.createdTick,
    expiresTick: news.expiresTick,
    createdAt: news.createdAt,
  };
}
