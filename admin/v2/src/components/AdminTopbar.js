import { AdminIcon } from "./AdminIcon.js";
import { appendContent, createElement, setText } from "./dom.js";

const TEACHER_TITLES = Object.freeze({
  Overview: "Dashboard",
  Players: "Students",
  Market: "Stock Market",
  Banking: "Student Banking",
  Loans: "Student Loans",
  Business: "Student Businesses",
  Marketplace: "Marketplace Review",
  Inventory: "Redemption Requests",
  "World Management": "World & Simulation",
  Progression: "Student Progress",
  Settings: "Simulation Settings",
  Logs: "Activity History",
});

function teacherTitle(value) {
  const text = String(value || "").trim();
  return TEACHER_TITLES[text] || text || "Dashboard";
}

function teacherIdentityName(value) {
  const text = String(value || "").trim();
  return !text || text.toLowerCase() === "administrator" ? "Teacher" : text;
}

function teacherContext(value) {
  const text = String(value || "").trim();
  return !text || text === "Teacher administration" ? "Teacher Console" : text;
}

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
  const contextElement = createElement("span", { className: "admin-topbar__context", text: teacherContext(context) });
  const titleElement = createElement("strong", { className: "admin-topbar__title", text: teacherTitle(title) });
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
    const name = teacherIdentityName(identity.name);
    identityButton.replaceChildren(
      createElement("span", { className: "admin-topbar__avatar", children: AdminIcon({ name: "user", size: 18 }) }),
      createElement("span", {
        className: "admin-topbar__identity-copy",
        children: [
          createElement("strong", { text: name }),
          createElement("small", { text: identity.gameName || "No simulation selected" }),
        ],
      }),
      AdminIcon({ name: "chevronDown", size: 16 }),
    );
    identityButton.setAttribute("aria-label", `Open account menu for ${name}`);
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
    setTitle(nextTitle) { setText(titleElement, teacherTitle(nextTitle), "Dashboard"); },
    setContext(nextContext) { setText(contextElement, teacherContext(nextContext), "Teacher Console"); },
    setNotificationCount,
    setIdentity,
    setNavigationExpanded(expanded) {
      navigationToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      navigationToggle.setAttribute("aria-label", expanded ? "Close navigation" : "Open navigation");
    },
  };
}
