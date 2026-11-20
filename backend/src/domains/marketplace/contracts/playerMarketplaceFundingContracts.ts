export const MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN = /^bac_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_QUOTE_KEY_PATTERN = /^pfq_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_RECEIPT_KEY_PATTERN = /^pfr_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_BANK_TRANSACTION_KEY_PATTERN = /^btx_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_RESERVATION_KEY_PATTERN = /^mpr_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_ORDER_KEY_PATTERN = /^ord_[0-9a-f]{32}$/u;
export const MARKETPLACE_FUNDING_REFUND_KEY_PATTERN = /^mfr_[0-9a-f]{32}$/u;

export interface PlayerMarketplaceFundingAllocationInput {
  readonly sourceAccountKey: string;
  readonly targetAmount: number;
}

export interface PlayerMarketplaceFundingQuoteLineDto {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly sourceMinorUnit: number;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly postedAmount: number;
  readonly heldAmount: number;
  readonly availableAmount: number;
  readonly targetContribution: number;
  readonly sourceDebit: number;
  readonly referenceRate: number;
  readonly customerRate: number;
  readonly effectiveRate: number;
  readonly spreadRate: number;
  readonly requiresFx: boolean;
  readonly roundingDisclosure: string;
}

export interface PlayerMarketplaceFundingQuoteDto {
  readonly quoteKey: string;
  readonly fundingContextKind: "marketplace.purchase";
  readonly fundingContextKey: string;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly targetAmount: number;
  readonly fixingKey: string;
  readonly policyVersion: string;
  readonly requiresFx: boolean;
  readonly expiresAt: string;
  readonly lines: readonly PlayerMarketplaceFundingQuoteLineDto[];
}

export interface PlayerMarketplaceFundedReservationDto {
  readonly reservationKey: string;
  readonly listingKey: string;
  readonly itemKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly feeRate: number;
  readonly taxRate: number;
  readonly feeAmount: number;
  readonly taxAmount: number;
  readonly buyerTotal: number;
  readonly sellerProceeds: number;
  readonly currencyCode: string;
  readonly status: "reserved" | "settling" | "settled" | "released" | "expired";
  readonly version: number;
  readonly listingVersion: number;
  readonly expiresAt: string;
  readonly replayed: boolean;
  readonly fundingQuote: PlayerMarketplaceFundingQuoteDto;
}

export interface PlayerMarketplaceFundingReceiptLineDto {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly targetContribution: number;
  readonly sourceDebit: number;
  readonly referenceRate: number;
  readonly customerRate: number;
  readonly effectiveRate: number;
  readonly spreadRate: number;
  readonly requiresFx: boolean;
}

export interface PlayerMarketplaceFundingReceiptDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly bankTransactionKey: string;
  readonly targetAccountKey: string;
  readonly fundingContextKind: "marketplace.purchase";
  readonly fundingContextKey: string;
  readonly targetCurrencyCode: string;
  readonly targetAmount: number;
  readonly targetReserveDrawAmount: number;
  readonly sourceDomain: "marketplace";
  readonly sourceAction: "marketplace_purchase_funding";
  readonly createdAt: string;
  readonly lines: readonly PlayerMarketplaceFundingReceiptLineDto[];
}

export interface PlayerMarketplaceFundedOrderDto {
  readonly orderKey: string;
  readonly reservationKey: string;
  readonly listingKey: string;
  readonly itemKey: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly feeAmount: number;
  readonly taxAmount: number;
  readonly buyerTotal: number;
  readonly sellerProceeds: number;
  readonly currencyCode: string;
  readonly status: "completed" | "disputed" | "refunded";
  readonly version: number;
  readonly completedAt: string;
  readonly refundedAt: string | null;
  readonly replayed: boolean;
  readonly fundingReceipt: PlayerMarketplaceFundingReceiptDto;
  readonly distributionBankTransactionKey: string;
}

export interface PlayerMarketplaceFundedRefundDto {
  readonly refundKey: string;
  readonly orderKey: string;
  readonly disputeKey: string;
  readonly status: "refunded";
  readonly currencyCode: string;
  readonly buyerTotal: number;
  readonly sellerProceeds: number;
  readonly feeAmount: number;
  readonly taxAmount: number;
  readonly distributionReversalBankTransactionKey: string;
  readonly fundingReversalBankTransactionKey: string;
  readonly refundedAt: string;
  readonly replayed: boolean;
}

export interface PlayerMarketplaceFundingScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerMarketplaceFundingRepository {
  createQuote(
    input: PlayerMarketplaceFundingScope & {
      readonly listingKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly allocations: readonly PlayerMarketplaceFundingAllocationInput[];
      readonly idempotencyKey: string;
      readonly effectiveAt: string;
    },
  ): Promise<PlayerMarketplaceFundedReservationDto>;

  settle(
    input: PlayerMarketplaceFundingScope & {
      readonly reservationKey: string;
      readonly idempotencyKey: string;
      readonly clientSubmittedAt: string | null;
    },
  ): Promise<PlayerMarketplaceFundedOrderDto>;
}
