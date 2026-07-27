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

  function buildDialog({ enrollment, factorHandle, qrCode, secret }) {
    const overlay = createElement("div", "econovaria-mfa-overlay");
    const dialog = createElement("section", "econovaria-mfa-dialog");
    const eyebrow = createElement(
      "p",
      "econovaria-mfa-eyebrow",
      "Administrator security"
    );
    const title = createElement(
      "h2",
      "econovaria-mfa-title",
      enrollment ? "Set up two-factor authentication" : "Verify your identity"
    );
    const description = createElement(
      "p",
      "econovaria-mfa-description",
      enrollment
        ? "Scan the QR code with an authenticator app, then enter the current six-digit code. This is required before administrator changes are enabled."
        : "Enter the current six-digit code from your authenticator app to continue to the administrator console."
    );
    title.id = "econovariaMfaTitle";
    description.id = "econovariaMfaDescription";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", description.id);
    dialog.tabIndex = -1;
    overlay.append(dialog);
    dialog.append(eyebrow, title, description);

    let secretNode = null;
    if (enrollment) {
      const setup = createElement("div", "econovaria-mfa-setup");
      if (qrCode) {
        const qrWrap = createElement("div", "econovaria-mfa-qr-wrap");
        const image = createElement("img", "econovaria-mfa-qr");
        image.alt = "Authenticator enrollment QR code";
        image.src = qrCode;
        qrWrap.append(image);
        setup.append(qrWrap);
      }
      const secretWrap = createElement("div", "econovaria-mfa-secret-wrap");
      const secretLabel = createElement(
        "span",
        "econovaria-mfa-secret-label",
        "Manual setup key"
      );
      secretNode = createElement("code", "econovaria-mfa-secret", secret);
      secretWrap.append(secretLabel, secretNode);
      setup.append(secretWrap);
      dialog.append(setup);
    }

    const form = createElement("form", "econovaria-mfa-form");
    const label = createElement("label", "", "Six-digit authenticator code");
    const input = createElement("input", "econovaria-mfa-code");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.pattern = "[0-9]{6}";
    input.maxLength = 6;
    input.minLength = 6;
    input.required = true;
    input.setAttribute("aria-describedby", "econovariaMfaMessage");
    label.append(input);

    const message = createElement("p", "econovaria-mfa-message");
    message.id = "econovariaMfaMessage";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");

    const actions = createElement("div", "econovaria-mfa-actions");
    const submit = createElement(
      "button",
      "econovaria-mfa-submit",
      "Verify and continue"
    );
    submit.type = "submit";
    const cancel = createElement(
      "button",
      "econovaria-mfa-cancel",
      "Cancel and sign out"
    );
    cancel.type = "button";
    actions.append(submit, cancel);
    form.append(label, message, actions);
    dialog.append(form);

    return {
      overlay,
      dialog,
      form,
      input,
      message,
      submit,
      cancel,
      secretNode,
      factorHandle
    };
  }

  function focusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
  }

  function setBusy(view, busy) {
    view.input.disabled = busy;
    view.submit.disabled = busy;
    view.cancel.disabled = busy;
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
    view.overlay.remove();
  }

  function presentChallenge(challenge) {
    const view = buildDialog(challenge);
    runtime.document.body.append(view.overlay);
    const previousFocus = runtime.document.activeElement;

    return new Promise((resolve, reject) => {
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          showError(view, "Two-factor verification is required. Use Cancel and sign out to leave.");
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = focusableElements(view.dialog);
        if (!focusable.length) {
          event.preventDefault();
          view.dialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && runtime.document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && runtime.document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      const cleanup = () => {
        runtime.document.removeEventListener("keydown", onKeyDown, true);
        closeView(view);
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          previousFocus.focus();
        }
      };

      runtime.document.addEventListener("keydown", onKeyDown, true);
      runtime.setTimeout(() => view.input.focus(), 0);

      view.cancel.addEventListener("click", async () => {
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
      if (!enrolled?.ok || !factorHandle || !secret) {
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

  runtime.Econovaria.adminMfa = Object.freeze({
    ensureAal2
  });
})(window);
