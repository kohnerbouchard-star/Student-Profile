(() => {
  "use strict";

  const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
  const PROJECT_REFS = new Set([
    "eecvbssdvarfcykcfrny",
    "cgiukdjwicykrmtkhudh"
  ]);
  const button = document.getElementById("continueRecovery");
  const message = document.getElementById("recoveryMessage");
  const intro = document.getElementById("recoveryIntro");
  const params = new URLSearchParams(window.location.search);
  let tokenHash = String(params.get("token_hash") || "").trim();
  const recoveryType = String(params.get("type") || "").trim().toLowerCase();
  const projectRef = String(params.get("project_ref") || "").trim().toLowerCase();

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
    !PROJECT_REFS.has(projectRef)
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
      const response = await window.fetch("/api/auth-token-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, type: "recovery", projectRef }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {}

      const accessToken = String(data?.accessToken || "").trim();
      if (
        !response.ok ||
        data?.ok !== true ||
        data?.verified !== true ||
        data?.projectRef !== projectRef ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(accessToken)
      ) {
        invalidateRecovery(
          data?.error?.message ||
            "This password recovery request is invalid or has expired. Request a new email from the administrator login page."
        );
        return;
      }

      tokenHash = "";
      const target = new URL("reset-password.html", window.location.href);
      target.hash = new URLSearchParams({
        access_token: accessToken,
        type: "recovery",
        project_ref: projectRef
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
