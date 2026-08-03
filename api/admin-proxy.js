"use strict";

const { proxyAdminBff } = require("./_admin-bff-proxy.js");

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 8_192;
const HEALTH_PATH = "__health";
const HEALTH_SERVICES = Object.freeze([
  "web-session-api",
  "player-web-session-api",
]);

module.exports = async function adminNamespaceProxy(request, response) {
  const path = request.query?.path;
  if (path === HEALTH_PATH) {
    return runtimeHealthRoute(request, response);
  }
  if (typeof path !== "string" || !path.trim()) {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.end(JSON.stringify({
      ok: false,
      error: {
        code: "invalid_proxy_path",
        message: "Administrator proxy path is invalid.",
        retryable: false,
      },
    }));
  }

  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path,
  };
  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });
};

async function runtimeHealthRoute(request, response) {
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    return sendHealthJson(response, 405, {
      ok: false,
      status: "unavailable",
      error: { code: "method_not_allowed" },
    });
  }

  try {
    const result = await checkRuntimeHealth();
    return sendHealthJson(response, result.ok ? 200 : 503, result);
  } catch {
    return sendHealthJson(response, 503, {
      ok: false,
      status: "unavailable",
      environment: "unknown",
      projectRef: null,
      sourceCommit: null,
      services: [],
    });
  }
}

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

  const configuration = readHealthConfiguration(environment);
  const checks = await Promise.all(
    HEALTH_SERVICES.map((service) => probeHealthService({
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
    checkedAt: new Date().toISOString(),
    services: Object.freeze(checks),
  });
}

function readHealthConfiguration(environment) {
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

async function probeHealthService({ service, supabaseUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImpl(
      `${supabaseUrl}/functions/v1/${service}/health`,
      {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );
    const payload = await readBoundedJson(upstream);
    return Object.freeze({
      service,
      ok: upstream.ok && payload?.ok === true && payload?.status === "ready",
      status: upstream.status,
    });
  } catch {
    return Object.freeze({ service, ok: false, status: 0 });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sendHealthJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end(JSON.stringify(body));
}

module.exports.__healthTest = Object.freeze({
  checkRuntimeHealth,
  readHealthConfiguration,
});
