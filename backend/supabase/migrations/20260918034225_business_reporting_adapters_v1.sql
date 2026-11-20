-- Phase 14A: reporting through the existing authenticated Player and Staff reads.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create or replace function public.read_owned_business_workspace_projection_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_status text;
  v_production_readiness jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business.status
  into v_business_status
  from public.business_entities as business
  where business.game_session_id = p_game_session_id
    and business.id = v_business.business_id;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_business_status = 'active' then
    v_production_readiness := public.read_owned_business_production_readiness_v2(
      p_game_session_id,
      p_player_id
    );
  end if;

  return jsonb_build_object(
    'governance', public.read_owned_business_governance_v2(
      p_game_session_id,
      p_player_id
    ),
    'financialReporting', economy_private.read_business_financial_statements_v1(p_game_session_id,v_business.business_id),
    'productionReadiness', v_production_readiness,
    'salesOffers', public.read_owned_business_sales_offers_v2(
      p_game_session_id,
      p_player_id
    ),
    'activity', public.read_owned_business_activity_v2(
      p_game_session_id,
      p_player_id
    )
  );
end
$function$;

revoke all on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_owned_business_workspace_projection_v2(uuid, uuid)
  to service_role;


create or replace function public.read_admin_business_supervision_v2(
  p_game_session_id uuid, p_staff_user_id uuid, p_business_key text
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_sections jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_workforce jsonb;
  v_readiness jsonb;
  v_treasury jsonb;
begin
  if not exists (
    select 1 from public.game_sessions g
    join public.staff_users s on s.id = g.owner_staff_user_id
    join public.staff_permission_grants permission on permission.staff_user_id = s.id
      and permission.permission = 'business.manage'
    where g.id = p_game_session_id and s.id = p_staff_user_id
      and s.status = 'active' and s.role = 'game_admin'
  ) then raise exception 'BUSINESS_SUPERVISION_DENIED' using errcode = 'P0001'; end if;

  select * into v_business from public.business_entities b
  where b.game_session_id = p_game_session_id and b.public_key = p_business_key;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select * from economy_private.read_business_stockroom_locations_v2(p_game_session_id, v_business.id) limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('locations', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select * from economy_private.read_business_stockroom_v2(p_game_session_id, v_business.id) limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('stockroom', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select * from economy_private.read_business_equipment_v2(p_game_session_id, v_business.id) limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('equipment', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select * from economy_private.read_business_manufacturing_jobs_v2(p_game_session_id, v_business.id) limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('manufacturing', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, role_name, status, wage_per_cycle, hired_at, terminated_at from public.business_employees r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.hired_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('employeeHistory', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, payroll_period_key, currency_code, employee_count, gross_wages_due, gross_wages_paid, gross_wages_unpaid, status, started_at, completed_at from public.business_payroll_runs r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.started_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('payroll', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, offer_key, canonical_item_key, quantity, unit_price, currency_code, gross_revenue, cost_of_goods_sold, gross_margin, cost_currency_code, completed_at from public.store_offer_purchase_receipts r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.completed_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('sales', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, period_number, payroll_period_key, currency_code, store_receipt_count, gross_receipts, cost_of_goods_sold, gross_receipts_tax_rate, tax_assessed, tax_paid, tax_unpaid, status, created_at from public.business_gross_receipts_tax_assessments r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.period_number desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('taxes', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, period_number, payroll_period_key, period_started_at, due_at, next_due_at, payroll_status, store_receipt_count, gross_wages_due, gross_wages_paid, gross_wages_unpaid, reporting_currency_code, tax_assessed_reporting_currency, tax_paid_reporting_currency, tax_unpaid_reporting_currency, status, completed_at from public.business_operating_period_close_receipts r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.period_number desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('periods', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, period_number, payroll_period_key, due_at, status, claim_attempt, claimed_at, terminal_at from public.business_operating_period_claims r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.period_number desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('claims', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, ownership_kind, units, voting_units, status, effective_at, ended_at,
   case when status = 'active' then floor(units::numeric * 10000 / nullif(sum(units) filter (where status = 'active') over (),0)) end as ownership_basis_points,
   case when status = 'active' then floor(voting_units::numeric * 10000 / nullif(sum(voting_units) filter (where status = 'active') over (),0)) end as voting_basis_points from public.business_ownership_positions r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.status, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('ownership', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select authorized_shares, issued_shares, treasury_shares, outstanding_shares from public.business_corporate_share_structures r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.updated_at desc limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('shares', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, proposal_type, status, approval_threshold_basis_points, snapshot_total_voting_units, expires_at, resolved_at, executed_at, created_at from public.business_governance_proposals r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.created_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('governance', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, event_type, reason_code, actor_type, occurred_at from public.business_activity_events r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.occurred_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('activity', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select public_key, country_code, requirement_key, requirement_type, status, fee_amount, reviewed_at, expires_at, updated_at from public.business_compliance_records r where r.game_session_id = p_game_session_id and r.business_id = v_business.id order by r.updated_at desc, r.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('compliance', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select v_business.public_key as business_key, action, actor_type, created_at from public.audit_log r where r.game_session_id = p_game_session_id and r.target_type = 'business' and r.target_id = v_business.id order by r.created_at desc, r.id limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('audit', economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select offer.public_key, item.public_key as item_key, item.name as item_name, offer.status, offer.unit_price, offer.currency_code,
 holding.quantity_owned, holding.quantity_reserved, holding.quantity_owned - holding.quantity_reserved as quantity_available,
 withdrawal.public_key as withdrawal_key, offer.withdrawal_mode, offer.withdrawal_requested_quantity,
 offer.withdrawal_requested_at, offer.withdrawal_effective_at, withdrawal.next_attempt_at, withdrawal.last_attempt_at,
 withdrawal.last_block_reason, withdrawal.attempt_count
 from public.store_seller_offers offer
 join public.economic_parties party on party.game_session_id = offer.game_session_id and party.id = offer.seller_party_id
 join public.game_items item on item.game_session_id = offer.game_session_id and item.id = offer.game_item_id
 left join public.inventory_holdings holding on holding.game_session_id = offer.game_session_id and holding.inventory_account_id = offer.inventory_account_id and holding.game_item_id = offer.game_item_id
 left join public.store_offer_withdrawal_requests withdrawal on withdrawal.game_session_id = offer.game_session_id and withdrawal.id = offer.withdrawal_request_id
 where offer.game_session_id = p_game_session_id and party.business_id = v_business.id and party.party_kind = 'business' and offer.seller_kind = 'business'
 order by offer.updated_at desc, offer.public_key limit 101
  ) r;
  v_sections := v_sections || jsonb_build_object('offers', economy_private.business_supervision_section_v2(v_rows));

  v_workforce := economy_private.read_business_workforce_utilization_v2(p_game_session_id, v_business.id);
  -- The canonical readiness calculation intentionally applies only to active businesses.
  -- Preserve that contract while retaining every historical section for closed businesses.
  if v_business.status = 'active' then
    v_readiness := economy_private.read_business_production_readiness_v2(p_game_session_id, v_business.id);
  else
    v_readiness := '[]'::jsonb;
  end if;
  v_sections := v_sections || jsonb_build_object(
    'workforce', economy_private.business_supervision_section_v2(v_workforce->'employees'),
    'readiness', case when v_business.status = 'active'
      then economy_private.business_supervision_section_v2(v_readiness)
      else jsonb_build_object('status', 'unavailable', 'rows', '[]'::jsonb, 'truncated', false)
    end);
  v_treasury := economy_private.get_business_treasury_overview_v1(p_game_session_id, v_business.id);
  v_sections := v_sections || jsonb_build_object(
    'checking', economy_private.business_supervision_section_v2(v_treasury->'accounts'),
    'fxOrders', economy_private.business_supervision_section_v2(v_treasury->'orders') || jsonb_build_object('window', 'Latest 50 canonical orders'),
    'fxReceipts', economy_private.business_supervision_section_v2(v_treasury->'receipts') || jsonb_build_object('window', 'Latest 50 canonical receipts'));


  select coalesce(jsonb_agg(row_value),'[]'::jsonb) into v_rows from (
    select jsonb_build_object('period_number',s.period_number::text,'status',s.status,
      'due_at',s.statement->>'dueAt','currency_code',c.value->>'currencyCode',
      'equity_difference',c.value->'reconciliation'->>'equityDifference',
      'cash_difference',c.value->'reconciliation'->>'cashDifference',
      'revenue',c.value->'incomeStatement'->>'revenue',
      'cost_of_goods_sold',c.value->'incomeStatement'->>'costOfGoodsSold',
      'gross_profit',c.value->'incomeStatement'->>'grossProfit',
      'payroll_expense',c.value->'incomeStatement'->>'payrollExpense',
      'capitalized_labor',c.value->'incomeStatement'->>'capitalizedLabor',
      'tax_expense',c.value->'incomeStatement'->>'grossReceiptsTaxExpense',
      'exchange_expense',c.value->'incomeStatement'->>'fundingExchangeExpense',
      'interest_and_loan_fees',c.value->'incomeStatement'->>'interestAndLoanFees',
      'net_income',c.value->'incomeStatement'->>'netIncome') row_value
    from public.business_financial_statements s cross join lateral jsonb_array_elements(s.statement->'currencies') c(value)
    where s.game_session_id=p_game_session_id and s.business_id=v_business.id
    order by s.period_number desc,c.value->>'currencyCode' limit 101
  ) rows;
  v_sections:=v_sections||jsonb_build_object('statementIncome',economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(row_value),'[]'::jsonb) into v_rows from (
    select jsonb_build_object('period_number',s.period_number::text,'status',s.status,
      'due_at',s.statement->>'dueAt','currency_code',c.value->>'currencyCode',
      'equity_difference',c.value->'reconciliation'->>'equityDifference',
      'cash_difference',c.value->'reconciliation'->>'cashDifference',
      'cash',c.value->'balanceSheet'->>'cash',
      'inventory',c.value->'balanceSheet'->>'inventory',
      'equipment',c.value->'balanceSheet'->>'equipment',
      'total_assets',c.value->'balanceSheet'->>'totalAssets',
      'loan_principal',c.value->'balanceSheet'->>'loanPrincipal',
      'interest_payable',c.value->'balanceSheet'->>'interestPayable',
      'wages_payable',c.value->'balanceSheet'->>'wagesPayable',
      'tax_payable',c.value->'balanceSheet'->>'taxPayable',
      'total_liabilities',c.value->'balanceSheet'->>'totalLiabilities',
      'opening_equity',c.value->'balanceSheet'->>'openingEquity',
      'cash_contributions',c.value->'balanceSheet'->>'cashContributions',
      'noncash_contributions',c.value->'balanceSheet'->>'noncashContributions',
      'currency_reallocation',c.value->'balanceSheet'->>'currencyReallocation',
      'period_earnings',c.value->'balanceSheet'->>'periodEarnings',
      'total_equity',c.value->'balanceSheet'->>'totalEquity') row_value
    from public.business_financial_statements s cross join lateral jsonb_array_elements(s.statement->'currencies') c(value)
    where s.game_session_id=p_game_session_id and s.business_id=v_business.id
    order by s.period_number desc,c.value->>'currencyCode' limit 101
  ) rows;
  v_sections:=v_sections||jsonb_build_object('statementBalance',economy_private.business_supervision_section_v2(v_rows));

  select coalesce(jsonb_agg(row_value),'[]'::jsonb) into v_rows from (
    select jsonb_build_object('period_number',s.period_number::text,'status',s.status,
      'due_at',s.statement->>'dueAt','currency_code',c.value->>'currencyCode',
      'equity_difference',c.value->'reconciliation'->>'equityDifference',
      'cash_difference',c.value->'reconciliation'->>'cashDifference',
      'opening_cash',c.value->'cashFlowStatement'->>'openingCash',
      'operating',c.value->'cashFlowStatement'->>'operating',
      'investing',c.value->'cashFlowStatement'->>'investing',
      'financing',c.value->'cashFlowStatement'->>'financing',
      'currency_exchange',c.value->'cashFlowStatement'->>'currencyExchange',
      'unclassified',c.value->'cashFlowStatement'->>'unclassified',
      'closing_cash',c.value->'cashFlowStatement'->>'closingCash') row_value
    from public.business_financial_statements s cross join lateral jsonb_array_elements(s.statement->'currencies') c(value)
    where s.game_session_id=p_game_session_id and s.business_id=v_business.id
    order by s.period_number desc,c.value->>'currencyCode' limit 101
  ) rows;
  v_sections:=v_sections||jsonb_build_object('statementCash',economy_private.business_supervision_section_v2(v_rows));

  return jsonb_build_object(
    'business', jsonb_build_object(
      'public_key', v_business.public_key, 'legal_name', v_business.legal_name,
      'entity_type', v_business.entity_type, 'industry_code', v_business.industry_code,
      'country_code', v_business.country_code, 'currency_code', v_business.currency_code,
      'status', v_business.status, 'capitalization', v_business.capitalization::text,
      'reputation_score', v_business.reputation_score, 'failure_count', v_business.failure_count,
      'created_at', v_business.created_at, 'updated_at', v_business.updated_at, 'closed_at', v_business.closed_at),
    'supervision', jsonb_build_object(
      'schemaVersion', 1, 'businessKey', v_business.public_key, 'readOnly', true,
      'generatedAt', statement_timestamp(), 'sections', v_sections,
      'healthFlags', to_jsonb(array_remove(array[
        case when v_business.status <> 'active' then 'business-not-active' end,
        case when v_business.failure_count > 0 then 'recorded-failures' end,
        case when exists(select 1 from public.business_payroll_runs r where r.game_session_id = p_game_session_id and r.business_id = v_business.id and r.gross_wages_unpaid > 0) then 'unpaid-payroll-evidence' end,
        case when exists(select 1 from public.business_gross_receipts_tax_assessments r where r.game_session_id = p_game_session_id and r.business_id = v_business.id and r.tax_unpaid > 0) then 'unpaid-tax-evidence' end,
        case when exists(select 1 from jsonb_array_elements(v_readiness) r where r->>'status' <> 'ready') then 'production-readiness-attention' end
      ], null)))
  );
end
$function$;
revoke all on function public.read_admin_business_supervision_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.read_admin_business_supervision_v2(uuid,uuid,text) to service_role;
comment on function public.read_admin_business_supervision_v2(uuid,uuid,text) is
  'Phase 13 read-only Admin supervision; selected-game owner, active staff and business.manage required. No economic mutation.';

commit;
