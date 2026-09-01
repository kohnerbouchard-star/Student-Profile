import type {
  BusinessFundingQuoteV1,
  BusinessFundingReceiptV1,
  BusinessMoneyV1,
} from "./businessTreasuryContracts.ts";

export type PlayerBusinessRoute =
  | {
    readonly kind: "businessRead";
    readonly resource?:
      | "overview"
      | "stockroom"
      | "recipes"
      | "workforceCandidates";
  }
  | { readonly kind: "businessTreasuryRead" }
  | { readonly kind: "businessTreasuryAccountOpen" }
  | { readonly kind: "businessTreasuryFxQuote" }
  | { readonly kind: "businessTreasuryFxStandard" }
  | { readonly kind: "businessTreasuryFxInstant" }
  | {
    readonly kind: "businessTreasuryFxCancel";
    readonly orderKey: string;
  }
  | {
    readonly kind: "businessManufacturingCollection";
    readonly businessKey: string;
  }
  | {
    readonly kind: "businessManufacturingCancel";
    readonly businessKey: string;
    readonly jobKey: string;
  }
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
  | { readonly kind: "businessStoreQuote" }
  | { readonly kind: "businessStorePurchase" }
  | { readonly kind: "businessCandidateHire"; readonly candidateKey: string }
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
  readonly cash: number;
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
  readonly icon: string;
  readonly version: number;
}

export interface BusinessStoreSaleDto {
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly offerKey: string;
  readonly itemKey: string;
  readonly quantity: number;
  readonly grossRevenue: number;
  readonly costOfGoodsSold: number;
  readonly grossMargin: number;
  readonly currencyCode: string;
  readonly completedAt: string;
}

export interface BusinessStoreSaleActivityDto {
  readonly activityKey: string;
  readonly eventType: "business.store.sale.completed";
  readonly reasonCode: "business_store_offer_purchase";
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly offerKey: string;
  readonly quantity: number;
  readonly grossRevenue: number;
  readonly costOfGoodsSold: number;
  readonly grossMargin: number;
  readonly currencyCode: string;
  readonly occurredAt: string;
}

export interface BusinessStoreSalesSnapshotDto {
  readonly businessKey: string;
  readonly currencyCode: string;
  readonly recentReceiptCount: number;
  readonly recentQuantitySold: number;
  readonly recentGrossRevenue: number;
  readonly recentCostOfGoodsSold: number;
  readonly recentGrossMargin: number;
  readonly sales: readonly BusinessStoreSaleDto[];
  readonly activity: readonly BusinessStoreSaleActivityDto[];
}

export const BUSINESS_STOCKROOM_LOCATION_KEYS = [
  "warehouse",
  "work_in_progress",
  "finished_goods",
  "in_transit",
] as const;

export type BusinessStockroomLocationKey =
  typeof BUSINESS_STOCKROOM_LOCATION_KEYS[number];

export interface BusinessStockroomLocationDto {
  readonly accountKey: string;
  readonly locationKey: BusinessStockroomLocationKey;
  readonly label: string;
  readonly itemCount: number;
  readonly quantityOwned: number;
  readonly quantityReserved: number;
  readonly quantityAvailable: number;
}

export interface BusinessStockroomItemDto {
  readonly accountKey: string;
  readonly locationKey: BusinessStockroomLocationKey;
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

export interface BusinessStockroomSnapshotDto {
  readonly businessKey: string;
  readonly locations: readonly BusinessStockroomLocationDto[];
  readonly items: readonly BusinessStockroomItemDto[];
}

export interface BusinessRecipeAccessDto {
  readonly accessKey: string;
  readonly recipeKey: string;
  readonly name: string;
  readonly category: string;
  readonly tier: number;
  readonly workshopTier: number;
  readonly baseDurationSeconds: number;
  readonly difficultyProfile: string;
  readonly description: string;
  readonly availability: {
    readonly enabled: boolean;
    readonly availableInBusinessCountry: boolean;
    readonly availableNow: boolean;
    readonly scarcityBand: string;
    readonly eventDurationMultiplier: number;
    readonly routeDisruptionMultiplier: number;
  };
  readonly sourceType: string;
  readonly grantedAt: string;
}

export interface BusinessStoreQuoteDto {
  readonly businessKey: string;
  readonly quoteKey: string;
  readonly itemKey: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly countryCode: string;
  readonly itemCurrencyCode: string;
  readonly settlementCurrencyCode: string;
  readonly baseUnitPrice: number;
  readonly baseUnitPriceMoney: BusinessMoneyV1;
  readonly inflationMultiplier: number;
  readonly locationMultiplier: number;
  readonly scarcityMultiplier: number;
  readonly itemLocalFinalUnitPrice: number;
  readonly itemLocalFinalTotalPrice: number;
  readonly itemLocalFinalUnit: BusinessMoneyV1;
  readonly itemLocalFinalTotal: BusinessMoneyV1;
  readonly exchangeRate: number;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly finalUnit: BusinessMoneyV1;
  readonly finalTotal: BusinessMoneyV1;
  readonly pricingVersion: string;
  readonly expiresAt: string;
  readonly replayed: boolean;
  readonly fundingTargetAccountKey: string;
  readonly fundingQuote: BusinessFundingQuoteV1;
}

export interface BusinessStoreReceiptDto {
  readonly businessKey: string;
  readonly receiptKey: string;
  readonly quoteKey: string;
  readonly itemKey: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly finalUnitPrice: number;
  readonly finalTotalPrice: number;
  readonly finalUnit: BusinessMoneyV1;
  readonly finalTotal: BusinessMoneyV1;
  readonly currencyCode: string;
  readonly warehouseQuantityOwned: number;
  readonly warehouseAverageUnitCost: number;
  readonly warehouseAverageUnitCostMoney: BusinessMoneyV1;
  readonly completedAt: string;
  readonly alreadyCompleted: boolean;
  readonly fundingReceipt: BusinessFundingReceiptV1;
}

export interface BusinessWorkforceCandidateDto {
  readonly candidateKey: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly laborClass: string;
  readonly displayLabel: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly wagePerCycle: number;
  readonly laborMinutesPerCycle: number;
  readonly skillBasisPoints: number;
  readonly productivityIndex: number;
  readonly contractType: string;
  readonly availabilityEndsAt: string | null;
  readonly version: number;
}

export interface BusinessWorkforceSnapshotDto {
  readonly businessKey: string;
  readonly generatedAt: string;
  readonly candidates: readonly BusinessWorkforceCandidateDto[];
}

export interface BusinessWorkforcePayrollDto {
  readonly payrollRunKey: string | null;
  readonly periodKey: string | null;
  readonly status: string;
  readonly employeeCount: number;
  readonly wageDue: number;
  readonly wagePaid: number;
  readonly wageUnpaid: number;
  readonly currencyCode: string;
  readonly completedAt: string | null;
}

export interface BusinessWorkforceUtilizationEmployeeDto {
  readonly employeeKey: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly status: string;
  readonly workforceSource: string;
  readonly capacityMinutes: number;
  readonly reservedMinutes: number;
  readonly consumedMinutes: number;
  readonly utilizedMinutes: number;
  readonly availableMinutes: number;
  readonly idleMinutes: number;
  readonly utilizationBasisPoints: number;
  readonly latestPayrollStatus: string;
  readonly wageDue: number;
  readonly wagePaid: number;
  readonly wageUnpaid: number;
  readonly currencyCode: string;
}

export interface BusinessWorkforceUtilizationDto {
  readonly businessKey: string;
  readonly payrollPeriodKey: string;
  readonly generatedAt: string;
  readonly payroll: BusinessWorkforcePayrollDto;
  readonly employees: readonly BusinessWorkforceUtilizationEmployeeDto[];
}

export interface BusinessCandidateHireReceiptDto {
  readonly businessKey: string;
  readonly employeeKey: string;
  readonly candidateKey: string;
  readonly roleKey: string;
  readonly roleName: string;
  readonly contractType: string;
  readonly wagePerCycle: number;
  readonly currencyCode: string;
  readonly laborMinutesPerCycle: number;
  readonly skillBasisPoints: number;
  readonly productivityIndex: number;
  readonly status: string;
  readonly hiredAt: string;
  readonly replayed: boolean;
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
  readonly storeSales: BusinessStoreSalesSnapshotDto;
  readonly workforceUtilization: BusinessWorkforceUtilizationDto | null;
  readonly compliance?: readonly {
    readonly requirement: string;
    readonly status: string;
    readonly fee: number;
    readonly expiresAt: string | null;
  }[];
}

export interface PlayerBusinessRepository {
  readEconomicContext?(
    input: { readonly gameSessionId: string; readonly playerId: string },
  ): Promise<PlayerEconomicContext>;
  assertBusinessCreationAllowed?(
    input: {
      readonly gameSessionId: string;
      readonly playerId: string;
      readonly idempotencyKey: string;
    },
  ): Promise<void>;
  readBusiness(
    input: { readonly gameSessionId: string; readonly playerId: string },
  ): Promise<BusinessSnapshotDto>;
  readWorkforceCandidates?(
    input: { readonly gameSessionId: string; readonly playerId: string },
  ): Promise<BusinessWorkforceSnapshotDto>;
  execute(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>>;
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
  "businessTreasuryRead",
  "businessTreasuryAccountOpen",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
  "businessTreasuryFxInstant",
  "businessTreasuryFxCancel",
  "businessManufacturingCollection",
  "businessManufacturingCancel",
  "businessCreate",
  "businessStoreQuote",
  "businessStorePurchase",
  "businessCandidateHire",
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
