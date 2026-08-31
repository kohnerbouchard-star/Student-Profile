import type {
  PlayerStoreOfferPublicQuoteDto,
  PlayerStoreOfferPublicReceiptDto,
} from "./playerStoreOfferPublicContracts.ts";
import type {
  PlayerStorePublicQuoteDto,
  PlayerStorePublicReceiptDto,
} from "./playerStorePublicContracts.ts";

export const PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN = /^bac_[0-9a-f]{32}$/u;
export const PLAYER_STORE_FUNDING_QUOTE_KEY_PATTERN = /^pfq_[0-9a-f]{32}$/u;
export const PLAYER_STORE_FUNDING_RECEIPT_KEY_PATTERN = /^pfr_[0-9a-f]{32}$/u;

export interface PlayerStoreFundingAllocationInput {
  readonly sourceAccountKey: string;
  readonly targetAmount: string | null;
}

export interface PlayerStoreFundingQuoteLineDto {
  readonly lineNumber: number;
  readonly sourceAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly sourceMinorUnit: number;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly postedAmount: string;
  readonly heldAmount: string;
  readonly availableAmount: string;
  readonly targetContribution: string;
  readonly sourceDebit: string;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly effectiveRate: string;
  readonly spreadRate: string;
  readonly requiresFx: boolean;
  readonly roundingDisclosure: string;
}

export interface PlayerStoreFundingQuoteDto {
  readonly quoteKey: string;
  readonly fundingContextKind: string;
  readonly fundingContextKey: string;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly targetAmount: string;
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
  readonly sourceMinorUnit: number;
  readonly targetCurrencyCode: string;
  readonly targetMinorUnit: number;
  readonly targetContribution: string;
  readonly sourceDebit: string;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly effectiveRate: string;
  readonly spreadRate: string;
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
  readonly targetMinorUnit: number;
  readonly targetAmount: string;
  readonly targetReserveDrawAmount: string;
  readonly sourceDomain: string;
  readonly sourceAction: string;
  readonly createdAt: string;
  readonly lines: readonly PlayerStoreFundingReceiptLineDto[];
}

export type PlayerStoreSeededFundingQuoteDto = PlayerStorePublicQuoteDto & {
  readonly quoteStatus: "created" | "used" | "expired" | "cancelled";
  readonly replayed: boolean;
  readonly offerKey: string;
  readonly offerVersion: number;
  readonly sellerKind: "seeded" | "npc";
  readonly sellerPartyKey: string;
  readonly sellerName: string;
  readonly availableQuantityAtQuote: number;
  readonly contextDigest: string;
  readonly fundingQuote: PlayerStoreFundingQuoteDto;
};

export type PlayerStoreSeededFundingReceiptDto = PlayerStorePublicReceiptDto & {
  readonly offerKey: string;
  readonly sellerKind: "seeded" | "npc";
  readonly sellerPartyKey: string;
  readonly sellerName: string;
  readonly offerVersionBefore: number;
  readonly offerVersionAfter: number;
  readonly remainingSellerQuantity: number;
  readonly sellerProceeds: number;
  readonly inventoryTransactionKey: string;
  readonly contextDigest: string;
  readonly fundingReceipt: PlayerStoreFundingReceiptDto;
};

export type PlayerStoreBusinessFundingQuoteDto =
  & PlayerStoreOfferPublicQuoteDto
  & {
    readonly contextDigest: string;
    readonly fundingQuote: PlayerStoreFundingQuoteDto;
  };

export type PlayerStoreBusinessFundingReceiptDto =
  & PlayerStoreOfferPublicReceiptDto
  & {
    readonly contextDigest: string;
    readonly fundingReceipt: PlayerStoreFundingReceiptDto;
  };

export interface PlayerStoreFundingPublicScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerStoreFundingPublicRepository {
  createSystemOfferQuote(
    input: PlayerStoreFundingPublicScope & {
      readonly offerKey: string;
      readonly quantity: number;
      readonly expectedVersion: number;
      readonly allocations: readonly PlayerStoreFundingAllocationInput[];
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreSeededFundingQuoteDto>;

  settleSystemOfferPurchase(
    input: PlayerStoreFundingPublicScope & {
      readonly quoteKey: string;
      readonly idempotencyKey: string;
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
      readonly quoteKey: string;
      readonly idempotencyKey: string;
    },
  ): Promise<PlayerStoreBusinessFundingReceiptDto>;

  readBusinessOfferReceipt(
    input: PlayerStoreFundingPublicScope & {
      readonly receiptKey: string;
    },
  ): Promise<PlayerStoreBusinessFundingReceiptDto>;
}
