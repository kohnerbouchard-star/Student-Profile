window.Econovaria = window.Econovaria || {};

(function installEconovariaAdminMfa(runtime) {
  "use strict";

  const QR_DATA_PATTERN = /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
  const FACTOR_HANDLE_PATTERN = /^mfa1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,3900}$/;
  const SECRET_PATTERN = /^[A-Z2-7=]{16,128}$/;
  const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const STYLE_URL = "frontend/src/styles/admin-mfa.css";
  let activeChallenge = null;

  function api() {
    return runtime.Econovaria?.core?.api || {};
  }

  function ensureStylesheet() {
    if (runtime.document.querySelector('link[data-econovaria-admin-mfa-style]')) {
      return;
    }
    const link = runtime.document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(STYLE_URL, runtime.document.baseURI).href;
    link.dataset.econovariaAdminMfaStyle = "true";
    runtime.document.head.append(link);
  }

  function safeText(value, maxLength = 500) {
    const text = String(value || "").trim();
    return text.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(text)
      ? text
      : "";
  }

  function validFactorHandle(value) {
    const handle = String(value || "").trim();
    return FACTOR_HANDLE_PATTERN.test(handle) ? handle : "";
  }

  function validSecret(value) {
    const secret = String(value || "").replace(/\s+/g, "").toUpperCase();
    return SECRET_PATTERN.test(secret) ? secret : "";
  }

  function validQrCode(value) {
    const qrCode = String(value || "").trim();
    return qrCode.length <= 200000 && QR_DATA_PATTERN.test(qrCode)
      ? qrCode
      : "";
  }

  function statusMessage(result, fallback) {
    return safeText(
      result?.error?.message || result?.message || fallback,
      500
    ) || fallback;
  }

  function createElement(tag, className, text) {
    const element = runtime.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setModeTabsLocked(locked) {
    const tabs = runtime.document.querySelector(".mode-tabs");
    tabs?.classList.toggle("is-auth-locked", locked);
    runtime.document.querySelectorAll(".mode-tab").forEach((tab) => {
      if (locked) {
        tab.dataset.mfaWasDisabled = String(tab.disabled);
        tab.disabled = true;
        tab.setAttribute("aria-disabled", "true");
      } else {
        tab.disabled = tab.dataset.mfaWasDisabled === "true";
        delete tab.dataset.mfaWasDisabled;
        tab.removeAttribute("aria-disabled");
      }
    });
  }

  function ensureMfaHost() {
    const adminPane = runtime.document.getElementById("adminPane");
    if (!adminPane) {
      throw new Error("Administrator sign-in surface is unavailable.");
    }
    let host = runtime.document.getElementById("econovariaAdminMfaStep");
    if (!host) {
      host = createElement("div", "econovaria-mfa-card-host hidden");
      host.id = "econovariaAdminMfaStep";
      adminPane.append(host);
    }
    return host;
  }

  function showMfaSurface(host) {
    runtime.Econovaria?.login?.setMode?.("admin");
    runtime.document.getElementById("adminLoginStep")?.classList.add("hidden");
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    host.classList.remove("hidden");
    runtime.document.getElementById("loginScreen")?.setAttribute("data-admin-face", "mfa");
    setModeTabsLocked(true);
  }

  function restoreAdminSignIn(host) {
    host.replaceChildren();
    host.classList.add("hidden");
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    runtime.document.getElementById("adminLoginStep")?.classList.remove("hidden");
    runtime.document.getElementById("loginScreen")?.removeAttribute("data-admin-face");
    setModeTabsLocked(false);
  }

  function buildCardView({ enrollment, factorHandle, qrCode, secret }) {
    const host = ensureMfaHost();
    host.replaceChildren();

    const face = createElement("section", "econovaria-mfa-card-face");
    face.setAttribute("aria-labelledby", "econovariaMfaTitle");
    face.setAttribute("aria-describedby", "econovariaMfaDescription");

    const breadcrumb = createElement("button", "econovaria-mfa-breadcrumb");
    breadcrumb.type = "button";
    breadcrumb.setAttribute("aria-label", "Back to administrator sign in");
    breadcrumb.append(
      createElement("span", "econovaria-mfa-back-icon", "←"),
      createElement("span", "", "Admin sign in")
    );

    const eyebrow = createElement(
      "p",
      "econovaria-mfa-eyebrow",
      "Administrator security"
    );
    const title = createElement(
      "h2",
      "econovaria-mfa-title",
      enrollment ? "Set up authenticator" : "Verify authenticator"
    );
    title.id = "econovariaMfaTitle";
    const description = createElement(
      "p",
      "econovaria-mfa-description",
      enrollment
        ? "Scan the QR code, then enter the current six-digit code."
        : "Enter the current six-digit code from your authenticator app."
    );
    description.id = "econovariaMfaDescription";
    face.append(breadcrumb, eyebrow, title, description);

    let secretNode = null;
    let setup = null;
    let setupContinue = null;
    if (enrollment) {
      setup = createElement("div", "econovaria-mfa-setup");
      const qrWrap = createElement("div", "econovaria-mfa-qr-wrap");
      const image = createElement("img", "econovaria-mfa-qr");
      image.alt = "Authenticator enrollment QR code";
      image.src = qrCode;
      qrWrap.append(image);

      const secretWrap = createElement("div", "econovaria-mfa-secret-wrap");
      const secretLabel = createElement(
        "span",
        "econovaria-mfa-secret-label",
        "Manual setup key"
      );
      secretNode = createElement("code", "econovaria-mfa-secret", secret);
      secretWrap.append(secretLabel, secretNode);
      setupContinue = createElement(
        "button",
        "submit-btn amber econovaria-mfa-setup-continue",
        "Continue"
      );
      setupContinue.type = "button";
      setup.append(qrWrap, secretWrap, setupContinue);
      face.append(setup);
    }

    const form = createElement(
      "form",
      enrollment ? "econovaria-mfa-form hidden" : "econovaria-mfa-form"
    );
    const label = createElement("label");
    label.append(createElement("span", "", "Six-digit code"));
    const input = createElement("input", "econovaria-mfa-code");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.pattern = "[0-9]{6}";
    input.maxLength = 6;
    input.minLength = 6;
    input.required = true;
    input.placeholder = "000000";
    input.setAttribute("aria-describedby", "econovariaMfaMessage");
    label.append(input);

    const message = createElement("p", "econovaria-mfa-message");
    message.id = "econovariaMfaMessage";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const verifyActions = createElement("div", "econovaria-mfa-verify-actions");
    let backToSetup = null;
    if (enrollment) {
      backToSetup = createElement(
        "button",
        "econovaria-mfa-inline-back",
        "Back to QR"
      );
      backToSetup.type = "button";
      verifyActions.append(backToSetup);
    }
    const submit = createElement(
      "button",
      "submit-btn amber econovaria-mfa-submit",
      "Verify and continue"
    );
    submit.type = "submit";
    verifyActions.append(submit);
    form.append(label, message, verifyActions);
    face.append(form);
    host.append(face);
    showMfaSurface(host);

    return {
      host,
      face,
      form,
      input,
      message,
      submit,
      breadcrumb,
      title,
      description,
      setup,
      setupContinue,
      backToSetup,
      secretNode,
      enrollment,
      factorHandle
    };
  }

  function setBusy(view, busy) {
    view.input.disabled = busy;
    view.submit.disabled = busy;
    view.breadcrumb.disabled = busy;
    if (view.setupContinue) view.setupContinue.disabled = busy;
    if (view.backToSetup) view.backToSetup.disabled = busy;
    view.submit.textContent = busy ? "Verifying..." : "Verify and continue";
  }

  function showError(view, message) {
    view.message.textContent = message;
    view.message.classList.add("is-error");
  }

  function clearError(view) {
    view.message.textContent = "";
    view.message.classList.remove("is-error");
  }

  function closeView(view) {
    if (view.secretNode) view.secretNode.textContent = "";
    view.input.value = "";
    view.factorHandle = "";
    restoreAdminSignIn(view.host);
  }

  function presentChallenge(challenge) {
    const view = buildCardView(challenge);
    const previousFocus = runtime.document.activeElement;

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        closeView(view);
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus();
        }
      };

      if (!view.enrollment) runtime.setTimeout(() => view.input.focus(), 0);

      view.setupContinue?.addEventListener("click", () => {
        view.setup?.classList.add("hidden");
        view.form.classList.remove("hidden");
        view.title.textContent = "Verify authenticator";
        view.description.textContent =
          "Enter the current six-digit code from your authenticator app.";
        runtime.setTimeout(() => view.input.focus(), 0);
      });

      view.backToSetup?.addEventListener("click", () => {
        clearError(view);
        view.input.value = "";
        view.form.classList.add("hidden");
        view.setup?.classList.remove("hidden");
        view.title.textContent = "Set up authenticator";
        view.description.textContent =
          "Scan the QR code, then enter the current six-digit code.";
        runtime.setTimeout(() => view.setupContinue?.focus(), 0);
      });

      view.breadcrumb.addEventListener("click", async () => {
        setBusy(view, true);
        await api().callAdminWebSessionLogout?.().catch?.(() => null);
        cleanup();
        reject(new Error("Administrator two-factor verification was canceled."));
      });

      view.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearError(view);
        const code = String(view.input.value || "").replace(/\D+/g, "");
        if (!/^\d{6}$/.test(code)) {
          showError(view, "Enter the six-digit code from your authenticator app.");
          view.input.focus();
          return;
        }

        setBusy(view, true);
        const verified = await api().callAdminMfaVerify?.(
          view.factorHandle,
          code
        );
        if (
          !verified?.ok ||
          verified?.session?.assuranceLevel !== "aal2" ||
          !CSRF_PATTERN.test(String(verified?.csrfToken || ""))
        ) {
          setBusy(view, false);
          showError(
            view,
            statusMessage(
              verified,
              "The authenticator code is invalid or expired."
            )
          );
          view.input.value = "";
          view.input.focus();
          return;
        }

        cleanup();
        resolve(verified);
      });
    });
  }

  async function buildChallenge() {
    const status = await api().callAdminMfaStatus?.();
    if (!status?.ok) {
      throw new Error(statusMessage(status, "Administrator MFA status could not be loaded."));
    }
    if (status.assuranceLevel === "aal2") {
      return { alreadyElevated: true, status };
    }

    const factors = Array.isArray(status.factors) ? status.factors : [];
    let factorHandle = validFactorHandle(
      factors.find((factor) => factor?.status === "verified")?.handle ||
      factors[0]?.handle
    );
    let qrCode = "";
    let secret = "";
    let enrollment = false;

    if (!factorHandle || status.needsEnrollment === true) {
      const enrolled = await api().callAdminMfaEnroll?.("Econovaria Admin");
      factorHandle = validFactorHandle(enrolled?.factor?.handle);
      qrCode = validQrCode(enrolled?.factor?.qrCode);
      secret = validSecret(enrolled?.factor?.secret);
      if (!enrolled?.ok || !factorHandle || !qrCode || !secret) {
        throw new Error(
          statusMessage(enrolled, "Authenticator enrollment could not be started.")
        );
      }
      enrollment = true;
    }

    return {
      alreadyElevated: false,
      factorHandle,
      enrollment,
      qrCode,
      secret
    };
  }

  async function ensureAal2(safeStatus) {
    if (safeStatus?.session?.assuranceLevel === "aal2") return safeStatus;
    if (activeChallenge) return activeChallenge;

    ensureStylesheet();
    activeChallenge = (async () => {
      const challenge = await buildChallenge();
      if (challenge.alreadyElevated) {
        const refreshed = await api().callAdminWebSessionStatus?.();
        if (!refreshed?.ok) {
          throw new Error("Administrator session status could not be refreshed.");
        }
        return refreshed;
      }
      return presentChallenge(challenge);
    })().finally(() => {
      activeChallenge = null;
    });
    return activeChallenge;
  }

  const { validTimeZone, reorderTimeZones, installCreateWizard } = window.createAdminMfaCreateWizard({
    runtime,
    createElement,
  });

  function initializeUiEnhancements() {
    ensureStylesheet();
    runtime.setTimeout(() => {
      reorderTimeZones();
      installCreateWizard();
    }, 0);
  }

  runtime.Econovaria.adminMfa = Object.freeze({
    ensureAal2
  });

  ensureStylesheet();
  if (runtime.document.readyState === "loading") {
    runtime.document.addEventListener(
      "DOMContentLoaded",
      initializeUiEnhancements,
      { once: true }
    );
  } else {
    initializeUiEnhancements();
  }
})(window);
