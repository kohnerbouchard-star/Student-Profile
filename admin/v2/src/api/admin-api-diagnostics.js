const ADMIN_API_BASE_PATH = "/api/admin";

const DEFAULT_TIMEOUT_MS = 15_000;

class AdminTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
    fieldErrors = {},
  } = {}) {
    super("Admin API request failed.");
    this.name = "AdminTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fieldErrors = fieldErrors;
  }
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 250 && numeric <= 120_000
    ? Math.round(numeric)
    : fallback;
}

export { ADMIN_API_BASE_PATH, DEFAULT_TIMEOUT_MS, AdminTransportDiagnostic, normalizeTimeout };
