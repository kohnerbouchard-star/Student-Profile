import {
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminNavigation,
  AdminPermissionBoundary,
  AdminRouteBoundary,
  AdminShell,
  AdminToast,
  AdminTopbar,
} from "./components/index.js";
import { createElement } from "./components/dom.js";
import { createAdminApiClient } from "./api/admin-api-client.js";
import { createAdminBffTransport } from "./api/admin-bff-transport.js";
import { createContractsApiClient } from "./api/contracts-api-client.js";
import {
  ADMIN_DEFAULT_ROUTE_ID,
  ADMIN_NAVIGATION_GROUPS,
  getAdminNavigationRoute,
} from "./core/navigation-registry.js";
import {
  createLegacyAdminHandoffUrl,
  resolveCurrentAdminRouteBoundary,
} from "./core/route-boundary.js";
import { createAdminInventoryRedemptionQueueClient } from "../../inventory-redemption-queue-client.js";
import { createAttendanceApi } from "./routes/attendance/AttendanceApi.js";
import { createAttendanceController } from "./routes/attendance/AttendanceController.js";
import { createBankingApiClient } from "./routes/banking/BankingApi.js";
import { createBankingController } from "./routes/banking/BankingController.js";
import { createContractsController } from "./routes/contracts/ContractsController.js";
import { createInventoryController } from "./routes/inventory/InventoryController.js";
import { createLoansApiClient } from "./routes/loans/LoansApiClient.js";
import { createLoansController } from "./routes/loans/LoansController.js";
import { createLogsApiClient } from "./routes/logs/LogsApi.js";
import { createLogsController } from "./routes/logs/LogsController.js";
import { createMarketController } from "./routes/market/MarketController.js";
import { createCraftingApiClient } from "./routes/crafting/CraftingApi.js";
import { createCraftingController } from "./routes/crafting/CraftingController.js";
import { createBusinessApi } from "./routes/business/BusinessApi.js";
import { createBusinessController } from "./routes/business/BusinessController.js";
import { createMarketplaceApiClient } from "./routes/marketplace/MarketplaceApiClient.js";
import { createMarketplaceController } from "./routes/marketplace/MarketplaceController.js";
import { createMessagesAdminClient } from "./routes/messages/MessagesApi.js";
import { createMessagesController } from "./routes/messages/MessagesController.js";
import { createNewsEventsApi } from "./routes/news-events/NewsEventsApi.js";
import { createNewsEventsController } from "./routes/news-events/NewsEventsController.js";
import { createOverviewController } from "./routes/overview/OverviewController.js";
import { createPlayersController } from "./routes/players/PlayersController.js";
import { createProgressionApiClient } from "./routes/progression/ProgressionClient.js";
import { createProgressionController } from "./routes/progression/ProgressionController.js";
import { createSettingsApi } from "./routes/settings/SettingsApi.js";
import { createSettingsController } from "./routes/settings/SettingsController.js";
import { createStoreController } from "./routes/store/StoreController.js";
import { createWorldManagementController } from "./routes/world-management/WorldManagementController.js";

const NAVIGATION_COLLAPSED_KEY = "econovaria.admin.v2.navigation-collapsed.v1";

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function permissionSet(session) {
  return new Set(Array.isArray(session?.permissions)
    ? session.permissions.map((permission) => text(permission)).filter(Boolean)
    : []);
}

function routeAllowed(route, permissions) {
  const allOf = route?.permission?.allOf || [];
  const anyOf = route?.permission?.anyOf || [];
  return allOf.every((permission) => permissions.has(permission))
    && (anyOf.length === 0 || anyOf.some((permission) => permissions.has(permission)));
}

function selectedSessionGame(session, selectedGameId) {
  const games = Array.isArray(session?.activeGameSessions) ? session.activeGameSessions : [];
  return games.find((game) => text(game?.id || game?.gameId) === selectedGameId) || null;
}

function selectedGameContext(session, selectedGameId, model = null) {
  const sessionGame = selectedSessionGame(session, selectedGameId) || {};
  const modelGame = model?.game || {};
  return {
    name: text(modelGame.name || sessionGame.name, "Current game"),
    code: text(modelGame.gameCode || modelGame.joinCode || sessionGame.gameCode || sessionGame.joinCode),
    status: text(modelGame.status || sessionGame.status, "Status unavailable"),
  };
}

function navigationGroups() {
  return ADMIN_NAVIGATION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.routes.map((route) => ({
      id: route.id,
      label: route.label,
      icon: route.icon,
      href: route.href,
    })),
  }));
}

function safeCollapsedPreference() {
  try {
    return window.localStorage.getItem(NAVIGATION_COLLAPSED_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function rememberCollapsedPreference(collapsed) {
  try {
    window.localStorage.setItem(NAVIGATION_COLLAPSED_KEY, String(Boolean(collapsed)));
  } catch (_error) {}
}

function accountDrawerContent(session, gameContext) {
  const user = session?.user || {};
  return createElement("dl", {
    className: "admin-u-stack",
    children: [
      createElement("div", { children: [
        createElement("dt", { className: "admin-u-muted", text: "Administrator" }),
        createElement("dd", { text: text(user.displayName || user.email, "Administrator") }),
      ] }),
      createElement("div", { children: [
        createElement("dt", { className: "admin-u-muted", text: "Email" }),
        createElement("dd", { text: text(user.email, "Not available") }),
      ] }),
      createElement("div", { children: [
        createElement("dt", { className: "admin-u-muted", text: "Current game" }),
        createElement("dd", { text: gameContext.name }),
      ] }),
    ],
  });
}

function gameDrawerContent({ session, selectedGameId, onSelect, error }) {
  if (error) {
    return AdminErrorState({
      title: "Game list is unavailable",
      message: error.userMessage,
      requestId: error.requestId,
      compact: true,
    });
  }
  const games = Array.isArray(session?.activeGameSessions) ? session.activeGameSessions : [];
  if (games.length === 0) {
    return AdminEmptyState({
      title: "No available games",
      message: "No game sessions are available to this administrator.",
      compact: true,
    });
  }
  const list = createElement("div", { className: "admin-u-stack" });
  games.forEach((game) => {
    const gameId = text(game?.id || game?.gameId);
    const selected = gameId === selectedGameId;
    const button = createElement("button", {
      className: `admin-button${selected ? "" : " admin-button--quiet"}`,
      attrs: { type: "button", "aria-current": selected ? "true" : null, disabled: selected },
      text: `${text(game?.name, "Game session")} · ${text(game?.status, "Status unavailable")}`,
    });
    button.addEventListener("click", () => onSelect(gameId));
    list.append(button);
  });
  return list;
}

export function mountAdminV2({ mount, session, selectedGameId } = {}) {
  if (!(mount instanceof HTMLElement)) throw new TypeError("Admin v2 mount is unavailable.");
  if (!session?.authenticated || !selectedGameId) {
    throw new Error("ADMIN_V2_SESSION_CONTEXT_REQUIRED");
  }

  const permissions = permissionSet(session);
  const hasPermission = (permission) => permissions.has(permission);
  const transport = createAdminBffTransport({
    selectedGameId,
    session: () => window.EconovariaAdminAuthSession?.read?.(),
  });
  const api = createAdminApiClient({ fetchImpl: transport });
  const attendanceApi = createAttendanceApi({ fetchImpl: transport });
  const bankingApi = createBankingApiClient({ fetchImpl: transport });
  const contractsApi = createContractsApiClient({ fetchImpl: transport });
  const inventoryApi = createAdminInventoryRedemptionQueueClient({ fetchImpl: transport });
  const craftingApi = createCraftingApiClient({ fetchImpl: transport });
  const businessApi = createBusinessApi({ fetchImpl: transport });
  const marketplaceApi = createMarketplaceApiClient({ fetchImpl: transport });
  const loansApi = createLoansApiClient({ fetchImpl: transport });
  const logsApi = createLogsApiClient({ fetchImpl: transport });
  const messagesApi = createMessagesAdminClient({ fetchImpl: transport });
  const newsEventsApi = createNewsEventsApi({ fetchImpl: transport });
  const progressionApi = createProgressionApiClient({ fetchImpl: transport });
  const settingsApi = createSettingsApi({ fetchImpl: transport });
  let activeRouteId = resolveCurrentAdminRouteBoundary().route.id;
  let renderedMigratedRouteId = null;
  let destroyed = false;
  let toast = null;
  const overview = createOverviewController({
    api,
    selectedGameId,
    hasPermission,
    onChange: renderOverviewChange,
    onResolved: updateOverviewShell,
  });
  const attendance = createAttendanceController({
    api: attendanceApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("attendance"),
    notify: (notification) => toast?.push(notification),
  });
  const store = createStoreController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("store"),
    notify: (notification) => toast?.push(notification),
  });
  const inventory = createInventoryController({
    api: inventoryApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("inventory"),
    notify: (notification) => toast?.push(notification),
  });
  const market = createMarketController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("market"),
  });
  const business = createBusinessController({
    api: businessApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("business"),
    notify: (notification) => toast?.push(notification),
  });
  const crafting = createCraftingController({
    api: craftingApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("crafting"),
    notify: (notification) => toast?.push(notification),
  });
  const marketplace = createMarketplaceController({
    api: marketplaceApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("marketplace"),
    notify: (notification) => toast?.push(notification),
  });
  const banking = createBankingController({
    api: bankingApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("banking"),
    notify: (notification) => toast?.push(notification),
  });
  const loans = createLoansController({
    api: loansApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("loans"),
  });
  const players = createPlayersController({
    api,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("players"),
    notify: (notification) => toast?.push(notification),
  });
  const contracts = createContractsController({
    api: contractsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("contracts"),
    notify: (notification) => toast?.push(notification),
  });
  const worldManagement = createWorldManagementController({
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("world-management"),
    notify: (notification) => toast?.push(notification),
  });
  const newsEvents = createNewsEventsController({
    api: newsEventsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("news-events"),
    notify: (notification) => toast?.push(notification),
  });
  const messages = createMessagesController({
    api: messagesApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("messages"),
    notify: (notification) => toast?.push(notification),
  });
  const progression = createProgressionController({
    api: progressionApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("progression"),
    notify: (notification) => toast?.push(notification),
  });
  const settings = createSettingsController({
    api: settingsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("settings"),
    notify: (notification) => toast?.push(notification),
  });
  const logs = createLogsController({
    api: logsApi,
    selectedGameId,
    hasPermission,
    onChange: () => renderControllerChange("logs"),
  });
  const routeControllers = Object.freeze({
    overview: Object.freeze({
      controller: overview,
      render: () => overview.render({ onOpenLegacy: navigate }),
    }),
    attendance: Object.freeze({
      controller: attendance,
      render: () => attendance.render(),
    }),
    store: Object.freeze({
      controller: store,
      render: () => store.render(),
    }),
    inventory: Object.freeze({
      controller: inventory,
      render: () => inventory.render(),
    }),
    market: Object.freeze({
      controller: market,
      render: () => market.render(),
    }),
    business: Object.freeze({
      controller: business,
      render: () => business.render(),
    }),
    crafting: Object.freeze({
      controller: crafting,
      render: () => crafting.render(),
    }),
    marketplace: Object.freeze({
      controller: marketplace,
      render: () => marketplace.render(),
    }),
    banking: Object.freeze({
      controller: banking,
      render: () => banking.render(),
    }),
    loans: Object.freeze({
      controller: loans,
      render: () => loans.render(),
    }),
    players: Object.freeze({
      controller: players,
      render: () => players.render(),
    }),
    contracts: Object.freeze({
      controller: contracts,
      render: () => contracts.render(),
    }),
    "world-management": Object.freeze({
      controller: worldManagement,
      render: () => worldManagement.render(),
    }),
    "news-events": Object.freeze({
      controller: newsEvents,
      render: () => newsEvents.render(),
    }),
    messages: Object.freeze({
      controller: messages,
      render: () => messages.render(),
    }),
    progression: Object.freeze({
      controller: progression,
      render: () => progression.render(),
    }),
    settings: Object.freeze({
      controller: settings,
      render: () => settings.render(),
    }),
    logs: Object.freeze({
      controller: logs,
      render: () => logs.render(),
    }),
  });

  const initialGame = selectedGameContext(session, selectedGameId);
  let notificationDrawer;
  let accountDrawer;
  let gameDrawer;
  const navigation = AdminNavigation({
    groups: navigationGroups(),
    currentId: activeRouteId,
    collapsed: safeCollapsedPreference(),
    gameName: initialGame.name,
    gameCode: initialGame.code,
    status: initialGame.status,
    onNavigate(route, event) {
      event.preventDefault();
      navigate(route.id);
    },
    onSelectGame() { gameDrawer?.open(); },
  });

  const topbar = AdminTopbar({
    title: getAdminNavigationRoute(activeRouteId)?.label || "Overview",
    context: "Global administration",
    navigationId: navigation.id,
    notificationCount: 0,
    identity: {
      name: text(session.user?.displayName || session.user?.email, "Administrator"),
      gameName: initialGame.name,
    },
    onNotifications() { notificationDrawer?.open(); },
    onIdentity() { accountDrawer?.open(); },
  });

  const shell = AdminShell({ navigation, topbar });
  toast = AdminToast();
  notificationDrawer = AdminDrawer({
    title: "Notifications",
    description: "Administrator alerts for the current game context.",
    content: overview.renderNotifications(),
  });
  accountDrawer = AdminDrawer({
    title: "Administrator account",
    description: "Authenticated administrator and current game context.",
    content: accountDrawerContent(session, initialGame),
  });
  gameDrawer = AdminDrawer({
    title: "Select game",
    description: "Choose from the game sessions available to this administrator.",
    content: gameDrawerContent({ session, selectedGameId, onSelect: selectGame }),
  });

  mount.replaceChildren(shell.element);
  shell.element.dataset.adminV2State = routeControllers[activeRouteId]?.controller.getState().status
    || "route-boundary";

  function selectGame(gameId) {
    if (!gameId) return;
    try {
      window.EconovariaAdminGameSelection?.write?.(gameId);
      window.location.reload();
    } catch (_error) {
      toast.push({
        tone: "error",
        title: "Game could not be selected",
        message: "The selected game context could not be applied. Try again.",
      });
    }
  }

  function navigate(routeId) {
    const route = getAdminNavigationRoute(routeId) || getAdminNavigationRoute(ADMIN_DEFAULT_ROUTE_ID);
    if (window.location.hash !== route.href) {
      window.location.hash = route.id;
      return;
    }
    activeRouteId = route.id;
    renderRoute();
  }

  function renderRoute() {
    if (destroyed) return;
    const boundary = resolveCurrentAdminRouteBoundary();
    if (renderedMigratedRouteId && renderedMigratedRouteId !== boundary.route.id) {
      routeControllers[renderedMigratedRouteId]?.controller.deactivate?.();
      renderedMigratedRouteId = null;
    }
    activeRouteId = boundary.route.id;
    navigation.setCurrent(activeRouteId);
    topbar.setTitle(boundary.route.label);

    let content;
    if (boundary.kind === "migrated") {
      const entry = routeControllers[boundary.moduleKey];
      if (!entry) throw new Error("ADMIN_V2_ROUTE_CONTROLLER_UNAVAILABLE");
      const routeView = entry.render();
      content = AdminRouteBoundary({
        routeId: boundary.route.id,
        mode: "source",
        content: routeView.element,
      }).element;
      renderedMigratedRouteId = boundary.route.id;
      shell.element.dataset.adminV2State = entry.controller.getState().status;
    } else if (boundary.kind === "legacy") {
      content = AdminRouteBoundary({
        routeId: boundary.route.id,
        mode: "legacy",
        icon: boundary.route.icon,
        legacyHref: createLegacyAdminHandoffUrl(boundary.route.id),
        legacyTitle: `${boundary.route.label} remains in the existing Admin`,
        legacyMessage: "All Admin product destinations are now native Admin v2 routes, including Market and the separate Marketplace moderation surface. Continue to the existing Admin for this destination without importing its generated UI into the v2 shell.",
      }).element;
      shell.element.dataset.adminV2State = "legacy-boundary";
    } else {
      content = AdminRouteBoundary({
        routeId: boundary.route.id,
        mode: "planned",
        icon: boundary.route.icon,
        plannedTitle: `${boundary.route.label} is planned for Admin v2`,
        plannedMessage: "This domain is part of the Admin product, but its source-owned v2 surface has not migrated yet. No unrelated legacy page will be opened.",
      }).element;
      shell.element.dataset.adminV2State = "planned-boundary";
    }

    const allowed = routeAllowed(boundary.route, permissions);
    const permission = AdminPermissionBoundary({
      allowed,
      content,
      deniedTitle: `${boundary.route.label} access restricted`,
      deniedMessage: "Your administrator session does not include the permission required for this destination.",
      onDenied: activeRouteId === ADMIN_DEFAULT_ROUTE_ID ? null : () => navigate(ADMIN_DEFAULT_ROUTE_ID),
    });
    shell.setContent(permission.element);
    if (!allowed) shell.element.dataset.adminV2State = "permission-denied";

    const activeController = routeControllers[boundary.moduleKey]?.controller;
    const activeState = activeController?.getState?.();
    if (boundary.kind === "migrated" && allowed && !activeState?.hasResolved && activeState?.requestVersion === 0) {
      void activeController.load();
    }
  }

  function renderOverviewChange() {
    renderControllerChange(ADMIN_DEFAULT_ROUTE_ID);
  }

  function renderControllerChange(routeId) {
    if (activeRouteId === routeId) renderRoute();
  }

  function updateOverviewShell(data) {
    const game = selectedGameContext(session, selectedGameId, data.model);
    navigation.setGameContext({ gameName: game.name, gameCode: game.code, status: game.status });
    topbar.setIdentity({
      name: text(session.user?.displayName || session.user?.email, "Administrator"),
      gameName: game.name,
    });
    topbar.setNotificationCount(data.model.notificationCount ?? data.model.notifications?.length ?? 0);
    notificationDrawer.setContent(overview.renderNotifications());
    accountDrawer.setContent(accountDrawerContent(session, game));
    gameDrawer.setContent(gameDrawerContent({
      session,
      selectedGameId,
      onSelect: selectGame,
      error: data.panels.games?.status === "rejected" ? data.panels.games.reason : null,
    }));
  }

  function handleHashChange() {
    activeRouteId = resolveCurrentAdminRouteBoundary().route.id;
    renderRoute();
  }

  function handleCollapse(event) {
    rememberCollapsedPreference(event.detail?.collapsed);
  }

  window.addEventListener("hashchange", handleHashChange);
  navigation.element.addEventListener("admin-navigation-collapse", handleCollapse);
  renderRoute();

  return {
    element: shell.element,
    refresh() {
      return routeControllers[activeRouteId]?.controller.load?.() || overview.load();
    },
    destroy() {
      destroyed = true;
      overview.destroy();
      attendance.destroy();
      store.destroy();
      inventory.destroy();
      market.destroy();
      crafting.destroy();
      business.destroy();
      marketplace.destroy();
      banking.destroy();
      loans.destroy();
      players.destroy();
      contracts.destroy();
      worldManagement.destroy();
      newsEvents.destroy();
      messages.destroy();
      progression.destroy();
      settings.destroy();
      logs.destroy();
      window.removeEventListener("hashchange", handleHashChange);
      navigation.element.removeEventListener("admin-navigation-collapse", handleCollapse);
      notificationDrawer.destroy();
      accountDrawer.destroy();
      gameDrawer.destroy();
      toast?.destroy();
      shell.destroy();
    },
  };
}
