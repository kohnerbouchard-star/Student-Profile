import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "./icons.js";
import { renderStatusPill } from "./ui.js";
import { isRouteEnabled } from "../api/capabilities.js";

export const PLAYER_NAV_GROUPS = Object.freeze([
  { id: "home", label: "Home", iconName: "dashboard", defaultRoute: "dashboard", routes: [{ route: "dashboard", label: "Dashboard" }] },
  { id: "world", label: "World", iconName: "news", defaultRoute: "news", routes: [{ route: "news", label: "News & intelligence" }] },
  { id: "finance", label: "Finance", iconName: "market", defaultRoute: "market", routes: [
    { route: "market", label: "Market" },
    { route: "portfolio", label: "Portfolio" },
    { route: "banking", label: "Banking" },
    { route: "loans", label: "Loans" }
  ]},
  { id: "work", label: "Work", iconName: "contracts", defaultRoute: "contracts", routes: [
    { route: "contracts", label: "Contracts" },
    { route: "business", label: "Business" },
    { route: "crafting", label: "Crafting" }
  ]},
  { id: "trade", label: "Trade", iconName: "store", defaultRoute: "store", routes: [
    { route: "store", label: "Store" },
    { route: "marketplace", label: "Marketplace" },
    { route: "inventory", label: "Inventory" }
  ]},
  { id: "messages", label: "Messages", iconName: "messages", defaultRoute: "messages", routes: [{ route: "messages", label: "Messages" }] },
  { id: "profile", label: "Profile", iconName: "profile", defaultRoute: "profile", routes: [
    { route: "profile", label: "Account" },
    { route: "progression", label: "Progression" }
  ]}
]);

const ROUTE_META = Object.freeze(Object.fromEntries(
  PLAYER_NAV_GROUPS.flatMap((group) => group.routes.map((item) => [item.route, { ...item, groupId: group.id, groupLabel: group.label }]))
));

function navigationGroups(capabilities, preserveProductSurface = false) {
  return PLAYER_NAV_GROUPS.map((group) => {
    const routes = group.routes.map((item) => ({ ...item, enabled: isRouteEnabled(capabilities, item.route) }));
    const enabledRoutes = routes.filter((item) => item.enabled);
    if (!preserveProductSurface && !enabledRoutes.length) return null;
    const visibleRoutes = preserveProductSurface ? routes : enabledRoutes;
    const defaultRoute = enabledRoutes[0]?.route || visibleRoutes[0]?.route || group.defaultRoute;
    return { ...group, routes: visibleRoutes, defaultRoute, enabled: enabledRoutes.length > 0 };
  }).filter(Boolean);
}

function activeGroupForRoute(route, capabilities, preserveProductSurface = false) {
  const groups = navigationGroups(capabilities, preserveProductSurface);
  return groups.find((group) => group.routes.some((item) => item.route === route)) || groups[0];
}

function pendingAttributes(enabled, label) {
  return enabled
    ? ""
    : ` aria-disabled="true" data-capability-status="integration-pending" title="${escapeHtml(label)} backend integration pending"`;
}

function logoMark() {
  return `<svg viewBox="0 0 56 56" class="player-terminal-logo-svg" aria-hidden="true">
    <circle cx="28" cy="28" r="25"></circle><path d="M28 7 L45 17 L45 39 L28 49 L11 39 L11 17 Z"></path><ellipse cx="28" cy="28" rx="11" ry="17"></ellipse><line x1="28" y1="11" x2="28" y2="45"></line><path d="M18 23 Q28 19 38 23"></path><path d="M18 33 Q28 37 38 33"></path><path class="logo-e" d="M21 21 L21 35 L33 35 M21 28 L31 28 M21 21 L33 21"></path><circle class="orbit-dot" cx="45" cy="28" r="2.4"></circle>
  </svg>`;
}

function renderNavGroup(group, route, data) {
  const active = group.routes.some((item) => item.route === route);
  const badge = group.id === "messages" && data.messages?.unread ? `<small class="player-terminal-nav-badge">${escapeHtml(data.messages.unread)}</small>` : "";
  const pendingBadge = !group.enabled ? `<small class="player-terminal-nav-badge" aria-hidden="true">PENDING</small>` : "";
  return `<div class="player-terminal-nav-group${active ? " is-active" : ""}${group.enabled ? "" : " is-pending"}">
    <button class="player-terminal-nav-item${active ? " active" : ""}" type="button" data-route="${group.defaultRoute}" aria-label="${escapeHtml(group.enabled ? group.label : `${group.label}, integration pending`)}"${pendingAttributes(group.enabled, group.label)}${active ? ' aria-current="page"' : ""}>
      <span class="player-terminal-nav-icon">${icon(group.iconName)}</span><strong>${escapeHtml(group.label)}</strong>${badge}${pendingBadge}
    </button>
    ${active && group.routes.length > 1 ? `<div class="player-terminal-nav-submenu" aria-label="${escapeHtml(group.label)} sections">${group.routes.map((item) => `<button type="button" data-route="${item.route}" class="${item.route === route ? "active" : ""}${item.enabled ? "" : " is-pending"}"${pendingAttributes(item.enabled, item.label)}${item.route === route ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}${item.enabled ? "" : " · Pending"}</button>`).join("")}</div>` : ""}
  </div>`;
}

function renderSidebar(route, data, collapsed, preserveProductSurface) {
  const groups = navigationGroups(data.capabilities, preserveProductSurface);
  return `<aside class="player-terminal-left-menu" aria-label="Player terminal navigation">
    <div class="player-terminal-menu-top">
      <div class="player-terminal-brand"><span class="player-terminal-brand-mark">${logoMark()}</span><div class="player-terminal-brand-copy"><strong>Player</strong><small>Terminal</small></div></div>
    </div>
    <nav class="player-terminal-nav" aria-label="Primary sections">
      ${groups.map((group) => renderNavGroup(group, route, data)).join("")}
    </nav>
    <div class="player-terminal-side-code">
      <button class="player-terminal-side-code-compact" type="button" data-player-local-action="copy-game-code" data-game-code="${escapeHtml(data.session.gameCode)}" aria-label="Copy game code ${escapeHtml(data.session.gameCode)}"><span class="player-terminal-share-arrow">${icon("chevronRight")}</span></button>
      <div class="player-terminal-side-code-expanded"><span>Game Code</span><strong>${escapeHtml(data.session.gameCode)}</strong><small>${escapeHtml(data.session.gameName)} · ${escapeHtml(data.session.status)}</small></div>
    </div>
    <button class="player-terminal-collapse-control" type="button" data-player-local-action="toggle-sidebar" aria-label="${collapsed ? "Expand" : "Collapse"} navigation" title="${collapsed ? "Expand" : "Collapse"} navigation">${icon(collapsed ? "chevronRight" : "chevronLeft")}</button>
  </aside>`;
}

function renderNotifications(data, open) {
  return `<div class="player-terminal-bell-drawer" data-player-notification-drawer role="region" aria-label="Player notifications" tabindex="-1" ${open ? "" : "hidden"}>
    <div class="player-terminal-drawer-head"><div><span>PLAYER ALERTS</span><strong>${escapeHtml(data.notifications.length)} Active</strong></div><small>Live feed</small></div>
    <div class="player-terminal-notice-list">${data.notifications.length ? data.notifications.map((item) => `<article class="player-terminal-notice is-${escapeHtml(item.tone === "warn" ? "warn" : item.tone === "good" ? "good" : item.tone === "purple" ? "purple" : "")}"><span></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div></article>`).join("") : `<p class="player-terminal-inline-empty">No active notifications.</p>`}</div>
    <button class="player-terminal-drawer-action" type="button" data-player-action="notifications-read" ${data.notifications.length ? "" : "disabled"}>Mark all read ${icon("check")}</button>
  </div>`;
}

function renderTopbar(route, data, ui, config) {
  const meta = ROUTE_META[route] || ROUTE_META.dashboard;
  const balance = data.banking?.checking?.available ?? data.dashboard?.liquidBalance ?? 0;
  return `<header class="player-terminal-app-topbar">
    <div class="player-terminal-breadcrumb" aria-label="Current location"><span>${escapeHtml(meta.groupLabel)}</span><i>/</i><strong>${escapeHtml(meta.label)}</strong></div>
    <div class="player-terminal-topbar-status"><span class="player-terminal-balance-chip"><small>Available</small><strong>${escapeHtml(formatCurrency(balance, data.session.currencyCode))}</strong></span>${renderStatusPill(config.usePreviewData ? "PREVIEW" : "CONNECTED", config.usePreviewData ? "purple" : "green")}<span class="player-terminal-system-clock" data-player-clock></span></div>
    <div class="player-terminal-top-actions">
      <button class="player-terminal-bell" type="button" data-player-local-action="toggle-notifications" aria-expanded="${String(ui.notificationsOpen)}" aria-label="${ui.notificationsOpen ? "Close" : "Open"} notifications">${icon("bell", "player-terminal-bell-icon")}<small style="right:0">${escapeHtml(data.notifications.length)}</small></button>
      <button class="player-terminal-user-button" type="button" data-route="profile" aria-label="Open player profile"><span class="player-terminal-avatar">${escapeHtml(data.session.initials)}</span><i></i></button>
      ${renderNotifications(data, ui.notificationsOpen)}
    </div>
  </header>`;
}

function renderPageContent(pageHtml) {
  return String(pageHtml || "").replace(
    /<div class="player-terminal-heading-actions">([\s\S]*?)<\/div>/g,
    (_match, content) => `<div class="player-terminal-heading-actions">${content.replace(/<button\b[\s\S]*?<\/button>/g, "")}</div>`,
  );
}

function renderMobileNavigation(route, data, open, preserveProductSurface) {
  const groups = navigationGroups(data.capabilities, preserveProductSurface);
  const group = activeGroupForRoute(route, data.capabilities, preserveProductSurface);
  const primary = PLAYER_NAV_GROUPS
    .filter((item) => ["home", "finance", "work", "trade"].includes(item.id))
    .map((item) => groups.find((candidate) => candidate.id === item.id) || { ...item, enabled: false, unavailable: true });
  const moreActive = group && ["world", "messages", "profile"].includes(group.id);
  return `<nav class="player-terminal-mobile-nav" aria-label="Mobile primary navigation">
    ${primary.map((item) => `<button type="button" data-route="${item.defaultRoute}" class="${item.id === group?.id ? "active" : ""}${item.enabled ? "" : " is-pending"}" aria-label="${escapeHtml(item.enabled ? item.label : `${item.label}, integration pending`)}"${pendingAttributes(item.enabled, item.label)}${item.id === group?.id ? ' aria-current="page"' : ""}><span>${icon(item.iconName)}</span><strong>${escapeHtml(item.label)}</strong></button>`).join("")}
    <button type="button" data-player-local-action="toggle-mobile-menu" class="${moreActive || open ? "active" : ""}" aria-expanded="${String(open)}" aria-label="${open ? "Close" : "Open"} more sections"><span>${icon("menu")}</span><strong>More</strong>${data.messages?.unread ? `<small>${escapeHtml(data.messages.unread)}</small>` : ""}</button>
  </nav>
  <div class="player-terminal-mobile-sheet${open ? " is-open" : ""}" ${open ? "" : "hidden"}>
    <button class="player-terminal-mobile-sheet-scrim" type="button" data-player-local-action="toggle-mobile-menu" aria-label="Close menu"></button>
    <section role="dialog" aria-modal="true" aria-label="More player sections" tabindex="-1">
      <header><div><span>MORE SECTIONS</span><strong>Navigate the terminal</strong></div><button type="button" data-player-local-action="toggle-mobile-menu" aria-label="Close menu">${icon("close")}</button></header>
      <div>${groups.filter((item) => ["world", "messages", "profile"].includes(item.id)).flatMap((item) => item.routes.map((subitem) => `<button type="button" data-route="${subitem.route}" class="${subitem.route === route ? "active" : ""}${subitem.enabled ? "" : " is-pending"}"${pendingAttributes(subitem.enabled, subitem.label)}${subitem.route === route ? ' aria-current="page"' : ""}><span>${icon(item.iconName)}</span><div><strong>${escapeHtml(subitem.label)}</strong><small>${escapeHtml(item.label)}${subitem.enabled ? "" : " · Integration pending"}</small></div>${icon("chevronRight")}</button>`)).join("")}</div>
      <button class="player-terminal-mobile-game-code" type="button" data-player-local-action="copy-game-code" data-game-code="${escapeHtml(data.session.gameCode)}"><span>Game code</span><strong>${escapeHtml(data.session.gameCode)}</strong></button>
    </section>
  </div>`;
}

export function renderShell({ route, data, pageHtml, ui, config }) {
  const preserveProductSurface = config.preserveProductSurface === true;
  return `<div class="player-terminal-overview player-terminal-app-root">
    <a class="player-terminal-skip-link" href="#player-main-content">Skip to main content</a>
    <div class="player-terminal-shell${ui.sidebarCollapsed ? " is-collapsed" : ""}">
      ${renderSidebar(route, data, ui.sidebarCollapsed, preserveProductSurface)}
      <main id="player-main-content" class="player-terminal-shell-main" tabindex="-1">
        ${renderTopbar(route, data, ui, config)}
        <div class="player-terminal-page-host">${renderPageContent(pageHtml)}</div>
      </main>
    </div>
    ${renderMobileNavigation(route, data, ui.mobileMenuOpen, preserveProductSurface)}
  </div>`;
}
