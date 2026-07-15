(function initEconovariaAdminInteractionQuality() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  const ADMIN_LOCAL_PREFIX = "/api/admin";
  const ADMIN_EDGE_FRAGMENT = "/functions/v1/admin-api/";
  const CLASSROOM_EDGE_FRAGMENT = "/functions/v1/classroom-api/";
  const MIN_SKELETON_MS = 260;
  const SUCCESS_HOLD_MS = 1400;
  const ERROR_HOLD_MS = 2600;
  const fieldIds = new WeakMap();
  let fieldSequence = 0;
  let activeAction = null;
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
      fields: [
        { name: "displayName", label: "Player name" },
      ],
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
            if (!Number.isFinite(amount) || amount < 0) return "Enter a valid price of 0 or more.";
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

  function safeJson(response) {
    try {
      return response.clone().json().catch(() => ({}));
    } catch (_) {
      return Promise.resolve({});
    }
  }

  function responseMessage(payload, fallback) {
    const source = payload && typeof payload === "object" ? payload : {};
    return text(
      source.message || source.error?.message || source.error || source.detail ||
      source.data?.message || source.data?.error?.message || fallback,
    );
  }

  function requestUrl(input) {
    try {
      return new URL(input instanceof Request ? input.url : String(input), window.location.href);
    } catch (_) {
      return null;
    }
  }

  async function requestBody(input, init) {
    try {
      const rawUrl = input instanceof Request ? input.url : new URL(String(input), window.location.href).href;
      const request = input instanceof Request ? new Request(input, init) : new Request(rawUrl, init);
      if (["GET", "HEAD"].includes(request.method.toUpperCase())) return {};
      const value = await request.clone().json();
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function isAdminRequest(url) {
    if (!url) return false;
    return url.pathname.startsWith(ADMIN_LOCAL_PREFIX) ||
      url.pathname.includes(ADMIN_EDGE_FRAGMENT) ||
      url.pathname.includes(CLASSROOM_EDGE_FRAGMENT);
  }

  function inferAction(body, url, method) {
    const direct = text(body.action || body.adminOperation || body.operation);
    if (direct) return direct;
    const pathname = url?.pathname || "";
    if (/\/attendance\/(?:scan|scans)$/.test(pathname) && method === "POST") return "submit-attendance-scan";
    if (/\/contracts$/.test(pathname) && method === "POST") return "create-contract";
    if (/\/players$/.test(pathname) && method === "POST") return "create-player";
    if (/\/store\/items$/.test(pathname) && method === "POST") return "save-store-item";
    if (/\/review$/.test(pathname) && ["POST", "PATCH"].includes(method)) return "review-contract-submission";
    if (/\/logs\/export/.test(pathname)) return "export-logs";
    return activeAction?.action || "admin-write";
  }

  function actionLabels(action) {
    return ACTION_LABELS[action] || { loading: "Processing…", success: "Completed", error: "Action failed" };
  }

  function actionButton(action) {
    if (activeAction?.button?.isConnected && (!action || activeAction.action === action)) return activeAction.button;
    return document.querySelector(`[data-admin-terminal-action="${CSS.escape(action)}"]:not([hidden])`);
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
    if (state !== "loading") button.disabled = button.dataset.adminQolOriginalDisabled === "true";
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
    return form.elements?.namedItem(name) instanceof HTMLElement
      ? form.elements.namedItem(name)
      : form.querySelector(`[name="${CSS.escape(name)}"]`);
  }

  function fieldContainer(control) {
    return control?.closest(".admin-terminal-field, label") || control?.parentElement || null;
  }

  function ensureControlId(control) {
    if (control.id) return control.id;
    if (!fieldIds.has(control)) fieldIds.set(control, `admin-qol-field-${++fieldSequence}`);
    control.id = fieldIds.get(control);
    return control.id;
  }

  function clearFieldError(control) {
    if (!(control instanceof HTMLElement)) return;
    const container = fieldContainer(control);
    container?.classList.remove("is-invalid");
    control.removeAttribute("aria-invalid");
    const errorId = control.dataset.adminQolErrorId;
    if (errorId) {
      document.getElementById(errorId)?.remove();
      const describedBy = text(control.getAttribute("aria-describedby"))
        .split(" ").filter((value) => value && value !== errorId).join(" ");
      if (describedBy) control.setAttribute("aria-describedby", describedBy);
      else control.removeAttribute("aria-describedby");
      delete control.dataset.adminQolErrorId;
    }
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
    const describedBy = new Set(text(control.getAttribute("aria-describedby")).split(" ").filter(Boolean));
    describedBy.add(error.id);
    control.setAttribute("aria-describedby", [...describedBy].join(" "));
  }

  function formMessageElement(form, config) {
    let message = form.querySelector(":scope > .admin-qol-form-message, .admin-qol-form-message");
    if (message) return message;
    message = document.createElement("div");
    message.className = "admin-qol-form-message";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const target = config?.messageTarget ? form.querySelector(config.messageTarget) : null;
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
    if (message) {
      message.hidden = true;
      message.textContent = "";
      delete message.dataset.state;
    }
  }

  function defaultValidationMessage(rule, value) {
    if (text(value)) return "";
    return `${rule.label} is required.`;
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
      const countryInputs = [...form.querySelectorAll("[data-admin-terminal-store-country-stock]")];
      const hasStock = countryInputs.some((input) => Number(input.value) > 0);
      if (!hasStock && countryInputs[0]) {
        setFieldError(countryInputs[0], "Enter stock for at least one country.");
        invalid.push(countryInputs[0]);
      }
    }
  }

  function validateForm(form, options = {}) {
    const config = formConfig(form);
    if (!config) return true;
    const draftMode = options.draftMode === true;
    const invalid = [];
    clearFormMessage(form);

    for (const rule of config.fields) {
      if (draftMode && rule.name !== "title") continue;
      const control = fieldControl(form, rule.name);
      if (!(control instanceof HTMLElement)) continue;
      clearFieldError(control);
      control.setAttribute("aria-required", "true");
      const value = text(control.value);
      const message = typeof rule.validate === "function"
        ? rule.validate(value, control, form)
        : defaultValidationMessage(rule, value);
      if (message) {
        setFieldError(control, message);
        invalid.push(control);
      }
    }

    if (form.matches("[data-admin-terminal-store-form]")) validateStoreStock(form, invalid);

    if (invalid.length) {
      showFormMessage(
        form,
        "error",
        `Complete ${invalid.length} required ${invalid.length === 1 ? "field" : "fields"} before continuing.`,
      );
      invalid[0].focus({ preventScroll: true });
      invalid[0].scrollIntoView({ block: "center", behavior: "smooth" });
      return false;
    }
    return true;
  }

  function validateMaterialBuilder(button) {
    const builder = button.closest("[data-admin-terminal-contract-material-builder]");
    if (!builder || builder.hidden) return true;
    const title = builder.querySelector('[name="materialTitle"]');
    const type = text(builder.querySelector('input[type="hidden"]')?.value).toLowerCase();
    const invalid = [];
    if (title && !text(title.value)) {
      setFieldError(title, "Material title is required.");
      invalid.push(title);
    }
    if (type === "link") {
      const url = builder.querySelector('[name="materialUrl"]');
      let valid = false;
      try {
        valid = ["http:", "https:"].includes(new URL(text(url?.value)).protocol);
      } catch (_) {}
      if (!valid) {
        setFieldError(url, "Enter a valid http or https link.");
        invalid.push(url);
      }
    }
    if (invalid.length) {
      invalid[0].focus();
      return false;
    }
    return true;
  }

  function validateSchedule(button) {
    const picker = button.closest("[data-admin-terminal-contract-schedule-picker]") ||
      document.querySelector("[data-admin-terminal-contract-schedule-picker]:not([hidden])");
    if (!picker) return true;
    const date = picker.querySelector('input[type="date"]');
    const time = picker.querySelector('input[type="time"]');
    const invalid = [];
    for (const [control, message] of [[date, "Choose a posting date."], [time, "Choose a posting time."]]) {
      if (control && !text(control.value)) {
        setFieldError(control, message);
        invalid.push(control);
      }
    }
    if (invalid.length) {
      invalid[0].focus();
      return false;
    }
    return true;
  }

  function scannerElements() {
    const consoleElement = document.querySelector("[data-admin-terminal-scanner-console]");
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
    if (elements.state) elements.state.textContent = "Scanning";
    if (elements.empty) {
      elements.empty.hidden = false;
      const strong = elements.empty.querySelector("strong");
      const small = elements.empty.querySelector("small");
      if (strong) strong.textContent = "Scanning";
      if (small) small.textContent = "Checking the player code…";
    }
    if (elements.result) elements.result.hidden = true;
    setScannerPanel(elements.autoPanel, "Processing", "Validating attendance…");
    setScannerPanel(elements.manualPanel, "Processing", "Validating attendance…");
    elements.consoleElement.setAttribute("aria-busy", "true");
  }

  function setScannerCompleted() {
    window.setTimeout(() => {
      const elements = scannerElements();
      if (!elements) return;
      elements.consoleElement.dataset.adminQolScannerState = "completed";
      elements.consoleElement.removeAttribute("aria-busy");
      if (elements.state) elements.state.textContent = "Completed";
      setScannerPanel(elements.autoPanel, "Listening", "Ready for the next scan.");
      setScannerPanel(elements.manualPanel, "Manual entry", "Ready for the next code.");
      window.setTimeout(() => {
        const current = scannerElements();
        if (!current || current.consoleElement.dataset.adminQolScannerState !== "completed") return;
        delete current.consoleElement.dataset.adminQolScannerState;
        if (current.state) current.state.textContent = "Armed";
        setScannerPanel(current.autoPanel, "Listening", "Auto-submit is active.");
        setScannerPanel(current.manualPanel, "Manual entry", "Fallback mode");
      }, 1800);
    }, 80);
  }

  function setScannerError(message) {
    window.setTimeout(() => {
      const elements = scannerElements();
      if (!elements) return;
      elements.consoleElement.dataset.adminQolScannerState = "error";
      elements.consoleElement.removeAttribute("aria-busy");
      if (elements.state) elements.state.textContent = "Error";
      if (elements.empty) {
        elements.empty.hidden = false;
        const strong = elements.empty.querySelector("strong");
        const small = elements.empty.querySelector("small");
        if (strong) strong.textContent = "Scan failed";
        if (small) small.textContent = message || "Check the player code and try again.";
      }
      if (elements.result) elements.result.hidden = true;
      setScannerPanel(elements.autoPanel, "Not submitted", "Check the code and try again.");
      setScannerPanel(elements.manualPanel, "Not submitted", "Check the code and try again.");
      (elements.manualInput || elements.autoInput)?.focus();
    }, 80);
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
      <div class="admin-qol-skeleton-grid">
        <i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
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
    const remaining = Math.max(0, MIN_SKELETON_MS - (Date.now() - pageSkeletonShownAt));
    if (pageSkeletonTimer) window.clearTimeout(pageSkeletonTimer);
    pageSkeletonTimer = window.setTimeout(() => {
      if (!force && pendingPageReads > 0) return;
      skeleton.hidden = true;
      skeleton.closest(".admin-terminal-shell-main")?.removeAttribute("aria-busy");
      navigationLoad = false;
      initialPageLoad = false;
    }, remaining);
  }

  function beginPageRead() {
    pendingPageReads += 1;
    if (initialPageLoad || navigationLoad) showPageSkeleton();
  }

  function finishPageRead() {
    pendingPageReads = Math.max(0, pendingPageReads - 1);
    if (pendingPageReads === 0) hidePageSkeleton();
  }

  function configureForm(form) {
    const config = formConfig(form);
    if (!config || form.dataset.adminQolConfigured === "true") return;
    form.dataset.adminQolConfigured = "true";
    form.setAttribute("novalidate", "novalidate");
    for (const rule of config.fields) {
      const control = fieldControl(form, rule.name);
      if (control instanceof HTMLElement) control.setAttribute("aria-required", "true");
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
    if (!validateForm(form)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (submitter) holdButtonState(submitter, "error", "Check required fields", ERROR_HOLD_MS);
      return;
    }
    activeAction = { action, button: submitter, form, startedAt: Date.now() };
    if (submitter) setButtonState(submitter, "loading", actionLabels(action).loading);
    showFormMessage(form, "loading", actionLabels(action).loading.replace("…", ""));
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const nav = target?.closest("[data-admin-section]");
    if (nav && !nav.hasAttribute("disabled") && nav.getAttribute("aria-disabled") !== "true") {
      navigationLoad = true;
      showPageSkeleton();
      window.setTimeout(() => hidePageSkeleton(), 800);
    }

    const button = target?.closest("button");
    if (!(button instanceof HTMLButtonElement)) return;
    const action = text(button.dataset.adminTerminalAction);
    if (!action) return;

    if (action === "save-contract-material-builder" && !validateMaterialBuilder(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      holdButtonState(button, "error", "Check required fields", ERROR_HOLD_MS);
      return;
    }

    if (action === "confirm-contract-schedule" && !validateSchedule(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      holdButtonState(button, "error", "Choose date and time", ERROR_HOLD_MS);
      return;
    }

    if (action === "save-contract-draft") {
      const form = button.closest("form");
      if (form && !validateForm(form, { draftMode: true })) {
        event.preventDefault();
        event.stopImmediatePropagation();
        holdButtonState(button, "error", "Add a title", ERROR_HOLD_MS);
        return;
      }
    }

    if (action === "submit-attendance-scan") {
      if (!scannerCode()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const elements = scannerElements();
        const input = elements?.manualInput || elements?.autoInput;
        if (input) setFieldError(input, "Enter or scan a player code.");
        setScannerError("Enter or scan a player code.");
        holdButtonState(button, "error", "Code required", ERROR_HOLD_MS);
        return;
      }
      setScannerProcessing();
    }

    if (button.type !== "submit") {
      activeAction = { action, button, form: button.closest("form"), startedAt: Date.now() };
    }
  }, true);

  window.fetch = async function econovariaAdminQualityFetch(input, init) {
    const url = requestUrl(input);
    const method = text(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() || "GET";
    const relevant = isAdminRequest(url);
    const pageRead = relevant && method === "GET" && (initialPageLoad || navigationLoad);
    const body = relevant && method !== "GET" && method !== "HEAD" ? await requestBody(input, init) : {};
    const action = relevant && method !== "GET" && method !== "HEAD" ? inferAction(body, url, method) : "";
    const labels = actionLabels(action);
    const button = action ? actionButton(action) : null;
    const form = activeAction?.form?.isConnected ? activeAction.form : button?.closest("form");

    if (pageRead) beginPageRead();
    if (action) {
      if (action === "submit-attendance-scan") setScannerProcessing();
      if (button) setButtonState(button, "loading", labels.loading);
      if (form) showFormMessage(form, "loading", labels.loading.replace("…", ""));
    }

    try {
      const response = await delegatedFetch(input, init);
      const payload = action ? await safeJson(response) : {};
      if (pageRead) finishPageRead();

      if (action) {
        if (response.ok) {
          if (action === "submit-attendance-scan") setScannerCompleted();
          if (button) holdButtonState(button, "success", labels.success, SUCCESS_HOLD_MS);
          if (form) showFormMessage(form, "success", labels.success);
        } else {
          const message = responseMessage(payload, labels.error);
          if (action === "submit-attendance-scan") setScannerError(message);
          if (button) holdButtonState(button, "error", labels.error, ERROR_HOLD_MS);
          if (form) showFormMessage(form, "error", message);
        }
      }
      return response;
    } catch (error) {
      if (pageRead) finishPageRead();
      if (action) {
        const message = text(error?.message) || labels.error;
        if (action === "submit-attendance-scan") setScannerError(message);
        if (button) holdButtonState(button, "error", labels.error, ERROR_HOLD_MS);
        if (form) showFormMessage(form, "error", message);
      }
      throw error;
    } finally {
      if (activeAction && Date.now() - activeAction.startedAt > 300) {
        window.setTimeout(() => {
          if (activeAction && Date.now() - activeAction.startedAt > 1000) activeAction = null;
        }, 1000);
      }
    }
  };

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      const hasAddedElements = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => node instanceof Element)
      );
      if (hasAddedElements) window.requestAnimationFrame(() => reconcile(document));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminInteractionQuality = {
    validateForm,
    setScannerProcessing,
    setScannerCompleted,
    setScannerError,
    showPageSkeleton,
    hidePageSkeleton,
  };
})();
