import { escapeHtml, formatCurrency } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderStatusPill } from "../components/ui.js";

function contractTone(contract) {
  if (contract.status === "Completed") return "green";
  if (contract.status === "Submitted") return "purple";
  if (contract.urgency === "high") return "red";
  if (contract.urgency === "medium") return "amber";
  return "cyan";
}

function lifecycleIndex(status) {
  return { Available: 0, Active: 1, Submitted: 2, Completed: 3 }[status] ?? 0;
}

function renderContractRow(contract, selectedId, currencyCode) {
  return `<button class="player-terminal-contract-row${contract.id === selectedId ? " is-selected" : ""}" type="button" data-player-contract-select="${escapeHtml(contract.id)}">
    <span class="player-terminal-contract-status is-${contractTone(contract)}"><i></i></span>
    <span><strong>${escapeHtml(contract.title)}</strong><small>${escapeHtml(contract.issuer)} · ${escapeHtml(contract.location)}</small></span>
    <span><small>STATE</small><strong>${escapeHtml(contract.status)}</strong></span>
    <span><small>${contract.status === "Submitted" ? "SUBMITTED" : "DUE"}</small><strong>${escapeHtml(contract.due)}</strong></span>
    <span><small>REWARD</small><strong>${escapeHtml(formatCurrency(contract.rewardCash, currencyCode))}</strong></span>
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

export function renderContractsPage(data, ui) {
  const tab = ui.contractTab || "Active";
  const contracts = data.contracts.items.filter((item) => item.status === tab);
  const selectedId = ui.contractId && contracts.some((item) => item.id === ui.contractId) ? ui.contractId : contracts[0]?.id;
  const selected = data.contracts.items.find((item) => item.id === selectedId);
  const currencyCode = data.session.currencyCode;

  return `<section class="player-terminal-page player-terminal-contracts-page" data-page="contracts">
    <header class="player-terminal-page-heading">
      <div><small>MISSION & WORKFLOW CENTER</small><h2>Contracts</h2><p>Follow one visible lifecycle from availability through review and reward. Every state change remains backend-confirmed.</p></div>
      <div class="player-terminal-heading-actions">${renderStatusPill(`${contracts.length} ${tab.toUpperCase()}`, contractTone(selected || { urgency: "low" }))}</div>
    </header>

    <div class="player-terminal-contract-tabs">${data.contracts.tabs.map((item) => `<button type="button" class="${item === tab ? "active" : ""}" data-player-contract-tab="${escapeHtml(item)}"><strong>${escapeHtml(item)}</strong><small>${data.contracts.items.filter((contract) => contract.status === item).length}</small></button>`).join("")}</div>

    <div class="player-terminal-contract-layout">
      <section class="player-terminal-panel player-terminal-contract-list">
        <header class="player-terminal-panel-header"><div><span>${escapeHtml(tab.toUpperCase())} CONTRACTS</span><strong>${escapeHtml(contracts.length)} records</strong></div></header>
        <div>${contracts.map((contract) => renderContractRow(contract, selectedId, currencyCode)).join("") || `<p class="player-terminal-inline-empty">No contracts in this state.</p>`}</div>
      </section>

      ${selected ? `<section class="player-terminal-panel player-terminal-contract-detail">
        <header><div><small>${escapeHtml(selected.issuer)}</small><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.location)} · ${escapeHtml(selected.due)}</p></div>${renderStatusPill(selected.status, contractTone(selected))}</header>
        ${renderLifecycle(selected, data.contracts.lifecycle)}
        <div class="player-terminal-contract-rewards"><span><small>CASH REWARD</small><strong>${escapeHtml(formatCurrency(selected.rewardCash, currencyCode))}</strong></span><span><small>EXPERIENCE</small><strong>${escapeHtml(selected.rewardXp)} XP</strong></span><span><small>PROGRESS</small><strong>${escapeHtml(selected.progress)}%</strong></span></div>
        <div class="player-terminal-progress"><i style="width:${Number(selected.progress)}%"></i></div>
        <div class="player-terminal-contract-detail-grid">
          <div><div class="player-terminal-contract-section"><small>OBJECTIVE</small><p>${escapeHtml(selected.objective)}</p></div><div class="player-terminal-contract-section"><small>SUBMISSION REQUIREMENTS</small><ul>${selected.requirements.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}</ul></div></div>
          ${renderTimeline(selected)}
        </div>

        ${selected.status === "Available" ? `<div class="player-terminal-contract-action-panel"><p>Accepting this contract will add it to your active workload. The backend must confirm eligibility and capacity.</p><button class="player-terminal-primary-button" type="button" data-player-contract-accept="${escapeHtml(selected.id)}">${icon("contracts")} Accept contract</button></div>` : selected.status === "Active" ? `<form class="player-terminal-contract-submit" data-player-form="contract-submit" data-endpoint="contractSubmit" data-contract-id="${escapeHtml(selected.id)}">
          <label>SUBMISSION LINK<input name="submissionUrl" type="url" placeholder="https://..." required /></label>
          <label>PLAYER NOTE<textarea name="note" rows="3" placeholder="Briefly describe the submitted work."></textarea></label>
          <input type="hidden" name="contractId" value="${escapeHtml(selected.id)}" />
          <button class="player-terminal-primary-button" type="submit">${icon("upload")} Submit for review</button>
        </form>` : selected.status === "Submitted" ? `<div class="player-terminal-review-banner">${icon("clock")}<div><strong>Submission received</strong><p>${escapeHtml(selected.submission?.note || "The work is awaiting administrator review.")}</p><small>${escapeHtml(selected.submission?.time || selected.due)}</small></div>${renderStatusPill("UNDER REVIEW", "purple")}</div>` : `<div class="player-terminal-complete-banner">${icon("check")} Contract completed and reward issued.</div>`}
      </section>` : ""}
    </div>
  </section>`;
}
