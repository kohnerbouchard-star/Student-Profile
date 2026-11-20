import { PlayerApi } from "../../api/player-api.js";
import { normalizeWritePayload } from "../../api/payload-normalizer.js";
import { icon } from "../../components/icons.js";
import { escapeHtml } from "../../core/format.js";
import { focusFirstInteractive, setButtonProcessing } from "../../core/dom.js";

function storyDecisionForm(target) {
  return target?.closest?.('.player-terminal-story-decision[data-endpoint="contractSubmit"]') || null;
}

function roleplayModalElement(mount) {
  return mount.querySelector("[data-player-story-decision-dialog]")?.closest(".player-terminal-modal-backdrop") || null;
}

function syncSelectedOption(form, option) {
  if (!form || !option) return;
  const followup = form.querySelector("[data-story-decision-followup]");
  const reaction = form.querySelector("[data-story-decision-reaction]");
  const prompt = form.querySelector("[data-story-decision-rationale-prompt]");
  const rationale = form.elements.namedItem("storyRationale");
  if (!followup || !(rationale instanceof HTMLTextAreaElement)) return;

  if (reaction) reaction.textContent = String(option.dataset.storyReaction || "").trim();
  if (prompt) prompt.textContent = String(option.dataset.storyRationalePrompt || "Explain your reasoning.").trim();
  followup.hidden = false;
  rationale.disabled = false;
  rationale.required = true;
  rationale.minLength = 20;
  rationale.maxLength = 4000;
  rationale.placeholder = String(option.dataset.storyRationalePrompt || "Explain why you chose this response.").trim();
}

function renderRoleplayDialog(result) {
  const characterName = String(result?.characterName || "Your contact").trim() || "Your contact";
  const dialogue = String(result?.dialogue || "Your decision has been recorded. Your contact will remember where you stood.").trim();
  return `<div class="player-terminal-modal-backdrop" data-player-modal-backdrop>
    <section class="player-terminal-modal player-terminal-connector-modal player-terminal-story-roleplay-dialog" data-player-story-decision-dialog role="dialog" aria-modal="true" aria-labelledby="storyDecisionReplyTitle">
      <header class="player-terminal-modal-head"><div><small>STORY CONVERSATION</small><h3 id="storyDecisionReplyTitle">${escapeHtml(characterName)}</h3></div><button class="player-terminal-icon-button" type="button" data-player-story-decision-close aria-label="Close">${icon("close")}</button></header>
      <div class="player-terminal-modal-body">
        <div class="player-terminal-story-roleplay-reply"><span>${icon("messages")}</span><div><small>RESPONSE</small><p>${escapeHtml(dialogue)}</p></div></div>
        <p class="player-terminal-story-roleplay-note">Your selected option is the authoritative Story decision. This conversation response adds character context only and cannot change money, inventory, markets, contracts, residency, trust, or other game state.</p>
      </div>
      <footer class="player-terminal-modal-footer"><button class="player-terminal-primary-button" type="button" data-player-story-decision-close>Continue</button></footer>
    </section>
  </div>`;
}

export function installStoryDecisionFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.refresh !== "function") {
    throw new TypeError("The Story decision flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);
  let opener = null;
  let destroyed = false;

  function restoreApplication() {
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = false;
      root.removeAttribute("aria-hidden");
    }
  }

  function closeRoleplay({ restoreFocus = true } = {}) {
    roleplayModalElement(mount)?.remove();
    restoreApplication();
    if (restoreFocus) opener?.focus?.({ preventScroll: true });
    opener = null;
  }

  function showRoleplay(result) {
    if (destroyed) return;
    roleplayModalElement(mount)?.remove();
    const template = document.createElement("template");
    template.innerHTML = renderRoleplayDialog(result).trim();
    const modal = template.content.firstElementChild;
    if (!modal) return;
    mount.append(modal);
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    focusFirstInteractive(modal);
  }

  function handleChange(event) {
    const option = event.target.closest?.("[data-story-reaction][data-story-rationale-prompt]");
    if (!(option instanceof HTMLInputElement) || option.type !== "radio" || !option.checked) return;
    syncSelectedOption(storyDecisionForm(option), option);
  }

  async function handleSubmit(event) {
    const form = storyDecisionForm(event.target);
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const selected = form.querySelector('input[name="storyOption"]:checked');
    if (selected instanceof HTMLInputElement) syncSelectedOption(form, selected);
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      form.classList.add("has-validation-error");
      form.querySelector(":invalid")?.focus();
      return;
    }

    const raw = Object.fromEntries(new FormData(form).entries());
    const contractId = String(form.dataset.contractId || raw.contractId || "").trim();
    const submitButton = form.querySelector('button[type="submit"]');
    opener = submitButton;
    const restoreButton = setButtonProcessing(submitButton, "Committing decision");

    try {
      const payload = normalizeWritePayload("contractSubmit", raw);
      api.setSession(config);
      const operation = await api.execute("contractSubmit", payload, { contractId });
      restoreButton("Decision committed");
      let refreshWarning = false;
      try {
        await terminal.refresh();
      } catch {
        refreshWarning = true;
      }
      showRoleplay(operation.result?.storyRoleplay || {
        characterName: "Your contact",
        dialogue: refreshWarning
          ? "Your decision was recorded, but the current Contract view could not refresh. Refresh the terminal before making another Story decision."
          : "Your decision has been recorded. I will remember where you stood when we see what follows."
      });
    } catch (error) {
      restoreButton();
      const currentForm = mount.querySelector(`.player-terminal-story-decision[data-contract-id="${CSS.escape(contractId)}"]`) || form;
      let errorNode = currentForm.querySelector("[data-player-story-decision-error]");
      if (!errorNode) {
        errorNode = document.createElement("p");
        errorNode.className = "player-terminal-form-error";
        errorNode.dataset.playerStoryDecisionError = "true";
        errorNode.setAttribute("role", "alert");
        currentForm.prepend(errorNode);
      }
      errorNode.textContent = String(error?.message || "The Story decision could not be committed.");
      errorNode.focus?.();
    }
  }

  function handleClick(event) {
    const backdrop = event.target.closest?.(".player-terminal-modal-backdrop");
    if (!backdrop?.querySelector?.("[data-player-story-decision-dialog]")) return;
    if (event.target === backdrop || event.target.closest("[data-player-story-decision-close]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRoleplay();
    }
  }

  function handleKeyDown(event) {
    const modal = roleplayModalElement(mount);
    if (!modal || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeRoleplay();
  }

  mount.addEventListener("change", handleChange, true);
  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("keydown", handleKeyDown, true);

  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("change", handleChange, true);
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("keydown", handleKeyDown, true);
      closeRoleplay({ restoreFocus: false });
    }
  };
}
