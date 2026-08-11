import { asControllerElement, createElement, replaceContent } from "./dom.js";

const MOBILE_NAVIGATION_QUERY = "(max-width: 760px)";

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
  const mobileQuery = typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_NAVIGATION_QUERY)
    : null;

  function isMobileViewport() {
    return mobileQuery?.matches === true;
  }

  function syncNavigationToggle() {
    if (!navigationToggle) return;
    if (isMobileViewport()) {
      const open = root.dataset.mobileNavigationOpen === "true";
      navigationToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navigationToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      return;
    }
    const collapsed = root.dataset.navCollapsed === "true";
    navigationToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    navigationToggle.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
  }

  function setMobileNavigationOpen(open, { focus = true } = {}) {
    const nextOpen = Boolean(open);
    root.dataset.mobileNavigationOpen = String(nextOpen);
    navigationElement?.setAttribute("data-mobile-open", String(nextOpen));
    backdrop.hidden = !nextOpen;
    syncNavigationToggle();
    if (nextOpen && focus) {
      navigation?.focusFirstItem?.();
    } else if (!nextOpen && focus) {
      navigationToggle?.focus({ preventScroll: true });
    }
  }

  function setNavigationCollapsed(collapsed) {
    root.dataset.navCollapsed = String(Boolean(collapsed));
    syncNavigationToggle();
  }

  function handleToggle() {
    if (isMobileViewport()) {
      setMobileNavigationOpen(root.dataset.mobileNavigationOpen !== "true");
      return;
    }
    const nextCollapsed = root.dataset.navCollapsed !== "true";
    if (typeof navigation?.setCollapsed === "function") navigation.setCollapsed(nextCollapsed);
    else setNavigationCollapsed(nextCollapsed);
  }

  function handleCollapse(event) {
    setNavigationCollapsed(event.detail?.collapsed);
  }

  function handleSelection() {
    if (isMobileViewport()) {
      setMobileNavigationOpen(false, { focus: false });
    }
  }

  function handleViewportChange() {
    if (!isMobileViewport() && root.dataset.mobileNavigationOpen === "true") {
      setMobileNavigationOpen(false, { focus: false });
    }
    syncNavigationToggle();
  }

  navigationToggle?.addEventListener("click", handleToggle);
  backdrop.addEventListener("click", () => setMobileNavigationOpen(false));
  navigationElement?.addEventListener("admin-navigation-collapse", handleCollapse);
  navigationElement?.addEventListener("admin-navigation-select", handleSelection);
  mobileQuery?.addEventListener?.("change", handleViewportChange);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.dataset.mobileNavigationOpen === "true") {
      event.preventDefault();
      setMobileNavigationOpen(false);
    }
  });
  syncNavigationToggle();

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
      mobileQuery?.removeEventListener?.("change", handleViewportChange);
      root.remove();
    },
  };
}
