import { AdminEmptyState, AdminErrorState } from "./components/index.js";
import { createElement } from "./components/dom.js";



import { ADMIN_NAVIGATION_GROUPS } from "./core/navigation-registry.js";

export function createAppPresentation(text) {


































const NAVIGATION_COLLAPSED_KEY = "econovaria.admin.v2.navigation-collapsed.v1";

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
      badge: route.modeLabel || null,
      badgeLabel: route.modeLabel ? `Route mode: ${route.modeLabel}` : null,
      badgeTitle: route.modeLabel ? `${route.label} is a ${route.modeLabel.toLowerCase()} surface` : null,
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


return {
  NAVIGATION_COLLAPSED_KEY, permissionSet, routeAllowed, selectedSessionGame, selectedGameContext,
  navigationGroups, safeCollapsedPreference, rememberCollapsedPreference, accountDrawerContent,
  gameDrawerContent,
};
}
