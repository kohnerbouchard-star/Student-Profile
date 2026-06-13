window.Econovaria = window.Econovaria || {};
window.Econovaria.state = window.Econovaria.state || {};

let state = emptyState();
let currentSession = null;

function emptyState() {
  return {
    profile: null,
    store: [],
    transactions: [],
    inventory: [],
    market: [],
    portfolio: [],
    ratings: [],
    news: []
  };
}

function getState() {
  return state;
}

function setState(nextState) {
  state = nextState;
  return state;
}

function getCurrentSession() {
  return currentSession;
}

function setCurrentSession(nextSession) {
  currentSession = nextSession;
  return currentSession;
}

function selectedStudent() {
  return state.profile || null;
}

function can(action) {
  return (currentSession?.permissions || []).includes(action);
}

function requirePermission(action) {
  if (!can(action)) {
    throw new Error("This action is not available for your account right now.");
  }
}

Object.assign(window.Econovaria.state, {
  emptyState,
  getState,
  setState,
  getCurrentSession,
  setCurrentSession,
  selectedStudent,
  can,
  requirePermission
});

Object.defineProperty(window.Econovaria.state, "value", {
  get: getState,
  set: setState,
  configurable: true
});

Object.defineProperty(window.Econovaria.state, "currentSession", {
  get: getCurrentSession,
  set: setCurrentSession,
  configurable: true
});
