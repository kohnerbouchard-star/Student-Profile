import {
  type CreateStockBuyQuoteRpcArgs,
  type SettleStockBuyQuoteRpcArgs,
  type SettleStockSellRpcArgs,
  type StockMarketBuyQuoteDto,
  type StockMarketBuyQuoteInput,
  type StockMarketBuySettlementDto,
  type StockMarketBuySettlementInput,
  type StockMarketSellSettlementDto,
  type StockMarketSellSettlementInput,
  type StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";
import { mapStockTradingRpcError } from "./stockMarketTradingErrorMapper.ts";
import {
  type SupabaseStockMarketTradingClient,
  unwrapStockTradingRpcJson,
} from "./stockMarketTradingRpc.ts";
import {
  parseStockBuyQuote,
  parseStockBuySettlement,
  parseStockSellSettlement,
} from "./stockMarketTradingResponse.ts";

export class SupabaseStockMarketTradingRepository
  implements StockMarketTradingRepository {
  constructor(private readonly client: SupabaseStockMarketTradingClient) {}

  async createBuyQuote(
    input: StockMarketBuyQuoteInput,
  ): Promise<StockMarketBuyQuoteDto> {
    const args: CreateStockBuyQuoteRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_ticker: input.ticker,
      p_quantity: input.quantity,
      p_expected_price: input.expectedPrice,
      p_expected_tick_index: input.expectedTickIndex,
      p_allocations: input.allocations.map((allocation) => ({
        sourceAccountKey: allocation.sourceAccountKey,
        targetAmount: allocation.targetAmount,
      })),
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("create_stock_buy_quote_v1", args);
    if (response.error) throw mapStockTradingRpcError(response.error, "buy_quote");
    return parseStockBuyQuote(unwrapStockTradingRpcJson(response.data));
  }

  async settleBuyQuote(
    input: StockMarketBuySettlementInput,
  ): Promise<StockMarketBuySettlementDto> {
    const args: SettleStockBuyQuoteRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_quote_key: input.quoteKey,
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("settle_stock_buy_quote_v1", args);
    if (response.error) {
      throw mapStockTradingRpcError(response.error, "buy_settlement");
    }
    return parseStockBuySettlement(unwrapStockTradingRpcJson(response.data));
  }

  async settleSell(
    input: StockMarketSellSettlementInput,
  ): Promise<StockMarketSellSettlementDto> {
    const args: SettleStockSellRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_ticker: input.ticker,
      p_quantity: input.quantity,
      p_expected_price: input.expectedPrice,
      p_expected_tick_index: input.expectedTickIndex,
      p_destination_account_key: input.destinationAccountKey,
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("settle_stock_sell_v1", args);
    if (response.error) {
      throw mapStockTradingRpcError(response.error, "sell_settlement");
    }
    return parseStockSellSettlement(unwrapStockTradingRpcJson(response.data));
  }
}
