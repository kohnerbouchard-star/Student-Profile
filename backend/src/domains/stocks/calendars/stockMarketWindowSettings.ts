export interface StockMarketWindowSettingsSource {
  readonly timezone?: unknown;
}

export function readRequiredStockMarketTimeZone(value: unknown): string {
  validateStockMarketWindowSettings(value);
  return (value as Record<string, unknown>).timezone as string;
}

export function validateStockMarketWindowSettings(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("stockMarketWindow must be a JSON object.");
  }

  if (!("timezone" in value)) {
    throw new Error("stockMarketWindow.timezone is required.");
  }

  if (typeof value.timezone !== "string" || !value.timezone.trim()) {
    throw new Error("stockMarketWindow.timezone is required.");
  }

  const timezone = value.timezone.trim();
  if (!isValidIanaTimeZone(timezone)) {
    throw new Error("stockMarketWindow.timezone must be a valid IANA timezone.");
  }

  value.timezone = timezone;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
