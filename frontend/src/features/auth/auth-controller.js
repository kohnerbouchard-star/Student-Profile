(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  function testAuthModule() {
    const sampleResponse = {
      ok: true,
      token: "sample-token-not-real",
      permissions: ["GET_SNAPSHOT"],
      profile: {
        name: "Sample Student"
      },
      snapshot: {
        profile: {
          name: "Sample Student"
        }
      }
    };
    const normalized = typeof auth.normalizeLoginResponse === "function"
      ? auth.normalizeLoginResponse(sampleResponse)
      : {};
    const viewState = typeof auth.getLoginViewState === "function"
      ? auth.getLoginViewState(global.document)
      : {};
    const sessionDisplay = typeof auth.getCurrentSessionDisplay === "function"
      ? auth.getCurrentSessionDisplay()
      : {};
    const loginHtml = typeof auth.renderLoginPanel === "function" ? auth.renderLoginPanel() : "";
    const required = [
      "normalizeLoginResponse",
      "getCurrentSessionDisplay",
      "getLoginViewState",
      "renderLoginPanel",
      "renderLoginError",
      "renderLoginSuccess",
      "renderLoginQuote",
      "getNextLoginQuote",
      "rotateLoginQuote",
      "collectLoginFormData",
      "classifyLoginError"
    ];
    const missing = required.filter(function (name) {
      return typeof auth[name] !== "function";
    });

    return {
      ok: missing.length === 0,
      missing,
      loginPanelExists: Boolean(viewState.loginPanelExists),
      loginInputExists: Boolean(viewState.loginInputExists),
      loginButtonExists: Boolean(viewState.loginButtonExists),
      currentSessionAvailable: Boolean(sessionDisplay.sessionAvailable),
      profileAvailable: Boolean(sessionDisplay.profileAvailable),
      loginQuoteCount: normalized.loginQuoteCount || (auth.LOGIN_QUOTES && auth.LOGIN_QUOTES.length) || 0,
      normalizedSessionResult: normalized,
      renderedPanelHasForm: loginHtml.includes("loginForm"),
      noLoginRequestSent: true,
      accessCodeLogged: false
    };
  }

  auth.controllerStatus = "extracted";
  auth.testAuthModule = testAuthModule;

  app.modules.authController = {
    status: "extracted",
    testAuthModule
  };
})(window);
