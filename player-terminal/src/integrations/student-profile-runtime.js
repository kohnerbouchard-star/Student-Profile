import {
  createStudentProfileApiCall,
  createStudentProfileFetchRequest
} from "./student-profile-api-call.js";
import { createStudentProfileReadResilientFetch } from "./student-profile-read-resilience.js";

const DEFAULT_PLAYER_API_BASE = "/api/player";
const LOCAL_PLAYER_BFF_SUFFIX = "/functions/v1/player-web-session-api/proxy";
const PLAYER_READ_RESILIENCE_EVENT = "econovaria:player-read-resilience";
const resilienceMetrics = {
  retriesScheduled: 0,
  retriesRecovered: 0,
  retriesExhausted: 0,
  retryBudgetExhausted: 0
};

function normalizedBase(value) {
  return String(value || DEFAULT_PLAYER_API_BASE).trim().replace(/\/+$/, "");
}

function isPlayerApiBase(value) {
  const base = normalizedBase(value);
  return base === DEFAULT_PLAYER_API_BASE ||
    base.endsWith(DEFAULT_PLAYER_API_BASE) ||
    base.endsWith(LOCAL_PLAYER_BFF_SUFFIX);
}

function defaultPlayerReadResilienceTelemetry(event) {
  if (event?.type === "retry_scheduled") resilienceMetrics.retriesScheduled += 1;
  if (event?.type === "retry_recovered") resilienceMetrics.retriesRecovered += 1;
  if (event?.type === "retry_exhausted") resilienceMetrics.retriesExhausted += 1;
  if (event?.type === "retry_budget_exhausted") resilienceMetrics.retryBudgetExhausted += 1;

  const detail = Object.freeze({
    ...event,
    metrics: Object.freeze({ ...resilienceMetrics })
  });
  try {
    if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent(PLAYER_READ_RESILIENCE_EVENT, { detail }));
    }
  } catch {
    // Telemetry must never change Player request behavior.
  }
}

export function installStudentProfileRuntime(
  config,
  {
    fetchImpl = globalThis.fetch,
    onPlayerReadResilienceEvent = defaultPlayerReadResilienceTelemetry
  } = {}
) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("A Player Terminal configuration object is required.");
  }
  if (config.usePreviewData === true || config.studentProfileMode === false) return config;
  if (config.apiCall || config.adapter) return config;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Student-Profile connected mode requires a fetch implementation.");
  }
  if (typeof onPlayerReadResilienceEvent !== "function") {
    throw new TypeError("Player read resilience telemetry must be a function.");
  }

  const apiBaseUrl = normalizedBase(config.studentProfileApiBaseUrl || DEFAULT_PLAYER_API_BASE);
  if (!isPlayerApiBase(apiBaseUrl)) {
    throw new TypeError("Student-Profile connected mode must use the Player HttpOnly BFF.");
  }

  const resilientFetch = createStudentProfileReadResilientFetch(fetchImpl, {
    onEvent: onPlayerReadResilienceEvent
  });
  const request = createStudentProfileFetchRequest({ apiBaseUrl, fetchImpl: resilientFetch });
  return {
    ...config,
    apiBaseUrl,
    studentProfileMode: true,
    apiCall: createStudentProfileApiCall({ request }),
    adapter: null
  };
}

export const STUDENT_PROFILE_PLAYER_API_BASE = DEFAULT_PLAYER_API_BASE;
export const STUDENT_PROFILE_CLASSROOM_API_BASE = DEFAULT_PLAYER_API_BASE;
export const STUDENT_PROFILE_READ_RESILIENCE_EVENT = PLAYER_READ_RESILIENCE_EVENT;
