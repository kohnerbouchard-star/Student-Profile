import { ApiRequestError } from "./errors.js";

const ROUTES = Object.freeze({
  business: () => ({ method: "GET", path: "/players/me/business" }),
  businessStockroom: () => ({
    method: "GET",
    path: "/players/me/business/stockroom",
  }),
  businessRecipes: () => ({
    method: "GET",
    path: "/players/me/business/recipes",
  }),
  businessEquipment: () => ({
    method: "GET",
    path: "/players/me/business/equipment",
  }),
  businessWorkforce: () => ({
    method: "GET",
    path: "/players/me/business/workforce/candidates",
  }),
  businessCreate: ({ payload }) => ({
    method: "POST",
    path: "/players/me/businesses",
    payload: {
      legalName: required(payload.legalName, "legalName", "businessCreate"),
      entityType: payload.entityType || "sole_proprietorship",
      industryCode: required(payload.industryCode, "industryCode", "businessCreate"),
      capitalization: number(payload.capitalization, "capitalization", "businessCreate"),
      idempotencyKey: key(payload, "businessCreate"),
    },
  }),
  businessFormationPropose: ({ payload }) => ({
    method: "POST",
    path: "/players/me/business/formations",
    payload: {
      legalName: required(payload.legalName, "legalName", "businessFormationPropose"),
      entityType: required(payload.entityType, "entityType", "businessFormationPropose"),
      industryCode: required(payload.industryCode, "industryCode", "businessFormationPropose"),
      owners: formationOwners(payload.owners),
      idempotencyKey: key(payload, "businessFormationPropose"),
    },
  }),
  businessFormationRespond: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/formations/${encodeURIComponent(required(params.formationId || payload.formationKey, "formationKey", "businessFormationRespond"))}/respond`,
    payload: {
      decision: required(payload.decision, "decision", "businessFormationRespond"),
      idempotencyKey: key(payload, "businessFormationRespond"),
    },
  }),
  businessFormationActivate: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/formations/${encodeURIComponent(required(params.formationId || payload.formationKey, "formationKey", "businessFormationActivate"))}/activate`,
    payload: {
      idempotencyKey: key(payload, "businessFormationActivate"),
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
      qualityScore: number(payload.qualityScore ?? 50, "qualityScore", "businessProductCreate"),
      idempotencyKey: key(payload, "businessProductCreate"),
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
  businessManufacturingJobs: ({ params, payload }) => ({
    method: "GET",
    path: `/players/me/businesses/${encodeURIComponent(required(params.businessId || payload.businessId || payload.businessKey, "businessId", "businessManufacturingJobs"))}/manufacturing/jobs`,
  }),
  businessManufacturingStart: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/businesses/${encodeURIComponent(required(params.businessId || payload.businessId || payload.businessKey, "businessId", "businessManufacturingStart"))}/manufacturing/jobs`,
    payload: {
      productKey: required(payload.productKey || payload.productId, "productKey", "businessManufacturingStart"),
      quantity: number(payload.quantity, "quantity", "businessManufacturingStart"),
      priority: payload.priority || "standard",
      idempotencyKey: key(payload, "businessManufacturingStart"),
    },
  }),
  businessManufacturingCancel: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/businesses/${encodeURIComponent(required(params.businessId || payload.businessId || payload.businessKey, "businessId", "businessManufacturingCancel"))}/manufacturing/jobs/${encodeURIComponent(required(params.jobId || payload.jobId || payload.jobKey, "jobId", "businessManufacturingCancel"))}/cancel`,
    payload: {
      idempotencyKey: key(payload, "businessManufacturingCancel"),
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
  businessCandidateHire: ({ params, payload }) => ({
    method: "POST",
    path: `/players/me/business/workforce/candidates/${encodeURIComponent(required(params.candidateId || payload.candidateKey, "candidateKey", "businessCandidateHire"))}/hire`,
    payload: {
      businessKey: required(payload.businessKey, "businessKey", "businessCandidateHire"),
      idempotencyKey: key(payload, "businessCandidateHire"),
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
function formationOwners(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new ApiRequestError("owners are invalid for businessFormationPropose.", {
      body: { code: "player_route_formation_owners_invalid", endpointKey: "businessFormationPropose" },
    });
  }
  return value.map((owner, index) => {
    if (!owner || typeof owner !== "object" || Array.isArray(owner)) {
      throw new ApiRequestError(`owners[${index}] is invalid for businessFormationPropose.`, {
        body: { code: "player_route_formation_owner_invalid", endpointKey: "businessFormationPropose" },
      });
    }
    return {
      playerIdentifier: required(owner.playerIdentifier, `owners[${index}].playerIdentifier`, "businessFormationPropose"),
      ownershipBasisPoints: number(owner.ownershipBasisPoints, `owners[${index}].ownershipBasisPoints`, "businessFormationPropose"),
      capitalContribution: number(owner.capitalContribution ?? 0, `owners[${index}].capitalContribution`, "businessFormationPropose"),
    };
  });
}
