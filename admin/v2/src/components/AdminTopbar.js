import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, setText } from "./dom.js";

export function AdminTopbar({
  title = "Dashboard",
  context = "Teacher Console",
  navigationId,
  actions,
  notificationCount = 0,
  onNotifications,
  identity = {},
  onIdentity,
  onToggleNavigation,
} = {}) {
  const root = createElement("header", { className: "admin-topbar" });
  const navigationToggle = createElement("button", {
    className: "admin-icon-button admin-topbar__navigation-toggle",
    dataset: { adminNavigationToggle: "" },
    attrs: {
      type: "button",
      "aria-label": "Open navigation",
      "aria-controls": navigationId,
      "aria-expanded": "false",
    },
    children: AdminIcon({ name: "menu", size: 21 }),
  });
  const heading = createElement("div", { className: "admin-topbar__heading" });
  const contextElement = createElement("span", { className: "admin-topbar__context", text: context });
  const titleElement = createElement("strong", { className: "admin-topbar__title", text: title });
  heading.append(contextElement, titleElement);

  const actionSlot = createElement("div", { className: "admin-topbar__actions" });
  appendContent(actionSlot, actions);
  const notificationButton = createElement("button", {
    className: "admin-icon-button admin-topbar__notification",
    attrs: { type: "button", "aria-label": "Open notifications" },
    children: AdminIcon({ name: "bell", size: 20 }),
  });
  const notificationBadge = createElement("span", {
    className: "admin-topbar__notification-count",
    attrs: { "aria-hidden": "true" },
  });
  notificationButton.append(notificationBadge);

  const identityButton = createElement("button", {
    className: "admin-topbar__identity",
    attrs: { type: "button" },
  });

  function setNotificationCount(nextCount) {
    notificationCount = Math.max(0, Number(nextCount) || 0);
    notificationBadge.textContent = notificationCount > 99 ? "99+" : String(notificationCount);
    notificationBadge.hidden = notificationCount === 0;
    notificationButton.setAttribute("aria-label", notificationCount
      ? `Open notifications, ${notificationCount} unread`
      : "Open notifications");
  }

  function setIdentity(nextIdentity = {}) {
    identity = nextIdentity;
    identityButton.replaceChildren(
      createElement("span", { className: "admin-topbar__avatar", children: AdminIcon({ name: "user", size: 18 }) }),
      createElement("span", {
        className: "admin-topbar__identity-copy",
        children: [
          createElement("strong", { text: identity.name || "Teacher" }),
          createElement("small", { text: identity.gameName || "No simulation selected" }),
        ],
      }),
      AdminIcon({ name: "chevronDown", size: 16 }),
    );
    identityButton.setAttribute("aria-label", `Open account menu for ${identity.name || "teacher"}`);
    identityButton.title = identity.gameName || "No simulation selected";
  }

  navigationToggle.addEventListener("click", (event) => onToggleNavigation?.(event));
  notificationButton.addEventListener("click", (event) => onNotifications?.(event));
  identityButton.addEventListener("click", (event) => onIdentity?.(event));
  actionSlot.append(notificationButton, identityButton);
  root.append(navigationToggle, heading, actionSlot);
  setNotificationCount(notificationCount);
  setIdentity(identity);

  return {
    element: root,
    navigationToggle,
    actionSlot,
    setTitle(nextTitle) { setText(titleElement, nextTitle, "Dashboard"); },
    setContext(nextContext) { setText(contextElement, nextContext, "Teacher Console"); },
    setNotificationCount,
    setIdentity,
    setNavigationExpanded(expanded) {
      navigationToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      navigationToggle.setAttribute("aria-label", expanded ? "Close navigation" : "Open navigation");
    },
  };
}
