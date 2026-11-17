import { AdminConfirmDialog, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

export function normalizeMessagesPolicy(result) {
  const policy = result?.data?.policy;
  if (!policy || typeof policy.playerThreadsEnabled !== "boolean"
    || policy.attachmentsEnabled !== false
    || !Number.isSafeInteger(policy.defaultRetentionDays)
    || policy.defaultRetentionDays < 1 || policy.defaultRetentionDays > 730
    || !Number.isSafeInteger(policy.maxParticipants) || policy.maxParticipants < 2) {
    throw new Error("INVALID_POLICY_RESPONSE");
  }
  return Object.freeze({ playerThreadsEnabled: policy.playerThreadsEnabled,
    defaultRetentionDays: policy.defaultRetentionDays, maxParticipants: policy.maxParticipants });
}

// The same element survives moderation refreshes. Drafts are memory-only and
// discarded on route/game exit; late requests never revive a discarded panel.
export function createMessagesPolicyPanel({ api, gameId, hasPermission }) {
  let destroyed = false, busy = false, loaded = false, confirmation = null;
  let request = null;
  const enabled = AdminField({ name: "playerThreadsEnabled", label: "Player-created conversations", type: "select",
    options: [{ value: "true", label: "Allowed" }, { value: "false", label: "Disabled" }], disabled: true });
  const days = AdminField({ name: "defaultRetentionDays", label: "Default retention days", type: "number", required: true, disabled: true });
  days.control.min = "1"; days.control.max = "730"; days.control.step = "1";
  const status = createElement("p", { attrs: { role: "status", "aria-live": "polite" }, text: "Load the current game policy before editing." });
  const limits = createElement("p", { text: "Attachments remain disabled. Retention controls the default for new conversations; this does not delete existing conversations." });
  const loadButton = createElement("button", { className: "admin-button admin-button--quiet", attrs: { type: "button" }, text: "Load policy" });
  const saveButton = createElement("button", { className: "admin-button", attrs: { type: "submit", disabled: true }, text: "Review policy changes" });
  const form = createElement("form", { children: [enabled.element, days.element, limits, status, loadButton, saveButton] });
  const element = createElement("details", { className: "admin-messages-route__policy", children: [
    createElement("summary", { text: "Messaging policy" }), form,
  ] });

  function permitted() { return !destroyed && hasPermission("messaging.moderate"); }
  function setBusy(value) {
    busy = value;
    loadButton.disabled = busy;
    saveButton.disabled = busy || !loaded;
    enabled.setDisabled(busy || !loaded);
    days.setDisabled(busy || !loaded);
  }
  function apply(policy) {
    enabled.control.value = String(policy.playerThreadsEnabled);
    days.control.value = String(policy.defaultRetentionDays);
    loaded = true;
    limits.textContent = `Player-created conversations support at most ${policy.maxParticipants} participants. Attachments remain disabled. Retention controls the default for new conversations; this does not delete existing conversations.`;
  }
  async function load() {
    if (!permitted() || busy) return;
    setBusy(true); status.textContent = "Loading current policy…";
    request = new AbortController();
    try {
      const policy = normalizeMessagesPolicy(await api.readPolicy({ gameId, signal: request.signal }));
      if (!permitted()) return;
      apply(policy); status.textContent = "Current game policy loaded.";
      loadButton.textContent = "Discard changes and reload";
    } catch {
      if (!destroyed) status.textContent = "Policy could not be loaded. Your existing draft has not changed. Retry loading before relying on it.";
    } finally { if (!destroyed) setBusy(false); }
  }
  loadButton.addEventListener("click", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!permitted() || !loaded || busy || confirmation) return;
    const value = days.getValue().trim();
    const retention = Number(value);
    if (!value || !Number.isSafeInteger(retention) || retention < 1 || retention > 730) {
      days.setError("Enter a whole number from 1 to 730."); days.focus(); return;
    }
    days.setError("");
    const policy = { playerThreadsEnabled: enabled.getValue() === "true", defaultRetentionDays: retention };
    confirmation = AdminConfirmDialog({ title: "Update messaging policy?",
      message: `Player-created conversations: ${policy.playerThreadsEnabled ? "allowed" : "disabled"}. Default retention: ${retention} days.`,
      detail: "This updates the selected game's policy for everyone. Attachments stay disabled; existing conversations are not deleted.",
      confirmLabel: "Save policy", failureMessage: "The policy could not be saved. Close this review and reload the current policy before trying again.",
      async onConfirm() {
        if (!permitted() || busy) return false;
        setBusy(true); request = new AbortController();
        try {
          const result = normalizeMessagesPolicy(await api.updatePolicy({ gameId, policy, signal: request.signal }));
          if (!permitted()) return false;
          apply(result); status.textContent = "Messaging policy saved.";
          return true;
        } catch {
          if (!destroyed) status.textContent = "Save not confirmed. Reload to check the authoritative policy before retrying.";
          throw new Error("POLICY_SAVE_NOT_CONFIRMED");
        } finally { if (!destroyed) setBusy(false); }
      },
    });
    const dialog = confirmation;
    await dialog.open(saveButton);
    dialog.destroy();
    if (confirmation === dialog) confirmation = null;
  });
  return { element, load, destroy() {
    if (destroyed) return;
    destroyed = true; request?.abort(); confirmation?.destroy(); confirmation = null;
  } };
}
