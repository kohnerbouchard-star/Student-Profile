import type {
  FinancialMarketBondDefinition,
  FinancialMarketCouponScheduleEntry,
  FinancialMarketDayCountConvention,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  formatMarketDecimal,
  multiplyMarketDecimals,
  parseMarketDecimal,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface BondValuationInput {
  readonly bond: FinancialMarketBondDefinition;
  readonly settlementDate: string;
  readonly annualYield: number;
  readonly faceQuantity: string;
  readonly defaultState?: BondDefaultState | null;
}

export interface BondDefaultState {
  readonly defaultedAt: string;
  readonly recoveryRate: number;
  readonly recoveredAt: string | null;
}

export interface BondValuationResult {
  readonly settlementDate: string;
  readonly faceQuantity: string;
  readonly annualYield: number;
  readonly accruedInterest: string;
  readonly cleanPrice: string;
  readonly dirtyPrice: string;
  readonly principalValue: string;
  readonly remainingCashFlows: readonly BondCashFlow[];
  readonly defaulted: boolean;
  readonly recoveryValue: string | null;
}

export interface BondCashFlow {
  readonly cashFlowPublicId: string;
  readonly bondPublicId: string;
  readonly kind: "coupon" | "maturity" | "recovery";
  readonly entitlementDate: string;
  readonly paymentDate: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly idempotencyKey: string;
}

export interface BondHoldingCashFlowInput {
  readonly gamePublicId: string;
  readonly playerPublicId: string;
  readonly bond: FinancialMarketBondDefinition;
  readonly faceQuantity: string;
  readonly scheduleEntry: FinancialMarketCouponScheduleEntry;
  readonly releaseVersion: string;
}

export function generateBondCouponSchedule(
  bond: FinancialMarketBondDefinition,
): readonly FinancialMarketCouponScheduleEntry[] {
  validateBondDefinition(bond);
  const issueDate = parseIsoDate(bond.issueDate, "issueDate");
  const maturityDate = parseIsoDate(bond.maturityDate, "maturityDate");
  const monthsPerPeriod = 12 / frequencyPerYear(bond.couponFrequency);
  const boundaries = [maturityDate];
  let cursor = maturityDate;

  while (true) {
    const prior = addUtcMonthsClamped(cursor, -monthsPerPeriod);
    if (prior <= issueDate) {
      boundaries.push(issueDate);
      break;
    }
    boundaries.push(prior);
    cursor = prior;
    if (boundaries.length > 1_000) {
      throw new Error("Bond coupon schedule exceeds the bounded period count.");
    }
  }

  boundaries.sort((left, right) => left.getTime() - right.getTime());
  const entries: FinancialMarketCouponScheduleEntry[] = [];
  for (let index = 1; index < boundaries.length; index += 1) {
    const accrualStart = boundaries[index - 1];
    const accrualEnd = boundaries[index];
    const sequence = index;
    const yearFraction = calculateDayCountFraction(
      formatIsoDate(accrualStart),
      formatIsoDate(accrualEnd),
      bond.dayCountConvention,
    );
    const couponAmountPerFaceUnit = bond.couponType === "zero_coupon"
      ? "0"
      : multiplyMarketDecimals(
        bond.faceValue,
        bond.couponRateAnnual * yearFraction,
      );
    const principalAmountPerFaceUnit = index === boundaries.length - 1
      ? bond.faceValue
      : "0";
    entries.push({
      couponSchedulePublicId: buildCouponSchedulePublicId(
        bond.bondPublicId,
        sequence,
      ),
      bondPublicId: bond.bondPublicId,
      sequence,
      accrualStartDate: formatIsoDate(accrualStart),
      accrualEndDate: formatIsoDate(accrualEnd),
      paymentDate: formatIsoDate(accrualEnd),
      couponAmountPerFaceUnit,
      principalAmountPerFaceUnit,
      sourceVersion: bond.sourceVersion,
    });
  }
  return entries;
}

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

export function calculateDayCountFraction(
  startDate: string,
  endDate: string,
  convention: FinancialMarketDayCountConvention,
): number {
  const start = parseIsoDate(startDate, "startDate");
  const end = parseIsoDate(endDate, "endDate");
  if (end < start) throw new Error("Day-count end date precedes start date.");

  if (convention === "thirty_360") {
    const startDay = Math.min(30, start.getUTCDate());
    const endDay = Math.min(
      end.getUTCDate(),
      startDay === 30 ? 30 : end.getUTCDate(),
    );
    const days = (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
      (end.getUTCMonth() - start.getUTCMonth()) * 30 +
      (endDay - startDay);
    return roundFraction(days / 360);
  }

  const actualDays = Math.round(
    (end.getTime() - start.getTime()) / 86_400_000,
  );
  return roundFraction(
    actualDays / (convention === "actual_360" ? 360 : 365),
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

function validateBondDefinition(bond: FinancialMarketBondDefinition): void {
  const issue = parseIsoDate(bond.issueDate, "issueDate");
  const settlement = parseIsoDate(bond.settlementDate, "settlementDate");
  const maturity = parseIsoDate(bond.maturityDate, "maturityDate");
  if (settlement < issue || maturity <= settlement) {
    throw new Error("Bond issue, settlement, and maturity dates are invalid.");
  }
  validatePositiveAmount(bond.faceValue, "faceValue");
  if (!Number.isFinite(bond.couponRateAnnual) || bond.couponRateAnnual < 0 ||
    bond.couponRateAnnual > 1) {
    throw new Error("Bond coupon rate must be within 0 and 1.");
  }
  if (bond.couponType === "zero_coupon" && bond.couponRateAnnual !== 0) {
    throw new Error("Zero-coupon bonds must have a zero coupon rate.");
  }
  if (bond.callable && !bond.callSchedulePublicId) {
    throw new Error("Callable bonds require an explicit call schedule.");
  }
  if (!bond.callable && bond.callSchedulePublicId) {
    throw new Error("Non-callable bonds cannot reference a call schedule.");
  }
}

function frequencyPerYear(
  frequency: FinancialMarketBondDefinition["couponFrequency"],
): number {
  if (frequency === "annual") return 1;
  if (frequency === "semiannual") return 2;
  if (frequency === "quarterly") return 4;
  throw new Error("Unsupported coupon frequency.");
}

function parseIsoDate(value: string, fieldName: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || formatIsoDate(parsed) !== value) {
    throw new Error(`${fieldName} is not a valid date.`);
  }
  return parsed;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcMonthsClamped(value: Date, months: number): Date {
  const target = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth() + months,
    1,
  ));
  const lastDay = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  target.setUTCDate(Math.min(value.getUTCDate(), lastDay));
  return target;
}

function buildCouponSchedulePublicId(
  bondPublicId: string,
  sequence: number,
): string {
  const stem = bondPublicId.replace(/\.v[1-9][0-9]*$/, "");
  return `coupon.${stem}.${String(sequence).padStart(3, "0")}.v1`;
}

function buildCashFlowPublicId(
  schedulePublicId: string,
  kind: BondCashFlow["kind"],
): string {
  const stem = schedulePublicId.replace(/\.v[1-9][0-9]*$/, "");
  return `cashflow.${stem}.${kind}.v1`;
}

function validatePositiveAmount(value: string, fieldName: string): void {
  if (compareMarketDecimals(value, "0") <= 0) {
    throw new Error(`${fieldName} must be positive.`);
  }
}

function validateRecoveryRate(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Bond recovery rate must be within 0 and 1.");
  }
}

function roundRate(value: number): number {
  return Number(value.toFixed(8));
}

function roundFraction(value: number): number {
  return Number(value.toFixed(12));
}
