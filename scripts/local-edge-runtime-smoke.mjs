#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const GATEWAY_ORIGIN = "http://127.0.0.1:4173";
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const FORBIDDEN_BODY_MARKERS = [
  "name resolution failed",
  "local_gateway_upstream_failed",
  "worker boot error",
  "boot error",
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseStatusEnv(source) {
  const values = new Map();
  for (const rawLine of String(source).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      value[0] === value.at(-1) &&
      ["'", '"'].includes(value[0])
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function localPublishableKey() {
  const result = spawnSync(
    "npx",
    ["supabase", "status", "-o", "env", "--workdir", "backend"],
    { encoding: "utf8" },
  );
  requireCondition(
    result.status === 0,
    `Unable to inspect local Supabase: ${String(result.stderr || result.stdout).slice(0, 500)}`,
  );
  const values = parseStatusEnv(result.stdout);
  const key = values.get("PUBLISHABLE_KEY") || values.get("ANON_KEY") || "";
  requireCondition(
    key.startsWith("sb_publishable_") || key.startsWith("eyJ"),
    "Local Supabase did not expose a browser-safe publishable key.",
  );
  return key;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithBootRetry(path, init = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(`${GATEWAY_ORIGIN}${path}`, {
        ...init,
        redirect: "manual",
      });
      if (!RETRYABLE_STATUSES.has(response.status)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(Math.min(250 * attempt, 1500));
  }
  throw new Error(
    `Local runtime did not become ready: ${String(lastError?.message || lastError)}`,
  );
}

async function assertGateway() {
  const response = await fetchWithBootRetry("/");
  requireCondition(response.status === 200, `Local gateway returned HTTP ${response.status}`);
  requireCondition(
    response.headers.get("x-econovaria-local-gateway") === "connected-no-cache-v1",
    "Local gateway identity header is missing.",
  );
  await response.arrayBuffer();
}

async function assertFunctionResponse({ name, path, method, body, allowedStatuses, key }) {
  const response = await fetchWithBootRetry(path, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody = await response.text();
  const normalizedBody = responseBody.toLowerCase();

  requireCondition(
    allowedStatuses.has(response.status),
    `${name} returned unexpected HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
  );
  for (const marker of FORBIDDEN_BODY_MARKERS) {
    requireCondition(
      !normalizedBody.includes(marker),
      `${name} exposed runtime failure marker: ${marker}`,
    );
  }

  return { name, status: response.status, reachable: true };
}

async function main() {
  const key = localPublishableKey();
  await assertGateway();

  const probes = [];
  probes.push(await assertFunctionResponse({
    name: "classroom-api",
    path: "/functions/v1/classroom-api/staff/signup",
    method: "POST",
    body: {},
    allowedStatuses: new Set([400, 401, 403, 409, 422, 429]),
    key,
  }));
  probes.push(await assertFunctionResponse({
    name: "admin-api",
    path: "/functions/v1/admin-api/diagnostics/admin-console",
    method: "GET",
    allowedStatuses: new Set([200, 401, 403, 405, 409, 422, 429]),
    key,
  }));

  console.log(JSON.stringify({
    gatewayReachable: true,
    functions: probes,
    jwtBypassUsed: false,
    productionTouched: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: String(error?.message || error).slice(0, 3000),
    jwtBypassUsed: false,
    productionTouched: false,
  }));
  process.exitCode = 1;
});
