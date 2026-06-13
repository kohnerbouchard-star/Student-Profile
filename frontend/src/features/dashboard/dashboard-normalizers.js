(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const dashboard = app.modules.dashboard = app.modules.dashboard || {};

  function getArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeProfile(profile) {
    if (app.modules.profile && typeof app.modules.profile.normalizeProfile === "function") {
      return app.modules.profile.normalizeProfile(profile);
    }

    return profile || null;
  }

  // display-only
  function normalizeDashboardSnapshot(sourceState) {
    const state = sourceState || global.state || {};

    return {
      profile: normalizeProfile(state.profile || null),
      transactions: getArray(state.transactions),
      inventory: getArray(state.inventory),
      portfolio: getArray(state.portfolio),
      market: getArray(state.market),
      raw: state
    };
  }

  dashboard.normalizerStatus = "extracted";
  dashboard.normalizeDashboardSnapshot = normalizeDashboardSnapshot;

  app.modules.dashboardNormalizers = {
    status: "extracted",
    normalizeDashboardSnapshot
  };
})(window);
