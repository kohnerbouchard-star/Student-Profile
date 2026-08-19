export type PlayerBusinessRoute =
  | { readonly kind: "businessRead"; readonly resource?: "overview" | "stockroom" }
  | { readonly kind: "businessCreate"; readonly operation: "directCreate" }
  | { readonly kind: "businessCreate"; readonly operation: "formationPropose" }
  | {
    readonly kind: "businessCreate";
    readonly operation: "formationRespond";
    readonly formationKey: string;
  }
  | {
    readonly kind: "businessCreate";
    readonly operation: "formationActivate";
    readonly formationKey: string;
  }
  | { readonly kind: "businessProductCreate" }
  | { readonly kind: "businessInputPurchase" }
  | { readonly kind: "businessProduction" }
  | { readonly kind: "businessPrice"; readonly productKey: string }
  | { readonly kind: "businessHire" }
  | { readonly kind: "businessTerminate"; readonly employeeKey: string }
  | { readonly kind: "businessStatus" };

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

export interface BusinessStockroomItemDto {
  readonly itemKey: string;
  readonly canonicalKey: string;
  readonly name: string;
  readonly itemClass: string;
  readonly subtype: string;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly quantityAvailable: number;
  readonly averageUnitCost: number;
  readonly costCurrencyCode: string | null;
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
  readonly compliance?: readonly {
    readonly requirement: string;
    readonly status: string;
    readonly fee: number;
    readonly expiresAt: string | null;
  }[];
}

export interface PlayerBusinessRepository {
  readEconomicContext?(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<PlayerEconomicContext>;
  assertBusinessCreationAllowed?(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
  readBusiness(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
  }): Promise<BusinessSnapshotDto>;
  execute(command: string, args: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>>;
}

export class PlayerBusinessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PlayerBusinessError";
  }
}

const BUSINESS_ROUTE_KINDS = new Set<PlayerBusinessRoute["kind"]>([
  "businessRead",
  "businessCreate",
  "businessProductCreate",
  "businessInputPurchase",
  "businessProduction",
  "businessPrice",
  "businessHire",
  "businessTerminate",
  "businessStatus",
]);

export function isPlayerBusinessRoute(
  route: { readonly kind: string },
): route is PlayerBusinessRoute {
  return BUSINESS_ROUTE_KINDS.has(route.kind as PlayerBusinessRoute["kind"]);
}
