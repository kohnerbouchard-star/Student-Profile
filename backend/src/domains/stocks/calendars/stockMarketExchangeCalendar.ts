export const STOCK_EXCHANGE_CODES = [
  "FGX",
  "SBX",
  "DHM",
  "AUX",
  "CMX",
  "GFX",
  "SCX",
  "ECX",
  "IHX",
  "BDX",
] as const;

export type StockExchangeCode = typeof STOCK_EXCHANGE_CODES[number];

export const STOCK_MARKET_COUNTRY_EXCHANGE = {
  NORTHREACH: "FGX",
  YRETHIA: "SBX",
  THALORIS: "DHM",
  SOLVEND: "AUX",
  ELDORAN: "CMX",
  VALERION: "GFX",
  LUMENOR: "SCX",
  XALVORIA: "ECX",
  DRAVENLOK: "IHX",
  SYNDALIS: "BDX",
} as const satisfies Record<string, StockExchangeCode>;

export type StockMarketCountryCode =
  keyof typeof STOCK_MARKET_COUNTRY_EXCHANGE;

export type StockMarketSessionStatus = "open" | "closed";

export type StockMarketClosureReason =
  | "regular_session"
  | "before_open"
  | "after_close"
  | "weekend"
  | "holiday"
  | "early_close";

export interface StockExchangeCalendarDefinition {
  readonly exchangeCode: StockExchangeCode;
  readonly countryCode: StockMarketCountryCode;
  readonly calendarVersion: string;
  readonly timeZone: string;
  readonly regularTradingDays: readonly number[];
  readonly opensAt: string;
  readonly closesAt: string;
  readonly holidayDates: readonly string[];
  readonly earlyCloses: Readonly<Record<string, string>>;
  readonly holidayCalendarStatus: "pending" | "approved";
}

export interface StockMarketSessionState {
  readonly exchangeCode: StockExchangeCode;
  readonly countryCode: StockMarketCountryCode;
  readonly calendarVersion: string;
  readonly status: StockMarketSessionStatus;
  readonly reason: StockMarketClosureReason;
  readonly evaluatedAt: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly nextTransitionAt: string | null;
}

const DEFAULT_CALENDAR_VERSION = "2026.1";
const DEFAULT_TIME_ZONE = "Asia/Seoul";
const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "17:00";
const DEFAULT_TRADING_DAYS = Object.freeze([1, 2, 3, 4, 5]);

export const DEFAULT_STOCK_EXCHANGE_CODE: StockExchangeCode = "FGX";

export const STOCK_EXCHANGE_CALENDARS: Readonly<
  Record<StockExchangeCode, StockExchangeCalendarDefinition>
> = Object.freeze(Object.fromEntries(
  Object.entries(STOCK_MARKET_COUNTRY_EXCHANGE).map(
    ([countryCode, exchangeCode]) => [
      exchangeCode,
      Object.freeze({
        exchangeCode,
        countryCode: countryCode as StockMarketCountryCode,
        calendarVersion: DEFAULT_CALENDAR_VERSION,
        timeZone: DEFAULT_TIME_ZONE,
        regularTradingDays: DEFAULT_TRADING_DAYS,
        opensAt: DEFAULT_OPEN,
        closesAt: DEFAULT_CLOSE,
        holidayDates: Object.freeze([]),
        earlyCloses: Object.freeze({}),
        holidayCalendarStatus: "pending" as const,
      }),
    ],
  ),
) as unknown as Record<StockExchangeCode, StockExchangeCalendarDefinition>);

interface LocalDateTimeParts {
  readonly date: string;
  readonly time: string;
  readonly isoWeekday: number;
  readonly minuteOfDay: number;
}

const WEEKDAY_TO_ISO: Readonly<Record<string, number>> = Object.freeze({
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
});

const formatterByTimeZone = new Map<string, Intl.DateTimeFormat>();

export function getStockExchangeCalendar(
  exchangeCode: StockExchangeCode,
): StockExchangeCalendarDefinition {
  return STOCK_EXCHANGE_CALENDARS[exchangeCode];
}

export function getStockExchangeCodeForCountry(
  countryCode: string,
): StockExchangeCode | null {
  const normalized = countryCode.trim().toUpperCase() as StockMarketCountryCode;
  return STOCK_MARKET_COUNTRY_EXCHANGE[normalized] ?? null;
}

export function stockMarketMinuteKey(
  exchangeCode: StockExchangeCode,
  at: Date,
): string {
  assertValidDate(at);
  return `${exchangeCode}:${at.toISOString().slice(0, 16)}Z`;
}

export function evaluateStockMarketSession(
  exchangeCode: StockExchangeCode,
  at: Date = new Date(),
): StockMarketSessionState {
  assertValidDate(at);
  const calendar = getStockExchangeCalendar(exchangeCode);
  const core = evaluateCore(calendar, at);

  return {
    exchangeCode,
    countryCode: calendar.countryCode,
    calendarVersion: calendar.calendarVersion,
    status: core.status,
    reason: core.reason,
    evaluatedAt: at.toISOString(),
    localDate: core.local.date,
    localTime: core.local.time,
    nextTransitionAt: findNextTransitionAt(calendar, at, core.status),
  };
}

export function isStockMarketOpenAt(
  at: Date,
  exchangeCode: StockExchangeCode = DEFAULT_STOCK_EXCHANGE_CODE,
): boolean {
  assertValidDate(at);
  return evaluateCore(getStockExchangeCalendar(exchangeCode), at).status ===
    "open";
}

function evaluateCore(
  calendar: StockExchangeCalendarDefinition,
  at: Date,
): {
  readonly status: StockMarketSessionStatus;
  readonly reason: StockMarketClosureReason;
  readonly local: LocalDateTimeParts;
} {
  const local = localParts(at, calendar.timeZone);

  if (!calendar.regularTradingDays.includes(local.isoWeekday)) {
    return { status: "closed", reason: "weekend", local };
  }

  if (calendar.holidayDates.includes(local.date)) {
    return { status: "closed", reason: "holiday", local };
  }

  const openMinute = parseClockMinute(calendar.opensAt);
  const closeValue = calendar.earlyCloses[local.date] ?? calendar.closesAt;
  const closeMinute = parseClockMinute(closeValue);

  if (local.minuteOfDay < openMinute) {
    return { status: "closed", reason: "before_open", local };
  }

  if (local.minuteOfDay >= closeMinute) {
    return {
      status: "closed",
      reason: calendar.earlyCloses[local.date] ? "early_close" : "after_close",
      local,
    };
  }

  return { status: "open", reason: "regular_session", local };
}

function findNextTransitionAt(
  calendar: StockExchangeCalendarDefinition,
  at: Date,
  currentStatus: StockMarketSessionStatus,
): string | null {
  const minuteMs = 60_000;
  const firstMinute = Math.floor(at.getTime() / minuteMs) * minuteMs + minuteMs;
  const maximumMinutes = 10 * 24 * 60;

  for (let offset = 0; offset <= maximumMinutes; offset += 1) {
    const candidate = new Date(firstMinute + offset * minuteMs);
    if (evaluateCore(calendar, candidate).status !== currentStatus) {
      return candidate.toISOString();
    }
  }

  return null;
}

function localParts(at: Date, timeZone: string): LocalDateTimeParts {
  let formatter = formatterByTimeZone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterByTimeZone.set(timeZone, formatter);
  }

  const values = new Map(
    formatter.formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = requiredPart(values, "year");
  const month = requiredPart(values, "month");
  const day = requiredPart(values, "day");
  const weekday = requiredPart(values, "weekday");
  const hour = Number(requiredPart(values, "hour"));
  const minute = Number(requiredPart(values, "minute"));
  const isoWeekday = WEEKDAY_TO_ISO[weekday];

  if (!isoWeekday || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Unable to resolve local market time for ${timeZone}.`);
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    isoWeekday,
    minuteOfDay: hour * 60 + minute,
  };
}

function requiredPart(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`Missing Intl date part ${key}.`);
  return value;
}

function parseClockMinute(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid market clock value ${value}.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("A valid Date is required for market calendar evaluation.");
  }
}
