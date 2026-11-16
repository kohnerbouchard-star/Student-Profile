import { isRouteEnabled } from "../api/capabilities.js";
import { dispatchHostEvent } from "../api/session-handoff.js";
import { navigate } from "./router.js";

function storeBoolean(key, value) {
  try { globalThis.localStorage?.setItem(key, String(Boolean(value))); } catch { /* Storage can be unavailable in restricted previews. */ }
}

// Delegated click dispatch stays ordered; feature capture handlers run before it.
// Focus state and listener lifetime remain owned by the terminal shell.
export function createPlayerTerminalActions({
  store, mount, config, lifecycle, showToast, updateUi, rememberFocus,
  restoreFocus, focusElement, prepareRouteFocus
}) {
  const { loadData, loadRouteData, executeEndpoint } = lifecycle;

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
        showToast("Transaction export is not available in this game.", "amber");
        break;
      case "market-search":
        showToast("Market search is not available in this game.", "amber");
        break;
      case "message-search":
        showToast("Message search is not available in this game.", "amber");
        break;
      case "message-attachment":
        showToast("Message attachments are not available in this game.", "amber");
        break;
      case "chart-range":
        showToast(`${target.dataset.range || "Selected"} chart history is not available in this game.`, "amber");
        break;
      default:
        break;
    }
  }

  async function handleClick(event) {
    const stateAtClick = store.getState();
    const interactiveTarget = event.target.closest("button, a, summary, input, select, textarea");

    if (stateAtClick.modal && event.target.matches("[data-player-modal-backdrop]")) {
      if (stateAtClick.modal.type === "storyCutscene") {
        mount.dispatchEvent(new CustomEvent("econovaria:player-story-close-request", {
          bubbles: true,
          detail: {
            deliveryId: stateAtClick.modal.delivery?.deliveryId || "",
            requiresAcknowledgement: stateAtClick.modal.delivery?.requiresAcknowledgement === true
          }
        }));
      } else {
        restoreFocus();
        store.setState({ modal: null });
      }
      return;
    }

    if (stateAtClick.ui.notificationsOpen && !event.target.closest('[data-player-notification-drawer], [data-player-local-action="toggle-notifications"]')) {
      restoreFocus();
      updateUi({ notificationsOpen: false });
    }

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      if (!isRouteEnabled(stateAtClick.data?.capabilities, routeButton.dataset.route)) {
        showToast("That section is not enabled for the current game.", "amber");
        return;
      }
      prepareRouteFocus();
      updateUi({ mobileMenuOpen: false, notificationsOpen: false });
      navigate(routeButton.dataset.route);
      return;
    }

    if (interactiveTarget) focusElement(interactiveTarget);

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
      updateUi({ marketAssetId: marketAsset.dataset.playerMarketSelect });
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
      await executeEndpoint("marketWatchlist", { enabled: watchlistButton.dataset.watchlisted !== "true", gameSessionId: store.getState().data.session.gameSessionId }, { assetId }, watchlistButton);
      return;
    }

    const purchaseButton = event.target.closest("[data-player-purchase]");
    if (purchaseButton) {
      const storeItemId = purchaseButton.dataset.playerPurchase;
      await executeEndpoint("storePurchase", { storeItemId, quantity: 1, gameSessionId: store.getState().data.session.gameSessionId }, {}, purchaseButton);
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
      if (action === "refresh-data") {
        if (store.getState().status === "ready") await loadRouteData(store.getState().route, { force: true });
        else await loadData();
      }
      if (action === "retry-route") await loadRouteData(store.getState().route, { force: true });
      if (action === "logout") {
        lifecycle.prepareForLogout();
        const detail = {
          reason: "player_requested",
          terminal: "player",
          gameSessionId: config.gameSessionId,
          playerSessionId: config.playerSessionId
        };
        if (typeof config.onLogoutRequested === "function") config.onLogoutRequested(detail);
        dispatchHostEvent(config.logoutRequestedEvent, detail);
      }
      if (action === "notifications-read") await executeEndpoint("notificationsRead", { notificationIds: store.getState().data.notifications.map((item) => item.id) }, {}, actionButton);
    }
  }

  return { handleClick };
}
