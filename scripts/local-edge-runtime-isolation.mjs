#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const DEFAULT_BASE_URL = "http://127.0.0.1:4173";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 500;
const DEFAULT_STABLE_WAVES = 3;
const DEFAULT_SETTLE_MS = 1_000;
const EDGE_CONTAINER_PATTERN = /^supabase_edge_runtime_[A-Za-z0-9_.-]+$/u;
const READY_PATHS = Object.freeze([
  "/functions/v1/player-api",
  "/functions/v1/player-web-session-api",
]);

export async function restartLocalEdgeRuntime({
  baseUrl = process.env.ECONOVARIA_BROWSER_BASE_URL || DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  stableWaves = DEFAULT_STABLE_WAVES,
  settleMs = DEFAULT_SETTLE_MS,
  execFile = execFileSync,
  fetchImpl = globalThis.fetch,
  readFileImpl = readFile,
  sleep = delay,
  log = console.log,
} = {}) {
  if (typeof execFile !== "function") throw new TypeError("An executable runner is required.");
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  if (typeof readFileImpl !== "function") throw new TypeError("A file reader is required.");
  if (typeof sleep !== "function") throw new TypeError("A sleep implementation is required.");
  if (!Number.isInteger(stableWaves) || stableWaves < 1) {
    throw new TypeError("stableWaves must be a positive integer.");
  }
  if (!Number.isFinite(settleMs) || settleMs < 0) {
    throw new TypeError("settleMs must be a non-negative number.");
  }

  const normalizedBaseUrl = normalizeLocalBaseUrl(baseUrl);
  const containerName = discoverEdgeRuntimeContainer(execFile);
  execFile("docker", ["restart", containerName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const publishableKey = await localPublishableKey(readFileImpl);
  const startedAt = Date.now();
  let attempts = 0;
  let consecutiveReadyWaves = 0;
  let lastStatuses = [];

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    lastStatuses = await Promise.all(READY_PATHS.map(async (path) => {
      try {
        const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
          method: "OPTIONS",
          headers: {
            apikey: publishableKey,
            Origin: new URL(normalizedBaseUrl).origin,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(5_000, timeoutMs)),
        });
        await response.body?.cancel().catch(() => {});
        return response.status;
      } catch {
        return 0;
      }
    }));

    if (lastStatuses.every((status) => status === 200 || status === 204)) {
      consecutiveReadyWaves += 1;
      if (consecutiveReadyWaves >= stableWaves) {
        if (settleMs > 0) await sleep(settleMs);
        const result = Object.freeze({
          ready: true,
          attempts,
          stableWaves: consecutiveReadyWaves,
          settleMs,
          pathsChecked: READY_PATHS.length,
          elapsedMs: Date.now() - startedAt,
        });
        log(JSON.stringify({ event: "local_edge_runtime_isolated", ...result }));
        return result;
      }
    } else {
      consecutiveReadyWaves = 0;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Local Edge runtime did not become stable; statuses=${lastStatuses.join(",")}; readyWaves=${consecutiveReadyWaves}/${stableWaves}.`,
  );
}

function discoverEdgeRuntimeContainer(execFile) {
  const output = String(execFile("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }) || "");
  const candidates = output
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => EDGE_CONTAINER_PATTERN.test(value));
  if (candidates.length !== 1) {
    throw new Error(`Expected one local Edge runtime container, found ${candidates.length}.`);
  }
  return candidates[0];
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
