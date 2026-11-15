import {
  ECONOMIC_DOMAINS,
  type EconomicDomain,
  type EconomicPlayerState,
} from "./economicSimulationContracts.ts";

export interface MutablePlayerState {
  playerPublicId: string;
  countryCode: string;
  strategyPublicId: string;
  cashMinor: number;
  debtMinor: number;
  inventoryValueMinor: number;
  businessValueMinor: number;
  portfolioValueMinor: number;
  experience: number;
  reputation: number;
  completedActions: Record<EconomicDomain, number>;
  insolvent: boolean;
  recoveredFromInsolvency: boolean;
}

export interface PhaseModifiers {
  readonly income: number;
  readonly cost: number;
  readonly scarcity: number;
  readonly marketVolatility: number;
}

export const PHASE_MODIFIERS: Readonly<Record<string, PhaseModifiers>> = {
  peace: { income: 1, cost: 1, scarcity: 1, marketVolatility: 1 },
  shortage: { income: 0.92, cost: 1.25, scarcity: 1.3, marketVolatility: 1.2 },
  war: { income: 0.78, cost: 1.55, scarcity: 1.65, marketVolatility: 1.65 },
  reconstruction: {
    income: 1.12,
    cost: 1.15,
    scarcity: 1.1,
    marketVolatility: 1.35,
  },
};

export function incrementAction(
  player: MutablePlayerState,
  aggregate: Record<EconomicDomain, number>,
  domain: EconomicDomain,
): void {
  player.completedActions[domain] += 1;
  aggregate[domain] += 1;
}

export function emptyActionCounts(): Record<EconomicDomain, number> {
  return Object.fromEntries(
    ECONOMIC_DOMAINS.map((domain) => [domain, 0]),
  ) as Record<
    EconomicDomain,
    number
  >;
}

export function sortActionCounts(
  values: Readonly<Record<EconomicDomain, number>>,
): Readonly<Record<EconomicDomain, number>> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<EconomicDomain, number>>;
}

export function toImmutablePlayer(player: MutablePlayerState): EconomicPlayerState {
  return {
    ...player,
    completedActions: sortActionCounts(player.completedActions),
  };
}

export function netWealthMinor(
  player: EconomicPlayerState | MutablePlayerState,
): number {
  return player.cashMinor + player.inventoryValueMinor +
    player.businessValueMinor +
    player.portfolioValueMinor - player.debtMinor;
}

export function createDeterministicRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

export function boundedRound(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new Error("simulation_numeric_overflow");
  }
  return Math.round(value);
}

export function requireValue<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode);
  return value;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const midpoint = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? Math.round((values[midpoint - 1] + values[midpoint]) / 2)
    : values[midpoint];
}

export function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
