import type {
  FinancialMarketBondDefinition,
  FinancialMarketCouponScheduleEntry,
  FinancialMarketDayCountConvention,
} from "../contracts/financialMarketContracts.ts";
import {
  compareMarketDecimals,
  multiplyMarketDecimals,
} from "./decimalMath.ts";

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

export function validateBondDefinition(bond: FinancialMarketBondDefinition): void {
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

export function parseIsoDate(value: string, fieldName: string): Date {
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

export function buildCouponSchedulePublicId(
  bondPublicId: string,
  sequence: number,
): string {
  const stem = bondPublicId.replace(/\.v[1-9][0-9]*$/, "");
  return `coupon.${stem}.${String(sequence).padStart(3, "0")}.v1`;
}

export function validatePositiveAmount(value: string, fieldName: string): void {
  if (compareMarketDecimals(value, "0") <= 0) {
    throw new Error(`${fieldName} must be positive.`);
  }
}

function roundFraction(value: number): number {
  return Number(value.toFixed(12));
}
