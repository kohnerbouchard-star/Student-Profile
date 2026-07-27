#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const PACK_ID = "econovaria.beta-seed-pack.v1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseStatusEnv(source) {
  const values = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
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
    if (key) values[key] = value;
  }
  return values;
}

function inspectLocalStack() {
  const result = spawnSync(
    "npx",
    ["supabase", "status", "-o", "env", "--workdir", "backend"],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("Local Supabase is not running or could not be inspected.");
  }
  const values = parseStatusEnv(result.stdout);
  const apiUrl = String(values.API_URL || "").replace(/\/+$/, "");
  const publishableKey = String(values.PUBLISHABLE_KEY || "").trim();
  const backendKey = String(
    values.SECRET_KEY || values.SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  const databaseUrl = String(
    values.DB_URL || values.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ).trim();

  if (!apiUrl || !publishableKey || !backendKey || !databaseUrl) {
    throw new Error(
      "Local Supabase status is missing API_URL, PUBLISHABLE_KEY, backend secret, or database URL.",
    );
  }
  const api = new URL(apiUrl);
  const database = new URL(databaseUrl);
  if (!LOOPBACK_HOSTS.has(api.hostname) || !LOOPBACK_HOSTS.has(database.hostname)) {
    throw new Error("Local readiness checks refuse non-loopback Supabase or database URLs.");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Local Supabase did not expose an sb_publishable_ key.");
  }

  return { apiUrl, publishableKey, backendKey, databaseUrl };
}

function rpcHeaders(backendKey) {
  const headers = {
    apikey: backendKey,
    "content-type": "application/json",
    accept: "application/json",
  };
  if (backendKey.startsWith("eyJ")) {
    headers.authorization = `Bearer ${backendKey}`;
  }
  return headers;
}

async function callPreflight(runtime) {
  const response = await fetch(
    `${runtime.apiUrl}/rest/v1/rpc/game_provisioning_preflight_v1`,
    {
      method: "POST",
      headers: rpcHeaders(runtime.backendKey),
      body: JSON.stringify({ p_pack_id: PACK_ID }),
      cache: "no-store",
    },
  );
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, body, text };
}

function postgrestCacheMiss(result) {
  const code = String(result.body?.code || "");
  const message = String(result.body?.message || result.text || "");
  return result.response.status === 404 || code === "PGRST202" || /schema cache/i.test(message);
}

function reloadSchema(databaseUrl) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", "notify pgrst, 'reload schema';"],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("PostgREST schema cache reload failed for the local database.");
  }
}

function directPreflight(databaseUrl) {
  const sql = `select public.game_provisioning_preflight_v1('${PACK_ID}')::text;`;
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: sanitize(result.stderr || ""),
  };
}

function sanitize(value) {
  return String(value || "")
    .replace(UUID, "[uuid-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key-redacted]")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[jwt-redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]")
    .slice(0, 1500);
}

function safeEvidence(body) {
  const counts = body && typeof body === "object" ? body.counts : null;
  return {
    ready: body?.ready === true,
    packId: String(body?.packId || ""),
    packVersion: String(body?.packVersion || ""),
    counts: counts && typeof counts === "object" ? counts : {},
  };
}

async function main() {
  const runtime = inspectLocalStack();
  let result = await callPreflight(runtime);

  if (!result.response.ok && postgrestCacheMiss(result)) {
    reloadSchema(runtime.databaseUrl);
    await new Promise((resolve) => setTimeout(resolve, 750));
    result = await callPreflight(runtime);
  }

  if (!result.response.ok || result.body?.ready !== true) {
    const direct = directPreflight(runtime.databaseUrl);
    if (direct.ok) {
      throw new Error(
        `Provisioning preflight succeeds in PostgreSQL but failed through PostgREST (${result.response.status}). ` +
        `The Edge service cannot safely create a game until the RPC gateway is healthy.`,
      );
    }
    throw new Error(
      `Provisioning preflight failed (${result.response.status}). ` +
      `${sanitize(result.body?.message || result.text || direct.stderr || "Unknown preflight failure.")}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      service: "local-auth-readiness",
      publishableKeyAvailable: true,
      privilegedKeyBrowserExposed: false,
      provisioning: safeEvidence(result.body),
    })}\n`,
  );
}

main().catch((error) => {
  fail(`Econovaria local security readiness failed: ${sanitize(error?.message || error)}`);
});
