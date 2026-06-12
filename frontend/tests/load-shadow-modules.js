(function (global) {
  const LOADER_NAME = "Econovaria frontend shadow loader";
  const LOADER_FLAG = "__econovariaFrontendShadowLoaderInstalled";
  const LOADED_URLS = "__econovariaFrontendShadowLoadedUrls";

  const SHADOW_SCRIPT_PATHS = [
    "frontend/config/runtime-config.js",

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
    "frontend/src/components/table.js",

    "frontend/src/core/api-client.js",
    "frontend/src/core/snapshot-store.js",

    "frontend/src/features/market/market-service.js",
    "frontend/src/features/market/market-chart-view.js",
    "frontend/src/features/market/market-normalizers.js",
    "frontend/src/features/market/market-selectors.js",
    "frontend/src/features/market/market-news-modal.js",
    "frontend/src/features/market/market-news-view.js",
    "frontend/src/features/market/market-profile-view.js",

    "frontend/src/legacy/legacy-bridge.js",
    "frontend/tests/module-test-harness.js"
  ];

  const TEST_COMMANDS = [
    "window.testFrontendMarketNewsModule()",
    "window.compareLegacyAndFrontendMarketNews()",
    "window.testFrontendMarketProfileModule()",
    "window.compareLegacyAndFrontendMarketProfile()",
    "window.testFrontendApiClientModule()",
    "window.compareLegacyAndFrontendApiRetry()",
    "window.testFrontendSnapshotStoreModule()",
    "window.compareLegacyAndFrontendSnapshotMerge()"
  ];

  if (!global[LOADED_URLS]) {
    global[LOADED_URLS] = {};
  }

  function logInfo(message, detail) {
    if (detail !== undefined) {
      console.info(`[${LOADER_NAME}] ${message}`, detail);
      return;
    }

    console.info(`[${LOADER_NAME}] ${message}`);
  }

  function logWarn(message, detail) {
    if (detail !== undefined) {
      console.warn(`[${LOADER_NAME}] ${message}`, detail);
      return;
    }

    console.warn(`[${LOADER_NAME}] ${message}`);
  }

  function logError(message, detail) {
    if (detail !== undefined) {
      console.error(`[${LOADER_NAME}] ${message}`, detail);
      return;
    }

    console.error(`[${LOADER_NAME}] ${message}`);
  }

  function getLoaderScriptUrl() {
    const currentScript = document.currentScript;
    if (currentScript && currentScript.src) {
      return currentScript.src;
    }

    const scripts = Array.from(document.scripts || []);
    const loaderScript = scripts.find(function (script) {
      return script.src && script.src.includes("frontend/tests/load-shadow-modules.js");
    });

    return loaderScript && loaderScript.src || "";
  }

  function getAppRootUrl() {
    const loaderUrl = getLoaderScriptUrl();

    if (loaderUrl) {
      return new URL("../../", loaderUrl);
    }

    return new URL("./", global.location.href);
  }

  function resolveScriptUrl(path) {
    return new URL(path, getAppRootUrl()).href;
  }

  function isScriptAlreadyLoaded(url) {
    if (global[LOADED_URLS][url]) {
      return true;
    }

    return Array.from(document.scripts || []).some(function (script) {
      return script.src && new URL(script.src, document.baseURI).href === url;
    });
  }

  function loadScript(path) {
    const url = resolveScriptUrl(path);

    if (isScriptAlreadyLoaded(url)) {
      global[LOADED_URLS][url] = true;
      logInfo(`Already loaded: ${path}`);
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
      script.dataset.econovariaShadowModule = "true";
      script.dataset.econovariaShadowPath = path;

      script.onload = function () {
        global[LOADED_URLS][url] = true;
        logInfo(`Loaded: ${path}`);
        resolve({
          path,
          url,
          status: "loaded"
        });
      };

      script.onerror = function () {
        const error = new Error(`Could not load ${path} from ${url}`);
        logError(`Failed to load: ${path}`, error);
        reject(error);
      };

      document.head.appendChild(script);
    });
  }

  function getFeatureFlags() {
    const config = global.ECONOVARIA_FRONTEND_CONFIG || {};
    return config.FEATURE_FLAGS || {};
  }

  function reportFeatureFlags() {
    const flags = getFeatureFlags();
    const enabledFlags = Object.keys(flags).filter(function (key) {
      return flags[key] === true;
    });

    logInfo("Feature flags after shadow load:", Object.assign({}, flags));

    if (enabledFlags.length) {
      logWarn("One or more feature flags are enabled, so guarded bridges may patch runtime behavior.", enabledFlags);
    } else {
      logInfo("All feature flags are false; shadow modules should not patch runtime behavior.");
    }
  }

  function printAvailableTestCommands() {
    logInfo("Available shadow test commands:");
    TEST_COMMANDS.forEach(function (command) {
      console.info(command);
    });
  }

  async function loadEconovariaFrontendShadowModules() {
    if (!document.head) {
      throw new Error("document.head is not available. Load the app page before running the shadow loader.");
    }

    logInfo("Starting shadow module load.");

    const loaded = [];

    try {
      for (let index = 0; index < SHADOW_SCRIPT_PATHS.length; index += 1) {
        loaded.push(await loadScript(SHADOW_SCRIPT_PATHS[index]));
      }

      reportFeatureFlags();
      printAvailableTestCommands();
      logInfo("Shadow module load complete.");

      return {
        ok: true,
        loaded,
        commands: TEST_COMMANDS.slice(),
        featureFlags: Object.assign({}, getFeatureFlags())
      };
    } catch (error) {
      logError("Shadow module load stopped before completion.", error);
      printAvailableTestCommands();

      return {
        ok: false,
        loaded,
        error: error && error.message || String(error),
        commands: TEST_COMMANDS.slice(),
        featureFlags: Object.assign({}, getFeatureFlags())
      };
    }
  }

  global.loadEconovariaFrontendShadowModules = loadEconovariaFrontendShadowModules;

  if (!global[LOADER_FLAG]) {
    global[LOADER_FLAG] = true;
    logInfo("Loader installed. Run window.loadEconovariaFrontendShadowModules() to load modules.");
  }
})(window);
