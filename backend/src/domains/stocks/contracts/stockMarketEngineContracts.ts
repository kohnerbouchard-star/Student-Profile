export type StockMarketShockScope = "global" | "country" | "sector" | "ticker";

export type StockMarketRegimeKind =
  | "bull"
  | "bear"
  | "sideways"
  | "crisis"
  | "recovery"
  | "sector_rotation";

export interface StockMarketEngineInput {
  readonly gameSessionId: string;
  readonly seed: string;
  readonly tickIndex: number;
  readonly assets: readonly StockMarketAssetInput[];
  readonly macro: StockMarketMacroInput;
  readonly countries?: readonly StockMarketCountryInput[];
  readonly sectors?: readonly StockMarketSectorInput[];
  readonly shocks?: readonly StockMarketShockInput[];
  readonly regime?: StockMarketRegimeInput;
  readonly settings?: StockMarketEngineSettings;
}

export interface StockMarketAssetInput {
  readonly gameSessionId: string;
  readonly assetId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly currentPrice: number;
  readonly previousClose?: number;
  readonly openPrice?: number;
  readonly dayHigh?: number;
  readonly dayLow?: number;
  readonly sharesOutstanding?: number;
  readonly marketCap?: number;
  readonly beta: number;
  readonly liquidity: number;
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
  readonly fairValueAnchor?: number;
  readonly recentReturns?: readonly number[];
  readonly history?: readonly StockMarketChartPoint[];
  readonly fundamentals?: StockMarketCompanyFundamentalsInput;
  readonly countryExposure?: Readonly<Record<string, number>>;
  readonly sectorExposure?: Readonly<Record<string, number>>;
  readonly commodityExposure?: Readonly<Record<string, number>>;
}

export interface StockMarketCompanyFundamentalsInput {
  readonly revenueGrowth: number;
  readonly profitMargin: number;
  readonly debtLevel: number;
  readonly cashReserves: number;
  readonly innovationScore: number;
  readonly supplyChainRisk: number;
  readonly politicalExposure: number;
  readonly commodityExposure: number;
}

export interface StockMarketMacroInput {
  readonly gameSessionId: string;
  readonly gdpGrowthRate?: number;
  readonly inflationRate?: number;
  readonly unemploymentRate?: number;
  readonly interestRate?: number;
  readonly consumerConfidenceIndex?: number;
  readonly businessConfidenceIndex?: number;
  readonly marketRiskIndex?: number;
  readonly politicalStabilityIndex?: number;
  readonly infrastructureIndex?: number;
  readonly energySecurityIndex?: number;
  readonly globalDemandIndex?: number;
}

export interface StockMarketCountryInput {
  readonly gameSessionId: string;
  readonly countryCode: string;
  readonly gdpGrowthRate?: number;
  readonly inflationRate?: number;
  readonly unemploymentRate?: number;
  readonly interestRate?: number;
  readonly consumerConfidenceIndex?: number;
  readonly businessConfidenceIndex?: number;
  readonly tradeBalanceIndex?: number;
  readonly exportStrengthIndex?: number;
  readonly marketRiskIndex?: number;
  readonly politicalStabilityIndex?: number;
  readonly infrastructureIndex?: number;
  readonly energySecurityIndex?: number;
  readonly supplyConstraintIndex?: number;
  readonly importDependencyIndex?: number;
}

export interface StockMarketSectorInput {
  readonly gameSessionId: string;
  readonly sectorKey: string;
  readonly driftBias?: number;
  readonly volatilityMultiplier?: number;
  readonly volumeMultiplier?: number;
  readonly newsSensitivity?: number;
  readonly demandIndex?: number;
  readonly supplyConstraintIndex?: number;
}

export interface StockMarketShockInput {
  readonly gameSessionId: string;
  readonly shockId: string;
  readonly scope: StockMarketShockScope;
  readonly targetKey?: string;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatilityImpact?: number;
  readonly volumeImpact?: number;
  readonly headline: string;
  readonly explanation: string;
  readonly createdTick: number;
  readonly expiresTick?: number;
}

export interface StockMarketRegimeInput {
  readonly gameSessionId: string;
  readonly regime: StockMarketRegimeKind;
  readonly driftBias: number;
  readonly volatilityMultiplier: number;
  readonly newsSensitivity: number;
  readonly volumeMultiplier: number;
  readonly betaMultiplier?: number;
  readonly sectorRotation?: Readonly<Record<string, number>>;
  readonly studentLabel?: string;
}

export interface StockMarketEngineSettings {
  readonly gameSessionId: string;
  readonly minPrice: number;
  readonly maxTickMovePct: number;
  readonly volatilityMeanReversionRate: number;
  readonly minVolatility: number;
  readonly maxVolatility: number;
  readonly defaultLongRunVolatility: number;
  readonly liquidityDampingStrength: number;
  readonly momentumStrength: number;
  readonly meanReversionStrength: number;
  readonly baseVolume: number;
  readonly maxHistoryPoints: number;
}

export interface StockMarketEngineResult {
  readonly gameSessionId: string;
  readonly seed: string;
  readonly tickIndex: number;
  readonly rows: readonly StockMarketRowOutput[];
  readonly ticks: readonly StockPriceTickOutput[];
  readonly explanations: readonly StockPriceMovementExplanation[];
  readonly generatedAt: string;
}

export interface StockMarketRowOutput {
  readonly gameSessionId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly currentPrice: number;
  readonly changePct: string;
  readonly previousClose: number;
  readonly openPrice: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly volume: number;
  readonly marketCap: number;
  readonly beta: number;
  readonly history: readonly StockMarketChartPoint[];
  readonly lastUpdated: string;
  readonly trend?: "up" | "down" | "flat";
  readonly assetType?: "Stock";
  readonly description?: string;
  readonly notes?: string;
}

export interface StockPriceTickOutput {
  readonly gameSessionId: string;
  readonly tickIndex: number;
  readonly assetId: string;
  readonly ticker: string;
  readonly price: number;
  readonly previousPrice: number;
  readonly logReturn: number;
  readonly changePct: number;
  readonly volume: number;
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
  readonly createdAt: string;
  readonly explanation: StockPriceMovementExplanation;
}

export interface StockMarketChartPoint {
  readonly gameSessionId?: string;
  readonly tickIndex: number;
  readonly timestamp: string;
  readonly label: string;
  readonly price: number;
  readonly volume?: number;
}

export interface StockPriceMovementExplanation {
  readonly gameSessionId: string;
  readonly tickIndex: number;
  readonly ticker: string;
  readonly headline: string;
  readonly summary: string;
  readonly studentText: string;
  readonly components: StockPriceMovementComponentBreakdown;
  readonly appliedShockIds: readonly string[];
  readonly regime: StockMarketRegimeKind;
}

export interface StockPriceMovementComponentBreakdown {
  readonly marketFactorPct: number;
  readonly countryFactorPct: number;
  readonly sectorFactorPct: number;
  readonly fundamentalsFactorPct: number;
  readonly regimeFactorPct: number;
  readonly shockFactorPct: number;
  readonly volatilityNoisePct: number;
  readonly momentumFactorPct: number;
  readonly meanReversionFactorPct: number;
  readonly finalReturnPct: number;
}
