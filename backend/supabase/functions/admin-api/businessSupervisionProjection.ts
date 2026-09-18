export const BUSINESS_SUPERVISION_FIELDS = Object.freeze({
  locations:
    "business_key account_key location_key location_label item_count quantity_owned quantity_reserved quantity_available"
      .split(" "),
  stockroom:
    "business_key account_key location_key item_key canonical_key item_name item_class item_subtype quantity_owned quantity_reserved quantity_available average_unit_cost cost_currency_code holding_version"
      .split(" "),
  equipment:
    "business_key installation_key equipment_key item_key canonical_key item_name equipment_slot capability_keys installation_status period_key capacity_minutes reserved_minutes consumed_minutes available_minutes idle_minutes utilization_basis_points durability_supported repair_supported"
      .split(" "),
  manufacturing:
    "business_key job_key product_key recipe_key output_item_key output_canonical_key output_name status resource_state quantity priority duration_seconds queued_at started_at completes_at completed_at cancelled_at failed_at completion_attempt_count completion_blocked last_error_code"
      .split(" "),
  employeeHistory:
    "public_key role_name status wage_per_cycle hired_at terminated_at".split(
      " ",
    ),
  payroll:
    "public_key payroll_period_key currency_code employee_count gross_wages_due gross_wages_paid gross_wages_unpaid status started_at completed_at"
      .split(" "),
  sales:
    "public_key offer_key canonical_item_key quantity unit_price currency_code gross_revenue cost_of_goods_sold gross_margin cost_currency_code completed_at"
      .split(" "),
  taxes:
    "public_key period_number payroll_period_key currency_code store_receipt_count gross_receipts cost_of_goods_sold gross_receipts_tax_rate tax_assessed tax_paid tax_unpaid status created_at"
      .split(" "),
  periods:
    "public_key period_number payroll_period_key period_started_at due_at next_due_at payroll_status store_receipt_count gross_wages_due gross_wages_paid gross_wages_unpaid reporting_currency_code tax_assessed_reporting_currency tax_paid_reporting_currency tax_unpaid_reporting_currency status completed_at"
      .split(" "),
  claims:
    "public_key period_number payroll_period_key due_at status claim_attempt claimed_at terminal_at"
      .split(" "),
  ownership:
    "public_key ownership_kind units voting_units status effective_at ended_at ownership_basis_points voting_basis_points"
      .split(" "),
  shares: "authorized_shares issued_shares treasury_shares outstanding_shares"
    .split(" "),
  governance:
    "public_key proposal_type status approval_threshold_basis_points snapshot_total_voting_units expires_at resolved_at executed_at created_at"
      .split(" "),
  activity: "public_key event_type reason_code actor_type occurred_at".split(
    " ",
  ),
  compliance:
    "public_key country_code requirement_key requirement_type status fee_amount reviewed_at expires_at updated_at"
      .split(" "),
  audit: "business_key action actor_type created_at".split(" "),
  offers:
    "public_key item_key item_name status unit_price currency_code quantity_owned quantity_reserved quantity_available withdrawal_key withdrawal_mode withdrawal_requested_quantity withdrawal_requested_at withdrawal_effective_at next_attempt_at last_attempt_at last_block_reason attempt_count"
      .split(" "),
  workforce:
    "employeeKey roleKey roleName status workforceSource capacityMinutes reservedMinutes consumedMinutes utilizedMinutes availableMinutes idleMinutes utilizationBasisPoints latestPayrollStatus wageDue wagePaid wageUnpaid currencyCode"
      .split(" "),
  readiness:
    "businessKey productKey productName recipeKey status plannedQuantity nextRunReady materialReady laborReady equipmentReady materialMaxUnits laborMaxUnits equipmentMaxUnits maxRunnableUnits materialLines materialBlockedLines materialRequired materialAvailable laborRequiredMinutes laborAvailableMinutes laborRequiredHeadcount laborAvailableHeadcount equipmentRequiredMinutes equipmentAvailableMinutes equipmentRequiredInstances equipmentAvailableInstances bottlenecks payrollPeriodKey equipmentPeriodKey"
      .split(" "),
  checking:
    "account_key account_kind currency_code minor_unit status posted_amount held_amount available_amount"
      .split(" "),
  fxOrders:
    "order_key quote_key product status source_account_key target_account_key source_currency_code target_currency_code source_amount fee_amount target_amount reference_rate customer_rate spread_rate fee_rate fixing_key submitted_at settles_at completed_at receipt_key"
      .split(" "),
  fxReceipts:
    "receipt_key order_key quote_key bank_transaction_key product source_account_key target_account_key source_currency_code target_currency_code source_amount fee_amount target_amount reference_rate customer_rate reserve_draw_amount reserve_repayment_amount fixing_key settled_at"
      .split(" "),
});

type Row = Record<string, unknown>;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
function record(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export function safeBusinessValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(safeBusinessValue).filter((item) =>
      typeof item === "string"
    ).join(", ");
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return UUID.test(text) ? null : text.slice(0, 500);
}
export function projectBusinessSupervision(
  value: unknown,
  businessKey: string,
): Row {
  if (
    !record(value) || value.schemaVersion !== 1 || value.readOnly !== true ||
    value.businessKey !== businessKey || !record(value.sections)
  ) {
    throw new Error("BUSINESS_SUPERVISION_RESPONSE_INVALID");
  }
  const sections: Row = {};
  for (const [name, fields] of Object.entries(BUSINESS_SUPERVISION_FIELDS)) {
    const source = value.sections[name];
    if (
      !record(source) || !Array.isArray(source.rows) ||
      !["ready", "empty"].includes(String(source.status))
    ) {
      sections[name] = { status: "unavailable", rows: [], truncated: false };
      continue;
    }
    const rows = source.rows.slice(0, 100).filter(record).map((row) =>
      Object.fromEntries(
        fields.map((key) => [key, safeBusinessValue(row[key])]),
      )
    );
    sections[name] = {
      status: rows.length ? "ready" : "empty",
      rows,
      truncated: source.truncated === true || source.rows.length > 100,
      window: safeBusinessValue(source.window),
    };
  }
  return {
    schemaVersion: 1,
    businessKey,
    readOnly: true,
    generatedAt: safeBusinessValue(value.generatedAt),
    healthFlags: Array.isArray(value.healthFlags)
      ? value.healthFlags.slice(0, 20).map(safeBusinessValue).filter(Boolean)
      : [],
    sections,
  };
}
