export const ADMIN_DATA_STATES = Object.freeze({
  INITIAL_LOADING: "initial-loading",
  READY: "ready",
  REFRESHING: "refreshing",
  STALE: "stale",
  EMPTY: "empty",
  FAILED: "failed",
});

export const ADMIN_DATA_EVENTS = Object.freeze({
  LOAD_STARTED: "load-started",
  LOAD_SUCCEEDED: "load-succeeded",
  LOAD_FAILED: "load-failed",
  MARK_STALE: "mark-stale",
  RESET: "reset",
});

const VALID_STATES = new Set(Object.values(ADMIN_DATA_STATES));

function requestVersion(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function freezeState(state) {
  return Object.freeze({
    status: state.status,
    data: state.data,
    error: state.error || null,
    hasResolved: state.hasResolved === true,
    requestVersion: requestVersion(state.requestVersion),
    updatedAt: state.updatedAt ?? null,
  });
}

export function createAdminDataState({
  status = ADMIN_DATA_STATES.INITIAL_LOADING,
  data = null,
  error = null,
  hasResolved = false,
  requestVersion: version = 0,
  updatedAt = null,
} = {}) {
  if (!VALID_STATES.has(status)) throw new TypeError(`Unknown Admin data state: ${status}`);
  return freezeState({ status, data, error, hasResolved, requestVersion: version, updatedAt });
}

function isOlderEvent(state, event) {
  if (event.requestVersion == null) return false;
  return requestVersion(event.requestVersion) < state.requestVersion;
}

export function transitionAdminDataState(currentState, event = {}) {
  const state = currentState || createAdminDataState();
  if (!VALID_STATES.has(state.status)) throw new TypeError("Invalid current Admin data state.");
  if (isOlderEvent(state, event)) return state;

  const version = requestVersion(event.requestVersion, state.requestVersion);
  switch (event.type) {
    case ADMIN_DATA_EVENTS.LOAD_STARTED:
      return freezeState({
        ...state,
        status: state.hasResolved ? ADMIN_DATA_STATES.REFRESHING : ADMIN_DATA_STATES.INITIAL_LOADING,
        error: null,
        requestVersion: version,
      });

    case ADMIN_DATA_EVENTS.LOAD_SUCCEEDED:
      return freezeState({
        status: event.empty === true ? ADMIN_DATA_STATES.EMPTY : ADMIN_DATA_STATES.READY,
        data: event.data,
        error: null,
        hasResolved: true,
        requestVersion: version,
        updatedAt: event.updatedAt ?? Date.now(),
      });

    case ADMIN_DATA_EVENTS.LOAD_FAILED:
      return freezeState({
        status: state.hasResolved ? ADMIN_DATA_STATES.STALE : ADMIN_DATA_STATES.FAILED,
        data: state.hasResolved ? state.data : null,
        error: event.error || null,
        hasResolved: state.hasResolved,
        requestVersion: version,
        updatedAt: state.updatedAt,
      });

    case ADMIN_DATA_EVENTS.MARK_STALE:
      if (!state.hasResolved) return state;
      return freezeState({
        ...state,
        status: ADMIN_DATA_STATES.STALE,
        error: event.error || state.error,
      });

    case ADMIN_DATA_EVENTS.RESET:
      return createAdminDataState({ requestVersion: version });

    default:
      throw new TypeError(`Unknown Admin data event: ${String(event.type || "")}`);
  }
}

export function beginAdminDataLoad(state, options = {}) {
  return transitionAdminDataState(state, { type: ADMIN_DATA_EVENTS.LOAD_STARTED, ...options });
}

export function resolveAdminDataLoad(state, data, options = {}) {
  return transitionAdminDataState(state, { type: ADMIN_DATA_EVENTS.LOAD_SUCCEEDED, data, ...options });
}

export function rejectAdminDataLoad(state, error, options = {}) {
  return transitionAdminDataState(state, { type: ADMIN_DATA_EVENTS.LOAD_FAILED, error, ...options });
}

export function markAdminDataStale(state, options = {}) {
  return transitionAdminDataState(state, { type: ADMIN_DATA_EVENTS.MARK_STALE, ...options });
}

export function isAdminDataState(value, status = null) {
  const valid = Boolean(value && VALID_STATES.has(value.status));
  return status == null ? valid : valid && value.status === status;
}
