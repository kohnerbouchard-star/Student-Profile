(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  // display-only
  function getCurrentSessionDisplay(source) {
    const state = getState(source && source.state);
    const session = source && source.session || global.currentSession || null;
    const profile = state.profile || null;

    return {
      sessionAvailable: Boolean(session),
      role: session && session.role || "STUDENT",
      tokenPresent: Boolean(session && session.token),
      permissionCount: session && Array.isArray(session.permissions) ? session.permissions.length : 0,
      profileAvailable: Boolean(profile),
      profileName: profile && (profile.name || profile.studentName) || ""
    };
  }

  // display-only
  function getLoginViewState(root) {
    const documentRoot = root || global.document;
    const loginScreen = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginScreen")
      : null;
    const input = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginCardId")
      : null;
    const form = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginForm")
      : null;
    const quoteText = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginQuoteText")
      : null;
    const quoteCount = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginQuoteCount")
      : null;
    const error = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginError")
      : null;

    return {
      loginPanelExists: Boolean(loginScreen),
      loginInputExists: Boolean(input),
      loginButtonExists: Boolean(form && form.querySelector("button[type='submit']")),
      loginErrorVisible: Boolean(error && !error.classList.contains("hidden")),
      currentQuoteText: quoteText ? String(quoteText.textContent || "").trim() : "",
      currentQuoteCount: quoteCount ? String(quoteCount.textContent || "").trim() : ""
    };
  }

  auth.selectorStatus = "extracted";
  auth.getCurrentSessionDisplay = getCurrentSessionDisplay;
  auth.getLoginViewState = getLoginViewState;

  app.modules.authSelectors = {
    status: "extracted",
    getCurrentSessionDisplay,
    getLoginViewState
  };
})(window);
