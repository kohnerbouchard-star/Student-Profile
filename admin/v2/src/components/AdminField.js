import { appendContent, createElement, createId, setText } from "./dom.js";

function setOptionalAttribute(element, name, value) {
  if (value === undefined || value === null || value === false || value === "") {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value === true ? "" : String(value));
}

function createControl({ type, options, name, value, placeholder, autocomplete }) {
  if (type === "textarea") {
    const textarea = createElement("textarea", {
      className: "admin-field__control",
      attrs: { name, placeholder, autocomplete },
    });
    textarea.value = value ?? "";
    return textarea;
  }

  if (type === "select") {
    const select = createElement("select", {
      className: "admin-field__control",
      attrs: { name, autocomplete },
    });
    (options || []).forEach((option) => {
      const optionElement = createElement("option", {
        text: option.label,
        attrs: { value: option.value, disabled: option.disabled },
      });
      optionElement.selected = String(option.value) === String(value ?? "");
      select.append(optionElement);
    });
    return select;
  }

  return createElement("input", {
    className: "admin-field__control",
    attrs: { type: type || "text", name, placeholder, autocomplete, value: value ?? "" },
  });
}

export function AdminField({
  id = createId("admin-field"),
  name,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  disabledReason = "",
  readOnly = false,
  readOnlyReason = "",
  type = "text",
  options,
  value,
  placeholder,
  autocomplete,
  control,
  prefix,
  suffix,
  min,
  max,
  step,
  minLength,
  maxLength,
  pattern,
  inputMode,
  rows,
  ariaLabel,
} = {}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const stateId = `${id}-state`;
  const root = createElement("div", {
    className: "admin-field",
    dataset: {
      invalid: Boolean(error),
      state: disabled ? "unavailable" : readOnly ? "readonly" : "editable",
    },
  });
  const labelElement = createElement("label", {
    className: "admin-field__label",
    attrs: { for: id },
  });
  labelElement.append(document.createTextNode(label || name || "Field"));
  if (required) {
    labelElement.append(createElement("span", {
      className: "admin-field__required",
      text: "Required",
    }));
  }
  const stateBadge = createElement("span", {
    className: "admin-field__state",
  });
  labelElement.append(stateBadge);

  const input = control || createControl({
    type,
    options,
    name,
    value,
    placeholder,
    autocomplete,
  });
  input.id = id;
  input.required = required;
  input.classList.add("admin-field__control");
  setOptionalAttribute(input, "min", min);
  setOptionalAttribute(input, "max", max);
  setOptionalAttribute(input, "step", step);
  setOptionalAttribute(input, "minlength", minLength);
  setOptionalAttribute(input, "maxlength", maxLength);
  setOptionalAttribute(input, "pattern", pattern);
  setOptionalAttribute(input, "inputmode", inputMode);
  setOptionalAttribute(input, "rows", rows);
  setOptionalAttribute(input, "aria-label", ariaLabel);

  const controlFrame = createElement("div", { className: "admin-field__control-frame" });
  if (prefix) appendContent(controlFrame, createElement("span", { className: "admin-field__prefix", children: prefix }));
  controlFrame.append(input);
  if (suffix) appendContent(controlFrame, createElement("span", { className: "admin-field__suffix", children: suffix }));
  root.append(labelElement, controlFrame);

  const hintElement = createElement("p", {
    className: "admin-field__hint",
    text: hint || "",
    attrs: { id: hintId },
  });
  hintElement.hidden = !hint;
  const stateElement = createElement("p", {
    className: "admin-field__availability",
    attrs: { id: stateId },
  });
  const errorElement = createElement("p", {
    className: "admin-field__error",
    text: error || "",
    attrs: { id: errorId },
  });
  errorElement.hidden = !error;
  root.append(hintElement, stateElement, errorElement);

  let selectReadOnlyValue = input.value;
  const preserveReadOnlySelect = () => {
    if (root.dataset.state !== "readonly" || input.tagName !== "SELECT") return;
    input.value = selectReadOnlyValue;
  };
  input.addEventListener("change", preserveReadOnlySelect);
  input.addEventListener("keydown", (event) => {
    if (root.dataset.state !== "readonly" || input.tagName !== "SELECT" || event.key === "Tab") return;
    event.preventDefault();
  });

  function refreshDescribedBy(hasError = Boolean(error)) {
    const ids = [
      hint ? hintId : null,
      stateElement.hidden ? null : stateId,
      hasError ? errorId : null,
    ].filter(Boolean);
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  function setAvailability({ unavailable = false, unavailableReason = "", readonly = false, readonlyReason = "" } = {}) {
    const nextState = unavailable ? "unavailable" : readonly ? "readonly" : "editable";
    root.dataset.state = nextState;
    const reason = unavailable ? unavailableReason : readonly ? readonlyReason : "";
    const stateLabel = unavailable ? "Unavailable" : readonly ? "Read only" : "";
    setText(stateBadge, stateLabel);
    stateBadge.hidden = !stateLabel;
    setText(stateElement, reason);
    stateElement.hidden = !reason;

    input.disabled = unavailable;
    if (input.tagName === "SELECT") {
      input.removeAttribute("readonly");
      input.setAttribute("aria-readonly", readonly ? "true" : "false");
      if (readonly) selectReadOnlyValue = input.value;
    } else {
      input.readOnly = readonly;
      input.setAttribute("aria-readonly", readonly ? "true" : "false");
    }
    refreshDescribedBy(input.getAttribute("aria-invalid") === "true");
  }

  function setError(nextError) {
    const hasError = Boolean(nextError);
    root.dataset.invalid = String(hasError);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    setText(errorElement, nextError);
    errorElement.hidden = !hasError;
    refreshDescribedBy(hasError);
  }

  setAvailability({
    unavailable: Boolean(disabled),
    unavailableReason: disabledReason,
    readonly: Boolean(readOnly),
    readonlyReason: readOnlyReason,
  });
  setError(error || "");

  return {
    element: root,
    control: input,
    label: labelElement,
    setError,
    setDisabled(nextDisabled, reason = disabledReason) {
      disabled = Boolean(nextDisabled);
      disabledReason = reason || "";
      setAvailability({
        unavailable: disabled,
        unavailableReason: disabledReason,
        readonly: readOnly,
        readonlyReason: readOnlyReason,
      });
    },
    setReadOnly(nextReadOnly, reason = readOnlyReason) {
      readOnly = Boolean(nextReadOnly);
      readOnlyReason = reason || "";
      setAvailability({
        unavailable: disabled,
        unavailableReason: disabledReason,
        readonly: readOnly,
        readonlyReason: readOnlyReason,
      });
    },
    setAvailability,
    setValue(nextValue) {
      input.value = nextValue ?? "";
      if (root.dataset.state === "readonly" && input.tagName === "SELECT") {
        selectReadOnlyValue = input.value;
      }
    },
    getValue() { return input.value; },
    focus() { input.focus(); },
  };
}
