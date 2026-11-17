// Ordered shock selection and accumulation. Do not reorder shocks or exposure records.
import type {
  StockMarketAssetInput, StockMarketEngineInput, StockMarketSectorInput, StockMarketShockInput,
} from "../contracts/stockMarketEngineContracts.ts";
import { normalizeCountryCode } from "./countryExposureProfiles.ts";
import { clampNumber, roundNumber } from "./seededRandom.ts";
import type { ResolvedRegime } from "./stockMarketRegime.ts";
import {
  normalizeSectorKey, normalizeVolatilityImpact, normalizeVolumeImpact, percentMagnitudeToPct,
} from "./stockMarketEngineInput.ts";

interface ShockEffect {
  readonly shockFactorPct: number;
  readonly volatilityImpact: number;
  readonly volumeImpact: number;
  readonly appliedShockIds: readonly string[];
  readonly headlines: readonly string[];
}

export function calculateShockEffect(args: {
  readonly input: StockMarketEngineInput;
  readonly asset: StockMarketAssetInput;
  readonly sectorKey: string;
  readonly countryCode: string;
  readonly regime: ResolvedRegime;
  readonly sector?: StockMarketSectorInput;
}): ShockEffect {
  const appliedShockIds: string[] = [];
  const headlines: string[] = [];
  let shockFactorPct = 0;
  let volatilityImpact = 0;
  let volumeImpact = 0;

  for (const shock of args.input.shocks ?? []) {
    if (!isShockActive(shock, args.input.tickIndex)) {
      continue;
    }

    const exposureWeight = getShockExposureWeight(shock, args);
    if (exposureWeight <= 0) {
      continue;
    }

    const elapsed = Math.max(0, args.input.tickIndex - shock.createdTick);
    const decay = clampNumber(shock.decay, 0, 1);
    const decayWeight = decay === 1
      ? elapsed === 0 ? 1 : 0
      : Math.pow(1 - decay, elapsed);
    const confidence = clampNumber(shock.confidence, 0, 1);
    const sectorNewsSensitivity = args.sector?.newsSensitivity ?? 1;
    const sensitivity = args.regime.newsSensitivity * sectorNewsSensitivity;
    const weight = exposureWeight * decayWeight * confidence * sensitivity;

    shockFactorPct += percentMagnitudeToPct(shock.magnitude) * weight;
    volatilityImpact += normalizeVolatilityImpact(shock.volatilityImpact) *
      weight;
    volumeImpact += normalizeVolumeImpact(shock.volumeImpact) * weight;
    appliedShockIds.push(shock.shockId);
    headlines.push(shock.headline);
  }

  return {
    shockFactorPct: roundNumber(shockFactorPct, 6),
    volatilityImpact: roundNumber(volatilityImpact, 6),
    volumeImpact: roundNumber(volumeImpact, 6),
    appliedShockIds,
    headlines,
  };
}

function isShockActive(
  shock: StockMarketShockInput,
  tickIndex: number,
): boolean {
  return tickIndex >= shock.createdTick &&
    (shock.expiresTick === undefined || tickIndex <= shock.expiresTick);
}

function getShockExposureWeight(
  shock: StockMarketShockInput,
  args: {
    readonly asset: StockMarketAssetInput;
    readonly sectorKey: string;
    readonly countryCode: string;
  },
): number {
  switch (shock.scope) {
    case "global":
      return 1;
    case "ticker":
      return normalizeTicker(shock.targetKey ?? "") ===
          normalizeTicker(args.asset.ticker)
        ? 1
        : 0;
    case "country": {
      const targetCountryCode = normalizeCountryCode(shock.targetKey ?? "");
      if (targetCountryCode === args.countryCode) {
        return 1;
      }
      return getRecordExposureWeight(
        args.asset.countryExposure,
        targetCountryCode,
        normalizeCountryCode,
      );
    }
    case "sector": {
      const targetSectorKey = normalizeSectorKey(shock.targetKey ?? "");
      if (targetSectorKey === args.sectorKey) {
        return 1;
      }
      return getRecordExposureWeight(
        args.asset.sectorExposure,
        targetSectorKey,
        normalizeSectorKey,
      );
    }
  }
}

function getRecordExposureWeight(
  record: Readonly<Record<string, number>> | undefined,
  targetKey: string,
  normalize: (value: string) => string,
): number {
  if (!record || !targetKey) {
    return 0;
  }

  for (const [key, value] of Object.entries(record)) {
    if (normalize(key) === targetKey) {
      return clampNumber(Math.abs(value), 0, 1);
    }
  }

  return 0;
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}
