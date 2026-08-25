import {
  type BusinessStoreSaleActivityDto,
  type BusinessStoreSaleDto,
  type BusinessStoreSalesSnapshotDto,
  PlayerBusinessError,
} from "../contracts/playerBusinessContracts.ts";

export type BusinessRepositoryRow = Record<string, unknown>;

export function projectBusinessStoreSalesSnapshot(
  businessKey: string,
  currencyCode: string,
  receiptRows: readonly BusinessRepositoryRow[],
  activityRows: readonly BusinessRepositoryRow[],
): BusinessStoreSalesSnapshotDto {
  const normalizedBusinessKey = requiredPublicKey(
    businessKey,
    /^biz_[0-9a-f]{32}$/u,
    "businessKey",
  );
  const normalizedCurrencyCode = requiredPattern(
    currencyCode,
    /^[A-Z0-9_]{3,16}$/u,
    "currencyCode",
  );
  const sales = receiptRows.map(parseBusinessStoreSale);
  const activity = activityRows.map(parseBusinessStoreSaleActivity);
  const salesByReceipt = new Map<string, BusinessStoreSaleDto>();
  const saleQuoteKeys = new Set<string>();
  for (const sale of sales) {
    if (
      sale.currencyCode !== normalizedCurrencyCode ||
      sale.grossMargin !== round4(sale.grossRevenue - sale.costOfGoodsSold) ||
      salesByReceipt.has(sale.receiptKey) ||
      saleQuoteKeys.has(sale.quoteKey)
    ) {
      invalidStoreSalesResult(
        "receipt currency, margin, or public identity is inconsistent",
      );
    }
    salesByReceipt.set(sale.receiptKey, sale);
    saleQuoteKeys.add(sale.quoteKey);
  }
  const activityKeys = new Set<string>();
  const activityReceipts = new Set<string>();
  for (const event of activity) {
    if (
      event.currencyCode !== normalizedCurrencyCode ||
      event.grossMargin !==
        round4(event.grossRevenue - event.costOfGoodsSold) ||
      activityKeys.has(event.activityKey) ||
      activityReceipts.has(event.receiptKey)
    ) {
      invalidStoreSalesResult(
        "activity currency, margin, or public identity is inconsistent",
      );
    }
    activityKeys.add(event.activityKey);
    activityReceipts.add(event.receiptKey);
    const sale = salesByReceipt.get(event.receiptKey);
    if (
      !sale ||
      (
        event.quoteKey !== sale.quoteKey ||
        event.offerKey !== sale.offerKey ||
        event.quantity !== sale.quantity ||
        event.grossRevenue !== sale.grossRevenue ||
        event.costOfGoodsSold !== sale.costOfGoodsSold ||
        event.grossMargin !== sale.grossMargin ||
        event.currencyCode !== sale.currencyCode
      )
    ) {
      invalidStoreSalesResult(
        "receipt and activity evidence do not describe the same sale",
      );
    }
  }
  if (activityReceipts.size !== salesByReceipt.size) {
    invalidStoreSalesResult(
      "receipt and activity evidence must form a one-to-one settlement set",
    );
  }

  return {
    businessKey: normalizedBusinessKey,
    currencyCode: normalizedCurrencyCode,
    recentReceiptCount: sales.length,
    recentQuantitySold: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    recentGrossRevenue: round4(sales.reduce(
      (sum, sale) => sum + sale.grossRevenue,
      0,
    )),
    recentCostOfGoodsSold: round4(sales.reduce(
      (sum, sale) => sum + sale.costOfGoodsSold,
      0,
    )),
    recentGrossMargin: round4(sales.reduce(
      (sum, sale) => sum + sale.grossMargin,
      0,
    )),
    sales,
    activity,
  };
}

export function emptyBusinessStoreSales(
  businessKey: string,
  currencyCode: string,
): BusinessStoreSalesSnapshotDto {
  return {
    businessKey,
    currencyCode,
    recentReceiptCount: 0,
    recentQuantitySold: 0,
    recentGrossRevenue: 0,
    recentCostOfGoodsSold: 0,
    recentGrossMargin: 0,
    sales: [],
    activity: [],
  };
}

function parseBusinessStoreSale(
  row: BusinessRepositoryRow,
): BusinessStoreSaleDto {
  return {
    receiptKey: requiredPublicKey(
      row.public_key,
      /^spr_[0-9a-f]{32}$/u,
      "receiptKey",
    ),
    quoteKey: requiredPublicKey(
      row.quote_key,
      /^quote_[0-9a-f]{32}$/u,
      "quoteKey",
    ),
    offerKey: requiredPublicKey(
      row.offer_key,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    itemKey: requiredPattern(
      row.store_item_key,
      /^[a-z0-9_-]{1,64}$/u,
      "itemKey",
    ),
    quantity: requiredPositiveInteger(row.quantity, "quantity"),
    grossRevenue: requiredMoney(row.gross_revenue, "grossRevenue"),
    costOfGoodsSold: requiredMoney(
      row.cost_of_goods_sold,
      "costOfGoodsSold",
    ),
    grossMargin: requiredMoney(row.gross_margin, "grossMargin", true),
    currencyCode: requiredPattern(
      row.currency_code,
      /^[A-Z0-9_]{3,16}$/u,
      "currencyCode",
    ),
    completedAt: requiredTimestamp(row.completed_at, "completedAt"),
  };
}

function parseBusinessStoreSaleActivity(
  row: BusinessRepositoryRow,
): BusinessStoreSaleActivityDto {
  const metadata = row.metadata && typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
    ? row.metadata as BusinessRepositoryRow
    : invalidStoreSalesResult("activity metadata must be an object");
  if (
    row.event_type !== "business.store.sale.completed" ||
    row.reason_code !== "business_store_offer_purchase"
  ) {
    invalidStoreSalesResult(
      "activity authority does not match Store settlement",
    );
  }
  return {
    activityKey: requiredPublicKey(
      row.public_key,
      /^bae_[0-9a-f]{32}$/u,
      "activityKey",
    ),
    eventType: "business.store.sale.completed",
    reasonCode: "business_store_offer_purchase",
    receiptKey: requiredPublicKey(
      metadata.receiptKey,
      /^spr_[0-9a-f]{32}$/u,
      "receiptKey",
    ),
    quoteKey: requiredPublicKey(
      metadata.quoteKey,
      /^quote_[0-9a-f]{32}$/u,
      "quoteKey",
    ),
    offerKey: requiredPublicKey(
      metadata.offerKey,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    quantity: requiredPositiveInteger(metadata.quantity, "quantity"),
    grossRevenue: requiredMoney(metadata.grossRevenue, "grossRevenue"),
    costOfGoodsSold: requiredMoney(
      metadata.costOfGoodsSold,
      "costOfGoodsSold",
    ),
    grossMargin: requiredMoney(metadata.grossMargin, "grossMargin", true),
    currencyCode: requiredPattern(
      metadata.currencyCode,
      /^[A-Z0-9_]{3,16}$/u,
      "currencyCode",
    ),
    occurredAt: requiredTimestamp(row.occurred_at, "occurredAt"),
  };
}

function requiredPublicKey(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  return requiredPattern(value, pattern, label).toLowerCase();
}

function requiredPattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(normalized)) {
    invalidStoreSalesResult(`${label} has an invalid public format`);
  }
  return normalized;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalidStoreSalesResult(`${label} must be a positive integer`);
  }
  return parsed;
}

function requiredMoney(
  value: unknown,
  label: string,
  allowNegative = false,
): number {
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) || parsed !== round4(parsed) ||
    (!allowNegative && parsed < 0)
  ) {
    invalidStoreSalesResult(`${label} must be exact money`);
  }
  return parsed;
}

function requiredTimestamp(value: unknown, label: string): string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    invalidStoreSalesResult(`${label} must be an ISO timestamp`);
  }
  return new Date(parsed).toISOString();
}

function invalidStoreSalesResult(message: string): never {
  throw new PlayerBusinessError(
    "business_store_sales_result_invalid",
    `Committed Store sales could not be read safely: ${message}.`,
    500,
  );
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
