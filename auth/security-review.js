(() => {
  "use strict";

  const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
  const PROJECT_REFS = new Set([
    "eecvbssdvarfcykcfrny",
    "cgiukdjwicykrmtkhudh"
  ]);
  const REVIEW_TYPES = new Set(["signup", "magiclink"]);
  const button = document.getElementById("continueReview");
  const message = document.getElementById("reviewMessage");
  const intro = document.getElementById("reviewIntro");
  const title = document.getElementById("reviewTitle");
  const kicker = document.getElementById("reviewKicker");
  const params = new URLSearchParams(window.location.search);
  let tokenHash = String(params.get("token_hash") || "").trim();
  const reviewType = String(params.get("type") || "").trim().toLowerCase();
  const projectRef = String(params.get("project_ref") || "").trim().toLowerCase();

  function setMessage(text, isError = false) {
    if (!message) return;
    message.textContent = String(text || "");
    message.classList.toggle("is-error", isError);
  }

  function invalidateReview(text) {
    tokenHash = "";
    if (button) button.hidden = true;
    setMessage(text, true);
  }

  document.title = "Confirm Econovaria Email";
  if (kicker) kicker.textContent = "Administrator account verification";
  if (title) title.textContent = "Confirm your email address";
  if (intro) {
    intro.textContent = "Continue only if you created this Econovaria administrator account.";
  }
  if (button) button.textContent = "Confirm Email Address";

  window.history.replaceState({}, document.title, window.location.pathname);

  if (
    !TOKEN_HASH_PATTERN.test(tokenHash) ||
    !REVIEW_TYPES.has(reviewType) ||
    !PROJECT_REFS.has(projectRef)
  ) {
    invalidateReview(
      "This email verification request is invalid or has expired. Request a new email from the account-creation page."
    );
    return;
  }

  if (button) button.hidden = false;
  setMessage(
    "The verification request is ready. Confirm only if you created this administrator account."
  );

  button?.addEventListener("click", async () => {
    if (!tokenHash) return;
    button.disabled = true;
    button.textContent = "Confirming Email...";
    setMessage("Confirming mailbox ownership and securing the temporary session.");

    try {
      const response = await window.fetch("/api/auth-token-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenHash, type: reviewType, projectRef }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });

      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || data?.ok !== true || data?.verified !== true) {
        invalidateReview(
          data?.error?.message ||
          "This verification request is invalid, expired, or already used. Request a new email from the account-creation page."
        );
        return;
      }

      tokenHash = "";
      if (button) button.hidden = true;
      if (intro) intro.textContent = "Your email address has been confirmed.";
      setMessage("Email confirmed. Returning to administrator sign-in.");
      window.setTimeout(() => {
        window.location.replace("../?mode=admin&reason=email-verified");
      }, 700);
    } catch (_) {
      setMessage(
        "Could not confirm the email request. Check your connection and try again.",
        true
      );
      button.disabled = false;
      button.textContent = "Confirm Email Address";
    }
  });
})();
