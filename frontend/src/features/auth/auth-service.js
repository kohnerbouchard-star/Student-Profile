(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  function normalizeAccessCode(value) {
    if (typeof global.normalizeCardId === "function") {
      return global.normalizeCardId(value);
    }

    return String(value ?? "")
      .trim()
      .replace(/\.0$/, "");
  }

  // validation-preview-only
  function collectLoginFormData(root, options) {
    const config = options || {};
    const documentRoot = root || global.document;
    const input = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginCardId")
      : null;
    const normalized = normalizeAccessCode(input && input.value);

    return {
      accessCode: config.includeAccessCode === true ? normalized : "",
      accessCodeLength: normalized.length,
      hasAccessCode: normalized.length > 0,
      inputPresent: Boolean(input)
    };
  }

  // display-only
  function classifyLoginError(message) {
    const text = String(message || "Login failed. Try scanning your code again.");

    if (/unauthorized|secret|api|script|worker|backend|server|origin/i.test(text)) {
      return {
        className: "bad",
        message: "The dashboard could not confirm your request. Please refresh and try again."
      };
    }

    if (/code|scan|student/i.test(text)) {
      return {
        className: "bad",
        message: text
      };
    }

    return {
      className: "bad",
      message: text
    };
  }

  // backend-authoritative-required
  function createLoginRequest(formData) {
    const source = formData || {};

    return {
      action: "LOGIN",
      accessCode: source.accessCode || "",
      code: source.accessCode || "",
      cardId: source.accessCode || ""
    };
  }

  // backend-authoritative-required
  async function submitLogin(apiCall, formData) {
    if (typeof apiCall !== "function") {
      throw new Error("A backend API caller is required for login.");
    }

    return apiCall(createLoginRequest(formData));
  }

  auth.serviceStatus = "extracted";
  auth.collectLoginFormData = collectLoginFormData;
  auth.classifyLoginError = classifyLoginError;
  auth.createLoginRequest = createLoginRequest;
  auth.submitLogin = submitLogin;

  app.modules.authService = {
    status: "extracted",
    description: "Login form helpers. Backend LOGIN remains authoritative; tests must not call submitLogin.",
    collectLoginFormData,
    classifyLoginError,
    createLoginRequest,
    submitLogin
  };
})(window);
