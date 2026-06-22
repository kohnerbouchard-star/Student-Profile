window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminLayout = window.Econovaria.features.adminLayout || {};

(function initAdminLayout() {
  let defaultNavHtml = "";
  let defaultSidebarCardHtml = "";
  let defaultsCaptured = false;
  let layoutApplied = false;
  let observerStarted = false;

  function captureDefaults() {
    if (defaultsCaptured) return;

    const nav = document.querySelector(".sidebar .nav");
    const sidebarCard = document.querySelector(".sidebar .sidebar-card");

    defaultNavHtml = nav?.innerHTML || "";
    defaultSidebarCardHtml = sidebarCard?.innerHTML || "";
    defaultsCaptured = true;
  }

  function currentSessionRole() {
    const session = window.Econovaria?.state?.currentSession || null;
    return String(session?.role || "").toUpperCase();
  }

  function shouldUseAdminLayout() {
    const adminView = document.getElementById("admin");
    return currentSessionRole() === "ADMIN" && adminView?.classList.contains("active");
  }

  function updateSidebarCardForAdmin() {
    const sidebarCard = document.querySelector(".sidebar .sidebar-card");
    if (!sidebarCard) return;

    sidebarCard.innerHTML = `
      <div class="eyebrow">Today</div>
      <strong id="connectionMode">Synced account</strong>
      <p id="connectionCopy">Your dashboard updates after confirmed actions.</p>`;
  }

  function restoreSidebar() {
    if (!layoutApplied) return;

    const shell = document.getElementById("appShell");
    const nav = document.querySelector(".sidebar .nav");
    const sidebarCard = document.querySelector(".sidebar .sidebar-card");

    shell?.classList.remove("admin-layout-active");

    if (nav) nav.innerHTML = defaultNavHtml;
    if (sidebarCard) sidebarCard.innerHTML = defaultSidebarCardHtml;

    layoutApplied = false;
  }

  function prepareMovedMenu(menu) {
    menu.classList.add("admin-sidebar-workspace-menu");

    const note = menu.querySelector(".admin-menu-note p");
    if (note) {
      note.textContent = "Use these sections to manage the active game session.";
    }

    const headerCopy = menu.querySelector(".admin-menu-header p");
    if (headerCopy) {
      headerCopy.textContent = "Manage the active game session.";
    }
  }

  function applyAdminLayout() {
    captureDefaults();

    if (!shouldUseAdminLayout()) {
      restoreSidebar();
      return;
    }

    const shell = document.getElementById("appShell");
    const adminView = document.getElementById("admin");
    const nav = document.querySelector(".sidebar .nav");
    const menu = adminView?.querySelector(".admin-workspace-menu") || document.querySelector(".sidebar .admin-workspace-menu");

    if (!shell || !nav || !menu) return;

    shell.classList.add("admin-layout-active");
    prepareMovedMenu(menu);

    if (menu.parentElement !== nav) {
      nav.replaceChildren(menu);
    }

    updateSidebarCardForAdmin();
    layoutApplied = true;
  }

  function injectAdminLayoutStyles() {
    if (document.getElementById("admin-layout-style")) return;

    const style = document.createElement("style");
    style.id = "admin-layout-style";
    style.textContent = `
      .app-shell.admin-layout-active .sidebar {
        gap: 18px;
      }

      .app-shell.admin-layout-active .sidebar .nav {
        display: block;
      }

      .app-shell.admin-layout-active #admin .admin-console-shell {
        grid-template-columns: minmax(0, 1fr);
      }

      .app-shell.admin-layout-active .sidebar .admin-workspace-menu {
        background: transparent;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        color: #ffffff;
        gap: 14px;
        padding: 0;
        position: static;
      }

      .app-shell.admin-layout-active .sidebar .admin-menu-header {
        border-bottom-color: rgba(255, 255, 255, .12);
        padding-bottom: 14px;
      }

      .app-shell.admin-layout-active .sidebar .admin-menu-header h2 {
        font-size: 28px;
        line-height: 1;
      }

      .app-shell.admin-layout-active .sidebar .admin-menu-header p,
      .app-shell.admin-layout-active .sidebar .admin-menu-note p {
        color: #aab6ca;
        font-size: 13px;
        line-height: 1.45;
      }

      .app-shell.admin-layout-active .sidebar .admin-tabs {
        display: grid;
        gap: 5px;
      }

      .app-shell.admin-layout-active .sidebar .admin-tab {
        border-radius: 10px;
        min-height: 54px;
        padding: 10px 12px;
      }

      .app-shell.admin-layout-active .sidebar .admin-tab span {
        font-size: 15px;
      }

      .app-shell.admin-layout-active .sidebar .admin-tab small {
        font-size: 11px;
        line-height: 1.25;
      }

      .app-shell.admin-layout-active .sidebar .admin-menu-note {
        border-color: rgba(255, 255, 255, .1);
        background: rgba(255, 255, 255, .06);
      }

      .app-shell.admin-layout-active #admin .admin-workspace-menu {
        display: none;
      }

      .app-shell.admin-layout-active #admin .admin-main-panel {
        gap: 16px;
      }

      .app-shell.admin-layout-active #admin .admin-section-intro {
        align-items: center;
      }

      @media (max-width: 900px) {
        .app-shell.admin-layout-active .sidebar .admin-workspace-menu {
          display: grid;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(applyAdminLayout);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function init() {
    injectAdminLayoutStyles();
    captureDefaults();
    startObserver();
    applyAdminLayout();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  Object.assign(window.Econovaria.features.adminLayout, {
    applyAdminLayout,
    restoreSidebar
  });
})();
