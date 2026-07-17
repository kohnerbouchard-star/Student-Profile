import { PLAYER_ENDPOINTS, resolveEndpoint } from "./endpoints.js";
import { PreviewTransport } from "./preview-transport.js";
import { HttpTransport } from "./http-transport.js";
import { AdapterTransport } from "./adapter-transport.js";
import { ApiRequestError, normalizeApiError } from "./errors.js";
import { createIdempotencyKey, createRequestId, stableRequestKey } from "./request-context.js";
import { normalizeApiResponse } from "./response-normalizer.js";
import { resolveCapabilities } from "./capabilities.js";
import {
  IDEMPOTENT_WRITE_ENDPOINTS,
  SHELL_OPTIONAL_RESOURCES,
  WRITE_INVALIDATIONS,
  resourcesForRoute
} from "./resource-plan.js";

function resolvedPath(endpointKey, params) {
  const endpoint = PLAYER_ENDPOINTS[endpointKey];
  if (!endpoint) throw new ApiRequestError("The requested player resource is not registered.", { code: "UNKNOWN_ENDPOINT", endpointKey });
  const path = resolveEndpoint(endpoint, params);
  if (/:[A-Za-z][A-Za-z0-9_]*/.test(path)) {
    throw new ApiRequestError("The request is missing a required resource identifier.", { code: "INVALID_REQUEST", endpointKey, path });
  }
  return { endpoint, path };
}

function sessionFingerprint(config) {
  return [config.playerSessionToken, config.gameSessionId, config.playerSessionId, config.accessToken]
    .map((value) => String(value || ""))
    .join("|");
}

function mergeAbortSignals(...signals) {
  const activeSignals = signals.filter((signal) => signal && typeof signal.addEventListener === "function");
  if (!activeSignals.length) return { signal: null, cleanup: () => {} };
  if (activeSignals.length === 1) return { signal: activeSignals[0], cleanup: () => {} };

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => activeSignals.forEach((signal) => signal.removeEventListener("abort", abort))
  };
}

export class PlayerApi {
  constructor(config) {
    this.config = config;
    this.transport = config.usePreviewData
      ? new PreviewTransport({ simulateWrites: config.simulatePreviewWrites })
      : config.apiCall || config.adapter
        ? new AdapterTransport(config.apiCall || config.adapter, config)
        : new HttpTransport(config);
    this.readCache = new Map();
    this.inFlightReads = new Map();
    this.inFlightWrites = new Map();
    this.writeCompletedAt = new Map();
    this.sessionVersion = 0;
    this.sessionFingerprint = sessionFingerprint(config);
    this.sessionController = new AbortController();
  }

  setSession(session) {
    if (!session || typeof session !== "object") return;
    if (session.playerSessionToken) this.config.playerSessionToken = session.playerSessionToken;
    if (session.gameSessionId) this.config.gameSessionId = session.gameSessionId;
    if (session.playerSessionId) this.config.playerSessionId = session.playerSessionId;
    if (session.accessToken) this.config.accessToken = session.accessToken;
    const nextFingerprint = sessionFingerprint(this.config);
    if (nextFingerprint !== this.sessionFingerprint) {
      this.sessionController.abort();
      this.sessionController = new AbortController();
      this.sessionFingerprint = nextFingerprint;
      this.sessionVersion += 1;
      this.readCache.clear();
      this.inFlightReads.clear();
      this.inFlightWrites.clear();
      this.writeCompletedAt.clear();
    }
  }

  async request(endpointKey, { params = {}, payload, force = false, signal = null } = {}) {
    const { endpoint, path } = resolvedPath(endpointKey, params);
    const requestId = createRequestId();
    const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
    const context = { endpointKey, method: endpoint.method, path, payload, requestId, signal: mergedSignal.signal };
    const key = stableRequestKey(context);
    const sessionVersion = this.sessionVersion;

    if (endpoint.method === "GET" && !force && this.readCache.has(key)) return this.readCache.get(key);
    if (endpoint.method === "GET" && this.inFlightReads.has(key)) return this.inFlightReads.get(key);

    const operation = this.transport.request(context)
      .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
      .then((value) => {
        if (sessionVersion !== this.sessionVersion) {
          throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
        }
        if (endpoint.method === "GET") this.readCache.set(key, value);
        return value;
      })
      .catch((error) => { throw normalizeApiError(error, context); })
      .finally(() => {
        mergedSignal.cleanup();
        if (endpoint.method === "GET" && this.inFlightReads.get(key) === operation) this.inFlightReads.delete(key);
      });

    if (endpoint.method === "GET") this.inFlightReads.set(key, operation);
    return operation;
  }

  async bootstrap({ force = false } = {}) {
    const session = await this.request("session", { force });
    const dashboard = await this.request("dashboard", { force });
    const optional = await Promise.allSettled(SHELL_OPTIONAL_RESOURCES.map((key) => this.request(key, { force })));
    const data = { session, dashboard };
    SHELL_OPTIONAL_RESOURCES.forEach((key, index) => {
      data[key] = optional[index].status === "fulfilled" ? optional[index].value : [];
    });
    data.capabilities = resolveCapabilities({ config: this.config, session, dashboard });
    return data;
  }

  async loadResources(keys, { force = false } = {}) {
    const uniqueKeys = [...new Set(keys)];
    const settled = await Promise.allSettled(uniqueKeys.map((key) => this.request(key, { force })));
    const data = {};
    const errors = {};
    settled.forEach((result, index) => {
      const key = uniqueKeys[index];
      if (result.status === "fulfilled") data[key] = result.value;
      else errors[key] = normalizeApiError(result.reason, { endpointKey: key });
    });
    return { data, errors };
  }

  async loadRoute(route, { force = false } = {}) {
    const plan = resourcesForRoute(route);
    const keys = [...plan.required, ...plan.optional];
    const result = await this.loadResources(keys, { force });
    const sessionError = Object.values(result.errors).find((error) => Number(error?.status) === 401);
    if (sessionError) throw sessionError;
    const missingRequired = plan.required.find((key) => result.errors[key]);
    if (missingRequired) {
      throw new ApiRequestError("This section could not be loaded. Other terminal sections remain available.", {
        code: "ROUTE_DATA_UNAVAILABLE",
        endpointKey: missingRequired,
        cause: result.errors[missingRequired]
      });
    }
    return result;
  }

  invalidateResources(keys) {
    const targets = new Set(keys);
    for (const key of this.readCache.keys()) {
      const endpointKey = key.split(":")[1];
      if (targets.has(endpointKey)) this.readCache.delete(key);
    }
  }

  refreshResources(keys) {
    this.invalidateResources(keys);
    return this.loadResources(keys, { force: true });
  }

  execute(endpointKey, payload, params = {}, { signal = null } = {}) {
    const { endpoint, path } = resolvedPath(endpointKey, params);
    if (endpoint.method === "GET") {
      throw new ApiRequestError("A read endpoint cannot be submitted as an action.", { code: "INVALID_REQUEST", endpointKey, path });
    }

    const writeKey = `${endpointKey}:${path}`;
    if (this.inFlightWrites.has(writeKey)) return this.inFlightWrites.get(writeKey);
    const completedAt = this.writeCompletedAt.get(writeKey) || 0;
    if (Date.now() - completedAt < this.config.writeCooldownMs) {
      return Promise.reject(new ApiRequestError("That action was just submitted. Wait a moment before trying again.", {
        code: "ACTION_COOLDOWN",
        endpointKey,
        path
      }));
    }

    const requestId = createRequestId();
    const idempotencyKey = IDEMPOTENT_WRITE_ENDPOINTS.has(endpointKey)
      ? createIdempotencyKey(endpointKey)
      : "";
    const mergedSignal = mergeAbortSignals(signal, this.sessionController.signal);
    const context = { endpointKey, method: endpoint.method, path, payload, requestId, idempotencyKey, signal: mergedSignal.signal };
    const invalidatedResources = WRITE_INVALIDATIONS[endpointKey] || [];
    const sessionVersion = this.sessionVersion;

    const operation = this.transport.request(context)
      .then((raw) => normalizeApiResponse(endpointKey, raw, { config: this.config, path, requestId }))
      .then((result) => {
        if (sessionVersion !== this.sessionVersion) {
          throw new ApiRequestError("The request was cancelled.", { code: "REQUEST_ABORTED", endpointKey, path, requestId });
        }
        this.writeCompletedAt.set(writeKey, Date.now());
        this.invalidateResources(invalidatedResources);
        return { result, invalidatedResources: [...invalidatedResources], requestId, idempotencyKey };
      })
      .catch((error) => { throw normalizeApiError(error, context); })
      .finally(() => {
        mergedSignal.cleanup();
        if (this.inFlightWrites.get(writeKey) === operation) this.inFlightWrites.delete(writeKey);
      });

    this.inFlightWrites.set(writeKey, operation);
    return operation;
  }
}
