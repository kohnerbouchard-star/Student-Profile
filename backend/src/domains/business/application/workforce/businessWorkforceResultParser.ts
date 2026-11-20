import {
  type BusinessCandidateHireReceiptDto,
  type BusinessWorkforceCandidateDto,
  type BusinessWorkforceSnapshotDto,
  type BusinessWorkforceUtilizationDto,
  PlayerBusinessError,
} from "../../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

export function parseBusinessWorkforceSnapshot(value: unknown): BusinessWorkforceSnapshotDto {
  const row = record(value, "Business workforce result is invalid.");
  const candidates = Array.isArray(row.candidates) ? row.candidates : [];
  return {
    businessKey: text(row.businessKey),
    generatedAt: text(row.generatedAt),
    candidates: candidates.map(parseCandidate),
  };
}

export function parseBusinessWorkforceUtilization(value: unknown): BusinessWorkforceUtilizationDto {
  const row = record(value, "Business workforce utilization result is invalid.");
  const payroll = record(row.payroll, "Business payroll result is invalid.");
  const employees = Array.isArray(row.employees) ? row.employees : [];
  return {
    businessKey: key(row.businessKey, "biz"),
    payrollPeriodKey: payrollPeriodKey(row.payrollPeriodKey),
    generatedAt: text(row.generatedAt),
    payroll: {
      payrollRunKey: nullableKey(payroll.payrollRunKey, "pay"),
      periodKey: nullablePayrollPeriodKey(payroll.periodKey),
      status: text(payroll.status, "not_settled"),
      employeeCount: nonNegativeInteger(payroll.employeeCount),
      wageDue: nonNegativeNumber(payroll.wageDue),
      wagePaid: nonNegativeNumber(payroll.wagePaid),
      wageUnpaid: nonNegativeNumber(payroll.wageUnpaid),
      currencyCode: text(payroll.currencyCode).toUpperCase(),
      completedAt: nullableText(payroll.completedAt),
    },
    employees: employees.map(parseUtilizationEmployee),
  };
}

export function parseBusinessCandidateHireReceipt(value: unknown): BusinessCandidateHireReceiptDto {
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

function parseUtilizationEmployee(value: unknown) {
  const row = record(value, "Business workforce utilization employee is invalid.");
  const capacityMinutes = nonNegativeInteger(row.capacityMinutes);
  const reservedMinutes = nonNegativeInteger(row.reservedMinutes);
  const consumedMinutes = nonNegativeInteger(row.consumedMinutes);
  const utilizedMinutes = nonNegativeInteger(row.utilizedMinutes);
  const availableMinutes = nonNegativeInteger(row.availableMinutes);
  const idleMinutes = nonNegativeInteger(row.idleMinutes);
  const utilizationBasisPoints = nonNegativeInteger(row.utilizationBasisPoints);
  if (
    utilizationBasisPoints > 10000 ||
    utilizedMinutes !== reservedMinutes + consumedMinutes ||
    availableMinutes > capacityMinutes ||
    idleMinutes !== availableMinutes
  ) {
    throw invalid("Business workforce utilization quantities are invalid.");
  }
  return {
    employeeKey: key(row.employeeKey, "emp"),
    roleKey: text(row.roleKey),
    roleName: text(row.roleName),
    status: text(row.status),
    workforceSource: text(row.workforceSource),
    capacityMinutes,
    reservedMinutes,
    consumedMinutes,
    utilizedMinutes,
    availableMinutes,
    idleMinutes,
    utilizationBasisPoints,
    latestPayrollStatus: text(row.latestPayrollStatus, "not_settled"),
    wageDue: nonNegativeNumber(row.wageDue),
    wagePaid: nonNegativeNumber(row.wagePaid),
    wageUnpaid: nonNegativeNumber(row.wageUnpaid),
    currencyCode: text(row.currencyCode).toUpperCase(),
  };
}

function record(value: unknown, message: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(message);
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
function nonNegativeInteger(value: unknown): number {
  const result = integer(value);
  if (result < 0) throw invalid("Business workforce integer quantity is invalid.");
  return result;
}
function nonNegativeNumber(value: unknown): number {
  const result = number(value);
  if (result < 0) throw invalid("Business workforce numeric quantity is invalid.");
  return result;
}
function key(value: unknown, prefix: string): string {
  const result = text(value).toLowerCase();
  if (!new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(result)) {
    throw invalid(`Business workforce ${prefix} key is invalid.`);
  }
  return result;
}
function nullableKey(value: unknown, prefix: string): string | null {
  const result = text(value).toLowerCase();
  return result ? key(result, prefix) : null;
}
function payrollPeriodKey(value: unknown): string {
  const result = text(value).toLowerCase();
  if (!/^payroll:[1-9][0-9]*$/u.test(result)) throw invalid("Business workforce payroll period key is invalid.");
  return result;
}
function nullablePayrollPeriodKey(value: unknown): string | null {
  const result = text(value).toLowerCase();
  return result ? payrollPeriodKey(result) : null;
}
function invalid(message: string): PlayerBusinessError {
  return new PlayerBusinessError("business_workforce_result_invalid", message, 500);
}
