import { appendContent, createElement, createId, setText } from "./dom.js";

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

  const input = createElement("input", {
    className: "admin-field__control",
    attrs: { type: type || "text", name, placeholder, autocomplete, value: value ?? "" },
  });
  return input;
}

export function AdminField({
  id = createId("admin-field"),
  name,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  type = "text",
  options,
  value,
  placeholder,
  autocomplete,
  control,
  prefix,
  suffix,
} = {}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const root = createElement("div", {
    className: "admin-field",
    dataset: { invalid: Boolean(error) },
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

  const input = control || createControl({
    type,
    options,
    name,
    value,
    placeholder,
    autocomplete,
  });
  input.id = id;
  input.disabled = disabled;
  input.required = required;
  input.classList.add("admin-field__control");

  const describedBy = [];
  if (hint) describedBy.push(hintId);
  if (error) describedBy.push(errorId);
  if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" "));
  input.setAttribute("aria-invalid", error ? "true" : "false");

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
  const errorElement = createElement("p", {
    className: "admin-field__error",
    text: error || "",
    attrs: { id: errorId },
  });
  errorElement.hidden = !error;
  root.append(hintElement, errorElement);

  function setError(nextError) {
    const hasError = Boolean(nextError);
    root.dataset.invalid = String(hasError);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    setText(errorElement, nextError);
    errorElement.hidden = !hasError;
    const ids = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean);
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  return {
    element: root,
    control: input,
    label: labelElement,
    setError,
    setDisabled(nextDisabled) { input.disabled = Boolean(nextDisabled); },
    setValue(nextValue) { input.value = nextValue ?? ""; },
    getValue() { return input.value; },
    focus() { input.focus(); },
  };
}
