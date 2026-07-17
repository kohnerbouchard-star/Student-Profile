const MAX_RANDOM = 0x7fffffff;

function randomToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const random = Math.floor(Math.random() * MAX_RANDOM).toString(36);
  return `${Date.now().toString(36)}-${random}`;
}

function stableValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function hashText(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createRequestId() {
  return `ptr_${randomToken()}`;
}

export function createIdempotencyKey(endpointKey) {
  const safeEndpoint = String(endpointKey || "write").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `ptr_${safeEndpoint}_${randomToken()}`;
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(String(value));
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function stableRequestKey({ endpointKey, method, path }) {
  return `${String(method || "GET").toUpperCase()}:${endpointKey}:${path}`;
}

export function stableOperationKey({ endpointKey, method, path, payload }) {
  const fingerprint = hashText(JSON.stringify(stableValue(payload || {})));
  return `${String(method || "POST").toUpperCase()}:${endpointKey}:${path}:${fingerprint}`;
}
