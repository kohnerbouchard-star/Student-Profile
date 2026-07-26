import { createHash, createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 20_000;
const RUNNER_NAME = "stock-market-runner";
const TIMESTAMP_HEADER = "x-econovaria-runner-timestamp";
const NONCE_HEADER = "x-econovaria-runner-nonce";
const SIGNATURE_HEADER = "x-econovaria-runner-signature";

export function buildStockMarketTickRequest(
  environment = process.env,
  {
    now = () => new Date(),
    nonceFactory = randomUUID,
  } = {},
) {
  const supabaseUrl = requiredUrl(environment.SUPABASE_URL, "SUPABASE_URL");
  const publishableKey = requiredPublishableKey(
    environment.SUPABASE_PUBLISHABLE_KEY || environment.PUBLISHABLE_KEY,
  );
  const runnerSecret = requiredSecret(
    environment.STOCK_MARKET_RUNNER_SECRET,
    "STOCK_MARKET_RUNNER_SECRET",
  );
  const gameSessionId = requiredUuid(
    environment.STOCK_MARKET_GAME_SESSION_ID,
    "STOCK_MARKET_GAME_SESSION_ID",
  );
  const tickIndex = optionalPositiveInteger(environment.STOCK_MARKET_TICK_INDEX);
  const seed = optionalText(environment.STOCK_MARKET_TICK_SEED, 200);
  const url = new URL("/functions/v1/stock-market-runner", supabaseUrl).toString();
  const body = Object.freeze({
    action: "run_tick",
    gameSessionId,
    ...(tickIndex === null ? {} : { tickIndex }),
    ...(seed === null ? {} : { seed }),
  });
  const bodyText = JSON.stringify(body);
  const timestampSeconds = Math.floor(normalizedNow(now).getTime() / 1000);
  const nonce = requiredUuid(nonceFactory(), "internal runner nonce");
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const canonicalPayload = buildInternalRunnerSignaturePayload({
    runnerName: RUNNER_NAME,
    timestampSeconds,
    nonce,
    method: "POST",
    url,
    bodyHash,
  });
  const signature = createHmac("sha256", runnerSecret)
    .update(canonicalPayload)
    .digest("base64url");

  return Object.freeze({
    url,
    headers: Object.freeze({
      apikey: publishableKey,
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: String(timestampSeconds),
      [NONCE_HEADER]: nonce,
      [SIGNATURE_HEADER]: `v1=${signature}`,
    }),
    body,
    bodyText,
  });
}

export function buildInternalRunnerSignaturePayload(input) {
  const url = new URL(input.url);
  return [
    "econovaria-internal-runner-v1",
    `runner:${String(input.runnerName || "").trim().toLowerCase()}`,
    `timestamp:${input.timestampSeconds}`,
    `nonce:${String(input.nonce || "").trim().toLowerCase()}`,
    `method:${String(input.method || "").trim().toUpperCase()}`,
    `origin:${url.origin}`,
    `path:${url.pathname}${url.search}`,
    `body-sha256:${String(input.bodyHash || "").trim().toLowerCase()}`,
  ].join("\n");
}

export async function triggerStockMarketTick({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now,
  nonceFactory,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError("timeoutMs must be an integer between 1 and 120000.");
  }

  const request = buildStockMarketTickRequest(environment, {
    ...(now ? { now } : {}),
    ...(nonceFactory ? { nonceFactory } : {}),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.bodyText,
      signal: controller.signal,
    });
    const payload = await readJsonResponse(response);

    if (!response.ok || payload?.ok !== true) {
      const code = payload?.error?.code || `http_${response.status}`;
      const error = new Error(
        payload?.error?.message || `Stock market tick failed with ${response.status}.`,
      );
      error.code = code;
      error.status = response.status;
      throw error;
    }

    return Object.freeze({
      ok: true,
      gameSessionId: String(payload.gameSessionId || request.body.gameSessionId),
      tickIndex: Number(payload.tickIndex),
      assetsProcessed: Number(payload.assetsProcessed || 0),
      ticksInserted: Number(payload.ticksInserted || 0),
      generatedAt: String(payload.generatedAt || ""),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Stock market runner returned non-JSON output.");
    error.code = "invalid_runner_response";
    error.status = response.status;
    throw error;
  }
}

function requiredUrl(value, name) {
  const text = requiredSecret(value, name);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
  if (url.protocol !== "https:" && !isLocalhost(url)) {
    throw new Error(`${name} must use HTTPS outside localhost.`);
  }
  return url.toString();
}

function isLocalhost(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function requiredSecret(value, name) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function requiredPublishableKey(value) {
  const key = requiredSecret(value, "SUPABASE_PUBLISHABLE_KEY");
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY must use the sb_publishable_ format.");
  }
  return key;
}

function requiredUuid(value, name) {
  const text = requiredSecret(value, name).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return text;
}

function normalizedNow(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Internal runner timestamp source is invalid.");
  }
  return date;
}

function optionalPositiveInteger(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("STOCK_MARKET_TICK_INDEX must be a non-negative integer.");
  }
  return number;
}

function optionalText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new Error(`STOCK_MARKET_TICK_SEED must be at most ${maxLength} characters.`);
  }
  return text;
}

async function main() {
  try {
    const result = await triggerStockMarketTick();
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        gameSessionId: result.gameSessionId,
        tickIndex: result.tickIndex,
        assetsProcessed: result.assetsProcessed,
        ticksInserted: result.ticksInserted,
        generatedAt: result.generatedAt,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code: String(error?.code || "stock_market_tick_trigger_failed"),
        status: Number(error?.status || 1),
        message: String(error?.message || "Stock market tick trigger failed."),
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
