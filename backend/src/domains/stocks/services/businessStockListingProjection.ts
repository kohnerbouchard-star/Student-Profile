import type { BusinessStockListing } from "../contracts/businessStockListingContracts.ts";

// An explicit projection keeps internal issuer/event/receipt identifiers out of
// the existing public ticker contract, and keeps accounting amounts as text.
export function projectBusinessStockListing(
  row: Record<string, unknown>,
): BusinessStockListing | undefined {
  if (row.business_public_key == null) {
    if (
      row.business_ipo_key != null || row.business_financials != null ||
      row.business_market_policy != null
    ) throw new Error("Invalid Business listing link.");
    return undefined;
  }
  const key = (v: unknown, prefix: string) => {
    if (
      typeof v !== "string" || !new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(v)
    ) throw new Error("Invalid public listing key.");
    return v;
  };
  if (row.business_market_policy !== "business_listing_v1") {
    throw new Error("Unknown Business listing policy.");
  }
  const source = row.business_financials;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Missing Business financial evidence.");
  }
  const s = source as Record<string, unknown>;
  if (
    s.schemaVersion !== 1 ||
    !["complete", "incomplete_history", "unreconciled", "unavailable"].includes(
      String(s.status),
    )
  ) throw new Error("Invalid Business financial evidence.");
  let financials: BusinessStockListing["financials"] = {
    status: s.status as BusinessStockListing["financials"]["status"],
  };
  if (s.status === "complete") {
    const decimal = (v: unknown) => {
      if (
        typeof v !== "string" ||
        !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v) || v.length > 100
      ) throw new Error("Invalid financial amount.");
      return v;
    };
    if (
      typeof s.periodNumber !== "string" ||
      !/^[1-9][0-9]*$/.test(s.periodNumber) ||
      typeof s.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(s.capturedAt)) ||
      typeof s.currencyCode !== "string" ||
      !/^[A-Z][A-Z0-9_]{1,15}$/.test(s.currencyCode) ||
      s.currencyCode !== row.listing_currency_code
    ) throw new Error("Invalid financial scope.");
    financials = {
      status: "complete",
      statementKey: key(s.statementKey, "bopr"),
      periodNumber: s.periodNumber,
      capturedAt: s.capturedAt,
      currencyCode: s.currencyCode,
      equity: decimal(s.equity),
      revenue: decimal(s.revenue),
      netIncome: decimal(s.netIncome),
    };
  }
  return {
    businessKey: key(row.business_public_key, "biz"),
    ipoKey: key(row.business_ipo_key, "bgp"),
    shareClass: "common",
    wholeSharesOnly: true,
    marketPolicy: "business_listing_v1",
    financials,
  };
}
