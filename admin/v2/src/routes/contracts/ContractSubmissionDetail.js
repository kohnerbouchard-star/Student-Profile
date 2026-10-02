import { AdminDataTable, AdminEmptyState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";

function participantIdentity(progress) {
  return createElement("div", { className: "admin-contracts-detail__participant", children: [
    createElement("strong", { text: progress.playerName }),
    createElement("small", { text: [progress.rosterLabel, progress.country].filter(Boolean).join(" · ") || "Participant" }),
  ] });
}
/** Presentation only: the route retains formatting, action styling and orchestration. */
export function ContractSubmissionDetail({ detail, onReview, onIssueRewards, contractButton, statusBadge, titleCase, displayDate }) {
  if (detail.isEmpty) {
    return AdminEmptyState({ title: "No participant progress yet", message: "This contract has no participant progress records for the selected game.", compact: true });
  }
  function participantActions(progress) {
    const actions = createElement("div", { className: "admin-contracts-detail__participant-actions" });
    if (progress.canReview) {
      actions.append(
        contractButton({ label: "Approve", icon: "success", quiet: true, action: "approve", onClick: (event) => onReview(progress, "approve", event.currentTarget) }),
        contractButton({ label: "Revision", icon: "refresh", quiet: true, action: "request-revision", onClick: (event) => onReview(progress, "request_revision", event.currentTarget) }),
        contractButton({ label: "Reject", icon: "warning", quiet: true, tone: "danger", action: "reject", onClick: (event) => onReview(progress, "reject", event.currentTarget) }),
      );
    } else if (progress.canIssueReward) {
      actions.append(contractButton({ label: "Issue rewards", icon: "plus", quiet: true, action: "issue-rewards", onClick: (event) => onIssueRewards(progress, event.currentTarget) }));
    } else {
      actions.append(createElement("span", { className: "admin-contracts-detail__action-note", text: progress.rewardIssuedAt ? "Rewards issued" : titleCase(progress.status) }));
    }
    return actions;
  }
  const table = AdminDataTable({
    caption: `Participant progress for ${detail.contract.title}`,
    rowKey: (progress) => progress.rowKey,
    rows: detail.participants,
    columns: [
      { key: "playerName", label: "Participant", rowHeader: true, render: (_value, progress) => participantIdentity(progress) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) },
      { key: "evidence", label: "Evidence", sortable: false, render: (value, progress) => createElement("div", { className: "admin-contracts-detail__evidence", children: [createElement("span", { text: value }), progress.feedback ? createElement("small", { text: `Review: ${progress.feedback}` }) : null] }) },
      { key: "submittedAt", label: "Submitted", sortValue: (value) => Date.parse(value || "") || 0, render: (value) => displayDate(value) },
      { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, progress) => participantActions(progress) },
    ],
  });
  return createElement("section", { className: "admin-contracts-detail__participants", attrs: { "aria-label": "Participant progress" }, children: table.element });
}
