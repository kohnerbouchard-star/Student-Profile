(function initRefactorCheckpointLoader(global) {
  const CHECKPOINT_QUERY_PARAM = "checkpoint";
  const CHECKPOINT_STORAGE_KEY = "econovaria.refactorCheckpoint";
  const CACHE_VERSION = "20260613-checkpoint-loader1";

  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.refactor = app.refactor || {};

  function getConfig() {
    return global.ECONOVARIA_REFACTOR_CHECKPOINTS || {
      defaultCheckpoint: "baseline",
      checkpoints: {
        baseline: {
          label: "Baseline live app",
          description: "No folderized files are loaded.",
          scripts: [],
          requiredGlobals: []
        }
      }
    };
  }

  function getRequestedCheckpointName() {
    const params = new URLSearchParams(global.location.search || "");
    const fromUrl = String(params.get(CHECKPOINT_QUERY_PARAM) || "").trim();

    if (fromUrl) {
      if (fromUrl === "clear" || fromUrl === "off") {
        try {
          global.localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
        } catch (_) {}
        return "baseline";
      }

      try {
        global.localStorage.setItem(CHECKPOINT_STORAGE_KEY, fromUrl);
      } catch (_) {}
      return fromUrl;
    }

    try {
      return global.localStorage.getItem(CHECKPOINT_STORAGE_KEY) || getConfig().defaultCheckpoint || "baseline";
    } catch (_) {
      return getConfig().defaultCheckpoint || "baseline";
    }
  }

  function getCheckpoint(name) {
    const config = getConfig();
    const checkpoints = config.checkpoints || {};
    return checkpoints[name] || checkpoints[config.defaultCheckpoint] || checkpoints.baseline;
  }

  function withCacheVersion(path) {
    return path.indexOf("?") >= 0 ? `${path}&v=${CACHE_VERSION}` : `${path}?v=${CACHE_VERSION}`;
  }

  function getScriptPathname(src) {
    try {
      return new URL(src, global.location.href).pathname;
    } catch (_) {
      return "";
    }
  }

  function loadScript(path) {
    const src = withCacheVersion(path);
    const requestedPathname = getScriptPathname(path);

    if (Array.from(document.scripts || []).some((script) => getScriptPathname(script.src) === requestedPathname)) {
      return Promise.resolve({ path, status: "already-loaded" });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.econovariaRefactorCheckpointScript = "true";
      script.onload = () => resolve({ path, status: "loaded" });
      script.onerror = () => reject(new Error(`Failed to load checkpoint script: ${path}`));
      document.head.appendChild(script);
    });
  }

  async function loadCheckpoint(name) {
    const checkpointName = name || getRequestedCheckpointName();
    const checkpoint = getCheckpoint(checkpointName);
    const scripts = Array.isArray(checkpoint.scripts) ? checkpoint.scripts : [];
    const loadedScripts = [];

    app.refactor.activeCheckpoint = checkpointName;
    app.refactor.activeCheckpointConfig = checkpoint;
    app.refactor.loadedScripts = loadedScripts;

    for (let index = 0; index < scripts.length; index += 1) {
      loadedScripts.push(await loadScript(scripts[index]));
    }

    return testCheckpoint(checkpointName);
  }

  function testCheckpoint(name) {
    const checkpointName = name || app.refactor.activeCheckpoint || getRequestedCheckpointName();
    const checkpoint = getCheckpoint(checkpointName);
    const requiredGlobals = Array.isArray(checkpoint.requiredGlobals) ? checkpoint.requiredGlobals : [];
    const missingGlobals = requiredGlobals.filter((globalName) => typeof global[globalName] !== "function");

    const domChecks = {
      loginScreen: Boolean(document.getElementById("loginScreen")),
      appShell: Boolean(document.getElementById("appShell")),
      profileView: Boolean(document.getElementById("profile")),
      storeView: Boolean(document.getElementById("store")),
      tradeView: Boolean(document.getElementById("trade")),
      stockProfileView: Boolean(document.getElementById("stockProfile")),
      ratingView: Boolean(document.getElementById("rating"))
    };

    const failedDomChecks = Object.keys(domChecks).filter((key) => domChecks[key] !== true);

    const result = {
      checkpoint: checkpointName,
      label: checkpoint.label || checkpointName,
      ok: missingGlobals.length === 0 && failedDomChecks.length === 0,
      missingGlobals,
      failedDomChecks,
      domChecks,
      loadedScripts: app.refactor.loadedScripts || [],
      description: checkpoint.description || ""
    };

    app.refactor.lastTestResult = result;
    return result;
  }

  function listCheckpoints() {
    const checkpoints = getConfig().checkpoints || {};
    return Object.keys(checkpoints).map((name) => ({
      name,
      label: checkpoints[name].label || name,
      description: checkpoints[name].description || "",
      scriptCount: Array.isArray(checkpoints[name].scripts) ? checkpoints[name].scripts.length : 0
    }));
  }

  function renderCheckpointBadge() {
    if (document.getElementById("econovariaCheckpointBadge")) return;

    const badge = document.createElement("div");
    badge.id = "econovariaCheckpointBadge";
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:9999",
      "font:12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "background:rgba(17,24,39,.92)",
      "color:#fff",
      "padding:8px 10px",
      "border-radius:999px",
      "box-shadow:0 8px 24px rgba(0,0,0,.22)",
      "pointer-events:none"
    ].join(";");

    const active = app.refactor.activeCheckpoint || getRequestedCheckpointName();
    badge.textContent = `Checkpoint: ${active}`;
    document.body.appendChild(badge);
  }

  app.refactor.loader = {
    loadCheckpoint,
    testCheckpoint,
    listCheckpoints,
    getRequestedCheckpointName
  };

  global.loadEconovariaCheckpoint = loadCheckpoint;
  global.testEconovariaCheckpoint = testCheckpoint;
  global.listEconovariaCheckpoints = listCheckpoints;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadCheckpoint().then(renderCheckpointBadge).catch((error) => {
        console.error("[Econovaria checkpoint loader] Checkpoint load failed.", error);
      });
    });
  } else {
    loadCheckpoint().then(renderCheckpointBadge).catch((error) => {
      console.error("[Econovaria checkpoint loader] Checkpoint load failed.", error);
    });
  }
})(window);
