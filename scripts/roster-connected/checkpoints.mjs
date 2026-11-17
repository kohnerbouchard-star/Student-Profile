import { isProxy } from 'node:util/types';

// These literals identify the last attempted operation, never its outcome or cause.
export const MAIN_CHECKPOINTS = Object.freeze([
  'not-started',
  'late-snapshot', 'late-route-install', 'late-preview', 'late-submit',
  'late-await-commit', 'late-commit-confirm', 'late-escape', 'late-busy-visible',
  'late-navigation', 'late-dialog-detached', 'late-release', 'late-await-delivery',
  'late-render-settle', 'late-no-codes', 'late-unroute',
  'logout-navigation', 'logout-opener', 'logout-snapshot', 'logout-preview',
  'logout-submit', 'logout-response', 'logout-status', 'logout-receipt',
  'logout-render', 'logout-codes', 'logout-render-settle', 'logout-deadline',
  'logout-database-delta', 'admin-signout', 'admin-redirect', 'admin-no-codes',
  'admin-storage-cleared', 'admin-revoked-request', 'admin-revoked-status',
  'privacy-final-snapshot', 'privacy-persisted', 'privacy-browser-log-size',
  'privacy-browser-logs', 'privacy-browser-storage-read', 'privacy-browser-storage',
  'privacy-browser-cookies', 'privacy-browser-stores', 'privacy-server-entry',
  'privacy-gateway-log-size', 'privacy-gateway-logs', 'privacy-server-enumerate',
  'privacy-server-coverage', 'privacy-service-read', 'privacy-service-logs',
  'privacy-before-student-edge', 'privacy-before-student-auth',
  'privacy-before-student-rest', 'privacy-before-student-kong',
  'privacy-after-student-edge', 'privacy-after-student-auth',
  'privacy-after-student-rest', 'privacy-after-student-kong',
  'student-entry-code', 'student-entry-lifecycle', 'student-entry-representatives',
  'student-access-execution',
]);
export const CALLBACK_CHECKPOINTS = Object.freeze([
  'not-started', 'late-fetch', 'late-status', 'late-receipt', 'late-db-delta',
  'late-hold', 'late-fulfill',
]);

// Only fixed phase/service labels may cross the existing aggregate boundary.
// No service output, matched value, or caller-controlled text is returned.
const SERVICE_LOG_CHECKPOINTS = Object.freeze({
  'before-student-access': Object.freeze({
    supabase_edge_runtime_econovaria: 'privacy-before-student-edge',
    supabase_auth_econovaria: 'privacy-before-student-auth',
    supabase_rest_econovaria: 'privacy-before-student-rest',
    supabase_kong_econovaria: 'privacy-before-student-kong',
  }),
  'after-student-access': Object.freeze({
    supabase_edge_runtime_econovaria: 'privacy-after-student-edge',
    supabase_auth_econovaria: 'privacy-after-student-auth',
    supabase_rest_econovaria: 'privacy-after-student-rest',
    supabase_kong_econovaria: 'privacy-after-student-kong',
  }),
});
export function serviceLogCheckpoint(phase, service) {
  if (typeof phase !== 'string' || typeof service !== 'string'
      || !Object.hasOwn(SERVICE_LOG_CHECKPOINTS, phase)
      || !Object.hasOwn(SERVICE_LOG_CHECKPOINTS[phase], service)) {
    throw new Error('Invalid service log checkpoint');
  }
  return SERVICE_LOG_CHECKPOINTS[phase][service];
}

const states = new WeakMap();
const allowed = (channel, identifier) => typeof identifier === 'string'
  && (channel === 'main' ? MAIN_CHECKPOINTS : CALLBACK_CHECKPOINTS).includes(identifier);

function stateFor(report) {
  if (report === null || typeof report !== 'object') throw new Error('Invalid checkpoint');
  let state = states.get(report);
  if (!state) {
    state = { main: 'not-started', callback: 'not-started', snapshot: null };
    states.set(report, state);
  }
  return state;
}

export function markCheckpoint(report, channel, identifier) {
  // Validate even after sealing. Do not coerce, inspect, or retain rejected values.
  if ((channel !== 'main' && channel !== 'callback') || !allowed(channel, identifier)) {
    throw new Error('Invalid checkpoint');
  }
  const state = stateFor(report);
  if (state.snapshot === null) state[channel] = identifier;
}

export function sealCheckpoints(report) {
  const state = stateFor(report);
  if (state.snapshot === null) {
    state.snapshot = Object.freeze({ main: state.main, callback: state.callback });
  }
  return state.snapshot;
}

export function validateCheckpointSnapshot(snapshot) {
  const invalid = () => { throw new Error('Invalid checkpoint snapshot'); };
  if (snapshot === null || typeof snapshot !== 'object' || isProxy(snapshot)
      || Object.getPrototypeOf(snapshot) !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(snapshot);
  if (keys.length !== 2 || !keys.includes('main') || !keys.includes('callback')) invalid();
  for (const channel of ['main', 'callback']) {
    const descriptor = Object.getOwnPropertyDescriptor(snapshot, channel);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
        || !allowed(channel, descriptor.value)) invalid();
  }
  return snapshot;
}
