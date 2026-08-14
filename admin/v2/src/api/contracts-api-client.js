import { normalizeAdminError } from "../core/error-envelope.js";

const ADMIN_API_BASE_PATH = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

class ContractTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
    fieldErrors = {},
  } = {}) {
    super("Contracts request failed.");
    this.name = "ContractTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fieldErrors = fieldErrors;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 250 && numeric <= 120_000
    ? Math.round(numeric)
    : fallback;
}

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new ContractTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requireUuid(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(token)) {
    throw new ContractTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ContractTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function canonicalResponseCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  if (["staff_mfa_required", "aal2_required"].includes(code.toLowerCase())) {
    return "MFA_REQUIRED";
  }
  return code;
}

function bodyDiagnostic(payload, response) {
  const bodyError = isRecord(payload?.error) ? payload.error : {};
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  return new ContractTransportDiagnostic({
    status: Number(response.status || 0),
    code: canonicalResponseCode(bodyError.code || payload?.code),
    requestId: String(
      response.headers?.get?.("x-request-id")
        || bodyError.requestId
        || payload?.requestId
        || "",
    ),
    retryable: bodyError.retryable === true || payload?.retryable === true,
    fieldErrors: bodyError.fieldErrors || payload?.fieldErrors || {},
    retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter, 3600)
      : null,
  });
}

function invalidResponse(response) {
  return new ContractTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: response?.headers?.get?.("x-request-id") || "",
    retryable: true,
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw new ContractTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }
  if (!response.ok) throw bodyDiagnostic(payload, response);
  if (!isRecord(payload)) throw invalidResponse(response);
  return payload;
}

function linkAbortSignal(sourceSignal, targetController) {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    targetController.abort(sourceSignal.reason);
    return () => {};
  }
  const abort = () => targetController.abort(sourceSignal.reason);
  sourceSignal.addEventListener("abort", abort, { once: true });
  return () => sourceSignal.removeEventListener("abort", abort);
}

function serializeJsonBody(body) {
  if (body === undefined) return undefined;
  try {
    return JSON.stringify(body);
  } catch (_error) {
    throw new ContractTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
}

function safeError(error, { timedOut = false, aborted = false } = {}) {
  if (error && typeof error === "object" && "userMessage" in error) return error;
  const networkError = !timedOut && !aborted && !(error instanceof ContractTransportDiagnostic);
  return normalizeAdminError(error, {
    timedOut,
    networkError,
    code: aborted ? "REQUEST_ABORTED" : "",
    fieldErrors: error?.fieldErrors,
  });
}

async function requestJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  validate,
} = {}) {
  const controller = new AbortController();
  const unlinkAbort = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeTimeout(timeoutMs));
  try {
    const serialized = serializeJsonBody(body);
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(serialized === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(serialized === undefined ? {} : { body: serialized }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const payload = await parseJsonResponse(response);
    return validate ? validate(payload, response) : payload;
  } catch (error) {
    throw safeError(error, {
      timedOut,
      aborted: !timedOut && controller.signal.aborted,
    });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
}

function validateContracts(payload, response) {
  if (!isRecord(payload.data) || !Array.isArray(payload.data.contracts)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateProgress(payload, response) {
  if (payload.ok !== true || !isRecord(payload.contract) || !Array.isArray(payload.progress)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateSubmissions(payload, response) {
  const data = payload?.data;
  if (!isRecord(data) || (!Array.isArray(data.contractSubmissions) && !Array.isArray(data.submissions))) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateContractMutation(payload, response) {
  const contract = payload?.contract || payload?.data?.contract;
  if (!isRecord(contract)) throw invalidResponse(response);
  return payload;
}

function validateProgressMutation(payload, response) {
  if (payload.ok !== true || !isRecord(payload.progress)) throw invalidResponse(response);
  return payload;
}

function validateRewardMutation(payload, response) {
  if (payload.ok !== true || !isRecord(payload.progress) || !isRecord(payload.rewardResult)) {
    throw invalidResponse(response);
  }
  return payload;
}

function asRejected(error) {
  return Promise.reject(safeError(error));
}

function contractCollectionPath(gameId) {
  return `/games/${requireGameToken(gameId)}/contracts`;
}

function contractPath(gameId, contractId, suffix = "") {
  return `${contractCollectionPath(gameId)}/${requireUuid(contractId)}${suffix}`;
}

/** Cookie-bound Admin BFF adapter for the source-owned Contracts V2 route. */
export function createContractsApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Contracts API fetch is unavailable.");

  let listController = null;
  let detailController = null;
  const inFlightMutations = new Map();

  function readContracts({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      listController?.abort();
      const controller = new AbortController();
      listController = controller;
      const unlink = linkAbortSignal(signal, controller);
      return requestJson(fetchImpl, contractCollectionPath(gameId), {
        signal: controller.signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateContracts,
      }).finally(() => {
        unlink();
        if (listController === controller) listController = null;
      });
    } catch (error) {
      return asRejected(error);
    }
  }

  function cancelContractsRequest() {
    if (!listController) return false;
    listController.abort();
    listController = null;
    return true;
  }

  async function readContractDetail({ gameId, contractId, signal, timeoutMs: requestTimeoutMs } = {}) {
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    const unlink = linkAbortSignal(signal, controller);
    try {
      const requestTimeout = normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs));
      const [progress, submissions] = await Promise.all([
        requestJson(fetchImpl, contractPath(gameId, contractId, "/progress"), {
          signal: controller.signal,
          timeoutMs: requestTimeout,
          validate: validateProgress,
        }),
        requestJson(fetchImpl, contractPath(gameId, contractId, "/submissions"), {
          signal: controller.signal,
          timeoutMs: requestTimeout,
          validate: validateSubmissions,
        }),
      ]);
      return Object.freeze({ progress, submissions });
    } catch (error) {
      throw safeError(error);
    } finally {
      unlink();
      if (detailController === controller) detailController = null;
    }
  }

  function cancelContractDetailRequest() {
    if (!detailController) return false;
    detailController.abort();
    detailController = null;
    return true;
  }

  function mutation({ method = "POST", path, body = {}, idempotencyKey, validate, signal }) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const fingerprint = serializeJsonBody({ method, path, body });
      const existing = inFlightMutations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return asRejected(new ContractTransportDiagnostic({ status: 409, code: "CONFLICT" }));
        }
        return existing.promise;
      }
      const promise = requestJson(fetchImpl, path, {
        method,
        body,
        headers: { "Idempotency-Key": key },
        timeoutMs: normalizeTimeout(timeoutMs),
        signal,
        validate,
      });
      const entry = { fingerprint, promise };
      inFlightMutations.set(key, entry);
      const clear = () => {
        if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    } catch (error) {
      return asRejected(error);
    }
  }

  function createContract({ gameId, contract, idempotencyKey, signal } = {}) {
    return mutation({
      path: contractCollectionPath(gameId),
      body: contract,
      idempotencyKey,
      signal,
      validate: validateContractMutation,
    });
  }

  function updateContract({ gameId, contractId, contract, idempotencyKey, signal } = {}) {
    return mutation({
      method: "PATCH",
      path: contractPath(gameId, contractId),
      body: contract,
      idempotencyKey,
      signal,
      validate: validateContractMutation,
    });
  }

  function publishContract({ gameId, contractId, idempotencyKey, signal } = {}) {
    return mutation({
      path: contractPath(gameId, contractId, "/publish"),
      body: {},
      idempotencyKey,
      signal,
      validate: validateContractMutation,
    });
  }

  function archiveContract({ gameId, contractId, idempotencyKey, signal } = {}) {
    return mutation({
      path: contractPath(gameId, contractId, "/archive"),
      body: {},
      idempotencyKey,
      signal,
      validate: validateContractMutation,
    });
  }

  function duplicateContract({ gameId, contractId, idempotencyKey, signal } = {}) {
    return mutation({
      path: contractPath(gameId, contractId, "/duplicate"),
      body: {},
      idempotencyKey,
      signal,
      validate: validateContractMutation,
    });
  }

  function reviewProgress({
    gameId,
    contractId,
    progressId,
    action,
    feedback = "",
    idempotencyKey,
    signal,
  } = {}) {
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!["approve", "reject", "request_revision"].includes(normalizedAction)) {
      return asRejected(new ContractTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" }));
    }
    const resultPayload = String(feedback || "").trim()
      ? { feedback: String(feedback).trim().slice(0, 4_000) }
      : {};
    return mutation({
      path: contractPath(gameId, contractId, `/progress/${requireUuid(progressId)}/review`),
      body: { action: normalizedAction, resultPayload },
      idempotencyKey,
      signal,
      validate: validateProgressMutation,
    });
  }

  function issueRewards({ gameId, contractId, progressId, idempotencyKey, signal } = {}) {
    return mutation({
      path: contractPath(gameId, contractId, `/progress/${requireUuid(progressId)}/rewards/issue`),
      body: {},
      idempotencyKey,
      signal,
      validate: validateRewardMutation,
    });
  }

  return Object.freeze({
    readContracts,
    cancelContractsRequest,
    readContractDetail,
    cancelContractDetailRequest,
    createContract,
    updateContract,
    publishContract,
    archiveContract,
    duplicateContract,
    reviewProgress,
    issueRewards,
  });
}
