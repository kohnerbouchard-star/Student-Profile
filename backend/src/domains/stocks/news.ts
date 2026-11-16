/**
 * Stocks-owned news boundary for cross-domain producers.
 * Keep this entrypoint independent of the broad Stocks index and persistence.
 * Parsing, defaults and errors remain owned by the canonical news contract.
 */
export {
  parseStockMarketNewsCreateRequest,
  STOCK_MARKET_NEWS_CATEGORIES,
  STOCK_MARKET_NEWS_IMPACT_STRENGTHS,
  STOCK_MARKET_NEWS_SCOPES,
  STOCK_MARKET_NEWS_SENTIMENTS,
  STOCK_MARKET_NEWS_SOURCES,
} from "./contracts/stockMarketNewsContracts.ts";
export type {
  StockMarketNewsCategory,
  StockMarketNewsCreateResult,
  StockMarketNewsImpactStrength,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
  StockMarketNewsScope,
  StockMarketNewsSentiment,
  StockMarketNewsSource,
} from "./contracts/stockMarketNewsContracts.ts";
