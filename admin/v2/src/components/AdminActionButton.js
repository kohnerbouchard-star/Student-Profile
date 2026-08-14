import { AdminIcon } from "./AdminIcon.js";
import { createElement, createId, setText } from "./dom.js";

export function AdminActionButton({
  label,
  icon = null,
  quiet = false,
  tone = null,
  disabled = false,
  disabledReason = "",
  busy = false,
  busyLabel = "Working…",
  type = "button",
  action = "",
  dataset = {},
  onClick,
} = {}) {
  const reasonId = createId("admin-action-reason");
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: {
      type,
      disabled: disabled || busy,
      "aria-describedby": disabledReason ? reasonId : null,
      "aria-busy": busy ? "true" : "false",
    },
    dataset: { ...dataset, tone, action },
  });
  const reason = createElement("small", {
    className: "admin-action-control__reason",
    attrs: { id: reasonId },
    text: disabledReason || "",
  });
  reason.hidden = !disabledReason;
  const root = createElement("span", {
    className: "admin-action-control",
    dataset: { disabled: disabled || busy },
    children: [button, reason],
  });

  function render() {
    button.replaceChildren(...[
      icon ? AdminIcon({ name: icon, size: 17 }) : null,
      document.createTextNode(busy ? busyLabel : label || "Action"),
    ].filter(Boolean));
  }

  render();
  if (typeof onClick === "function") button.addEventListener("click", onClick);

  return {
    element: root,
    button,
    setBusy(nextBusy, nextBusyLabel = busyLabel) {
      busy = Boolean(nextBusy);
      busyLabel = nextBusyLabel || busyLabel;
      button.disabled = disabled || busy;
      button.setAttribute("aria-busy", busy ? "true" : "false");
      root.dataset.disabled = String(disabled || busy);
      render();
    },
    setDisabled(nextDisabled, nextReason = disabledReason) {
      disabled = Boolean(nextDisabled);
      disabledReason = nextReason || "";
      button.disabled = disabled || busy;
      if (disabledReason) button.setAttribute("aria-describedby", reasonId);
      else button.removeAttribute("aria-describedby");
      setText(reason, disabledReason);
      reason.hidden = !disabledReason;
      root.dataset.disabled = String(disabled || busy);
    },
    setLabel(nextLabel) {
      label = String(nextLabel || "Action");
      render();
    },
  };
}
