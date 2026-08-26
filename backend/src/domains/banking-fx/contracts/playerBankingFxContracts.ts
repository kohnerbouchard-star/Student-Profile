import type { PlayerBankingPublicBalanceDto } from "../../economy/index.ts";

export const PLAYER_BANK_ACCOUNT_KEY_PATTERN = /^bac_[0-9a-f]{32}$/u;
export const PLAYER_FX_QUOTE_KEY_PATTERN = /^fxq_[0-9a-f]{32}$/u;
export const PLAYER_FX_ORDER_KEY_PATTERN = /^fxo_[0-9a-f]{32}$/u;
export const PLAYER_FX_RECEIPT_KEY_PATTERN = /^fxr_[0-9a-f]{32}$/u;
export const PLAYER_FX_FIXING_KEY_PATTERN = /^fxf_[0-9a-f]{32}$/u;
export const PLAYER_BANKING_FX_CURSOR_PATTERN = /^fxc_[A-Za-z0-9_-]{20,240}$/u;
export const PLAYER_BANKING_FX_IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;

export type PlayerBankingFxProduct = "standard" | "instant";
export type PlayerBankingFxHistoryRange = "7d" | "30d" | "game";
export type PlayerBankingFxOrderFilter = "all" | "pending" | "completed";

export type PlayerBankingFxRoute =
  | { readonly kind: "overview" }
  | { readonly kind: "history" }
  | { readonly kind: "orders" }
  | { readonly kind: "quote" }
  | { readonly kind: "standard" }
  | { readonly kind: "instant" }
  | { readonly kind: "cancel"; readonly orderKey: string }
  | { readonly kind: "malformed" };

export interface PlayerBankingFxScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export interface PlayerBankingFxFixingDto {
  readonly fixingKey: string;
  readonly effectiveAt: string;
  readonly calculatedAt: string;
  readonly nextFixingAt: string;
  readonly overdue: boolean;
  readonly policyVersion: string;
}

export interface PlayerBankingFxCurrencyDto {
  readonly currencyCode: string;
  /** Registry-defined number of fractional decimal places. */
  readonly minorUnit: number;
}

export interface PlayerBankingFxQuoteDto {
  readonly quoteKey: string;
  readonly product: PlayerBankingFxProduct;
  readonly sourceAccountKey: string;
  readonly targetAccountKey: string;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly sourceMinorUnit: number;
  readonly targetMinorUnit: number;
  readonly sourceAmountMode: "source_debit";
  readonly sourceAmount: string;
  readonly referenceRate: string;
  readonly customerRate: string;
  readonly spreadRate: string;
  readonly feeAmount: string;
  readonly targetAmount: string;
  readonly fixingKey: string;
  readonly policyVersion: string;
  readonly expiresAt: string;
  readonly settlesAt: string;
  readonly requiresFx: boolean;
  readonly roundingDisclosure: string;
}

export interface PlayerBankingFxOrderDto {
  readonly orderKey: string;
  readonly quoteKey: string;
  readonly product: PlayerBankingFxProduct;
  readonly status: string;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly sourceAmount: string;
  readonly feeAmount: string;
  readonly targetAmount: string;
  readonly submittedAt: string;
  readonly settlesAt: string;
  readonly completedAt: string | null;
  readonly receiptKey: string | null;
}

export interface PlayerBankingFxHistoryPointDto {
  readonly fixingKey: string;
  readonly effectiveAt: string;
  readonly sourceCurrencyCode: string;
  readonly targetCurrencyCode: string;
  readonly referenceRate: string;
}

export interface PlayerBankingFxOverview {
  readonly accounts: readonly PlayerBankingPublicBalanceDto[];
  readonly currencies: readonly PlayerBankingFxCurrencyDto[];
  readonly fixing: PlayerBankingFxFixingDto;
  readonly pendingOrders: readonly PlayerBankingFxOrderDto[];
  readonly completedOrders: readonly PlayerBankingFxOrderDto[];
}

export interface PlayerBankingFxHistoryPage {
  readonly items: readonly PlayerBankingFxHistoryPointDto[];
  readonly hasMore: boolean;
}

export interface PlayerBankingFxOrdersPage {
  readonly items: readonly PlayerBankingFxOrderDto[];
  readonly hasMore: boolean;
}

export interface PlayerBankingFxMutationResult<T> {
  readonly outcome: "applied" | "replayed";
  readonly value: T;
}

export interface CreatePlayerBankingFxQuoteInput extends PlayerBankingFxScope {
  readonly sourceAccountKey: string;
  readonly targetCurrencyCode: string;
  /** Canonical, non-exponent base-10 input forwarded to PostgreSQL numeric. */
  readonly sourceAmount: string;
  readonly product: PlayerBankingFxProduct;
  readonly idempotencyKey: string;
}

export interface ConsumePlayerBankingFxQuoteInput extends PlayerBankingFxScope {
  readonly quoteKey: string;
  readonly idempotencyKey: string;
}

export interface CancelPlayerBankingFxOrderInput extends PlayerBankingFxScope {
  readonly orderKey: string;
  readonly idempotencyKey: string;
}

export interface PlayerBankingFxRepository {
  readOverview(scope: PlayerBankingFxScope): Promise<PlayerBankingFxOverview>;
  listHistory(
    input: PlayerBankingFxScope & {
      readonly sourceCurrencyCode: string;
      readonly targetCurrencyCode: string;
      readonly range: PlayerBankingFxHistoryRange;
      readonly limit: number;
      readonly cursor: string | null;
      readonly beforeAt: string | null;
      readonly beforeKey: string | null;
    },
  ): Promise<PlayerBankingFxHistoryPage>;
  listOrders(
    input: PlayerBankingFxScope & {
      readonly status: PlayerBankingFxOrderFilter;
      readonly limit: number;
      readonly cursor: string | null;
      readonly beforeAt: string | null;
      readonly beforeKey: string | null;
    },
  ): Promise<PlayerBankingFxOrdersPage>;
  createQuote(
    input: CreatePlayerBankingFxQuoteInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxQuoteDto>>;
  submitStandard(
    input: ConsumePlayerBankingFxQuoteInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>>;
  executeInstant(
    input: ConsumePlayerBankingFxQuoteInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>>;
  cancelStandard(
    input: CancelPlayerBankingFxOrderInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>>;
}

export class PlayerBankingFxError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PlayerBankingFxError";
  }
}
