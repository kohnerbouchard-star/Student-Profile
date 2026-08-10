import {
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : fallback;
}
function displayAmount(value, currencyCode) {
  if (!Number.isFinite(Number(value))) return "—";
  const code = String(currencyCode || "").trim().toUpperCase();
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${code ? ` ${code}` : ""}`;
}
function displayPercent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : "—";
}
function displayDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
function actionButton({ label, icon, quiet = false, disabled = false, onClick, action }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { loansAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}
function statusPill(status) {
  return createElement("span", { className: "admin-banking-route__status", dataset: { status: String(status || "unknown").toLowerCase() }, text: titleCase(status) });
}
function borrowerCopy(value) {
  return createElement("div", { className: "admin-u-stack", children: [
    createElement("strong", { text: value?.displayName || "Player unavailable" }),
    value?.playerIdentifier ? createElement("small", { className: "admin-u-muted", text: value.playerIdentifier }) : null,
    value?.rosterLabel ? createElement("small", { className: "admin-u-muted", text: value.rosterLabel }) : null,
  ] });
}
function section(title, description, content) {
  return createElement("section", { className: "admin-u-stack", children: [
    createElement("header", { className: "admin-u-stack", children: [createElement("h2", { text: title }), description ? createElement("p", { className: "admin-u-muted", text: description }) : null] }),
    content,
  ] });
}
function summary(model) {
  const entries = [
    ["Open loans", model.summary.openLoanCount], ["Pending applications", model.summary.pendingApplicationCount],
    ["Delinquent", model.summary.delinquentCount], ["Defaulted", model.summary.defaultedCount],
    ["Paid loans", model.summary.paidCount], ["Posted payments", model.summary.paymentCount],
  ];
  return createElement("dl", { className: "admin-banking-route__summary", attrs: { "aria-label": "Loan portfolio summary" }, children: entries.map(([label, value]) => createElement("div", { className: "admin-banking-route__metric", children: [createElement("dt", { text: label }), createElement("dd", { text: Number(value).toLocaleString() })] })) });
}
function currencyTable(model) {
  return AdminDataTable({ caption: "Outstanding loan exposure by currency", rowKey: (row) => row.currencyCode, rows: model.currencyTotals, columns: [
    { key: "currencyCode", label: "Currency", rowHeader: true },
    { key: "principal", label: "Principal", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "accruedInterest", label: "Accrued interest", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "outstanding", label: "Outstanding", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
  ], emptyState: AdminEmptyState({ title: "No outstanding exposure", message: "There are no active, delinquent, or restructured loan balances.", compact: true }) }).element;
}
function dialogFooter({ onCancel, onSubmit, submitLabel }) {
  return createElement("div", { className: "admin-u-actions", children: [
    actionButton({ label: "Cancel", quiet: true, action: "cancel-dialog", onClick: onCancel }),
    actionButton({ label: submitLabel, action: "submit-dialog", onClick: onSubmit }),
  ] });
}
function createReviewDialog({ application, decision, onReview, opener, onDestroy }) {
  const reason = AdminField({ name: "loan-review-reason", label: "Review reason", type: "textarea", required: true, placeholder: decision === "approve" ? "Why is this application approved?" : "Why is this application declined?" });
  let dialog;
  async function submit() {
    const value = reason.getValue().trim();
    reason.setError(value.length >= 2 ? "" : "Enter at least 2 characters.");
    if (value.length < 2) return;
    dialog.setBusy(true);
    const result = await onReview(application, decision, value);
    dialog.setBusy(false);
    if (result?.ok) dialog.close("submitted");
  }
  dialog = AdminDialog({ title: decision === "approve" ? "Approve loan application" : "Decline loan application", description: `${application.borrower.displayName} · ${displayAmount(application.amount, application.product.currencyCode)}`, content: reason.element, footer: dialogFooter({ onCancel: () => dialog.close("cancel"), onSubmit: submit, submitLabel: decision === "approve" ? "Approve" : "Decline" }), initialFocus: reason.control, onClose: () => onDestroy(dialog) });
  dialog.open(opener);
  return dialog;
}
function createRestructureDialog({ loan, onRestructure, opener, onDestroy }) {
  const payment = AdminField({ name: "loan-scheduled-payment", label: "Scheduled payment", type: "number", required: true, value: loan.scheduledPayment });
  payment.control.setAttribute("min", "0.01"); payment.control.setAttribute("step", "0.01");
  const nextDue = AdminField({ name: "loan-next-due", label: "Next due date", type: "datetime-local", required: true, value: new Date(loan.nextDueAt).toISOString().slice(0, 16) });
  const reason = AdminField({ name: "loan-restructure-reason", label: "Reason", type: "textarea", required: true, placeholder: "Document why repayment terms are being changed." });
  let dialog;
  async function submit() {
    const scheduledPayment = Number(payment.getValue()); const nextDueAt = nextDue.getValue(); const reasonValue = reason.getValue().trim();
    payment.setError(Number.isFinite(scheduledPayment) && scheduledPayment > 0 ? "" : "Enter an amount greater than zero.");
    nextDue.setError(Number.isFinite(Date.parse(nextDueAt)) ? "" : "Enter a valid due date.");
    reason.setError(reasonValue.length >= 8 ? "" : "Enter at least 8 characters.");
    if (!(Number.isFinite(scheduledPayment) && scheduledPayment > 0) || !Number.isFinite(Date.parse(nextDueAt)) || reasonValue.length < 8) return;
    dialog.setBusy(true); const result = await onRestructure(loan, { scheduledPayment, nextDueAt, reason: reasonValue }); dialog.setBusy(false); if (result?.ok) dialog.close("submitted");
  }
  dialog = AdminDialog({ title: "Restructure loan", description: `${loan.borrower.displayName} · ${loan.product.name}`, content: createElement("div", { className: "admin-u-stack", children: [payment.element, nextDue.element, reason.element] }), footer: dialogFooter({ onCancel: () => dialog.close("cancel"), onSubmit: submit, submitLabel: "Save terms" }), initialFocus: payment.control, onClose: () => onDestroy(dialog) });
  dialog.open(opener); return dialog;
}
function createProductDialog({ product, onUpsert, opener, onDestroy }) {
  const fields = {
    name: AdminField({ name: "loan-product-name", label: "Name", required: true, value: product?.name || "" }),
    borrowerType: AdminField({ name: "loan-product-borrower", label: "Borrower type", type: "select", required: true, value: product?.borrowerType || "player", options: [{ value: "player", label: "Player" }, { value: "business", label: "Business" }] }),
    status: AdminField({ name: "loan-product-status", label: "Status", type: "select", required: true, value: product?.status || "active", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "retired", label: "Retired" }] }),
    currencyCode: AdminField({ name: "loan-product-currency", label: "Currency code", required: true, value: product?.currencyCode || "" }),
    minimumAmount: AdminField({ name: "loan-product-min", label: "Minimum amount", type: "number", required: true, value: product?.minimumAmount ?? "" }),
    maximumAmount: AdminField({ name: "loan-product-max", label: "Maximum amount", type: "number", required: true, value: product?.maximumAmount ?? "" }),
    annualRate: AdminField({ name: "loan-product-rate", label: "Annual rate", type: "number", required: true, hint: "Decimal form, for example 0.08 for 8%.", value: product?.annualRate ?? "" }),
    originationFeeRate: AdminField({ name: "loan-product-fee", label: "Origination fee rate", type: "number", required: true, hint: "Decimal form, for example 0.01 for 1%.", value: product?.originationFeeRate ?? 0 }),
    termCycles: AdminField({ name: "loan-product-term", label: "Term cycles", type: "number", required: true, value: product?.termCycles ?? "" }),
    paymentFrequencyCycles: AdminField({ name: "loan-product-frequency", label: "Payment frequency cycles", type: "number", required: true, value: product?.paymentFrequencyCycles ?? 1 }),
    minimumCreditScore: AdminField({ name: "loan-product-credit", label: "Minimum credit score", type: "number", required: true, value: product?.minimumCreditScore ?? 550 }),
    maximumPaymentToIncome: AdminField({ name: "loan-product-pti", label: "Maximum payment-to-income", type: "number", required: true, hint: "Decimal form, for example 0.35.", value: product?.maximumPaymentToIncome ?? 0.35 }),
    delinquencyGraceDays: AdminField({ name: "loan-product-grace", label: "Delinquency grace days", type: "number", required: true, value: product?.delinquencyGraceDays ?? 7 }),
    defaultAfterDays: AdminField({ name: "loan-product-default", label: "Default after days", type: "number", required: true, value: product?.defaultAfterDays ?? 30 }),
    disclosureText: AdminField({ name: "loan-product-disclosure", label: "Disclosure text", type: "textarea", required: true, value: product?.disclosureText || "" }),
    reason: AdminField({ name: "loan-product-reason", label: "Administrative reason", type: "textarea", required: true, placeholder: "Why is this product being created or changed?" }),
  };
  for (const key of ["minimumAmount", "maximumAmount", "annualRate", "originationFeeRate", "termCycles", "paymentFrequencyCycles", "minimumCreditScore", "maximumPaymentToIncome", "delinquencyGraceDays", "defaultAfterDays"]) fields[key].control.setAttribute("step", ["termCycles", "paymentFrequencyCycles", "minimumCreditScore", "delinquencyGraceDays", "defaultAfterDays"].includes(key) ? "1" : "0.01");
  let dialog;
  async function submit() {
    const input = { name: fields.name.getValue().trim(), borrowerType: fields.borrowerType.getValue(), status: fields.status.getValue(), currencyCode: fields.currencyCode.getValue().trim().toUpperCase(), minimumAmount: Number(fields.minimumAmount.getValue()), maximumAmount: Number(fields.maximumAmount.getValue()), annualRate: Number(fields.annualRate.getValue()), originationFeeRate: Number(fields.originationFeeRate.getValue()), termCycles: Number(fields.termCycles.getValue()), paymentFrequencyCycles: Number(fields.paymentFrequencyCycles.getValue()), minimumCreditScore: Number(fields.minimumCreditScore.getValue()), maximumPaymentToIncome: Number(fields.maximumPaymentToIncome.getValue()), delinquencyGraceDays: Number(fields.delinquencyGraceDays.getValue()), defaultAfterDays: Number(fields.defaultAfterDays.getValue()), disclosureText: fields.disclosureText.getValue().trim(), reason: fields.reason.getValue().trim() };
    const valid = input.name.length >= 2 && /^[A-Z0-9]{3,16}$/.test(input.currencyCode) && Number.isFinite(input.minimumAmount) && input.minimumAmount > 0 && Number.isFinite(input.maximumAmount) && input.maximumAmount >= input.minimumAmount && Number.isFinite(input.annualRate) && input.annualRate >= 0 && input.annualRate <= 1 && Number.isFinite(input.originationFeeRate) && input.originationFeeRate >= 0 && input.originationFeeRate <= 0.25 && Number.isInteger(input.termCycles) && input.termCycles >= 1 && input.termCycles <= 240 && Number.isInteger(input.paymentFrequencyCycles) && input.paymentFrequencyCycles >= 1 && input.paymentFrequencyCycles <= input.termCycles && Number.isInteger(input.minimumCreditScore) && input.minimumCreditScore >= 300 && input.minimumCreditScore <= 850 && Number.isFinite(input.maximumPaymentToIncome) && input.maximumPaymentToIncome >= 0.05 && input.maximumPaymentToIncome <= 0.75 && Number.isInteger(input.delinquencyGraceDays) && input.delinquencyGraceDays >= 0 && input.delinquencyGraceDays <= 90 && Number.isInteger(input.defaultAfterDays) && input.defaultAfterDays >= input.delinquencyGraceDays && input.defaultAfterDays <= 365 && input.disclosureText.length >= 20 && input.reason.length >= 2;
    if (!valid) { fields.reason.setError("Review the required fields and allowed ranges before saving."); return; }
    fields.reason.setError(""); dialog.setBusy(true); const result = await onUpsert(product, input); dialog.setBusy(false); if (result?.ok) dialog.close("submitted");
  }
  dialog = AdminDialog({ title: product ? "Edit loan product" : "Create loan product", description: "Product settings are enforced by the authoritative loan runtime.", content: createElement("div", { className: "admin-u-stack", children: Object.values(fields).map((field) => field.element) }), footer: dialogFooter({ onCancel: () => dialog.close("cancel"), onSubmit: submit, submitLabel: product ? "Save product" : "Create product" }), size: "large", initialFocus: fields.name.control, onClose: () => onDestroy(dialog) });
  dialog.open(opener); return dialog;
}
function applicationsTable(model, onOpenReview) {
  return AdminDataTable({ caption: "Loan applications", rowKey: (application) => application.id, rows: model.applications, columns: [
    { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy }, { key: "product", label: "Product", render: (value) => value.name },
    { key: "amount", label: "Amount", align: "end", render: (value, row) => displayAmount(value, row.product.currencyCode) }, { key: "creditScore", label: "Credit", align: "end" },
    { key: "affordabilityRatio", label: "Payment / income", align: "end", render: displayPercent }, { key: "status", label: "Status", render: statusPill }, { key: "createdAt", label: "Submitted", render: displayDate },
    { key: "actions", label: "Actions", align: "end", render: (_value, application) => application.status === "pending_review" ? createElement("div", { className: "admin-u-actions", children: [actionButton({ label: "Approve", quiet: true, action: "approve-application", onClick: (event) => onOpenReview(application, "approve", event.currentTarget) }), actionButton({ label: "Decline", quiet: true, action: "decline-application", onClick: (event) => onOpenReview(application, "decline", event.currentTarget) })] }) : createElement("span", { className: "admin-u-muted", text: "Reviewed" }) },
  ], emptyState: AdminEmptyState({ title: "No loan applications", message: "No applications have been submitted for this game.", compact: true }) }).element;
}
function loansTable(model, onOpenRestructure) {
  return AdminDataTable({ caption: "Authoritative loan portfolio", rowKey: (loan) => loan.id, rows: model.loans, columns: [
    { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy }, { key: "product", label: "Product", render: (value) => value.name }, { key: "status", label: "Status", render: statusPill },
    { key: "outstanding", label: "Outstanding", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "annualRate", label: "APR", align: "end", render: displayPercent },
    { key: "scheduledPayment", label: "Payment", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "nextDueAt", label: "Next due", render: displayDate },
    { key: "actions", label: "Actions", align: "end", render: (_value, loan) => ["active", "delinquent", "restructured"].includes(loan.status) ? actionButton({ label: "Restructure", quiet: true, action: "restructure-loan", onClick: (event) => onOpenRestructure(loan, event.currentTarget) }) : createElement("span", { className: "admin-u-muted", text: "Closed" }) },
  ], emptyState: AdminEmptyState({ title: "No loans", message: "No approved loans exist for this game.", compact: true }) }).element;
}
function productsTable(model, onOpenProduct) {
  return AdminDataTable({ caption: "Loan products", rowKey: (product) => product.id, rows: model.products, columns: [
    { key: "name", label: "Product", rowHeader: true }, { key: "borrowerType", label: "Borrower", render: titleCase }, { key: "currencyCode", label: "Currency" },
    { key: "minimumAmount", label: "Minimum", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "maximumAmount", label: "Maximum", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "annualRate", label: "APR", align: "end", render: displayPercent }, { key: "status", label: "Status", render: statusPill }, { key: "actions", label: "Actions", align: "end", render: (_value, product) => actionButton({ label: "Edit", quiet: true, action: "edit-product", onClick: (event) => onOpenProduct(product, event.currentTarget) }) },
  ], emptyState: AdminEmptyState({ title: "No loan products", message: "Create a loan product to make lending available.", compact: true }) }).element;
}
function paymentsTable(model) {
  return AdminDataTable({ caption: "Loan repayment history", rowKey: (payment) => payment.id, rows: model.payments, columns: [
    { key: "createdAt", label: "Posted", render: displayDate }, { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy }, { key: "loanId", label: "Loan", render: (value) => value || "Unavailable" },
    { key: "amount", label: "Amount", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "principalAmount", label: "Principal", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "interestAmount", label: "Interest", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "status", label: "Status", render: statusPill },
  ], emptyState: AdminEmptyState({ title: "No repayments", message: "No loan payments have been posted yet.", compact: true }) }).element;
}
function resolvedContent(model, handlers) {
  return createElement("div", { className: "admin-u-stack", children: [summary(model), createElement("aside", { className: "admin-banking-route__contract-note", attrs: { "aria-label": "Loan authority boundary" }, children: [AdminIcon({ name: "info", size: 18 }), createElement("p", { text: "This surface uses public loan, payment, application, product, and business identifiers. Internal ownership UUIDs, ledger IDs, request hashes, and idempotency records are not returned to the browser." })] }), section("Exposure by currency", "Currencies remain separate and are never cross-summed.", currencyTable(model)), section("Applications", "Review pending applications using the existing authoritative approval workflow.", applicationsTable(model, handlers.onOpenReview)), section("Loan portfolio", "Outstanding principal, accrued interest, due dates, delinquency and default states come directly from the authoritative loan runtime.", loansTable(model, handlers.onOpenRestructure)), section("Loan products", "Configure the lending catalog without changing repayment or ledger authority.", productsTable(model, handlers.onOpenProduct)), section("Repayment history", "Posted repayments only; repayment itself remains a player-owned action.", paymentsTable(model))] });
}

export function LoansRoute({ state, onRefresh = async () => {}, onReviewApplication = async () => ({ ok: false }), onRestructureLoan = async () => ({ ok: false }), onUpsertProduct = async () => ({ ok: false }), onServiceLoans = async () => ({ ok: false }) } = {}) {
  const dialogs = new Set(); let destroyed = false;
  const destroyDialog = (dialog) => { dialogs.delete(dialog); dialog.destroy(); };
  const openReview = (application, decision, opener) => { const dialog = createReviewDialog({ application, decision, onReview: onReviewApplication, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const openRestructure = (loan, opener) => { const dialog = createRestructureDialog({ loan, onRestructure: onRestructureLoan, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const openProduct = (product, opener) => { const dialog = createProductDialog({ product, onUpsert: onUpsertProduct, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const refresh = actionButton({ label: state?.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh", icon: "refresh", quiet: true, disabled: state?.status === ADMIN_DATA_STATES.REFRESHING, action: "refresh", onClick: onRefresh });
  const service = actionButton({ label: "Service statuses", icon: "banking", quiet: true, action: "service-statuses", onClick: async (event) => { event.currentTarget.disabled = true; await onServiceLoans(); if (event.currentTarget.isConnected) event.currentTarget.disabled = false; } });
  const createProduct = actionButton({ label: "New product", icon: "plus", action: "create-product", onClick: (event) => openProduct(null, event.currentTarget) });
  const actions = createElement("div", { className: "admin-u-actions", children: [refresh, service, createProduct] });
  let content;
  if (!state || state.status === ADMIN_DATA_STATES.INITIAL_LOADING) content = AdminSkeleton({ label: "Loading loan supervision", count: 7, shape: "row" });
  else if (state.status === ADMIN_DATA_STATES.FAILED) content = AdminErrorState({ title: "Loan supervision unavailable", message: state.error?.userMessage, requestId: state.error?.requestId, retryAfterSeconds: state.error?.retryAfterSeconds, retry: state.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh } });
  else if (state.data) { const resolved = resolvedContent(state.data, { onOpenReview: openReview, onOpenRestructure: openRestructure, onOpenProduct: openProduct }); content = state.status === ADMIN_DATA_STATES.STALE ? AdminStaleState({ message: "Showing the last loaded loan portfolio while refresh is unavailable.", retry: { label: "Refresh", onClick: onRefresh }, content: resolved }) : resolved; }
  else content = AdminEmptyState({ title: "No loan data", message: "Create a loan product or wait for player applications." });
  const frame = AdminPageFrame({ eyebrow: "Economy supervision", title: "Loans", description: "Authoritative lending portfolio, applications, product configuration, repayment history, recovery, and servicing controls.", actions, content });
  frame.element.dataset.implementationStatus = "configured";
  return Object.freeze({ element: frame.element, destroy() { if (destroyed) return; destroyed = true; [...dialogs].forEach((dialog) => dialog.destroy()); dialogs.clear(); } });
}
