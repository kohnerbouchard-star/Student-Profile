import { jsonError } from "../platform/supabase/edgeResponse.ts";

export interface EdgeRequestBoundaryPolicy {
  readonly allowedMethods: readonly string[];
  readonly maxBodyBytes: number;
  readonly requireJsonBody?: boolean;
  readonly allowBodyMethods?: readonly string[];
  readonly maxUrlLength?: number;
}

export type EdgeRequestBoundaryResult =
  | { readonly ok: true; readonly request: Request }
  | { readonly ok: false; readonly response: Response };

const DEFAULT_MAX_URL_LENGTH = 2_048;
const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function enforceEdgeRequestBoundary(
  request: Request,
  policy: EdgeRequestBoundaryPolicy,
): Promise<EdgeRequestBoundaryResult> {
  const method = request.method.toUpperCase();
  const allowedMethods = new Set(policy.allowedMethods.map((value) => value.toUpperCase()));
  if (!allowedMethods.has(method)) {
    return failure(405, "method_not_allowed", "The request method is not allowed.");
  }

  if (request.url.length > (policy.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH)) {
    return failure(414, "request_uri_too_long", "The request URL is too long.");
  }

  const contentLength = readContentLength(request.headers.get("content-length"));
  if (contentLength > policy.maxBodyBytes) {
    return failure(413, "request_body_too_large", "The request body is too large.");
  }

  if (BODYLESS_METHODS.has(method)) {
    if (contentLength > 0) {
      return failure(400, "request_body_prohibited", "This request must not contain a body.");
    }
    return { ok: true, request };
  }

  const bodyMethods = new Set(
    (policy.allowBodyMethods ?? policy.allowedMethods).map((value) => value.toUpperCase()),
  );
  if (!bodyMethods.has(method)) {
    return failure(400, "request_body_prohibited", "This request must not contain a body.");
  }

  if (policy.requireJsonBody !== false) {
    const contentType = String(request.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return failure(415, "unsupported_media_type", "Use application/json for this request.");
    }
  }

  let body: Uint8Array;
  try {
    body = new Uint8Array(await request.arrayBuffer());
  } catch {
    return failure(400, "invalid_request_body", "The request body could not be read.");
  }
  if (body.byteLength > policy.maxBodyBytes) {
    return failure(413, "request_body_too_large", "The request body is too large.");
  }
  if (body.byteLength === 0 && policy.requireJsonBody !== false) {
    return failure(400, "request_body_required", "A JSON request body is required.");
  }

  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: request.redirect,
    signal: request.signal,
  });
  return { ok: true, request: boundedRequest };
}

function readContentLength(value: string | null): number {
  if (value === null || value.trim() === "") return 0;
  if (!/^\d{1,10}$/u.test(value.trim())) return Number.POSITIVE_INFINITY;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : Number.POSITIVE_INFINITY;
}

function failure(
  status: number,
  code: string,
  message: string,
): EdgeRequestBoundaryResult {
  return {
    ok: false,
    response: jsonError(status, { code, message, retryable: false }),
  };
}
