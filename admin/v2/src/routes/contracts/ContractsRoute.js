import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminDialog,
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { ContractForm } from "./ContractForm.js";
import { ContractsSkeleton } from "./ContractsSkeleton.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}
function displayCount(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "0"; }
function displayDate(value) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function metric(label, value, detail) {
  return createElement("article", { className: "admin-contracts-route__metric", children: [
    createElement("span", { text: label }), createElement("output", { text: displayCount(value) }), createElement("small", { text: detail }),
  ] });
}
function summary(model) {
  return createElement("section", { className: "admin-contracts-route__summary", attrs: { "aria-label": "Contracts summary" }, children: [
    metric("Contracts", model.summary.totalCount, "Game-scoped assignments"),
    metric("Active", model.summary.activeCount, "Currently published"),
    metric("Awaiting review", model.summary.reviewCount, "Submitted participant work"),
    metric("Completed", model.summary.completedCount, "Participant completions"),
  ] });
}
function contractButton({ label, icon, quiet = false, tone = null, onClick, disabled = false, disabledReason = "", action = "" }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled, title: disabled && disabledReason ? disabledReason : null },
    dataset: { tone, contractsAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}
function statusBadge(status) {
  return createElement("span", { className: "admin-contracts-route__status", dataset: { status: status || "unknown" }, text: titleCase(status) });
}
function definition(label, value, { pre = false, note = "" } = {}) {
  return createElement("div", { className: "admin-contracts-detail__definition", children: [
    createElement("dt", { text: label }),
    createElement("dd", { className: pre ? "admin-contracts-detail__long-copy" : "", text: value || "—" }),
    note ? createElement("small", { text: note }) : null,
  ] });
}
function detailSummary(contract) {
  return createElement("section", { className: "admin-contracts-detail__overview", attrs: { "aria-label": "Contract details" }, children: [
    createElement("div", { className: "admin-contracts-detail__headline", children: [
      statusBadge(contract.status), createElement("span", { text: contract.sourceLabel }), createElement("span", { text: titleCase(contract.visibility) }),
    ] }),
    createElement("dl", { className: "admin-contracts-detail__definitions", children: [
      definition("Description", contract.description || "No description", { pre: true }),
      definition("Instructions", contract.instructions || "No instructions", { pre: true }),
      definition("Requirements", contract.requirementsText || "No additional requirements", { pre: true }),
      definition("Category", titleCase(contract.category)),
      definition("Completion", titleCase(contract.completionMode)),
      definition("Participants", contract.targeting),
      definition("Reward", contract.reward.label),
      definition("Due", displayDate(contract.deadlineAt)),
      definition("Expires", displayDate(contract.expiresAt)),
      definition("Published / scheduled", displayDate(contract.publishedAt)),
      definition("Difficulty", contract.metadata.difficulty || "Not specified"),
      definition("Materials", displayCount(contract.metadata.materials)),
    ] }),
    contract.metadata.reviewNote ? createElement("div", { className: "admin-contracts-detail__note", children: [createElement("strong", { text: "Reviewer note" }), createElement("p", { text: contract.metadata.reviewNote })] }) : null,
  ] });
}
function participantIdentity(progress) {
  return createElement("div", { className: "admin-contracts-detail__participant", children: [
    createElement("strong", { text: progress.playerName }),
    createElement("small", { text: [progress.rosterLabel, progress.country].filter(Boolean).join(" · ") || "Participant" }),
  ] });
}
function loadingDetail(contract) {
  return createElement("div", { className: "admin-contracts-detail__loading", attrs: { role: "status", "aria-live": "polite" }, children: [detailSummary(contract), createElement("p", { text: "Loading participant progress…" })] });
}
function detailError(error, retry) {
  return AdminErrorState({ title: "Contract details could not be loaded", message: error?.userMessage, requestId: error?.requestId, retryAfterSeconds: error?.retryAfterSeconds, retry: error?.retryable ? { label: "Retry details", onClick: retry } : null });
}
function detailContent({ detail, onReview, onIssueRewards }) {
  const root = createElement("div", { className: "admin-contracts-detail", children: [
    detailSummary(detail.contract),
    createElement("section", { className: "admin-contracts-detail__progress-summary", attrs: { "aria-label": "Participant progress summary" }, children: [
      metric("Participants", detail.summary.participantCount, "Assigned or participating"),
      metric("Submitted", detail.summary.submittedCount, "Awaiting a decision"),
      metric("Completed", detail.summary.completedCount, "Completion recorded"),
      metric("Rewards issued", detail.summary.rewardIssuedCount, "Reward lifecycle complete"),
    ] }),
  ] });
  if (detail.isEmpty) {
    root.append(AdminEmptyState({ title: "No participant progress yet", message: "This contract has no participant progress records for the selected game.", compact: true }));
    return root;
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
  root.append(createElement("section", { className: "admin-contracts-detail__participants", attrs: { "aria-label": "Participant progress" }, children: table.element }));
  return root;
}

function catalog({ model, filters, onFiltersChange, onOpenDetail, onEdit, onPublish, onArchive, onDuplicate, onAdd }) {
  const categoryValue = filters.category === "all" || model.categories.includes(filters.category) ? filters.category : "all";
  if (categoryValue !== filters.category) onFiltersChange({ ...filters, category: categoryValue });
  const search = AdminField({ name: "search", label: "Search contracts", type: "search", value: filters.query, placeholder: "Title, instructions, category, or status", autocomplete: "off", prefix: AdminIcon({ name: "search", size: 16 }) });
  const status = AdminField({ name: "status", label: "Lifecycle status", type: "select", value: filters.status, options: ["all", "draft", "scheduled", "active", "paused", "completed", "expired", "archived"].map((value) => ({ value, label: value === "all" ? "All statuses" : titleCase(value) })) });
  const category = AdminField({ name: "category", label: "Category", type: "select", value: categoryValue, options: [{ value: "all", label: "All categories" }, ...model.categories.map((value) => ({ value, label: titleCase(value) }))] });
  const clear = contractButton({ label: "Clear filters", icon: "close", quiet: true, action: "clear-filters", onClick() { search.setValue(""); status.setValue("all"); category.setValue("all"); applyFilters(); } });
  const controls = createElement("section", { className: "admin-contracts-route__controls", attrs: { "aria-label": "Contract filters" }, children: [search.element, status.element, category.element, clear] });
  function rowActions(contract) {
    const actions = createElement("div", { className: "admin-contracts-route__row-actions" });
    actions.append(contractButton({ label: "Details", icon: "overview", quiet: true, action: "details", disabled: !contract.resourceId, disabledReason: "Details are unavailable without a contract resource reference.", onClick: (event) => onOpenDetail(contract, event.currentTarget) }));
    const canEdit = contract.sourceType === "teacher"
      && contract.targetingEditable !== false
      && ["draft", "scheduled"].includes(contract.status)
      && contract.resourceId;
    if (canEdit) actions.append(contractButton({ label: "Edit", icon: "settings", quiet: true, action: "edit", onClick: (event) => onEdit(contract, event.currentTarget) }));
    if (["draft", "scheduled"].includes(contract.status) && contract.resourceId) actions.append(contractButton({ label: "Publish", icon: "success", quiet: true, action: "publish", onClick: (event) => onPublish(contract, event.currentTarget) }));
    if (contract.resourceId) actions.append(contractButton({ label: "Duplicate", icon: "plus", quiet: true, action: "duplicate", onClick: (event) => onDuplicate(contract, event.currentTarget) }));
    if (contract.status !== "archived" && contract.resourceId) actions.append(contractButton({ label: "Archive", icon: "warning", quiet: true, tone: "danger", action: "archive", onClick: (event) => onArchive(contract, event.currentTarget) }));
    if (!canEdit && contract.sourceType !== "teacher") {
      actions.append(createElement("span", { className: "admin-contracts-detail__action-note", text: "System/story definition · read only" }));
    } else if (!canEdit && contract.sourceType === "teacher" && contract.targetingEditable === false) {
      actions.append(createElement("span", { className: "admin-contracts-detail__action-note", text: "Advanced targeting · duplicate to change safely" }));
    }
    return actions;
  }
  const table = AdminDataTable({
    caption: "Contracts Management directory",
    rowKey: (contract) => contract.rowKey,
    columns: [
      { key: "title", label: "Contract", rowHeader: true, render: (_value, contract) => createElement("div", { className: "admin-contracts-route__contract-copy", children: [createElement("strong", { text: contract.title }), contract.description ? createElement("small", { text: contract.description }) : null, createElement("span", { text: `${contract.sourceLabel} · ${titleCase(contract.completionMode)}` })] }) },
      { key: "category", label: "Category", render: (value) => titleCase(value) },
      { key: "status", label: "Status", render: (value) => statusBadge(value) },
      { key: "deadlineAt", label: "Due / term", sortValue: (value) => Date.parse(value || "") || 0, render: (value, contract) => createElement("div", { className: "admin-contracts-route__dates", children: [createElement("span", { text: displayDate(value) }), contract.expiresAt ? createElement("small", { text: `Expires ${displayDate(contract.expiresAt)}` }) : null] }) },
      { key: "progressCount", label: "Progress", align: "end", render: (_value, contract) => createElement("div", { className: "admin-contracts-route__progress", children: [createElement("span", { text: `${displayCount(contract.submittedCount)} submitted` }), createElement("small", { text: `${displayCount(contract.completedCount)} completed · ${displayCount(contract.progressCount)} total` })] }) },
      { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, contract) => rowActions(contract) },
    ],
    emptyState: AdminEmptyState({ title: "No contracts match", message: "Try changing the search or lifecycle filters.", compact: true }),
  });
  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const selectedCategory = category.getValue();
    table.setRows(model.contracts.filter((contract) => {
      const searchable = [contract.title, contract.description, contract.instructions, contract.category, contract.status, contract.sourceLabel, contract.targeting].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) && (selectedStatus === "all" || contract.status === selectedStatus) && (selectedCategory === "all" || contract.category === selectedCategory);
    }));
    onFiltersChange({ query: search.getValue(), status: selectedStatus, category: selectedCategory });
  }
  search.control.addEventListener("input", applyFilters);
  status.control.addEventListener("change", applyFilters);
  category.control.addEventListener("change", applyFilters);
  applyFilters();
  const root = createElement("div", { className: "admin-contracts-route__resolved", children: [summary(model), controls] });
  root.append(model.isEmpty
    ? AdminEmptyState({ title: "No contracts yet", message: "Create the first game-scoped contract.", action: { label: "Create Contract", onClick: onAdd } })
    : createElement("section", { className: "admin-contracts-route__catalog", attrs: { "aria-label": "Contracts" }, children: table.element }));
  return root;
}

export function ContractsRoute({
  state,
  filters = { query: "", status: "all", category: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onLoadDetail = async () => null,
  onCreate = async () => ({ ok: false }),
  onEdit = async () => ({ ok: false }),
  onPublish = async () => ({ ok: false }),
  onArchive = async () => ({ ok: false }),
  onDuplicate = async () => ({ ok: false }),
  onReview = async () => ({ ok: false }),
  onIssueRewards = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let formDialog = null;
  let detailDrawer = null;
  let detailSequence = 0;
  let selectedContract = null;
  let reviewDialog = null;
  let archiveDialog = null;
  let publishDialog = null;
  let rewardDialog = null;
  const destroyLayer = (layer) => layer?.destroy?.();

  function openForm(mode, contract, opener) {
    destroyLayer(formDialog);
    let dialog;
    const form = ContractForm({
      mode, contract,
      onCancel: () => dialog.close("cancelled"),
      async onSubmit(payload) {
        dialog.setBusy(true);
        const result = mode === "edit" ? await onEdit(contract, payload) : await onCreate(payload);
        if (result?.ok === true) dialog.close(mode === "edit" ? "saved" : "created");
        else dialog.setBusy(false);
        return result;
      },
    });
    dialog = AdminDialog({
      title: mode === "edit" ? `Edit ${contract.title}` : "Create Contract",
      description: mode === "edit"
        ? "Draft and scheduled teacher contracts can be corrected before publication. Published contracts remain immutable through this editor."
        : "Create a game-scoped contract. Conditional scheduling and targeting fields appear only when relevant.",
      content: form.element, footer: form.footer, size: "large", className: "admin-contracts-create-dialog",
      initialFocus: () => form.fields.title.control,
      onClose: () => queueMicrotask(() => { if (formDialog === dialog) { formDialog = null; dialog.destroy(); } }),
    });
    formDialog = dialog;
    dialog.open(opener instanceof HTMLElement ? opener : document.activeElement);
  }
  const openCreate = (opener) => openForm("create", null, opener);
  const openEdit = (contract, opener) => openForm("edit", contract, opener);

  async function loadDetailIntoDrawer(contract) {
    const sequence = ++detailSequence;
    selectedContract = contract;
    detailDrawer?.setContent(loadingDetail(contract));
    try {
      const detail = await onLoadDetail(contract);
      if (destroyed || sequence !== detailSequence || selectedContract !== contract || !detailDrawer?.isOpen()) return;
      detailDrawer.setContent(detailContent({ detail, onReview: (progress, action, opener) => openReview(contract, progress, action, opener), onIssueRewards: (progress, opener) => openReward(contract, progress, opener) }));
    } catch (error) {
      if (destroyed || sequence !== detailSequence || selectedContract !== contract || !detailDrawer?.isOpen()) return;
      detailDrawer.setContent(detailError(error, () => loadDetailIntoDrawer(contract)));
    }
  }
  function openDetail(contract, opener) {
    destroyLayer(detailDrawer);
    selectedContract = contract;
    detailDrawer = AdminDrawer({ title: contract.title, description: `${contract.sourceLabel} · ${titleCase(contract.status)}`, content: loadingDetail(contract), size: "large", className: "admin-contracts-detail-drawer", onClose() { detailSequence += 1; selectedContract = null; } });
    detailDrawer.open(opener);
    void loadDetailIntoDrawer(contract);
  }
  function openReview(contract, progress, action, opener) {
    destroyLayer(reviewDialog);
    const feedback = AdminField({ name: "feedback", label: action === "approve" ? "Feedback (optional)" : "Feedback", type: "textarea", rows: 4, required: action !== "approve", hint: action === "request_revision" ? "Tell the participant what needs to change." : action === "reject" ? "Explain why this submission is rejected." : "Optional review note." });
    let dialog;
    const submit = contractButton({
      label: action === "approve" ? "Approve submission" : action === "reject" ? "Reject submission" : "Request revision",
      icon: action === "approve" ? "success" : action === "reject" ? "warning" : "refresh", tone: action === "reject" ? "danger" : null, action: `confirm-${action}`,
      async onClick() {
        const note = feedback.getValue().trim();
        if (action !== "approve" && !note) { feedback.setError("Add feedback for this decision."); return; }
        feedback.setError(""); dialog.setBusy(true);
        const result = await onReview(contract, progress, action, note);
        if (result?.ok === true) { dialog.close("reviewed"); void loadDetailIntoDrawer(contract); } else dialog.setBusy(false);
      },
    });
    const cancel = contractButton({ label: "Cancel", quiet: true, action: "cancel-review", onClick: () => dialog.close("cancelled") });
    dialog = AdminDialog({
      title: action === "approve" ? "Approve submission" : action === "reject" ? "Reject submission" : "Request revision",
      description: `${progress.playerName} · ${titleCase(progress.status)}`,
      content: createElement("div", { className: "admin-contracts-review", children: [createElement("div", { className: "admin-contracts-review__evidence", children: [createElement("strong", { text: "Submitted evidence" }), createElement("p", { text: progress.evidence })] }), feedback.element] }),
      footer: createElement("div", { className: "admin-contracts-review__footer", children: [cancel, submit] }), initialFocus: () => feedback.control,
      onClose: () => queueMicrotask(() => { if (reviewDialog === dialog) { reviewDialog = null; dialog.destroy(); } }),
    });
    reviewDialog = dialog; dialog.open(opener);
  }
  function openReward(contract, progress, opener) {
    destroyLayer(rewardDialog);
    rewardDialog = AdminConfirmDialog({
      title: "Issue contract rewards", message: `Issue configured rewards to ${progress.playerName}?`, detail: "Rewards can only be issued after completion. Duplicate issuance is prevented.", confirmLabel: "Issue rewards", tone: "neutral",
      failureMessage: "Rewards could not be issued. Review the submission state and try again.",
      async onConfirm() { const result = await onIssueRewards(contract, progress); if (result?.ok !== true) throw new Error("CONTRACT_REWARD_FAILED"); void loadDetailIntoDrawer(contract); return true; },
    });
    void rewardDialog.open(opener);
  }
  function openPublish(contract, opener) {
    destroyLayer(publishDialog);
    publishDialog = AdminConfirmDialog({
      title: "Publish contract", message: `Publish ${contract.title}?`, detail: "Publishing makes the contract available according to its targeting rules. Edit the draft first if anything needs to change.", confirmLabel: "Publish contract", tone: "neutral",
      failureMessage: "The contract could not be published.", async onConfirm() { const result = await onPublish(contract); if (result?.ok !== true) throw new Error("CONTRACT_PUBLISH_FAILED"); return true; },
    });
    void publishDialog.open(opener);
  }
  function openArchive(contract, opener) {
    destroyLayer(archiveDialog);
    archiveDialog = AdminConfirmDialog({
      title: "Archive contract", message: `Archive ${contract.title}?`, detail: "Archiving removes the contract from active use while preserving historical progress.", confirmLabel: "Archive contract", tone: "danger",
      failureMessage: "The contract could not be archived.", async onConfirm() { const result = await onArchive(contract); if (result?.ok !== true) throw new Error("CONTRACT_ARCHIVE_FAILED"); return true; },
    });
    void archiveDialog.open(opener);
  }
  async function duplicate(contract, opener) {
    if (opener) opener.disabled = true;
    try { await onDuplicate(contract); } finally { if (opener?.isConnected) opener.disabled = false; }
  }

  const createButton = contractButton({ label: "Create Contract", icon: "plus", action: "create", onClick: (event) => openCreate(event.currentTarget) });
  const refreshButton = contractButton({ label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh", icon: "refresh", quiet: true, action: "refresh", disabled: state.status === ADMIN_DATA_STATES.REFRESHING, onClick: onRefresh });
  const actions = createElement("div", { className: "admin-contracts-route__page-actions", children: [refreshButton, createButton] });
  const route = createElement("div", { className: "admin-contracts-route", dataset: { adminV2State: state.status }, attrs: { "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status) } });
  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) route.append(ContractsSkeleton());
  else if (state.status === ADMIN_DATA_STATES.FAILED) route.append(AdminErrorState({ title: "Contracts could not be loaded", message: state.error?.userMessage, requestId: state.error?.requestId, retryAfterSeconds: state.error?.retryAfterSeconds, retry: state.error?.retryable ? { label: "Retry Contracts", onClick: onRefresh } : null }));
  else if (state.data) {
    const content = catalog({ model: state.data, filters, onFiltersChange, onOpenDetail: openDetail, onEdit: openEdit, onPublish: openPublish, onArchive: openArchive, onDuplicate: duplicate, onAdd: (event) => openCreate(event?.currentTarget) });
    if (state.status === ADMIN_DATA_STATES.STALE) route.append(AdminStaleState({ message: state.error?.userMessage || "Showing the last contract snapshot. Refresh before changing a contract.", retry: { label: "Retry", onClick: onRefresh }, content }));
    else { if (state.status === ADMIN_DATA_STATES.REFRESHING) route.append(createElement("div", { className: "admin-contracts-route__refresh-state", attrs: { role: "status" }, children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing contracts…"] })); route.append(content); }
  }
  const frame = AdminPageFrame({ eyebrow: "Game administration", title: "Contracts Management", description: "Create and edit draft contracts, publish assignments, review participant work, issue rewards, duplicate, and archive contracts for the current game.", actions, content: route });
  frame.element.addEventListener("admin-route-intent", (event) => {
    if (event.detail?.intent === "create" && state.status !== ADMIN_DATA_STATES.STALE) openCreate(createButton);
  });
  return {
    ...frame,
    destroy() {
      if (destroyed) return; destroyed = true; detailSequence += 1; selectedContract = null;
      [formDialog, detailDrawer, reviewDialog, archiveDialog, publishDialog, rewardDialog].forEach(destroyLayer);
      formDialog = detailDrawer = reviewDialog = archiveDialog = publishDialog = rewardDialog = null;
    },
  };
}
