export const ECONOMIC_PHASES = [
  "peace",
  "shortage",
  "war",
  "reconstruction",
] as const;

export type EconomicPhase = typeof ECONOMIC_PHASES[number];

export const ECONOMIC_DOMAINS = [
  "attendance",
  "contracts",
  "store",
  "banking",
  "business",
  "crafting",
  "marketplace",
  "progression",
  "financial_markets",
] as const;

export type EconomicDomain = typeof ECONOMIC_DOMAINS[number];

export interface CountryEconomyProfile {
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly incomeModifier: number;
  readonly costModifier: number;
  readonly scarcityModifier: number;
  readonly creditModifier: number;
  readonly marketVolatilityModifier: number;
}

export interface PlayerStrategyProfile {
  readonly strategyPublicId: string;
  readonly contractWeight: number;
  readonly businessWeight: number;
  readonly craftingWeight: number;
  readonly marketplaceWeight: number;
  readonly financialMarketWeight: number;
  readonly savingWeight: number;
  readonly riskTolerance: number;
}

export interface EconomicSimulationConfig {
  readonly simulationPublicId: string;
  readonly deterministicSeed: number;
  readonly playerCount: 30 | 40;
  readonly ticksPerPhase: number;
  readonly countries: readonly CountryEconomyProfile[];
  readonly strategies: readonly PlayerStrategyProfile[];
  readonly startingCashMinor: number;
  readonly subsistenceCostMinor: number;
  readonly insolvencyThresholdMinor: number;
  readonly maximumDominantPathShare: number;
  readonly maximumCountryWealthRatio: number;
  readonly minimumRecoveryRate: number;
}

export interface EconomicPlayerState {
  readonly playerPublicId: string;
  readonly countryCode: string;
  readonly strategyPublicId: string;
  readonly cashMinor: number;
  readonly debtMinor: number;
  readonly inventoryValueMinor: number;
  readonly businessValueMinor: number;
  readonly portfolioValueMinor: number;
  readonly experience: number;
  readonly reputation: number;
  readonly completedActions: Readonly<Record<EconomicDomain, number>>;
  readonly insolvent: boolean;
  readonly recoveredFromInsolvency: boolean;
}

export interface EconomicSimulationPhaseResult {
  readonly phase: EconomicPhase;
  readonly endingPlayers: readonly EconomicPlayerState[];
  readonly totalWealthMinor: number;
  readonly medianWealthMinor: number;
  readonly insolventPlayerCount: number;
  readonly recoveredPlayerCount: number;
  readonly actionCounts: Readonly<Record<EconomicDomain, number>>;
}

export interface EconomicBalanceFinding {
  readonly code: string;
  readonly severity: "info" | "warning" | "critical";
  readonly message: string;
  readonly observedValue: number;
  readonly threshold: number;
}

export interface EconomicSimulationReport {
  readonly simulationPublicId: string;
  readonly deterministicSeed: number;
  readonly playerCount: 30 | 40;
  readonly phaseResults: readonly EconomicSimulationPhaseResult[];
  readonly finalPlayers: readonly EconomicPlayerState[];
  readonly dominantPathShare: number;
  readonly richestToPoorestCountryRatio: number;
  readonly insolvencyRecoveryRate: number;
  readonly giniCoefficient: number;
  readonly findings: readonly EconomicBalanceFinding[];
  readonly seedCatalogsModified: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}
