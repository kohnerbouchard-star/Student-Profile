import type {
  StockMarketRunnerApplyResult,
  StockMarketRunnerLoadedState,
  StockMarketRunnerLoadInput,
  StockMarketRunnerPersistencePayload,
  StockMarketRunnerRepository,
} from "../contracts/stockMarketRunnerContracts.ts";
import { StockMarketRunnerError } from "../contracts/stockMarketRunnerContracts.ts";
import type {
  StockMarketNewsCreateResult,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
} from "../contracts/stockMarketNewsContracts.ts";
import { StockMarketNewsError } from "../contracts/stockMarketNewsContracts.ts";
import { SupabaseStockMarketRunnerRepository } from "./supabaseStockMarketRunnerRepository.ts";
import { SupabaseStockMarketNewsRepository } from "./supabaseStockMarketNewsRepository.ts";

interface RpcError {
  readonly message: string;
  readonly code?: string;
}

interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}

interface RuntimeCursorClient {
  rpc<T = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<RpcResponse<T>>;
}

export class RuntimeCursorStockMarketRunnerRepository
  implements StockMarketRunnerRepository {
  private readonly base: SupabaseStockMarketRunnerRepository;

  constructor(private readonly client: RuntimeCursorClient & any) {
    this.base = new SupabaseStockMarketRunnerRepository(client);
  }

  async load(input: StockMarketRunnerLoadInput): Promise<StockMarketRunnerLoadedState> {
    if (input.tickIndex !== undefined) {
      return this.base.load(input);
    }

    const response = await this.client.rpc<number>(
      "get_next_stock_market_tick_index",
      { p_game_session_id: input.gameSessionId },
    );
    if (response.error) {
      throw new StockMarketRunnerError(
        isSchemaMissing(response.error)
          ? "stock_market_schema_not_applied"
          : "stock_market_state_load_failed",
        "Authoritative stock runtime cursor could not be read.",
        500,
      );
    }

    const tickIndex = Number(response.data);
    if (!Number.isSafeInteger(tickIndex) || tickIndex < 1) {
      throw new StockMarketRunnerError(
        "stock_market_state_load_failed",
        "Authoritative stock runtime cursor returned an invalid next tick.",
        500,
      );
    }

    return this.base.load({ ...input, tickIndex });
  }

  apply(
    payload: StockMarketRunnerPersistencePayload,
  ): Promise<StockMarketRunnerApplyResult> {
    return this.base.apply(payload);
  }
}

export class RuntimeCursorStockMarketNewsRepository
  implements StockMarketNewsRepository {
  private readonly base: SupabaseStockMarketNewsRepository;

  constructor(private readonly client: RuntimeCursorClient & any) {
    this.base = new SupabaseStockMarketNewsRepository(client);
  }

  async readCurrentTick(gameSessionId: string): Promise<number> {
    const response = await this.client.rpc<number>(
      "get_current_stock_market_tick_index_v2",
      { p_game_session_id: gameSessionId },
    );
    if (response.error) {
      throw new StockMarketNewsError(
        isSchemaMissing(response.error)
          ? "market_news_schema_not_applied"
          : "market_news_create_failed",
        "Authoritative stock runtime cursor could not be read for market news.",
        500,
      );
    }

    const tickIndex = Number(response.data ?? 0);
    if (!Number.isSafeInteger(tickIndex) || tickIndex < 0) {
      throw new StockMarketNewsError(
        "market_news_create_failed",
        "Authoritative stock runtime cursor returned an invalid current tick.",
        500,
      );
    }
    return tickIndex;
  }

  create(input: StockMarketNewsInsertInput): Promise<StockMarketNewsCreateResult> {
    return this.base.create(input);
  }
}

function isSchemaMissing(error: RpcError): boolean {
  const message = error.message.toLowerCase();
  return error.code === "42P01" || error.code === "42883" ||
    message.includes("does not exist") || message.includes("schema cache");
}
