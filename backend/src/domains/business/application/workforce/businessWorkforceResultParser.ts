import {
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceCandidateDto,
  type BusinessWorkforceSnapshotDto,
  PlayerBusinessError,
} from "../../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

export function parseBusinessWorkforceSnapshot(
  value: unknown,
): BusinessWorkforceSnapshotDto {
  const row = record(value, "Business workforce result is invalid.");
  const candidates = Array.isArray(row.candidates) ? row.candidates : [];
  return {
    businessKey: text(row.businessKey),
    generatedAt: text(row.generatedAt),
    candidates: candidates.map(parseCandidate),
  };
}

export function parseBusinessCandidateHireReceipt(
  value: unknown,
): BusinessCandidateHireReceiptDto {
  const row = record(value, "Business workforce hire result is invalid.");
  return {
    businessKey: key(row.business_key, "biz"),
    employeeKey: key(row.employee_key, "emp"),
    candidateKey: key(row.candidate_key, "wfc"),
    roleKey: text(row.workforce_role_key),
    roleName: text(row.role_name),
    contractType: text(row.contract_type),
    wagePerCycle: number(row.wage_per_cycle),
    currencyCode: text(row.currency_code).toUpperCase(),
    laborMinutesPerCycle: integer(row.labor_minutes_per_cycle),
    skillBasisPoints: integer(row.skill_basis_points),
    productivityIndex: number(row.productivity_index, 1),
    status: text(row.employee_status),
    hiredAt: text(row.hired_at),
    replayed: Boolean(row.replayed),
  };
}

function parseCandidate(value: unknown): BusinessWorkforceCandidateDto {
  const row = record(value, "Business workforce candidate is invalid.");
  return {
    candidateKey: key(row.candidateKey, "wfc"),
    roleKey: text(row.roleKey),
    roleName: text(row.roleName),
    laborClass: text(row.laborClass),
    displayLabel: text(row.displayLabel),
    countryCode: text(row.countryCode).toUpperCase(),
    currencyCode: text(row.currencyCode).toUpperCase(),
    wagePerCycle: number(row.wagePerCycle),
    laborMinutesPerCycle: integer(row.laborMinutesPerCycle),
    skillBasisPoints: integer(row.skillBasisPoints),
    productivityIndex: number(row.productivityIndex, 1),
    contractType: text(row.contractType),
    availabilityEndsAt: nullableText(row.availabilityEndsAt),
    version: integer(row.version, 1),
  };
}

function record(value: unknown, message: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(message);
  }
  return value as Row;
}

function text(value: unknown, defaultValue = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function number(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function integer(value: unknown, defaultValue = 0): number {
  return Math.trunc(number(value, defaultValue));
}

function key(value: unknown, prefix: string): string {
  const result = text(value).toLowerCase();
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw invalid(`Business workforce ${prefix} key is invalid.`);
  }
  return result;
}

function invalid(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_workforce_result_invalid",
    message,
    500,
  );
}
