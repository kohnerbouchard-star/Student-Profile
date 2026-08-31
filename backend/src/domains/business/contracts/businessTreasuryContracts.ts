export const BUSINESS_TREASURY_ACCOUNT_KEY_PATTERN = /^bac_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_QUOTE_KEY_PATTERN = /^fxq_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_ORDER_KEY_PATTERN = /^fxo_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_RECEIPT_KEY_PATTERN = /^fxr_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_FIXING_KEY_PATTERN = /^fxf_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_BUSINESS_KEY_PATTERN = /^biz_[0-9a-f]{32}$/u;
export const BUSINESS_FUNDING_QUOTE_KEY_PATTERN = /^pfq_[0-9a-f]{32}$/u;
export const BUSINESS_FUNDING_RECEIPT_KEY_PATTERN = /^pfr_[0-9a-f]{32}$/u;
export const BUSINESS_TREASURY_TRANSACTION_KEY_PATTERN = /^btx_[0-9a-f]{32}$/u;
export const BUSINESS_FUNDING_TRANSACTION_KEY_PATTERN =
  BUSINESS_TREASURY_TRANSACTION_KEY_PATTERN;
export const BUSINESS_TREASURY_IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;

export type BusinessTreasuryFxProductV1 = "standard" | "instant";
export type BusinessTreasuryMutationOutcomeV1 = "applied" | "replayed";

export interface BusinessFundingAllocationV1 {
  readonly sourceAccountKey: string;
  /**
   * Canonical positive target-currency intent, or null on the final ordered
   * line for the server-derived remainder of the authoritative Store bill.
   */
  readonly targetAmount: string | null;
}

/** Exact browser-safe monetary value with its registry precision. */
export interface BusinessMoneyV1 {
  readonly amount: string;
  readonly currencyCode: string;
  readonly precision: number;
}

export interface BusinessFundingQuoteLineV1 {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly sourcePrecision: number;
  readonly targetCurrencyCode: string;
  readonly targetPrecision: number;
  readonly posted: BusinessMoneyV1;
  readonly held: BusinessMoneyV1;
  readonly available: BusinessMoneyV1;
  readonly targetContribution: BusinessMoneyV1;
  readonly sourceDebit: BusinessMoneyV1;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly effectiveRate: string;
  readonly spreadRate: string;
  readonly requiresFx: boolean;
  readonly roundingDisclosure: string;
}

export interface BusinessFundingQuoteV1 {
  readonly quoteKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly targetAmount: BusinessMoneyV1;
  readonly fixingKey: string;
  readonly policyVersion: string;
  readonly requiresFx: boolean;
  readonly expiresAt: string;
  readonly lines: readonly BusinessFundingQuoteLineV1[];
}

export interface BusinessFundingReceiptLineV1 {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly sourcePrecision: number;
  readonly targetCurrencyCode: string;
  readonly targetPrecision: number;
  readonly targetContribution: BusinessMoneyV1;
  readonly sourceDebit: BusinessMoneyV1;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly effectiveRate: string;
  readonly spreadRate: string;
  readonly requiresFx: boolean;
}

export interface BusinessFundingReceiptV1 {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly bankTransactionKey: string;
  readonly targetAccountKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly targetAmount: BusinessMoneyV1;
  readonly targetReserveDrawAmount: BusinessMoneyV1;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly createdAt: string;
  readonly lines: readonly BusinessFundingReceiptLineV1[];
}

export interface BusinessTreasuryAccountV1 {
  readonly accountKey: string;
  readonly accountKind: "checking";
  readonly status: string;
  readonly currencyCode: string;
  readonly precision: number;
  readonly posted: BusinessMoneyV1;
  readonly held: BusinessMoneyV1;
  readonly available: BusinessMoneyV1;
}

export interface BusinessTreasuryRateV1 {
  readonly fixingKey: string;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly referenceRate: string;
  readonly effectiveAt: string;
  readonly calculatedAt: string;
  readonly policyVersion: string;
}

export interface BusinessTreasuryFxQuoteV1 {
  readonly quoteKey: string;
  readonly product: BusinessTreasuryFxProductV1;
  readonly sourceAccountKey: string;
  readonly targetAccountKey: string;
  readonly sourceAmount: BusinessMoneyV1;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly spreadRate: string;
  readonly feeRate: string;
  readonly feeAmount: BusinessMoneyV1;
  readonly targetAmount: BusinessMoneyV1;
  readonly fixingKey: string;
  readonly policyVersion: string;
  readonly expiresAt: string;
  readonly settlesAt: string;
  readonly requiresFx: boolean;
  readonly roundingDisclosure: string;
}

export interface BusinessTreasuryFxOrderV1 {
  readonly orderKey: string;
  readonly quoteKey: string;
  readonly product: BusinessTreasuryFxProductV1;
  readonly status: string;
  readonly sourceAccountKey: string;
  readonly targetAccountKey: string;
  readonly sourceAmount: BusinessMoneyV1;
  readonly feeAmount: BusinessMoneyV1;
  readonly targetAmount: BusinessMoneyV1;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly spreadRate: string;
  readonly feeRate: string;
  readonly fixingKey: string;
  readonly submittedAt: string;
  readonly settlesAt: string;
  readonly completedAt: string | null;
  readonly receiptKey: string | null;
}

export interface BusinessTreasuryFxReceiptV1 {
  readonly receiptKey: string;
  readonly orderKey: string;
  readonly quoteKey: string;
  readonly bankTransactionKey: string;
  readonly product: BusinessTreasuryFxProductV1;
  readonly sourceAccountKey: string;
  readonly targetAccountKey: string;
  readonly sourceAmount: BusinessMoneyV1;
  readonly feeAmount: BusinessMoneyV1;
  readonly targetAmount: BusinessMoneyV1;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly spreadRate: string;
  readonly feeRate: string;
  readonly reserveDrawAmount: BusinessMoneyV1;
  readonly reserveRepaymentAmount: BusinessMoneyV1;
  readonly fixingKey: string;
  readonly completedAt: string;
}

/**
 * Canonical C4 browser envelope. Internal owner, account, order, and receipt
 * UUIDs are deliberately absent; every identity is a public key.
 */
export interface BusinessTreasurySnapshotV1 {
  readonly businessKey: string;
  readonly reportingCurrencyCode: string;
  readonly generatedAt: string;
  readonly accounts: readonly BusinessTreasuryAccountV1[];
  readonly rates: readonly BusinessTreasuryRateV1[];
  readonly orders: readonly BusinessTreasuryFxOrderV1[];
  readonly receipts: readonly BusinessTreasuryFxReceiptV1[];
}

export interface BusinessTreasuryScopeV1 {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface BusinessTreasuryMutationResultV1<T> {
  readonly outcome: BusinessTreasuryMutationOutcomeV1;
  readonly value: T;
}

export interface BusinessTreasuryRepositoryV1 {
  readSnapshot(
    scope: BusinessTreasuryScopeV1,
  ): Promise<BusinessTreasurySnapshotV1>;
  openCheckingAccount(
    input: BusinessTreasuryScopeV1 & {
      readonly currencyCode: string;
      readonly idempotencyKey: string;
    },
  ): Promise<BusinessTreasuryMutationResultV1<BusinessTreasuryAccountV1>>;
  createQuote(
    input: BusinessTreasuryScopeV1 & {
      readonly sourceAccountKey: string;
      readonly targetAccountKey: string | null;
      readonly targetCurrencyCode: string;
      readonly sourceAmount: string;
      readonly product: BusinessTreasuryFxProductV1;
      readonly idempotencyKey: string;
    },
  ): Promise<BusinessTreasuryMutationResultV1<BusinessTreasuryFxQuoteV1>>;
  submitStandard(
    input: BusinessTreasuryScopeV1 & {
      readonly quoteKey: string;
      readonly idempotencyKey: string;
    },
  ): Promise<BusinessTreasuryMutationResultV1<BusinessTreasuryFxOrderV1>>;
  executeInstant(
    input: BusinessTreasuryScopeV1 & {
      readonly quoteKey: string;
      readonly idempotencyKey: string;
    },
  ): Promise<BusinessTreasuryMutationResultV1<BusinessTreasuryFxOrderV1>>;
  cancelStandard(
    input: BusinessTreasuryScopeV1 & {
      readonly orderKey: string;
      readonly idempotencyKey: string;
    },
  ): Promise<BusinessTreasuryMutationResultV1<BusinessTreasuryFxOrderV1>>;
}

export class BusinessTreasuryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "BusinessTreasuryError";
  }
}
