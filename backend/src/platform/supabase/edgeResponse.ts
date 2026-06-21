/// <reference lib="dom" />

export interface EdgeErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export class EdgeActivationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(message);
    this.name = "EdgeActivationError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  "access-control-max-age": "86400",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "content-type": "application/json; charset=utf-8",
};

export function jsonError(
  status: number,
  error: EdgeErrorBody["error"],
): Response {
  return jsonResponse<EdgeErrorBody>(status, {
    ok: false,
    error,
  });
}

export function jsonResponse<TBody>(
  status: number,
  body: TBody,
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? CORS_HEADERS : JSON_HEADERS,
  });
}
