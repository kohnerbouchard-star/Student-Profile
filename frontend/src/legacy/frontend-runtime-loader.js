(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  const RUNTIME_NAME = "Econovaria frontend runtime loader";
  const RUNTIME_VERSION = "20260613-marketprofile-rollback1";
  const LOADED_URLS = "__econovariaFrontendRuntimeLoadedUrls";

  const COMMON_SCRIPT_PATHS = [
    "frontend/src/utils/sanitize.js",
    "frontend/src/utils/dates.js",
    "frontend/src/utils/numbers.js",
    "frontend/src/utils/currency.js",
    "frontend/src/utils/dom.js",
    "frontend/src/utils/formatters.js",
    "frontend/src/components/badge.js",
    "frontend/src/components/card.js",
    "frontend/src/components/empty-state.js",
    "frontend/src/components/modal.js",
    "frontend/src/components/status-box.js",
    "frontend/src/components/table.js"
  ];

  const FEATURE_CONFIGS = {
    marketNews: {
      flag: "useFrontendMarketNewsModule",
      bridge: "installFrontendMarketNewsSwitch",
      paths: [
        "frontend/src/features/market/market-normalizers.js",
        "frontend/src/features/market/market-selectors.js",
        "frontend/src/features/market/market-news-modal.js",
        "frontend/src/features/market/market-news-view.js"
      ]
    },
    marketProfile: {
      flag: "useFrontendMarketProfileModule",
      bridge: "installFrontendMarketProfileSwitch",
      paths: [
        "frontend/src/features/market/market-service.js",
        "frontend/src/features/market/market-chart-view.js",
        "frontend/src/features/market/market-normalizers.js",
        "frontend/src/features/market/market-selectors.js",
        "frontend/src/features/market/market-profile-view.js"
      ]
    },
    apiRetry: {
      flag: "useFrontendApiRetryModule",
      bridge: "installFrontendApiRetrySwitch",
      paths: ["frontend/src/core/api-client.js"]
    },
    snapshotStore: {
      flag: "useFrontendSnapshotStoreModule",
      bridge: "installFrontendSnapshotStoreSwitch",
      paths: ["frontend/src/core/snapshot-store.js"]
    },
    trading: {
      flag: "useFrontendTradingModule",
      bridge: "installFrontendTradingSwitch",
      paths: [
        "frontend/src/features/trading/trading-service.js",
        "frontend/src/features/trading/trade-history-view.js",
        "frontend/src/features/trading/trading-view.js"
      ]
    },
    store: {
      flag: "useFrontendStoreModule",
      bridge: "installFrontendStoreSwitch",
      paths: [
        "frontend/src/features/store/store-normalizers.js",
        "frontend/src/features/store/store-selectors.js",
        "frontend/src/features/store/store-service.js",
        "frontend/src/features/store/store-view.js",
        "frontend/src/features/store/store-controller.js"
      ]
    },
    inventory: {
      flag: "useFrontendInventoryModule",
      bridge: "installFrontendInventorySwitch",
      paths: [
        "frontend/src/features/inventory/inventory-normalizers.js",
        "frontend/src/features/inventory/inventory-selectors.js",
        "frontend/src/features/inventory/item-use-service.js",
        "frontend/src/features/inventory/inventory-view.js",
        "frontend/src/features/inventory/inventory-controller.js"
      ]
    },
    dashboard: {
      flag: "useFrontendDashboardModule",
      bridge: "installFrontendDashboardProfileSwitch",
      paths: [
        "frontend/src/features/dashboard/dashboard-normalizers.js",
        "frontend/src/features/dashboard/dashboard-selectors.js",
        "frontend/src/features/dashboard/dashboard-view.js",
        "frontend/src/features/dashboard/dashboard-controller.js"
      ]
    },
    profile: {
      flag: "useFrontendProfileModule",
      bridge: "installFrontendDashboardProfileSwitch",
      paths: [
        "frontend/src/features/profile/profile-normalizers.js",
        "frontend/src/features/profile/profile-selectors.js",
        "frontend/src/features/profile/profile-view.js",
        "frontend/src/features/profile/profile-controller.js"
      ]
    },
    auth: {
      flag: "useFrontendAuthModule",
      bridge: "installFrontendAuthSwitch",
      paths: [
        "frontend/src/features/auth/login-quotes.js",
        "frontend/src/features/auth/auth-normalizers.js",
        "frontend/src/features/auth/auth-selectors.js",
        "frontend/src/features/auth/auth-service.js",
        "frontend/src/features/auth/login-view.js",
        "frontend/src/features/auth/auth-controller.js"
      ]
    }
  };

  const FEATURE_NAMES = Object.keys(FEATURE_CONFIGS);

  if (!global[LOADED_URLS]) {
    global[LOADED_URLS] = {};
  }

  const runtime = app.runtime = app.runtime || {};
  runtime.loadedUrls = runtime.loadedUrls || global[LOADED_URLS];
  runtime.version = RUNTIME_VERSION;

  function now() {
    return new Date().toISOString();
  }

  function logInfo(message, detail) {
    if (detail !== undefined) {
      console.info(`[${RUNTIME_NAME}] ${message}`, detail);
      return;
    }

    console.info(`[${RUNTIME_NAME}] ${message}`);
  }

  function logError(message, detail) {
    if (detail !== undefined) {
      console.error(`[${RUNTIME_NAME}] ${message}`, detail);
      return;
    }

    console.error(`[${RUNTIME_NAME}] ${message}`);
  }

  function setStatus(featureName, patch) {
    runtime[featureName] = Object.assign({
      loaded: false,
      enabled: false,
      patched: false,
      reason: "not evaluated",
      timestamp: now()
    }, patch || {}, {
      timestamp: now()
    });

    return runtime[featureName];
  }

  function resetStatuses() {
    FEATURE_NAMES.forEach(function (featureName) {
      setStatus(featureName, {
        loaded: false,
        enabled: false,
        patched: false,
        reason: "not evaluated"
      });
    });
  }

  function getLoaderScriptUrl() {
    const currentScript = document.currentScript;

    if (currentScript && currentScript.src) {
      return currentScript.src;
    }

    const scripts = Array.from(document.scripts || []);
    const loaderScript = scripts.find(function (script) {
      return script.src && script.src.includes("frontend/src/legacy/frontend-runtime-loader.js");
    });

    return loaderScript && loaderScript.src || "";
  }

  function getAppRootUrl() {
    const loaderUrl = getLoaderScriptUrl();

    if (loaderUrl) {
      return new URL("../../../", loaderUrl);
    }

    return new URL("./", global.location.href);
  }

  function withRuntimeVersion(path) {
    if (path.indexOf("?") !== -1) {
      return `${path}&v=${RUNTIME_VERSION}`;
    }

    return `${path}?v=${RUNTIME_VERSION}`;
  }

  function resolveScriptUrl(path) {
    return new URL(path, getAppRootUrl()).href;
  }

  function isScriptAlreadyLoaded(url) {
    if (runtime.loadedUrls[url]) {
      return true;
    }

    return Array.from(document.scripts || []).some(function (script) {
      return script.src && new URL(script.src, document.baseURI).href === url;
    });
  }

  function loadScript(path, options) {
    const shouldCacheBust = !options || options.cacheBust !== false;
    const pathToLoad = shouldCacheBust ? withRuntimeVersion(path) : path;
    const url = resolveScriptUrl(pathToLoad);

    if (isScriptAlreadyLoaded(url)) {
      runtime.loadedUrls[url] = true;
      return Promise.resolve({
        path,
        url,
        status: "already-loaded"
      });
    }

    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.dataset.econovariaRuntimeModule = "true";
      script.dataset.econovariaRuntimePath = path;

      script.onload = function () {
        runtime.loadedUrls[url] = true;
        resolve({
          path,
          url,
          status: "loaded"
        });
      };

      script.onerror = function () {
        reject(new Error(`Could not load ${path} from ${url}`));
      };

      document.head.appendChild(script);
    });
  }

  function getFeatureFlags() {
    const config = global.ECONOVARIA_FRONTEND_CONFIG || {};
    return config.FEATURE_FLAGS || {};
  }

  function isFeatureEnabled(featureName) {
    const feature = FEATURE_CONFIGS[featureName];
    return getFeatureFlags()[feature.flag] === true;
  }

  function getEnabledFeatures() {
    return FEATURE_NAMES.filter(isFeatureEnabled);
  }

  function uniquePaths(paths) {
    const seen = {};

    return paths.filter(function (path) {
      if (seen[path]) return false;
      seen[path] = true;
      return true;
    });
  }

  async function loadPaths(paths) {
    const loaded = [];
    const orderedPaths = uniquePaths(paths);

    for (let index = 0; index < orderedPaths.length; index += 1) {
      loaded.push(await loadScript(orderedPaths[index]));
    }

    return loaded;
  }

  function markDisabledFeatures() {
    FEATURE_NAMES.forEach(function (featureName) {
      if (!isFeatureEnabled(featureName)) {
        setStatus(featureName, {
          loaded: false,
          enabled: false,
          patched: false,
          reason: `${FEATURE_CONFIGS[featureName].flag} is false`
        });
      }
    });
  }

  function getBridgeInstaller(featureName) {
    const bridge = app.modules.legacyBridge || {};
    const installerName = FEATURE_CONFIGS[featureName].bridge;
    return typeof bridge[installerName] === "function" ? bridge[installerName] : null;
  }

  function installBridge(featureName) {
    const installer = getBridgeInstaller(featureName);

    if (!installer) {
      return setStatus(featureName, {
        loaded: true,
        enabled: true,
        patched: false,
        reason: `${FEATURE_CONFIGS[featureName].bridge} is not available`
      });
    }

    try {
      const result = installer();

      return setStatus(featureName, {
        loaded: true,
        enabled: true,
        patched: Boolean(result && result.installed),
        reason: result && result.reason || "bridge installer completed"
      });
    } catch (error) {
      logError(`Bridge install failed for ${featureName}. Legacy behavior remains available.`, error);

      return setStatus(featureName, {
        loaded: true,
        enabled: true,
        patched: false,
        reason: error && error.message || String(error)
      });
    }
  }

  function getStatus() {
    const status = {};

    FEATURE_NAMES.forEach(function (featureName) {
      status[featureName] = Object.assign({}, runtime[featureName]);
    });

    return status;
  }

  async function initializeRuntime(options) {
    if (!document.head) {
      throw new Error("document.head is not available. Load the app page before starting frontend runtime modules.");
    }

    if (runtime.initializing) {
      return runtime.initializing;
    }

    if (runtime.initialized && !(options && options.force === true)) {
      return getStatus();
    }

    runtime.initializing = (async function () {
      runtime.startedAt = now();
      runtime.initialized = false;
      resetStatuses();

      try {
        await loadScript("frontend/config/runtime-config.js");
      } catch (error) {
        FEATURE_NAMES.forEach(function (featureName) {
          setStatus(featureName, {
            loaded: false,
            enabled: false,
            patched: false,
            reason: `config failed to load: ${error.message || error}`
          });
        });
        runtime.initialized = true;
        runtime.completedAt = now();
        logError("Config failed to load. Legacy behavior remains active.", error);
        return getStatus();
      }

      markDisabledFeatures();

      const enabledFeatures = getEnabledFeatures();

      if (!enabledFeatures.length) {
        runtime.initialized = true;
        runtime.completedAt = now();
        logInfo("No frontend feature flags are enabled. Legacy behavior remains active.");
        return getStatus();
      }

      try {
        await loadPaths(COMMON_SCRIPT_PATHS);
      } catch (error) {
        enabledFeatures.forEach(function (featureName) {
          setStatus(featureName, {
            loaded: false,
            enabled: true,
            patched: false,
            reason: `common dependency failed to load: ${error.message || error}`
          });
        });
        runtime.initialized = true;
        runtime.completedAt = now();
        logError("Common frontend dependencies failed to load. Legacy behavior remains active.", error);
        return getStatus();
      }

      for (let index = 0; index < enabledFeatures.length; index += 1) {
        const featureName = enabledFeatures[index];
        const feature = FEATURE_CONFIGS[featureName];

        setStatus(featureName, {
          loaded: false,
          enabled: true,
          patched: false,
          reason: "loading module scripts"
        });

        try {
          await loadPaths(feature.paths);
          setStatus(featureName, {
            loaded: true,
            enabled: true,
            patched: false,
            reason: "module scripts loaded"
          });
        } catch (error) {
          logError(`Feature ${featureName} failed to load. Legacy behavior remains active for this feature.`, error);
          setStatus(featureName, {
            loaded: false,
            enabled: true,
            patched: false,
            reason: error && error.message || String(error)
          });
        }
      }

      const loadableFeatures = enabledFeatures.filter(function (featureName) {
        return runtime[featureName] && runtime[featureName].loaded === true;
      });

      if (loadableFeatures.length) {
        try {
          await loadScript("frontend/src/legacy/legacy-bridge.js");
        } catch (error) {
          loadableFeatures.forEach(function (featureName) {
            setStatus(featureName, {
              loaded: true,
              enabled: true,
              patched: false,
              reason: `legacy bridge failed to load: ${error.message || error}`
            });
          });
          runtime.initialized = true;
          runtime.completedAt = now();
          logError("Frontend legacy bridge failed to load. Legacy behavior remains active.", error);
          return getStatus();
        }

        loadableFeatures.forEach(installBridge);
      }

      runtime.initialized = true;
      runtime.completedAt = now();
      logInfo("Frontend runtime initialization complete.", getStatus());
      return getStatus();
    })();

    try {
      return await runtime.initializing;
    } finally {
      runtime.initializing = null;
    }
  }

  resetStatuses();
  runtime.featureConfigs = FEATURE_CONFIGS;
  runtime.getStatus = getStatus;
  runtime.initialize = initializeRuntime;

  initializeRuntime().catch(function (error) {
    runtime.initialized = true;
    runtime.completedAt = now();
    runtime.error = error && error.message || String(error);
    logError("Frontend runtime initialization failed. Legacy behavior remains active.", error);
  });
})(window);
