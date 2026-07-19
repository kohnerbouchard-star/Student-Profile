export class StockMarketWindowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockMarketWindowConfigError";
  }
}

export function isValidStockMarketTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeRequiredStockMarketWindowSetting(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow is required and must be a JSON object.",
    );
  }

  const rawTimeZone = value.timezone;
  if (!isValidStockMarketTimeZone(rawTimeZone)) {
    throw new StockMarketWindowConfigError(
      "stockMarketWindow.timezone is required and must be a valid IANA timezone.",
    );
  }

  return {
    ...value,
    timezone: rawTimeZone.trim(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
