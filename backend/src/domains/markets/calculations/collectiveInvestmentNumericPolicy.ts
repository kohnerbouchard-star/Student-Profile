import { compareMarketDecimals } from "./decimalMath.ts";

export function assertPositiveAmount(value: string, fieldName: string): void {
  try {
    if (compareMarketDecimals(value, "0") <= 0) {
      throw new Error(`${fieldName} must be positive.`);
    }
  } catch (error) {
    if (error instanceof Error &&
      error.message === `${fieldName} must be positive.`) {
      throw error;
    }
    throw new Error(`${fieldName} is invalid.`);
  }
}

export function assertNonNegativeAmount(value: string, fieldName: string): void {
  try {
    if (compareMarketDecimals(value, "0") < 0) {
      throw new Error(`${fieldName} must be non-negative.`);
    }
  } catch (error) {
    if (error instanceof Error &&
      error.message === `${fieldName} must be non-negative.`) {
      throw error;
    }
    throw new Error(`${fieldName} is invalid.`);
  }
}

export function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}
