export type PlayerBusinessBankingRoute =
  | { readonly kind: "businessRead" }
  | { readonly kind: "businessCreate" }
  | { readonly kind: "businessProductCreate" }
  | { readonly kind: "businessInputPurchase" }
  | { readonly kind: "businessProduction" }
  | { readonly kind: "businessPrice"; readonly productKey: string }
  | { readonly kind: "businessHire" }
  | { readonly kind: "businessTerminate"; readonly employeeKey: string }
  | { readonly kind: "businessStatus" }
  | { readonly kind: "playerTransfer" }
  | { readonly kind: "savingsTransfer" }
  | { readonly kind: "loansRead" }
  | { readonly kind: "loanApply"; readonly offerKey: string }
  | { readonly kind: "loanRepay"; readonly loanKey: string };

export interface PlayerEconomicContext {
  readonly countryCode: string;
  readonly currencyCode: string;
}

export interface BusinessCompanyDto {
  readonly id: string;
  readonly name: string;
  readonly registration: string;
  readonly status: string;
  readonly industry: string;
  readonly headquarters: string;
  readonly valuation: number;
  readonly valuationChange: number;
  readonly cash: number;
  readonly revenue: number;
  readonly margin: number;
  readonly reputation: number;
  readonly reputationLabel: string;
  readonly summary: string;
}

export interface BusinessProductDto {
  readonly id: string;
  readonly category: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly margin: number;
  readonly demand: string;
  readonly icon: string;
  readonly version: number;
}

export interface BusinessSnapshotDto {
  readonly configured: boolean;
  readonly company: BusinessCompanyDto;
  readonly operations: {
    readonly employees: number;
    readonly output: number;
    readonly backlog: number;
    readonly capacityUse: number;
    readonly maxRun: number;
    readonly capacityNote: string;
  };
  readonly products: readonly BusinessProductDto[];
  readonly suppliers: readonly unknown[];
  readonly employees: readonly {
    readonly id: string;
    readonly role: string;
    readonly contractType: string;
    readonly wage: number;
    readonly productivity: number;
    readonly status: string;
  }[];
  readonly inventory: readonly {
    readonly itemKey: string;
    readonly kind: string;
    readonly quantity: number;
    readonly unitCost: number;
  }[];
  readonly compliance: readonly {
    readonly requirement: string;
    readonly status: string;
    readonly fee: number;
    readonly expiresAt: string | null;
  }[];
}

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
  readEconomicContext(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<PlayerEconomicContext>;
  readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto>;
  readLoans(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<LoansSnapshotDto>;
  execute(command: string, args: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>;
}

export class PlayerBusinessBankingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PlayerBusinessBankingError";
  }
}
