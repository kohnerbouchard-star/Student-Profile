import { AdminIcon } from "./AdminIcon.js";
import { createElement, createId, replaceContent } from "./dom.js";

export function AdminValidationSummary({
  title = "Check the highlighted fields",
  errors = [],
} = {}) {
  const titleId = createId("admin-validation-title");
  const list = createElement("ul", { className: "admin-validation-summary__list" });
  const root = createElement("section", {
    className: "admin-validation-summary",
    attrs: { role: "alert", tabindex: "-1", "aria-labelledby": titleId },
  });
  root.append(
    createElement("div", { className: "admin-validation-summary__icon", children: AdminIcon({ name: "warning", size: 20 }) }),
    createElement("h3", { className: "admin-validation-summary__title", text: title, attrs: { id: titleId } }),
    list,
  );

  function setErrors(nextErrors = [], { focus = false } = {}) {
    replaceContent(list, nextErrors.map(({ fieldId, label, message }) => {
      const button = createElement("button", {
        className: "admin-validation-summary__link",
        attrs: { type: "button" },
        text: `${label ? `${label}: ` : ""}${message}`,
      });
      button.addEventListener("click", () => {
        const field = document.getElementById(fieldId);
        field?.focus({ preventScroll: false });
      });
      return createElement("li", { children: button });
    }));
    root.hidden = nextErrors.length === 0;
    if (focus && nextErrors.length > 0) root.focus();
  }

  setErrors(errors);
  return { element: root, setErrors, focus: () => root.focus() };
}
