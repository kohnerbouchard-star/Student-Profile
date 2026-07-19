import {
  DEFAULT_STOCK_EXCHANGE_CODE,
  type StockExchangeCode,
} from "../calendars/stockMarketExchangeCalendar.ts";
import {
  planStockMarketDueMinutes,
} from "../calendars/stockMarketMinuteReplay.ts";
import type {
  StockMarketRunnerDueMinutesResult,
  StockMarketRunnerRepository,
  StockMarketRunnerResult,
} from "../contracts/stockMarketRunnerContracts.ts";

export interface RunStockMarketDueMinutesInput {
  readonly gameSessionId: string;
  readonly exchangeCode?: StockExchangeCode;
  readonly now: Date;
  readonly maxCatchUpMinutes?: number;
}

export interface RunStockMarketDueMinutesDependencies {
  readonly repository: StockMarketRunnerRepository;
  readonly runMinute: (input: {
    readonly gameSessionId: string;
    readonly exchangeCode: StockExchangeCode;
    readonly marketMinute: string;
  }) => Promise<StockMarketRunnerResult>;
}

export async function runStockMarketDueMinutes(
  input: RunStockMarketDueMinutesInput,
  dependencies: RunStockMarketDueMinutesDependencies,
): Promise<StockMarketRunnerDueMinutesResult> {
  const exchangeCode = input.exchangeCode ?? DEFAULT_STOCK_EXCHANGE_CODE;
  const lastProcessedMinute = await dependencies.repository
    .readLastProcessedMinute(input.gameSessionId, exchangeCode);
  const plan = planStockMarketDueMinutes({
    exchangeCode,
    lastProcessedMinute,
    now: input.now,
    maxMinutes: input.maxCatchUpMinutes,
  });
  const results: StockMarketRunnerResult[] = [];

  for (const marketMinute of plan.dueMinutes) {
    results.push(await dependencies.runMinute({
      gameSessionId: input.gameSessionId,
      exchangeCode,
      marketMinute,
    }));
  }

  return {
    gameSessionId: input.gameSessionId,
    exchangeCode,
    evaluatedThrough: plan.evaluatedThrough,
    results,
    backlogRemaining: plan.backlogRemaining,
  };
}
