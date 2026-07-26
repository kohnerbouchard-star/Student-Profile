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

  function authorizedStaffSession(value, authorization) {
    const next = value && typeof value === "object" ? value : {};
    return {
      ...next,
      permissions: authorization?.permissions || [],
      roles: authorization?.roles || [],
      adminRole: authorization?.adminRole || ""
    };
  }

  function normalizeAuthenticatedModel(value) {
    const next = value && typeof value === "object" ? value : {};
    const authorization = authenticatedAuthorization();
    return {
      ...next,
      permissions: authorization?.permissions || [],
      roles: authorization?.roles || [],
      adminRole: authorization?.adminRole || "",
      ...(next.staffSession && typeof next.staffSession === "object"
        ? { staffSession: authorizedStaffSession(next.staffSession, authorization) }
        : {})
    };
  }

  function sanitizeLegacySession(value) {
    const next = value && typeof value === "object" ? value : value;
    if (!next || typeof next !== "object") return next;
    const authorization = authenticatedAuthorization();
    return {
      ...next,
      permissions: authorization?.permissions || [],
      roles: authorization?.roles || [],
      adminRole: authorization?.adminRole || "",
      staffSession: authorizedStaffSession(next.staffSession, authorization)
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

  function installLegacyStaffStateBoundary() {
    window.state = window.state && typeof window.state === "object"
      ? window.state
      : {};
    const descriptor = Object.getOwnPropertyDescriptor(window.state, "staffSession");
    if (descriptor && descriptor.configurable === false) return false;
    if (descriptor?.get && descriptor?.set) return true;

    let currentValue = authorizedStaffSession(
      window.state.staffSession,
      authenticatedAuthorization()
    );
    Object.defineProperty(window.state, "staffSession", {
      configurable: true,
      enumerable: true,
      get() {
        return currentValue;
      },
      set(value) {
        currentValue = authorizedStaffSession(
          value,
          authenticatedAuthorization()
        );
      }
    });
    return true;
  }

  function installAuthenticatedAdminModelBridge() {
    const authorization = authenticatedAuthorization();

    installLegacySessionPermissionBoundary();
    installLegacyStaffStateBoundary();
    if (window.currentSession) {
      window.currentSession = window.currentSession;
    }
    if (window.state?.staffSession) {
      window.state.staffSession = window.state.staffSession;
    }

    const descriptor = Object.getOwnPropertyDescriptor(feature, "currentModel");
    if (descriptor?.get && descriptor?.set) {
      feature.currentModel = normalizeAuthenticatedModel(feature.currentModel);
      return Boolean(authorization);
    }
    if (descriptor && descriptor.configurable === false) {
      feature.currentModel = normalizeAuthenticatedModel(feature.currentModel);
      return Boolean(authorization);
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
    return Boolean(authorization);
  }

  installLegacySessionPermissionBoundary();
  installLegacyStaffStateBoundary();
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
