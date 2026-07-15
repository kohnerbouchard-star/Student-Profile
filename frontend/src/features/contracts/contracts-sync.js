(function initEconovariaPlayerContractsSync() {
  "use strict";

  const NAV_REFRESH_WINDOW_MS = 1500;
  const evidenceDrafts = new Map();
  let refreshPromise = null;
  let dashboardWrapped = false;
  let lastRefreshAt = 0;
  let restoreQueued = false;

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

  function contractForm(element) {
    return element instanceof Element
      ? element.closest("[data-contract-submit-form][data-contract-id]")
      : null;
  }

  function draftKey(form) {
    return String(form?.dataset?.contractId || "").trim();
  }

  function readDraft(form) {
    const values = {};
    for (const control of form.querySelectorAll("input[name], textarea[name], select[name]")) {
      if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
        values[control.name] = control.checked ? control.value : "";
      } else {
        values[control.name] = control.value;
      }
    }
    return values;
  }

  function captureDraft(form) {
    const key = draftKey(form);
    if (!key) return;
    const values = readDraft(form);
    const hasContent = Object.values(values).some((value) => String(value || "").trim());
    if (hasContent) evidenceDrafts.set(key, values);
  }

  function restoreDraft(form) {
    const key = draftKey(form);
    const values = evidenceDrafts.get(key);
    if (!key || !values) return;

    for (const control of form.querySelectorAll("input[name], textarea[name], select[name]")) {
      if (!(control.name in values)) continue;
      const value = String(values[control.name] ?? "");
      if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
        control.checked = value === control.value;
      } else if (control.value !== value) {
        control.value = value;
      }
    }
  }

  function restoreAllDrafts() {
    restoreQueued = false;
    document.querySelectorAll("[data-contract-submit-form][data-contract-id]")
      .forEach(restoreDraft);
  }

  function scheduleDraftRestore() {
    if (restoreQueued) return;
    restoreQueued = true;
    queueMicrotask(restoreAllDrafts);
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
      lastRefreshAt = Date.now();
      scheduleDraftRestore();
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

  document.addEventListener("input", (event) => {
    const form = contractForm(event.target);
    if (form) captureDraft(form);
  }, true);

  document.addEventListener("change", (event) => {
    const form = contractForm(event.target);
    if (form) captureDraft(form);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const submitButton = target?.closest('[data-contract-submit-form] button[type="submit"]');
    if (submitButton) {
      const form = contractForm(submitButton);
      if (form) restoreDraft(form);
      return;
    }

    if (!target?.closest('[data-view="contracts"]')) return;
    window.setTimeout(async () => {
      const refreshed = await refreshPlayerContracts();
      if (!refreshed) feature()?.renderContracts?.();
      scheduleDraftRestore();
    }, 0);
  }, true);

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes.length || record.removedNodes.length)) {
      scheduleDraftRestore();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  removePrivateNavigationListener();
  wrapDashboardRefresh();
  window.addEventListener("load", wrapDashboardRefresh, { once: true });

  window.Econovaria.features.contracts.refreshPlayerContracts = refreshPlayerContracts;
  window.Econovaria.features.contracts.wrapDashboardRefresh = wrapDashboardRefresh;
  window.Econovaria.features.contracts.captureEvidenceDraft = captureDraft;
  window.Econovaria.features.contracts.restoreEvidenceDrafts = restoreAllDrafts;
})();
