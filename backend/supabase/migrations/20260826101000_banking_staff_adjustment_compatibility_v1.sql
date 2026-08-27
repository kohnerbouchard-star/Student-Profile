-- Retain every legitimate staff-owned ledger adjustment provenance after the
-- Banking balanced_v2 cutover.
--
-- The B2 compatibility gateway originally retained the Classroom API's
-- ledger/staff_player_balance_adjustment pair, but the Admin API has distinct
-- provenance for Players, Banking, and Attendance. Those routes all pass
-- through record_idempotent_staff_ledger_adjustment_v1 and therefore through
-- record_player_ledger_entry. Denying their real source pairs turns otherwise
-- valid staff adjustments into BANK_COMPATIBILITY_GATEWAY_NOT_ALLOWLISTED.
-- Keep the provenance intact instead of rewriting source_domain/source_action.

begin;

create or replace function private.bank_compatibility_gateway_allowed_v1(
  p_gateway text,
  p_source_domain text,
  p_source_action text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select (p_gateway, p_source_domain, p_source_action) in (
    values
      ('record_player_ledger_entry', 'admin', 'business_banking_correction'),
      ('record_player_ledger_entry', 'arrival', 'arrival_package_grant'),
      ('record_player_ledger_entry', 'attendance', 'player_clock_in_reward'),
      ('record_player_ledger_entry', 'attendance', 'staff_scan_reward'),
      ('record_player_ledger_entry', 'attendance', 'staff_reward_adjustment'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_in'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_out'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_received'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_sent'),
      ('record_player_ledger_entry', 'banking', 'savings_interest'),
      ('record_player_ledger_entry', 'banking', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'business', 'business_acquisition_payment'),
      ('record_player_ledger_entry', 'business', 'business_sale_proceeds'),
      ('record_player_ledger_entry', 'business', 'capital_contribution_out'),
      ('record_player_ledger_entry', 'business', 'capitalization_in'),
      ('record_player_ledger_entry', 'business', 'capitalization_out'),
      ('record_player_ledger_entry', 'business', 'formation_fee'),
      ('record_player_ledger_entry', 'business', 'input_purchase'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_in'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_out'),
      ('record_player_ledger_entry', 'business', 'ownership_purchase'),
      ('record_player_ledger_entry', 'business', 'ownership_sale'),
      ('record_player_ledger_entry', 'business', 'payroll_employee_credit'),
      ('record_player_ledger_entry', 'business', 'payroll_recovery_credit'),
      ('record_player_ledger_entry', 'business', 'production_labor'),
      ('record_player_ledger_entry', 'business', 'sales_revenue'),
      ('record_player_ledger_entry', 'business', 'tax_expense'),
      ('record_player_ledger_entry', 'contracts', 'contract_reward_cash'),
      ('record_player_ledger_entry', 'ledger', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'loans', 'loan_disbursement'),
      ('record_player_ledger_entry', 'loans', 'loan_payment'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_purchase'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_credit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_debit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_sale'),
      ('record_player_ledger_entry', 'players', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'setup', 'initial_balance_seed'),
      ('record_player_ledger_entry', 'stocks', 'stock_buy'),
      ('record_player_ledger_entry', 'stocks', 'stock_sell'),
      ('record_player_ledger_entry', 'store', 'business_offer_purchase_debit'),
      ('record_player_ledger_entry', 'store', 'store_purchase'),
      ('record_player_ledger_entry', 'storylines', 'cash_credit'),
      ('record_player_ledger_entry', 'storylines', 'cash_debit'),
      ('record_player_ledger_entry', 'travel', 'route_travel'),
      ('record_business_ledger_entry_v2', 'business', 'capital_contribution_in'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_period_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_recovery_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'store_procurement_purchase'),
      ('record_business_ledger_entry_v2', 'store', 'business_offer_purchase_credit')
  );
$function$;

revoke all on function private.bank_compatibility_gateway_allowed_v1(
  text, text, text
) from public, anon, authenticated, service_role;

-- Fail the zero-to-head replay if the legitimate staff-adjustment routes are
-- ever dropped from the compatibility matrix, while proving that this remains
-- an allowlist rather than an open-ended bypass.
do $function$
begin
  if not private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', 'ledger', 'staff_player_balance_adjustment'
  ) then
    raise exception 'BANK_COMPATIBILITY_CLASSROOM_STAFF_ADJUSTMENT_MISSING';
  end if;

  if not private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', 'players', 'staff_player_balance_adjustment'
  ) then
    raise exception 'BANK_COMPATIBILITY_ADMIN_PLAYER_ADJUSTMENT_MISSING';
  end if;

  if not private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', 'banking', 'staff_player_balance_adjustment'
  ) then
    raise exception 'BANK_COMPATIBILITY_ADMIN_BANKING_ADJUSTMENT_MISSING';
  end if;

  if not private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', 'attendance', 'staff_reward_adjustment'
  ) then
    raise exception 'BANK_COMPATIBILITY_ADMIN_ATTENDANCE_ADJUSTMENT_MISSING';
  end if;

  if private.bank_compatibility_gateway_allowed_v1(
    'record_player_ledger_entry', 'untrusted', 'staff_player_balance_adjustment'
  ) then
    raise exception 'BANK_COMPATIBILITY_STAFF_ADJUSTMENT_ALLOWLIST_TOO_BROAD';
  end if;
end;
$function$;

commit;
