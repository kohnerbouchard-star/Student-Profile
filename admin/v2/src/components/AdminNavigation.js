import { AdminIcon } from "./AdminIcon.js";
import { createElement, createId, getFocusableElements, replaceContent } from "./dom.js";

function navigationItem(item, currentId, onNavigate) {
  const active = item.id === currentId;
  const element = createElement(item.href ? "a" : "button", {
    className: "admin-navigation__link",
    dataset: { route: item.id, active },
    attrs: {
      href: item.href,
      type: item.href ? null : "button",
      "aria-current": active ? "page" : null,
      "aria-label": item.label,
      title: item.label,
      disabled: item.disabled,
    },
    children: [
      createElement("span", {
        className: "admin-navigation__icon",
        children: AdminIcon({ name: item.icon || item.id, size: 19 }),
      }),
      createElement("span", { className: "admin-navigation__label", text: item.label }),
    ],
  });

  if (item.badge != null) {
    element.append(createElement("span", {
      className: "admin-navigation__badge",
      text: item.badge,
      attrs: { "aria-label": `${item.badge} notifications` },
    }));
  }

  element.addEventListener("click", (event) => {
    onNavigate?.(item, event);
    element.dispatchEvent(new CustomEvent("admin-navigation-select", {
      bubbles: true,
      detail: { id: item.id, href: item.href },
    }));
  });
  return element;
}

export function AdminNavigation({
  id = createId("admin-navigation"),
  label = "Teacher navigation",
  brand = "Econovaria",
  environment = "Teacher Console",
  groups = [],
  currentId = "overview",
  collapsed = false,
  gameName = "No simulation selected",
  gameCode,
  status = "Selection required",
  onSelectGame,
  onNavigate,
} = {}) {
  const root = createElement("nav", {
    className: "admin-navigation",
    dataset: { collapsed, mobileOpen: "false" },
    attrs: { id, "aria-label": label },
  });
  const brandBlock = createElement("div", { className: "admin-navigation__brand" });
  brandBlock.append(
    createElement("span", { className: "admin-navigation__brand-mark", children: AdminIcon({ name: "world", size: 23 }) }),
    createElement("span", {
      className: "admin-navigation__brand-copy",
      children: [
        createElement("strong", { className: "admin-navigation__brand-name", text: brand }),
        createElement("small", { className: "admin-navigation__environment", text: environment }),
      ],
    }),
  );
  const scroller = createElement("div", { className: "admin-navigation__scroller" });
  const groupContainer = createElement("div", { className: "admin-navigation__groups" });
  scroller.append(groupContainer);
  const footer = createElement("div", { className: "admin-navigation__footer" });
  const gameContext = createElement(onSelectGame ? "button" : "div", {
    className: "admin-navigation__game-context",
    attrs: {
      type: onSelectGame ? "button" : null,
      role: onSelectGame ? null : "group",
    },
  });
  const collapseButton = createElement("button", {
    className: "admin-navigation__collapse",
    attrs: { type: "button", "aria-label": collapsed ? "Expand navigation" : "Collapse navigation" },
    children: [
      AdminIcon({ name: collapsed ? "chevronRight" : "chevronLeft", size: 18 }),
      createElement("span", { className: "admin-navigation__collapse-label", text: "Collapse menu" }),
    ],
  });
  footer.append(gameContext, collapseButton);
  root.append(brandBlock, scroller, footer);

  function setGameContext(nextContext = {}) {
    if (Object.hasOwn(nextContext, "gameName")) gameName = nextContext.gameName;
    if (Object.hasOwn(nextContext, "gameCode")) gameCode = nextContext.gameCode;
    if (Object.hasOwn(nextContext, "status")) status = nextContext.status;
    const accessibleName = [
      onSelectGame ? "Select simulation" : "Current simulation",
      gameName || "No simulation selected",
      gameCode ? `class code ${gameCode}` : null,
      status || null,
    ].filter(Boolean).join(", ");
    gameContext.setAttribute("aria-label", accessibleName);
    gameContext.title = accessibleName;
    gameContext.replaceChildren(
      createElement("span", {
        className: "admin-navigation__game-icon",
        children: AdminIcon({ name: "game", size: 19 }),
      }),
      createElement("span", {
        className: "admin-navigation__game-copy",
        children: [
          createElement("small", { text: "Current simulation" }),
          createElement("strong", { text: gameName || "No simulation selected" }),
          createElement("span", {
            className: "admin-navigation__game-meta",
            children: [
              gameCode ? createElement("code", { text: gameCode }) : null,
              status ? createElement("span", { text: status }) : null,
            ].filter(Boolean),
          }),
        ],
      }),
      onSelectGame ? AdminIcon({ name: "chevronDown", size: 16 }) : null,
    );
  }

  function renderGroups(nextGroups = groups) {
    groups = nextGroups;
    replaceContent(groupContainer, groups.map((group) => {
      const labelId = `${id}-${group.id}-label`;
      const section = createElement("section", {
        className: "admin-navigation__group",
        attrs: group.label
          ? { "aria-labelledby": labelId }
          : { "aria-label": `${group.items?.[0]?.label || "Primary"} destination` },
      });
      if (group.label) {
        section.append(createElement("h2", {
          className: "admin-navigation__group-label",
          text: group.label,
          attrs: { id: labelId },
        }));
      }
      const list = createElement("ul", { className: "admin-navigation__list" });
      (group.items || []).forEach((item) => {
        list.append(createElement("li", {
          className: "admin-navigation__item",
          children: navigationItem(item, currentId, onNavigate),
        }));
      });
      section.append(list);
      return section;
    }));
  }

  function setCurrent(nextId) {
    currentId = nextId;
    root.querySelectorAll("[data-route]").forEach((link) => {
      const active = link.dataset.route === currentId;
      link.dataset.active = String(active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function setCollapsed(nextCollapsed) {
    collapsed = Boolean(nextCollapsed);
    root.dataset.collapsed = String(collapsed);
    collapseButton.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    collapseButton.querySelector("svg")?.replaceWith(AdminIcon({
      name: collapsed ? "chevronRight" : "chevronLeft",
      size: 18,
    }));
    root.dispatchEvent(new CustomEvent("admin-navigation-collapse", {
      bubbles: true,
      detail: { collapsed },
    }));
  }

  function setMobileOpen(open) {
    root.dataset.mobileOpen = String(Boolean(open));
  }

  collapseButton.addEventListener("click", () => setCollapsed(!collapsed));
  gameContext.addEventListener("click", (event) => onSelectGame?.(event));
  root.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = getFocusableElements(groupContainer);
    if (links.length === 0) return;
    const currentIndex = links.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = links.length - 1;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + links.length) % links.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + links.length) % links.length;
    event.preventDefault();
    links[nextIndex].focus();
  });

  renderGroups(groups);
  setGameContext({ gameName, gameCode, status });
  return {
    element: root,
    id,
    setGroups: renderGroups,
    setCurrent,
    setCollapsed,
    setMobileOpen,
    setGameContext,
    focusFirstItem() { getFocusableElements(groupContainer)[0]?.focus(); },
  };
}
