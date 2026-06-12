(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function getFeatureFlags() {
    const config = global.ECONOVARIA_FRONTEND_CONFIG || {};
    return config.FEATURE_FLAGS || {};
  }

  function isMarketNewsSwitchEnabled() {
    return getFeatureFlags().useFrontendMarketNewsModule === true;
  }

  function getMarketNewsModule() {
    return app.modules.marketNews || {};
  }

  function installFrontendMarketNewsSwitch() {
    if (!isMarketNewsSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendMarketNewsModule is disabled"
      };
    }

    const marketNews = getMarketNewsModule();
    if (typeof marketNews.renderNewsList !== "function") {
      return {
        installed: false,
        reason: "marketNews.renderNewsList is not available"
      };
    }

    if (global.__frontendMarketNewsSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendMarketNewsSwitchInstalled = true;
    global.__legacyRenderMarketCompanyNews = global.renderMarketCompanyNews || null;

    global.renderMarketCompanyNews = function frontendRenderMarketCompanyNews(stock) {
      return marketNews.renderNewsList(stock);
    };

    try {
      renderMarketCompanyNews = global.renderMarketCompanyNews;
    } catch (_) {}

    if (typeof marketNews.installNewsModalEvents === "function") {
      marketNews.installNewsModalEvents();
    }

    return {
      installed: true,
      reason: "frontend Market News renderer installed"
    };
  }

  app.modules.legacyBridge = {
    status: "guarded",
    description: "Guarded bridge for frontend modules. Default feature flags keep this disabled.",
    installFrontendMarketNewsSwitch
  };

  installFrontendMarketNewsSwitch();
})(window);
