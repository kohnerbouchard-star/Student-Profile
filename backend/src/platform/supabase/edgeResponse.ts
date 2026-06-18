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

const JSON_HEADERS = {
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
    headers: JSON_HEADERS,
  });
}
