(() => {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const PASSWORD_RESET_API_URL = runtimeConfig.passwordResetApiUrl;
  const PROJECT_REFS = new Set([
    "eecvbssdvarfcykcfrny",
    "cgiukdjwicykrmtkhudh"
  ]);
  const PASSWORD_MIN_LENGTH = 15;
  const PASSWORD_MAX_LENGTH = 128;
  const form = document.getElementById("resetPasswordForm");
  const message = document.getElementById("resetMessage");
  const intro = document.getElementById("resetIntro");

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  let accessToken = String(
    hash.get("access_token") || query.get("access_token") || ""
  ).trim();
  const recoveryType = String(hash.get("type") || query.get("type") || "").trim();
  const projectRef = String(
    hash.get("project_ref") || query.get("project_ref") || runtimeConfig.projectRef || ""
  ).trim().toLowerCase();
  const authError = String(
    hash.get("error_description") || query.get("error_description") || ""
  );

  function setMessage(text, isError = false) {
    message.textContent = String(text || "");
    message.classList.toggle("is-error", isError);
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function validatePassword(password) {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return `Password must be no more than ${PASSWORD_MAX_LENGTH} characters.`;
    }
    if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must include a number.";
    if (!/[^A-Za-z0-9\s]/.test(password)) return "Password must include a symbol.";
    if (/[\u0000-\u001f\u007f]/.test(password)) {
      return "Password cannot contain control characters.";
    }
    return "";
  }

  if (authError) {
    setMessage(decodeURIComponent(authError.replace(/\+/g, " ")), true);
    intro.textContent = "This recovery link could not be used.";
    clearRecoveryUrl();
    return;
  }

  if (
    !accessToken ||
    (recoveryType && recoveryType !== "recovery") ||
    !PROJECT_REFS.has(projectRef)
  ) {
    setMessage(
      "This password recovery link is invalid or has expired. Request a new email from the administrator login page.",
      true
    );
    intro.textContent = "A valid one-time recovery link is required.";
    clearRecoveryUrl();
    return;
  }

  form.hidden = false;
  setMessage("Recovery link verified. Choose a new administrator password.");
  clearRecoveryUrl();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = String(form.elements.password.value || "");
    const confirmPassword = String(form.elements.confirmPassword.value || "");
    const button = form.querySelector("button[type='submit']");
    const policyError = validatePassword(password);

    if (policyError) return setMessage(policyError, true);
    if (password !== confirmPassword) {
      return setMessage("Password confirmation does not match.", true);
    }
    if (!accessToken) {
      return setMessage("This password recovery link is invalid or expired.", true);
    }

    button.disabled = true;
    button.textContent = "Updating Password...";

    try {
      const response = await fetch(PASSWORD_RESET_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ password, projectRef }),
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok || data?.ok !== true) {
        return setMessage(
          data?.error?.message || data?.message ||
            "The administrator password could not be updated.",
          true
        );
      }

      accessToken = "";
      form.reset();
      window.sessionStorage.removeItem("econovaria.admin.auth.v1");
      window.EconovariaAdminGameSelection?.clear?.();
      form.hidden = true;
      setMessage(
        "Password updated and existing administrator sessions revoked. Returning to sign-in."
      );

      window.setTimeout(() => {
        window.location.replace("../?mode=admin&reason=password-reset");
      }, 900);
    } catch (_) {
      setMessage(
        "Could not connect to password recovery. Check your connection and try again.",
        true
      );
    } finally {
      button.disabled = false;
      button.textContent = "Update Password";
    }
  });
})();
