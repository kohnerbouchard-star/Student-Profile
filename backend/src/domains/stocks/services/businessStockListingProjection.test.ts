import { projectBusinessStockListing } from "./businessStockListingProjection.ts";
import { toPlayerStockAssetDto } from "./playerStockAssetDtoMapper.ts";
import { mapStockTradingRpcError } from "../infrastructure/stockMarketTradingErrorMapper.ts";
declare const Deno: { test(name: string, run: () => void): void };
const row = () => ({
  business_public_key: "biz_" + "a".repeat(32),
  business_ipo_key: "bgp_" + "b".repeat(32),
  business_market_policy: "business_listing_v1",
  listing_currency_code: "NRC",
  business_financials: {
    schemaVersion: 1,
    status: "complete",
    statementKey: "bopr_" + "c".repeat(32),
    periodNumber: "1",
    capturedAt: "2026-09-18T00:00:00Z",
    currencyCode: "NRC",
    equity: "1000.123456789123456789",
    revenue: "15",
    netIncome: "-0.123456789123456789",
    internal_id: "00000000-0000-4000-8000-000000000001",
  },
});
const assert = (ok: unknown) => {
  if (!ok) throw new Error("Listing assertion failed.");
};
Deno.test("Business listing projection preserves exact evidence and exposes only selected public fields", () => {
  const commonEquity = projectBusinessStockListing(row());
  assert(commonEquity?.financials.equity === "1000.123456789123456789");
  assert(commonEquity?.financials.netIncome === "-0.123456789123456789");
  assert(!JSON.stringify(commonEquity).includes("internal_id"));
  assert(!JSON.stringify(commonEquity).includes("00000000-0000-4000"));
  const dto = toPlayerStockAssetDto(
    {
      ticker: "B111111111111111",
      currentPrice: 2.5,
      previousClose: 2.5,
      commonEquity,
    } as any,
    0,
  );
  assert(dto.commonEquity === commonEquity);
});
Deno.test("Business listing rejects incomplete linkage, unsupported policy, UUIDs and currency mismatch", () => {
  for (
    const input of [
      { ...row(), business_public_key: null },
      { ...row(), business_market_policy: "unknown" },
      { ...row(), business_ipo_key: "00000000-0000-4000-8000-000000000001" },
      { ...row(), listing_currency_code: "ECO" },
      {
        ...row(),
        business_financials: { ...row().business_financials, equity: 0.1 },
      },
    ]
  ) {
    let denied = false;
    try {
      projectBusinessStockListing(input);
    } catch {
      denied = true;
    }
    assert(denied);
  }
  assert(projectBusinessStockListing({}) === undefined);
});
Deno.test("Business share trade denials are safe actionable client errors", () => {
  for (
    const [message, status] of [["STOCK_BUSINESS_WHOLE_SHARES_REQUIRED", 400], [
      "STOCK_BUSINESS_SHARES_UNAVAILABLE",
      409,
    ], ["BUSINESS_MARKET_ISSUER_UNAVAILABLE", 409]] as const
  ) {
    const error = mapStockTradingRpcError({ message }, "buy_quote");
    assert(error.status === status);
    assert(!error.message.includes(message));
  }
});
