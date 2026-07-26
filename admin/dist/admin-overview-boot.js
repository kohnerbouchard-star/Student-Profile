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

    const permissions = normalizedAuthorizationList(session.permissions);
    const roles = normalizedAuthorizationList(session.roles)
      .filter((role) => role === "game_admin");
    if (!permissions.length || !roles.includes("game_admin")) return null;

    return {
      permissions,
      roles,
      adminRole: session.adminRole === "game_admin" ? "game_admin" : ""
    };
  }

  function normalizeAuthenticatedModel(value) {
    const next = value && typeof value === "object" ? value : {};
    const authorization = authenticatedAuthorization();
    if (!authorization) return next;

    return {
      ...next,
      permissions: authorization.permissions,
      roles: authorization.roles,
      adminRole: authorization.adminRole
    };
  }

  function sanitizeLegacySession(value) {
    const next = value && typeof value === "object" ? value : value;
    const authorization = authenticatedAuthorization();
    if (!authorization || !next || typeof next !== "object") return next;
    return {
      ...next,
      permissions: authorization.permissions,
      roles: authorization.roles,
      adminRole: authorization.adminRole
    };
  }

  function installLegacySessionPermissionBoundary() {
    const descriptor = Object.getOwnPropertyDescriptor(window, "currentSession");
    if (descriptor && descriptor.configurable === false) return false;
    if (descriptor?.get && descriptor?.set) return true;

    let currentValue = sanitizeLegacySession(window.currentSession ?? null);
    Object.defineProperty(window, "currentSession", {
      configurable: true,
      enumerable: true,
      get() {
        return currentValue;
      },
      set(value) {
        currentValue = sanitizeLegacySession(value);
      }
    });
    return true;
  }

  function installAuthenticatedAdminModelBridge() {
    const authorization = authenticatedAuthorization();
    if (!authorization) return false;

    installLegacySessionPermissionBoundary();
    if (window.currentSession) {
      window.currentSession = window.currentSession;
    }

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

  installLegacySessionPermissionBoundary();
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
