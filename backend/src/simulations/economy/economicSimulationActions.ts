import type {
  CountryEconomyProfile,
  EconomicDomain,
  PlayerStrategyProfile,
} from "./economicSimulationContracts.ts";
import type { MutablePlayerState, PhaseModifiers } from "./economicSimulationState.ts";
import { incrementAction, boundedRound } from "./economicSimulationState.ts";

export function applyStrategicAction(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  strategy: PlayerStrategyProfile,
  phase: PhaseModifiers,
  random: () => number,
  aggregateActions: Record<EconomicDomain, number>,
): void {
  const action = selectWeightedAction(strategy, random());
  switch (action) {
    case "contracts":
      performContract(player, country, phase, random);
      break;
    case "business":
      performBusiness(player, country, phase, strategy, random);
      break;
    case "crafting":
      performCrafting(player, country, phase, random);
      break;
    case "marketplace":
      performMarketplace(player, country, phase, random);
      break;
    case "financial_markets":
      performFinancialMarketAction(player, country, phase, strategy, random);
      break;
    case "banking":
      performSavingAction(player, strategy);
      break;
  }
  incrementAction(player, aggregateActions, action);
  incrementAction(player, aggregateActions, "progression");
  player.experience += 8 + Math.floor(random() * 8);
  player.reputation += random() > 0.08 ? 1 : 0;
}

function performContract(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  const outcome = 0.78 + random() * 0.5;
  player.cashMinor += boundedRound(
    700 * country.incomeModifier * phase.income * outcome,
  );
}

function performBusiness(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  strategy: PlayerStrategyProfile,
  random: () => number,
): void {
  const investment = Math.min(player.cashMinor, 450);
  if (investment <= 0) return;
  player.cashMinor -= investment;
  player.businessValueMinor += investment;
  const failureProbability = Math.min(
    0.55,
    0.08 + (1 - country.creditModifier) * 0.18 +
      (phase.cost - 1) * 0.16 + strategy.riskTolerance * 0.04,
  );
  if (random() < failureProbability) {
    const impairment = boundedRound(
      player.businessValueMinor * (0.08 + random() * 0.18),
    );
    player.businessValueMinor = Math.max(
      0,
      player.businessValueMinor - impairment,
    );
    return;
  }
  player.cashMinor += boundedRound(
    investment * (0.1 + random() * 0.22) * country.incomeModifier,
  );
}

function performCrafting(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  const inputCost = boundedRound(
    260 * country.costModifier * phase.cost * country.scarcityModifier *
      phase.scarcity,
  );
  if (player.cashMinor < inputCost) return;
  player.cashMinor -= inputCost;
  const quality = 0.92 + random() * 0.38;
  player.inventoryValueMinor += boundedRound(inputCost * quality);
}

function performMarketplace(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  random: () => number,
): void {
  if (player.inventoryValueMinor > 0) {
    const soldValue = Math.max(
      1,
      boundedRound(player.inventoryValueMinor * 0.3),
    );
    player.inventoryValueMinor -= soldValue;
    const scarcityPremium = Math.min(
      0.45,
      (country.scarcityModifier * phase.scarcity - 1) * 0.18,
    );
    player.cashMinor += boundedRound(
      soldValue * (0.94 + scarcityPremium + random() * 0.16),
    );
    return;
  }
  const purchase = Math.min(player.cashMinor, 220);
  if (purchase <= 0) return;
  player.cashMinor -= purchase;
  player.inventoryValueMinor += boundedRound(
    purchase * (0.9 + random() * 0.12),
  );
}

function performFinancialMarketAction(
  player: MutablePlayerState,
  country: CountryEconomyProfile,
  phase: PhaseModifiers,
  strategy: PlayerStrategyProfile,
  random: () => number,
): void {
  const contribution = Math.min(player.cashMinor, 400);
  if (contribution > 0) {
    player.cashMinor -= contribution;
    player.portfolioValueMinor += contribution;
  }
  if (player.portfolioValueMinor <= 0) return;
  const shockScale = 0.035 * country.marketVolatilityModifier *
    phase.marketVolatility * (0.5 + strategy.riskTolerance);
  const returnRate = (random() - 0.47) * shockScale;
  player.portfolioValueMinor = Math.max(
    0,
    boundedRound(player.portfolioValueMinor * (1 + returnRate)),
  );
}

function performSavingAction(
  player: MutablePlayerState,
  strategy: PlayerStrategyProfile,
): void {
  if (player.debtMinor > 0) {
    const payment = Math.min(
      player.cashMinor,
      player.debtMinor,
      boundedRound(300 + strategy.savingWeight * 200),
    );
    player.cashMinor -= payment;
    player.debtMinor -= payment;
    return;
  }
  player.cashMinor += boundedRound(player.cashMinor * 0.0005);
}

function selectWeightedAction(
  strategy: PlayerStrategyProfile,
  draw: number,
):
  | "contracts"
  | "business"
  | "crafting"
  | "marketplace"
  | "financial_markets"
  | "banking" {
  const choices = [
    ["contracts", strategy.contractWeight],
    ["business", strategy.businessWeight],
    ["crafting", strategy.craftingWeight],
    ["marketplace", strategy.marketplaceWeight],
    ["financial_markets", strategy.financialMarketWeight],
    ["banking", strategy.savingWeight],
  ] as const;
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = draw * total;
  for (const [choice, weight] of choices) {
    cursor -= weight;
    if (cursor < 0) return choice;
  }
  return "banking";
}
