"use strict";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DEFAULT_TIMEOUT_MS = 5_000;
const HEALTH_SERVICES = Object.freeze([
  "web-session-api",
  "player-web-session-api",
]);

module.exports = async function runtimeHealthRoute(request, response) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    return sendJson(response, 405, {
      ok: false,
      status: "unavailable",
      error: { code: "method_not_allowed" },
    });
  }

  try {
    const result = await checkRuntimeHealth();
    return sendJson(response, result.ok ? 200 : 503, result);
  } catch (_) {
    return sendJson(response, 503, {
      ok: false,
      status: "unavailable",
      environment: "unknown",
      projectRef: null,
      sourceCommit: null,
      services: [],
    });
  }
};

async function checkRuntimeHealth({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Runtime health requires a fetch implementation.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15_000) {
    throw new Error("Runtime health timeout is invalid.");
  }

  const configuration = readConfiguration(environment);
  const checks = await Promise.all(
    HEALTH_SERVICES.map((service) => probeService({
      service,
      supabaseUrl: configuration.supabaseUrl,
      fetchImpl,
      timeoutMs,
    })),
  );
  const ok = checks.every((check) => check.ok);
  return Object.freeze({
    ok,
    status: ok ? "ready" : "degraded",
    environment: configuration.environment,
    projectRef: configuration.projectRef,
    sourceCommit: configuration.sourceCommit,
    services: Object.freeze(checks),
  });
}

function readConfiguration(environment) {
  const environmentName = String(
    environment.ECONOVARIA_ENVIRONMENT || "",
  ).trim().toLowerCase();
  const projectRef = String(
    environment.ECONOVARIA_PROJECT_REF || "",
  ).trim().toLowerCase();
  const supabaseUrl = String(
    environment.ECONOVARIA_SUPABASE_URL || "",
  ).trim().replace(/\/+$/u, "");
  const sourceCandidate = String(
    environment.VERCEL_GIT_COMMIT_SHA || environment.ECONOVARIA_SOURCE_SHA || "",
  ).trim().toLowerCase();

  if (!new Set(["staging", "production"]).has(environmentName)) {
    throw new Error("Runtime environment is invalid.");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error("Runtime project ref is invalid.");
  }

  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("Runtime Supabase URL is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== `${projectRef}.supabase.co` ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Runtime Supabase URL does not match the project ref.");
  }

  return Object.freeze({
    environment: environmentName,
    projectRef,
    supabaseUrl,
    sourceCommit: SOURCE_SHA_PATTERN.test(sourceCandidate)
      ? sourceCandidate
      : null,
  });
}

async function probeService({ service, supabaseUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${supabaseUrl}/functions/v1/${service}/health`,
      {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );
    const payload = await readBoundedJson(response);
    return Object.freeze({
      service,
      ok: response.ok && payload?.ok === true && payload?.status === "ready",
      status: response.status,
    });
  } catch (_) {
    return Object.freeze({ service, ok: false, status: 0 });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 8_192) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

module.exports.__test = Object.freeze({
  checkRuntimeHealth,
  readConfiguration,
});
