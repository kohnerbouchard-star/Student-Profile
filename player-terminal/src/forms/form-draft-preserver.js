const MAX_FIELDS = 60;
const MAX_VALUE_LENGTH = 4000;
const SENSITIVE_NAME = /(?:access.?code|password|secret|token|authorization)/i;
const IDENTITY_ATTRIBUTES = Object.freeze([
  "contractId",
  "productId",
  "listingId",
  "recipeId",
  "offerId",
  "loanId",
  "threadId"
]);

function currentRoute() {
  return String(globalThis.location?.hash || "#dashboard").slice(1).split("?")[0] || "dashboard";
}

function formIdentity(form) {
  const parts = [currentRoute(), form.dataset.endpoint || form.dataset.playerForm || "form"];
  for (const attribute of IDENTITY_ATTRIBUTES) {
    const value = form.dataset[attribute];
    if (value) parts.push(`${attribute}:${value}`);
  }
  return parts.join("|");
}

function eligibleControl(control) {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
  if (!control.name || control.disabled || control.dataset.noDraft === "true") return false;
  if (SENSITIVE_NAME.test(control.name)) return false;
  if (control instanceof HTMLInputElement && ["file", "password", "hidden", "submit", "button", "reset"].includes(control.type)) return false;
  return true;
}

function serializeControl(control) {
  if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
    return { kind: control.type, checked: control.checked, value: control.value.slice(0, MAX_VALUE_LENGTH) };
  }
  if (control instanceof HTMLSelectElement && control.multiple) {
    return { kind: "multiple", values: [...control.selectedOptions].map((option) => option.value.slice(0, MAX_VALUE_LENGTH)) };
  }
  return { kind: "value", value: String(control.value || "").slice(0, MAX_VALUE_LENGTH) };
}

function captureForm(form) {
  const values = {};
  for (const control of [...form.elements].filter(eligibleControl).slice(0, MAX_FIELDS)) {
    const key = control.name;
    if (!values[key]) values[key] = [];
    values[key].push(serializeControl(control));
  }
  return values;
}

function restoreControl(control, saved) {
  if (!saved) return;
  if (saved.kind === "checkbox" || saved.kind === "radio") {
    control.checked = saved.checked === true;
    return;
  }
  if (saved.kind === "multiple" && control instanceof HTMLSelectElement) {
    const values = new Set(saved.values || []);
    [...control.options].forEach((option) => { option.selected = values.has(option.value); });
    return;
  }
  if (saved.kind === "value") control.value = saved.value || "";
}

function restoreForm(form, draft) {
  const positions = new Map();
  for (const control of [...form.elements].filter(eligibleControl)) {
    const index = positions.get(control.name) || 0;
    restoreControl(control, draft[control.name]?.[index]);
    positions.set(control.name, index + 1);
  }
  form.dispatchEvent(new Event("input", { bubbles: true }));
}

function mutationForm(record) {
  const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
  return target?.closest?.("form[data-player-form]") || null;
}

export function installFormDraftPreserver(mount, {
  sessionReadyEvent = "",
  sessionInvalidEvent = ""
} = {}) {
  if (!(mount instanceof HTMLElement)) return { destroy() {}, clear() {} };
  const drafts = new Map();
  let restoring = false;
  let restoreQueued = false;

  const capture = (event) => {
    if (restoring) return;
    const form = event.target.closest?.("[data-player-form]");
    if (!(form instanceof HTMLFormElement)) return;
    drafts.set(formIdentity(form), captureForm(form));
  };

  const restoreVisibleForms = () => {
    restoring = true;
    try {
      mount.querySelectorAll("form[data-player-form]").forEach((form) => {
        const draft = drafts.get(formIdentity(form));
        if (draft) restoreForm(form, draft);
      });
    } finally {
      restoring = false;
    }
  };

  const clearCompletedForms = (records) => {
    for (const record of records) {
      const form = mutationForm(record);
      if (!(form instanceof HTMLFormElement)) continue;
      const submit = form.querySelector('button[type="submit"]');
      if (submit && /\bCompleted\b/i.test(String(submit.textContent || ""))) {
        drafts.delete(formIdentity(form));
      }
    }
  };

  const observer = new MutationObserver((records) => {
    clearCompletedForms(records);
    if (restoreQueued) return;
    restoreQueued = true;
    queueMicrotask(() => {
      restoreQueued = false;
      restoreVisibleForms();
    });
  });

  const clearAll = () => drafts.clear();
  mount.addEventListener("input", capture, true);
  mount.addEventListener("change", capture, true);
  if (sessionReadyEvent) globalThis.addEventListener(sessionReadyEvent, clearAll);
  if (sessionInvalidEvent) globalThis.addEventListener(sessionInvalidEvent, clearAll);
  observer.observe(mount, { childList: true, subtree: true });
  restoreVisibleForms();

  return {
    clear(form) {
      if (form instanceof HTMLFormElement) drafts.delete(formIdentity(form));
      else drafts.clear();
    },
    destroy() {
      observer.disconnect();
      mount.removeEventListener("input", capture, true);
      mount.removeEventListener("change", capture, true);
      if (sessionReadyEvent) globalThis.removeEventListener(sessionReadyEvent, clearAll);
      if (sessionInvalidEvent) globalThis.removeEventListener(sessionInvalidEvent, clearAll);
      drafts.clear();
    }
  };
}
