#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const ENV_RELATIVE_PATH = path.join("backend", "supabase", "functions", ".env");
const MAX_ENV_BYTES = 16 * 1024;
const REQUIRED_KEYS = Object.freeze([
  "ECONOVARIA_RATE_LIMIT_HMAC_SECRET",
  "ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY",
  "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER",
  "ECONOVARIA_TRUSTED_CLIENT_IP_HEADER",
]);

export class LocalFunctionEnvironmentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocalFunctionEnvironmentError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new LocalFunctionEnvironmentError(code, message);
}

function generatedContents() {
  return [
    `ECONOVARIA_RATE_LIMIT_HMAC_SECRET=${randomBytes(48).toString("base64url")}`,
    `ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY=${randomBytes(32).toString("base64url")}`,
    `ECONOVARIA_PLAYER_CREDENTIAL_PEPPER=${randomBytes(48).toString("base64url")}`,
    "ECONOVARIA_TRUSTED_CLIENT_IP_HEADER=x-real-ip",
    "",
  ].join("\n");
}

function parseRequiredValues(source) {
  const values = new Map();
  for (const rawLine of String(source).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!REQUIRED_KEYS.includes(key)) continue;
    if (values.has(key)) {
      fail(
        "LOCAL_FUNCTION_ENV_DUPLICATE_KEY",
        `Local function environment contains a duplicate required key: ${key}.`,
      );
    }
    values.set(key, line.slice(separator + 1).trim());
  }

  const missing = REQUIRED_KEYS.filter((key) => !values.get(key));
  if (missing.length > 0) {
    fail(
      "LOCAL_FUNCTION_ENV_INCOMPLETE",
      `Existing local function environment is incomplete; add the required keys manually: ${missing.join(", ")}.`,
    );
  }
  return values;
}

function validateRequiredValues(values) {
  const rateLimitSecret = values.get("ECONOVARIA_RATE_LIMIT_HMAC_SECRET");
  if (
    !/^[A-Za-z0-9_-]{43,128}$/u.test(rateLimitSecret) ||
    new Set(rateLimitSecret).size < 20
  ) {
    fail(
      "LOCAL_FUNCTION_ENV_INVALID_RATE_LIMIT_SECRET",
      "Existing local rate-limit secret does not satisfy the runtime contract.",
    );
  }

  if (!/^[A-Za-z0-9_-]{43}$/u.test(
    values.get("ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY"),
  )) {
    fail(
      "LOCAL_FUNCTION_ENV_INVALID_WEB_SESSION_KEY",
      "Existing local web-session key does not satisfy the runtime contract.",
    );
  }

  const credentialPepper = values.get("ECONOVARIA_PLAYER_CREDENTIAL_PEPPER");
  if (credentialPepper.length < 32 || credentialPepper.length > 1024) {
    fail(
      "LOCAL_FUNCTION_ENV_INVALID_PLAYER_CREDENTIAL_PEPPER",
      "Existing local Player credential pepper does not satisfy the runtime contract.",
    );
  }

  if (values.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") !== "x-real-ip") {
    fail(
      "LOCAL_FUNCTION_ENV_INVALID_TRUSTED_IP_HEADER",
      "Existing local trusted client-IP header must be x-real-ip.",
    );
  }
}

function evidence(created) {
  return Object.freeze({
    schemaVersion: "econovaria-local-function-environment-v1",
    created,
    randomSecretCount: 3,
    trustedLoopbackIpHeaderConfigured: true,
    secretsIncluded: false,
    file: ENV_RELATIVE_PATH.replaceAll(path.sep, "/"),
  });
}

async function validateExistingEnvironment(envPath) {
  const metadata = await lstat(envPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(
      "LOCAL_FUNCTION_ENV_NOT_REGULAR_FILE",
      "Existing local function environment must be a regular file.",
    );
  }
  if (metadata.size > MAX_ENV_BYTES) {
    fail(
      "LOCAL_FUNCTION_ENV_TOO_LARGE",
      "Existing local function environment exceeds the reviewed size limit.",
    );
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    fail(
      "LOCAL_FUNCTION_ENV_PERMISSIONS_TOO_BROAD",
      "Existing local function environment permissions must not allow group or other access.",
    );
  }

  const source = await readFile(envPath, "utf8");
  validateRequiredValues(parseRequiredValues(source));
  return evidence(false);
}

/**
 * Create the ignored local Edge Function environment exactly once. Existing
 * configuration is validated but never rewritten, so local secrets stay stable
 * across restarts and a partial file fails closed.
 */
export async function prepareLocalFunctionEnvironment({
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  const root = path.resolve(repoRoot);
  const envPath = path.join(root, ENV_RELATIVE_PATH);
  await mkdir(path.dirname(envPath), { recursive: true });

  try {
    await writeFile(envPath, generatedContents(), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      return validateExistingEnvironment(envPath);
    }
    throw error;
  }

  try {
    await chmod(envPath, 0o600);
    return evidence(true);
  } catch (error) {
    await rm(envPath, { force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareLocalFunctionEnvironment()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Local environment preparation failed.");
      process.exitCode = 1;
    });
}
