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

  function isMarketProfileSwitchEnabled() {
    return getFeatureFlags().useFrontendMarketProfileModule === true;
  }

  function getMarketNewsModule() {
    return app.modules.marketNews || {};
  }

  function getMarketProfileModule() {
    return app.modules.marketProfile || {};
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

  function renderFrontendMarketProfile() {
    const marketProfile = getMarketProfileModule();
    const root = global.document && global.document.getElementById
      ? global.document.getElementById("stockProfile")
      : null;

    if (!root || typeof marketProfile.renderMarketProfilePage !== "function") return;

    const range = marketProfile.currentRange || "1D";
    const selectedTicker = typeof marketProfile.getSelectedTicker === "function"
      ? marketProfile.getSelectedTicker(global.state)
      : "";

    root.innerHTML = marketProfile.renderMarketProfilePage({
      state: global.state || {},
      selectedTicker,
      range
    });
  }

  function renderFrontendMarketProfileDetail() {
    const marketProfile = getMarketProfileModule();
    const detail = global.document && global.document.getElementById
      ? global.document.getElementById("stockProfileDetail")
      : null;

    if (!detail || typeof marketProfile.renderMarketProfileDetail !== "function") return;

    const range = marketProfile.currentRange || "1D";
    const ticker = typeof marketProfile.getSelectedTicker === "function"
      ? marketProfile.getSelectedTicker(global.state)
      : "";

    detail.innerHTML = marketProfile.renderMarketProfileDetail(ticker, {
      state: global.state || {},
      range
    });
  }

  function installMarketProfileEvents() {
    if (global.__frontendMarketProfileEventsInstalled || !global.document) return;
    global.__frontendMarketProfileEventsInstalled = true;

    global.document.addEventListener("change", function (event) {
      if (event.target && event.target.id === "stockProfileTicker") {
        renderFrontendMarketProfileDetail();
      }
    });

    global.document.addEventListener("click", function (event) {
      const rangeButton = event.target.closest && event.target.closest("[data-market-range]");
      const peerButton = event.target.closest && event.target.closest("[data-market-peer]");
      const marketProfile = getMarketProfileModule();

      if (rangeButton) {
        marketProfile.currentRange = rangeButton.dataset.marketRange || "1D";
        renderFrontendMarketProfileDetail();
        return;
      }

      if (peerButton) {
        const select = global.document.getElementById("stockProfileTicker");
        if (select) {
          select.value = peerButton.dataset.marketPeer || "";
        }
        renderFrontendMarketProfileDetail();
      }
    });
  }

  function installFrontendMarketProfileSwitch() {
    if (!isMarketProfileSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendMarketProfileModule is disabled"
      };
    }

    const marketProfile = getMarketProfileModule();
    if (
      typeof marketProfile.renderMarketProfilePage !== "function" ||
      typeof marketProfile.renderMarketProfileDetail !== "function"
    ) {
      return {
        installed: false,
        reason: "Market Profile module renderers are not available"
      };
    }

    if (global.__frontendMarketProfileSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendMarketProfileSwitchInstalled = true;
    global.__legacyRenderStockProfile = global.renderStockProfile || null;
    global.__legacyRenderStockProfileDetail = global.renderStockProfileDetail || null;
    global.__legacySetMarketChartRange = global.setMarketChartRange || null;
    global.__legacySelectMarketPeer = global.selectMarketPeer || null;

    global.renderStockProfile = renderFrontendMarketProfile;
    global.renderStockProfileDetail = renderFrontendMarketProfileDetail;
    global.setMarketChartRange = function setFrontendMarketChartRange(range) {
      marketProfile.currentRange = range || "1D";
      renderFrontendMarketProfileDetail();
    };
    global.selectMarketPeer = function selectFrontendMarketPeer(ticker) {
      const select = global.document && global.document.getElementById
        ? global.document.getElementById("stockProfileTicker")
        : null;

      if (select) {
        select.value = ticker || "";
      }

      renderFrontendMarketProfileDetail();
    };

    try {
      renderStockProfile = global.renderStockProfile;
      renderStockProfileDetail = global.renderStockProfileDetail;
      setMarketChartRange = global.setMarketChartRange;
      selectMarketPeer = global.selectMarketPeer;
    } catch (_) {}

    installMarketProfileEvents();

    return {
      installed: true,
      reason: "frontend Market Profile renderer installed"
    };
  }

  app.modules.legacyBridge = {
    status: "guarded",
    description: "Guarded bridge for frontend modules. Default feature flags keep this disabled.",
    installFrontendMarketNewsSwitch,
    installFrontendMarketProfileSwitch
  };

  installFrontendMarketNewsSwitch();
  installFrontendMarketProfileSwitch();
})(window);
