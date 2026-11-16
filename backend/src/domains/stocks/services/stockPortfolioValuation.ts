import type {
  StockMarketCurrencyValue,
  StockMarketPlayerCashDto,
  StockMarketPlayerHoldingDto,
} from "../contracts/stockMarketPlayerReadContracts.ts";

export function summarizePortfolio(
  cash: StockMarketPlayerCashDto,
  holdings: readonly StockMarketPlayerHoldingDto[],
) {
  const round = (v: number) => Math.round(v * 1_000_000) / 1_000_000;
  const currencies = [
    ...new Set(holdings.map((h) => h.currencyCode ?? "UNKNOWN")),
  ].sort();
  const byCurrency: StockMarketCurrencyValue[] = currencies.map(
    (currencyCode) => {
      const rows = holdings.filter((h) =>
        (h.currencyCode ?? "UNKNOWN") === currencyCode
      );
      const sum = (
        key: "marketValue" | "costBasis" | "unrealizedPnl" | "realizedPnl",
      ) => round(rows.reduce((v, h) => v + h[key], 0));
      return {
        currencyCode,
        marketValue: sum("marketValue"),
        costBasis: sum("costBasis"),
        unrealizedPnl: sum("unrealizedPnl"),
        realizedPnl: sum("realizedPnl"),
      };
    },
  );
  const value = byCurrency.find((v) => v.currencyCode === cash.currencyCode);
  const holdingsMarketValue = value?.marketValue ?? 0;
  return {
    currencyCode: cash.currencyCode,
    valuationStatus: currencies.some((c) => c !== cash.currencyCode)
      ? "partial_unconverted" as const
      : "complete" as const,
    byCurrency,
    cashBalance: cash.balance,
    holdingsMarketValue,
    totalEquity: round(cash.balance + holdingsMarketValue),
    totalCostBasis: value?.costBasis ?? 0,
    unrealizedPnl: value?.unrealizedPnl ?? 0,
    realizedPnl: value?.realizedPnl ?? 0,
    positionsCount: holdings.filter((h) => h.quantity > 0).length,
  };
}
