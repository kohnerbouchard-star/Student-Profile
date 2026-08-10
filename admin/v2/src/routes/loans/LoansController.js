import {
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../../core/data-state.js";
import { createAdminErrorEnvelope, isAdminErrorEnvelope, normalizeAdminError } from "../../core/error-envelope.js";
import { LoansRoute } from "./LoansRoute.js";

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const PUBLIC_PATTERNS = Object.freeze({
  loan: /^lon_[0-9a-f]{32}$/i,
  payment: /^pay_[0-9a-f]{32}$/i,
  application: /^lna_[0-9a-f]{32}$/i,
  product: /^lop_[0-9a-f]{32}$/i,
  business: /^biz_[0-9a-f]{32}$/i,
});
const LOAN_STATUSES = new Set(["active", "delinquent", "defaulted", "restructured", "paid"]);
const APPLICATION_STATUSES = new Set(["pending_review", "approved", "declined", "cancelled"]);
const PRODUCT_STATUSES = new Set(["active", "paused", "retired"]);

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeText(value, maximum = 500, fallback = "") {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!text || UUID_PATTERN.test(text)) return fallback;
  return text.slice(0, maximum);
}

function publicKey(value, kind, nullable = false) {
  const key = String(value || "").trim().toLowerCase();
  if (!key && nullable) return null;
  if (!PUBLIC_PATTERNS[kind]?.test(key)) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }
  return key;
}

function finite(value, { minimum = -Infinity, maximum = Infinity, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isSafeInteger(number))) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }
  return number;
}

function optionalDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  return new Date(timestamp).toISOString();
}

function requiredDate(value) {
  const date = optionalDate(value);
  if (!date) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  return date;
}

function currency(value) {
  const code = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,16}$/.test(code)) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  return code;
}

function borrower(value) {
  if (!isRecord(value)) return Object.freeze({ displayName: "Player unavailable", playerIdentifier: "", rosterLabel: "", status: "unknown" });
  return Object.freeze({
    displayName: safeText(value.displayName, 180, "Player unavailable"),
    playerIdentifier: safeText(value.playerIdentifier, 80),
    rosterLabel: safeText(value.rosterLabel, 80),
    status: safeText(value.status, 40, "unknown").toLowerCase(),
  });
}

function productRef(value, { nullable = false } = {}) {
  if (!isRecord(value)) {
    if (nullable) return null;
    return Object.freeze({ id: null, name: "Loan product unavailable", borrowerType: "unknown", status: "unknown", currencyCode: "" });
  }
  const id = value.id ? publicKey(value.id, "product", true) : null;
  return Object.freeze({
    id,
    name: safeText(value.name, 160, "Loan product unavailable"),
    borrowerType: safeText(value.borrowerType, 40, "unknown").toLowerCase(),
    status: safeText(value.status, 40, "unknown").toLowerCase(),
    currencyCode: value.currencyCode ? currency(value.currencyCode) : "",
  });
}

function businessRef(value) {
  if (!isRecord(value)) return null;
  return Object.freeze({
    id: publicKey(value.id, "business"),
    name: safeText(value.name, 160, "Business"),
    status: safeText(value.status, 40, "unknown").toLowerCase(),
  });
}

function normalizeLoan(row) {
  if (!isRecord(row)) return null;
  const status = safeText(row.status, 40).toLowerCase();
  if (!LOAN_STATUSES.has(status)) return null;
  const principalBalance = finite(row.principalBalance, { minimum: 0 });
  const accruedInterest = finite(row.accruedInterest, { minimum: 0 });
  return Object.freeze({
    id: publicKey(row.id, "loan"),
    borrower: borrower(row.borrower),
    business: businessRef(row.business),
    product: productRef(row.product),
    applicationId: row.applicationId ? publicKey(row.applicationId, "application", true) : null,
    currencyCode: currency(row.currencyCode),
    originalPrincipal: finite(row.originalPrincipal, { minimum: 0.01 }),
    principalBalance,
    accruedInterest,
    outstanding: finite(row.outstanding, { minimum: 0 }),
    annualRate: finite(row.annualRate, { minimum: 0, maximum: 1 }),
    originationFee: finite(row.originationFee, { minimum: 0 }),
    scheduledPayment: finite(row.scheduledPayment, { minimum: 0.01 }),
    status,
    nextDueAt: requiredDate(row.nextDueAt),
    lastAccruedAt: requiredDate(row.lastAccruedAt),
    delinquentAt: optionalDate(row.delinquentAt),
    defaultedAt: optionalDate(row.defaultedAt),
    closedAt: optionalDate(row.closedAt),
    createdAt: requiredDate(row.createdAt),
    updatedAt: optionalDate(row.updatedAt),
  });
}

function normalizePayment(row) {
  if (!isRecord(row)) return null;
  return Object.freeze({
    id: publicKey(row.id, "payment"),
    loanId: row.loanId ? publicKey(row.loanId, "loan", true) : null,
    borrower: borrower(row.borrower),
    currencyCode: row.currencyCode ? currency(row.currencyCode) : "",
    amount: finite(row.amount, { minimum: 0.01 }),
    principalAmount: finite(row.principalAmount, { minimum: 0 }),
    interestAmount: finite(row.interestAmount, { minimum: 0 }),
    status: safeText(row.status, 40, "unknown").toLowerCase(),
    createdAt: requiredDate(row.createdAt),
  });
}

function normalizeApplication(row) {
  if (!isRecord(row)) return null;
  const status = safeText(row.status, 40).toLowerCase();
  if (!APPLICATION_STATUSES.has(status)) return null;
  return Object.freeze({
    id: publicKey(row.id, "application"),
    borrower: borrower(row.borrower),
    business: businessRef(row.business),
    product: productRef(row.product),
    amount: finite(row.amount, { minimum: 0.01 }),
    purpose: safeText(row.purpose, 500),
    creditScore: finite(row.creditScore, { minimum: 0, maximum: 1000, integer: true }),
    projectedPayment: finite(row.projectedPayment, { minimum: 0 }),
    affordabilityRatio: finite(row.affordabilityRatio, { minimum: 0, maximum: 100 }),
    status,
    reviewedAt: optionalDate(row.reviewedAt),
    createdAt: requiredDate(row.createdAt),
    updatedAt: optionalDate(row.updatedAt),
  });
}

function normalizeProduct(row) {
  if (!isRecord(row)) return null;
  const base = productRef(row);
  if (!base.id || !PRODUCT_STATUSES.has(base.status)) return null;
  return Object.freeze({
    ...base,
    minimumAmount: finite(row.minimumAmount, { minimum: 0 }),
    maximumAmount: finite(row.maximumAmount, { minimum: 0.01 }),
    annualRate: finite(row.annualRate, { minimum: 0, maximum: 1 }),
    originationFeeRate: finite(row.originationFeeRate, { minimum: 0, maximum: 1 }),
    termCycles: finite(row.termCycles, { minimum: 1, maximum: 240, integer: true }),
    paymentFrequencyCycles: finite(row.paymentFrequencyCycles, { minimum: 1, maximum: 240, integer: true }),
    minimumCreditScore: finite(row.minimumCreditScore, { minimum: 0, maximum: 1000, integer: true }),
    maximumPaymentToIncome: finite(row.maximumPaymentToIncome, { minimum: 0, maximum: 10 }),
    delinquencyGraceDays: finite(row.delinquencyGraceDays, { minimum: 0, maximum: 365, integer: true }),
    defaultAfterDays: finite(row.defaultAfterDays, { minimum: 0, maximum: 1000, integer: true }),
    disclosureText: safeText(row.disclosureText, 4000, "Disclosure unavailable"),
    createdAt: optionalDate(row.createdAt),
    updatedAt: optionalDate(row.updatedAt),
  });
}

export function normalizeLoansReadModel(result) {
  const source = isRecord(result?.data) ? result.data : null;
  if (!source || !isRecord(source.summary) || !Array.isArray(source.loans) || !Array.isArray(source.payments)
      || !Array.isArray(source.applications) || !Array.isArray(source.products) || !Array.isArray(source.currencyTotals)) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
  }
  const loans = source.loans.slice(0, 2_000).map(normalizeLoan).filter(Boolean);
  const payments = source.payments.slice(0, 5_000).map(normalizePayment).filter(Boolean);
  const applications = source.applications.slice(0, 2_000).map(normalizeApplication).filter(Boolean);
  const products = source.products.slice(0, 500).map(normalizeProduct).filter(Boolean);
  const currencyTotals = source.currencyTotals.slice(0, 100).map((row) => {
    if (!isRecord(row)) throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });
    return Object.freeze({
      currencyCode: currency(row.currencyCode),
      principal: finite(row.principal, { minimum: 0 }),
      accruedInterest: finite(row.accruedInterest, { minimum: 0 }),
      outstanding: finite(row.outstanding, { minimum: 0 }),
    });
  });
  const summary = Object.freeze({
    loanCount: finite(source.summary.loanCount, { minimum: 0, integer: true }),
    openLoanCount: finite(source.summary.openLoanCount, { minimum: 0, integer: true }),
    delinquentCount: finite(source.summary.delinquentCount, { minimum: 0, integer: true }),
    defaultedCount: finite(source.summary.defaultedCount, { minimum: 0, integer: true }),
    paidCount: finite(source.summary.paidCount, { minimum: 0, integer: true }),
    pendingApplicationCount: finite(source.summary.pendingApplicationCount, { minimum: 0, integer: true }),
    paymentCount: finite(source.summary.paymentCount, { minimum: 0, integer: true }),
  });
  return deepFreeze({
    summary,
    currencyTotals,
    loans,
    payments,
    applications,
    products,
    isEmpty: loans.length === 0 && applications.length === 0 && products.length === 0,
  });
}

function safeError(error) {
  return isAdminErrorEnvelope(error) ? error : normalizeAdminError(error, { fieldErrors: error?.fieldErrors });
}

export function createLoansController({
  api,
  selectedGameId,
  hasPermission = () => false,
  onChange = () => {},
  notify = () => {},
  cryptoObject = globalThis.crypto,
} = {}) {
  for (const method of ["readLoans", "reviewApplication", "upsertProduct", "restructureLoan", "serviceLoans"]) {
    if (typeof api?.[method] !== "function") throw new TypeError(`Loans API ${method} is unavailable.`);
  }

  let state = createAdminDataState();
  let requestVersion = 0;
  let mutationSequence = 0;
  let destroyed = false;
  let currentView = null;
  const activeMutations = new Set();
  const pendingKeys = new Map();
  const refreshTimers = new Set();

  function publish() {
    if (!destroyed) onChange(state);
  }

  async function load() {
    if (destroyed || !hasPermission("economy.adjust")) return state;
    api.cancelLoansRequest?.();
    requestVersion += 1;
    const version = requestVersion;
    state = beginAdminDataLoad(state, { requestVersion: version });
    publish();
    try {
      const result = await api.readLoans({ gameId: selectedGameId });
      if (destroyed || version !== requestVersion) return state;
      const model = normalizeLoansReadModel(result);
      state = resolveAdminDataLoad(state, model, { empty: model.isEmpty, requestVersion: version });
    } catch (error) {
      if (destroyed || version !== requestVersion) return state;
      state = rejectAdminDataLoad(state, safeError(error), { requestVersion: version });
    }
    publish();
    return state;
  }

  function nextKey(action) {
    mutationSequence += 1;
    const uuid = String(cryptoObject?.randomUUID?.() || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
    return `admin.loans.${action}.${uuid}.${mutationSequence}`.slice(0, 159);
  }

  function scheduleRefresh() {
    const timer = globalThis.setTimeout(() => {
      refreshTimers.delete(timer);
      if (!destroyed) void load();
    }, 0);
    refreshTimers.add(timer);
  }

  async function runMutation({ action, fingerprint, invoke, successTitle, successMessage }) {
    if (destroyed || !hasPermission("economy.adjust")) {
      return { ok: false, error: createAdminErrorEnvelope({ code: "PERMISSION_DENIED", retryable: false }) };
    }
    if (activeMutations.has(fingerprint)) {
      return { ok: false, busy: true, error: createAdminErrorEnvelope({ code: "CONFLICT", retryable: false }) };
    }
    let key = pendingKeys.get(fingerprint);
    try {
      if (!key && action !== "service") {
        key = nextKey(action);
        pendingKeys.set(fingerprint, key);
      }
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
    activeMutations.add(fingerprint);
    try {
      const result = await invoke(key);
      pendingKeys.delete(fingerprint);
      notify({ tone: "success", title: successTitle, message: successMessage });
      scheduleRefresh();
      return { ok: true, result };
    } catch (error) {
      const envelope = safeError(error);
      if (!envelope.retryable) pendingKeys.delete(fingerprint);
      notify({ tone: "error", title: `${successTitle} failed`, message: envelope.userMessage });
      return { ok: false, error: envelope };
    } finally {
      activeMutations.delete(fingerprint);
    }
  }

  function reviewApplication(application, decision, reason) {
    const normalizedDecision = String(decision || "").trim().toLowerCase();
    const fingerprint = JSON.stringify({ action: "review", id: application?.id, decision: normalizedDecision, reason });
    return runMutation({
      action: "review",
      fingerprint,
      invoke: (key) => api.reviewApplication({
        gameId: selectedGameId,
        applicationId: application?.id,
        decision: normalizedDecision,
        reason,
        idempotencyKey: key,
      }),
      successTitle: normalizedDecision === "approve" ? "Loan approved" : "Loan declined",
      successMessage: `${application?.borrower?.displayName || "Loan application"} was ${normalizedDecision === "approve" ? "approved" : "declined"}.`,
    });
  }

  function restructureLoan(loan, input) {
    const fingerprint = JSON.stringify({ action: "restructure", id: loan?.id, input });
    return runMutation({
      action: "restructure",
      fingerprint,
      invoke: (key) => api.restructureLoan({ gameId: selectedGameId, loanId: loan?.id, input, idempotencyKey: key }),
      successTitle: "Loan restructured",
      successMessage: `${loan?.borrower?.displayName || "Loan"} repayment terms were updated.`,
    });
  }

  function upsertProduct(product, input) {
    const payload = { ...input, productKey: product?.id || null };
    const fingerprint = JSON.stringify({ action: "product", payload });
    return runMutation({
      action: "product",
      fingerprint,
      invoke: (key) => api.upsertProduct({ gameId: selectedGameId, input: payload, idempotencyKey: key }),
      successTitle: product ? "Loan product updated" : "Loan product created",
      successMessage: `${input?.name || "Loan product"} was saved.`,
    });
  }

  function serviceLoans() {
    return runMutation({
      action: "service",
      fingerprint: "service-loans",
      invoke: () => api.serviceLoans({ gameId: selectedGameId, asOf: new Date().toISOString() }),
      successTitle: "Loan statuses serviced",
      successMessage: "Accrual, delinquency, and default states were evaluated against the current time.",
    });
  }

  function render() {
    if (destroyed) throw new Error("Loans controller has been destroyed.");
    currentView?.destroy?.();
    currentView = LoansRoute({
      state,
      onRefresh: load,
      onReviewApplication: reviewApplication,
      onRestructureLoan: restructureLoan,
      onUpsertProduct: upsertProduct,
      onServiceLoans: serviceLoans,
    });
    return currentView;
  }

  return Object.freeze({
    getState: () => state,
    load,
    render,
    reviewApplication,
    restructureLoan,
    upsertProduct,
    serviceLoans,
    deactivate() {
      requestVersion += 1;
      api.cancelLoansRequest?.();
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      requestVersion += 1;
      api.cancelLoansRequest?.();
      currentView?.destroy?.();
      currentView = null;
      refreshTimers.forEach((timer) => globalThis.clearTimeout(timer));
      refreshTimers.clear();
      activeMutations.clear();
      pendingKeys.clear();
    },
  });
}
