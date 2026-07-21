import { ApiRequestError } from "./errors.js";

const ROUTES = Object.freeze({
  business: () => ({ method: "GET", path: "/players/me/business" }),
  businessCreate: ({ payload }) => ({
    method: "POST",
    path: "/players/me/businesses",
    payload: {
      legalName: required(payload.legalName, "legalName", "businessCreate"),
      entityType: payload.entityType || "sole_proprietorship",
      industryCode: required(payload.industryCode, "industryCode", "businessCreate"),
      capitalization: number(payload.capitalization, "capitalization", "businessCreate"),
      acquireBusinessKey: optional(payload.acquireBusinessKey),
      idempotencyKey: key(payload, "businessCreate"),
    },
  }),
  businessProductCreate: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/products",
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessProductCreate"),
      name: required(payload.name, "name", "businessProductCreate"),
      category: payload.category || "general",
      unitPrice: number(payload.unitPrice, "unitPrice", "businessProductCreate"),
      unitInputCost: number(payload.unitInputCost ?? 0, "unitInputCost", "businessProductCreate"),
      unitLaborCost: number(payload.unitLaborCost ?? 0, "unitLaborCost", "businessProductCreate"),
      capacityUnits: number(payload.capacityUnits ?? 100, "capacityUnits", "businessProductCreate"),
      baseDemandUnits: number(payload.baseDemandUnits ?? 20, "baseDemandUnits", "businessProductCreate"),
      qualityScore: number(payload.qualityScore ?? 50, "qualityScore", "businessProductCreate"),
      idempotencyKey: key(payload, "businessProductCreate"),
    },
  }),
  businessInputPurchase: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/inputs/purchases",
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessInputPurchase"),
      productKey: required(payload.productKey || payload.productId, "productKey", "businessInputPurchase"),
      quantity: number(payload.quantity, "quantity", "businessInputPurchase"),
      idempotencyKey: key(payload, "businessInputPurchase"),
    },
  }),
  businessProduction: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/production-runs",
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessProduction"),
      productKey: required(payload.productKey || payload.productId, "productKey", "businessProduction"),
      quantity: number(payload.quantity, "quantity", "businessProduction"),
      priority: payload.priority || "standard",
      idempotencyKey: key(payload, "businessProduction"),
    },
  }),
  businessPrice: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/products/${encodeURIComponent(required(params.productId || payload.productKey, "productKey", "businessPrice"))}/pricing`,
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessPrice"),
      price: number(payload.price, "price", "businessPrice"),
      expectedVersion: payload.expectedVersion === undefined || payload.expectedVersion === ""
        ? null
        : number(payload.expectedVersion, "expectedVersion", "businessPrice"),
      idempotencyKey: key(payload, "businessPrice"),
    },
  }),
  businessHire: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/employees/hire",
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessHire"),
      employeePlayerIdentifier: optional(payload.employeePlayerIdentifier),
      role: required(payload.role || payload.roleName, "role", "businessHire"),
      contractType: payload.contractType || "cycle",
      wagePerCycle: number(payload.wagePerCycle, "wagePerCycle", "businessHire"),
      productivityIndex: number(payload.productivityIndex ?? 1, "productivityIndex", "businessHire"),
      idempotencyKey: key(payload, "businessHire"),
    },
  }),
  businessTerminate: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/employees/${encodeURIComponent(required(params.employeeId || payload.employeeKey, "employeeKey", "businessTerminate"))}/terminate`,
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessTerminate"),
      reason: required(payload.reason, "reason", "businessTerminate"),
      idempotencyKey: key(payload, "businessTerminate"),
    },
  }),
  businessStatus: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/status",
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessStatus"),
      transition: required(payload.transition, "transition", "businessStatus"),
      reason: required(payload.reason, "reason", "businessStatus"),
      idempotencyKey: key(payload, "businessStatus"),
    },
  }),
  bankTransfer: ({ payload }) => ({
    method: "POST",
    path: "/players/me/banking/transfers",
    payload: {
      recipientPlayerIdentifier: required(payload.recipientPlayerIdentifier || payload.recipientId, "recipientPlayerIdentifier", "bankTransfer"),
      amount: number(payload.amount, "amount", "bankTransfer"),
      memo: optional(payload.memo),
      idempotencyKey: key(payload, "bankTransfer"),
    },
  }),
  savingsTransfer: ({ payload }) => ({
    method: "POST",
    path: "/players/me/banking/savings/transfers",
    payload: {
      fromAccount: required(payload.fromAccount, "fromAccount", "savingsTransfer"),
      toAccount: required(payload.toAccount, "toAccount", "savingsTransfer"),
      amount: number(payload.amount, "amount", "savingsTransfer"),
      note: optional(payload.note),
      idempotencyKey: key(payload, "savingsTransfer"),
    },
  }),
  loans: () => ({ method: "GET", path: "/players/me/banking/loans" }),
  loanApply: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/banking/loans/applications/${encodeURIComponent(required(params.offerId || payload.offerKey, "offerKey", "loanApply"))}`,
    payload: {
      businessKey: optional(payload.businessKey),
      amount: number(payload.amount, "amount", "loanApply"),
      purpose: required(payload.purpose, "purpose", "loanApply"),
      repaymentSource: required(payload.repaymentSource, "repaymentSource", "loanApply"),
      idempotencyKey: key(payload, "loanApply"),
    },
  }),
  loanRepay: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/banking/loans/${encodeURIComponent(required(params.loanId || payload.loanKey, "loanKey", "loanRepay"))}/payments`,
    payload: {
      amount: number(payload.amount, "amount", "loanRepay"),
      idempotencyKey: key(payload, "loanRepay"),
    },
  }),
});

export function resolveBusinessBankingBackendRequest({ endpointKey, payload = {}, params = {}, method, path }) {
  const builder = ROUTES[endpointKey];
  if (!builder) return null;
  const resolved = builder({ payload, params });
  return {
    endpointKey,
    method: resolved.method,
    path: resolved.path,
    payload: Object.hasOwn(resolved, "payload") ? resolved.payload : undefined,
    provisional: { method, path, payload },
  };
}

function required(value, field, endpointKey) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result) return result;
  throw new ApiRequestError(`${field} is required for ${endpointKey}.`, {
    body: { code: "player_route_context_missing", field, endpointKey },
  });
}
function optional(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function number(value, field, endpointKey) {
  const result = Number(value);
  if (Number.isFinite(result)) return result;
  throw new ApiRequestError(`${field} is invalid for ${endpointKey}.`, {
    body: { code: "player_route_number_invalid", field, endpointKey },
  });
}
function key(payload, endpointKey) {
  return required(payload.idempotencyKey, "idempotencyKey", endpointKey);
}
