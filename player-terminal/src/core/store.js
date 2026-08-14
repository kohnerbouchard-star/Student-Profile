const settersBySnapshot = new WeakMap();

export function updateStoreFromSnapshot(snapshot, patch) {
  const setter = snapshot && typeof snapshot === "object" ? settersBySnapshot.get(snapshot) : null;
  if (typeof setter !== "function") return false;
  setter(patch);
  return true;
}

export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  const store = {
    getState() {
      return state;
    },
    setState(patch) {
      const previous = state;
      state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
      settersBySnapshot.delete(previous);
      settersBySnapshot.set(state, store.setState);
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  settersBySnapshot.set(state, store.setState);
  return store;
}
