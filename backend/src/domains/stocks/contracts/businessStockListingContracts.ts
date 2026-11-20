export interface BusinessStockListing {
  readonly businessKey: string;
  readonly ipoKey: string;
  readonly shareClass: "common";
  readonly wholeSharesOnly: true;
  readonly marketPolicy: "business_listing_v1";
  readonly financials: {
    readonly status:
      | "complete"
      | "incomplete_history"
      | "unreconciled"
      | "unavailable";
    readonly statementKey?: string;
    readonly periodNumber?: string;
    readonly capturedAt?: string;
    readonly currencyCode?: string;
    readonly equity?: string;
    readonly revenue?: string;
    readonly netIncome?: string;
  };
}
