export const SEOUL_STOCK_MARKET_TIME_ZONE = "Asia/Seoul";

export interface StockMarketWindowSettingsSource {
  readonly timezone?: unknown;
}

export interface ResolvedStockMarketWindowSettings {
  readonly timezone: string;
  readonly source: "game_setting" | "seoul_fallback";
}

export function resolveStockMarketWindowSettings(
  value: unknown,
): ResolvedStockMarketWindowSettings {
  const candidate = readTimeZoneCandidate(value);

  if (candidate && isValidIanaTimeZone(candidate)) {
    return {
      timezone: candidate,
      source: "game_setting",
    };
  }

  return {
    timezone: SEOUL_STOCK_MARKET_TIME_ZONE,
    source: "seoul_fallback",
  };
}

export function validateStockMarketWindowSettings(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("stockMarketWindow must be a JSON object.");
  }

  if (!("timezone" in value)) {
    return;
  }

  const candidate = readTimeZoneCandidate(value);
  if (!candidate || !isValidIanaTimeZone(candidate)) {
    throw new Error("stockMarketWindow.timezone must be a valid IANA timezone.");
  }
}

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return true;
  } catch {
    return false;
  }
}

function readTimeZoneCandidate(value: unknown): string | null {
  if (!isRecord(value) || typeof value.timezone !== "string") {
    return null;
  }

  const timezone = value.timezone.trim();
  return timezone || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
