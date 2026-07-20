(() => {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const form = document.getElementById("resetPasswordForm");
  const message = document.getElementById("resetMessage");
  const intro = document.getElementById("resetIntro");

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const accessToken = hash.get("access_token") || "";
  const recoveryType = hash.get("type") || query.get("type") || "";
  const authError = hash.get("error_description") || query.get("error_description") || "";

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (authError) {
    setMessage(decodeURIComponent(authError.replace(/\+/g, " ")), true);
    intro.textContent = "This recovery link could not be used.";
    return;
  }

  if (!accessToken || (recoveryType && recoveryType !== "recovery")) {
    setMessage("This password recovery link is invalid or has expired. Request a new email from the administrator login page.", true);
    intro.textContent = "A valid one-time recovery link is required.";
    return;
  }

  form.hidden = false;
  setMessage("Recovery link verified. Choose a new Access Code.");
  clearRecoveryUrl();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;
    const button = form.querySelector("button[type='submit']");

    if (password.length < 8) {
      return setMessage("Access Code must be at least 8 characters.", true);
    }

    if (password !== confirmPassword) {
      return setMessage("Access Code confirmation does not match.", true);
    }

    button.disabled = true;
    button.textContent = "Updating Access Code...";

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ password })
      });

      let data = {};
      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok) {
        return setMessage(
          data?.msg || data?.message || data?.error_description || "The Access Code could not be updated.",
          true
        );
      }

      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`
          }
        });
      } catch (_) {}

      window.sessionStorage.removeItem("econovaria.admin.auth.v1");
      window.sessionStorage.removeItem("econovaria.admin.selected-game.v1");
      form.hidden = true;
      setMessage("Access Code updated. Returning to administrator sign-in.");

      window.setTimeout(() => {
        window.location.replace("../?mode=admin&passwordReset=success");
      }, 900);
    } catch (_) {
      setMessage("Could not connect to password recovery. Check your connection and try again.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Update Access Code";
    }
  });
})();
