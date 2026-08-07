import { normalizeAdminError } from "../../core/error-envelope.js";

const LOCAL_ADMIN_API_PREFIX = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const PLAYER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const PROGRESSION_CODES = new Set([
  "progression_game_paused",
  "progression_game_ended",
  "progression_game_unavailable",
  "progression_idempotency_conflict",
  "progression_not_found",
  "progression_schema_not_applied",
  "rate_limit_exceeded",
  "rate_limit_service_unavailable",
]);

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    const error = new Error("Invalid game context.");
    error.status = 400;
    error.code = "GAME_CONTEXT_REQUIRED";
    throw normalizeAdminError(error);
  }
  return encodeURIComponent(token);
}

function requirePlayerToken(value) {
  const token = String(value || "").trim();
  if (!PLAYER_ID_PATTERN.test(token) || UUID_PATTERN.test(token)) {
    const error = new Error("Invalid progression player identifier.");
    error.status = 400;
    error.code = "INVALID_REQUEST";
    throw normalizeAdminError(error);
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    const error = new Error("Invalid correction request identity.");
    error.status = 400;
    error.code = "INVALID_REQUEST";
    throw normalizeAdminError(error);
  }
  return key;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = value == null || value === "" ? fallback : Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : fallback;
}

function progressionPath(gameId) {
  return `/games/${requireGameToken(gameId)}/progression`;
}

function safeProgressionCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return PROGRESSION_CODES.has(code) ? code : "";
}

function responseDiagnostic(response, payload) {
  const error = new Error("Progression request failed.");
  error.status = Number(response?.status || 0);
  error.code = String(payload?.code || payload?.error?.code || "").trim();
  error.retryable = payload?.retryable === true || payload?.error?.retryable === true;
  const retryAfter = Number(
    response?.headers?.get?.("retry-after")
      || payload?.retryAfterSeconds
      || payload?.error?.retryAfterSeconds
      || 0,
  );
  if (Number.isInteger(retryAfter) && retryAfter > 0) {
    error.retryAfterSeconds = Math.min(retryAfter, 3600);
  }
  return error;
}

function decoratedError(error, progressionCode = "") {
  const envelope = normalizeAdminError(error);
  return Object.freeze({
    ...envelope,
    progressionCode: safeProgressionCode(progressionCode),
  });
}

function invalidResponse(response) {
  const error = new Error("Invalid progression response.");
  error.status = Number(response?.status || 0);
  error.code = "INVALID_RESPONSE";
  error.retryable = true;
  return decoratedError(error);
}

async function requestJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  let unlinkAbort = () => {};
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else {
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      unlinkAbort = () => signal.removeEventListener("abort", abort);
    }
  }
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, boundedInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 250, 120_000));

  try {
    const response = await fetchImpl(`${LOCAL_ADMIN_API_PREFIX}${path}`, {
      method: String(method || "GET").toUpperCase(),
      headers: { Accept: "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = {};
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok) throw invalidResponse(response);
      }
    }

    if (!response.ok) {
      const diagnostic = responseDiagnostic(response, payload);
      throw decoratedError(diagnostic, payload?.code || payload?.error?.code);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw invalidResponse(response);
    }
    return payload;
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    if (timedOut) {
      const timeoutError = new Error("Progression request timed out.");
      timeoutError.status = 408;
      timeoutError.code = "REQUEST_TIMEOUT";
      throw decoratedError(timeoutError);
    }
    if (controller.signal.aborted) {
      const abortError = new Error("Progression request aborted.");
      abortError.name = "AbortError";
      throw decoratedError(abortError);
    }
    throw decoratedError(error);
  } finally {
    globalThis.clearTimeout(timeout);
    unlinkAbort();
  }
}

function validatePlayers(payload, response = null) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.players)) {
    throw invalidResponse(response);
  }
  return data;
}

function validateCorrections(payload, response = null) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.corrections)) {
    throw invalidResponse(response);
  }
  return data;
}

function validateCorrection(payload, response = null) {
  const data = payload?.data;
  const correction = data?.correction;
  if (
    !data
    || typeof data !== "object"
    || Array.isArray(data)
    || !["applied", "replayed"].includes(data.outcome)
    || !correction
    || typeof correction !== "object"
    || Array.isArray(correction)
  ) {
    throw invalidResponse(response);
  }
  return data;
}

/** Source-owned Admin v2 client for the existing progression review BFF contract. */
export function createProgressionApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Progression API fetch is unavailable.");
  }

  function readPlayers({ gameId, limit = 100, offset = 0, signal } = {}) {
    try {
      const base = progressionPath(gameId);
      const safeLimit = boundedInteger(limit, 100, 1, 100);
      const safeOffset = boundedInteger(offset, 0, 0, 10_000);
      return requestJson(
        fetchImpl,
        `${base}?limit=${safeLimit}&offset=${safeOffset}`,
        { signal, timeoutMs },
      ).then(validatePlayers);
    } catch (error) {
      return Promise.reject(error && typeof error === "object" && "userMessage" in error ? error : decoratedError(error));
    }
  }

  function readCorrections({
    gameId,
    playerId = "",
    limit = 100,
    offset = 0,
    signal,
  } = {}) {
    try {
      const base = `${progressionPath(gameId)}/corrections`;
      const safeLimit = boundedInteger(limit, 100, 1, 100);
      const safeOffset = boundedInteger(offset, 0, 0, 10_000);
      const query = new URLSearchParams({
        limit: String(safeLimit),
        offset: String(safeOffset),
      });
      const playerToken = String(playerId || "").trim();
      if (playerToken) {
        requirePlayerToken(playerToken);
        query.set("playerId", playerToken);
      }
      return requestJson(fetchImpl, `${base}?${query.toString()}`, {
        signal,
        timeoutMs,
      }).then(validateCorrections);
    } catch (error) {
      return Promise.reject(error && typeof error === "object" && "userMessage" in error ? error : decoratedError(error));
    }
  }

  function correctPlayer({
    gameId,
    playerId,
    command,
    idempotencyKey,
    signal,
  } = {}) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const target = requirePlayerToken(playerId);
      if (!command || typeof command !== "object" || Array.isArray(command)) {
        throw decoratedError(Object.assign(new Error("Invalid correction."), {
          status: 422,
          code: "VALIDATION_FAILED",
        }));
      }
      return requestJson(
        fetchImpl,
        `${progressionPath(gameId)}/players/${target}/corrections`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: { ...command, idempotencyKey: key },
          signal,
          timeoutMs,
        },
      ).then(validateCorrection);
    } catch (error) {
      return Promise.reject(error && typeof error === "object" && "userMessage" in error ? error : decoratedError(error));
    }
  }

  return Object.freeze({
    readPlayers,
    readCorrections,
    correctPlayer,
  });
}
