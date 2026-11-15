window.createInteractionFormValidation = function createInteractionFormValidation(ownerScope) {
  "use strict";

  const { FORM_CONFIGS, fieldIds, text } = ownerScope;


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
      fieldIds.set(control, `admin-qol-field-${++ownerScope.fieldSequence}`);
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

  return {
    formConfig, fieldControl, fieldContainer, ensureControlId, clearFieldError, setFieldError,
    formMessageElement, showFormMessage, clearFormMessage, validateStoreStock, validateForm,
  };
};
