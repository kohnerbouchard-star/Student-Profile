import { AdminDialog, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { GAME_LIFECYCLE_ACTIONS, GAME_LIFECYCLE_LABELS } from "../../api/game-lifecycle-model.js";

export function GameLifecyclePanel({ controller, hasPermission = () => false } = {}) {
  let dialog = null;
  let gameName = "Selected game";
  const root = createElement("section", {
    className: "admin-overview-route__panel admin-u-stack",
    attrs: { "aria-label": "Game lifecycle" },
  });
  function button(label, onClick, { disabled = false, danger = false } = {}) {
    const result = createElement("button", {
      className: "admin-button admin-button--quiet",
      attrs: { type: "button", disabled },
      dataset: danger ? { tone: "danger" } : {}, text: label,
    });
    result.addEventListener("click", onClick);
    return result;
  }
  function closeReview() {
    controller.cancelReview();
    dialog?.destroy();
    dialog = null;
  }
  function review(action, opener) {
    if (dialog || !root.isConnected) return;
    const intent = controller.prepare(action);
    if (!intent) return;
    const definition = GAME_LIFECYCLE_ACTIONS[action];
    const phrase = definition.phrase ? AdminField({ label: `Type ${definition.phrase} to confirm`, autocomplete: "off" }) : null;
    const error = createElement("p", { attrs: { role: "alert" } });
    const confirm = button(definition.label, async () => {
      if (confirm.disabled || (phrase && phrase.control.value.trim().toUpperCase() !== definition.phrase)) return;
      const currentDialog = dialog;
      currentDialog.setBusy(true);
      phrase?.setDisabled(true);
      await controller.apply(intent);
      // Navigation may have destroyed this review while the server completed.
      if (dialog === currentDialog) closeReview();
    }, { danger: Boolean(phrase), disabled: Boolean(phrase) });
    const cancel = button("Cancel", closeReview);
    confirm.dataset.dialogAction = "confirm";
    cancel.dataset.dialogAction = "cancel";
    phrase?.control.addEventListener("input", () => {
      confirm.disabled = phrase.control.value.trim().toUpperCase() !== definition.phrase;
    });
    dialog = AdminDialog({
      title: definition.label, description: definition.message, role: "alertdialog", size: "small",
      protectUnsavedChanges: false, closeOnBackdrop: false,
      content: [createElement("p", { text: `Game: ${gameName}` }),
        createElement("p", { text: `Reviewing lifecycle version ${intent.expectedVersion}.` }), phrase?.element, error],
      footer: createElement("div", { className: "admin-confirm-dialog__actions", children: [cancel, confirm] }),
      initialFocus: cancel,
      onClose() { controller.cancelReview(); const closed = dialog; dialog = null; queueMicrotask(() => closed?.destroy()); },
    });
    dialog.open(opener);
  }
  function update() {
    const state = controller.getState();
    const busy = ["loading", "saving"].includes(state.status);
    root.setAttribute("aria-busy", String(busy));
    root.dataset.lifecycleState = state.status;
    const content = [
      createElement("header", { className: "admin-overview-route__panel-head", children: [
        createElement("div", { children: [
          createElement("span", { className: "admin-overview__panel-kicker", text: "Teacher controls" }),
          createElement("h2", { text: "Game lifecycle" }),
        ] }),
        button("Refresh lifecycle", () => { closeReview(); void controller.load(); }, { disabled: busy }),
      ] }),
      createElement("p", { text: "Pause or close the simulation without deleting game data. State and available actions come from the administrator service." }),
    ];
    if (busy) content.push(createElement("p", { attrs: { role: "status" }, text: state.status === "saving" ? "Applying lifecycle change…" : "Loading authoritative game state…" }));
    if (state.lifecycle) {
      const model = state.lifecycle;
      content.push(createElement("p", { text: `${GAME_LIFECYCLE_LABELS[model.state]} · Mutations ${model.operationalStatus === "active" ? "allowed" : "blocked"} · Join code ${model.joinCodeStatus}` }));
      content.push(createElement("p", { text: `Active Player sessions: ${model.activePlayerSessions ?? "Unavailable"} · Lifecycle version: ${model.version}` }));
    }
    if (state.error) content.push(createElement("p", { attrs: { role: "alert" }, text: state.status === "uncertain"
      ? "The result could not be confirmed. Retry the same request safely or refresh state before choosing another action."
      : state.error.userMessage }));
    if (state.notice) content.push(createElement("p", { attrs: { role: "status" }, text: state.notice }));
    const controls = createElement("div", { className: "admin-overview__quick-actions", attrs: { "aria-label": "Lifecycle actions" } });
    if (hasPermission("game.update")) {
      const actions = state.status === "uncertain" ? [state.intent.action] : state.lifecycle?.allowedActions || [];
      for (const action of actions) {
        const definition = GAME_LIFECYCLE_ACTIONS[action];
        const control = button(`${state.status === "uncertain" ? "Retry: " : ""}${definition.label}`, () => review(action, control), { disabled: busy, danger: Boolean(definition.phrase) });
        controls.append(control);
      }
    } else content.push(createElement("p", { text: "Your administrator session can view lifecycle state but cannot change it." }));
    content.push(controls);
    root.replaceChildren(...content);
  }
  update();
  return { element: root, update, setGameName(name) { gameName = String(name || "Selected game").slice(0, 160); },
    deactivate: closeReview, destroy() { closeReview(); root.remove(); } };
}
