(function initEconovariaAdminInteractionQuality() {
  "use strict";

  const MIN_SKELETON_MS = 260;
  const SUCCESS_HOLD_MS = 1400;
  const ERROR_HOLD_MS = 2600;
  const fieldIds = new WeakMap();
  const pendingActionContexts = new Map();
  const requestContexts = new Map();
  let fieldSequence = 0;
  let pendingPageReads = 0;
  let pageSkeletonShownAt = 0;
  let pageSkeletonTimer = null;
  let initialPageLoad = true;
  let navigationLoad = false;

  const FORM_CONFIGS = [
    {
      selector: "[data-admin-terminal-contract-form]",
      action: "create-contract",
      messageTarget: ".admin-terminal-contract-actions",
      fields: [
        { name: "title", label: "Contract title" },
        { name: "objective", label: "Objective" },
        { name: "instructions", label: "Instructions" },
        { name: "evidence", label: "Submission requirement" },
      ],
    },
    {
      selector: "[data-admin-terminal-player-form]",
      action: "create-player",
      messageTarget: ".admin-terminal-player-form-actions, .admin-terminal-contract-actions",
      fields: [{ name: "displayName", label: "Player name" }],
    },
    {
      selector: "[data-admin-terminal-store-form]",
      action: "save-store-item",
      messageTarget: ".admin-terminal-store-form-footer-v558, .admin-terminal-store-actions",
      fields: [
        { name: "itemName", label: "Item name" },
        { name: "description", label: "Player-facing description" },
        {
          name: "price",
          label: "Price",
          validate(value) {
            const amount = Number(value);
            if (value === "") return "Enter a price.";
            if (!Number.isFinite(amount) || amount < 0) {
              return "Enter a valid price of 0 or more.";
            }
            return "";
          },
        },
      ],
    },
  ];

  const ACTION_LABELS = {
    "create-contract": { loading: "Posting…", success: "Contract posted", error: "Post failed" },
    "create-player": { loading: "Creating…", success: "Player created", error: "Create failed" },
    "save-store-item": { loading: "Saving…", success: "Item created", error: "Save failed" },
    "submit-attendance-scan": { loading: "Scanning…", success: "Completed", error: "Scan failed" },
    "confirm-player-settings-save": { loading: "Saving…", success: "Saved", error: "Save failed" },
    "save-settings": { loading: "Saving…", success: "Saved", error: "Save failed" },
    "save-settings-group": { loading: "Saving…", success: "Saved", error: "Save failed" },
    "reset-settings-group": { loading: "Resetting…", success: "Reset", error: "Reset failed" },
    "review-contract-submission": { loading: "Processing…", success: "Completed", error: "Review failed" },
    "archive-contract": { loading: "Archiving…", success: "Archived", error: "Archive failed" },
    "duplicate-contract": { loading: "Duplicating…", success: "Duplicated", error: "Duplicate failed" },
    "restock-store-item": { loading: "Restocking…", success: "Restocked", error: "Restock failed" },
    "rebalance-store-price": { loading: "Updating…", success: "Updated", error: "Update failed" },
    "export-logs": { loading: "Preparing…", success: "Ready", error: "Export failed" },
  };

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }

  function actionLabels(action) {
    return ACTION_LABELS[action] || {
      loading: "Processing…",
      success: "Completed",
      error: "Action failed",
    };
  }

  function actionButton(action) {
    return document.querySelector(
      `[data-admin-terminal-action="${CSS.escape(action)}"]:not([hidden])`,
    );
  }

  function setButtonState(button, state, label) {
    if (!(button instanceof HTMLButtonElement) || !visible(button)) return;
    if (!button.dataset.adminQolOriginalDisabled) {
      button.dataset.adminQolOriginalDisabled = button.disabled ? "true" : "false";
    }
    let status = button.querySelector(":scope > .admin-qol-button-status");
    if (!status) {
      status = document.createElement("span");
      status.className = "admin-qol-button-status";
      status.setAttribute("aria-hidden", "true");
      button.append(status);
    }
    status.textContent = label;
    button.dataset.adminQolState = state;
    button.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (state === "loading") button.disabled = true;
    else button.disabled = button.dataset.adminQolOriginalDisabled === "true";
  }

  function clearButtonState(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.querySelector(":scope > .admin-qol-button-status")?.remove();
    delete button.dataset.adminQolState;
    button.removeAttribute("aria-busy");
    button.disabled = button.dataset.adminQolOriginalDisabled === "true";
    delete button.dataset.adminQolOriginalDisabled;
  }

  function holdButtonState(button, state, label, delay) {
    if (!(button instanceof HTMLButtonElement) || !button.isConnected) return;
    setButtonState(button, state, label);
    window.setTimeout(() => clearButtonState(button), delay);
  }

  function formConfig(form) {
    return FORM_CONFIGS.find((config) => form.matches(config.selector)) || null;
  }

  function fieldControl(form, name) {
    if (!form) return null;
    const named = form.elements?.namedItem(name);
    return named instanceof HTMLElement
      ? named
      : form.querySelector(`[name="${CSS.escape(name)}"]`);
  }

  function fieldContainer(control) {
    return control?.closest(".admin-terminal-field, label") || control?.parentElement || null;
  }

  function ensureControlId(control) {
    if (control.id) return control.id;
    if (!fieldIds.has(control)) {
      fieldIds.set(control, `admin-qol-field-${++fieldSequence}`);
    }
    control.id = fieldIds.get(control);
    return control.id;
  }

  function clearFieldError(control) {
    if (!(control instanceof HTMLElement)) return;
    const container = fieldContainer(control);
    container?.classList.remove("is-invalid");
    control.removeAttribute("aria-invalid");
    const errorId = control.dataset.adminQolErrorId;
    if (!errorId) return;
    document.getElementById(errorId)?.remove();
    const describedBy = text(control.getAttribute("aria-describedby"))
      .split(" ")
      .filter((value) => value && value !== errorId)
      .join(" ");
    if (describedBy) control.setAttribute("aria-describedby", describedBy);
    else control.removeAttribute("aria-describedby");
    delete control.dataset.adminQolErrorId;
  }

  function setFieldError(control, message) {
    if (!(control instanceof HTMLElement)) return;
    clearFieldError(control);
    const container = fieldContainer(control);
    container?.classList.add("is-invalid");
    control.setAttribute("aria-invalid", "true");
    const error = document.createElement("small");
    error.className = "admin-qol-field-error";
    error.id = `${ensureControlId(control)}-error`;
    error.setAttribute("role", "alert");
    error.textContent = message;
    container?.append(error);
    control.dataset.adminQolErrorId = error.id;
    const describedBy = new Set(
      text(control.getAttribute("aria-describedby")).split(" ").filter(Boolean),
    );
    describedBy.add(error.id);
    control.setAttribute("aria-describedby", [...describedBy].join(" "));
  }

  function formMessageElement(form, config) {
    let message = form.querySelector(".admin-qol-form-message");
    if (message) return message;
    message = document.createElement("div");
    message.className = "admin-qol-form-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const target = config?.messageTarget
      ? form.querySelector(config.messageTarget)
      : null;
    if (target?.parentNode) target.parentNode.insertBefore(message, target);
    else form.prepend(message);
    return message;
  }

  function showFormMessage(form, type, messageText) {
    if (!(form instanceof HTMLFormElement)) return;
    const message = formMessageElement(form, formConfig(form));
    message.dataset.state = type;
    message.textContent = messageText;
    message.hidden = false;
  }

  function clearFormMessage(form) {
    const message = form?.querySelector?.(".admin-qol-form-message");
    if (!message) return;
    message.hidden = true;
    message.textContent = "";
    delete message.dataset.state;
  }

  function validateStoreStock(form, invalid) {
    const stockMode = text(fieldControl(form, "stockMode")?.value);
    if (stockMode === "Limited") {
      const quantity = fieldControl(form, "stockQuantity");
      const value = Number(quantity?.value);
      if (!quantity?.value || !Number.isFinite(value) || value < 1) {
        setFieldError(quantity, "Enter a stock quantity of at least 1.");
        invalid.push(quantity);
      }
    }
    if (stockMode === "Country") {
      const countryInputs = [...form.querySelectorAll(
        "[data-admin-terminal-store-country-stock]",
      )];
      if (!countryInputs.some((input) => Number(input.value) > 0) && countryInputs[0]) {
        setFieldError(countryInputs[0], "Enter stock for at least one country.");
        invalid.push(countryInputs[0]);
      }
    }
  }

  function validateForm(form, options = {}) {
    const config = formConfig(form);
    if (!config) return true;
    const invalid = [];
    clearFormMessage(form);
    for (const rule of config.fields) {
      if (options.draftMode === true && rule.name !== "title") continue;
      const control = fieldControl(form, rule.name);
      if (!(control instanceof HTMLElement)) continue;
      clearFieldError(control);
      control.setAttribute("aria-required", "true");
      const value = text(control.value);
      const message = typeof rule.validate === "function"
        ? rule.validate(value, control, form)
        : value ? "" : `${rule.label} is required.`;
      if (message) {
        setFieldError(control, message);
        invalid.push(control);
      }
    }
    if (form.matches("[data-admin-terminal-store-form]")) {
      validateStoreStock(form, invalid);
    }
    if (!invalid.length) return true;
    showFormMessage(
      form,
      "error",
      `Complete ${invalid.length} required ${invalid.length === 1 ? "field" : "fields"} before continuing.`,
    );
    invalid[0].focus({ preventScroll: true });
    invalid[0].scrollIntoView({ block: "center", behavior: "smooth" });
    return false;
  }

  function scannerElements() {
    const consoleElement = document.querySelector(
      "[data-admin-terminal-scanner-console]",
    );
    if (!consoleElement) return null;
    return {
      consoleElement,
      state: consoleElement.querySelector("[data-admin-terminal-scanner-state]"),
      empty: consoleElement.querySelector("[data-admin-terminal-last-scan-empty]"),
      result: consoleElement.querySelector("[data-admin-terminal-last-scan-result]"),
      autoPanel: consoleElement.querySelector("[data-admin-terminal-auto-panel]"),
      manualPanel: consoleElement.querySelector("[data-admin-terminal-manual-panel]"),
      manualInput: consoleElement.querySelector("[data-admin-terminal-manual-scan-input]"),
      autoInput: consoleElement.querySelector("[data-admin-terminal-auto-scan-input]"),
    };
  }

  function setScannerPanel(panel, title, detail) {
    if (!panel) return;
    const strong = panel.querySelector("strong");
    const small = panel.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail;
  }

  function setScannerProcessing() {
    const elements = scannerElements();
    if (!elements) return;
    elements.consoleElement.dataset.adminQolScannerState = "processing";
    elements.consoleElement.setAttribute("aria-busy", "true");
    if (elements.state) elements.state.textContent = "Scanning";
    if (elements.empty) {
      elements.empty.hidden = false;
      elements.empty.querySelector("strong")?.replaceChildren("Scanning");
      elements.empty.querySelector("small")?.replaceChildren("Checking the player code…");
    }
    if (elements.result) elements.result.hidden = true;
    setScannerPanel(elements.autoPanel, "Processing", "Validating attendance…");
    setScannerPanel(elements.manualPanel, "Processing", "Validating attendance…");
  }

  function setScannerCompleted() {
    const elements = scannerElements();
    if (!elements) return;
    elements.consoleElement.dataset.adminQolScannerState = "completed";
    elements.consoleElement.removeAttribute("aria-busy");
    if (elements.state) elements.state.textContent = "Completed";
    setScannerPanel(elements.autoPanel, "Listening", "Ready for the next scan.");
    setScannerPanel(elements.manualPanel, "Manual entry", "Ready for the next code.");
    document.dispatchEvent(new CustomEvent("econovaria:admin-scanner-state", {
      detail: { state: "completed" },
    }));
  }

  function setScannerError(message) {
    const elements = scannerElements();
    if (!elements) return;
    elements.consoleElement.dataset.adminQolScannerState = "error";
    elements.consoleElement.removeAttribute("aria-busy");
    if (elements.state) elements.state.textContent = "Error";
    if (elements.empty) {
      elements.empty.hidden = false;
      elements.empty.querySelector("strong")?.replaceChildren("Scan failed");
      elements.empty.querySelector("small")?.replaceChildren(
        message || "Check the player code and try again.",
      );
    }
    if (elements.result) elements.result.hidden = true;
    setScannerPanel(elements.autoPanel, "Not submitted", "Check the code and try again.");
    setScannerPanel(elements.manualPanel, "Not submitted", "Check the code and try again.");
    (elements.manualInput || elements.autoInput)?.focus();
    document.dispatchEvent(new CustomEvent("econovaria:admin-scanner-state", {
      detail: { state: "error" },
    }));
  }

  function scannerCode() {
    const elements = scannerElements();
    return text(elements?.manualInput?.value || elements?.autoInput?.value);
  }

  function ensurePageSkeleton() {
    const main = document.querySelector(".admin-terminal-shell-main");
    if (!main) return null;
    let skeleton = main.querySelector(":scope > .admin-qol-page-skeleton");
    if (skeleton) return skeleton;
    skeleton = document.createElement("div");
    skeleton.className = "admin-qol-page-skeleton";
    skeleton.setAttribute("role", "status");
    skeleton.setAttribute("aria-label", "Loading administrator data");
    skeleton.innerHTML = `
      <div class="admin-qol-skeleton-head"><i></i><i></i></div>
      <div class="admin-qol-skeleton-grid"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <span class="admin-qol-sr-only">Loading administrator data</span>`;
    main.append(skeleton);
    return skeleton;
  }

  function showPageSkeleton() {
    const skeleton = ensurePageSkeleton();
    if (!skeleton) return;
    if (pageSkeletonTimer) window.clearTimeout(pageSkeletonTimer);
    pageSkeletonShownAt = Date.now();
    skeleton.hidden = false;
    skeleton.closest(".admin-terminal-shell-main")?.setAttribute("aria-busy", "true");
  }

  function hidePageSkeleton(force = false) {
    if (!force && pendingPageReads > 0) return;
    const skeleton = document.querySelector(".admin-qol-page-skeleton");
    if (!skeleton) return;
    const remaining = Math.max(
      0,
      MIN_SKELETON_MS - (Date.now() - pageSkeletonShownAt),
    );
    if (pageSkeletonTimer) window.clearTimeout(pageSkeletonTimer);
    pageSkeletonTimer = window.setTimeout(() => {
      if (!force && pendingPageReads > 0) return;
      skeleton.hidden = true;
      skeleton.closest(".admin-terminal-shell-main")?.removeAttribute("aria-busy");
      navigationLoad = false;
      initialPageLoad = false;
    }, remaining);
  }

  function rememberActionContext(action, button, form) {
    if (!action) return;
    const queue = pendingActionContexts.get(action) || [];
    queue.push({ action, button, form, capturedAt: Date.now() });
    pendingActionContexts.set(action, queue.slice(-4));
  }

  function consumeActionContext(action) {
    const queue = pendingActionContexts.get(action) || [];
    const context = queue.shift() || {
      action,
      button: actionButton(action),
      form: actionButton(action)?.closest("form") || null,
      capturedAt: Date.now(),
    };
    if (queue.length) pendingActionContexts.set(action, queue);
    else pendingActionContexts.delete(action);
    return context;
  }

  function beginLifecycle(detail) {
    if (detail.pageRead && (initialPageLoad || navigationLoad)) {
      pendingPageReads += 1;
      showPageSkeleton();
    }
    if (!detail.action || detail.action === "admin-read") return;
    const context = consumeActionContext(detail.action);
    requestContexts.set(detail.requestId, context);
    const labels = actionLabels(detail.action);
    if (detail.action === "submit-attendance-scan") setScannerProcessing();
    if (context.button) setButtonState(context.button, "loading", labels.loading);
    if (context.form) showFormMessage(context.form, "loading", labels.loading.replace("…", ""));
  }

  function finishLifecycle(detail) {
    if (detail.pageRead) {
      pendingPageReads = Math.max(0, pendingPageReads - 1);
      if (pendingPageReads === 0) hidePageSkeleton();
    }
    const context = requestContexts.get(detail.requestId);
    requestContexts.delete(detail.requestId);
    if (!context) return;
    const labels = actionLabels(context.action);
    const success = detail.phase === "committed";
    const message = text(detail.message) || (success ? labels.success : labels.error);
    if (context.action === "submit-attendance-scan") {
      if (success) setScannerCompleted();
      else setScannerError(message);
    }
    if (context.button) {
      holdButtonState(
        context.button,
        success ? "success" : "error",
        success ? labels.success : labels.error,
        success ? SUCCESS_HOLD_MS : ERROR_HOLD_MS,
      );
    }
    if (context.form) {
      showFormMessage(context.form, success ? "success" : "error", message);
    }
  }

  function handleRequestLifecycle(event) {
    const detail = event.detail && typeof event.detail === "object"
      ? event.detail
      : {};
    if (!text(detail.requestId)) return;
    if (detail.phase === "started") beginLifecycle(detail);
    else if (["committed", "failed", "cancelled"].includes(detail.phase)) {
      finishLifecycle(detail);
    }
  }

  function configureForm(form) {
    const config = formConfig(form);
    if (!config || form.dataset.adminQolConfigured === "true") return;
    form.dataset.adminQolConfigured = "true";
    form.setAttribute("novalidate", "novalidate");
    for (const rule of config.fields) {
      fieldControl(form, rule.name)?.setAttribute("aria-required", "true");
    }
  }

  function reconcile(root = document) {
    for (const config of FORM_CONFIGS) {
      root.querySelectorAll?.(config.selector).forEach(configureForm);
    }
    if (initialPageLoad && document.querySelector(".admin-terminal-shell-main")) {
      showPageSkeleton();
      window.setTimeout(() => {
        if (pendingPageReads === 0) hidePageSkeleton();
      }, 900);
    }
  }

  document.addEventListener("input", (event) => {
    const control = event.target instanceof HTMLElement ? event.target : null;
    if (!control) return;
    clearFieldError(control);
    const form = control.closest("form");
    if (form) clearFormMessage(form);
  }, true);

  document.addEventListener("change", (event) => {
    const control = event.target instanceof HTMLElement ? event.target : null;
    if (!control) return;
    clearFieldError(control);
    const form = control.closest("form");
    if (form) clearFormMessage(form);
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;
    const config = formConfig(form);
    if (!config) return;
    const submitter = event.submitter instanceof HTMLButtonElement
      ? event.submitter
      : form.querySelector('button[type="submit"]');
    const action = text(submitter?.dataset.adminTerminalAction) || config.action;
    const draftMode = action === "save-contract-draft";
    if (!validateForm(form, { draftMode })) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (submitter) {
        holdButtonState(submitter, "error", "Check required fields", ERROR_HOLD_MS);
      }
      return;
    }
    rememberActionContext(action, submitter, form);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const nav = target.closest("[data-admin-section]");
    if (nav && !nav.hasAttribute("disabled") && nav.getAttribute("aria-disabled") !== "true") {
      navigationLoad = true;
      showPageSkeleton();
      window.requestAnimationFrame(() => reconcile(document));
    }
    const button = target.closest("button");
    if (!(button instanceof HTMLButtonElement)) return;
    const action = text(button.dataset.adminTerminalAction);
    if (!action) return;
    if (action === "submit-attendance-scan" && !scannerCode()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const elements = scannerElements();
      const input = elements?.manualInput || elements?.autoInput;
      if (input) setFieldError(input, "Enter or scan a player code.");
      setScannerError("Enter or scan a player code.");
      holdButtonState(button, "error", "Code required", ERROR_HOLD_MS);
      return;
    }
    if (button.type !== "submit") {
      rememberActionContext(action, button, button.closest("form"));
    }
  }, true);

  document.addEventListener(
    "econovaria:admin-request-lifecycle",
    handleRequestLifecycle,
  );
  for (const eventName of [
    "econovaria:admin-route-mounted",
    "econovaria:admin-modal-mounted",
    "econovaria:admin-account-surface-ready",
  ]) {
    document.addEventListener(eventName, (event) => {
      const root = event.target instanceof Element ? event.target : document;
      window.requestAnimationFrame(() => reconcile(root));
    });
  }

  document.addEventListener("DOMContentLoaded", () => reconcile(document), {
    once: true,
  });
  reconcile(document);

  window.EconovariaAdminInteractionQuality = {
    validateForm,
    setScannerProcessing,
    setScannerCompleted,
    setScannerError,
    showPageSkeleton,
    hidePageSkeleton,
    notifyMounted(root = document) {
      reconcile(root);
    },
  };
})();
