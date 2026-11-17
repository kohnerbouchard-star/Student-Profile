import { normalizeAdminError } from "../core/error-envelope.js";
import { AdminTransportDiagnostic, normalizeTimeout, ADMIN_API_BASE_PATH } from "./admin-api-diagnostics.js";

function canonicalResponseCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  if (["staff_mfa_required", "aal2_required"].includes(code.toLowerCase())) {
    return "MFA_REQUIRED";
  }
  return code;
}

function bodyErrorDiagnostic(payload, response) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return new AdminTransportDiagnostic({
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
    retryAfterSeconds: (() => {
      const value = Number(response.headers?.get?.("retry-after"));
      return Number.isInteger(value) && value > 0 ? Math.min(value, 3600) : null;
    })(),
  });
}

function invalidResponse(response) {
  return new AdminTransportDiagnostic({
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
      throw new AdminTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }

  if (!response.ok) throw bodyErrorDiagnostic(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalidResponse(response);
  }
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

function abortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The request was cancelled.", "AbortError");
  }
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function serializeJsonBody(body) {
  if (body === undefined) return undefined;
  try {
    return JSON.stringify(body);
  } catch (_error) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
}

async function requestAdminJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs,
  validate,
}) {
  if (!String(path || "").startsWith("/")) {
    throw normalizeAdminError(new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" }));
  }

  const controller = new AbortController();
  const unlinkAbort = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeTimeout(timeoutMs));

  try {
    if (controller.signal.aborted) throw abortError();
    const serializedBody = serializeJsonBody(body);
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method: String(method || "GET").toUpperCase(),
      headers: { Accept: "application/json", ...headers },
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const payload = await parseJsonResponse(response);
    return typeof validate === "function" ? validate(payload, response) : payload;
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    const isNetworkError = !timedOut
      && !controller.signal.aborted
      && !(error instanceof AdminTransportDiagnostic);
    throw normalizeAdminError(error, {
      timedOut,
      networkError: isNetworkError,
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
      fieldErrors: error?.fieldErrors,
    });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
}

export {
  canonicalResponseCode, bodyErrorDiagnostic, invalidResponse, parseJsonResponse, linkAbortSignal,
  abortError, serializeJsonBody, requestAdminJson,
};
