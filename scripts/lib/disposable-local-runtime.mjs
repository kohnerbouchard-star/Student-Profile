const STATUS_ENV_KEY = /^[A-Z_][A-Z0-9_]*$/u;
const LOCAL_ENVIRONMENT = "local";
const LOOPBACK_HOST = "loopback";
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOCAL_ENVIRONMENT_MARKERS = Object.freeze([
  "ENVIRONMENT",
  "SUPABASE_ENVIRONMENT",
  "ECONOVARIA_ENVIRONMENT",
  "SEED_TARGET_ENVIRONMENT",
]);

export class DisposableLocalRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DisposableLocalRuntimeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new DisposableLocalRuntimeError(code, message);
}

function unwrapAssignmentPrefix(rawLine) {
  let line = String(rawLine ?? "").trim();
  if (/^export\s+/iu.test(line)) {
    line = line.replace(/^export\s+/iu, "");
  } else if (/^set\s+/iu.test(line)) {
    line = line.replace(/^set\s+/iu, "");
    if (line.startsWith('"') && line.endsWith('"')) {
      line = line.slice(1, -1);
    }
  }
  return line;
}

function parseEnvValue(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";

  const first = value[0];
  const last = value.at(-1);
  if (first === '"' || first === "'") {
    if (last !== first) {
      fail("STATUS_ENV_VALUE_INVALID", "Supabase status contains an unterminated quoted value.");
    }
    if (first === "'") return value.slice(1, -1);
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string") throw new TypeError("Expected a string value.");
      return parsed;
    } catch {
      fail("STATUS_ENV_VALUE_INVALID", "Supabase status contains an invalid quoted value.");
    }
  }
  if (last === '"' || last === "'") {
    fail("STATUS_ENV_VALUE_INVALID", "Supabase status contains an unmatched quote.");
  }
  return value;
}

/**
 * Parse the output of `supabase status -o env` without consulting process state.
 * The returned map is configuration, not safe evidence; callers must not log it.
 */
export function parseSupabaseStatusEnv(source) {
  const values = {};
  for (const rawLine of String(source ?? "").split(/\r?\n/u)) {
    const line = unwrapAssignmentPrefix(rawLine);
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!STATUS_ENV_KEY.test(key)) {
      fail("STATUS_ENV_KEY_INVALID", "Supabase status contains an invalid environment key.");
    }
    if (Object.hasOwn(values, key)) {
      fail("STATUS_ENV_KEY_DUPLICATE", "Supabase status contains a duplicate environment key.");
    }
    values[key] = parseEnvValue(line.slice(separator + 1));
  }
  return Object.freeze(values);
}

/**
 * Return one canonical marker for accepted loopback spellings, or null otherwise.
 */
export function normalizeLoopbackHost(value) {
  let host = String(value ?? "").trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) host = host.slice(0, -1);

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return LOOPBACK_HOST;
  }
  return null;
}

function parseUrl(value, { code, label }) {
  if (!String(value ?? "").trim()) {
    fail(`${code}_MISSING`, `${label} is missing from the disposable local runtime contract.`);
  }
  try {
    return new URL(String(value).trim());
  } catch {
    fail(`${code}_INVALID`, `${label} is not a valid URL.`);
  }
}

function effectivePort(url) {
  if (url.port) return url.port;
  if (url.protocol === "http:") return "80";
  if (url.protocol === "https:") return "443";
  if (POSTGRES_PROTOCOLS.has(url.protocol)) return "5432";
  return "";
}

function requireNoRedirectingUrlParts(url, { code, label, allowCredentials }) {
  if ((!allowCredentials && (url.username || url.password)) || url.search || url.hash) {
    fail(`${code}_INVALID`, `${label} contains unsupported connection or redirect metadata.`);
  }
}

function requireLoopback(url, { code, label }) {
  if (normalizeLoopbackHost(url.hostname) !== LOOPBACK_HOST) {
    fail(`${code}_NON_LOOPBACK`, `${label} must resolve through an explicit loopback host.`);
  }
}

function parseLocalHttpOrigin(value, { code, label }) {
  const url = parseUrl(value, { code, label });
  if (url.protocol !== "http:") {
    fail(`${code}_PROTOCOL_INVALID`, `${label} must use the local HTTP protocol.`);
  }
  requireLoopback(url, { code, label });
  requireNoRedirectingUrlParts(url, { code, label, allowCredentials: false });
  if (url.pathname !== "/") {
    fail(`${code}_PATH_INVALID`, `${label} must identify an origin without an application path.`);
  }
  return Object.freeze({
    targetKey: `${url.protocol}//${LOOPBACK_HOST}:${effectivePort(url)}`,
    port: Number(effectivePort(url)),
  });
}

function databaseName(url, { code, label }) {
  let name;
  try {
    name = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    fail(`${code}_DATABASE_INVALID`, `${label} contains an invalid database name.`);
  }
  if (!name || name.includes("/")) {
    fail(`${code}_DATABASE_INVALID`, `${label} must identify exactly one database.`);
  }
  return name;
}

function parseLocalDatabaseTarget(value, { code, label }) {
  const url = parseUrl(value, { code, label });
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    fail(`${code}_PROTOCOL_INVALID`, `${label} must use a PostgreSQL URL.`);
  }
  requireLoopback(url, { code, label });
  requireNoRedirectingUrlParts(url, { code, label, allowCredentials: true });
  const name = databaseName(url, { code, label });
  const port = effectivePort(url);
  return Object.freeze({
    targetKey: `${LOOPBACK_HOST}:${port}/${name}`,
    port: Number(port),
  });
}

function collectStatusTargets(status, keys, parser, missingCode, missingMessage) {
  const supplied = keys
    .filter((key) => String(status[key] ?? "").trim())
    .map((key) => parser(status[key]));
  if (supplied.length === 0) fail(missingCode, missingMessage);
  if (new Set(supplied.map(({ targetKey }) => targetKey)).size !== 1) {
    fail(`${missingCode}_CONFLICT`, "Supabase status exposes conflicting local target aliases.");
  }
  return supplied[0];
}

function assertLocalEnvironment(status, targetEnvironment) {
  const normalized = String(targetEnvironment ?? "").trim().toLowerCase();
  if (normalized !== LOCAL_ENVIRONMENT) {
    fail(
      "TARGET_ENVIRONMENT_NON_LOCAL",
      "Disposable runtime mutations require the explicit local target environment.",
    );
  }

  for (const key of LOCAL_ENVIRONMENT_MARKERS) {
    const marker = String(status[key] ?? "").trim().toLowerCase();
    if (marker === "production" || marker === "staging") {
      fail(
        "STATUS_ENVIRONMENT_NON_LOCAL",
        "Supabase status identifies a non-local target environment.",
      );
    }
  }
}

/**
 * Validate a disposable local Supabase/browser target and return log-safe evidence.
 * This helper intentionally returns no URLs, credentials, keys, database names, or
 * project identifiers.
 */
export function assertDisposableLocalRuntime({
  statusOutput,
  inheritedDatabaseUrl,
  gatewayUrl,
  targetEnvironment = LOCAL_ENVIRONMENT,
} = {}) {
  const status = parseSupabaseStatusEnv(statusOutput);
  assertLocalEnvironment(status, targetEnvironment);

  const api = collectStatusTargets(
    status,
    ["API_URL", "SUPABASE_URL"],
    (value) => parseLocalHttpOrigin(value, {
      code: "STATUS_API_URL",
      label: "Supabase API URL",
    }),
    "STATUS_API_URL_MISSING",
    "Supabase status does not expose a local API URL.",
  );
  const database = collectStatusTargets(
    status,
    ["DB_URL", "DATABASE_URL"],
    (value) => parseLocalDatabaseTarget(value, {
      code: "STATUS_DATABASE_URL",
      label: "Supabase database URL",
    }),
    "STATUS_DATABASE_URL_MISSING",
    "Supabase status does not expose a local database URL.",
  );
  const gateway = parseLocalHttpOrigin(gatewayUrl, {
    code: "GATEWAY_URL",
    label: "Browser gateway URL",
  });

  const inheritedValue = String(inheritedDatabaseUrl ?? "").trim();
  let inheritedDatabaseMatches = null;
  if (inheritedValue) {
    const inherited = parseLocalDatabaseTarget(inheritedValue, {
      code: "INHERITED_DATABASE_URL",
      label: "Inherited database URL",
    });
    if (inherited.targetKey !== database.targetKey) {
      fail(
        "INHERITED_DATABASE_TARGET_MISMATCH",
        "Inherited DATABASE_URL does not match the discovered local database target.",
      );
    }
    inheritedDatabaseMatches = true;
  }

  return Object.freeze({
    schemaVersion: "econovaria-disposable-local-runtime-evidence-v1",
    environment: LOCAL_ENVIRONMENT,
    loopbackOnly: true,
    productionSelected: false,
    stagingSelected: false,
    api: Object.freeze({ verified: true, port: api.port }),
    database: Object.freeze({
      verified: true,
      port: database.port,
      inheritedDatabaseUrlProvided: Boolean(inheritedValue),
      inheritedDatabaseMatches,
    }),
    gateway: Object.freeze({ verified: true, port: gateway.port }),
    secretsIncluded: false,
  });
}
