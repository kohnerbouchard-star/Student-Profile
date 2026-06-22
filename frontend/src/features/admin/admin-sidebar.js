window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminSidebar = window.Econovaria.features.adminSidebar || {};

(function initAdminSidebar() {
  function getCurrentSession() {
    return window.Econovaria?.state?.currentSession || null;
  }

  function isAdminActive() {
    const session = getCurrentSession();
    const activeView = document.querySelector(".view.active")?.id || "";

    return String(session?.role || "").toUpperCase() === "ADMIN" && activeView === "admin";
  }

  function syncAdminSidebar() {
    const primaryNav = document.getElementById("primarySidebarNav");
    const adminMenu = document.getElementById("adminSidebarMenu");
    const shouldShowAdminMenu = isAdminActive();

    document.body.classList.toggle("admin-sidebar-active", shouldShowAdminMenu);
    primaryNav?.classList.toggle("hidden", shouldShowAdminMenu);
    adminMenu?.classList.toggle("hidden", !shouldShowAdminMenu);

    if (shouldShowAdminMenu) {
      syncActiveAdminSidebarButton();
    }
  }

  function syncActiveAdminSidebarButton() {
    const activeSection = document.querySelector("#admin .admin-tab.active")?.dataset.adminSection || "Overview";

    document.querySelectorAll("#adminSidebarMenu [data-admin-sidebar-section]").forEach((button) => {
      const isActive = button.dataset.adminSidebarSection === activeSection;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function openAdminSection(section) {
    if (!section) return;

    const mainButton = document.querySelector(`#admin [data-admin-section="${CSS.escape(section)}"]`);

    if (mainButton) {
      mainButton.click();
      syncAdminSidebar();
      return;
    }

    if (typeof window.renderAdminDashboard === "function") {
      window.renderAdminDashboard();
    }

    window.requestAnimationFrame(() => {
      document.querySelector(`#admin [data-admin-section="${CSS.escape(section)}"]`)?.click();
      syncAdminSidebar();
    });
  }

  function bindAdminSidebarButtons() {
    document.querySelectorAll("#adminSidebarMenu [data-admin-sidebar-section]").forEach((button) => {
      button.addEventListener("click", () => openAdminSection(button.dataset.adminSidebarSection || "Overview"));
    });
  }

  function wrapSwitchView() {
    const originalSwitchView = window.switchView || window.Econovaria?.core?.switchView;

    if (typeof originalSwitchView !== "function" || originalSwitchView.__adminSidebarWrapped) return;

    function wrappedSwitchView(...args) {
      const result = originalSwitchView.apply(this, args);
      syncAdminSidebar();
      window.requestAnimationFrame(syncAdminSidebar);
      return result;
    }

    wrappedSwitchView.__adminSidebarWrapped = true;
    window.switchView = wrappedSwitchView;
    window.Econovaria.core.switchView = wrappedSwitchView;
  }

  function wrapAdminRenderer() {
    const originalRenderAdminDashboard = window.renderAdminDashboard;

    if (typeof originalRenderAdminDashboard !== "function" || originalRenderAdminDashboard.__adminSidebarWrapped) return;

    function wrappedRenderAdminDashboard(...args) {
      const result = originalRenderAdminDashboard.apply(this, args);
      syncAdminSidebar();
      window.requestAnimationFrame(syncAdminSidebar);
      return result;
    }

    wrappedRenderAdminDashboard.__adminSidebarWrapped = true;
    window.renderAdminDashboard = wrappedRenderAdminDashboard;
    window.Econovaria.features.admin.renderAdminDashboard = wrappedRenderAdminDashboard;
  }

  function init() {
    bindAdminSidebarButtons();
    wrapAdminRenderer();
    wrapSwitchView();
    syncAdminSidebar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  Object.assign(window.Econovaria.features.adminSidebar, {
    syncAdminSidebar,
    openAdminSection
  });
})();
