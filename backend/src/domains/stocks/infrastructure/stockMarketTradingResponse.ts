import {
  type StockMarketBuyQuoteDto,
  type StockMarketBuySettlementDto,
  type StockMarketSellSettlementDto,
} from "../contracts/stockMarketTradingContracts.ts";
import {
  BANK_ACCOUNT_KEY,
  BANK_TRANSACTION_KEY,
  CURRENCY_CODE,
  STOCK_BUY_QUOTE_KEY,
  STOCK_TICKER,
  stockBoolean,
  stockFiniteNumber,
  stockIsoTimestamp,
  stockNonNegativeInteger,
  stockPublicEvidence,
  stockPublicKey,
  stockPublicRecord,
} from "./stockMarketPublicEvidence.ts";

export function parseStockBuyQuote(value: unknown): StockMarketBuyQuoteDto {
  const row = stockPublicRecord(value);
  return Object.freeze({
    quoteKey: stockPublicKey(row.quote_key, STOCK_BUY_QUOTE_KEY),
    ticker: stockPublicKey(row.ticker, STOCK_TICKER),
    listingCurrencyCode: stockPublicKey(row.listing_currency_code, CURRENCY_CODE),
    quantity: stockFiniteNumber(row.quantity, Number.MIN_VALUE),
    quotedPrice: stockFiniteNumber(row.quoted_price, Number.MIN_VALUE),
    priceTickIndex: stockNonNegativeInteger(row.price_tick_index),
    grossValue: stockFiniteNumber(row.gross_value, Number.MIN_VALUE),
    expiresAt: stockIsoTimestamp(row.expires_at),
    funding: stockPublicEvidence(row.funding),
  });
}

export function parseStockBuySettlement(
  value: unknown,
): StockMarketBuySettlementDto {
  const row = stockPublicRecord(value);
  return Object.freeze({
    quoteKey: stockPublicKey(row.quote_key, STOCK_BUY_QUOTE_KEY),
    ticker: stockPublicKey(row.ticker, STOCK_TICKER),
    listingCurrencyCode: stockPublicKey(row.listing_currency_code, CURRENCY_CODE),
    quantity: stockFiniteNumber(row.quantity, Number.MIN_VALUE),
    executionPrice: stockFiniteNumber(row.execution_price, Number.MIN_VALUE),
    priceTickIndex: stockNonNegativeInteger(row.price_tick_index),
    grossValue: stockFiniteNumber(row.gross_value, Number.MIN_VALUE),
    holdingQuantityAfter: stockFiniteNumber(row.holding_quantity_after, 0),
    averageCostAfter: stockFiniteNumber(row.average_cost_after, 0),
    filledAt: stockIsoTimestamp(row.filled_at),
    alreadyCompleted: stockBoolean(row.already_completed),
    funding: stockPublicEvidence(row.funding),
  });
}

export function parseStockSellSettlement(
  value: unknown,
): StockMarketSellSettlementDto {
  const row = stockPublicRecord(value);
  return Object.freeze({
    ticker: stockPublicKey(row.ticker, STOCK_TICKER),
    listingCurrencyCode: stockPublicKey(row.listing_currency_code, CURRENCY_CODE),
    quantity: stockFiniteNumber(row.quantity, Number.MIN_VALUE),
    executionPrice: stockFiniteNumber(row.execution_price, Number.MIN_VALUE),
    priceTickIndex: stockNonNegativeInteger(row.price_tick_index),
    grossValue: stockFiniteNumber(row.gross_value, Number.MIN_VALUE),
    holdingQuantityAfter: stockFiniteNumber(row.holding_quantity_after, 0),
    averageCostAfter: stockFiniteNumber(row.average_cost_after, 0),
    filledAt: stockIsoTimestamp(row.filled_at),
    destinationAccountKey: stockPublicKey(row.destination_account_key, BANK_ACCOUNT_KEY),
    settlementTransactionKey: stockPublicKey(
      row.settlement_transaction_key,
      BANK_TRANSACTION_KEY,
    ),
    alreadyCompleted: stockBoolean(row.already_completed),
  });
}
