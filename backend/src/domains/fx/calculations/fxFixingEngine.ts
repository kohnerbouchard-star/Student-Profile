import type {
  FxFixingCurrencyValue,
  FxFixingEngineInput,
  FxFixingEngineResult,
} from "../contracts/fxFixingContracts.ts";
import { normalizeInput } from "./fxFixingNormalization.ts";
import {
  applyBasisPointMovement,
  calculateComponents,
  calculateMedians,
  formatDecimal,
  groupStoryShocks,
  numeraireValue,
} from "./fxFixingMath.ts";

export function calculateFxFixing(
  input: FxFixingEngineInput,
): FxFixingEngineResult {
  const normalized = normalizeInput(input);
  const medians = calculateMedians(normalized.currencies);
  const shocksByCurrency = groupStoryShocks(normalized.storyShocks);

  const values: FxFixingCurrencyValue[] = [numeraireValue()];
  for (const currency of normalized.currencies) {
    const shocks = shocksByCurrency.get(currency.source.currencyCode) ?? [];
    const components = calculateComponents(
      currency,
      medians,
      shocks,
      normalized.policy,
    );
    const unitsPerEco = applyBasisPointMovement(
      currency.previousUnitsPerEco,
      components.finalBasisPoints,
    );

    values.push({
      currencyCode: currency.source.currencyCode,
      countryCode: currency.source.countryCode,
      snapshotId: currency.source.snapshotId,
      snapshotSequence: currency.source.snapshotSequence,
      previousUnitsPerEco: formatDecimal(currency.previousUnitsPerEco),
      unitsPerEco: formatDecimal(unitsPerEco),
      components,
      appliedStoryShockIds: shocks.map((shock) => shock.shockId),
    });
  }

  return {
    gameSessionId: normalized.gameSessionId,
    fixingLocalDate: normalized.fixingLocalDate,
    policyVersion: normalized.policyVersion,
    canonicalInputJson: normalized.canonicalInputJson,
    values,
  };
}

/** Returns the stable, validated input representation that the runtime hashes. */
export function canonicalizeFxFixingInput(input: FxFixingEngineInput): string {
  return normalizeInput(input).canonicalInputJson;
}

export { FX_FIXING_ZERO_DECIMAL } from "./fxFixingMath.ts";
