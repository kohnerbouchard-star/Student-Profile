import type {
  PlayerStoreOfferPublicQuoteDto,
  PlayerStoreOfferPublicReceiptDto,
} from "./playerStoreOfferPublicContracts.ts";
import type {
  PlayerStorePublicQuoteDto,
  PlayerStorePublicReceiptDto,
} from "./playerStorePublicContracts.ts";

export const PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN =
  /^bac_[0-9a-f]{32}$/u;
export const PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN =
  /^pfq_[0-9a-f]{32}$/u;
export const PLAYER_STORE_FUNDING_RECEIPT_KEY_PATTERN =
  /^pfr_[0-9a-f]{32}$/u;

export interface PlayerStoreFundingAllocationInput {
  readonly sourceAccountKey: string;
  readonly targetAmount: number;
}

export interface PlayerStoreFundingQuoteLineDto {
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

export interface PlayerStoreFundingQuoteDto {
  readonly quoteKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly targetAmount: number;
  readonly fixingKey: string;
  readonly policyVersion: string;
  readonly requiresFx: boolean;
  readonly expiresAt: string;
  readonly lines: readonly PlayerStoreFundingQuoteLineDto[];
}

export interface PlayerStoreFundingReceiptLineDto {
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

export interface PlayerStoreFundingReceiptDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly bankTransactionKey: string;
  readonly targetAccountKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly targetCurrencyCode: string;
  readonly targetAmount: number;
  readonly targetReserveDrawAmount: number;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly createdAt: string;
  readonly lines: readonly PlayerStoreFundingReceiptLineDto[];
}

export type PlayerStoreSeededFundingQuoteDto = PlayerStorePublicQuoteDto & {
  readonly quoteStatus: "created" | "used" | "expired" | "cancelled";
  readonly replayed: boolean;
  readonly fundingQuote: PlayerStoreFundingQuoteDto;
};

export type PlayerStoreSeededFundingReceiptDto = PlayerStorePublicReceiptDto & {
  readonly fundingReceipt: PlayerStoreFundingReceiptDto;
};

export type PlayerStoreBusinessFundingQuoteDto =
  PlayerStoreOfferPublicQuoteDto & {
    readonly fundingQuote: PlayerStoreFundingQuoteDto;
  };

export type PlayerStoreBusinessFundingReceiptDto =
  PlayerStoreOfferPublicReceiptDto & {
    readonly fundingReceipt: PlayerStoreFundingReceiptDto;
  };

export interface PlayerStoreFundingPublicScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerStoreFundingPublicRepository {
  createSeededQuote(
    input: PlayerStoreFundingPublicScope & {
      readonly itemKey: string;
      readonly quantity: number;
      readonly allocations: readonly PlayerStoreFundingAllocationInput[];
      readonly idempotencyKey: string;
      readonly effectiveAt: string;
    },
  ): Promise<PlayerStoreSeededFundingQuoteDto>;

  settleSeededPurchase(
    input: PlayerStoreFundingPublicScope & {
      readonly quoteKey: string;
      readonly idempotencyKey: string;
      readonly clientSubmittedAt: string | null;
    },
  ): Promise<PlayerStoreSeededFundingReceiptDto>;

  createBusinessOfferQuote(
    input: PlayerStoreFundingPublicScope & {
      readonly offerKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly allocations: readonly PlayerStoreFundingAllocationInput[];
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreBusinessFundingQuoteDto>;

  settleBusinessOfferPurchase(
    input: PlayerStoreFundingPublicScope & {
      readonly offerKey: string;
      readonly quoteKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreBusinessFundingReceiptDto>;

  readBusinessOfferReceipt(
    input: PlayerStoreFundingPublicScope & {
      readonly receiptKey: string;
    },
  ): Promise<PlayerStoreBusinessFundingReceiptDto>;
}
