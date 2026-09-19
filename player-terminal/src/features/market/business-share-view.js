import { escapeHtml } from "../../core/format.js";

export function businessShareListing(value) {
  if (!value || typeof value !== "object") return undefined;
  if (!/^biz_[0-9a-f]{32}$/.test(value.businessKey) || !/^bgp_[0-9a-f]{32}$/.test(value.ipoKey) ||
    value.shareClass !== "common" || value.wholeSharesOnly !== true || value.marketPolicy !== "business_listing_v1") return undefined;
  const f = value.financials;
  if (!f || !["complete", "incomplete_history", "unreconciled", "unavailable"].includes(f.status)) return undefined;
  const financials = { status: f.status };
  if (f.status === "complete") {
    if (!/^bopr_[0-9a-f]{32}$/.test(f.statementKey) || !/^[1-9][0-9]*$/.test(f.periodNumber) ||
      !/^[A-Z][A-Z0-9_]{1,15}$/.test(f.currencyCode) || !Number.isFinite(Date.parse(f.capturedAt)) ||
      [f.equity, f.revenue, f.netIncome].some(v => typeof v !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v) || v.length > 100)) return undefined;
    Object.assign(financials, { statementKey: f.statementKey, periodNumber: f.periodNumber, capturedAt: f.capturedAt,
      currencyCode: f.currencyCode, equity: f.equity, revenue: f.revenue, netIncome: f.netIncome });
  }
  return { businessKey: value.businessKey, ipoKey: value.ipoKey, shareClass: "common", wholeSharesOnly: true, marketPolicy: "business_listing_v1", financials };
}

export function assertBusinessShareQuantity(asset, quantity) {
  if (asset?.commonEquity?.wholeSharesOnly && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000_000)) {
    throw new Error("Business common shares must be traded in whole shares.");
  }
}

export function renderBusinessShareFacts(asset) {
  const listing = businessShareListing(asset?.commonEquity);
  if (!listing) return "";
  const f = listing.financials;
  const status = f.status === "complete" ? `Closed period ${f.periodNumber} · ${new Date(f.capturedAt).toISOString().slice(0,10)}` : "Financial statements unavailable";
  const amount = (v) => `${escapeHtml(f.currencyCode)} ${escapeHtml(v)}`;
  return `<section class="player-terminal-connector-status" data-business-share-facts aria-label="Business common shares">
    <strong>BUSINESS COMMON SHARES</strong><p>Whole shares · One vote per share. Operating access remains with the Business managers.</p>
    <p>${escapeHtml(status)}</p>${f.status === "complete" ? `<dl class="player-terminal-connector-meta"><div><dt>REVENUE</dt><dd>${amount(f.revenue)}</dd></div><div><dt>NET INCOME</dt><dd>${amount(f.netIncome)}</dd></div><div><dt>BOOK EQUITY</dt><dd>${amount(f.equity)}</dd></div></dl>` : ""}
    <p>Purchases need shares available on the Market. Sales need enough Market cash in the listing currency. Review each order before confirming.</p>
  </section>`;
}
