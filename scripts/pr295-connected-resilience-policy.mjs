export const MAX_TRANSIENT_READ_ATTEMPTS = 4;
export const RATE_LIMIT_CLEANUP_ATTEMPTS = 10;
export const RATE_LIMIT_STABLE_ZERO_SCANS = 2;
export const RATE_LIMIT_CLEANUP_DELAY_MS = 250;

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export function shouldRetryTransientRead({
  method,
  status,
  code,
  expectedStatuses = [],
  attempt,
  maxAttempts = MAX_TRANSIENT_READ_ATTEMPTS,
}) {
  if (String(method).toUpperCase() !== "GET") return false;
  if (expectedStatuses.includes(Number(status))) return false;
  if (!TRANSIENT_STATUSES.has(Number(status))) return false;
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= maxAttempts) return false;
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  return normalizedCode === "BOOT_ERROR" || normalizedCode === "UNKNOWN" || normalizedCode === "NON_JSON";
}

export function shouldRetryTransientFetchError({
  method,
  attempt,
  maxAttempts = MAX_TRANSIENT_READ_ATTEMPTS,
}) {
  return String(method).toUpperCase() === "GET" &&
    Number.isInteger(attempt) && attempt >= 1 && attempt < maxAttempts;
}

export function retryDelayMs({ attempt, retryAfter }) {
  const parsed = Number(retryAfter);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(2_000, Math.max(100, Math.round(parsed * 1_000)));
  }
  return Math.min(2_000, 250 * (2 ** Math.max(0, Number(attempt) - 1)));
}

export function rateLimitRowIdentity(row) {
  return JSON.stringify({
    dimension: String(row?.dimension ?? ""),
    keyHash: String(row?.keyHash ?? ""),
    windowStartedAt: String(row?.windowStartedAt ?? ""),
    windowSeconds: Number(row?.windowSeconds),
  });
}

export function rateLimitDeltaRows(currentRows, baselineRows) {
  const baseline = new Set((Array.isArray(baselineRows) ? baselineRows : []).map(rateLimitRowIdentity));
  return (Array.isArray(currentRows) ? currentRows : []).filter((row) => !baseline.has(rateLimitRowIdentity(row)));
}

export function nextStableZeroScanCount(currentCount, deltaLength) {
  return Number(deltaLength) === 0 ? Number(currentCount) + 1 : 0;
}
