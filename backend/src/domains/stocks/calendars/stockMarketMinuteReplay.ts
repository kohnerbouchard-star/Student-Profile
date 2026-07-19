import {
  evaluateStockMarketSession,
  type StockExchangeCode,
} from "./stockMarketExchangeCalendar.ts";

const MINUTE_MS = 60_000;
const MAX_ONE_YEAR_SCAN_MINUTES = 550 * 24 * 60;
export const DEFAULT_MARKET_MINUTE_CATCH_UP_LIMIT = 15;
export const MAX_MARKET_MINUTE_CATCH_UP_LIMIT = 60;

export interface StockMarketMinuteReplayPlanInput {
  readonly exchangeCode: StockExchangeCode;
  readonly lastProcessedMinute: string | null;
  readonly now: Date;
  readonly maxMinutes?: number;
}

export interface StockMarketMinuteReplayPlan {
  readonly exchangeCode: StockExchangeCode;
  readonly evaluatedThrough: string;
  readonly lastProcessedMinute: string | null;
  readonly dueMinutes: readonly string[];
  readonly backlogRemaining: boolean;
  readonly scannedMinutes: number;
}

export function floorToUtcMinute(value: Date): Date {
  assertValidDate(value);
  return new Date(Math.floor(value.getTime() / MINUTE_MS) * MINUTE_MS);
}

export function normalizeMarketMinute(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  assertValidDate(parsed);
  return floorToUtcMinute(parsed).toISOString();
}

export function planStockMarketDueMinutes(
  input: StockMarketMinuteReplayPlanInput,
): StockMarketMinuteReplayPlan {
  const now = floorToUtcMinute(input.now);
  const maxMinutes = normalizeCatchUpLimit(input.maxMinutes);
  const lastProcessed = input.lastProcessedMinute
    ? new Date(normalizeMarketMinute(input.lastProcessedMinute))
    : null;

  if (lastProcessed && lastProcessed.getTime() > now.getTime()) {
    throw new Error("Last processed market minute cannot be in the future.");
  }

  let candidate = lastProcessed
    ? new Date(lastProcessed.getTime() + MINUTE_MS)
    : now;
  const dueMinutes: string[] = [];
  let scannedMinutes = 0;
  let backlogRemaining = false;

  while (candidate.getTime() <= now.getTime()) {
    scannedMinutes += 1;
    if (scannedMinutes > MAX_ONE_YEAR_SCAN_MINUTES) {
      throw new Error(
        "Market-minute backlog exceeds the bounded one-year replay scan.",
      );
    }

    const session = evaluateStockMarketSession(input.exchangeCode, candidate);
    if (session.status === "open") {
      if (dueMinutes.length < maxMinutes) {
        dueMinutes.push(candidate.toISOString());
      } else {
        backlogRemaining = true;
        break;
      }
    }

    candidate = new Date(candidate.getTime() + MINUTE_MS);
  }

  return {
    exchangeCode: input.exchangeCode,
    evaluatedThrough: now.toISOString(),
    lastProcessedMinute: lastProcessed?.toISOString() ?? null,
    dueMinutes,
    backlogRemaining,
    scannedMinutes,
  };
}

function normalizeCatchUpLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MARKET_MINUTE_CATCH_UP_LIMIT;
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_MARKET_MINUTE_CATCH_UP_LIMIT
  ) {
    throw new Error(
      `maxMinutes must be an integer between 1 and ${MAX_MARKET_MINUTE_CATCH_UP_LIMIT}.`,
    );
  }
  return value;
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("A valid date is required for market-minute replay.");
  }
}
