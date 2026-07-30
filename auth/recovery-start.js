(() => {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const SUPABASE_URL = String(runtimeConfig.supabaseUrl || "").replace(/\/+$/, "");
  const SUPABASE_PUBLISHABLE_KEY = String(
    runtimeConfig.supabasePublishableKey || ""
  ).trim();
  const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
  const button = document.getElementById("continueRecovery");
  const message = document.getElementById("recoveryMessage");
  const intro = document.getElementById("recoveryIntro");
  const params = new URLSearchParams(window.location.search);
  let tokenHash = String(params.get("token_hash") || "").trim();
  const recoveryType = String(params.get("type") || "").trim().toLowerCase();

  function setMessage(text, isError = false) {
    if (!message) return;
    message.textContent = String(text || "");
    message.classList.toggle("is-error", isError);
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function invalidateRecovery(messageText) {
    tokenHash = "";
    if (button) button.hidden = true;
    if (intro) intro.textContent = "A valid one-time recovery request is required.";
    setMessage(messageText, true);
  }

  clearRecoveryUrl();

  if (
    recoveryType !== "recovery" ||
    !TOKEN_HASH_PATTERN.test(tokenHash) ||
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY
  ) {
    invalidateRecovery(
      "This password recovery request is invalid or has expired. Request a new email from the administrator login page."
    );
    return;
  }

  if (button) button.hidden = false;
  setMessage(
    "The recovery request is ready. Continue to verify it and choose a new password."
  );

  button?.addEventListener("click", async () => {
    if (!tokenHash) return;

    button.disabled = true;
    button.textContent = "Verifying Recovery Request...";
    setMessage("Verifying the one-time recovery request.");

    try {
      const response = await window.fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          token_hash: tokenHash,
          type: "recovery"
        }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {}

      const accessToken = String(data?.access_token || "").trim();
      if (!response.ok || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(accessToken)) {
        invalidateRecovery(
          data?.msg || data?.error_description ||
            "This password recovery request is invalid or has expired. Request a new email from the administrator login page."
        );
        return;
      }

      tokenHash = "";
      const target = new URL("reset-password.html", window.location.href);
      target.hash = new URLSearchParams({
        access_token: accessToken,
        type: "recovery"
      }).toString();
      window.location.replace(target.href);
    } catch (_) {
      setMessage(
        "Could not verify the recovery request. Check your connection and try again.",
        true
      );
      button.disabled = false;
      button.textContent = "Continue to Password Reset";
    }
  });
})();
