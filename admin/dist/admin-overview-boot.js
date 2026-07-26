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

  function normalizedAuthorizationList(value) {
    return Array.isArray(value)
      ? [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))]
      : [];
  }

  function authenticatedAuthorization() {
    const session = auth?.getSession?.();
    if (!session?.authenticated) return null;

    const current = feature.currentModel && typeof feature.currentModel === "object"
      ? feature.currentModel
      : {};
    const permissions = normalizedAuthorizationList(
      Array.isArray(current.permissions) && current.permissions.length
        ? current.permissions
        : session.permissions
    );
    const roles = normalizedAuthorizationList(
      Array.isArray(current.roles) && current.roles.length
        ? current.roles
        : session.roles
    ).filter((role) => role === "game_admin");

    if (!permissions.length || !roles.includes("game_admin")) return null;
    return {
      permissions,
      roles,
      adminRole: current.adminRole || session.adminRole || "game_admin"
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
    if (!authorization) return false;

    const descriptor = Object.getOwnPropertyDescriptor(feature, "currentModel");
    if (descriptor?.get && descriptor?.set) {
      feature.currentModel = normalizeAuthenticatedModel(feature.currentModel);
      return true;
    }
    if (descriptor && descriptor.configurable === false) {
      feature.currentModel = normalizeAuthenticatedModel(feature.currentModel);
      return true;
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
    return true;
  }

  window.addEventListener(
    "econovaria:admin-session-refreshed",
    installAuthenticatedAdminModelBridge
  );
  installAuthenticatedAdminModelBridge();

  if (auth && typeof auth.attachTerminal === "function") {
    auth.attachTerminal({ mount, feature });
    return;
  }

  mount.hidden = false;
  mount.innerHTML = feature.renderShell();
})();
