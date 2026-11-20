// Regime defaults and override resolution, without tick execution or persistence.
import type { StockMarketRegimeInput, StockMarketRegimeKind } from "../contracts/stockMarketEngineContracts.ts";
import { normalizeSectorKey } from "./stockMarketEngineInput.ts";

export interface ResolvedRegime {
  readonly regime: StockMarketRegimeKind;
  readonly driftBias: number;
  readonly volatilityMultiplier: number;
  readonly newsSensitivity: number;
  readonly volumeMultiplier: number;
  readonly betaMultiplier: number;
  readonly sectorRotation: Readonly<Record<string, number>>;
  readonly studentLabel: string;
}

export function resolveRegime(regime?: StockMarketRegimeInput): ResolvedRegime {
  const defaults = getRegimeDefaults(regime?.regime ?? "sideways");

  if (!regime) {
    return defaults;
  }

  return {
    regime: regime.regime,
    driftBias: regime.driftBias,
    volatilityMultiplier: regime.volatilityMultiplier,
    newsSensitivity: regime.newsSensitivity,
    volumeMultiplier: regime.volumeMultiplier,
    betaMultiplier: regime.betaMultiplier ?? defaults.betaMultiplier,
    sectorRotation: normalizeRecordKeys(regime.sectorRotation ?? {}),
    studentLabel: regime.studentLabel ?? defaults.studentLabel,
  };
}

function getRegimeDefaults(regime: StockMarketRegimeKind): ResolvedRegime {
  switch (regime) {
    case "bull":
      return {
        regime,
        driftBias: 0.4,
        volatilityMultiplier: 0.95,
        newsSensitivity: 1.05,
        volumeMultiplier: 1.1,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "bull market",
      };
    case "bear":
      return {
        regime,
        driftBias: -0.5,
        volatilityMultiplier: 1.25,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "bear market",
      };
    case "crisis":
      return {
        regime,
        driftBias: -1.2,
        volatilityMultiplier: 2,
        newsSensitivity: 1.6,
        volumeMultiplier: 2,
        betaMultiplier: 1.3,
        sectorRotation: {},
        studentLabel: "crisis market",
      };
    case "recovery":
      return {
        regime,
        driftBias: 0.7,
        volatilityMultiplier: 1.2,
        newsSensitivity: 1.2,
        volumeMultiplier: 1.3,
        betaMultiplier: 1.1,
        sectorRotation: {},
        studentLabel: "recovery market",
      };
    case "sector_rotation":
      return {
        regime,
        driftBias: 0.1,
        volatilityMultiplier: 1.1,
        newsSensitivity: 1.25,
        volumeMultiplier: 1.2,
        betaMultiplier: 1,
        sectorRotation: {},
        studentLabel: "sector rotation market",
      };
    case "sideways":
      return {
        regime,
        driftBias: 0,
        volatilityMultiplier: 0.85,
        newsSensitivity: 1,
        volumeMultiplier: 0.9,
        betaMultiplier: 1,
        sectorRotation: {},
        studentLabel: "sideways market",
      };
  }
}

function normalizeRecordKeys(
  record: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeSectorKey(key), value]),
  );
}
