import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";
import { renderChoiceSet, renderProgressRail, renderReceipt } from "../components/player-interior.js";

function contractTone(contract) {
  if (["Completed", "Approved"].includes(contract.status)) return "green";
  if (contract.status === "Submitted") return "purple";
  if (["Rejected", "Expired"].includes(contract.status)) return "red";
  if (contract.status === "Revision Required" || contract.urgency === "medium") return "amber";
  if (contract.urgency === "high") return "red";
  return "cyan";
}
function lifecycleIndex(status) { return { Available: 0, Scheduled: 0, Expired: 0, Active: 1, Submitted: 2, "Revision Required": 3, Approved: 3, Rejected: 3, Completed: 4 }[status] ?? 0; }
function renderContractRow(contract, selectedId, currencyCode) {
  const dueLabel = contract.status === "Submitted" ? "SUBMITTED" : contract.status === "Completed" ? "COMPLETED" : contract.status === "Expired" ? "EXPIRED" : "DUE";
  const interaction = contract.interaction?.type === "story_decision" ? "CONVERSATION" : contract.interaction?.type === "multiple_choice" ? "QUIZ" : contract.interaction?.type === "evidence" ? "EVIDENCE" : "MISSION";
  return `<button class="player-terminal-contract-row${contract.id === selectedId ? " is-selected" : ""}" type="button" data-player-contract-select="${escapeHtml(contract.id)}">
    <span class="player-terminal-contract-status is-${contractTone(contract)}"><i></i></span>
    <span><small>${escapeHtml(interaction)}</small><strong>${escapeHtml(contract.title)}</strong><small>${escapeHtml(contract.issuer)} · ${escapeHtml(contract.location)}</small></span>
    <span><small>STATE</small><strong>${escapeHtml(contract.status)}</strong></span><span><small>${dueLabel}</small><strong>${escapeHtml(contract.due)}</strong></span>
    <span><small>REWARD</small><strong>${escapeHtml(formatCurrency(contract.rewardCash, contract.rewardCurrencyCode || currencyCode))}</strong></span>${icon("chevronRight")}
  </button>`;
}
function renderLifecycle(contract, stages) {
  const currentIndex = lifecycleIndex(contract.status);
  return `<div class="player-terminal-contract-lifecycle" aria-label="Contract lifecycle">${stages.map((stage, index) => `<span class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}"><i>${index < currentIndex || contract.status === "Completed" ? icon("check") : index + 1}</i><strong>${escapeHtml(stage)}</strong></span>`).join("")}</div>`;
}
function renderTimeline(contract) { return `<div class="player-terminal-contract-timeline"><small>ACTIVITY TIMELINE</small><div>${contract.timeline.map((item) => `<span class="${item.complete ? "is-complete" : ""}"><i>${item.complete ? icon("check") : icon("clock")}</i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.time)}</small></span>`).join("")}</div></div>`; }
function renderRewardItems(contract) {
  if (!Array.isArray(contract.rewardItems) || !contract.rewardItems.length) return "";
  return `<div class="player-terminal-contract-section"><small>ITEM REWARDS</small><ul>${contract.rewardItems.map((item) => `<li>${icon("inventory")}<span>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</span></li>`).join("")}</ul></div>`;
}
function selectedAnswers(contract) { return Object.fromEntries((contract.submission?.answers || []).map((answer) => [answer.questionKey, answer.optionKey])); }
function revisionBanner(contract) { return `<div class="player-terminal-review-banner">${icon("edit")}<div><strong>Revision requested</strong><p>${escapeHtml(contract.reviewFeedback || "Update the submission using the administrator’s review guidance.")}</p></div>${renderStatusPill("ACTION REQUIRED", "amber")}</div>`; }

function renderStoryDecisionSubmission(contract, revision = false) {
  const interaction = contract.interaction || {};
  const committed = revision ? contract.submission?.storyDecision : null;
  const committedOptionKey = committed?.optionKey || "";
  const committedOption = (interaction.options || []).find((option) => option.optionKey === committedOptionKey);
  const hasCommittedOption = Boolean(committedOption);
  const optionMarkup = (interaction.options || []).map((option) => {
    const checked = hasCommittedOption && option.optionKey === committedOptionKey;
    const disabled = hasCommittedOption && !checked;
    return `<label class="player-terminal-story-decision-option${disabled ? " is-locked" : ""}"><input type="radio" name="storyOption" value="${escapeHtml(option.optionKey)}" required ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} data-story-reaction="${escapeHtml(option.characterReaction || "")}" data-story-rationale-prompt="${escapeHtml(option.rationalePrompt || "Explain your reasoning.")}"/><span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.detail || "")}</small></span></label>`;
  }).join("");
  const reaction = committedOption?.characterReaction || "";
  const rationalePrompt = committedOption?.rationalePrompt || "Explain your reasoning.";
  const rationale = committed?.rationale || "";
  const modeCopy = hasCommittedOption
    ? `<p class="player-terminal-story-decision-lock-note">Your original Story choice is already committed. The reviewer can request a stronger explanation, but this revision cannot rewrite the decision or award relationship trust again.</p>`
    : "";

  return `${revision ? revisionBanner(contract) : ""}<form class="player-terminal-contract-submit player-terminal-story-decision" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(contract.id)}">
    <div class="player-terminal-v2-panel player-terminal-contract-response-intro"><small>${escapeHtml(interaction.sceneTitle || "STORY CONVERSATION")}</small><h4>${escapeHtml(interaction.speakerRole || "Your contact")}</h4><p>${escapeHtml(interaction.question || "Choose how you want to respond.")}</p>${modeCopy}</div>
    <fieldset class="player-terminal-story-decision-options"><legend>${hasCommittedOption ? "Your committed answer" : "How do you answer?"}</legend>${optionMarkup}</fieldset>
    <section class="player-terminal-v2-panel player-terminal-story-decision-followup" data-story-decision-followup ${hasCommittedOption ? "" : "hidden"}>
      <small>${escapeHtml(interaction.speakerRole || "Your contact")}</small><p data-story-decision-reaction>${escapeHtml(reaction)}</p><p><strong data-story-decision-rationale-prompt>${escapeHtml(rationalePrompt)}</strong></p>
      <label>YOUR EXPLANATION<textarea name="storyRationale" rows="5" minlength="20" maxlength="4000" ${hasCommittedOption ? "required" : "disabled"} placeholder="${escapeHtml(rationalePrompt)}">${escapeHtml(rationale)}</textarea></label>
    </section>
    <input type="hidden" name="contractId" value="${escapeHtml(contract.id)}" />
    <div class="player-terminal-contract-submit-footer"><span>${icon("shield")} ${hasCommittedOption ? "Only your explanation can be revised; the Story choice and its trust consequence remain locked." : "Your selected answer drives Story mechanics. Your explanation is required and is kept with the decision."}</span><button class="player-terminal-primary-button" type="submit">${icon("send")} ${hasCommittedOption ? "Resubmit explanation" : "Commit decision"}</button></div>
  </form>`;
}

function renderMultipleChoiceSubmission(contract, revision = false) {
  const questions = contract.interaction?.questions || [];
  const chosen = revision ? selectedAnswers(contract) : {};
  return `${revision ? revisionBanner(contract) : ""}<form class="player-terminal-contract-submit player-terminal-contract-submit--choices" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(contract.id)}"><div class="player-terminal-v2-panel player-terminal-contract-response-intro"><small>DECISION RESPONSE</small><h4>Choose one answer for every question</h4><p>Your selections are submitted to the authoritative contract record.</p></div>${renderChoiceSet(questions, { namePrefix: "contractChoice", selected: chosen })}<label class="player-terminal-contract-optional-note">OPTIONAL REASONING OR CONTEXT<textarea name="note" rows="3">${revision ? escapeHtml(contract.submission?.note || "") : ""}</textarea></label><input type="hidden" name="contractId" value="${escapeHtml(contract.id)}" /><div class="player-terminal-contract-submit-footer"><span>${icon("shield")} Answers are saved only after backend confirmation.</span><button class="player-terminal-primary-button" type="submit">${icon("send")} ${revision ? "Resubmit answers" : "Submit answers"}</button></div></form>`;
}
function renderWrittenSubmission(contract, revision = false) { return `${revision ? revisionBanner(contract) : ""}<form class="player-terminal-contract-submit" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(contract.id)}"><label>SUBMISSION LINK<input name="submissionUrl" type="url" placeholder="https://... (optional)" value="${revision ? escapeHtml(contract.submission?.url || "") : ""}" /></label><label>SUBMISSION RESPONSE<textarea name="note" rows="5" required placeholder="Describe the completed work and provide the evidence requested by this contract.">${revision ? escapeHtml(contract.submission?.note || "") : ""}</textarea></label><input type="hidden" name="contractId" value="${escapeHtml(contract.id)}" /><div class="player-terminal-contract-submit-footer"><span>${icon("shield")} Your submission is committed only after backend confirmation.</span><button class="player-terminal-primary-button" type="submit">${icon("upload")} ${revision ? "Resubmit for review" : "Submit for review"}</button></div></form>`; }
function renderEvidenceSubmission(contract, revision = false) { return `${revision ? revisionBanner(contract) : ""}<form class="player-terminal-contract-submit" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(contract.id)}"><label>EVIDENCE LINK<input name="submissionUrl" type="url" required placeholder="https://..." value="${revision ? escapeHtml(contract.submission?.url || "") : ""}" /></label><label>CONTEXT<textarea name="note" rows="4">${revision ? escapeHtml(contract.submission?.note || "") : ""}</textarea></label><input type="hidden" name="contractId" value="${escapeHtml(contract.id)}" /><div class="player-terminal-contract-submit-footer"><span>${icon("document")} Verify the evidence link before submitting.</span><button class="player-terminal-primary-button" type="submit">${icon("upload")} ${revision ? "Resubmit evidence" : "Submit evidence"}</button></div></form>`; }
function renderSubmissionForm(contract, revision = false) {
  if (contract.interaction?.type === "story_decision") return renderStoryDecisionSubmission(contract, revision);
  if (contract.interaction?.type === "multiple_choice" && contract.interaction.questions?.length) return renderMultipleChoiceSubmission(contract, revision);
  if (contract.interaction?.type === "evidence") return renderEvidenceSubmission(contract, revision);
  return renderWrittenSubmission(contract, revision);
}
function renderSubmittedAnswers(contract) {
  if (contract.interaction?.type === "story_decision" && contract.submission?.storyDecision) {
    const option = contract.interaction.options?.find((item) => item.optionKey === contract.submission.storyDecision.optionKey);
    return `<div class="player-terminal-contract-section"><small>COMMITTED STORY DECISION</small><p><strong>${escapeHtml(option?.label || "Decision recorded")}</strong></p><p>${escapeHtml(contract.submission.storyDecision.rationale || "")}</p></div>`;
  }
  if (contract.interaction?.type !== "multiple_choice" || !contract.submission?.answers?.length) return "";
  const answers = selectedAnswers(contract);
  return `<div class="player-terminal-contract-section"><small>SUBMITTED ANSWERS</small><ol class="player-terminal-contract-answer-summary">${contract.interaction.questions.map((question, index) => { const selected = question.options.find((option) => option.optionKey === answers[question.questionKey]); return `<li><span>${index + 1}</span><div><strong>${escapeHtml(question.prompt)}</strong><p>${escapeHtml(selected?.label || "Answer recorded")}</p></div></li>`; }).join("")}</ol></div>`;
}
function renderContractAction(contract, currencyCode) {
  if (contract.status === "Available") return `<div class="player-terminal-contract-action-panel"><div><small>READY TO BEGIN</small><strong>Accept this contract?</strong><p>Acceptance adds the mission to your active workload after the backend confirms eligibility and capacity.</p></div><button class="player-terminal-primary-button" type="button" data-player-contract-accept="${escapeHtml(contract.id)}">${icon("contracts")} Accept contract</button></div>`;
  if (contract.status === "Active") return renderSubmissionForm(contract);
  if (contract.status === "Revision Required") return renderSubmissionForm(contract, true);
  if (contract.status === "Submitted") return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>${contract.interaction?.type === "story_decision" ? "Decision committed" : "Submission received"}</strong><p>${escapeHtml(contract.interaction?.type === "story_decision" ? "Your selected answer is now part of your Story history." : contract.interaction?.type === "multiple_choice" ? "Your answers are locked while this contract is under review." : contract.submission?.note || "The work is awaiting administrator review.")}</p><small>${escapeHtml(contract.submission?.time || contract.due)}</small></div>${renderStatusPill("UNDER REVIEW", "purple")}</div>${renderSubmittedAnswers(contract)}`;
  if (contract.status === "Approved") return renderReceipt({ title: "Submission approved", summary: "Review is complete. Reward issuance is pending backend confirmation.", rows: [{ label: "Cash reward", value: formatCurrency(contract.rewardCash, contract.rewardCurrencyCode || currencyCode) }, { label: "Experience", value: `${contract.rewardXp} XP` }] });
  if (contract.status === "Rejected") return `<div class="player-terminal-review-banner">${icon("close")}<div><strong>Submission rejected</strong><p>${escapeHtml(contract.reviewFeedback || "The administrator rejected this submission.")}</p></div>${renderStatusPill("CLOSED", "red")}</div>`;
  if (contract.status === "Expired") return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Contract expired</strong><p>This contract can no longer be accepted or submitted.</p></div>${renderStatusPill("EXPIRED", "red")}</div>`;
  if (contract.status === "Scheduled") return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Contract scheduled</strong><p>This contract is visible but not yet open for acceptance.</p></div>${renderStatusPill("UPCOMING", "cyan")}</div>`;
  return renderReceipt({ title: "Contract completed", summary: "The contract is closed and its committed reward has been issued.", rows: [{ label: "Cash reward", value: formatCurrency(contract.rewardCash, contract.rewardCurrencyCode || currencyCode) }, { label: "Experience", value: `${contract.rewardXp} XP` }] });
}
function renderAttention(contract) {
  if (contract.status === "Revision Required") return `<div class="player-terminal-contract-attention is-amber">${icon("edit")}<div><strong>Revision required</strong><p>Review the feedback and update only the requested parts before resubmitting.</p></div></div>`;
  if (contract.urgency === "high" && ["Active", "Available"].includes(contract.status)) return `<div class="player-terminal-contract-attention is-red">${icon("clock")}<div><strong>Deadline approaching</strong><p>This contract is due ${escapeHtml(contract.due)}. Finish the required work before it expires.</p></div></div>`;
  return "";
}

export function renderContractsPage(data, ui) {
  const requestedTab = ui.contractTab || "Active";
  const fallbackTab = data.contracts.tabs.find((candidate) => data.contracts.items.some((item) => item.status === candidate)) || data.contracts.tabs[0] || "Active";
  const tab = data.contracts.items.some((item) => item.status === requestedTab) ? requestedTab : fallbackTab;
  const contracts = data.contracts.items.filter((item) => item.status === tab);
  const selectedId = ui.contractId && contracts.some((item) => item.id === ui.contractId) ? ui.contractId : contracts[0]?.id;
  const selected = data.contracts.items.find((item) => item.id === selectedId);
  const currencyCode = data.session.currencyCode;
  const interactionLabel = selected?.interaction?.type === "story_decision" ? "Story conversation" : selected?.interaction?.type === "multiple_choice" ? "Multiple choice" : selected?.interaction?.type === "evidence" ? "Evidence" : "Written response";

  return `<section class="player-terminal-page player-terminal-contracts-page" data-page="contracts"><header class="player-terminal-page-heading"><div><small>MISSION & WORKFLOW CENTER</small><h2>Contracts</h2><p>Accept missions, complete structured tasks, submit evidence, and track review and reward status without leaving the live game.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(`${contracts.length} ${tab.toUpperCase()}`, contractTone(selected || { urgency: "low" }))}</div></header>
    <div class="player-terminal-contract-tabs">${data.contracts.tabs.map((item) => `<button type="button" class="${item === tab ? "active" : ""}" data-player-contract-tab="${escapeHtml(item)}"><strong>${escapeHtml(item)}</strong><small>${data.contracts.items.filter((contract) => contract.status === item).length}</small></button>`).join("")}</div>
    <div class="player-terminal-contract-layout"><section class="player-terminal-panel player-terminal-contract-list"><header class="player-terminal-panel-header"><div><span>${escapeHtml(tab.toUpperCase())} CONTRACTS</span><strong>${escapeHtml(contracts.length)} records</strong></div></header><div>${contracts.map((contract) => renderContractRow(contract, selectedId, currencyCode)).join("") || `<p class="player-terminal-inline-empty">No contracts in this state.</p>`}</div></section>
      ${selected ? `<section class="player-terminal-panel player-terminal-contract-detail"><header><div><small>${escapeHtml(selected.issuer)} · ${escapeHtml(selected.category || "General")}${selected.difficulty ? ` · ${escapeHtml(selected.difficulty)}` : ""}</small><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.location)} · ${escapeHtml(selected.due)}</p></div>${renderStatusPill(selected.status, contractTone(selected))}</header>${renderAttention(selected)}${renderLifecycle(selected, data.contracts.lifecycle)}<div class="player-terminal-contract-rewards"><span><small>CASH REWARD</small><strong>${escapeHtml(formatCurrency(selected.rewardCash, selected.rewardCurrencyCode || currencyCode))}</strong></span><span><small>EXPERIENCE</small><strong>${escapeHtml(selected.rewardXp)} XP</strong></span><span><small>INTERACTION</small><strong>${escapeHtml(interactionLabel)}</strong></span></div>${renderProgressRail({ value: selected.progress, label: "Contract progress", detail: selected.status })}<div class="player-terminal-contract-detail-grid"><div><div class="player-terminal-contract-section"><small>OBJECTIVE</small><p>${escapeHtml(selected.objective)}</p></div>${selected.instructions ? `<div class="player-terminal-contract-section"><small>INSTRUCTIONS</small><p>${escapeHtml(selected.instructions)}</p></div>` : ""}<div class="player-terminal-contract-section"><small>SUBMISSION REQUIREMENTS</small><ul>${selected.requirements.length ? selected.requirements.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("") : `<li>${icon("document")}<span>Follow the contract instructions and complete the response shown below.</span></li>`}</ul></div>${renderRewardItems(selected)}</div>${renderTimeline(selected)}</div>${renderContractAction(selected, currencyCode)}</section>` : ""}
    </div></section>`;
}
