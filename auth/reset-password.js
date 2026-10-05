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

  let systemGrant = String(hash.get("recovery_grant") || "");
  let systemTokenHash = String(hash.get("token_hash") || "");
  let systemFactor = "";
  let systemSlot = "primary";
  const systemForm = document.getElementById("systemRecoveryForm");
  const systemBegin = document.getElementById("beginSystemRecovery");

  function clearSystemSetup() {
    systemFactor = "";
    systemForm.reset();
    systemForm.hidden = true;
    systemBegin.hidden = true;
    document.getElementById("systemRecoveryQr").removeAttribute("src");
    document.getElementById("systemRecoverySecret").textContent = "";
  }
  async function systemCall(operation, fields = {}) {
    if (PASSWORD_RESET_API_URL !== "/api/password-reset" || projectRef !== "eecvbssdvarfcykcfrny") throw Error("Unsupported recovery origin");
    const response = await fetch(`${PASSWORD_RESET_API_URL}?operation=recovery-${operation}`, {
      method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},
      body:JSON.stringify({projectRef,grant:systemGrant,...fields}),credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
    });
    const data = await response.json();
    if (closed) return null;
    if (!response.ok || data.ok !== true) {
      if (data?.error?.code === "mfa_verification_failed") { setMessage("The code was not accepted. Enter the current code and try again.",true); return null; }
      throw Error("Recovery unavailable");
    }
    return data;
  }
  async function showSystemSetup(slot) {
    clearSystemSetup();
    const data = await systemCall("enroll",{slot});
    if (!data || closed) return;
    systemSlot=slot; systemFactor=data.factor.handle;
    document.getElementById("systemRecoveryQr").src=data.factor.qrCode;
    document.getElementById("systemRecoverySecret").textContent=data.factor.secret;
    document.getElementById("systemRecoveryInstructions").textContent=slot==="primary"
      ? "Scan this QR code in your replacement authenticator, then enter its current code."
      : "Set up this separate backup factor on your independently stored backup authenticator, then verify its code.";
    intro.textContent="Your account stays restricted until recovery finishes.";
    systemForm.hidden=false;
    systemForm.elements.code.focus();
  }
  systemBegin.addEventListener("click",async()=>{
    if (busy || closed) return;
    busy=true; systemBegin.disabled=true;
    try {
      const response=await fetch("/api/password-reset?operation=verify-auth",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({projectRef,type:"recovery",tokenHash:systemTokenHash}),
        credentials:"same-origin",cache:"no-store",redirect:"error",referrerPolicy:"no-referrer",
      });
      const verified=await response.json();
      if(closed) return;
      systemTokenHash="";
      if(!response.ok || verified.ok!==true || verified.projectRef!==projectRef || !verified.accessToken) throw Error("Invalid email verification");
      accessToken=verified.accessToken;
      const state=await systemCall("claim");
      if(!state || state.setupInterrupted) throw Error("Setup interrupted");
      if(state.primaryVerified && state.backupVerified) { clearSystemSetup(); form.hidden=false; }
      else await showSystemSetup(state.primaryVerified ? "backup" : "primary");
    } catch { if(!closed) endRecovery("Recovery could not continue. Contact the system operator for a fresh recovery attempt."); }
    finally { busy=false; }
  });
  systemForm.addEventListener("submit",async event=>{
    event.preventDefault();
    if(busy || closed || systemForm.hidden) return;
    busy=true;
    const code=systemForm.elements.code.value.trim();
    systemForm.elements.code.value="";
    try {
      const verified=await systemCall("verify",{slot:systemSlot,factorHandle:systemFactor,code});
      if(!verified || closed) return;
      accessToken=verified.accessToken;
      if(systemSlot==="primary") await showSystemSetup("backup");
      else { clearSystemSetup(); form.hidden=false; intro.textContent="Choose a new password with at least 15 characters, uppercase, lowercase, number and symbol."; setMessage("Both authenticators verified. Choose your new password."); }
    } catch { if(!closed) endRecovery("Recovery remains restricted. Contact the system operator if setup was interrupted."); }
    finally { busy=false; }
  });

  function setMessage(text, isError = false) {
    message.textContent = String(text || "");
    message.classList.toggle("is-error", isError);
  }

  function clearRecoveryUrl() {
    hash.delete("access_token");
    hash.delete("recovery_grant");
    hash.delete("token_hash");
    query.delete("access_token");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function endRecovery(text) {
    accessToken = "";
    systemGrant = systemTokenHash = "";
    clearSystemSetup();
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
    (!accessToken && !systemGrant) ||
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

  if (systemGrant) {
    if(projectRef!=="eecvbssdvarfcykcfrny" || !/^[A-Za-z0-9_-]{43}$/.test(systemGrant) || !/^[A-Za-z0-9_-]{16,256}$/.test(systemTokenHash)) {
      endRecovery("This approved recovery link is invalid."); clearRecoveryUrl(); return;
    }
    form.hidden=true; systemBegin.hidden=false;
    setMessage("Continue to verify your email and set up replacement authenticators.");
  } else {
    form.hidden = false;
    setMessage("Recovery link verified. Choose a new administrator password.");
  }
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
      const response = await fetch(systemGrant ? `${PASSWORD_RESET_API_URL}?operation=recovery-complete` : PASSWORD_RESET_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ password, projectRef, ...(systemGrant ? {grant:systemGrant} : {}) }),
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
      if (systemGrant && (!response.ok || data?.ok !== true)) return endRecovery("Recovery remains restricted. Contact the system operator to reconcile this attempt before trying again.");
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
      systemGrant = "";
      systemTokenHash = "";
      clearSystemSetup();
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
      if (systemGrant) return endRecovery("Recovery remains restricted. Contact the system operator to reconcile this attempt before trying again.");
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
