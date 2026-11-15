import type {
  FinancialMarketBondDefinition,
  FinancialMarketCouponScheduleEntry,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  formatMarketDecimal,
  multiplyMarketDecimals,
  parseMarketDecimal,
  subtractMarketDecimals,
} from "./decimalMath.ts";
import {
  buildCouponSchedulePublicId,
  calculateDayCountFraction,
  generateBondCouponSchedule,
  parseIsoDate,
  validateBondDefinition,
  validatePositiveAmount,
} from "./bondCouponCalendar.ts";
import type {
  BondCashFlow,
  BondHoldingCashFlowInput,
  BondValuationInput,
  BondValuationResult,
} from "./bondCalculationTypes.ts";
export {
  calculateDayCountFraction,
  generateBondCouponSchedule,
} from "./bondCouponCalendar.ts";
export type {
  BondCashFlow,
  BondDefaultState,
  BondHoldingCashFlowInput,
  BondValuationInput,
  BondValuationResult,
} from "./bondCalculationTypes.ts";

export function calculateBondAccruedInterest(
  bond: FinancialMarketBondDefinition,
  settlementDate: string,
  faceQuantity: string,
): string {
  validatePositiveAmount(faceQuantity, "faceQuantity");
  const settlement = parseIsoDate(settlementDate, "settlementDate");
  if (settlement <= parseIsoDate(bond.issueDate, "issueDate") ||
    settlement >= parseIsoDate(bond.maturityDate, "maturityDate") ||
    bond.couponType === "zero_coupon") {
    return "0";
  }

  const activePeriod = generateBondCouponSchedule(bond).find((entry) =>
    settlement > parseIsoDate(entry.accrualStartDate, "accrualStartDate") &&
    settlement < parseIsoDate(entry.paymentDate, "paymentDate")
  );
  if (!activePeriod) return "0";

  const elapsedFraction = calculateDayCountFraction(
    activePeriod.accrualStartDate,
    settlementDate,
    bond.dayCountConvention,
  );
  const accruedPerFaceUnit = multiplyMarketDecimals(
    bond.faceValue,
    bond.couponRateAnnual * elapsedFraction,
  );
  return multiplyMarketDecimals(accruedPerFaceUnit, faceQuantity);
}

export function valueBond(input: BondValuationInput): BondValuationResult {
  validateBondDefinition(input.bond);
  validatePositiveAmount(input.faceQuantity, "faceQuantity");
  if (!Number.isFinite(input.annualYield) || input.annualYield < 0 ||
    input.annualYield > 1) {
    throw new Error("Bond annual yield must be within 0 and 1.");
  }

  const settlement = parseIsoDate(input.settlementDate, "settlementDate");
  const issueDate = parseIsoDate(input.bond.issueDate, "issueDate");
  const maturityDate = parseIsoDate(input.bond.maturityDate, "maturityDate");
  if (settlement < issueDate) {
    throw new Error("Bond settlement cannot precede issue date.");
  }

  const principalValue = multiplyMarketDecimals(
    input.bond.faceValue,
    input.faceQuantity,
  );
  const defaultState = input.defaultState ?? null;
  if (defaultState &&
    settlement >= parseIsoDate(defaultState.defaultedAt, "defaultedAt")) {
    validateRecoveryRate(defaultState.recoveryRate);
    const recoveryValue = multiplyMarketDecimals(
      principalValue,
      defaultState.recoveryRate,
    );
    const remainingCashFlows = defaultState.recoveredAt === null
      ? [buildRecoveryCashFlow(input, recoveryValue)]
      : [];
    return {
      settlementDate: input.settlementDate,
      faceQuantity: input.faceQuantity,
      annualYield: roundRate(input.annualYield),
      accruedInterest: "0",
      cleanPrice: recoveryValue,
      dirtyPrice: recoveryValue,
      principalValue,
      remainingCashFlows,
      defaulted: true,
      recoveryValue,
    };
  }

  if (settlement >= maturityDate) {
    return {
      settlementDate: input.settlementDate,
      faceQuantity: input.faceQuantity,
      annualYield: roundRate(input.annualYield),
      accruedInterest: "0",
      cleanPrice: "0",
      dirtyPrice: "0",
      principalValue,
      remainingCashFlows: [],
      defaulted: false,
      recoveryValue: null,
    };
  }

  const schedule = generateBondCouponSchedule(input.bond);
  const remainingCashFlows = schedule
    .filter((entry) => parseIsoDate(entry.paymentDate, "paymentDate") > settlement)
    .map((entry) => scheduleEntryToHoldingCashFlow(
      input.bond,
      input.faceQuantity,
      entry,
      "valuation",
      "valuation",
      "valuation.v1",
    ));

  let dirtyScaled = 0n;
  for (const cashFlow of remainingCashFlows) {
    const years = calculateDayCountFraction(
      input.settlementDate,
      cashFlow.paymentDate,
      "actual_365",
    );
    const discountFactor = Math.exp(-input.annualYield * years);
    dirtyScaled += parseMarketDecimal(
      multiplyMarketDecimals(cashFlow.amount, discountFactor),
    );
  }
  const dirtyPrice = formatMarketDecimal(dirtyScaled);
  const accruedInterest = calculateBondAccruedInterest(
    input.bond,
    input.settlementDate,
    input.faceQuantity,
  );
  const cleanPrice = compareMarketDecimals(dirtyPrice, accruedInterest) >= 0
    ? subtractMarketDecimals(dirtyPrice, accruedInterest)
    : "0";

  return {
    settlementDate: input.settlementDate,
    faceQuantity: input.faceQuantity,
    annualYield: roundRate(input.annualYield),
    accruedInterest,
    cleanPrice,
    dirtyPrice,
    principalValue,
    remainingCashFlows,
    defaulted: false,
    recoveryValue: null,
  };
}

export function calculateBondHoldingCashFlow(
  input: BondHoldingCashFlowInput,
): readonly BondCashFlow[] {
  validatePositiveAmount(input.faceQuantity, "faceQuantity");
  if (input.scheduleEntry.bondPublicId !== input.bond.bondPublicId) {
    throw new Error("Coupon schedule entry does not belong to the bond.");
  }
  const couponAmount = multiplyMarketDecimals(
    input.scheduleEntry.couponAmountPerFaceUnit,
    input.faceQuantity,
  );
  const principalAmount = multiplyMarketDecimals(
    input.scheduleEntry.principalAmountPerFaceUnit,
    input.faceQuantity,
  );
  const results: BondCashFlow[] = [];
  if (compareMarketDecimals(couponAmount, "0") > 0) {
    results.push({
      cashFlowPublicId: buildCashFlowPublicId(
        input.scheduleEntry.couponSchedulePublicId,
        "coupon",
      ),
      bondPublicId: input.bond.bondPublicId,
      kind: "coupon",
      entitlementDate: input.scheduleEntry.accrualEndDate,
      paymentDate: input.scheduleEntry.paymentDate,
      amount: couponAmount,
      currencyCode: input.bond.denominationCurrencyCode,
      idempotencyKey: buildBondCashFlowIdempotencyKey(
        input.gamePublicId,
        input.playerPublicId,
        input.scheduleEntry.couponSchedulePublicId,
        "coupon",
        input.releaseVersion,
      ),
    });
  }
  if (compareMarketDecimals(principalAmount, "0") > 0) {
    results.push({
      cashFlowPublicId: buildCashFlowPublicId(
        input.scheduleEntry.couponSchedulePublicId,
        "maturity",
      ),
      bondPublicId: input.bond.bondPublicId,
      kind: "maturity",
      entitlementDate: input.scheduleEntry.accrualEndDate,
      paymentDate: input.scheduleEntry.paymentDate,
      amount: principalAmount,
      currencyCode: input.bond.denominationCurrencyCode,
      idempotencyKey: buildBondCashFlowIdempotencyKey(
        input.gamePublicId,
        input.playerPublicId,
        input.scheduleEntry.couponSchedulePublicId,
        "maturity",
        input.releaseVersion,
      ),
    });
  }
  return results;
}

export function calculateBondRecoveryValue(
  faceValue: string,
  faceQuantity: string,
  recoveryRate: number,
): string {
  validatePositiveAmount(faceValue, "faceValue");
  validatePositiveAmount(faceQuantity, "faceQuantity");
  validateRecoveryRate(recoveryRate);
  return multiplyMarketDecimals(
    multiplyMarketDecimals(faceValue, faceQuantity),
    recoveryRate,
  );
}

export function buildBondCashFlowIdempotencyKey(
  gamePublicId: string,
  playerPublicId: string,
  schedulePublicId: string,
  kind: "coupon" | "maturity" | "recovery",
  releaseVersion: string,
): string {
  const parts = [
    "bond-cash-flow",
    gamePublicId,
    playerPublicId,
    schedulePublicId,
    kind,
    releaseVersion,
  ];
  if (parts.some((part) => !String(part).trim())) {
    throw new Error("Bond cash-flow idempotency identity is incomplete.");
  }
  return parts.join("|");
}

function scheduleEntryToHoldingCashFlow(
  bond: FinancialMarketBondDefinition,
  faceQuantity: string,
  entry: FinancialMarketCouponScheduleEntry,
  gamePublicId: string,
  playerPublicId: string,
  releaseVersion: string,
): BondCashFlow {
  const amount = multiplyMarketDecimals(
    addMarketDecimals(
      entry.couponAmountPerFaceUnit,
      entry.principalAmountPerFaceUnit,
    ),
    faceQuantity,
  );
  const kind = compareMarketDecimals(entry.principalAmountPerFaceUnit, "0") > 0
    ? "maturity"
    : "coupon";
  return {
    cashFlowPublicId: buildCashFlowPublicId(entry.couponSchedulePublicId, kind),
    bondPublicId: bond.bondPublicId,
    kind,
    entitlementDate: entry.accrualEndDate,
    paymentDate: entry.paymentDate,
    amount,
    currencyCode: bond.denominationCurrencyCode,
    idempotencyKey: buildBondCashFlowIdempotencyKey(
      gamePublicId,
      playerPublicId,
      entry.couponSchedulePublicId,
      kind,
      releaseVersion,
    ),
  };
}

function buildRecoveryCashFlow(
  input: BondValuationInput,
  recoveryValue: string,
): BondCashFlow {
  const defaultState = input.defaultState;
  if (!defaultState) throw new Error("Bond default state is required.");
  const scheduleIdentity = `${input.bond.bondPublicId}.default.${defaultState.defaultedAt}`;
  return {
    cashFlowPublicId: buildCashFlowPublicId(
      buildCouponSchedulePublicId(input.bond.bondPublicId, 0),
      "recovery",
    ),
    bondPublicId: input.bond.bondPublicId,
    kind: "recovery",
    entitlementDate: defaultState.defaultedAt,
    paymentDate: defaultState.recoveredAt ?? defaultState.defaultedAt,
    amount: recoveryValue,
    currencyCode: input.bond.denominationCurrencyCode,
    idempotencyKey: buildBondCashFlowIdempotencyKey(
      "valuation",
      "valuation",
      scheduleIdentity,
      "recovery",
      "valuation.v1",
    ),
  };
}

function buildCashFlowPublicId(
  schedulePublicId: string,
  kind: BondCashFlow["kind"],
): string {
  const stem = schedulePublicId.replace(/\.v[1-9][0-9]*$/, "");
  return `cashflow.${stem}.${kind}.v1`;
}

function validateRecoveryRate(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Bond recovery rate must be within 0 and 1.");
  }
}

function roundRate(value: number): number {
  return Number(value.toFixed(8));
}
