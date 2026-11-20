#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "http://127.0.0.1:4173";
const DEFAULT_POLL_MS = 500;
const DEFAULT_STABLE_WAVES = 3;
const DEFAULT_SETTLE_MS = 1_000;
const DEFAULT_RECOVERY_ATTEMPTS = 2;
const MAX_RECOVERY_ATTEMPTS = 2;
const MAX_READINESS_WAVES_PER_RECOVERY = 6;
const DEFAULT_GATEWAY_REQUEST_TIMEOUT_SECONDS = 180;
const MINIMUM_GATEWAY_REQUEST_TIMEOUT_SECONDS = 30;
const MAXIMUM_GATEWAY_REQUEST_TIMEOUT_SECONDS = 300;
const PROBE_TIMEOUT_GRACE_MS = 5_000;
const STATIC_PROBE_TIMEOUT_MS = 5_000;
const RECOVERY_TIMEOUT_GRACE_MS = 30_000;
const DOCKER_COMMAND_TIMEOUT_MS = 30_000;
const DIAGNOSTIC_TIMEOUT_MS = 1_000;
const DIAGNOSTIC_MAX_BYTES = 4_096;
const STATE_FORMAT = '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"status":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}}}';
const EDGE_CONTAINER_PATTERN = /^supabase_edge_runtime_[A-Za-z0-9_.-]+$/u;
const KONG_CONTAINER_PATTERN = /^supabase_kong_[A-Za-z0-9_.-]+$/u;
const READY_TARGETS = Object.freeze([
  Object.freeze({
    path: "/",
    proxied: false,
    method: "GET",
    includeOrigin: false,
  }),
  Object.freeze({
    path: "/functions/v1/player-api",
    proxied: true,
    method: "OPTIONS",
    includeOrigin: true,
  }),
  Object.freeze({
    path: "/functions/v1/player-web-session-api",
    proxied: true,
    method: "OPTIONS",
    includeOrigin: true,
  }),
  Object.freeze({
    path: "/functions/v1/bootstrap-api/health",
    proxied: true,
    method: "GET",
    includeOrigin: false,
  }),
]);

export async function restartLocalEdgeRuntime({
  baseUrl = process.env.ECONOVARIA_BROWSER_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs,
  pollMs = DEFAULT_POLL_MS,
  stableWaves = DEFAULT_STABLE_WAVES,
  settleMs = DEFAULT_SETTLE_MS,
  recoveryAttempts = DEFAULT_RECOVERY_ATTEMPTS,
  execFile = execFileSync,
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile,
  sleep = delay,
  now = Date.now,
  log = console.log,
} = {}) {
  if (typeof execFile !== "function") throw new TypeError("An executable runner is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  if (typeof readFileImpl !== "function") throw new TypeError("A file reader is required.");
  if (typeof sleep !== "function") throw new TypeError("A sleep implementation is required.");
  if (typeof now !== "function") throw new TypeError("A clock is required.");
  if (!Number.isInteger(stableWaves) || stableWaves < 1) {
    throw new TypeError("stableWaves must be a positive integer.");
  }
  if (!Number.isFinite(settleMs) || settleMs < 0) {
    throw new TypeError("settleMs must be a non-negative number.");
  }
  if (
    !Number.isInteger(recoveryAttempts) ||
    recoveryAttempts < 1 ||
    recoveryAttempts > MAX_RECOVERY_ATTEMPTS
  ) {
    throw new TypeError(`recoveryAttempts must be between 1 and ${MAX_RECOVERY_ATTEMPTS}.`);
  }

  const normalizedBaseUrl = normalizeLocalBaseUrl(baseUrl);
  const gatewayRequestTimeoutMs = configuredGatewayRequestTimeoutMs();
  const probeTimeoutMs = gatewayRequestTimeoutMs + PROBE_TIMEOUT_GRACE_MS;
  const recoveryTimeoutMs = timeoutMs ?? probeTimeoutMs + RECOVERY_TIMEOUT_GRACE_MS;
  if (!Number.isFinite(recoveryTimeoutMs) || recoveryTimeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number.");
  }
  if (!Number.isFinite(pollMs) || pollMs < 0) {
    throw new TypeError("pollMs must be a non-negative number.");
  }

  const containers = discoverRuntimeContainers(execFile);
  const publishableKey = await localPublishableKey(readFileImpl);
  const startedAt = now();
  let readinessWaves = 0;
  let lastReadyWaves = 0;
  let lastStatuses = [];
  let lastFailure = "not_started";

  for (let recoveryAttempt = 1; recoveryAttempt <= recoveryAttempts; recoveryAttempt += 1) {
    const running = (phase) => runtimeContainersAreRunning(execFile, containers, (role, cause) => {
      try { observeRunningFailure({ execFile, containers, role, cause, recoveryAttempt, phase, log }); }
      catch { /* Diagnostics cannot replace the original running-check result. */ }
    });
    try {
      restartExactRuntimeContainers(execFile, containers);
    } catch {
      lastFailure = "container_restart_failed";
      continue;
    }

    const recoveryStartedAt = now();
    let recoveryReadinessWaves = 0;
    let consecutiveReadyWaves = 0;

    while (
      recoveryReadinessWaves < MAX_READINESS_WAVES_PER_RECOVERY &&
      now() - recoveryStartedAt <= recoveryTimeoutMs
    ) {
      if (!running("before_probe")) {
        lastFailure = "container_not_running";
        break;
      }

      readinessWaves += 1;
      recoveryReadinessWaves += 1;
      lastStatuses = [];
      let waveReady = true;

      for (const target of READY_TARGETS) {
        const remainingMs = recoveryTimeoutMs - (now() - recoveryStartedAt);
        if (
          remainingMs < 0 ||
          (target.proxied && remainingMs < probeTimeoutMs)
        ) {
          waveReady = false;
          lastFailure = "recovery_timeout";
          break;
        }
        const status = await probeReadinessTarget({
          baseUrl: normalizedBaseUrl,
          target,
          publishableKey,
          probeTimeoutMs,
          fetchImpl,
        });
        lastStatuses.push(status);
        if (!isAcceptedReadinessStatus(target, status)) {
          waveReady = false;
          lastFailure = "readiness_probe_failed";
          break;
        }
      }

      if (waveReady && lastStatuses.length === READY_TARGETS.length) {
        consecutiveReadyWaves += 1;
        lastReadyWaves = consecutiveReadyWaves;
        if (consecutiveReadyWaves >= stableWaves) {
          if (settleMs > 0) await sleep(settleMs);
          if (!running("after_settle")) {
            lastFailure = "container_not_running_after_settle";
            break;
          }
          const result = Object.freeze({
            ready: true,
            recoveryAttempt,
            recoveryAttempts,
            readinessWaves,
            stableWaves: consecutiveReadyWaves,
            settleMs,
            pathsChecked: READY_TARGETS.length,
            elapsedMs: now() - startedAt,
          });
          log(JSON.stringify({ event: "local_edge_runtime_isolated", ...result }));
          return result;
        }
      } else {
        consecutiveReadyWaves = 0;
        lastReadyWaves = 0;
        if (!running("after_probe_failure")) {
          lastFailure = "container_not_running";
          break;
        }
      }

      if (now() - recoveryStartedAt > recoveryTimeoutMs) {
        lastFailure = "recovery_timeout";
        break;
      }
      if (pollMs > 0) await sleep(pollMs);
    }
  }

  throw new Error(
    `Local Edge runtime did not become stable after ${recoveryAttempts} bounded recovery attempts; ` +
      `reason=${lastFailure}; statuses=${lastStatuses.join(",")}; ` +
      `readyWaves=${lastReadyWaves}/${stableWaves}.`,
  );
}

function configuredGatewayRequestTimeoutMs() {
  const raw = process.env.ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS ||
    String(DEFAULT_GATEWAY_REQUEST_TIMEOUT_SECONDS);
  const seconds = Number(raw);
  if (
    !Number.isFinite(seconds) ||
    seconds < MINIMUM_GATEWAY_REQUEST_TIMEOUT_SECONDS ||
    seconds > MAXIMUM_GATEWAY_REQUEST_TIMEOUT_SECONDS
  ) {
    throw new Error(
      "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS must match the bounded local gateway contract.",
    );
  }
  return seconds * 1_000;
}

function discoverRuntimeContainers(execFile) {
  const output = String(execFile("docker", ["ps", "-a", "--format", "{{.Names}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: DOCKER_COMMAND_TIMEOUT_MS,
  }) || "");
  const names = output
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return Object.freeze({
    edge: exactContainerName(names, EDGE_CONTAINER_PATTERN, "Edge runtime"),
    kong: exactContainerName(names, KONG_CONTAINER_PATTERN, "Kong gateway"),
  });
}

function exactContainerName(names, pattern, label) {
  const candidates = names.filter((value) => pattern.test(value));
  if (candidates.length !== 1) {
    throw new Error(`Expected one local ${label} container, found ${candidates.length}.`);
  }
  return candidates[0];
}

function restartExactRuntimeContainers(execFile, containers) {
  for (const containerName of [containers.edge, containers.kong]) {
    execFile("docker", ["restart", containerName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: DOCKER_COMMAND_TIMEOUT_MS,
    });
  }
}

function isAcceptedReadinessStatus(target, status) {
  return target.method === "OPTIONS"
    ? status === 200 || status === 204
    : status === 200;
}

function runtimeContainersAreRunning(execFile, containers, observeFailure) {
  return [["edge", containers.edge], ["kong", containers.kong]].every(([role, containerName]) => {
    try {
      const output = String(execFile(
        "docker",
        ["inspect", "--format", "{{.State.Running}}", containerName],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: DOCKER_COMMAND_TIMEOUT_MS,
        },
      ) || "").trim();
      if (output !== "true") observeFailure(role, { type: output === "false" ? "reported_not_running" : "unrecognized_running_state" });
      return output === "true";
    } catch (error) {
      observeFailure(role, { type: "inspect_failure", error });
      return false;
    }
  });
}

function safeProcessFailure(error) {
  return {
    code: ["ENOENT", "EACCES", "EPERM", "ETIMEDOUT", "ENOBUFS"].includes(error?.code) ? error.code : "other",
    status: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : null,
    signal: ["SIGTERM", "SIGKILL", "SIGABRT"].includes(error?.signal) ? error.signal : null,
  };
}

// Additional read-only snapshot, never a replacement for the original boolean gate.
function observeRunningFailure({ execFile, containers, role, cause, recoveryAttempt, phase, log }) {
  const receipt = { event: "local_edge_runtime_running_check_failed", role, recoveryAttempt, phase,
    condition: cause.type, available: false, errorClass: "diagnostic_unavailable" };
  try {
    if (cause.error) receipt.inspectFailure = safeProcessFailure(cause.error);
    const project = readFileSync(new URL("../backend/supabase/config.toml", import.meta.url), "utf8")
      .match(/^\s*project_id\s*=\s*"([A-Za-z0-9_.-]+)"\s*$/mu)?.[1];
    const name = containers[role];
    if (!project || containers.edge !== `supabase_edge_runtime_${project}` || containers.kong !== `supabase_kong_${project}`) {
      receipt.errorClass = "ownership_unverified"; return;
    }
    if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== "unix:///var/run/docker.sock") {
      receipt.errorClass = "local_docker_unverified"; return;
    }
    const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: DIAGNOSTIC_TIMEOUT_MS, maxBuffer: DIAGNOSTIC_MAX_BYTES };
    const context = String(execFile("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], options));
    if (Buffer.byteLength(context) > DIAGNOSTIC_MAX_BYTES || JSON.parse(context) !== "unix:///var/run/docker.sock") {
      receipt.errorClass = "local_docker_unverified"; return;
    }
    const raw = String(execFile("docker", ["inspect", "--format", STATE_FORMAT, name], options));
    if (Buffer.byteLength(raw) > DIAGNOSTIC_MAX_BYTES) { receipt.errorClass = "diagnostic_oversized"; return; }
    const state = JSON.parse(raw);
    if (state.name !== `/${name}` || state.project !== project || !/^[a-f0-9]{64}$/u.test(state.id)) {
      receipt.errorClass = "ownership_unverified"; return;
    }
    const safeTime = (value) => typeof value === "string" && value.length <= 40 && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/u.test(value) ? value : null;
    receipt.available = true; receipt.errorClass = "none";
    receipt.postCheckState = {
      running: typeof state.running === "boolean" ? state.running : null,
      status: ["created", "running", "paused", "restarting", "removing", "exited", "dead"].includes(state.status) ? state.status : null,
      exitCode: Number.isInteger(state.exitCode) && state.exitCode >= 0 && state.exitCode <= 255 ? state.exitCode : null,
      oomKilled: typeof state.oomKilled === "boolean" ? state.oomKilled : null,
      startedAt: safeTime(state.startedAt), finishedAt: safeTime(state.finishedAt),
    };
    if (Buffer.byteLength(JSON.stringify(receipt)) > DIAGNOSTIC_MAX_BYTES) throw new Error("Diagnostic size limit");
  } catch (error) {
    delete receipt.postCheckState; receipt.available = false; receipt.errorClass = "diagnostic_inspect_failed";
    receipt.diagnosticFailure = safeProcessFailure(error);
  } finally {
    try { log(JSON.stringify(receipt)); } catch { /* The original readiness failure remains primary. */ }
  }
}

async function probeReadinessTarget({
  baseUrl,
  target,
  publishableKey,
  probeTimeoutMs,
  fetchImpl,
}) {
  try {
    const headers = target.proxied
      ? {
          apikey: publishableKey,
          ...(target.includeOrigin ? { Origin: new URL(baseUrl).origin } : {}),
        }
      : undefined;
    const response = await fetchImpl(`${baseUrl}${target.path}`, {
      method: target.method,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(
        target.proxied ? probeTimeoutMs : STATIC_PROBE_TIMEOUT_MS,
      ),
    });
    await response.body?.cancel().catch(() => {});
    return response.status;
  } catch {
    return 0;
  }
}

async function localPublishableKey(readFileImpl) {
  const source = await readFileImpl(
    new URL("../runtime-config.env.js", import.meta.url),
    "utf8",
  );
  const match = String(source).match(/Object\.freeze\((\{[\s\S]*\})\);?/u);
  if (!match) throw new Error("Local runtime configuration could not be parsed.");
  const config = JSON.parse(match[1]);
  const value = String(config.supabasePublishableKey || "").trim();
  if (!value.startsWith("sb_publishable_") || value.length > 512) {
    throw new Error("Local browser-safe publishable key is unavailable.");
  }
  return value;
}

function normalizeLocalBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("Local gateway URL is invalid.");
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Edge isolation is restricted to the local acceptance gateway.");
  }
  return parsed.origin;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
