(function exposeLegacyStateAccessor(global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function cloneValue(value, seen) {
    if (value === null || typeof value !== "object") return value;

    const references = seen || new WeakMap();
    if (references.has(value)) return references.get(value);

    const clone = Array.isArray(value) ? [] : {};
    references.set(value, clone);

    Object.keys(value).forEach(function copyKey(key) {
      clone[key] = cloneValue(value[key], references);
    });

    return clone;
  }

  function deepFreeze(value, seen) {
    if (value === null || typeof value !== "object") return value;

    const references = seen || new WeakSet();
    if (references.has(value)) return value;
    references.add(value);

    Object.keys(value).forEach(function freezeKey(key) {
      deepFreeze(value[key], references);
    });

    try {
      Object.freeze(value);
    } catch (_) {}

    return value;
  }

  function getLiveLegacyStateReference() {
    try {
      if (state && typeof state === "object") {
        return state;
      }
    } catch (_) {}

    return {};
  }

  function getSnapshot() {
    return deepFreeze(cloneValue(getLiveLegacyStateReference()));
  }

  function getRowCounts(snapshot) {
    const source = snapshot || getSnapshot();

    return {
      profile: source.profile ? 1 : 0,
      store: Array.isArray(source.store) ? source.store.length : 0,
      transactions: Array.isArray(source.transactions) ? source.transactions.length : 0,
      inventory: Array.isArray(source.inventory) ? source.inventory.length : 0,
      market: Array.isArray(source.market) ? source.market.length : 0,
      portfolio: Array.isArray(source.portfolio) ? source.portfolio.length : 0,
      ratings: Array.isArray(source.ratings) ? source.ratings.length : 0,
      news: Array.isArray(source.news) ? source.news.length : 0
    };
  }

  function hasSnapshotData(snapshot) {
    const counts = getRowCounts(snapshot);
    return Boolean(counts.profile || counts.store || counts.transactions || counts.inventory || counts.market || counts.portfolio || counts.ratings || counts.news);
  }

  app.legacyState = {
    status: "ready",
    description: "Read-only cloned accessor for app.js legacy state. Runtime modules must not mutate this object.",
    getSnapshot,
    getRowCounts,
    hasSnapshotData
  };

  global.EconovariaLegacyState = app.legacyState;

  // Compatibility bridge: many extracted modules still read window.state.
  // Expose a read-only cloned snapshot so those modules can read backend-loaded data
  // without receiving a mutable reference to app.js state.
  try {
    const descriptor = Object.getOwnPropertyDescriptor(global, "state");

    if (!descriptor || descriptor.configurable === true) {
      Object.defineProperty(global, "state", {
        configurable: true,
        enumerable: false,
        get: getSnapshot,
        set: function ignoreStateWrite() {
          console.warn("[Econovaria legacy state] Ignored direct write to window.state. Use app.js snapshot merge flow instead.");
        }
      });
    }
  } catch (error) {
    console.warn("[Econovaria legacy state] Could not expose window.state compatibility getter.", error);
  }
})(window);
