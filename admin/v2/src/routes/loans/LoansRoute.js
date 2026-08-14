import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
  AdminValidationSummary,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { fromAdminDateTimeLocalValue, toAdminDateTimeLocalValue } from "../../core/date-time.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : fallback;
}
function displayAmount(value, currencyCode) {
  if (!Number.isFinite(Number(value))) return "—";
  const code = String(currencyCode || "").trim().toUpperCase();
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${code ? ` ${code}` : ""}`;
}
function displayPercent(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : "—"; }
function displayDate(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Not available";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
function actionButton({ label, icon, quiet = false, disabled = false, disabledReason = "", onClick, action, tone = "" }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled, title: disabled && disabledReason ? disabledReason : null },
    dataset: { loansAction: action, tone },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}
function statusPill(status) { return createElement("span", { className: "admin-banking-route__status", dataset: { status: String(status || "unknown").toLowerCase() }, text: titleCase(status) }); }
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
    ["Open loans", model.summary.openLoanCount], ["Pending applications", model.summary.pendingApplicationCount], ["Delinquent", model.summary.delinquentCount],
    ["Defaulted", model.summary.defaultedCount], ["Paid loans", model.summary.paidCount], ["Posted payments", model.summary.paymentCount],
  ];
  return createElement("dl", { className: "admin-banking-route__summary", attrs: { "aria-label": "Loan portfolio summary" }, children: entries.map(([label, value]) => createElement("div", { className: "admin-banking-route__metric", children: [createElement("dt", { text: label }), createElement("dd", { text: Number(value).toLocaleString() })] })) });
}
function currencyTable(model) {
  return AdminDataTable({
    caption: "Outstanding loan exposure by currency", rowKey: (row) => row.currencyCode, rows: model.currencyTotals,
    columns: [
      { key: "currencyCode", label: "Currency", rowHeader: true },
      { key: "principal", label: "Principal", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
      { key: "accruedInterest", label: "Accrued interest", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
      { key: "outstanding", label: "Outstanding", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    ], emptyState: AdminEmptyState({ title: "No outstanding exposure", message: "There are no active, delinquent, or restructured loan balances.", compact: true }),
  }).element;
}
function dialogFooter({ onCancel, onSubmit, submitLabel }) {
  return createElement("div", { className: "admin-u-actions", children: [
    actionButton({ label: "Cancel", quiet: true, action: "cancel-dialog", onClick: onCancel }),
    actionButton({ label: submitLabel, action: "submit-dialog", onClick: onSubmit }),
  ] });
}
function createReviewDialog({ application, decision, onReview, opener, onDestroy }) {
  const reason = AdminField({ name: "loan-review-reason", label: "Review reason", type: "textarea", rows: 4, required: true, minLength: 2, maxLength: 1000, placeholder: decision === "approve" ? "Why is this application approved?" : "Why is this application declined?" });
  let dialog;
  async function submit() {
    const value = reason.getValue().trim();
    reason.setError(value.length >= 2 ? "" : "Enter at least 2 characters.");
    if (value.length < 2) return;
    dialog.setBusy(true);
    const result = await onReview(application, decision, value);
    if (result?.ok) dialog.close("submitted"); else dialog.setBusy(false);
  }
  dialog = AdminDialog({
    title: decision === "approve" ? "Approve loan application" : "Decline loan application",
    description: `${application.borrower.displayName} · ${displayAmount(application.amount, application.product.currencyCode)}`,
    content: reason.element, footer: dialogFooter({ onCancel: () => dialog.close("cancelled"), onSubmit: submit, submitLabel: decision === "approve" ? "Approve" : "Decline" }),
    initialFocus: reason.control, onClose: () => onDestroy(dialog),
  });
  dialog.open(opener); return dialog;
}

function createRestructureDialog({ loan, onRestructure, opener, onDestroy }) {
  const payment = AdminField({ name: "loan-scheduled-payment", label: "Scheduled payment", type: "number", required: true, value: loan.scheduledPayment, min: 0.01, step: 0.01, inputMode: "decimal" });
  const nextDue = AdminField({ name: "loan-next-due", label: "Next due date", type: "datetime-local", required: true, value: toAdminDateTimeLocalValue(loan.nextDueAt) });
  const reason = AdminField({ name: "loan-restructure-reason", label: "Reason", type: "textarea", rows: 4, required: true, minLength: 8, maxLength: 1000, placeholder: "Document why repayment terms are being changed." });
  const validation = AdminValidationSummary();
  let pending = null;
  let dialog;
  const confirm = AdminConfirmDialog({
    title: "Apply restructured loan terms?",
    message: `Review the proposed repayment changes for ${loan.borrower.displayName}.`,
    confirmLabel: "Apply new terms",
    tone: "danger",
    async onConfirm() {
      if (!pending) return false;
      const result = await onRestructure(loan, pending);
      if (result?.ok) { dialog.close("submitted"); return true; }
      return false;
    },
  });
  async function review() {
    const errors = [];
    const scheduledPayment = Number(payment.getValue());
    const nextDueAt = fromAdminDateTimeLocalValue(nextDue.getValue());
    const reasonValue = reason.getValue().trim();
    payment.setError(Number.isFinite(scheduledPayment) && scheduledPayment > 0 ? "" : "Enter an amount greater than zero.");
    nextDue.setError(nextDueAt ? "" : "Enter a valid due date.");
    reason.setError(reasonValue.length >= 8 ? "" : "Enter at least 8 characters.");
    if (!(Number.isFinite(scheduledPayment) && scheduledPayment > 0)) errors.push({ fieldId: payment.control.id, label: "Scheduled payment", message: "Enter an amount greater than zero." });
    if (!nextDueAt) errors.push({ fieldId: nextDue.control.id, label: "Next due date", message: "Enter a valid due date." });
    if (reasonValue.length < 8) errors.push({ fieldId: reason.control.id, label: "Reason", message: "Enter at least 8 characters." });
    validation.setErrors(errors, { focus: errors.length > 0 });
    if (errors.length) return;
    pending = { scheduledPayment, nextDueAt, reason: reasonValue };
    confirm.setChanges([
      { label: "Scheduled payment", before: displayAmount(loan.scheduledPayment, loan.currencyCode), after: displayAmount(scheduledPayment, loan.currencyCode) },
      { label: "Next due", before: displayDate(loan.nextDueAt), after: displayDate(nextDueAt) },
      { label: "Reason", after: reasonValue },
    ]);
    void confirm.open(dialog.panel.querySelector("[data-loans-action='submit-dialog']"));
  }
  dialog = AdminDialog({
    title: "Restructure loan", description: `${loan.borrower.displayName} · ${loan.product.name}`,
    content: createElement("div", { className: "admin-u-stack", children: [validation.element, payment.element, nextDue.element, reason.element] }),
    footer: dialogFooter({ onCancel: () => dialog.close("cancelled"), onSubmit: review, submitLabel: "Review new terms" }),
    initialFocus: payment.control,
    onClose: () => { confirm.destroy(); onDestroy(dialog); },
  });
  dialog.open(opener); return dialog;
}

function createProductDialog({ product, onUpsert, opener, onDestroy }) {
  const fields = {
    name: AdminField({ name: "loan-product-name", label: "Name", required: true, value: product?.name || "", minLength: 2, maxLength: 120 }),
    borrowerType: AdminField({ name: "loan-product-borrower", label: "Borrower type", type: "select", required: true, value: product?.borrowerType || "player", options: [{ value: "player", label: "Player" }, { value: "business", label: "Business" }] }),
    status: AdminField({ name: "loan-product-status", label: "Status", type: "select", required: true, value: product?.status || "active", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "retired", label: "Retired" }] }),
    currencyCode: AdminField({ name: "loan-product-currency", label: "Currency code", required: true, value: product?.currencyCode || "", pattern: "[A-Z0-9]{3,16}", maxLength: 16 }),
    minimumAmount: AdminField({ name: "loan-product-min", label: "Minimum amount", type: "number", required: true, value: product?.minimumAmount ?? "", min: 0.01, step: 0.01 }),
    maximumAmount: AdminField({ name: "loan-product-max", label: "Maximum amount", type: "number", required: true, value: product?.maximumAmount ?? "", min: 0.01, step: 0.01 }),
    annualRate: AdminField({ name: "loan-product-rate", label: "Annual rate", type: "number", required: true, hint: "Decimal form: 0.08 = 8%.", value: product?.annualRate ?? "", min: 0, max: 1, step: 0.01 }),
    originationFeeRate: AdminField({ name: "loan-product-fee", label: "Origination fee rate", type: "number", required: true, hint: "Decimal form: 0.01 = 1%.", value: product?.originationFeeRate ?? 0, min: 0, max: 0.25, step: 0.01 }),
    termCycles: AdminField({ name: "loan-product-term", label: "Term cycles", type: "number", required: true, value: product?.termCycles ?? "", min: 1, max: 240, step: 1 }),
    paymentFrequencyCycles: AdminField({ name: "loan-product-frequency", label: "Payment frequency cycles", type: "number", required: true, value: product?.paymentFrequencyCycles ?? 1, min: 1, step: 1 }),
    minimumCreditScore: AdminField({ name: "loan-product-credit", label: "Minimum credit score", type: "number", required: true, value: product?.minimumCreditScore ?? 550, min: 300, max: 850, step: 1 }),
    maximumPaymentToIncome: AdminField({ name: "loan-product-pti", label: "Maximum payment-to-income", type: "number", required: true, hint: "Decimal form: 0.35 = 35%.", value: product?.maximumPaymentToIncome ?? 0.35, min: 0.05, max: 0.75, step: 0.01 }),
    delinquencyGraceDays: AdminField({ name: "loan-product-grace", label: "Delinquency grace days", type: "number", required: true, value: product?.delinquencyGraceDays ?? 7, min: 0, max: 90, step: 1 }),
    defaultAfterDays: AdminField({ name: "loan-product-default", label: "Default after days", type: "number", required: true, value: product?.defaultAfterDays ?? 30, min: 0, max: 365, step: 1 }),
    disclosureText: AdminField({ name: "loan-product-disclosure", label: "Disclosure text", type: "textarea", rows: 5, required: true, value: product?.disclosureText || "", minLength: 20, maxLength: 4000 }),
    reason: AdminField({ name: "loan-product-reason", label: "Administrative reason", type: "textarea", rows: 3, required: true, minLength: 2, maxLength: 1000, placeholder: "Why is this product being created or changed?" }),
  };
  const validation = AdminValidationSummary();
  let dialog;
  function input() {
    return {
      name: fields.name.getValue().trim(), borrowerType: fields.borrowerType.getValue(), status: fields.status.getValue(), currencyCode: fields.currencyCode.getValue().trim().toUpperCase(),
      minimumAmount: Number(fields.minimumAmount.getValue()), maximumAmount: Number(fields.maximumAmount.getValue()), annualRate: Number(fields.annualRate.getValue()), originationFeeRate: Number(fields.originationFeeRate.getValue()),
      termCycles: Number(fields.termCycles.getValue()), paymentFrequencyCycles: Number(fields.paymentFrequencyCycles.getValue()), minimumCreditScore: Number(fields.minimumCreditScore.getValue()), maximumPaymentToIncome: Number(fields.maximumPaymentToIncome.getValue()),
      delinquencyGraceDays: Number(fields.delinquencyGraceDays.getValue()), defaultAfterDays: Number(fields.defaultAfterDays.getValue()), disclosureText: fields.disclosureText.getValue().trim(), reason: fields.reason.getValue().trim(),
    };
  }
  function validate() {
    Object.values(fields).forEach((field) => field.setError(""));
    const value = input();
    const errors = [];
    const check = (name, valid, message) => {
      if (valid) return;
      fields[name].setError(message);
      errors.push({ fieldId: fields[name].control.id, label: fields[name].label.textContent.replace(/Required/g, "").trim(), message });
    };
    check("name", value.name.length >= 2, "Use at least 2 characters.");
    check("currencyCode", /^[A-Z0-9]{3,16}$/.test(value.currencyCode), "Use a 3–16 character currency code.");
    check("minimumAmount", Number.isFinite(value.minimumAmount) && value.minimumAmount > 0, "Minimum amount must be greater than zero.");
    check("maximumAmount", Number.isFinite(value.maximumAmount) && value.maximumAmount >= value.minimumAmount, "Maximum amount must be at least the minimum amount.");
    check("annualRate", Number.isFinite(value.annualRate) && value.annualRate >= 0 && value.annualRate <= 1, "Annual rate must be between 0 and 1.");
    check("originationFeeRate", Number.isFinite(value.originationFeeRate) && value.originationFeeRate >= 0 && value.originationFeeRate <= 0.25, "Origination fee rate must be between 0 and 0.25.");
    check("termCycles", Number.isInteger(value.termCycles) && value.termCycles >= 1 && value.termCycles <= 240, "Term cycles must be a whole number from 1 to 240.");
    check("paymentFrequencyCycles", Number.isInteger(value.paymentFrequencyCycles) && value.paymentFrequencyCycles >= 1 && value.paymentFrequencyCycles <= value.termCycles, "Payment frequency must be between 1 and the term length.");
    check("minimumCreditScore", Number.isInteger(value.minimumCreditScore) && value.minimumCreditScore >= 300 && value.minimumCreditScore <= 850, "Credit score must be from 300 to 850.");
    check("maximumPaymentToIncome", Number.isFinite(value.maximumPaymentToIncome) && value.maximumPaymentToIncome >= 0.05 && value.maximumPaymentToIncome <= 0.75, "Payment-to-income must be from 0.05 to 0.75.");
    check("delinquencyGraceDays", Number.isInteger(value.delinquencyGraceDays) && value.delinquencyGraceDays >= 0 && value.delinquencyGraceDays <= 90, "Grace days must be a whole number from 0 to 90.");
    check("defaultAfterDays", Number.isInteger(value.defaultAfterDays) && value.defaultAfterDays >= value.delinquencyGraceDays && value.defaultAfterDays <= 365, "Default days must be at least the grace period and no more than 365.");
    check("disclosureText", value.disclosureText.length >= 20, "Disclosure text must contain at least 20 characters.");
    check("reason", value.reason.length >= 2, "Enter an administrative reason.");
    validation.setErrors(errors, { focus: errors.length > 0 });
    return errors.length ? null : value;
  }
  async function submit() {
    const value = validate();
    if (!value) return;
    dialog.setBusy(true);
    const result = await onUpsert(product, value);
    if (result?.ok) dialog.close("submitted"); else dialog.setBusy(false);
  }
  const group = (legend, names) => createElement("fieldset", { className: "admin-loans-product-group", children: [
    createElement("legend", { text: legend }), createElement("div", { className: "admin-loans-product-grid", children: names.map((name) => fields[name].element) }),
  ] });
  const content = createElement("div", { className: "admin-u-stack", children: [
    validation.element,
    group("Basics", ["name", "borrowerType", "status", "currencyCode"]),
    group("Pricing and limits", ["minimumAmount", "maximumAmount", "annualRate", "originationFeeRate"]),
    group("Repayment terms", ["termCycles", "paymentFrequencyCycles", "delinquencyGraceDays", "defaultAfterDays"]),
    group("Eligibility", ["minimumCreditScore", "maximumPaymentToIncome"]),
    group("Disclosure and audit", ["disclosureText", "reason"]),
  ] });
  dialog = AdminDialog({
    title: product ? "Edit loan product" : "Create loan product",
    description: "Configure lending terms in grouped sections. Validation identifies the exact field that needs attention.",
    content, footer: dialogFooter({ onCancel: () => dialog.close("cancelled"), onSubmit: submit, submitLabel: product ? "Save product" : "Create product" }),
    size: "large", initialFocus: fields.name.control, onClose: () => onDestroy(dialog),
  });
  dialog.open(opener); return dialog;
}

function applicationsTable(model, onOpenReview) {
  return AdminDataTable({ caption: "Loan applications", rowKey: (application) => application.id, rows: model.applications, columns: [
    { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy }, { key: "product", label: "Product", render: (value) => value.name },
    { key: "amount", label: "Amount", align: "end", render: (value, row) => displayAmount(value, row.product.currencyCode) }, { key: "creditScore", label: "Credit", align: "end" },
    { key: "affordabilityRatio", label: "Payment / income", align: "end", render: displayPercent }, { key: "status", label: "Status", render: statusPill }, { key: "createdAt", label: "Submitted", sortValue: (value) => Date.parse(value || "") || 0, render: displayDate },
    { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, application) => application.status === "pending_review" ? createElement("div", { className: "admin-u-actions", children: [
      actionButton({ label: "Approve", quiet: true, action: "approve-application", onClick: (event) => onOpenReview(application, "approve", event.currentTarget) }),
      actionButton({ label: "Decline", quiet: true, tone: "danger", action: "decline-application", onClick: (event) => onOpenReview(application, "decline", event.currentTarget) }),
    ] }) : createElement("span", { className: "admin-u-muted", text: titleCase(application.status) }) },
  ], emptyState: AdminEmptyState({ title: "No applications", message: "No loan applications are available for review.", compact: true }) }).element;
}
function loansTable(model, onOpenRestructure) {
  return AdminDataTable({ caption: "Loan portfolio", rowKey: (loan) => loan.id, rows: model.loans, columns: [
    { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy }, { key: "product", label: "Product", render: (value) => value.name }, { key: "status", label: "Status", render: statusPill },
    { key: "outstanding", label: "Outstanding", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "annualRate", label: "APR", align: "end", render: displayPercent },
    { key: "scheduledPayment", label: "Payment", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "nextDueAt", label: "Next due", sortValue: (value) => Date.parse(value || "") || 0, render: displayDate },
    { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, loan) => ["active", "delinquent", "restructured"].includes(loan.status)
      ? actionButton({ label: "Restructure", quiet: true, action: "restructure-loan", onClick: (event) => onOpenRestructure(loan, event.currentTarget) })
      : createElement("span", { className: "admin-u-muted", text: "Closed" }) },
  ], emptyState: AdminEmptyState({ title: "No loans", message: "No approved loans exist for this game.", compact: true }) }).element;
}
function productsTable(model, onOpenProduct) {
  return AdminDataTable({ caption: "Loan products", rowKey: (product) => product.id, rows: model.products, columns: [
    { key: "name", label: "Product", rowHeader: true }, { key: "borrowerType", label: "Borrower", render: titleCase }, { key: "currencyCode", label: "Currency" },
    { key: "minimumAmount", label: "Minimum", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "maximumAmount", label: "Maximum", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "annualRate", label: "APR", align: "end", render: displayPercent }, { key: "status", label: "Status", render: statusPill },
    { key: "actions", label: "Actions", align: "end", sortable: false, render: (_value, product) => actionButton({ label: "Edit", quiet: true, action: "edit-product", onClick: (event) => onOpenProduct(product, event.currentTarget) }) },
  ], emptyState: AdminEmptyState({ title: "No loan products", message: "Create a loan product to make lending available.", compact: true }) }).element;
}
function paymentsTable(model) {
  return AdminDataTable({ caption: "Loan repayment history", rowKey: (payment) => payment.id, rows: model.payments, columns: [
    { key: "createdAt", label: "Posted", sortValue: (value) => Date.parse(value || "") || 0, render: displayDate }, { key: "borrower", label: "Borrower", rowHeader: true, render: borrowerCopy },
    { key: "loanId", label: "Loan", render: (value) => value || "Unavailable" }, { key: "amount", label: "Amount", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) },
    { key: "principalAmount", label: "Principal", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "interestAmount", label: "Interest", align: "end", render: (value, row) => displayAmount(value, row.currencyCode) }, { key: "status", label: "Status", render: statusPill },
  ], emptyState: AdminEmptyState({ title: "No repayments", message: "No loan payments have been posted yet.", compact: true }) }).element;
}
function resolvedContent(model, handlers) {
  return createElement("div", { className: "admin-u-stack", children: [
    summary(model),
    createElement("aside", { className: "admin-banking-route__contract-note", attrs: { "aria-label": "Loan authority boundary" }, children: [AdminIcon({ name: "info", size: 18 }), createElement("p", { text: "Loan applications, products, repayment history, and servicing actions are scoped to the selected game. Internal ownership and ledger identifiers are not exposed." })] }),
    section("Exposure by currency", "Currencies remain separate and are never cross-summed.", currencyTable(model)),
    section("Applications", "Review pending applications.", applicationsTable(model, handlers.onOpenReview)),
    section("Loan portfolio", "Current balances, due dates, delinquency, and default states.", loansTable(model, handlers.onOpenRestructure)),
    section("Loan products", "Configure the lending catalog.", productsTable(model, handlers.onOpenProduct)),
    section("Repayment history", "Posted repayments; repayment itself remains a player-owned action.", paymentsTable(model)),
  ] });
}

export function LoansRoute({ state, onRefresh = async () => {}, onReviewApplication = async () => ({ ok: false }), onRestructureLoan = async () => ({ ok: false }), onUpsertProduct = async () => ({ ok: false }), onServiceLoans = async () => ({ ok: false }) } = {}) {
  const dialogs = new Set(); let destroyed = false;
  const destroyDialog = (dialog) => { dialogs.delete(dialog); dialog.destroy(); };
  const openReview = (application, decision, opener) => { const dialog = createReviewDialog({ application, decision, onReview: onReviewApplication, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const openRestructure = (loan, opener) => { const dialog = createRestructureDialog({ loan, onRestructure: onRestructureLoan, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const openProduct = (product, opener) => { const dialog = createProductDialog({ product, onUpsert: onUpsertProduct, opener, onDestroy: destroyDialog }); dialogs.add(dialog); };
  const refresh = actionButton({ label: state?.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh", icon: "refresh", quiet: true, disabled: state?.status === ADMIN_DATA_STATES.REFRESHING, action: "refresh", onClick: onRefresh });
  const service = actionButton({ label: "Service statuses", icon: "banking", quiet: true, action: "service-statuses", onClick: async (event) => { event.currentTarget.disabled = true; try { await onServiceLoans(); } finally { if (event.currentTarget.isConnected) event.currentTarget.disabled = false; } } });
  const createProduct = actionButton({ label: "New product", icon: "plus", action: "create-product", onClick: (event) => openProduct(null, event.currentTarget) });
  const actions = createElement("div", { className: "admin-u-actions", children: [refresh, service, createProduct] });
  let content;
  if (!state || state.status === ADMIN_DATA_STATES.INITIAL_LOADING) content = AdminSkeleton({ label: "Loading loan supervision", count: 7, shape: "row" });
  else if (state.status === ADMIN_DATA_STATES.FAILED) content = AdminErrorState({ title: "Loan supervision unavailable", message: state.error?.userMessage, requestId: state.error?.requestId, retryAfterSeconds: state.error?.retryAfterSeconds, retry: state.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh } });
  else if (state.data) {
    const resolved = resolvedContent(state.data, { onOpenReview: openReview, onOpenRestructure: openRestructure, onOpenProduct: openProduct });
    content = state.status === ADMIN_DATA_STATES.STALE ? AdminStaleState({ message: "Showing the last loaded loan portfolio. Refresh before applying a change.", retry: { label: "Refresh", onClick: onRefresh }, content: resolved }) : resolved;
  } else content = AdminEmptyState({ title: "No loan data", message: "Create a loan product or wait for player applications." });
  const frame = AdminPageFrame({ eyebrow: "Economy supervision", title: "Loans", description: "Review lending exposure, applications, products, repayment history, and servicing controls.", actions, content });
  frame.element.dataset.implementationStatus = "configured";
  return Object.freeze({ element: frame.element, destroy() { if (destroyed) return; destroyed = true; [...dialogs].forEach((dialog) => dialog.destroy()); dialogs.clear(); } });
}
