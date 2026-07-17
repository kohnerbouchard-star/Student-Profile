import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";

function contractTone(contract) {
  if (["Completed", "Approved"].includes(contract.status)) return "green";
  if (contract.status === "Submitted") return "purple";
  if (["Rejected", "Expired"].includes(contract.status)) return "red";
  if (contract.status === "Revision Required" || contract.urgency === "medium") return "amber";
  if (contract.urgency === "high") return "red";
  return "cyan";
}

function lifecycleIndex(status) {
  return {
    Available: 0,
    Scheduled: 0,
    Expired: 0,
    Active: 1,
    Submitted: 2,
    "Revision Required": 3,
    Approved: 3,
    Rejected: 3,
    Completed: 4
  }[status] ?? 0;
}

function renderContractRow(contract, selectedId, currencyCode) {
  const dueLabel = contract.status === "Submitted" ? "SUBMITTED" : contract.status === "Completed" ? "COMPLETED" : contract.status === "Expired" ? "EXPIRED" : "DUE";
  return `<button class="player-terminal-contract-row${contract.id === selectedId ? " is-selected" : ""}" type="button" data-player-contract-select="${escapeHtml(contract.id)}">
    <span class="player-terminal-contract-status is-${contractTone(contract)}"><i></i></span>
    <span><strong>${escapeHtml(contract.title)}</strong><small>${escapeHtml(contract.issuer)} · ${escapeHtml(contract.location)}</small></span>
    <span><small>STATE</small><strong>${escapeHtml(contract.status)}</strong></span>
    <span><small>${dueLabel}</small><strong>${escapeHtml(contract.due)}</strong></span>
    <span><small>REWARD</small><strong>${escapeHtml(formatCurrency(contract.rewardCash, contract.rewardCurrencyCode || currencyCode))}</strong></span>
    ${icon("chevronRight")}
  </button>`;
}

function renderLifecycle(contract, stages) {
  const currentIndex = lifecycleIndex(contract.status);
  return `<div class="player-terminal-contract-lifecycle" aria-label="Contract lifecycle">${stages.map((stage, index) => `<span class="${index < currentIndex ? "is-complete" : index === currentIndex ? "is-current" : ""}"><i>${index < currentIndex || contract.status === "Completed" ? icon("check") : index + 1}</i><strong>${escapeHtml(stage)}</strong></span>`).join("")}</div>`;
}

function renderTimeline(contract) {
  return `<div class="player-terminal-contract-timeline"><small>ACTIVITY TIMELINE</small><div>${contract.timeline.map((item) => `<span class="${item.complete ? "is-complete" : ""}"><i>${item.complete ? icon("check") : icon("clock")}</i><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.time)}</small></span>`).join("")}</div></div>`;
}

function renderRewardItems(contract) {
  if (!Array.isArray(contract.rewardItems) || !contract.rewardItems.length) return "";
  return `<div class="player-terminal-contract-section"><small>ITEM REWARDS</small><ul>${contract.rewardItems.map((item) => `<li>${icon("inventory")}<span>${escapeHtml(item.quantity)} × ${escapeHtml(item.name)}</span></li>`).join("")}</ul></div>`;
}

function renderSubmissionForm(contract, revision = false) {
  return `${revision ? `<div class="player-terminal-review-banner">${icon("edit")}<div><strong>Revision requested</strong><p>${escapeHtml(contract.reviewFeedback || "Update the submission using the administrator’s review guidance.")}</p></div>${renderStatusPill("ACTION REQUIRED", "amber")}</div>` : ""}<form class="player-terminal-contract-submit" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(contract.id)}">
    <label>SUBMISSION LINK<input name="submissionUrl" type="url" placeholder="https://... (optional)" /></label>
    <label>SUBMISSION RESPONSE<textarea name="note" rows="5" required placeholder="Describe the completed work and provide the evidence requested by this contract.">${revision ? escapeHtml(contract.submission?.note || "") : ""}</textarea></label>
    <input type="hidden" name="contractId" value="${escapeHtml(contract.id)}" />
    <button class="player-terminal-primary-button" type="submit">${icon("upload")} ${revision ? "Resubmit for review" : "Submit for review"}</button>
  </form>`;
}

function renderContractAction(contract) {
  if (contract.status === "Available") {
    return `<div class="player-terminal-contract-action-panel"><p>Accepting this contract adds it to your active workload after the backend confirms eligibility and capacity.</p><button class="player-terminal-primary-button" type="button" data-player-contract-accept="${escapeHtml(contract.id)}">${icon("contracts")} Accept contract</button></div>`;
  }
  if (contract.status === "Active") return renderSubmissionForm(contract);
  if (contract.status === "Revision Required") return renderSubmissionForm(contract, true);
  if (contract.status === "Submitted") {
    return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Submission received</strong><p>${escapeHtml(contract.submission?.note || "The work is awaiting administrator review.")}</p><small>${escapeHtml(contract.submission?.time || contract.due)}</small></div>${renderStatusPill("UNDER REVIEW", "purple")}</div>`;
  }
  if (contract.status === "Approved") {
    return `<div class="player-terminal-complete-banner">${icon("check")} Submission approved. Reward issuance is pending backend confirmation.</div>`;
  }
  if (contract.status === "Rejected") {
    return `<div class="player-terminal-review-banner">${icon("close")}<div><strong>Submission rejected</strong><p>${escapeHtml(contract.reviewFeedback || "The administrator rejected this submission.")}</p></div>${renderStatusPill("CLOSED", "red")}</div>`;
  }
  if (contract.status === "Expired") {
    return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Contract expired</strong><p>This contract can no longer be accepted or submitted.</p></div>${renderStatusPill("EXPIRED", "red")}</div>`;
  }
  if (contract.status === "Scheduled") {
    return `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Contract scheduled</strong><p>This contract is visible but not yet open for acceptance.</p></div>${renderStatusPill("UPCOMING", "cyan")}</div>`;
  }
  return `<div class="player-terminal-complete-banner">${icon("check")} Contract completed and reward issued.</div>`;
}

export function renderContractsPage(data, ui) {
  const requestedTab = ui.contractTab || "Active";
  const fallbackTab = data.contracts.tabs.find((candidate) => data.contracts.items.some((item) => item.status === candidate)) || data.contracts.tabs[0] || "Active";
  const tab = data.contracts.items.some((item) => item.status === requestedTab) ? requestedTab : fallbackTab;
  const contracts = data.contracts.items.filter((item) => item.status === tab);
  const selectedId = ui.contractId && contracts.some((item) => item.id === ui.contractId) ? ui.contractId : contracts[0]?.id;
  const selected = data.contracts.items.find((item) => item.id === selectedId);
  const currencyCode = data.session.currencyCode;

  return `<section class="player-terminal-page player-terminal-contracts-page" data-page="contracts">
    <header class="player-terminal-page-heading">
      <div><small>MISSION & WORKFLOW CENTER</small><h2>Contracts</h2><p>Follow the authoritative lifecycle from availability through acceptance, submission, review, and reward issuance.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(`${contracts.length} ${tab.toUpperCase()}`, contractTone(selected || { urgency: "low" }))}</div>
    </header>

    <div class="player-terminal-contract-tabs">${data.contracts.tabs.map((item) => `<button type="button" class="${item === tab ? "active" : ""}" data-player-contract-tab="${escapeHtml(item)}"><strong>${escapeHtml(item)}</strong><small>${data.contracts.items.filter((contract) => contract.status === item).length}</small></button>`).join("")}</div>

    <div class="player-terminal-contract-layout">
      <section class="player-terminal-panel player-terminal-contract-list">
        <header class="player-terminal-panel-header"><div><span>${escapeHtml(tab.toUpperCase())} CONTRACTS</span><strong>${escapeHtml(contracts.length)} records</strong></div></header>
        <div>${contracts.map((contract) => renderContractRow(contract, selectedId, currencyCode)).join("") || `<p class="player-terminal-inline-empty">No contracts in this state.</p>`}</div>
      </section>

      ${selected ? `<section class="player-terminal-panel player-terminal-contract-detail">
        <header><div><small>${escapeHtml(selected.issuer)} · ${escapeHtml(selected.category || "General")}</small><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.location)} · ${escapeHtml(selected.due)}</p></div>${renderStatusPill(selected.status, contractTone(selected))}</header>
        ${renderLifecycle(selected, data.contracts.lifecycle)}
        <div class="player-terminal-contract-rewards"><span><small>CASH REWARD</small><strong>${escapeHtml(formatCurrency(selected.rewardCash, selected.rewardCurrencyCode || currencyCode))}</strong></span><span><small>EXPERIENCE</small><strong>${escapeHtml(selected.rewardXp)} XP</strong></span><span><small>PROGRESS</small><strong>${escapeHtml(selected.progress)}%</strong></span></div>
        <div class="player-terminal-progress"><i style="width:${Math.max(0, Math.min(100, Number(selected.progress) || 0))}%"></i></div>
        <div class="player-terminal-contract-detail-grid">
          <div><div class="player-terminal-contract-section"><small>OBJECTIVE</small><p>${escapeHtml(selected.objective)}</p></div>${selected.instructions ? `<div class="player-terminal-contract-section"><small>INSTRUCTIONS</small><p>${escapeHtml(selected.instructions)}</p></div>` : ""}<div class="player-terminal-contract-section"><small>SUBMISSION REQUIREMENTS</small><ul>${selected.requirements.length ? selected.requirements.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("") : `<li>${icon("document")}<span>Follow the contract instructions and submit a written completion response.</span></li>`}</ul></div>${renderRewardItems(selected)}</div>
          ${renderTimeline(selected)}
        </div>

        ${renderContractAction(selected)}
      </section>` : ""}
    </div>
  </section>`;
}
