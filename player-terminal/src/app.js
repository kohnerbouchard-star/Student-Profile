import { PlayerApi } from "./api/player-api.js";
import { createResourceFreshnessCoordinator } from "./api/resource-freshness-coordinator.js";
import { normalizeApiError } from "./api/errors.js";
import { isRouteEnabled } from "./api/capabilities.js";
import { renderShell } from "./components/layout.js";
import { renderModal } from "./components/modal.js";
import { renderConnectionError, renderSkeletonPage } from "./components/ui.js";
import { escapeHtml } from "./core/format.js";
import { navigate, readRoute } from "./core/router.js";
import { createStore } from "./core/store.js";
import { createPlayerTerminalLifecycle } from "./core/player-terminal-lifecycle.js";
import { subscribeTerminalRender } from "./core/terminal-render-subscription.js";
import { applyCapabilityControls } from "./core/capability-controls.js";
import { ROUTE_TITLES, renderPlayerRoute } from "./core/route-renderer.js";
import { handleStoreItemMediaError } from "./features/store/store-artwork.js";
import { createPlayerTerminalActions } from "./core/player-terminal-actions.js";
import { createPlayerTerminalForms } from "./core/player-terminal-forms.js";

function readStoredBoolean(key, fallback = false) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function focusableElements(root) {
  if (!(root instanceof HTMLElement)) return [];
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
}

function initialMarkup(label = "INITIALIZING PLAYER TERMINAL") {
  return `<div class="player-terminal-overview player-terminal-loading-shell" role="status" aria-live="polite"><div class="player-terminal-loading-brand"><span>E</span><div><strong>ECONOVARIA</strong><small>${escapeHtml(label)}</small></div></div>${renderSkeletonPage()}</div>`;
}

export function createPlayerTerminal({ mount, config, freshness = createResourceFreshnessCoordinator() }) {
  if (!(mount instanceof HTMLElement)) throw new TypeError("A valid player terminal mount element is required.");

  const api = new PlayerApi(config, { freshness, deferFreshnessSettlement: true });
  const store = createStore({
    status: "loading",
    route: readRoute(),
    data: null,
    error: null,
    routeLoading: {},
    routeErrors: {},
    modal: null,
    ui: {
      sidebarCollapsed: readStoredBoolean("econovaria.player.sidebarCollapsed", false),
      notificationsOpen: false,
      mobileMenuOpen: false,
      newsCategory: "All",
      newsId: "news-1",
      marketAssetId: "nova",
      marketSector: "All",
      storeCategory: "All",
      contractTab: "Active",
      contractId: "ctr-101",
      inventoryCategory: "All",
      marketplaceCategory: "All",
      marketplaceListingId: "listing-1",
      messageThreadId: "thread-1",
      loanOfferId: "loan-offer-1",
      craftingRecipeId: "recipe-1",
      progressionTab: "Overview"
    }
  });

  let clockTimer = 0;
  let pendingFocusSelector = "";
  let restoreFocusSelector = "";
  const lifecycle = createPlayerTerminalLifecycle({ api, store, config, freshness, mount, showToast, openConnectionModal });
  const { capture, current, obsolete, deferEffect, queueFrame, focusCurrent,
    loadData, loadRouteData, connectSession, refreshResources, executeEndpoint } = lifecycle;
  const { handleClick } = createPlayerTerminalActions({
    store, mount, config, lifecycle, showToast, updateUi, rememberFocus,
    restoreFocus, focusElement, prepareRouteFocus
  });
  const { handleInput, handleSubmit } = createPlayerTerminalForms({ store, mount, showToast, executeEndpoint });

  function selectorForElement(element) {
    if (!(element instanceof HTMLElement)) return "";
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (element.closest("[data-player-notification-drawer]")) return '[data-player-local-action="toggle-notifications"]';
    if (element.closest(".player-terminal-mobile-sheet")) return '[data-player-local-action="toggle-mobile-menu"]';
    const attributes = [
      "data-player-local-action", "data-player-action", "data-route", "data-player-country",
      "data-player-news-category", "data-player-news-select", "data-player-news-link",
      "data-player-market-link", "data-player-market-select", "data-player-market-sector",
      "data-player-store-category", "data-player-contract-tab", "data-player-contract-select",
      "data-player-inventory-category", "data-player-marketplace-category", "data-player-marketplace-select",
      "data-player-marketplace-cancel", "data-player-message-thread", "data-player-loan-offer",
      "data-player-crafting-recipe", "data-player-progression-tab", "data-player-skill-unlock",
      "data-player-reward-claim", "data-player-market-watchlist", "data-player-purchase",
      "data-player-contract-accept", "data-player-inventory-use"
    ];
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value !== null) return `[${attribute}="${CSS.escape(value)}"]`;
    }
    const form = element.closest("[data-player-form]");
    if (form?.dataset.playerForm) return `[data-player-form="${CSS.escape(form.dataset.playerForm)}"] button[type="submit"]`;
    return "";
  }

  function focusElement(element) {
    pendingFocusSelector = selectorForElement(element);
  }

  function prepareRouteFocus() {
    restoreFocusSelector = "";
    pendingFocusSelector = "#player-main-content";
  }

  function rememberFocus(element) {
    restoreFocusSelector = selectorForElement(element) || restoreFocusSelector;
  }

  function restoreFocus() {
    if (!restoreFocusSelector) return;
    pendingFocusSelector = restoreFocusSelector;
    restoreFocusSelector = "";
  }

  function focusAfterRender(state) {
    queueFrame(() => {
      if (state.status === "error") {
        focusCurrent(mount);
        return;
      }
      if (state.modal) {
        const modal = mount.querySelector(".player-terminal-modal");
        modal?.setAttribute("tabindex", "-1");
        focusCurrent(modal);
        return;
      }
      if (state.ui.mobileMenuOpen) {
        focusCurrent(mount.querySelector(".player-terminal-mobile-sheet > section"));
        return;
      }
      if (state.ui.notificationsOpen) {
        mount.querySelector("[data-player-notification-drawer]")?.focus();
        return;
      }
      if (pendingFocusSelector) {
        const target = mount.querySelector(pendingFocusSelector);
        pendingFocusSelector = "";
        target?.focus({ preventScroll: true });
      }
    });
  }

  function render() {
    const state = store.getState();
    if (state.status === "loading" || state.status === "waiting") {
      mount.innerHTML = initialMarkup(state.status === "waiting" ? "AWAITING EXISTING PLAYER SESSION" : "INITIALIZING PLAYER TERMINAL");
      mount.setAttribute("aria-busy", "true");
      document.title = state.status === "waiting" ? "Connecting · Econovaria Player Terminal" : "Loading · Econovaria Player Terminal";
      return;
    }

    if (state.status === "error") {
      mount.innerHTML = `<div class="player-terminal-overview player-terminal-error-shell">${renderConnectionError(state.error)}</div>`;
      mount.removeAttribute("aria-busy");
      document.title = "Connection problem · Econovaria Player Terminal";
      focusAfterRender(state);
      return;
    }

    let pageHtml;
    if (state.routeLoading[state.route]) {
      pageHtml = renderSkeletonPage();
    } else if (state.routeErrors[state.route]) {
      pageHtml = `<section class="player-terminal-page player-terminal-route-error" role="alert"><small>SECTION UNAVAILABLE</small><h2>${escapeHtml(ROUTE_TITLES[state.route] || "Player view")} could not be loaded</h2><p>This section encountered a data problem. The rest of the terminal remains available.</p><button class="player-terminal-primary-button" type="button" data-player-action="retry-route">Retry this section</button></section>`;
    } else {
      try {
        pageHtml = renderPlayerRoute({ route: state.route, data: state.data, ui: state.ui, config });
      } catch (error) {
        if (config.developerDiagnostics) console.error(`Failed to render player route ${state.route}`, error);
        pageHtml = `<section class="player-terminal-page player-terminal-route-error" role="alert"><small>VIEW COULD NOT BE RENDERED</small><h2>${escapeHtml(ROUTE_TITLES[state.route] || "Player view")} is temporarily unavailable</h2><p>The page received incomplete or invalid data.</p><button class="player-terminal-primary-button" type="button" data-player-action="retry-route">Retry this section</button></section>`;
      }
    }
    mount.innerHTML = `${renderShell({ route: state.route, data: state.data, pageHtml, ui: state.ui, config })}${renderModal(state.modal, config)}`;
    mount.querySelectorAll("[data-player-form]").forEach((form) => { form.noValidate = true; });
    applyCapabilityControls(mount, state.data.capabilities);
    const appRoot = mount.querySelector(".player-terminal-app-root");
    const shell = mount.querySelector(".player-terminal-shell");
    const mobileNav = mount.querySelector(".player-terminal-mobile-nav");
    if (state.modal && appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute("aria-hidden", "true");
    } else if (state.ui.mobileMenuOpen) {
      if (shell) { shell.inert = true; shell.setAttribute("aria-hidden", "true"); }
      if (mobileNav) { mobileNav.inert = true; mobileNav.setAttribute("aria-hidden", "true"); }
    }
    mount.removeAttribute("aria-busy");
    document.title = `${ROUTE_TITLES[state.route] || "Dashboard"} · Econovaria Player Terminal`;
    updateClock();
    focusAfterRender(state);
  }

  function updateClock() {
    const clock = mount.querySelector("[data-player-clock]");
    if (clock) {
      clock.textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    }
  }

  function showToast(message, tone = "cyan") {
    if (freshness && lifecycle.destroyed) return;
    mount.querySelector(".player-terminal-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `player-terminal-toast is-${tone}`;
    toast.setAttribute("role", tone === "red" ? "alert" : "status");
    toast.setAttribute("aria-live", tone === "red" ? "assertive" : "polite");
    toast.textContent = message;
    mount.append(toast);
    deferEffect(() => toast.classList.add("is-visible"), 10);
    deferEffect(() => {
      toast.classList.remove("is-visible");
      deferEffect(() => toast.remove(), 250);
    }, 2600);
  }

  function openConnectionModal(error, opener = null) {
    rememberFocus(opener);
    store.setState((state) => ({ ...state, ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false }, modal: {
      type: "connection",
      endpointKey: error.endpointKey,
      method: error.method,
      path: error.path,
      payload: error.payload,
      developerDiagnostics: config.developerDiagnostics
    }}));
  }

  function updateUi(patch, focusTarget = null) {
    if (focusTarget) pendingFocusSelector = selectorForElement(focusTarget);
    store.setState((state) => ({ ...state, ui: { ...state.ui, ...patch } }));
  }

  function closeTopOverlay() {
    const state = store.getState();
    if (state.modal?.type === "storyCutscene") {
      mount.dispatchEvent(new CustomEvent("econovaria:player-story-close-request", {
        bubbles: true,
        detail: {
          deliveryId: state.modal.delivery?.deliveryId || "",
          requiresAcknowledgement: state.modal.delivery?.requiresAcknowledgement === true
        }
      }));
      return true;
    }
    if (state.modal) {
      restoreFocus();
      store.setState({ modal: null });
      return true;
    }
    if (state.ui.mobileMenuOpen) {
      restoreFocus();
      updateUi({ mobileMenuOpen: false });
      return true;
    }
    if (state.ui.notificationsOpen) {
      restoreFocus();
      updateUi({ notificationsOpen: false });
      return true;
    }
    return false;
  }

  function handleKeyDown(event) {
    const state = store.getState();
    if (event.key === "Escape" && closeTopOverlay()) {
      event.preventDefault();
      return;
    }
    const keyboardCountry = event.target.closest?.("[data-player-country]");
    if (keyboardCountry && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      keyboardCountry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }
    if (event.key !== "Tab") return;
    const overlay = state.modal ? mount.querySelector(".player-terminal-modal") : state.ui.mobileMenuOpen ? mount.querySelector(".player-terminal-mobile-sheet > section") : null;
    if (!overlay) return;
    const focusables = focusableElements(overlay);
    if (!focusables.length) {
      event.preventDefault();
      overlay.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleResize() {
    const state = store.getState();
    if (globalThis.innerWidth > 860 && state.ui.mobileMenuOpen) {
      restoreFocusSelector = "";
      updateUi({ mobileMenuOpen: false });
    }
  }

  function handleHashChange() {
    const route = readRoute();
    const current = store.getState();
    if (current.status === "ready" && !isRouteEnabled(current.data?.capabilities, route)) {
      if (route !== "dashboard") navigate("dashboard");
      showToast("That section is not enabled for the current game.", "amber");
      return;
    }
    prepareRouteFocus();
    store.setState((state) => ({ ...state, route, modal: null, ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false } }));
    if (current.status === "ready") void loadRouteData(route);
    queueFrame(() => globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" }));
  }

  function handleOffline() { showToast("Connection lost. Read-only content remains available.", "red"); }
  function handleOnline() { showToast("Connection restored. You can retry pending actions.", "green"); }

  mount.addEventListener("click", handleClick);
  mount.addEventListener("submit", handleSubmit);
  mount.addEventListener("input", handleInput);
  mount.addEventListener("keydown", handleKeyDown);
  mount.addEventListener("error", handleStoreItemMediaError, true);
  globalThis.addEventListener("hashchange", handleHashChange);
  globalThis.addEventListener("resize", handleResize);
  globalThis.addEventListener("offline", handleOffline);
  globalThis.addEventListener("online", handleOnline);
  const handleSessionReady = (event) => {
    const operation = connectSession(event?.detail), ticket = capture();
    operation.catch((error) => { if (current(ticket) && !obsolete(error)) store.setState({ status: "error", error: normalizeApiError(error) }); });
  };
  globalThis.addEventListener(config.sessionReadyEvent, handleSessionReady);
  const unsubscribe = subscribeTerminalRender(store, render);
  render();
  loadData();
  clockTimer = globalThis.setInterval(updateClock, 1000);

  return {
    freshness,
    refresh: loadData,
    refreshResources,
    connectSession,
    getState: store.getState,
    subscribe: store.subscribe,
    requestRender: render,
    openModal(modal, opener = null) {
      if (opener) rememberFocus(opener);
      store.setState((state) => ({
        ...state,
        ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false },
        modal
      }));
    },
    closeModal() {
      restoreFocus();
      store.setState({ modal: null });
    },
    showToast,
    navigate(route) {
      const state = store.getState();
      if (state.status === "ready" && !isRouteEnabled(state.data?.capabilities, route)) return false;
      navigate(route);
      return true;
    },
    destroy() {
      lifecycle.destroy();
      clearInterval(clockTimer);
      mount.removeEventListener("click", handleClick);
      mount.removeEventListener("submit", handleSubmit);
      mount.removeEventListener("input", handleInput);
      mount.removeEventListener("keydown", handleKeyDown);
      mount.removeEventListener("error", handleStoreItemMediaError, true);
      globalThis.removeEventListener("hashchange", handleHashChange);
      globalThis.removeEventListener("resize", handleResize);
      globalThis.removeEventListener("offline", handleOffline);
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener(config.sessionReadyEvent, handleSessionReady);
      unsubscribe();
      mount.innerHTML = "";
    }
  };
}
