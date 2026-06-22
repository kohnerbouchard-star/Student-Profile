window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminSidebar = window.Econovaria.features.adminSidebar || {};

(function initAdminSidebar() {
  const sections = [
    ["Overview", "Game status and core admin tasks"],
    ["Players", "Roster, codes, and access"],
    ["Attendance", "Clock-in and scan tools"],
    ["Store", "Items, stock, and pricing"],
    ["Market", "Market windows and signals"],
    ["Settings", "Difficulty and simulation rules"],
    ["Reports", "Exports and teacher review"]
  ];

  function ensureStyle() {
    if (document.getElementById("admin-sidebar-source-style")) return;
    const style = document.createElement("style");
    style.id = "admin-sidebar-source-style";
    style.textContent = `.admin-sidebar-menu{display:grid;gap:14px}.admin-sidebar-menu.hidden{display:none!important}.admin-sidebar-menu .admin-menu-header{border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:14px}.admin-sidebar-menu .admin-menu-header h2{color:#fff;font-size:28px;line-height:1;letter-spacing:-.055em;margin:4px 0 6px}.admin-sidebar-menu .admin-menu-header p,.admin-sidebar-menu .admin-menu-note p{color:#aab6ca;font-size:13px;line-height:1.45;margin:0}.admin-sidebar-menu .admin-tabs{display:grid;gap:5px}.admin-sidebar-menu .admin-tab{background:transparent;border:1px solid transparent;border-radius:10px;color:#cbd5e1;cursor:pointer;display:grid;gap:3px;min-height:54px;padding:10px 12px;text-align:left;width:100%}.admin-sidebar-menu .admin-tab span{font-size:15px;font-weight:900}.admin-sidebar-menu .admin-tab small{color:#94a3b8;font-size:11px;font-weight:700;line-height:1.25}.admin-sidebar-menu .admin-tab:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.1)}.admin-sidebar-menu .admin-tab.active{background:#fff;border-color:#fff;color:#0f172a}.admin-sidebar-menu .admin-tab.active small{color:#475569}.admin-sidebar-menu .admin-menu-note{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:13px;display:grid;gap:5px;padding:13px}.admin-sidebar-menu .admin-menu-note span{color:#fb923c;font-size:11px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.admin-sidebar-menu .admin-menu-note strong{color:#fff;font-size:13px;line-height:1.35}body.admin-sidebar-active #admin .admin-console-shell{display:block;grid-template-columns:minmax(0,1fr)}body.admin-sidebar-active #admin .admin-workspace-menu{display:none!important}`;
    document.head.appendChild(style);
  }

  function ensureMenu() {
    const sidebar = document.querySelector(".sidebar");
    const primaryNav = document.querySelector(".sidebar .nav");
    if (!sidebar || !primaryNav) return null;

    const existing = document.getElementById("adminSidebarMenu");
    if (existing) return existing;

    const menu = document.createElement("nav");
    menu.id = "adminSidebarMenu";
    menu.className = "admin-sidebar-menu hidden";
    menu.setAttribute("aria-label", "Admin console sections");
    menu.innerHTML = `
      <div class="admin-menu-header"><div class="eyebrow">Teacher console</div><h2>Admin</h2><p>Manage the active game session.</p></div>
      <div class="admin-tabs" role="navigation" aria-label="Admin menu">
        ${sections.map(([label, description], index) => `<button class="admin-tab${index === 0 ? " active" : ""}" type="button" data-admin-sidebar-section="${label}" aria-pressed="${index === 0 ? "true" : "false"}"><span>${label}</span><small>${description}</small></button>`).join("")}
      </div>
      <div class="admin-menu-note"><span>Core loop</span><strong>Players → attendance → store → settings</strong><p>Use these sections to manage the active game session.</p></div>`;
    primaryNav.insertAdjacentElement("afterend", menu);
    bindButtons(menu);
    return menu;
  }

  function getCurrentSession() {
    return window.Econovaria?.state?.currentSession || null;
  }

  function isAdminActive() {
    return String(getCurrentSession()?.role || "").toUpperCase() === "ADMIN" && document.getElementById("admin")?.classList.contains("active") === true;
  }

  function syncAdminSidebar() {
    const primaryNav = document.querySelector(".sidebar .nav");
    const menu = ensureMenu();
    const shouldShow = isAdminActive();

    document.body.classList.toggle("admin-sidebar-active", shouldShow);
    primaryNav?.classList.toggle("hidden", shouldShow);
    menu?.classList.toggle("hidden", !shouldShow);
    if (shouldShow) syncActiveButton();
  }

  function syncActiveButton() {
    const activeSection = document.querySelector("#admin .admin-tab.active")?.dataset.adminSection || "Overview";
    document.querySelectorAll("#adminSidebarMenu [data-admin-sidebar-section]").forEach((button) => {
      const isActive = button.dataset.adminSidebarSection === activeSection;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function openSection(section) {
    const mainButton = document.querySelector(`#admin [data-admin-section="${CSS.escape(section)}"]`);
    if (mainButton) {
      mainButton.click();
      syncAdminSidebar();
      return;
    }
    window.renderAdminDashboard?.();
    window.requestAnimationFrame(() => {
      document.querySelector(`#admin [data-admin-section="${CSS.escape(section)}"]`)?.click();
      syncAdminSidebar();
    });
  }

  function bindButtons(menu) {
    menu.querySelectorAll("[data-admin-sidebar-section]").forEach((button) => {
      button.addEventListener("click", () => openSection(button.dataset.adminSidebarSection || "Overview"));
    });
  }

  function wrapSwitchView() {
    const original = window.switchView || window.Econovaria?.core?.switchView;
    if (typeof original !== "function" || original.__adminSidebarWrapped) return;
    function wrapped(...args) {
      const result = original.apply(this, args);
      syncAdminSidebar();
      window.requestAnimationFrame(syncAdminSidebar);
      return result;
    }
    wrapped.__adminSidebarWrapped = true;
    window.switchView = wrapped;
    window.Econovaria.core.switchView = wrapped;
  }

  function wrapAdminRenderer() {
    const original = window.renderAdminDashboard;
    if (typeof original !== "function" || original.__adminSidebarWrapped) return;
    function wrapped(...args) {
      const result = original.apply(this, args);
      syncAdminSidebar();
      window.requestAnimationFrame(syncAdminSidebar);
      return result;
    }
    wrapped.__adminSidebarWrapped = true;
    window.renderAdminDashboard = wrapped;
    window.Econovaria.features.admin.renderAdminDashboard = wrapped;
  }

  function init() {
    ensureStyle();
    ensureMenu();
    wrapAdminRenderer();
    wrapSwitchView();
    syncAdminSidebar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  Object.assign(window.Econovaria.features.adminSidebar, { syncAdminSidebar, openSection });
})();
