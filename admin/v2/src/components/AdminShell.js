import { asControllerElement, createElement, replaceContent } from "./dom.js";

export function AdminShell({ navigation, topbar, content, mainId = "admin-main-content" } = {}) {
  const navigationElement = asControllerElement(navigation);
  const topbarElement = asControllerElement(topbar);
  const root = createElement("div", {
    className: "admin-shell",
    dataset: {
      adminV2Root: "",
      navCollapsed: navigationElement?.dataset.collapsed === "true",
      mobileNavigationOpen: "false",
    },
  });
  const skipLink = createElement("a", {
    className: "admin-shell__skip-link",
    attrs: { href: `#${mainId}` },
    text: "Skip to main content",
  });
  const navigationSlot = createElement("aside", {
    className: "admin-shell__navigation",
    attrs: { "aria-label": "Primary" },
  });
  if (navigationElement) navigationSlot.append(navigationElement);
  const backdrop = createElement("button", {
    className: "admin-shell__navigation-backdrop",
    attrs: { type: "button", "aria-label": "Close navigation" },
  });
  backdrop.hidden = true;
  const workspace = createElement("div", { className: "admin-shell__workspace" });
  const topbarSlot = createElement("div", { className: "admin-shell__topbar" });
  if (topbarElement) topbarSlot.append(topbarElement);
  const main = createElement("main", {
    className: "admin-shell__main",
    attrs: { id: mainId, tabindex: "-1" },
  });
  if (content) replaceContent(main, content);
  workspace.append(topbarSlot, main);
  root.append(skipLink, navigationSlot, backdrop, workspace);

  const navigationToggle = topbarElement?.querySelector("[data-admin-navigation-toggle]");

  function setMobileNavigationOpen(open, { focus = true } = {}) {
    const nextOpen = Boolean(open);
    root.dataset.mobileNavigationOpen = String(nextOpen);
    navigationElement?.setAttribute("data-mobile-open", String(nextOpen));
    backdrop.hidden = !nextOpen;
    navigationToggle?.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    navigationToggle?.setAttribute("aria-label", nextOpen ? "Close navigation" : "Open navigation");
    if (nextOpen && focus) {
      navigation?.focusFirstItem?.();
    } else if (!nextOpen && focus) {
      navigationToggle?.focus({ preventScroll: true });
    }
  }

  function setNavigationCollapsed(collapsed) {
    root.dataset.navCollapsed = String(Boolean(collapsed));
  }

  function handleToggle() {
    setMobileNavigationOpen(root.dataset.mobileNavigationOpen !== "true");
  }

  function handleCollapse(event) {
    setNavigationCollapsed(event.detail?.collapsed);
  }

  function handleSelection() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMobileNavigationOpen(false, { focus: false });
    }
  }

  navigationToggle?.addEventListener("click", handleToggle);
  backdrop.addEventListener("click", () => setMobileNavigationOpen(false));
  navigationElement?.addEventListener("admin-navigation-collapse", handleCollapse);
  navigationElement?.addEventListener("admin-navigation-select", handleSelection);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.dataset.mobileNavigationOpen === "true") {
      event.preventDefault();
      setMobileNavigationOpen(false);
    }
  });

  return {
    element: root,
    main,
    navigationSlot,
    topbarSlot,
    setContent(nextContent) { replaceContent(main, nextContent); },
    setMobileNavigationOpen,
    setNavigationCollapsed,
    destroy() {
      navigationToggle?.removeEventListener("click", handleToggle);
      navigationElement?.removeEventListener("admin-navigation-collapse", handleCollapse);
      navigationElement?.removeEventListener("admin-navigation-select", handleSelection);
      root.remove();
    },
  };
}
