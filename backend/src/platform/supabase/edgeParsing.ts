import { EdgeActivationError } from "./edgeResponse.ts";

export function parseRequiredText(
  value: unknown,
  code: string,
  message: string,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
  }

  return normalizedValue;
}

export function readBalanceNumber(value: number | string): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
