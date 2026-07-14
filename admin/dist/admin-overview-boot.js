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

  function authenticatedAuthorization() {
    const session = auth?.getSession?.();
    if (!session?.accessToken) return null;

    const current = feature.currentModel && typeof feature.currentModel === "object"
      ? feature.currentModel
      : {};

    return {
      permissions: Array.isArray(current.permissions) && current.permissions.length
        ? current.permissions
        : ["*"],
      roles: Array.isArray(current.roles) && current.roles.length
        ? current.roles
        : ["game_admin"],
      adminRole: current.adminRole || "game_admin"
    };
  }

  function normalizeAuthenticatedModel(value) {
    const next = value && typeof value === "object" ? value : {};
    const authorization = authenticatedAuthorization();
    if (!authorization) return next;

    return {
      ...next,
      permissions: Array.isArray(next.permissions) && next.permissions.length
        ? next.permissions
        : authorization.permissions,
      roles: Array.isArray(next.roles) && next.roles.length
        ? next.roles
        : authorization.roles,
      adminRole: next.adminRole || authorization.adminRole
    };
  }

  function installAuthenticatedAdminModelBridge() {
    const authorization = authenticatedAuthorization();
    if (!authorization) return;

    const descriptor = Object.getOwnPropertyDescriptor(feature, "currentModel");
    if (descriptor && descriptor.configurable === false) {
      feature.currentModel = normalizeAuthenticatedModel(feature.currentModel);
      return;
    }

    let currentModelValue = normalizeAuthenticatedModel(feature.currentModel);

    Object.defineProperty(feature, "currentModel", {
      configurable: true,
      enumerable: true,
      get() {
        return currentModelValue;
      },
      set(value) {
        currentModelValue = normalizeAuthenticatedModel(value);
      }
    });

    feature.currentModel = currentModelValue;
  }

  installAuthenticatedAdminModelBridge();

  if (auth && typeof auth.attachTerminal === "function") {
    auth.attachTerminal({ mount, feature });
    return;
  }

  mount.hidden = false;
  mount.innerHTML = feature.renderShell();
})();