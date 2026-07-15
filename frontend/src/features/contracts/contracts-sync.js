(function initEconovariaPlayerContractsSync() {
  "use strict";

  const NAV_REFRESH_WINDOW_MS = 1500;
  let refreshPromise = null;
  let dashboardWrapped = false;
  let lastRefreshAt = 0;

  function feature() {
    return window.Econovaria?.features?.contracts || null;
  }

  function activeSession() {
    try {
      return currentSession || null;
    } catch (_) {
      return null;
    }
  }

  function hasPlayerSession() {
    const session = activeSession();
    return Boolean(
      session &&
      session.token &&
      session.gameSessionId &&
      session.role === "STUDENT"
    );
  }

  async function refreshPlayerContracts(options = {}) {
    const force = options.force === true;
    if (!hasPlayerSession()) return null;
    if (refreshPromise) return refreshPromise;
    if (!force && Date.now() - lastRefreshAt < NAV_REFRESH_WINDOW_MS) return null;

    refreshPromise = (async () => {
      const contractsFeature = feature();
      const session = activeSession();
      if (!contractsFeature?.applyDashboardContracts || !session) return null;
      const { publishableKey } = getSupabaseConfig();
      const result = await callSupabaseJsonRoute(
        `/players/me/contracts?gameSessionId=${encodeURIComponent(session.gameSessionId)}`,
        {
          method: "GET",
          token: publishableKey,
          playerSessionToken: session.token,
          fallbackCode: "player_contracts_load_failed",
          fallbackMessage: "Contracts could not be loaded.",
        },
      );

      if (!result?.ok) {
        throw new Error(
          result?.error?.message || result?.message || "Contracts could not be loaded.",
        );
      }

      contractsFeature.applyDashboardContracts({
        me: {
          contracts: {
            available: Array.isArray(result.contracts) ? result.contracts : [],
            progress: Array.isArray(result.progress) ? result.progress : [],
          },
        },
      });
      contractsFeature.renderContracts?.();
      lastRefreshAt = Date.now();
      return result;
    })().catch((error) => {
      console.error("[Econovaria contracts] Contract refresh failed.", error);
      if (currentView?.() === "contracts") {
        showGlobalStatus?.("bad", cleanErrorMessage(error.message || String(error)));
      }
      return null;
    }).finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  function wrapDashboardRefresh() {
    if (dashboardWrapped || typeof window.loadPlayerGameDashboardSnapshot !== "function") {
      return;
    }

    const original = window.loadPlayerGameDashboardSnapshot;
    window.loadPlayerGameDashboardSnapshot = async function contractsAwareDashboardRefresh(...args) {
      const result = await original.apply(this, args);
      await refreshPlayerContracts({ force: true });
      return result;
    };
    dashboardWrapped = true;
  }

  function removePrivateNavigationListener() {
    const button = document.querySelector('.nav [data-view="contracts"]');
    if (!button || button.dataset.contractsNavigationNormalized === "true") return;
    const replacement = button.cloneNode(true);
    replacement.dataset.contractsNavigationNormalized = "true";
    button.replaceWith(replacement);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-view="contracts"]')) return;
    window.setTimeout(async () => {
      await refreshPlayerContracts();
      feature()?.renderContracts?.();
    }, 0);
  }, true);

  removePrivateNavigationListener();
  wrapDashboardRefresh();
  window.addEventListener("load", wrapDashboardRefresh, { once: true });

  window.Econovaria.features.contracts.refreshPlayerContracts = refreshPlayerContracts;
  window.Econovaria.features.contracts.wrapDashboardRefresh = wrapDashboardRefresh;
})();
