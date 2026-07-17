export class ApiConnectionPendingError extends Error {
  constructor({ endpointKey, method, path, payload }) {
    super(`Backend connection pending for ${method} ${path}`);
    this.name = "ApiConnectionPendingError";
    this.endpointKey = endpointKey;
    this.method = method;
    this.path = path;
    this.payload = payload;
  }
}

export class ApiRequestError extends Error {
  constructor(message, { status = 0, body = null, path = "" } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}
