window.createLoginAccountEnrollment = function createLoginAccountEnrollment(ownerScope) {
  "use strict";

  const {
    text, runtime, clearMessage, showMessage, constants, SIGNUP_PENDING_KEY,
    CONTINUATION_HANDLE_PATTERN, validateStaffPassword, setFormBusy, api, errorMessage, setMode,
    clearAdminState, persistSafeAdminStatus, renderGameSelection,
  } = ownerScope;


  async function requestAdminPasswordReset() {
    const email = text("adminEmail");
    const node = runtime.document.getElementById("adminMessage");
    const button = runtime.document.getElementById("forgotAdminAccessCode");
    clearMessage(node);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage(node, "Enter a valid Admin Email first.", "bad");
      return;
    }
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = constants();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      showMessage(node, "Password recovery is not configured.", "bad");
      return;
    }
    if (button) button.disabled = true;
    try {
      const redirectTo = new URL("auth/reset-password.html", runtime.document.baseURI).href;
      const response = await runtime.fetch(
        `${String(SUPABASE_URL).replace(/\/+$/, "")}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ email }),
          cache: "no-store"
        }
      );
      showMessage(node, response.ok
        ? "If that administrator account exists, a password reset email has been sent."
        : "The reset email could not be sent.", response.ok ? "ok" : "bad");
    } catch (_) {
      showMessage(node, "Could not connect to password recovery.", "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function readPendingSignup() {
    try {
      const value = JSON.parse(runtime.sessionStorage.getItem(SIGNUP_PENDING_KEY) || "null");
      return value && CONTINUATION_HANDLE_PATTERN.test(String(value.handle || ""))
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function savePendingSignup(verification) {
    const handle = String(verification?.continuationHandle || "");
    if (!CONTINUATION_HANDLE_PATTERN.test(handle)) return null;
    const record = {
      handle,
      maskedEmail: String(verification?.maskedEmail || "your email address").slice(0, 400),
      expiresAt: String(verification?.expiresAt || ""),
      storedAt: new Date().toISOString()
    };
    runtime.sessionStorage.setItem(SIGNUP_PENDING_KEY, JSON.stringify(record));
    return record;
  }

  function showVerificationFace(record) {
    runtime.document.getElementById("createAccountStep")?.classList.add("hidden");
    runtime.document.getElementById("createVerificationStep")?.classList.remove("hidden");
    const email = runtime.document.getElementById("createVerificationEmail");
    if (email) email.textContent = String(record?.maskedEmail || "your email address");
  }

  function restorePendingSignupView() {
    const record = readPendingSignup();
    if (record) showVerificationFace(record);
    else {
      runtime.document.getElementById("createVerificationStep")?.classList.add("hidden");
      runtime.document.getElementById("createAccountStep")?.classList.remove("hidden");
    }
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("createMessage");
    const input = {
      email: text("createEmail"),
      displayName: text("createDisplayName"),
      password: String(runtime.document.getElementById("createAccessCode")?.value || ""),
      confirmation: String(runtime.document.getElementById("confirmAccessCode")?.value || "")
    };
    clearMessage(node);
    if (!input.email || !input.displayName || !input.password || !input.confirmation) {
      showMessage(node, "Complete every account field.", "bad");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      showMessage(node, "Enter a valid Teacher/Admin Email.", "bad");
      return;
    }
    const passwordError = validateStaffPassword(input.password);
    if (passwordError) {
      showMessage(node, passwordError, "bad");
      return;
    }
    if (input.password !== input.confirmation) {
      showMessage(node, "Password confirmation does not match.", "bad");
      return;
    }
    setFormBusy(form, true, "Creating account...");
    try {
      const signup = await api().callStaffSignupApi?.(input);
      if (!signup?.ok) {
        showMessage(node, errorMessage(signup, "Staff account signup failed."), "bad");
        return;
      }
      const record = savePendingSignup(signup.verification);
      form.reset();
      showVerificationFace(record || { maskedEmail: input.email });
      showMessage(
        runtime.document.getElementById("verificationMessage"),
        String(signup.message || "Check your email. If you already have an account, sign in instead.")
      );
    } catch (error) {
      showMessage(node, errorMessage(error, "The account could not be created."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function resendCreateVerification() {
    const record = readPendingSignup();
    const node = runtime.document.getElementById("verificationMessage");
    if (!record) {
      showMessage(node, "Start account creation again to request verification.", "bad");
      return;
    }
    const button = runtime.document.getElementById("resendCreateVerification");
    if (button) button.disabled = true;
    try {
      const result = await api().callStaffSignupResendApi?.(record.handle);
      showMessage(node, result?.ok
        ? String(result.message || "If verification is pending, a new email will be sent when allowed.")
        : errorMessage(result, "The verification email could not be requested."), result?.ok ? "ok" : "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function cancelCreateVerification() {
    const record = readPendingSignup();
    if (record) await api().callStaffSignupCancelApi?.(record.handle).catch?.(() => null);
    runtime.sessionStorage.removeItem(SIGNUP_PENDING_KEY);
    restorePendingSignupView();
    runtime.document.getElementById("createForm")?.reset();
  }

  function backFromCreateVerification() {
    setMode("admin");
    showMessage(runtime.document.getElementById("adminMessage"), "Sign in after confirming your email address.");
  }

  async function resumeAdminSession() {
    const requested = new URLSearchParams(runtime.location.search).get("mode");
    if (requested !== "admin") return;
    const status = await api().callAdminWebSessionStatus?.().catch?.(() => null);
    if (!status?.ok || status.session?.authenticated !== true) {
      clearAdminState();
      return;
    }
    persistSafeAdminStatus(status);
    renderGameSelection(status.activeGameSessions || []);
  }

  return {
    requestAdminPasswordReset, readPendingSignup, savePendingSignup, showVerificationFace,
    restorePendingSignupView, handleCreateAccount, resendCreateVerification, cancelCreateVerification,
    backFromCreateVerification, resumeAdminSession,
  };
};
