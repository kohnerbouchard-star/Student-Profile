(function installRuntimeConsistencyChecks(global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  app.runtime = app.runtime || {};

  function getStateSnapshot() {
    if (global.EconovariaLegacyState && typeof global.EconovariaLegacyState.getSnapshot === "function") {
      return global.EconovariaLegacyState.getSnapshot();
    }

    return global.state || {};
  }

  function rowCounts(state) {
    const source = state || getStateSnapshot();
    return {
      store: Array.isArray(source.store) ? source.store.length : 0,
      inventory: Array.isArray(source.inventory) ? source.inventory.length : 0,
      market: Array.isArray(source.market) ? source.market.length : 0,
      news: Array.isArray(source.news) ? source.news.length : 0,
      transactions: Array.isArray(source.transactions) ? source.transactions.length : 0,
      portfolio: Array.isArray(source.portfolio) ? source.portfolio.length : 0,
      ratings: Array.isArray(source.ratings) ? source.ratings.length : 0,
      profile: source.profile ? 1 : 0
    };
  }

  function countRows(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function result(name, counts) {
    return { feature: name, ok: true, counts, checks: [], failures: [] };
  }

  function addCountCheck(target, label, expected, actual) {
    const ok = expected === actual;
    target.checks.push({ label, expected, actual, ok });
    if (!ok) target.failures.push(label + " expected " + expected + " but got " + actual);
  }

  function finish(target) {
    target.ok = target.failures.length === 0 && target.checks.every(function (check) { return check.ok !== false; });
    return target;
  }

  function checkMarketProfile(state, counts) {
    const mod = app.modules.marketProfile || {};
    const out = result("marketProfile", counts);
    if (typeof mod.getMarketRows !== "function") {
      out.failures.push("marketProfile.getMarketRows is missing");
      return finish(out);
    }
    addCountCheck(out, "market rows", counts.market, countRows(mod.getMarketRows(state)));
    return finish(out);
  }

  function checkStore(state, counts) {
    const mod = app.modules.store || {};
    const out = result("store", counts);
    if (typeof mod.getStoreItems !== "function") {
      out.failures.push("store.getStoreItems is missing");
      return finish(out);
    }
    addCountCheck(out, "store rows", counts.store, countRows(mod.getStoreItems(state)));
    return finish(out);
  }

  function checkInventory(state, counts) {
    const mod = app.modules.inventory || {};
    const out = result("inventory", counts);
    if (typeof mod.getInventoryItems !== "function") {
      out.failures.push("inventory.getInventoryItems is missing");
      return finish(out);
    }
    addCountCheck(out, "inventory rows", counts.inventory, countRows(mod.getInventoryItems(state)));
    if (typeof mod.renderInventoryPanel === "function") {
      const html = String(mod.renderInventoryPanel({ state }) || "");
      if (html.includes("My Items")) {
        out.failures.push("inventory renderer includes My Items and cannot replace the legacy Use Item slot");
      }
    }
    return finish(out);
  }

  function checkAuth(state, counts) {
    const mod = app.modules.auth || {};
    const out = result("auth", counts);
    if (typeof mod.renderLoginError !== "function") out.failures.push("auth.renderLoginError is missing");
    if (typeof mod.rotateLoginQuote !== "function") out.failures.push("auth.rotateLoginQuote is missing");
    return finish(out);
  }

  function checkFeature(name) {
    const state = getStateSnapshot();
    const counts = rowCounts(state);
    if (name === "marketProfile") return checkMarketProfile(state, counts);
    if (name === "store") return checkStore(state, counts);
    if (name === "inventory") return checkInventory(state, counts);
    if (name === "auth") return checkAuth(state, counts);
    return finish(result(name, counts));
  }

  function checkAll() {
    const features = ["marketProfile", "store", "inventory", "auth"];
    const results = features.map(checkFeature);
    return { ok: results.every(function (item) { return item.ok; }), results };
  }

  function guardInstaller(bridge, installerName, featureName) {
    if (!bridge || typeof bridge[installerName] !== "function" || bridge[installerName].__consistencyGuarded) return;
    const original = bridge[installerName];
    bridge[installerName] = function guardedInstaller() {
      const check = checkFeature(featureName);
      if (!check.ok) {
        return { installed: false, reason: featureName + " consistency check failed: " + check.failures.join("; "), check };
      }
      return original.apply(this, arguments);
    };
    bridge[installerName].__consistencyGuarded = true;
  }

  function guardBridge(bridge) {
    guardInstaller(bridge, "installFrontendMarketProfileSwitch", "marketProfile");
    guardInstaller(bridge, "installFrontendStoreSwitch", "store");
    guardInstaller(bridge, "installFrontendInventorySwitch", "inventory");
    guardInstaller(bridge, "installFrontendAuthSwitch", "auth");
    return bridge;
  }

  function installBridgeAssignmentGuard() {
    let currentBridge = app.modules.legacyBridge ? guardBridge(app.modules.legacyBridge) : null;
    try {
      Object.defineProperty(app.modules, "legacyBridge", {
        configurable: true,
        enumerable: true,
        get: function () { return currentBridge; },
        set: function (nextBridge) { currentBridge = guardBridge(nextBridge); }
      });
    } catch (error) {
      console.warn("[Econovaria runtime checks] Could not install bridge assignment guard.", error);
    }
  }

  app.runtimeConsistency = { checkFeature, checkAll, rowCounts, getStateSnapshot, guardBridge };
  app.runtime.checkFeature = checkFeature;
  app.runtime.checkAll = checkAll;
  global.runEconovariaRuntimeChecks = checkAll;
  global.checkEconovariaRuntimeFeature = checkFeature;

  installBridgeAssignmentGuard();
})(window);
