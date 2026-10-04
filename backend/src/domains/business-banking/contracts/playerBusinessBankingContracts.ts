import {
  PlayerBusinessError,
  type PlayerBusinessRoute,
  type PlayerEconomicContext,
} from "../../business/index.ts";

export type { PlayerEconomicContext } from "../../business/index.ts";

export type PlayerBankingRoute =
  | { readonly kind: "playerTransfer" }
  | { readonly kind: "savingsTransfer" }
  | { readonly kind: "loansRead" }
  | { readonly kind: "loanApply"; readonly offerKey: string }
  | { readonly kind: "loanRepay"; readonly loanKey: string };

// Only the retained routes delegate through this facade. New
// Business capabilities are dispatched by the canonical Business root.
export type DelegatedPlayerBusinessRoute = Extract<
  PlayerBusinessRoute,
  { readonly kind:
    | "businessRead" | "businessCreate" | "businessProductCreate"
    | "businessInputPurchase" | "businessStoreQuote" | "businessStorePurchase"
    | "businessCandidateHire" | "businessProduction" | "businessPrice"
    | "businessHire" | "businessTerminate" | "businessStatus" }
>;

export type PlayerBusinessBankingRoute =
  | DelegatedPlayerBusinessRoute
  | PlayerBankingRoute;

// Internal persistence identity, never a browser DTO or operating permission.
// business_v1 is reserved: database creation gates remain installed through c4.
export type LoanLiabilityIdentity = {
  readonly liability_kind: "legacy_v1";
  readonly initiating_operator_player_id: null;
  readonly borrower_business_id: null;
} | {
  readonly liability_kind: "business_v1";
  readonly initiating_operator_player_id: string;
  readonly borrower_business_id: string;
};
export type LoanApplicationLiabilityIdentity = LoanLiabilityIdentity & (
  | { readonly liability_kind: "legacy_v1"; readonly obligation_currency_code: null }
  | { readonly liability_kind: "business_v1"; readonly obligation_currency_code: string }
);

export interface LoanCurrencyProjectionDto {
  readonly version: 1;
  readonly complete: boolean;
  readonly unknownCurrencyRows: number;
  readonly groups: readonly {
    readonly currencyCode: string;
    readonly availableCredit: string | null;
    readonly outstanding: string | null;
    readonly nextPayment: { readonly amount: string | null; readonly due: string | null } | null;
    readonly schedule: readonly { readonly due: string; readonly amount: string | null }[];
  }[];
}

export interface LoansSnapshotDto {
  readonly currencyProjection?: LoanCurrencyProjectionDto;
  readonly configured: boolean;
  readonly creditScore: number;
  readonly availableCredit: number;
  readonly outstanding: number;
  readonly nextPayment: { readonly amount: number; readonly due: string };
  readonly onTimeRate: number;
  readonly paymentsMade: number;
  // Optional for injected repositories; production emits null when the row has no currency.
  readonly offers: readonly {
    readonly currencyCode?: string | null;
    readonly id: string;
    readonly name: string;
    readonly purpose: string;
    readonly description: string;
    readonly limit: number;
    readonly minimumAmount: number;
    readonly apr: number;
    readonly fee: number;
    readonly termCycles: number;
    readonly risk: string;
    readonly borrowerType: string;
    readonly disclosure: string;
    readonly icon: string;
  }[];
  readonly activeLoans: readonly {
    readonly currencyCode?: string | null;
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly balance: number;
    readonly originalAmount: number;
    readonly nextPayment: number;
    readonly nextDue: string;
    readonly repaidPercent: number;
    readonly accruedInterest: number;
    readonly businessId: string | null;
  }[];
  readonly schedule: readonly {
    readonly currencyCode?: string | null;
    readonly cycle: string;
    readonly due: string;
    readonly amount: number;
    readonly status: string;
  }[];
}

export interface PlayerBusinessBankingRepository {
  readEconomicContext?(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<PlayerEconomicContext>;
  readLoans(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<LoansSnapshotDto>;
  execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>>;
}

export class PlayerBusinessBankingError extends PlayerBusinessError {
  constructor(
    code: string,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(code, message, status, retryable);
    this.name = "PlayerBusinessBankingError";
  }
}
