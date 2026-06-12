(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  function normalizeProfile(profile) {
    if (app.modules.profile && typeof app.modules.profile.normalizeProfile === "function") {
      return app.modules.profile.normalizeProfile(profile);
    }

    return profile || null;
  }

  // backend-authoritative-required
  function normalizeLoginResponse(response) {
    const source = response || {};
    const token = source.token || source.sessionToken || "";

    return {
      ok: source.ok === true,
      message: source.message || "",
      role: source.role || "STUDENT",
      tokenPresent: Boolean(token),
      permissionCount: Array.isArray(source.permissions) ? source.permissions.length : 0,
      permissions: Array.isArray(source.permissions) ? source.permissions.slice() : [],
      profile: normalizeProfile(source.profile || source.snapshot && source.snapshot.profile || null),
      profileAvailable: Boolean(source.profile || source.snapshot && source.snapshot.profile),
      snapshotPresent: Boolean(source.snapshot),
      loginQuoteCount: auth.LOGIN_QUOTES && auth.LOGIN_QUOTES.length || 0
    };
  }

  auth.normalizerStatus = "extracted";
  auth.normalizeLoginResponse = normalizeLoginResponse;

  app.modules.authNormalizers = {
    status: "extracted",
    normalizeLoginResponse
  };
})(window);
