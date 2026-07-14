(function bootAdminOverview() {
  "use strict";
  window.ECONOVARIA_ADMIN_USE_DEMO_DATA = false;

  const mount = document.getElementById("adminPreview");
  const feature = window.Econovaria?.features?.adminOverviewTerminal;
  const auth = window.EconovariaAdminAuth;

  if (!mount || !feature || typeof feature.renderShell !== "function") {
    console.error("Eco Novaria admin overview failed to initialize.");
    return;
  }

  function seedAuthenticatedAdminAuthorization() {
    const session = auth?.getSession?.();
    if (!session?.accessToken) return;

    const current = feature.currentModel && typeof feature.currentModel === "object"
      ? feature.currentModel
      : {};
    const permissions = Array.isArray(current.permissions) && current.permissions.length
      ? current.permissions
      : ["*"];
    const roles = Array.isArray(current.roles) && current.roles.length
      ? current.roles
      : ["game_admin"];

    feature.currentModel = {
      ...current,
      permissions,
      roles,
      adminRole: current.adminRole || "game_admin"
    };
  }

  seedAuthenticatedAdminAuthorization();

  if (auth && typeof auth.attachTerminal === "function") {
    auth.attachTerminal({ mount, feature });
    return;
  }

  mount.hidden = false;
  mount.innerHTML = feature.renderShell();
})();
