import { PlayerApi } from "./api/player-api.js";
import { PLAYER_ENDPOINTS, resolveEndpoint } from "./api/endpoints.js";
import { ApiConnectionPendingError } from "./api/errors.js";
import { PLAYER_NAV_GROUPS, renderShell } from "./components/layout.js";
import { renderModal } from "./components/modal.js";
import { renderConnectionError, renderSkeletonPage } from "./components/ui.js";
import { escapeHtml, formatCurrency, serializeForm } from "./core/format.js";
import { navigate, readRoute } from "./core/router.js";
import { createStore } from "./core/store.js";
import { focusFirstInteractive, setButtonProcessing } from "./core/dom.js";
import { applyPlayerSessionHandoff, dispatchHostEvent, resolveExistingPlayerSession } from "./api/session-handoff.js";
import { mergeTerminalRead } from "./api/read-model.js";
import { renderDashboardPage } from "./pages/dashboard-page.js";
import { renderNewsPage } from "./pages/news-page.js";
import { renderMarketPage } from "./pages/market-page.js";
import { renderPortfolioPage } from "./pages/portfolio-page.js";
import { renderBusinessPage } from "./pages/business-page.js";
import { renderStorePage } from "./pages/store-page.js";
import { renderMarketplacePage } from "./pages/marketplace-page.js";
import { renderContractsPage } from "./pages/contracts-page.js";
import { renderInventoryPage } from "./pages/inventory-page.js";
import { renderCraftingPage } from "./pages/crafting-page.js";
import { renderBankingPage } from "./pages/banking-page.js";
import { renderLoansPage } from "./pages/loans-page.js";
import { renderMessagesPage } from "./pages/messages-page.js";
import { renderProgressionPage } from "./pages/progression-page.js";
import { renderProfilePage } from "./pages/profile-page.js";

const PAGE_RENDERERS = Object.freeze({
  dashboard: (data, ui, config) => renderDashboardPage(data, ui, config),
  news: renderNewsPage,
  market: renderMarketPage,
  portfolio: renderPortfolioPage,
  business: renderBusinessPage,
  store: renderStorePage,
  marketplace: renderMarketplacePage,
  contracts: renderContractsPage,
  inventory: renderInventoryPage,
  crafting: renderCraftingPage,
  banking: renderBankingPage,
  loans: renderLoansPage,
  messages: renderMessagesPage,
  progression: renderProgressionPage,
  profile: (data, ui, config) => renderProfilePage(data, config)
});

const ROUTE_TITLES = Object.freeze(Object.fromEntries(
  PLAYER_NAV_GROUPS.flatMap((group) => group.routes.map((item) => [item.route, item.label]))
));

function readStoredBoolean(key, fallback = false) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function storeBoolean(key, value) {
  try { globalThis.localStorage?.setItem(key, String(Boolean(value))); } catch { /* Storage can be unavailable in restricted previews. */ }
}

function focusableElements(root) {
  if (!(root instanceof HTMLElement)) return [];
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
}

function initialMarkup(label = "INITIALIZING PLAYER TERMINAL") {
  return `<div class="player-terminal-overview player-terminal-loading-shell" role="status" aria-live="polite"><div class="player-terminal-loading-brand"><span>E</span><div><strong>ECONOVARIA</strong><small>${escapeHtml(label)}</small></div></div>${renderSkeletonPage()}</div>`;
}

function normalizePayload(endpointKey, raw) {
  const payload = { ...raw };
  ["quantity", "limitPrice", "amount", "unitPrice", "price", "durationHours"].forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== "") payload[key] = Number(payload[key]);
    if (payload[key] === "") delete payload[key];
  });
  if (endpointKey === "marketOrder") payload.timeInForce = "GTC";
  return payload;
}

export function createPlayerTerminal({ mount, config }) {
  if (!(mount instanceof HTMLElement)) throw new TypeError("A valid player terminal mount element is required.");

  const api = new PlayerApi(config);
  const store = createStore({
    status: "loading",
    route: readRoute(),
    data: null,
    error: null,
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
  let routeLoadSequence = 0;
  let marketAssetLoadSequence = 0;

  function selectorForElement(element) {
    if (!(element instanceof HTMLElement)) return "";
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

  function rememberFocus(element) {
    restoreFocusSelector = selectorForElement(element) || restoreFocusSelector;
  }

  function restoreFocus() {
    if (!restoreFocusSelector) return;
    pendingFocusSelector = restoreFocusSelector;
    restoreFocusSelector = "";
  }

  function focusAfterRender(state) {
    requestAnimationFrame(() => {
      if (state.status === "error") {
        focusFirstInteractive(mount);
        return;
      }
      if (state.modal) {
        const modal = mount.querySelector(".player-terminal-modal");
        modal?.setAttribute("tabindex", "-1");
        focusFirstInteractive(modal);
        return;
      }
      if (state.ui.mobileMenuOpen) {
        focusFirstInteractive(mount.querySelector(".player-terminal-mobile-sheet > section"));
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

    const pageRenderer = PAGE_RENDERERS[state.route] || PAGE_RENDERERS.dashboard;
    let pageHtml;
    try {
      pageHtml = pageRenderer(state.data, state.ui, config);
    } catch (error) {
      console.error(`Failed to render player route ${state.route}`, error);
      pageHtml = `<section class="player-terminal-page player-terminal-route-error" role="alert"><small>VIEW COULD NOT BE RENDERED</small><h2>${escapeHtml(ROUTE_TITLES[state.route] || "Player view")} is temporarily unavailable</h2><p>${escapeHtml(error?.message || "The page received incomplete or invalid data.")}</p><button class="player-terminal-primary-button" type="button" data-player-action="refresh-data">Retry data load</button></section>`;
    }
    mount.innerHTML = `${renderShell({ route: state.route, data: state.data, pageHtml, ui: state.ui, config })}${renderModal(state.modal)}`;
    mount.querySelectorAll("[data-player-form]").forEach((form) => { form.noValidate = true; });
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
    mount.querySelector(".player-terminal-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `player-terminal-toast is-${tone}`;
    toast.setAttribute("role", tone === "red" ? "alert" : "status");
    toast.setAttribute("aria-live", tone === "red" ? "assertive" : "polite");
    toast.textContent = message;
    mount.append(toast);
    setTimeout(() => toast.classList.add("is-visible"), 10);
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    }, 2600);
  }

  async function loadData() {
    routeLoadSequence += 1;
    if (!config.usePreviewData) {
      const existingSession = await resolveExistingPlayerSession(config);
      if (!existingSession) {
        store.setState({ status: "waiting", error: null, modal: null });
        const detail = { reason: "missing_player_session", terminal: "player" };
        if (typeof config.onSessionRequired === "function") config.onSessionRequired(detail);
        dispatchHostEvent(config.sessionRequiredEvent, detail);
        return;
      }
      applyPlayerSessionHandoff(config, existingSession);
      api.setSession(existingSession);
    }

    store.setState({ status: "loading", error: null, modal: null });
    try {
      const data = await api.bootstrap();
      store.setState((state) => ({ ...state, status: "ready", data, error: null }));
      void loadRouteData(store.getState().route);
    } catch (error) {
      if (!config.usePreviewData && Number(error?.status) === 401) {
        const detail = { reason: "invalid_player_session", error };
        if (typeof config.onSessionInvalid === "function") config.onSessionInvalid(detail);
        dispatchHostEvent(config.sessionInvalidEvent, detail);
        store.setState({ status: "waiting", error: null, modal: null });
        return;
      }
      store.setState({ status: "error", error });
    }
  }

  async function connectSession(session) {
    if (!applyPlayerSessionHandoff(config, session)) {
      throw new TypeError("connectSession requires a player session token.");
    }
    api.setSession(config);
    return loadData();
  }

  function openConnectionModal(error, opener = null) {
    rememberFocus(opener);
    store.setState((state) => ({ ...state, ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false }, modal: {
      type: "connection",
      endpointKey: error.endpointKey,
      method: error.method,
      path: error.path,
      payload: error.payload
    }}));
  }

  function dispatchEndpointEvent(endpointKey, payload = {}, params = {}) {
    const endpoint = PLAYER_ENDPOINTS[endpointKey];
    if (!endpoint) throw new Error(`Unknown endpoint ${endpointKey}`);
    const path = resolveEndpoint(endpoint, params);
    const event = new CustomEvent("econovaria:player-api-request", {
      bubbles: true,
      cancelable: false,
      detail: { endpointKey, method: endpoint.method, path, payload, params }
    });
    mount.dispatchEvent(event);
  }

  async function loadRouteData(route, { force = false } = {}) {
    const current = store.getState();
    if (current.status !== "ready" || !current.data) return;
    const sequence = ++routeLoadSequence;
    try {
      const data = await api.loadRoute(route, current.data, { force });
      if (sequence !== routeLoadSequence) {
        api.invalidateRoute(route);
        return;
      }
      if (data === current.data) return;
      store.setState((state) => ({ ...state, data }));
    } catch (error) {
      if (Number(error?.status) === 401) {
        const detail = { reason: "invalid_player_session", error };
        if (typeof config.onSessionInvalid === "function") config.onSessionInvalid(detail);
        dispatchHostEvent(config.sessionInvalidEvent, detail);
        store.setState({ status: "waiting", error: null, modal: null });
        return;
      }
      showToast(error?.message || "This section could not be refreshed.", "red");
    }
  }

  async function refreshAuthoritativeDashboard() {
    const current = store.getState();
    if (current.status !== "ready" || !current.data) return;
    routeLoadSequence += 1;
    const data = await api.refreshDashboard(current.data);
    store.setState((state) => ({ ...state, data }));
    return data;
  }

  async function refreshAuthoritativeInventory() {
    const current = store.getState();
    if (current.status !== "ready" || !current.data || config.usePreviewData) return current.data;
    const data = await api.refreshInventory(current.data);
    store.setState((state) => ({ ...state, data }));
    return data;
  }

  async function refreshAuthoritativeNotifications() {
    const current = store.getState();
    if (current.status !== "ready" || !current.data || config.usePreviewData) return current.data;
    const data = await api.refreshNotifications(current.data);
    store.setState((state) => ({ ...state, data }));
    return data;
  }

  async function loadMarketAssetData(assetId) {
    const current = store.getState();
    if (
      config.usePreviewData ||
      current.status !== "ready" ||
      !current.data ||
      !assetId
    ) return;
    const sequence = ++marketAssetLoadSequence;
    try {
      const data = await api.loadMarketAsset(current.data, assetId);
      if (
        sequence !== marketAssetLoadSequence ||
        store.getState().route !== "market"
      ) return;
      store.setState((state) => ({ ...state, data }));
    } catch (error) {
      if (Number(error?.status) === 401) {
        const detail = { reason: "invalid_player_session", error };
        if (typeof config.onSessionInvalid === "function") {
          config.onSessionInvalid(detail);
        }
        dispatchHostEvent(config.sessionInvalidEvent, detail);
        store.setState({ status: "waiting", error: null, modal: null });
        return;
      }
      showToast(error?.message || "Market history could not be loaded.", "red");
    }
  }

  async function executeEndpoint(endpointKey, payload = {}, params = {}, button = null) {
    if (!PLAYER_ENDPOINTS[endpointKey]) throw new Error(`Unknown endpoint ${endpointKey}`);
    const normalizedPayload = normalizePayload(endpointKey, payload);
    const restoreButton = setButtonProcessing(button, "Awaiting API");

    dispatchEndpointEvent(endpointKey, normalizedPayload, params);

    try {
      const result = await api.execute(endpointKey, normalizedPayload, params);
      if (!config.usePreviewData && ["marketOrder", "contractAccept", "contractSubmit"].includes(endpointKey)) {
        await refreshAuthoritativeDashboard();
      }
      if (!config.usePreviewData && ["marketWatchlist", "notificationsRead"].includes(endpointKey)) {
        const current = store.getState();
        if (current.status === "ready" && current.data) {
          const data = mergeTerminalRead(current.data, endpointKey, result);
          store.setState((state) => ({ ...state, data }));
        }
      }
      restoreButton("Completed");
      showToast(result?.preview ? "Preview action completed." : "Backend action completed.", "green");
      setTimeout(() => restoreButton(), 1200);
      return result;
    } catch (error) {
      if (error instanceof ApiConnectionPendingError) {
        restoreButton("Awaiting backend");
        openConnectionModal(error, button);
        setTimeout(() => restoreButton(), 1200);
        return null;
      }
      restoreButton();
      showToast(error?.message || "The request failed.", "red");
      return null;
    }
  }

  async function executeStorePurchase(storeItemId, button) {
    const gameSessionId = store.getState().data.session.gameSessionId;
    const quotePayload = { storeItemId, quantity: 1, gameSessionId };
    const restoreButton = setButtonProcessing(button, "Confirming purchase");
    dispatchEndpointEvent("storeQuote", quotePayload);
    try {
      const quote = await api.quoteStoreItem(quotePayload);
      dispatchEndpointEvent("storePurchase", {
        quoteId: quote?.quoteId,
        gameSessionId
      });
      const purchase = await api.completeStorePurchase({ quoteId: quote?.quoteId });
      const result = { quote, purchase, refreshRequired: purchase?.refreshRequired !== false };
      if (!config.usePreviewData && result?.refreshRequired) {
        await refreshAuthoritativeDashboard();
        await refreshAuthoritativeInventory();
      }
      restoreButton("Completed");
      showToast(result?.purchase?.preview ? "Preview purchase completed." : "Purchase completed and inventory refreshed.", "green");
      setTimeout(() => restoreButton(), 1200);
      return result;
    } catch (error) {
      if (error instanceof ApiConnectionPendingError) {
        restoreButton("Awaiting backend");
        openConnectionModal(error, button);
        setTimeout(() => restoreButton(), 1200);
        return null;
      }
      restoreButton();
      showToast(error?.message || "The purchase failed.", "red");
      return null;
    }
  }

  async function executeLogout(button) {
    const session = {
      gameSessionId: config.gameSessionId || "",
      playerSessionId: config.playerSessionId || ""
    };
    const restoreButton = setButtonProcessing(button, "Signing out");
    dispatchEndpointEvent("logout");
    try {
      const result = await api.logout();
      const detail = { session, result };
      if (typeof config.onLogoutRequested === "function") config.onLogoutRequested(detail);
      dispatchHostEvent(config.logoutRequestedEvent, detail);
      restoreButton("Signed out");
      store.setState({ status: "waiting", error: null, modal: null });
      showToast(result?.alreadyLoggedOut ? "Session was already signed out." : "Player session signed out.", "green");
    } catch (error) {
      if (Number(error?.status) === 401) {
        api.clearSession();
        const detail = { session, result: { alreadyInvalid: true } };
        if (typeof config.onLogoutRequested === "function") config.onLogoutRequested(detail);
        dispatchHostEvent(config.logoutRequestedEvent, detail);
        store.setState({ status: "waiting", error: null, modal: null });
        showToast("The player session had already expired.", "amber");
        return;
      }
      restoreButton();
      showToast(error?.message || "The session could not be signed out.", "red");
    }
  }

  function updateUi(patch, focusTarget = null) {
    if (focusTarget) pendingFocusSelector = selectorForElement(focusTarget);
    store.setState((state) => ({ ...state, ui: { ...state.ui, ...patch } }));
  }

  async function handleLocalAction(action, target) {
    const state = store.getState();
    switch (action) {
      case "toggle-sidebar": {
        const nextCollapsed = !state.ui.sidebarCollapsed;
        storeBoolean("econovaria.player.sidebarCollapsed", nextCollapsed);
        updateUi({ sidebarCollapsed: nextCollapsed }, target);
        break;
      }
      case "toggle-notifications": {
        const opening = !state.ui.notificationsOpen;
        if (opening) rememberFocus(target); else restoreFocus();
        updateUi({ notificationsOpen: opening, mobileMenuOpen: false });
        if (opening && !config.usePreviewData) {
          try {
            await refreshAuthoritativeNotifications();
          } catch (error) {
            showToast(error?.message || "Notifications could not be refreshed.", "red");
          }
        }
        break;
      }
      case "toggle-mobile-menu": {
        const opening = !state.ui.mobileMenuOpen;
        if (opening) rememberFocus(target); else restoreFocus();
        updateUi({ mobileMenuOpen: opening, notificationsOpen: false });
        break;
      }
      case "close-modal":
        restoreFocus();
        store.setState({ modal: null });
        break;
      case "copy-game-code": {
        const code = target.closest("[data-game-code]")?.dataset.gameCode || state.data.session.gameCode;
        try {
          await navigator.clipboard.writeText(code);
          showToast(`Game code ${code} copied.`, "amber");
        } catch {
          showToast(`Game code: ${code}. Clipboard access is unavailable.`, "amber");
        }
        break;
      }
      case "download-transactions":
        showToast("Export connection point is reserved for the banking API.", "cyan");
        break;
      case "market-search":
        showToast("Asset search can be connected to GET /market/assets query parameters.", "cyan");
        break;
      case "message-search":
        showToast("Message search is reserved for GET /messages query parameters.", "cyan");
        break;
      case "message-attachment":
        showToast("Attachment upload is reserved for the messaging API.", "cyan");
        break;
      case "chart-range":
        showToast(`${target.dataset.range || "Selected"} chart data will load from the market history endpoint.`, "cyan");
        break;
      default:
        break;
    }
  }

  async function handleClick(event) {
    const stateAtClick = store.getState();
    const interactiveTarget = event.target.closest("button, a, summary, input, select, textarea");

    if (stateAtClick.modal && event.target.matches("[data-player-modal-backdrop]")) {
      restoreFocus();
      store.setState({ modal: null });
      return;
    }

    if (stateAtClick.ui.notificationsOpen && !event.target.closest('[data-player-notification-drawer], [data-player-local-action="toggle-notifications"]')) {
      restoreFocus();
      updateUi({ notificationsOpen: false });
    }

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      restoreFocusSelector = "";
      pendingFocusSelector = "#player-main-content";
      updateUi({ mobileMenuOpen: false, notificationsOpen: false });
      navigate(routeButton.dataset.route);
      return;
    }

    if (interactiveTarget) pendingFocusSelector = selectorForElement(interactiveTarget);

    const localAction = event.target.closest("[data-player-local-action]");
    if (localAction) {
      await handleLocalAction(localAction.dataset.playerLocalAction, localAction);
      return;
    }

    const countryButton = event.target.closest("[data-player-country]");
    if (countryButton) {
      const current = store.getState();
      const country = current.data.countries.find((item) => item.id === countryButton.dataset.playerCountry);
      if (country) {
        rememberFocus(countryButton);
        const relatedAssets = current.data.market.assets.filter((asset) => country.relatedAssetIds?.includes(asset.id));
        const relatedNews = current.data.news.items.filter((item) => country.eventIds?.includes(item.id));
        const relatedContracts = current.data.contracts.items.filter((item) => item.location === country.name || item.location === "All Nations").slice(0, 3);
        store.setState((state) => ({ ...state, ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false }, modal: { type: "country", country, relatedAssets, relatedNews, relatedContracts } }));
      }
      return;
    }

    const newsCategory = event.target.closest("[data-player-news-category]");
    if (newsCategory) {
      updateUi({ newsCategory: newsCategory.dataset.playerNewsCategory, newsId: "" });
      return;
    }

    const newsSelect = event.target.closest("[data-player-news-select]");
    if (newsSelect) {
      updateUi({ newsId: newsSelect.dataset.playerNewsSelect });
      return;
    }

    const newsLink = event.target.closest("[data-player-news-link]");
    if (newsLink) {
      updateUi({ newsId: newsLink.dataset.playerNewsLink, newsCategory: "All" });
      navigate("news");
      return;
    }

    const marketLink = event.target.closest("[data-player-market-link]");
    if (marketLink) {
      updateUi({ marketAssetId: marketLink.dataset.playerMarketLink });
      navigate("market");
      return;
    }

    const marketAsset = event.target.closest("[data-player-market-select]");
    if (marketAsset) {
      const assetId = marketAsset.dataset.playerMarketSelect;
      updateUi({ marketAssetId: assetId }, marketAsset);
      await loadMarketAssetData(assetId);
      return;
    }

    const marketSector = event.target.closest("[data-player-market-sector]");
    if (marketSector) {
      updateUi({ marketSector: marketSector.dataset.playerMarketSector });
      return;
    }

    const storeCategory = event.target.closest("[data-player-store-category]");
    if (storeCategory) {
      updateUi({ storeCategory: storeCategory.dataset.playerStoreCategory });
      return;
    }

    const contractTab = event.target.closest("[data-player-contract-tab]");
    if (contractTab) {
      updateUi({ contractTab: contractTab.dataset.playerContractTab, contractId: "" });
      return;
    }

    const contractSelect = event.target.closest("[data-player-contract-select]");
    if (contractSelect) {
      updateUi({ contractId: contractSelect.dataset.playerContractSelect });
      return;
    }

    const inventoryCategory = event.target.closest("[data-player-inventory-category]");
    if (inventoryCategory) {
      updateUi({ inventoryCategory: inventoryCategory.dataset.playerInventoryCategory });
      return;
    }

    const marketplaceCategory = event.target.closest("[data-player-marketplace-category]");
    if (marketplaceCategory) {
      updateUi({ marketplaceCategory: marketplaceCategory.dataset.playerMarketplaceCategory, marketplaceListingId: "" });
      return;
    }

    const marketplaceListing = event.target.closest("[data-player-marketplace-select]");
    if (marketplaceListing) {
      updateUi({ marketplaceListingId: marketplaceListing.dataset.playerMarketplaceSelect });
      return;
    }

    const marketplaceCancel = event.target.closest("[data-player-marketplace-cancel]");
    if (marketplaceCancel) {
      const listingId = marketplaceCancel.dataset.playerMarketplaceCancel;
      await executeEndpoint("marketplaceCancel", { gameSessionId: store.getState().data.session.gameSessionId }, { listingId }, marketplaceCancel);
      return;
    }

    const messageThread = event.target.closest("[data-player-message-thread]");
    if (messageThread) {
      updateUi({ messageThreadId: messageThread.dataset.playerMessageThread });
      return;
    }

    const loanOffer = event.target.closest("[data-player-loan-offer]");
    if (loanOffer) {
      updateUi({ loanOfferId: loanOffer.dataset.playerLoanOffer });
      return;
    }

    const craftingRecipe = event.target.closest("[data-player-crafting-recipe]");
    if (craftingRecipe) {
      updateUi({ craftingRecipeId: craftingRecipe.dataset.playerCraftingRecipe });
      return;
    }

    const progressionTab = event.target.closest("[data-player-progression-tab]");
    if (progressionTab) {
      updateUi({ progressionTab: progressionTab.dataset.playerProgressionTab });
      return;
    }

    const skillUnlock = event.target.closest("[data-player-skill-unlock]");
    if (skillUnlock) {
      const skillId = skillUnlock.dataset.playerSkillUnlock;
      await executeEndpoint("progressionUnlock", { gameSessionId: store.getState().data.session.gameSessionId }, { skillId }, skillUnlock);
      return;
    }

    const rewardClaim = event.target.closest("[data-player-reward-claim]");
    if (rewardClaim) {
      const rewardId = rewardClaim.dataset.playerRewardClaim;
      await executeEndpoint("progressionClaim", { gameSessionId: store.getState().data.session.gameSessionId }, { rewardId }, rewardClaim);
      return;
    }

    const watchlistButton = event.target.closest("[data-player-market-watchlist]");
    if (watchlistButton) {
      const assetId = watchlistButton.dataset.playerMarketWatchlist;
      await executeEndpoint("marketWatchlist", { enabled: watchlistButton.dataset.watchlisted !== "true" }, { assetId }, watchlistButton);
      return;
    }

    const purchaseButton = event.target.closest("[data-player-purchase]");
    if (purchaseButton) {
      const storeItemId = purchaseButton.dataset.playerPurchase;
      await executeStorePurchase(storeItemId, purchaseButton);
      return;
    }

    const contractAccept = event.target.closest("[data-player-contract-accept]");
    if (contractAccept) {
      const contractId = contractAccept.dataset.playerContractAccept;
      await executeEndpoint("contractAccept", { gameSessionId: store.getState().data.session.gameSessionId }, { contractId }, contractAccept);
      return;
    }

    const inventoryUse = event.target.closest("[data-player-inventory-use]");
    if (inventoryUse) {
      const inventoryItemId = inventoryUse.dataset.playerInventoryUse;
      await executeEndpoint("inventoryUse", { quantity: 1, gameSessionId: store.getState().data.session.gameSessionId }, { inventoryItemId }, inventoryUse);
      return;
    }

    const actionButton = event.target.closest("[data-player-action]");
    if (actionButton) {
      const action = actionButton.dataset.playerAction;
      if (action === "refresh-data") await loadData();
      if (action === "logout") await executeLogout(actionButton);
      if (action === "notifications-read") {
        const deliveryIds = store.getState().data.notifications.map((item) => item.id).filter(Boolean);
        if (deliveryIds.length) await executeEndpoint("notificationsRead", { deliveryIds }, {}, actionButton);
      }
    }
  }

  function clearFormError(form) {
    form?.querySelector("[data-player-form-error]")?.remove();
  }

  function showFormError(form, message) {
    clearFormError(form);
    const error = document.createElement("p");
    error.className = "player-terminal-form-error";
    error.dataset.playerFormError = "true";
    error.setAttribute("role", "alert");
    error.textContent = message;
    form.prepend(error);
  }

  function updateMarketOrderEstimate(form) {
    const state = store.getState();
    const assetId = form.elements.namedItem("assetId")?.value;
    const asset = state.data?.market?.assets?.find((item) => item.id === assetId);
    if (!asset) return;
    const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
    const orderType = form.elements.namedItem("orderType")?.value || "market";
    const limitField = form.elements.namedItem("limitPrice");
    if (limitField) {
      limitField.required = orderType === "limit";
      limitField.placeholder = orderType === "limit" ? "Required for limit order" : "Optional for market order";
    }
    const price = orderType === "limit" && Number(limitField?.value) > 0 ? Number(limitField.value) : Number(asset.price) || 0;
    const subtotal = quantity * price;
    const fees = subtotal * 0.0025;
    const code = state.data?.session?.currencyCode || "NVC";
    const valueNode = form.querySelector("[data-player-market-estimated-value]");
    const feeNode = form.querySelector("[data-player-market-estimated-fees]");
    if (valueNode) valueNode.textContent = formatCurrency(subtotal, code);
    if (feeNode) feeNode.textContent = formatCurrency(fees, code);
  }

  function updateMarketplaceEstimate(form) {
    const state = store.getState();
    const listing = state.data?.marketplace?.listings?.find((item) => item.id === form.dataset.listingId);
    const output = form.querySelector("[data-player-marketplace-estimated-total]");
    if (!listing || !output) return;
    const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
    const feeRate = Number(state.data?.marketplace?.feeRate) || 0;
    output.textContent = formatCurrency(quantity * listing.unitPrice * (1 + feeRate / 100), state.data?.session?.currencyCode);
  }

  function handleInput(event) {
    const field = event.target.closest("input, select, textarea");
    field?.setCustomValidity?.("");
    const parentForm = field?.closest("[data-player-form]");
    parentForm?.classList.remove("has-validation-error");
    clearFormError(parentForm);
    if (parentForm?.dataset.endpoint === "marketOrder") updateMarketOrderEstimate(parentForm);
    if (parentForm?.dataset.endpoint === "marketplacePurchase") updateMarketplaceEstimate(parentForm);

    const search = event.target.closest("[data-player-store-search]");
    if (!search) return;
    const term = String(search.value || "").trim().toLowerCase();
    const cards = [...mount.querySelectorAll(".player-terminal-store-card")];
    cards.forEach((card) => {
      card.hidden = Boolean(term) && !card.textContent.toLowerCase().includes(term);
    });
    const grid = mount.querySelector(".player-terminal-catalog-grid");
    let empty = grid?.querySelector("[data-player-search-empty]");
    const visibleCount = cards.filter((card) => !card.hidden).length;
    if (!visibleCount && grid) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "player-terminal-inline-empty player-terminal-search-empty";
        empty.dataset.playerSearchEmpty = "true";
        grid.append(empty);
      }
      empty.textContent = term ? `No store items match “${search.value.trim()}”.` : "No store items are available.";
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest("[data-player-form]");
    if (!form) return;
    event.preventDefault();
    form.classList.add("was-validated");
    const endpointKey = form.dataset.endpoint;
    const state = store.getState();
    [...form.elements].forEach((control) => control?.setCustomValidity?.(""));

    if (endpointKey === "savingsTransfer") {
      const from = form.elements.namedItem("fromAccount");
      const to = form.elements.namedItem("toAccount");
      const amount = form.elements.namedItem("amount");
      if (from?.value && from.value === to?.value) to.setCustomValidity("Choose a different destination account.");
      const available = from?.value === "savings" ? Number(state.data.banking.savings.available ?? state.data.banking.savings.balance) : Number(state.data.banking.checking.available);
      if (Number(amount?.value) > available) amount?.setCustomValidity("The transfer exceeds the available balance in the source account.");
    }

    if (endpointKey === "bankTransfer") {
      const amount = form.elements.namedItem("amount");
      if (Number(amount?.value) > Number(state.data.banking.checking.available)) amount?.setCustomValidity("The transfer exceeds your available checking balance.");
    }

    if (endpointKey === "marketOrder") {
      const asset = state.data.market.assets.find((item) => item.id === form.elements.namedItem("assetId")?.value);
      const side = form.elements.namedItem("side")?.value;
      const orderType = form.elements.namedItem("orderType")?.value;
      const quantityField = form.elements.namedItem("quantity");
      const limitField = form.elements.namedItem("limitPrice");
      const quantity = Number(quantityField?.value) || 0;
      if (orderType === "limit" && !(Number(limitField?.value) > 0)) limitField?.setCustomValidity("Enter a limit price for a limit order.");
      if (asset) {
        const price = orderType === "limit" && Number(limitField?.value) > 0 ? Number(limitField.value) : Number(asset.price);
        if (side === "buy" && quantity * price * 1.0025 > Number(state.data.banking.checking.available)) quantityField?.setCustomValidity("The estimated order total exceeds your available cash.");
        if (side === "sell" && quantity > Number(asset.owned || 0)) quantityField?.setCustomValidity(`You currently own ${Number(asset.owned || 0)} shares.`);
      }
    }

    if (endpointKey === "marketplacePurchase") {
      const listing = state.data.marketplace.listings.find((item) => item.id === form.dataset.listingId);
      const quantityField = form.elements.namedItem("quantity");
      const quantity = Number(quantityField?.value) || 0;
      if (listing && quantity > Number(listing.quantity)) quantityField?.setCustomValidity("The requested quantity exceeds the available listing quantity.");
      if (listing && quantity * listing.unitPrice * (1 + Number(state.data.marketplace.feeRate || 0) / 100) > Number(state.data.banking.checking.available)) quantityField?.setCustomValidity("The estimated purchase total exceeds your available cash.");
    }

    if (endpointKey === "marketplaceListing") {
      const itemId = form.elements.namedItem("inventoryItemId")?.value;
      const inventoryItem = state.data.inventory.items.find((item) => item.id === itemId);
      const quantityField = form.elements.namedItem("quantity");
      if (inventoryItem && Number(quantityField?.value) > Number(inventoryItem.quantity)) quantityField?.setCustomValidity(`Only ${Number(inventoryItem.quantity)} units are available in inventory.`);
    }

    if (endpointKey === "loanRepay") {
      const amount = form.elements.namedItem("amount");
      if (Number(amount?.value) > Number(state.data.banking.checking.available)) amount?.setCustomValidity("The payment exceeds your available checking balance.");
    }

    if (endpointKey === "messageSend") {
      const body = form.elements.namedItem("body");
      if (!String(body?.value || "").trim()) body?.setCustomValidity("Enter a message before sending.");
    }

    if (endpointKey === "loanApply") {
      const source = form.elements.namedItem("repaymentSource");
      if (!String(source?.value || "").trim()) source?.setCustomValidity("Describe the expected repayment source.");
    }

    if (!form.checkValidity()) {
      form.classList.add("has-validation-error");
      const invalidField = form.querySelector(":invalid");
      showFormError(form, invalidField?.validationMessage || "Complete the highlighted fields before continuing.");
      invalidField?.focus();
      showToast("Complete the highlighted fields before continuing.", "red");
      return;
    }
    clearFormError(form);
    form.classList.remove("has-validation-error");
    const payload = serializeForm(form);
    const button = form.querySelector('button[type="submit"]');
    const params = {};
    if (endpointKey === "contractSubmit") params.contractId = form.dataset.contractId || payload.contractId;
    if (endpointKey === "businessPrice") params.productId = form.dataset.productId;
    if (endpointKey === "marketplacePurchase") params.listingId = form.dataset.listingId;
    if (endpointKey === "craftItem") params.recipeId = form.dataset.recipeId;
    if (endpointKey === "loanApply") params.offerId = form.dataset.offerId;
    if (endpointKey === "loanRepay") params.loanId = form.dataset.loanId;
    if (endpointKey === "messageSend") params.threadId = form.dataset.threadId;
    payload.gameSessionId = state.data.session.gameSessionId;
    await executeEndpoint(endpointKey, payload, params, button);
  }

  function closeTopOverlay() {
    const state = store.getState();
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
    restoreFocusSelector = "";
    pendingFocusSelector = "#player-main-content";
    store.setState((state) => ({ ...state, route, modal: null, ui: { ...state.ui, notificationsOpen: false, mobileMenuOpen: false } }));
    void loadRouteData(route);
    requestAnimationFrame(() => globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" }));
  }

  function handleOffline() { showToast("Connection lost. Read-only content remains available.", "red"); }
  function handleOnline() { showToast("Connection restored. You can retry pending actions.", "green"); }

  mount.addEventListener("click", handleClick);
  mount.addEventListener("submit", handleSubmit);
  mount.addEventListener("input", handleInput);
  mount.addEventListener("keydown", handleKeyDown);
  globalThis.addEventListener("hashchange", handleHashChange);
  globalThis.addEventListener("resize", handleResize);
  globalThis.addEventListener("offline", handleOffline);
  globalThis.addEventListener("online", handleOnline);
  const handleSessionReady = (event) => { connectSession(event?.detail).catch((error) => store.setState({ status: "error", error })); };
  globalThis.addEventListener(config.sessionReadyEvent, handleSessionReady);
  const unsubscribe = store.subscribe(render);
  render();
  loadData();
  clockTimer = globalThis.setInterval(updateClock, 1000);

  return {
    refresh: loadData,
    connectSession,
    getState: store.getState,
    navigate,
    destroy() {
      clearInterval(clockTimer);
      mount.removeEventListener("click", handleClick);
      mount.removeEventListener("submit", handleSubmit);
      mount.removeEventListener("input", handleInput);
      mount.removeEventListener("keydown", handleKeyDown);
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
