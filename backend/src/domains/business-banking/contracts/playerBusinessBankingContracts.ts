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

export type DelegatedPlayerBusinessRoute = Exclude<
  PlayerBusinessRoute,
  | { readonly kind: "businessManufacturingCollection" }
  | { readonly kind: "businessManufacturingCancel" }
  | { readonly kind: "businessTreasuryRead" }
  | { readonly kind: "businessTreasuryAccountOpen" }
  | { readonly kind: "businessTreasuryFxQuote" }
  | { readonly kind: "businessTreasuryFxStandard" }
  | { readonly kind: "businessTreasuryFxInstant" }
  | { readonly kind: "businessTreasuryFxCancel" }
  | { readonly kind: "businessStoreWithdrawal" }
>;

export type PlayerBusinessBankingRoute =
  | DelegatedPlayerBusinessRoute
  | PlayerBankingRoute;

export interface LoansSnapshotDto {
  readonly configured: boolean;
  readonly creditScore: number;
  readonly availableCredit: number;
  readonly outstanding: number;
  readonly nextPayment: { readonly amount: number; readonly due: string };
  readonly onTimeRate: number;
  readonly paymentsMade: number;
  readonly offers: readonly {
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
