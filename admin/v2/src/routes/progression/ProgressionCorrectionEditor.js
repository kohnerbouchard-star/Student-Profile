import { AdminConfirmDialog, AdminEmptyState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function signedNumber(value) {
  if (!Number.isSafeInteger(value)) return "Not available";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

function lifecycleMessage(error) {
  switch (error?.progressionCode) {
    case "progression_game_paused":
      return "Corrections are paused for this game. Review remains available, but progression writes are temporarily closed.";
    case "progression_game_ended":
      return "This game has ended. Progression history remains reviewable, but corrections are closed.";
    case "progression_game_unavailable":
      return "Progression corrections are unavailable for the current game lifecycle state.";
    case "progression_idempotency_conflict":
      return "This correction request identity is already associated with another command. Refresh before trying again.";
    default:
      return error?.userMessage || "The progression request could not be completed.";
  }
}

export function ProgressionCorrectionEditor({ selectedPlayer, onCorrect }) {
  const root = createElement("section", {
    className: "progression-v2-panel progression-v2-correction-panel",
    attrs: { "aria-label": "Audited progression correction" },
  });
  root.append(createElement("div", {
    className: "progression-v2-panel__heading",
    children: [
      createElement("div", { children: [
        createElement("p", { className: "progression-v2-kicker", text: "AUDITED CORRECTION" }),
        createElement("h2", { text: selectedPlayer ? selectedPlayer.displayName : "Select a player" }),
      ] }),
      selectedPlayer ? createElement("span", { className: "progression-v2-player-id", text: selectedPlayer.playerId }) : null,
    ],
  }));

  if (!selectedPlayer) {
    root.append(AdminEmptyState({
      title: "No player selected",
      message: "Choose Correct from the progression table to prepare an authoritative correction.",
      compact: true,
    }));
    return { element: root, destroy() {} };
  }

  const form = createElement("form", { className: "progression-v2-form" });
  const correctionType = createElement("select", {
    className: "progression-v2-control",
    attrs: { name: "correctionType", required: true },
    children: [
      createElement("option", { attrs: { value: "experience" }, text: "Experience" }),
      createElement("option", { attrs: { value: "reputation" }, text: "Reputation" }),
    ],
  });
  const amount = createElement("input", {
    className: "progression-v2-control",
    attrs: { name: "amount", type: "number", min: "-5000", max: "5000", step: "1", required: true, inputmode: "numeric" },
  });
  const reputationType = createElement("select", {
    className: "progression-v2-control",
    attrs: { name: "reputationType" },
    children: ["country", "career", "story", "relationship"].map((value) => createElement("option", {
      attrs: { value },
      text: value[0].toUpperCase() + value.slice(1),
    })),
  });
  const reputationScope = createElement("input", {
    className: "progression-v2-control",
    attrs: { name: "reputationScope", maxlength: "160", value: "general", pattern: "[A-Za-z0-9][A-Za-z0-9._:\\-]{0,159}" },
  });
  const reason = createElement("textarea", {
    className: "progression-v2-control progression-v2-control--textarea",
    attrs: { name: "reason", minlength: "3", maxlength: "1000", rows: "4", required: true, placeholder: "Explain the authoritative reason for this correction." },
  });
  const reputationTypeField = createElement("label", {
    className: "progression-v2-field",
    children: [createElement("span", { text: "Reputation type" }), reputationType],
  });
  const reputationScopeField = createElement("label", {
    className: "progression-v2-field",
    children: [createElement("span", { text: "Reputation scope" }), reputationScope],
  });
  reputationTypeField.hidden = true;
  reputationScopeField.hidden = true;

  const validation = createElement("p", { className: "progression-v2-form-error", attrs: { role: "alert" } });
  validation.hidden = true;
  const submit = createElement("button", { className: "admin-button", attrs: { type: "submit" }, text: "Review correction" });

  form.append(
    createElement("label", { className: "progression-v2-field", children: [createElement("span", { text: "Correction" }), correctionType] }),
    createElement("label", { className: "progression-v2-field", children: [createElement("span", { text: "Amount" }), amount] }),
    reputationTypeField,
    reputationScopeField,
    createElement("label", { className: "progression-v2-field progression-v2-field--wide", children: [createElement("span", { text: "Reason" }), reason] }),
    validation,
    createElement("div", {
      className: "progression-v2-form-actions",
      children: [
        createElement("p", { text: "Corrections are bounded to ±5,000 and recorded in immutable history. Zero-value commands are rejected." }),
        submit,
      ],
    }),
  );

  let pendingCommand = null;
  const confirm = AdminConfirmDialog({
    title: "Apply progression correction?",
    message: "This writes an audited correction to the authoritative progression record.",
    detail: "",
    confirmLabel: "Apply audited correction",
    tone: "danger",
    failureMessage: "The correction could not be completed.",
    async onConfirm() {
      validation.hidden = true;
      const result = await onCorrect(selectedPlayer.playerId, pendingCommand);
      if (!result?.ok) {
        validation.textContent = lifecycleMessage(result?.error);
        validation.hidden = false;
        return false;
      }
      form.reset();
      reputationTypeField.hidden = true;
      reputationScopeField.hidden = true;
      reputationType.required = false;
      reputationScope.required = false;
      pendingCommand = null;
      return true;
    },
  });

  correctionType.addEventListener("change", () => {
    const reputation = correctionType.value === "reputation";
    reputationTypeField.hidden = !reputation;
    reputationScopeField.hidden = !reputation;
    reputationType.required = reputation;
    reputationScope.required = reputation;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    validation.hidden = true;
    if (!form.reportValidity()) return;
    const numericAmount = Number(amount.value);
    if (!Number.isSafeInteger(numericAmount) || numericAmount === 0) {
      validation.textContent = "Amount must be a whole, non-zero value between -5,000 and 5,000.";
      validation.hidden = false;
      amount.focus();
      return;
    }
    const reputation = correctionType.value === "reputation";
    pendingCommand = {
      correctionType: correctionType.value,
      amount: numericAmount,
      reputationType: reputation ? reputationType.value : null,
      reputationScope: reputation ? reputationScope.value.trim() : null,
      reason: reason.value.trim(),
    };
    const scope = reputation ? ` · ${pendingCommand.reputationType}:${pendingCommand.reputationScope}` : "";
    confirm.setDetail(`${selectedPlayer.displayName} · ${pendingCommand.correctionType} ${signedNumber(numericAmount)}${scope}`);
    void confirm.open(submit);
  });

  root.append(
    createElement("p", {
      className: "progression-v2-panel__note",
      text: "The current Admin contract supports experience and reputation corrections only. It does not expose XP-rule editing, achievement mutation, or a separate pending-review queue.",
    }),
    form,
  );
  return { element: root, destroy() { confirm.destroy(); } };
}
