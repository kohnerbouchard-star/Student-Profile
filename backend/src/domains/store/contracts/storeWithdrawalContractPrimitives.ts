export class StoreWithdrawalContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreWithdrawalContractError";
    this.code = code;
  }
}

export function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} must be an object.`,
    );
  }
  return value as Record<string, unknown>;
}

export function requireCommandPattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(text)) {
    invalidCommand(`${label} has an invalid public format.`);
  }
  return text;
}

export function requireCommandPositiveInteger(
  value: unknown,
  label: string,
): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    invalidCommand(`${label} must be a positive integer.`);
  }
  return numberValue;
}

export function readText(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} is required.`,
    );
  }
  return text;
}

export function readPattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string {
  const text = readText(value, label);
  if (!pattern.test(text)) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} has an invalid public format.`,
    );
  }
  return text;
}

export function readNullablePattern(
  value: unknown,
  pattern: RegExp,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  return readPattern(value, pattern, label);
}

export function readPositiveInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} must be a positive integer.`,
    );
  }
  return numberValue;
}

export function readNonNegativeInteger(
  value: unknown,
  label: string,
): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} must be a non-negative integer.`,
    );
  }
  return numberValue;
}

export function readNullablePositiveInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) return null;
  return readPositiveInteger(value, label);
}

export function readNullableNonNegativeInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === null || value === undefined) return null;
  return readNonNegativeInteger(value, label);
}

export function readTimestamp(value: unknown, label: string): string {
  const text = readText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} must be an ISO timestamp.`,
    );
  }
  return new Date(text).toISOString();
}

export function readNullableTimestamp(
  value: unknown,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  return readTimestamp(value, label);
}

export function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw contractError(
      "invalid_store_withdrawal_contract",
      `${label} must be boolean.`,
    );
  }
  return value;
}

export function invalidCommand(message: string): never {
  throw contractError("invalid_store_withdrawal_command", message);
}

export function contractError(
  code: string,
  message: string,
): StoreWithdrawalContractError {
  return new StoreWithdrawalContractError(code, message);
}
