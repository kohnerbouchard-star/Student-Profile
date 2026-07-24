import type { FinancialMarketBondDefinition } from "../contracts/financialMarketContracts.ts";
import {
  calculateDayCountFraction,
  generateBondCouponSchedule,
} from "./bondMath.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
} from "./decimalMath.ts";

export interface CallableBondScheduleEntry {
  readonly callEntryPublicId: string;
  readonly exerciseDate: string;
  readonly callPricePerFaceUnit: string;
  readonly minimumRefinancingSavingsBasisPoints: number;
  readonly noticeDays: number;
}

export interface CallableBondPolicyInput {
  readonly bond: FinancialMarketBondDefinition;
  readonly callSchedulePublicId: string;
  readonly entries: readonly CallableBondScheduleEntry[];
  readonly evaluationDate: string;
  readonly refinancingYield: number;
  readonly refinancingCostPerFaceUnit: string;
  readonly faceQuantity: string;
}

export interface CallableBondExerciseDecision {
  readonly callSchedulePublicId: string;
  readonly selectedCallEntryPublicId: string | null;
  readonly selectedExerciseDate: string | null;
  readonly eligible: boolean;
  readonly exerciseRecommended: boolean;
  readonly couponSavingsBasisPoints: number;
  readonly grossRemainingCouponSavings: string;
  readonly callPremiumCost: string;
  readonly refinancingCost: string;
  readonly netEconomicBenefit: string;
  readonly reason:
    | "not_callable"
    | "no_eligible_call_date"
    | "refinancing_savings_below_threshold"
    | "net_economic_benefit_non_positive"
    | "exercise_recommended";
  readonly optionalPricingSupported: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

export interface CallableBondYieldCandidate {
  readonly candidateKind: "call" | "maturity";
  readonly candidatePublicId: string;
  readonly redemptionDate: string;
  readonly redemptionAmountPerFaceUnit: string;
  readonly annualYield: number;
}

export interface CallableBondYieldToWorstResult {
  readonly settlementDate: string;
  readonly cleanPricePerFaceUnit: string;
  readonly candidates: readonly CallableBondYieldCandidate[];
  readonly yieldToWorst: number;
  readonly worstCandidatePublicId: string;
  readonly optionalPricingSupported: false;
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

export function evaluateCallableBondExercise(
  input: CallableBondPolicyInput,
): CallableBondExerciseDecision {
  validatePolicyInput(input);
  if (!input.bond.callable) {
    return noExerciseDecision(input, "not_callable");
  }
  const evaluation = parseIsoDate(input.evaluationDate, "evaluationDate");
  const eligibleEntries = [...input.entries]
    .filter((entry) => {
      const exercise = parseIsoDate(entry.exerciseDate, "exerciseDate");
      const noticeStart = new Date(
        exercise.getTime() - entry.noticeDays * 86_400_000,
      );
      return evaluation >= noticeStart && evaluation <= exercise;
    })
    .sort((left, right) =>
      left.exerciseDate.localeCompare(right.exerciseDate) ||
      left.callEntryPublicId.localeCompare(right.callEntryPublicId)
    );
  const selected = eligibleEntries[0];
  if (!selected) {
    return noExerciseDecision(input, "no_eligible_call_date");
  }

  const couponSavingsBasisPoints = Math.max(
    0,
    Math.round((input.bond.couponRateAnnual - input.refinancingYield) * 10_000),
  );
  const remainingYears = calculateDayCountFraction(
    selected.exerciseDate,
    input.bond.maturityDate,
    "actual_365",
  );
  const principal = multiplyMarketDecimals(
    input.bond.faceValue,
    input.faceQuantity,
  );
  const grossRemainingCouponSavings = multiplyMarketDecimals(
    principal,
    Math.max(0, input.bond.couponRateAnnual - input.refinancingYield) *
      remainingYears,
  );
  const redemption = multiplyMarketDecimals(
    selected.callPricePerFaceUnit,
    input.faceQuantity,
  );
  const callPremiumPerFace = compareMarketDecimals(
      selected.callPricePerFaceUnit,
      input.bond.faceValue,
    ) > 0
    ? decimalDifference(selected.callPricePerFaceUnit, input.bond.faceValue)
    : "0";
  const callPremiumCost = multiplyMarketDecimals(
    callPremiumPerFace,
    input.faceQuantity,
  );
  const refinancingCost = multiplyMarketDecimals(
    input.refinancingCostPerFaceUnit,
    input.faceQuantity,
  );
  const totalCosts = addMarketDecimals(callPremiumCost, refinancingCost);
  const netEconomicBenefit = decimalDifferenceFloorZero(
    grossRemainingCouponSavings,
    totalCosts,
  );

  let exerciseRecommended = true;
  let reason: CallableBondExerciseDecision["reason"] = "exercise_recommended";
  if (
    couponSavingsBasisPoints < selected.minimumRefinancingSavingsBasisPoints
  ) {
    exerciseRecommended = false;
    reason = "refinancing_savings_below_threshold";
  } else if (compareMarketDecimals(netEconomicBenefit, "0") <= 0) {
    exerciseRecommended = false;
    reason = "net_economic_benefit_non_positive";
  }

  void redemption;
  return {
    callSchedulePublicId: input.callSchedulePublicId,
    selectedCallEntryPublicId: selected.callEntryPublicId,
    selectedExerciseDate: selected.exerciseDate,
    eligible: true,
    exerciseRecommended,
    couponSavingsBasisPoints,
    grossRemainingCouponSavings,
    callPremiumCost,
    refinancingCost,
    netEconomicBenefit,
    reason,
    optionalPricingSupported: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

export function calculateCallableBondYieldToWorst(input: {
  readonly bond: FinancialMarketBondDefinition;
  readonly entries: readonly CallableBondScheduleEntry[];
  readonly settlementDate: string;
  readonly cleanPricePerFaceUnit: string;
}): CallableBondYieldToWorstResult {
  validateBondAndSchedule(input.bond, input.entries);
  if (compareMarketDecimals(input.cleanPricePerFaceUnit, "0") <= 0) {
    throw new Error("callable_bond_clean_price_invalid");
  }
  const settlement = parseIsoDate(input.settlementDate, "settlementDate");
  if (settlement >= parseIsoDate(input.bond.maturityDate, "maturityDate")) {
    throw new Error("callable_bond_settlement_after_maturity");
  }

  const candidates: CallableBondYieldCandidate[] = [];
  for (const entry of [...input.entries].sort((left, right) =>
    left.exerciseDate.localeCompare(right.exerciseDate) ||
    left.callEntryPublicId.localeCompare(right.callEntryPublicId)
  )) {
    if (parseIsoDate(entry.exerciseDate, "exerciseDate") <= settlement) continue;
    candidates.push({
      candidateKind: "call",
      candidatePublicId: entry.callEntryPublicId,
      redemptionDate: entry.exerciseDate,
      redemptionAmountPerFaceUnit: entry.callPricePerFaceUnit,
      annualYield: solveYieldToRedemption({
        bond: input.bond,
        settlementDate: input.settlementDate,
        cleanPricePerFaceUnit: input.cleanPricePerFaceUnit,
        redemptionDate: entry.exerciseDate,
        redemptionAmountPerFaceUnit: entry.callPricePerFaceUnit,
      }),
    });
  }
  candidates.push({
    candidateKind: "maturity",
    candidatePublicId: `${input.bond.bondPublicId}.maturity`,
    redemptionDate: input.bond.maturityDate,
    redemptionAmountPerFaceUnit: input.bond.faceValue,
    annualYield: solveYieldToRedemption({
      bond: input.bond,
      settlementDate: input.settlementDate,
      cleanPricePerFaceUnit: input.cleanPricePerFaceUnit,
      redemptionDate: input.bond.maturityDate,
      redemptionAmountPerFaceUnit: input.bond.faceValue,
    }),
  });

  const ordered = candidates.sort((left, right) =>
    left.annualYield - right.annualYield ||
    left.candidatePublicId.localeCompare(right.candidatePublicId)
  );
  const worst = ordered[0];
  if (!worst) throw new Error("callable_bond_yield_candidates_missing");
  return {
    settlementDate: input.settlementDate,
    cleanPricePerFaceUnit: input.cleanPricePerFaceUnit,
    candidates: ordered,
    yieldToWorst: worst.annualYield,
    worstCandidatePublicId: worst.candidatePublicId,
    optionalPricingSupported: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

function solveYieldToRedemption(input: {
  readonly bond: FinancialMarketBondDefinition;
  readonly settlementDate: string;
  readonly cleanPricePerFaceUnit: string;
  readonly redemptionDate: string;
  readonly redemptionAmountPerFaceUnit: string;
}): number {
  const cashFlows = generateBondCouponSchedule(input.bond)
    .filter((entry) =>
      entry.paymentDate > input.settlementDate &&
      entry.paymentDate <= input.redemptionDate
    )
    .map((entry) => ({
      paymentDate: entry.paymentDate,
      amount: entry.paymentDate === input.redemptionDate
        ? addMarketDecimals(
          entry.couponAmountPerFaceUnit,
          input.redemptionAmountPerFaceUnit,
        )
        : entry.couponAmountPerFaceUnit,
    }));
  if (!cashFlows.some((cashFlow) => cashFlow.paymentDate === input.redemptionDate)) {
    cashFlows.push({
      paymentDate: input.redemptionDate,
      amount: input.redemptionAmountPerFaceUnit,
    });
  }
  if (cashFlows.length === 0) throw new Error("callable_bond_cash_flows_missing");

  const targetPrice = Number(input.cleanPricePerFaceUnit);
  let lower = -0.95;
  let upper = 5;
  for (let iteration = 0; iteration < 160; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const presentValue = cashFlows.reduce((total, cashFlow) => {
      const years = calculateDayCountFraction(
        input.settlementDate,
        cashFlow.paymentDate,
        "actual_365",
      );
      return total + Number(cashFlow.amount) * Math.exp(-midpoint * years);
    }, 0);
    if (presentValue > targetPrice) lower = midpoint;
    else upper = midpoint;
  }
  return roundRate((lower + upper) / 2);
}

function noExerciseDecision(
  input: CallableBondPolicyInput,
  reason: "not_callable" | "no_eligible_call_date",
): CallableBondExerciseDecision {
  return {
    callSchedulePublicId: input.callSchedulePublicId,
    selectedCallEntryPublicId: null,
    selectedExerciseDate: null,
    eligible: false,
    exerciseRecommended: false,
    couponSavingsBasisPoints: 0,
    grossRemainingCouponSavings: "0",
    callPremiumCost: "0",
    refinancingCost: "0",
    netEconomicBenefit: "0",
    reason,
    optionalPricingSupported: false,
    activationAuthorized: false,
    deterministic: true,
  };
}

function validatePolicyInput(input: CallableBondPolicyInput): void {
  validateBondAndSchedule(input.bond, input.entries);
  validateIdentity(input.callSchedulePublicId, "call_schedule_public_id_invalid");
  if (input.bond.callSchedulePublicId !== input.callSchedulePublicId) {
    throw new Error("call_schedule_identity_mismatch");
  }
  parseIsoDate(input.evaluationDate, "evaluationDate");
  if (!Number.isFinite(input.refinancingYield) || input.refinancingYield < 0 || input.refinancingYield > 1) {
    throw new Error("callable_bond_refinancing_yield_invalid");
  }
  if (compareMarketDecimals(input.refinancingCostPerFaceUnit, "0") < 0) {
    throw new Error("callable_bond_refinancing_cost_invalid");
  }
  if (compareMarketDecimals(input.faceQuantity, "0") <= 0) {
    throw new Error("callable_bond_face_quantity_invalid");
  }
}

function validateBondAndSchedule(
  bond: FinancialMarketBondDefinition,
  entries: readonly CallableBondScheduleEntry[],
): void {
  if (bond.callable && !bond.callSchedulePublicId) {
    throw new Error("callable_bond_schedule_required");
  }
  if (!bond.callable && entries.length > 0) {
    throw new Error("non_callable_bond_schedule_prohibited");
  }
  if (bond.callable && entries.length === 0) {
    throw new Error("callable_bond_entries_required");
  }
  const issueDate = parseIsoDate(bond.issueDate, "issueDate");
  const maturityDate = parseIsoDate(bond.maturityDate, "maturityDate");
  const seen = new Set<string>();
  let priorDate: string | null = null;
  for (const entry of [...entries].sort((left, right) =>
    left.exerciseDate.localeCompare(right.exerciseDate)
  )) {
    validateIdentity(entry.callEntryPublicId, "call_entry_public_id_invalid");
    if (seen.has(entry.callEntryPublicId)) {
      throw new Error("duplicate_call_entry_public_id");
    }
    seen.add(entry.callEntryPublicId);
    const exerciseDate = parseIsoDate(entry.exerciseDate, "exerciseDate");
    if (exerciseDate <= issueDate || exerciseDate >= maturityDate) {
      throw new Error("call_entry_date_outside_bond_term");
    }
    if (priorDate !== null && entry.exerciseDate === priorDate) {
      throw new Error("duplicate_call_exercise_date");
    }
    priorDate = entry.exerciseDate;
    if (compareMarketDecimals(entry.callPricePerFaceUnit, "0") <= 0) {
      throw new Error("call_price_invalid");
    }
    if (
      !Number.isInteger(entry.minimumRefinancingSavingsBasisPoints) ||
      entry.minimumRefinancingSavingsBasisPoints < 0 ||
      entry.minimumRefinancingSavingsBasisPoints > 10_000
    ) {
      throw new Error("call_savings_threshold_invalid");
    }
    if (!Number.isInteger(entry.noticeDays) || entry.noticeDays < 0 || entry.noticeDays > 365) {
      throw new Error("call_notice_days_invalid");
    }
  }
}

function decimalDifference(left: string, right: string): string {
  const result = Number(left) - Number(right);
  if (!Number.isFinite(result)) throw new Error("callable_bond_decimal_invalid");
  return roundDecimal(result);
}

function decimalDifferenceFloorZero(left: string, right: string): string {
  return roundDecimal(Math.max(0, Number(left) - Number(right)));
}

function roundDecimal(value: number): string {
  return (Math.round(value * 1_000_000) / 1_000_000).toString();
}

function validateIdentity(value: string, errorCode: string): void {
  if (!value.trim() || value.length > 180) throw new Error(errorCode);
}

function parseIsoDate(value: string, fieldName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName}_invalid`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName}_invalid`);
  }
  return parsed;
}

function roundRate(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
