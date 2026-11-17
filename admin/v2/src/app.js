import { createAppControllers } from "./app-controllers.js";
import { createAppPresentation } from "./app-presentation.js";

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

const {
  permissionSet, routeAllowed, selectedGameContext, navigationGroups, safeCollapsedPreference,
  rememberCollapsedPreference, accountDrawerContent, gameDrawerContent,
} = createAppPresentation(text);
import {
  AdminDrawer, AdminFreshnessStatus, AdminNavigation, AdminPermissionBoundary, AdminRouteBoundary,
  AdminShell, AdminToast, AdminTopbar,
} from "./components/index.js";
import { createElement } from "./components/dom.js";

import { createAdminBffTransport } from "./api/admin-bff-transport.js";

import { ADMIN_DEFAULT_ROUTE_ID, getAdminNavigationRoute } from "./core/navigation-registry.js";
import {
  createLegacyAdminHandoffUrl,
  resolveCurrentAdminRouteBoundary,
} from "./core/route-boundary.js";































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
  let activeRouteId = resolveCurrentAdminRouteBoundary().route.id;
  let renderedMigratedRouteId = null;
  let pendingRouteIntent = null;
  let destroyed = false;
  let toast = null;
  const {
    overview, attendance, store, inventory, market, business, crafting, marketplace, banking, loans,
    players, contracts, worldManagement, newsEvents, messages, progression, settings, logs,
  } = createAppControllers({
    transport, selectedGameId, hasPermission, renderOverviewChange, updateOverviewShell, renderControllerChange,
    notify: (notification) => toast?.push(notification),
  });
  const routeControllers = Object.freeze({
    overview: Object.freeze({
      controller: overview,
      render: () => overview.render({ onOpenLegacy: (routeId, intent) => navigate(routeId, intent) }),
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
    context: "Game administration",
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
  const accountDetails = createElement("div", {
    children: accountDrawerContent(session, initialGame),
  });
  accountDrawer = AdminDrawer({
    title: "Administrator account",
    description: "Authenticated administrator and current game context.",
    content: accountDetails,
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
    if (!gameId || gameId === selectedGameId || !settings.canDiscardChanges()) return;
    try {
      window.EconovariaAdminGameSelection?.write?.(gameId);
      settings.discardChanges();
      window.location.reload();
    } catch (_error) {
      toast.push({
        tone: "error",
        title: "Game could not be selected",
        message: "The selected game context could not be applied. Try again.",
      });
    }
  }

  function navigate(routeId, intent = "") {
    const route = getAdminNavigationRoute(routeId) || getAdminNavigationRoute(ADMIN_DEFAULT_ROUTE_ID);
    pendingRouteIntent = intent ? { routeId: route.id, intent } : null;
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
    let routeView = null;
    if (boundary.kind === "migrated") {
      const entry = routeControllers[boundary.moduleKey];
      if (!entry) throw new Error("ADMIN_V2_ROUTE_CONTROLLER_UNAVAILABLE");
      routeView = entry.render();
      const controllerState = entry.controller.getState?.() || {};
      const routeContent = createElement("div", {
        className: "admin-route-stack",
        children: [
          AdminFreshnessStatus({
            state: controllerState,
            onRefresh: typeof entry.controller.load === "function" ? () => entry.controller.load() : null,
          }),
          routeView.element,
        ],
      });
      content = AdminRouteBoundary({
        routeId: boundary.route.id,
        mode: "source",
        content: routeContent,
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

    if (allowed && routeView && pendingRouteIntent?.routeId === activeRouteId) {
      const intent = pendingRouteIntent.intent;
      pendingRouteIntent = null;
      queueMicrotask(() => routeView?.element?.dispatchEvent(new CustomEvent("admin-route-intent", {
        bubbles: true,
        detail: { intent },
      })));
    }

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
    accountDetails.replaceChildren(accountDrawerContent(session, game));
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

  function handleBeforeUnload(event) {
    if (!settings.hasUnsavedChanges() && !settings.isSaving()) return;
    event.preventDefault();
    event.returnValue = "";
  }

  function handleCollapse(event) {
    rememberCollapsedPreference(event.detail?.collapsed);
  }

  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("beforeunload", handleBeforeUnload);
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
      window.removeEventListener("beforeunload", handleBeforeUnload);
      navigation.element.removeEventListener("admin-navigation-collapse", handleCollapse);
      notificationDrawer.destroy();
      accountDrawer.destroy();
      gameDrawer.destroy();
      toast?.destroy();
      shell.destroy();
    },
  };
}
