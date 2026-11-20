import { AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function scannerPanel({ model, scanner, onScan }) {
  const input = createElement("input", {
    className: "admin-attendance-route__scanner-input",
    attrs: {
      id: "adminAttendanceScannerInput",
      name: "attendanceScan",
      type: "text",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      placeholder: "Scan RFID / player code",
      disabled: !scanner.accepting || model.lock.locked,
      "aria-describedby": "adminAttendanceScannerStatus",
    },
  });
  const submit = createElement("button", {
    className: "admin-button",
    attrs: { type: "submit", disabled: !scanner.accepting || model.lock.locked },
    children: [AdminIcon({ name: "attendance", size: 17 }), scanner.status === "submitting" ? "Checking…" : "Check In"],
  });
  const status = createElement("div", {
    className: "admin-attendance-route__scanner-status",
    dataset: { scannerStatus: scanner.status },
    attrs: { id: "adminAttendanceScannerStatus", role: "status", "aria-live": "polite" },
    children: [
      createElement("strong", { text: scanner.message }),
      scanner.detail ? createElement("span", { text: scanner.detail }) : null,
    ],
  });
  const form = createElement("form", {
    className: "admin-attendance-route__scanner-form",
    children: [
      createElement("label", { attrs: { for: input.id }, text: "RFID / scanner input" }),
      createElement("div", { className: "admin-attendance-route__scanner-controls", children: [input, submit] }),
    ],
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    submit.disabled = true;
    input.disabled = true;
    try {
      await onScan(value);
    } finally {
      if (input.isConnected) input.disabled = !scanner.accepting || model.lock.locked;
      if (submit.isConnected) submit.disabled = !scanner.accepting || model.lock.locked;
    }
  });

  if (scanner.accepting && !model.lock.locked) {
    queueMicrotask(() => input.isConnected && input.focus({ preventScroll: true }));
  }

  return createElement("section", {
    className: "admin-attendance-route__scanner",
    attrs: { "aria-label": "Attendance scanner" },
    children: [
      createElement("div", {
        className: "admin-attendance-route__section-heading",
        children: [
          createElement("div", { children: [
            createElement("h2", { text: "Scanner" }),
            createElement("p", { text: model.lock.locked ? "This attendance day is locked." : "Scan or enter an existing player credential. Enter submits from the keyboard." }),
          ] }),
          createElement("span", { className: "admin-attendance-route__date", text: `${model.attendanceDate} · ${model.timezone}` }),
        ],
      }),
      form,
      status,
    ],
  });
}
