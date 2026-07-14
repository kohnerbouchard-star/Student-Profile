window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

let contractsFeaturePromise = null;

function configurePlayerIdentityLogin() {
  const form = document.getElementById("playerForm");
  const playerIdentifierInput = document.getElementById("playerId");
  const accessCodeInput = document.getElementById("playerAccessCode");
  if (!form || !playerIdentifierInput || !accessCodeInput) return;

  playerIdentifierInput.required = true;
  playerIdentifierInput.autocomplete = "off";
  playerIdentifierInput.placeholder = "Scan RFID card or enter Player ID";
  playerIdentifierInput.setAttribute("aria-label", "RFID Player ID");

  const accessLabel = accessCodeInput.closest("label");
  accessLabel?.classList.remove("disabled-field");
  const accessLabelText = accessLabel?.querySelector("span");
  if (accessLabelText) accessLabelText.textContent = "Access Code";

  accessCodeInput.disabled = false;
  accessCodeInput.required = true;
  accessCodeInput.autocomplete = "current-password";
  accessCodeInput.placeholder = "Enter Access Code";
  accessCodeInput.removeAttribute("aria-disabled");

  if (form.dataset.playerIdentityLoginBound === "true") return;
  form.dataset.playerIdentityLoginBound = "true";
  form.addEventListener("submit", handlePlayerIdentityLogin, { capture: true });
}

async function callPlayerIdentityLoginApi(gameCode, playerIdentifier, accessCode) {
  const { publishableKey } = getSupabaseConfig();

  return callSupabaseJsonRoute("/players/login", {
    method: "POST",
    token: publishableKey,
    body: {
      gameJoinCode: String(gameCode || "").trim(),
      playerIdentifier: String(playerIdentifier || "").trim(),
      accessCode: String(accessCode || "").trim(),
    },
    fallbackCode: "player_login_failed",
    fallbackMessage: "Player login failed. Check the Game Code, Player ID, and Access Code.",
  });
}

async function handlePlayerIdentityLogin(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const gameCode = document.getElementById("gameCode")?.value.trim() || "";
  const playerIdentifier = document.getElementById("playerId")?.value.trim() || "";
  const accessCode = document.getElementById("playerAccessCode")?.value.trim() || "";
  const message = document.getElementById("playerMessage");

  clearLoginMessage(message);
  if (isButtonLoading(button)) return;

  if (!gameCode || !playerIdentifier || !accessCode) {
    return showLoginMessage(
      message,
      "Enter the Game Code, RFID Player ID, and Access Code.",
      "bad",
    );
  }

  setLoginFormBusy(form, true, "Opening session...");

  try {
    const result = await callPlayerIdentityLoginApi(
      gameCode,
      playerIdentifier,
      accessCode,
    );

    if (!result?.ok || !result.session?.token) {
      return showLoginMessage(
        message,
        cleanLoginError(result, "Player login failed."),
        "bad",
      );
    }

    const bootstrap = await callPlayerBootstrapApi(result.session.token);

    if (!bootstrap?.ok) {
      return showLoginMessage(
        message,
        cleanLoginError(bootstrap, "Your player session could not be loaded."),
        "bad",
      );
    }

    currentSession = {
      role: "STUDENT",
      token: result.session.token,
      authSource: "supabase-player",
      gameSessionId: bootstrap.gameSession?.id || "",
      permissions: Array.isArray(bootstrap.availableActions)
        ? bootstrap.availableActions
        : [],
    };

    state = Object.assign(emptyState(), {
      profile: createPlayerProfileFromBootstrap(bootstrap),
    });

    await loadPlayerGameDashboardSnapshot({ bootstrap, subscribe: true });

    form.reset();
    showLoginMessage(message, "Access granted.");
    showApp("profile");
    showGlobalStatus("ok", "Player session opened through Supabase.");
  } catch (error) {
    showLoginMessage(
      message,
      cleanErrorMessage(error.message || String(error)),
      "bad",
    );
  } finally {
    setLoginFormBusy(form, false);
    const accessCodeInput = document.getElementById("playerAccessCode");
    if (accessCodeInput) accessCodeInput.disabled = false;
  }
}

function loadContractsFeatureAssets() {
  if (contractsFeaturePromise) return contractsFeaturePromise;

  contractsFeaturePromise = new Promise((resolve) => {
    const stylesheetHref = new URL(
      "frontend/src/styles/screens/contracts.css",
      document.baseURI,
    ).href;
    const scriptSrc = new URL(
      "frontend/src/features/contracts/contracts.js",
      document.baseURI,
    ).href;

    if (!document.querySelector(`link[href="${stylesheetHref}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesheetHref;
      link.dataset.econovariaContractsStyles = "";
      document.head.append(link);
    }

    if (window.Econovaria?.features?.contracts?.renderContracts) {
      resolve(true);
      return;
    }

    const existing = document.querySelector(`script[src="${scriptSrc}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.dataset.econovariaContractsFeature = "";
    script.addEventListener("load", () => resolve(true), { once: true });
    script.addEventListener("error", () => {
      console.error("[Econovaria bootstrap] Contracts feature could not be loaded.");
      resolve(false);
    }, { once: true });
    document.head.append(script);
  });

  return contractsFeaturePromise;
}

async function init() {
  await loadContractsFeatureAssets();
  configurePlayerIdentityLogin();

  const auth = window.Econovaria?.features?.auth;
  const authInit = auth?.init;

  if (auth && typeof auth === "object") {
    auth.handlePlayerLogin = handlePlayerIdentityLogin;
  }

  if (typeof authInit === "function") {
    authInit();
    return;
  }

  console.error("[Econovaria bootstrap] Auth init function is not available.");

  if (typeof showGlobalStatus === "function") {
    showGlobalStatus("bad", "The dashboard could not start. Refresh and try again.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init(), { once: true });
} else {
  void init();
}

window.Econovaria.core.bootstrap = {
  init,
  configurePlayerIdentityLogin,
  handlePlayerIdentityLogin,
  loadContractsFeatureAssets,
};
