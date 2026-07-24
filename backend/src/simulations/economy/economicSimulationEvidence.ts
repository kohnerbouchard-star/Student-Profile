import type {
  EconomicSimulationConfig,
  EconomicSimulationReport,
} from "./economicSimulationContracts.ts";

export interface EconomicSimulationOperationBudget {
  readonly playerCount: 30 | 40;
  readonly ticksPerPhase: number;
  readonly phaseCount: 4;
  readonly estimatedOperations: number;
  readonly maximumOperations: number;
  readonly utilizationRatio: number;
  readonly withinBudget: boolean;
  readonly deterministic: true;
}

export interface SerializedEconomicSimulationEvidence {
  readonly canonicalJson: string;
  readonly deterministicChecksum: string;
  readonly byteLength: number;
  readonly deterministic: true;
}

export function calculateEconomicSimulationOperationBudget(
  config: EconomicSimulationConfig,
  maximumOperations: number,
): EconomicSimulationOperationBudget {
  if (!Number.isInteger(maximumOperations) || maximumOperations <= 0) {
    throw new Error("simulation_operation_budget_invalid");
  }
  const phaseCount = 4 as const;
  const playerTickOperations = 28;
  const phaseAggregationOperations = config.playerCount * 9 + 200;
  const finalAggregationOperations = config.playerCount * 16 + 500;
  const estimatedOperations = config.playerCount * config.ticksPerPhase *
      phaseCount * playerTickOperations +
    phaseCount * phaseAggregationOperations + finalAggregationOperations;
  const utilizationRatio = estimatedOperations / maximumOperations;

  return {
    playerCount: config.playerCount,
    ticksPerPhase: config.ticksPerPhase,
    phaseCount,
    estimatedOperations,
    maximumOperations,
    utilizationRatio: round(utilizationRatio),
    withinBudget: estimatedOperations <= maximumOperations,
    deterministic: true,
  };
}

export function assertEconomicSimulationOperationBudget(
  budget: EconomicSimulationOperationBudget,
  maximumBaselineRegression: number,
  baselineOperations: number,
): void {
  if (
    !Number.isFinite(maximumBaselineRegression) ||
    maximumBaselineRegression < 0 ||
    maximumBaselineRegression > 1
  ) {
    throw new Error("simulation_baseline_regression_threshold_invalid");
  }
  if (!Number.isInteger(baselineOperations) || baselineOperations <= 0) {
    throw new Error("simulation_baseline_operations_invalid");
  }
  if (!budget.withinBudget) {
    throw new Error("simulation_operation_budget_exceeded");
  }
  const regression = (budget.estimatedOperations - baselineOperations) /
    baselineOperations;
  if (regression > maximumBaselineRegression) {
    throw new Error("simulation_operation_baseline_regression_exceeded");
  }
}

export function serializeEconomicSimulationEvidence(
  report: EconomicSimulationReport,
): SerializedEconomicSimulationEvidence {
  if (report.seedCatalogsModified !== false) {
    throw new Error("simulation_evidence_seed_mutation_prohibited");
  }
  if (report.activationAuthorized !== false) {
    throw new Error("simulation_evidence_activation_prohibited");
  }
  if (report.deterministic !== true) {
    throw new Error("simulation_evidence_must_be_deterministic");
  }
  const canonicalJson = JSON.stringify(canonicalize(report));
  return {
    canonicalJson,
    deterministicChecksum: fnv1a32(canonicalJson),
    byteLength: new TextEncoder().encode(canonicalJson).byteLength,
    deterministic: true,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
