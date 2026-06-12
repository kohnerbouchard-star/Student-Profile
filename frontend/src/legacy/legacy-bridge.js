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

  function isApiRetrySwitchEnabled() {
    return getFeatureFlags().useFrontendApiRetryModule === true;
  }

  function isSnapshotStoreSwitchEnabled() {
    return getFeatureFlags().useFrontendSnapshotStoreModule === true;
  }

  function isTradingSwitchEnabled() {
    return getFeatureFlags().useFrontendTradingModule === true;
  }

  function isStoreSwitchEnabled() {
    return getFeatureFlags().useFrontendStoreModule === true;
  }

  function isInventorySwitchEnabled() {
    return getFeatureFlags().useFrontendInventoryModule === true;
  }

  function isDashboardSwitchEnabled() {
    return getFeatureFlags().useFrontendDashboardModule === true;
  }

  function isProfileSwitchEnabled() {
    return getFeatureFlags().useFrontendProfileModule === true;
  }

  function isAuthSwitchEnabled() {
    return getFeatureFlags().useFrontendAuthModule === true;
  }

  function getMarketNewsModule() {
    return app.modules.marketNews || {};
  }

  function getMarketProfileModule() {
    return app.modules.marketProfile || {};
  }

  function getApiClientModule() {
    return app.modules.apiClient || {};
  }

  function getSnapshotStoreModule() {
    return app.modules.snapshotStore || {};
  }

  function getTradingModule() {
    return app.modules.trading || {};
  }

  function getStoreModule() {
    return app.modules.store || {};
  }

  function getInventoryModule() {
    return app.modules.inventory || {};
  }

  function getDashboardModule() {
    return app.modules.dashboard || {};
  }

  function getProfileModule() {
    return app.modules.profile || {};
  }

  function getAuthModule() {
    return app.modules.auth || {};
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

  function installFrontendApiRetrySwitch() {
    if (!isApiRetrySwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendApiRetryModule is disabled"
      };
    }

    const apiClient = getApiClientModule();
    const legacyCallApi = global.callApi || (typeof callApi === "function" ? callApi : null);

    if (global.__apiRetryPatchInstalled) {
      global.__frontendApiRetrySwitchInstalled = true;
      return {
        installed: true,
        reason: "legacy API retry patch is already installed; frontend wrapper skipped to avoid duplicate retries"
      };
    }

    if (typeof apiClient.createLegacyCallApiRetryWrapper !== "function") {
      return {
        installed: false,
        reason: "apiClient.createLegacyCallApiRetryWrapper is not available"
      };
    }

    if (typeof legacyCallApi !== "function") {
      return {
        installed: false,
        reason: "legacy callApi is not available"
      };
    }

    if (global.__frontendApiRetrySwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendApiRetrySwitchInstalled = true;
    global.__legacyCallApiBeforeFrontendRetry = legacyCallApi;
    global.callApi = apiClient.createLegacyCallApiRetryWrapper(legacyCallApi);

    try {
      callApi = global.callApi;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend API retry wrapper installed"
    };
  }

  function getLegacyState() {
    if (global.state && typeof global.state === "object") {
      return global.state;
    }

    try {
      if (state && typeof state === "object") {
        return state;
      }
    } catch (_) {}

    return {};
  }

  function setLegacyState(nextState) {
    global.state = nextState;

    try {
      state = nextState;
    } catch (_) {}
  }

  function installFrontendSnapshotStoreSwitch() {
    if (!isSnapshotStoreSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendSnapshotStoreModule is disabled"
      };
    }

    const snapshotStore = getSnapshotStoreModule();
    if (typeof snapshotStore.mergePartialSnapshot !== "function") {
      return {
        installed: false,
        reason: "snapshotStore.mergePartialSnapshot is not available"
      };
    }

    if (global.__frontendSnapshotStoreSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendSnapshotStoreSwitchInstalled = true;
    global.__legacyMergeSnapshotBeforeFrontendStore = global.mergeSnapshot || (typeof mergeSnapshot === "function" ? mergeSnapshot : null);

    global.mergeSnapshot = function frontendMergeSnapshot(snapshot) {
      setLegacyState(snapshotStore.mergePartialSnapshot(snapshot || {}, getLegacyState()));
    };

    try {
      mergeSnapshot = global.mergeSnapshot;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Snapshot Store merge installed"
    };
  }

  function renderFrontendTrade() {
    const trading = getTradingModule();
    const root = global.document && global.document.getElementById
      ? global.document.getElementById("trade")
      : null;

    if (!root || typeof trading.renderTradingPage !== "function") return;

    root.innerHTML = trading.renderTradingPage({
      state: global.state || {}
    });
  }

  function installFrontendTradingSwitch() {
    if (!isTradingSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendTradingModule is disabled"
      };
    }

    const trading = getTradingModule();
    if (typeof trading.renderTradingPage !== "function") {
      return {
        installed: false,
        reason: "trading.renderTradingPage is not available"
      };
    }

    if (global.__frontendTradingSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendTradingSwitchInstalled = true;
    global.__legacyRenderTradeBeforeFrontendTrading = global.renderTrade || (typeof renderTrade === "function" ? renderTrade : null);
    global.renderTrade = renderFrontendTrade;

    try {
      renderTrade = global.renderTrade;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Trading renderer installed"
    };
  }

  function renderFrontendStore() {
    const store = getStoreModule();
    const root = global.document && global.document.getElementById
      ? global.document.getElementById("store")
      : null;

    if (!root || typeof store.renderStorePanel !== "function") return;

    root.innerHTML = store.renderStorePanel({
      state: global.state || {}
    });
  }

  function installFrontendStoreSwitch() {
    if (!isStoreSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendStoreModule is disabled"
      };
    }

    const store = getStoreModule();
    if (typeof store.renderStorePanel !== "function") {
      return {
        installed: false,
        reason: "store.renderStorePanel is not available"
      };
    }

    if (global.__frontendStoreSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendStoreSwitchInstalled = true;
    global.__legacyRenderStoreBeforeFrontendStore = global.renderStore || (typeof renderStore === "function" ? renderStore : null);
    global.renderStore = renderFrontendStore;

    try {
      renderStore = global.renderStore;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Store renderer installed"
    };
  }

  function renderFrontendUseItemCard() {
    const inventory = getInventoryModule();

    if (typeof inventory.renderInventoryPanel !== "function") {
      return "";
    }

    return inventory.renderInventoryPanel({
      state: global.state || {}
    });
  }

  function installFrontendInventorySwitch() {
    if (!isInventorySwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendInventoryModule is disabled"
      };
    }

    const inventory = getInventoryModule();
    if (typeof inventory.renderInventoryPanel !== "function") {
      return {
        installed: false,
        reason: "inventory.renderInventoryPanel is not available"
      };
    }

    if (global.__frontendInventorySwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendInventorySwitchInstalled = true;
    global.__legacyRenderUseItemCardBeforeFrontendInventory = global.renderUseItemCard || (typeof renderUseItemCard === "function" ? renderUseItemCard : null);
    global.renderUseItemCard = renderFrontendUseItemCard;

    try {
      renderUseItemCard = global.renderUseItemCard;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Inventory use-item renderer installed"
    };
  }

  function renderFrontendDashboardProfile() {
    const dashboard = getDashboardModule();
    const profile = getProfileModule();
    const root = global.document && global.document.getElementById
      ? global.document.getElementById("profile")
      : null;
    const sections = [];

    if (!root) return;

    if (isDashboardSwitchEnabled() && typeof dashboard.renderDashboardPanel === "function") {
      sections.push(dashboard.renderDashboardPanel({
        state: global.state || {}
      }));
    }

    if (isProfileSwitchEnabled() && typeof profile.renderProfilePanel === "function") {
      sections.push(profile.renderProfilePanel({
        state: global.state || {}
      }));
    }

    if (!sections.length) return;

    root.innerHTML = sections.join("");
  }

  function installFrontendDashboardProfileSwitch() {
    if (!isDashboardSwitchEnabled() && !isProfileSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendDashboardModule and useFrontendProfileModule are disabled"
      };
    }

    const dashboard = getDashboardModule();
    const profile = getProfileModule();

    if (isDashboardSwitchEnabled() && typeof dashboard.renderDashboardPanel !== "function") {
      return {
        installed: false,
        reason: "dashboard.renderDashboardPanel is not available"
      };
    }

    if (isProfileSwitchEnabled() && typeof profile.renderProfilePanel !== "function") {
      return {
        installed: false,
        reason: "profile.renderProfilePanel is not available"
      };
    }

    if (global.__frontendDashboardProfileSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendDashboardProfileSwitchInstalled = true;
    global.__legacyRenderProfileBeforeFrontendDashboardProfile = global.renderProfile || (typeof renderProfile === "function" ? renderProfile : null);
    global.renderProfile = renderFrontendDashboardProfile;

    try {
      renderProfile = global.renderProfile;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Dashboard/Profile renderer installed"
    };
  }

  function installFrontendAuthSwitch() {
    if (!isAuthSwitchEnabled()) {
      return {
        installed: false,
        reason: "useFrontendAuthModule is disabled"
      };
    }

    const auth = getAuthModule();

    if (
      typeof auth.renderLoginError !== "function" ||
      typeof auth.rotateLoginQuote !== "function"
    ) {
      return {
        installed: false,
        reason: "Auth display helpers are not available"
      };
    }

    if (global.__frontendAuthSwitchInstalled) {
      return {
        installed: true,
        reason: "already installed"
      };
    }

    global.__frontendAuthSwitchInstalled = true;
    global.__legacyShowLoginBeforeFrontendAuth = global.showLogin || (typeof showLogin === "function" ? showLogin : null);
    global.__legacyShowLoginErrorBeforeFrontendAuth = global.showLoginError || (typeof showLoginError === "function" ? showLoginError : null);
    global.__legacyClearLoginErrorBeforeFrontendAuth = global.clearLoginError || (typeof clearLoginError === "function" ? clearLoginError : null);

    global.showLogin = function frontendShowLogin() {
      if (typeof global.__legacyShowLoginBeforeFrontendAuth === "function") {
        global.__legacyShowLoginBeforeFrontendAuth();
      }

      auth.rotateLoginQuote(global.document, 0);
    };

    global.showLoginError = function frontendShowLoginError(message) {
      const root = global.document && global.document.getElementById
        ? global.document.getElementById("loginError")
        : null;

      if (!root) {
        if (typeof global.__legacyShowLoginErrorBeforeFrontendAuth === "function") {
          global.__legacyShowLoginErrorBeforeFrontendAuth(message);
        }
        return;
      }

      const classified = typeof auth.classifyLoginError === "function"
        ? auth.classifyLoginError(message)
        : { className: "bad", message };

      root.className = `status-box ${classified.className || "bad"}`;
      root.textContent = classified.message || "";
      root.classList.remove("hidden");
    };

    global.clearLoginError = function frontendClearLoginError() {
      const root = global.document && global.document.getElementById
        ? global.document.getElementById("loginError")
        : null;

      if (!root) {
        if (typeof global.__legacyClearLoginErrorBeforeFrontendAuth === "function") {
          global.__legacyClearLoginErrorBeforeFrontendAuth();
        }
        return;
      }

      root.textContent = "";
      root.classList.add("hidden");
    };

    try {
      showLogin = global.showLogin;
      showLoginError = global.showLoginError;
      clearLoginError = global.clearLoginError;
    } catch (_) {}

    return {
      installed: true,
      reason: "frontend Auth display helpers installed"
    };
  }

  app.modules.legacyBridge = {
    status: "guarded",
    description: "Guarded bridge for frontend modules. Default feature flags keep this disabled.",
    installFrontendMarketNewsSwitch,
    installFrontendMarketProfileSwitch,
    installFrontendApiRetrySwitch,
    installFrontendSnapshotStoreSwitch,
    installFrontendTradingSwitch,
    installFrontendStoreSwitch,
    installFrontendInventorySwitch,
    installFrontendDashboardProfileSwitch,
    installFrontendAuthSwitch
  };

  installFrontendMarketNewsSwitch();
  installFrontendMarketProfileSwitch();
  installFrontendApiRetrySwitch();
  installFrontendSnapshotStoreSwitch();
  installFrontendTradingSwitch();
  installFrontendStoreSwitch();
  installFrontendInventorySwitch();
  installFrontendDashboardProfileSwitch();
  installFrontendAuthSwitch();
})(window);
