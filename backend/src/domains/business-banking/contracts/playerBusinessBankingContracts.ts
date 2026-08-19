import {
  PlayerBusinessError,
  type PlayerBusinessRepository,
  type PlayerBusinessRoute,
} from "../../business/contracts/playerBusinessContracts.ts";

export type {
  BusinessCompanyDto,
  BusinessProductDto,
  BusinessSnapshotDto,
  PlayerEconomicContext,
} from "../../business/contracts/playerBusinessContracts.ts";

export type PlayerBusinessBankingRoute = PlayerBusinessRoute |
  { readonly kind: "playerTransfer" } |
  { readonly kind: "savingsTransfer" } |
  { readonly kind: "loansRead" } |
  { readonly kind: "loanApply"; readonly offerKey: string } |
  { readonly kind: "loanRepay"; readonly loanKey: string };

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

export interface PlayerBusinessBankingRepository extends PlayerBusinessRepository {
  readLoans(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<LoansSnapshotDto>;
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
