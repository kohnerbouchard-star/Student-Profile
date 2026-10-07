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
  const mfaForm = document.getElementById("recoveryMfaForm");
  let busy = false;
  let closed = false;

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
    hash.delete("access_token");
    query.delete("access_token");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function endRecovery(text) {
    accessToken = "";
    closed = true;
    form.reset();
    mfaForm.reset();
    form.hidden = mfaForm.hidden = true;
    setMessage(text, true);
  }
  window.addEventListener("pagehide", () => endRecovery("Request a fresh recovery email to continue."));
  document.getElementById("recoveryMfaUnavailable").addEventListener("click", () =>
    endRecovery("Contact your administrator for verified account recovery. Do not remove or replace an authenticator yourself."));

  async function recoveryMfa(operation, fields = {}) {
    if (PASSWORD_RESET_API_URL !== "/api/password-reset") throw new Error("Recovery MFA requires the hosted recovery page.");
    const response = await fetch(`${PASSWORD_RESET_API_URL}?operation=${operation}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ projectRef, ...fields }), credentials: "same-origin",
      cache: "no-store", redirect: "error", referrerPolicy: "no-referrer"
    });
    const data = await response.json();
    if (closed) return null;
    if (!response.ok || data?.ok !== true) {
      if (response.status === 401 && data?.error?.code !== "mfa_verification_failed") {
        endRecovery("Recovery expired. Request a fresh recovery email.");
      } else setMessage(data?.error?.message || "Recovery verification is unavailable.", true);
      return null;
    }
    return data;
  }

  async function showMfa() {
    form.reset();
    form.hidden = true;
    const data = await recoveryMfa("mfa-status").catch(() => {
      endRecovery("Recovery verification could not be loaded. Contact your administrator or request a fresh recovery email.");
      return null;
    });
    if (!data) return endRecovery(message.textContent);
    if (!data.factors?.length) return endRecovery("No verified authenticator is available. Contact your administrator for verified account recovery.");
    mfaForm.elements.factorHandle.replaceChildren();
    for (const factor of data.factors) {
      const option = document.createElement("option");
      option.value = factor.handle;
      option.textContent = factor.friendlyName;
      mfaForm.elements.factorHandle.append(option);
    }
    mfaForm.hidden = false;
    setMessage("Verify an authenticator for this account before choosing your new password.");
    mfaForm.elements.code.focus();
  }

  mfaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || closed || !accessToken) return;
    busy = true;
    const button = mfaForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const data = await recoveryMfa("mfa-verify", {
        factorHandle: mfaForm.elements.factorHandle.value, code: mfaForm.elements.code.value.trim()
      });
      if (!data) return;
      accessToken = data.accessToken;
      mfaForm.hidden = true;
      form.hidden = false;
      setMessage("Authenticator verified. Choose your new password.");
      form.elements.password.focus();
    } catch (_) { if (!closed) setMessage("Could not verify the authenticator. Try again or contact your administrator.", true); }
    finally { busy = false; button.disabled = false; mfaForm.elements.code.value = ""; }
  });

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
    if (busy || closed || form.hidden) return;

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

    busy = true;
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

      if (closed) return;
      if (data?.error?.code === "staff_mfa_required") return await showMfa();
      if (response.status === 401) return endRecovery("Recovery expired. Request a fresh recovery email.");

      if (!response.ok || data?.ok !== true) {
        return setMessage(
          data?.error?.message || data?.message ||
            "The administrator password could not be updated.",
          true
        );
      }

      accessToken = "";
      closed = true;
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
      if (closed) return;
      setMessage(
        "Could not connect to password recovery. Check your connection and try again.",
        true
      );
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = "Update Password";
    }
  });
})();
