window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.adminLayout = window.Econovaria.features.adminLayout || {};

(function loadAdminSidebarMenu() {
  if (window.Econovaria?.features?.adminSidebar?.syncAdminSidebar) {
    window.Econovaria.features.adminSidebar.syncAdminSidebar();
    return;
  }

  const script = document.createElement("script");
  script.src = "frontend/src/features/admin/admin-sidebar.js?v=20260622-adminsidebar1";
  script.async = false;
  document.head.appendChild(script);
})();
