-- BUSINESS-V2-14A1: immutable closed-period operating evidence, not full statements.
-- No economic writes, clock initialization, current-balance reconstruction or FX totals.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function economy_private.project_business_closed_period_v1(
  p_receipt public.business_operating_period_close_receipts
) returns jsonb
language sql stable security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select jsonb_build_object(
    'closeReceiptKey', (p_receipt).public_key,
    'periodNumber', (p_receipt).period_number::text,
    'startedAt', (p_receipt).period_started_at,
    'dueAt', (p_receipt).due_at,
    'closedAt', (p_receipt).completed_at,
    'reportingCurrencyCode', (p_receipt).reporting_currency_code,
    'storeReceiptCount', (p_receipt).store_receipt_count,
    'salesByCurrency', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currencyCode', e.value ->> 'currencyCode',
        'storeReceiptCount', (e.value ->> 'storeReceiptCount')::integer,
        'grossReceipts', e.value ->> 'grossReceipts',
        'costOfGoodsSold', e.value ->> 'costOfGoodsSold',
        'grossProfit', ((e.value ->> 'grossReceipts')::numeric
          - (e.value ->> 'costOfGoodsSold')::numeric)::text
      ) order by e.value ->> 'currencyCode'), '[]'::jsonb)
      from jsonb_array_elements((p_receipt).gross_receipts_by_currency) e(value)
    ),
    -- Payroll cash/obligation evidence is separate: manufacturing COGS already
    -- includes allocated labor. Full net income requires capitalization reconciliation.
    'payroll', jsonb_build_object(
      'currencyCode', (p_receipt).reporting_currency_code,
      'status', (p_receipt).payroll_status,
      'grossWagesDue', (p_receipt).gross_wages_due::text,
      'grossWagesPaid', (p_receipt).gross_wages_paid::text,
      'grossWagesUnpaid', (p_receipt).gross_wages_unpaid::text
    ),
    'taxByCurrency', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'currencyCode', e.value ->> 'currencyCode',
        'taxRate', e.value ->> 'taxRate',
        'taxAssessed', e.value ->> 'taxAssessed',
        'taxPaid', e.value ->> 'taxPaid',
        'taxUnpaid', e.value ->> 'taxUnpaid',
        'status', e.value ->> 'status'
      ) order by e.value ->> 'currencyCode'), '[]'::jsonb)
      from jsonb_array_elements((p_receipt).tax_by_currency) e(value)
    )
  );
$function$;
revoke all on function economy_private.project_business_closed_period_v1(
  public.business_operating_period_close_receipts
) from public, anon, authenticated, service_role;

create or replace function economy_private.read_business_financial_reports_v1(
  p_game_session_id uuid, p_business_id uuid
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_business record;
  v_result jsonb;
begin
  select * into v_business
  from economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id);

  with candidates as materialized (
    select r as receipt, r.period_number
    from public.business_operating_period_close_receipts r
    where r.game_session_id = p_game_session_id
      and r.business_id = p_business_id
      and r.status = 'completed'
    order by r.period_number desc
    limit 51
  ), visible as (
    select c.* from candidates c order by c.period_number desc limit 50
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'reportKind', 'closed_period_operating_evidence',
    'readOnly', true,
    'businessKey', v_business.business_key,
    'coverage', 'partial',
    'unavailableStatements', jsonb_build_array(
      'income_statement', 'balance_sheet', 'cash_flow_statement'
    ),
    'periodLimit', 50,
    'truncated', (select count(*) > 50 from candidates),
    'periods', coalesce((
      select jsonb_agg(economy_private.project_business_closed_period_v1(
        v.receipt
      ) order by v.period_number desc)
      from visible v
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function economy_private.read_business_financial_reports_v1(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.read_owned_business_financial_reports_v1(
  p_game_session_id uuid, p_player_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_business record;
begin
  -- Only the authenticated service boundary may supply these identities.
  -- Reuse the canonical current-owner resolver, including ambiguity rejection.
  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);
  return economy_private.read_business_financial_reports_v1(
    p_game_session_id, v_business.business_id
  );
end;
$function$;
revoke all on function public.read_owned_business_financial_reports_v1(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_owned_business_financial_reports_v1(uuid,uuid)
  to service_role;

commit;
