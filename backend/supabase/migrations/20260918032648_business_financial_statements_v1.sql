-- Phase 14A: accrual statements at the guarded period's exclusive due boundary.
-- Cash paid by a late close belongs to its actual payment interval; payroll/tax
-- obligations belong to the operating period. Later recovery never rewrites history.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function economy_private.business_positions_at_v1(
  p_game uuid,p_business uuid,p_cutoff timestamptz
) returns table(currency_code text,inventory numeric,equipment numeric,
  loan_principal numeric,interest_payable numeric,cost_known boolean)
language sql stable security invoker set search_path=pg_catalog,pg_temp
as $function$
  with latest as (
    select distinct on (source_id,account_code,currency_code)
      source_id,account_code,currency_code,amount,cost_known
    from public.business_accounting_position_events
    where game_session_id=p_game and business_id=p_business and observed_at<p_cutoff
    order by source_id,account_code,currency_code,observed_at desc,sequence_id desc
  )
  select currency_code,
    coalesce(sum(amount) filter(where account_code='inventory'),0),
    coalesce(sum(amount) filter(where account_code='equipment'),0),
    coalesce(sum(amount) filter(where account_code='loan_principal'),0),
    coalesce(sum(amount) filter(where account_code='interest_payable'),0),
    bool_and(cost_known)
  from latest group by currency_code;
$function$;
revoke all on function economy_private.business_positions_at_v1(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;

create function economy_private.business_cash_flows_v1(
  p_game uuid,p_business uuid,p_start timestamptz,p_due timestamptz
) returns table(currency_code text,opening_cash numeric,closing_cash numeric,
  operating_cash numeric,investing_cash numeric,financing_cash numeric,exchange_cash numeric,
  capital_cash numeric,interest_paid numeric,unclassified_cash numeric,unclassified_count bigint)
language sql stable security invoker set search_path=pg_catalog,pg_temp
as $function$
  with entries as (
    select l.*,coalesce(pay.principal_amount,0) principal_paid,
      coalesce(pay.interest_amount,0) loan_interest_paid,
      case
        when l.source_domain='banking_fx' then 'exchange'
        when l.source_action in ('capital_contribution_in','capitalization_in','ipo_primary_subscription') then 'capital'
        when l.source_action='loan_disbursement' then 'financing'
        when l.source_action='loan_payment' and pay.id is not null then 'loan_payment'
        when l.source_action in ('store_procurement_purchase','store-procurement') then
          case when item.item_class='equipment' then 'investing' else 'operating' end
        when l.source_action in ('business_offer_purchase_credit','business_offer_purchase_funding','payroll_period_settlement',
          'payroll_recovery_settlement','operating_period_gross_receipts_tax',
          'operating_period_tax_recovery','account_transfer_in','account_transfer_out')
          then 'operating'
        else 'unclassified'
      end cash_class
    from public.ledger_entries l
    left join public.loan_payments pay on pay.game_session_id=l.game_session_id
      and pay.ledger_entry_id=l.id and pay.status='posted'
    left join public.business_store_purchases purchase on purchase.game_session_id=l.game_session_id
      and purchase.id=l.source_id and purchase.business_id=l.business_id
    left join public.store_items store_item on store_item.game_session_id=purchase.game_session_id
      and store_item.id=purchase.store_item_id
    left join public.game_items item on item.game_session_id=store_item.game_session_id
      and item.id=store_item.game_item_id
    where l.game_session_id=p_game and l.business_id=p_business and l.created_at<p_due
  )
  select currency_code,
    coalesce(sum(amount) filter(where created_at<p_start),0),
    coalesce(sum(amount),0),
    coalesce(sum(case when cash_class='operating' then amount
      when cash_class='loan_payment' then -loan_interest_paid else 0 end)
      filter(where created_at>=p_start),0),
    coalesce(sum(amount) filter(where created_at>=p_start and cash_class='investing'),0),
    coalesce(sum(case when cash_class in ('capital','financing') then amount
      when cash_class='loan_payment' then -principal_paid else 0 end)
      filter(where created_at>=p_start),0),
    coalesce(sum(amount) filter(where created_at>=p_start and cash_class='exchange'),0),
    coalesce(sum(amount) filter(where created_at>=p_start and cash_class='capital'),0),
    coalesce(sum(loan_interest_paid) filter(where created_at>=p_start),0),
    coalesce(sum(amount) filter(where created_at>=p_start and cash_class='unclassified'),0),
    count(*) filter(where created_at>=p_start and cash_class='unclassified')
  from entries group by currency_code;
$function$;
revoke all on function economy_private.business_cash_flows_v1(uuid,uuid,timestamptz,timestamptz)
  from public,anon,authenticated,service_role;

create function economy_private.business_period_statements_v1(
  p_receipt public.business_operating_period_close_receipts
) returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $function$
declare
  v_result jsonb;
  v_covered boolean;
begin
  select c.from_inception or c.observed_from<=(p_receipt).period_started_at
  into v_covered from public.business_accounting_coverage c
  where c.game_session_id=(p_receipt).game_session_id and c.business_id=(p_receipt).business_id;
  with opening as materialized (
    select * from economy_private.business_positions_at_v1(
      (p_receipt).game_session_id,(p_receipt).business_id,(p_receipt).period_started_at)
  ), closing as materialized (
    select * from economy_private.business_positions_at_v1(
      (p_receipt).game_session_id,(p_receipt).business_id,(p_receipt).due_at)
  ), cash as materialized (
    select * from economy_private.business_cash_flows_v1(
      (p_receipt).game_session_id,(p_receipt).business_id,
      (p_receipt).period_started_at,(p_receipt).due_at)
  ), sales as (
    select s.value->>'currencyCode' currency_code,
      (s.value->>'grossReceipts')::numeric revenue,
      (s.value->>'costOfGoodsSold')::numeric cogs
    from jsonb_array_elements((p_receipt).gross_receipts_by_currency) s(value)
  ), tax as (
    select t.value->>'currencyCode' currency_code,(t.value->>'taxAssessed')::numeric expense
    from jsonb_array_elements((p_receipt).tax_by_currency) t(value)
  ), labor as (
    select r.cost_currency_code currency_code,sum(r.labor_cost_basis) amount
    from public.business_manufacturing_completion_receipts r
    join public.business_manufacturing_jobs j on j.game_session_id=r.game_session_id and j.id=r.job_id
    where j.game_session_id=(p_receipt).game_session_id and j.business_id=(p_receipt).business_id
      and r.completed_at>=(p_receipt).period_started_at and r.completed_at<(p_receipt).due_at
    group by r.cost_currency_code
  ), contributions as (
    select l.currency_code,sum(l.quantity_delta*l.unit_cost) amount
    from public.inventory_transaction_lines l
    join public.inventory_transactions t on t.game_session_id=l.game_session_id and t.id=l.transaction_id
    join public.inventory_accounts a on a.game_session_id=l.game_session_id and a.id=l.inventory_account_id
    join public.economic_parties p on p.game_session_id=a.game_session_id and p.id=a.party_id
    where l.game_session_id=(p_receipt).game_session_id and p.business_id=(p_receipt).business_id
      and t.status='committed' and t.source_domain='business' and t.source_action='owner_inventory_contribution'
      and t.committed_at>=(p_receipt).period_started_at and t.committed_at<(p_receipt).due_at
    group by l.currency_code
  ), funded_purchases as materialized (
    -- Settled immutable quotes retain the historical reference rate. The
    -- source spread/rounding is expense; the converted principal reallocates
    -- equity between separately presented currencies, without invented cash.
    select l.source_currency_code,l.target_currency_code,l.target_contribution,l.source_debit,
      round(l.target_contribution/l.reference_rate,18) source_principal
    from public.purchase_funding_receipts r
    join public.purchase_funding_quote_lines l
      on l.game_session_id=r.game_session_id and l.quote_id=r.quote_id
    where r.game_session_id=(p_receipt).game_session_id and r.business_id=(p_receipt).business_id
      and r.source_domain='business' and r.source_action='store-procurement' and l.requires_fx
      and r.created_at>=(p_receipt).period_started_at and r.created_at<(p_receipt).due_at
  ), currency_movements as (
    select currency_code,sum(reallocation) reallocation,sum(exchange_cost) exchange_cost from (
      select source_currency_code currency_code,-source_principal reallocation,
        source_debit-source_principal exchange_cost from funded_purchases
      union all
      select target_currency_code,target_contribution,0 from funded_purchases
    ) movements group by currency_code
  ), currencies as (
    select (p_receipt).reporting_currency_code currency_code union select currency_code from opening
    union select currency_code from closing union select currency_code from cash
    union select currency_code from sales union select currency_code from tax
    union select currency_code from labor union select currency_code from contributions
    union select currency_code from currency_movements
  ), balances as (
    select c.currency_code,coalesce(o.inventory,0) opening_inventory,coalesce(o.equipment,0) opening_equipment,
      coalesce(o.loan_principal,0) opening_loans,coalesce(o.interest_payable,0) opening_interest,
      coalesce(e.inventory,0) closing_inventory,coalesce(e.equipment,0) closing_equipment,
      coalesce(e.loan_principal,0) closing_loans,coalesce(e.interest_payable,0) closing_interest,
      coalesce(o.cost_known,true) and coalesce(e.cost_known,true) cost_known,
      coalesce(f.opening_cash,0) opening_cash,coalesce(f.closing_cash,0) closing_cash,
      coalesce(f.operating_cash,0) operating_cash,coalesce(f.investing_cash,0) investing_cash,
      coalesce(f.financing_cash,0) financing_cash,coalesce(f.exchange_cash,0) exchange_cash,
      coalesce(f.capital_cash,0) capital_cash,coalesce(f.interest_paid,0) interest_paid,
      coalesce(f.unclassified_cash,0) unclassified_cash,coalesce(f.unclassified_count,0) unclassified_count,
      coalesce(s.revenue,0) revenue,coalesce(s.cogs,0) cogs,coalesce(t.expense,0) tax_expense,
      coalesce(l.amount,0) capitalized_labor,coalesce(n.amount,0) noncash_capital,
      coalesce(m.reallocation,0)+coalesce(f.exchange_cash,0) currency_reallocation,
      coalesce(m.exchange_cost,0) exchange_cost,
      case when c.currency_code=(p_receipt).reporting_currency_code then (p_receipt).gross_wages_due else 0 end payroll_expense,
      coalesce((select sum(loan.origination_fee) from public.player_loans loan
        where loan.game_session_id=(p_receipt).game_session_id and loan.business_id=(p_receipt).business_id
          and loan.currency_code=c.currency_code and loan.created_at>=(p_receipt).period_started_at
          and loan.created_at<(p_receipt).due_at),0) loan_fees
    from currencies c left join opening o using(currency_code) left join closing e using(currency_code)
    left join cash f using(currency_code) left join sales s using(currency_code)
    left join tax t using(currency_code) left join labor l using(currency_code)
    left join contributions n using(currency_code)
    left join currency_movements m using(currency_code)
  ), obligations as (
    select b.*,
      coalesce((select sum(r.gross_wages_due) from public.business_operating_period_close_receipts r
        where r.game_session_id=(p_receipt).game_session_id and r.business_id=(p_receipt).business_id
          and r.reporting_currency_code=b.currency_code and r.period_number<(p_receipt).period_number),0)
        +coalesce((select sum(l.amount) from public.ledger_entries l
          where l.game_session_id=(p_receipt).game_session_id and l.business_id=(p_receipt).business_id
            and l.currency_code=b.currency_code and l.source_action in ('payroll_period_settlement','payroll_recovery_settlement')
            and l.created_at<(p_receipt).period_started_at),0) opening_wages_payable,
      coalesce((select sum(r.gross_wages_due) from public.business_operating_period_close_receipts r
        where r.game_session_id=(p_receipt).game_session_id and r.business_id=(p_receipt).business_id
          and r.reporting_currency_code=b.currency_code and r.period_number<(p_receipt).period_number),0)
        +b.payroll_expense
        +coalesce((select sum(l.amount) from public.ledger_entries l
          where l.game_session_id=(p_receipt).game_session_id and l.business_id=(p_receipt).business_id
            and l.currency_code=b.currency_code and l.source_action in ('payroll_period_settlement','payroll_recovery_settlement')
            and l.created_at<(p_receipt).due_at),0) closing_wages_payable,
      coalesce((select sum(a.tax_assessed) from public.business_gross_receipts_tax_assessments a
        where a.game_session_id=(p_receipt).game_session_id and a.business_id=(p_receipt).business_id
          and a.currency_code=b.currency_code and a.period_number<(p_receipt).period_number),0)
        -coalesce((select sum(t.amount_paid) from public.business_gross_receipts_tax_payments t
          where t.game_session_id=(p_receipt).game_session_id and t.business_id=(p_receipt).business_id
            and t.currency_code=b.currency_code and t.paid_at<(p_receipt).period_started_at),0) opening_tax_payable,
      coalesce((select sum(a.tax_assessed) from public.business_gross_receipts_tax_assessments a
        where a.game_session_id=(p_receipt).game_session_id and a.business_id=(p_receipt).business_id
          and a.currency_code=b.currency_code and a.period_number<=(p_receipt).period_number),0)
        -coalesce((select sum(t.amount_paid) from public.business_gross_receipts_tax_payments t
          where t.game_session_id=(p_receipt).game_session_id and t.business_id=(p_receipt).business_id
            and t.currency_code=b.currency_code and t.paid_at<(p_receipt).due_at),0) closing_tax_payable
    from balances b
  ), totals as (
    select o.*,revenue-cogs-payroll_expense+capitalized_labor-tax_expense-exchange_cost
      -(closing_interest-opening_interest+interest_paid+loan_fees) net_income,
      opening_cash+opening_inventory+opening_equipment opening_assets,
      closing_cash+closing_inventory+closing_equipment closing_assets,
      opening_loans+opening_interest+opening_wages_payable+opening_tax_payable opening_liabilities,
      closing_loans+closing_interest+closing_wages_payable+closing_tax_payable closing_liabilities
    from obligations o
  ), reconciled as (
    select t.*,
      (closing_assets-closing_liabilities)-(opening_assets-opening_liabilities)
        -capital_cash-noncash_capital-currency_reallocation-net_income equity_difference,
      closing_cash-opening_cash-operating_cash-investing_cash-financing_cash-exchange_cash-unclassified_cash cash_difference
    from totals t
  )
  select jsonb_build_object(
    'schemaVersion',1,'basis','accrual_at_period_due','currencyPresentation','separate_no_fx_consolidation',
    'laborPolicy','capitalize_on_canonical_completion','periodNumber',(p_receipt).period_number::text,
    'closeReceiptKey',(p_receipt).public_key,'startedAt',(p_receipt).period_started_at,'dueAt',(p_receipt).due_at,
    'status',case when not coalesce(v_covered,false) then 'incomplete_history'
      when bool_and(cost_known and equity_difference=0 and cash_difference=0 and unclassified_count=0
        and closing_wages_payable>=0 and closing_tax_payable>=0) then 'complete' else 'unreconciled' end,
    'currencies',jsonb_agg(jsonb_build_object(
      'currencyCode',currency_code,
      'incomeStatement',jsonb_build_object(
        'revenue',revenue::text,'costOfGoodsSold',cogs::text,'grossProfit',(revenue-cogs)::text,
        'payrollExpense',payroll_expense::text,'capitalizedLabor',capitalized_labor::text,
        'grossReceiptsTaxExpense',tax_expense::text,
        'fundingExchangeExpense',exchange_cost::text,
        'interestAndLoanFees',(closing_interest-opening_interest+interest_paid+loan_fees)::text,
        'netIncome',net_income::text),
      'balanceSheet',jsonb_build_object(
        'cash',closing_cash::text,'inventory',closing_inventory::text,'equipment',closing_equipment::text,
        'totalAssets',closing_assets::text,'loanPrincipal',closing_loans::text,
        'interestPayable',closing_interest::text,'wagesPayable',closing_wages_payable::text,
        'taxPayable',closing_tax_payable::text,'totalLiabilities',closing_liabilities::text,
        'openingEquity',(opening_assets-opening_liabilities)::text,
        'cashContributions',capital_cash::text,'noncashContributions',noncash_capital::text,
        'currencyReallocation',currency_reallocation::text,'periodEarnings',net_income::text,
        'totalEquity',(closing_assets-closing_liabilities)::text),
      'cashFlowStatement',jsonb_build_object(
        'openingCash',opening_cash::text,'operating',operating_cash::text,'investing',investing_cash::text,
        'financing',financing_cash::text,'currencyExchange',exchange_cash::text,
        'unclassified',unclassified_cash::text,'closingCash',closing_cash::text),
      'reconciliation',jsonb_build_object('equityDifference',equity_difference::text,
        'cashDifference',cash_difference::text,'unclassifiedCashEntries',unclassified_count,
        'inventoryCostKnown',cost_known)
    ) order by currency_code)
  ) into v_result from reconciled;
  return v_result;
end;
$function$;
revoke all on function economy_private.business_period_statements_v1(public.business_operating_period_close_receipts)
  from public,anon,authenticated,service_role;

create function economy_private.capture_business_financial_statements_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,pg_temp
as $function$
declare v_statement jsonb;
begin
  v_statement:=economy_private.business_period_statements_v1(new);
  insert into public.business_financial_statements(
    game_session_id,business_id,close_receipt_id,period_number,status,statement)
  values(new.game_session_id,new.business_id,new.id,new.period_number,v_statement->>'status',v_statement);
  return new;
end;
$function$;
revoke all on function economy_private.capture_business_financial_statements_v1()
  from public,anon,authenticated,service_role;
create trigger capture_business_financial_statements
after insert on public.business_operating_period_close_receipts
for each row execute function economy_private.capture_business_financial_statements_v1();

-- Preserve the initial evidence endpoint. The full statement read is additive.
create function economy_private.read_business_financial_statements_v1(p_game uuid,p_business uuid)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $function$
declare v_business record;v_result jsonb;
begin
  select * into v_business from economy_private.resolve_business_read_scope_v2(p_game,p_business);
  with candidates as materialized (
    select s.period_number,s.statement from public.business_financial_statements s
    where s.game_session_id=p_game and s.business_id=p_business order by s.period_number desc limit 51
  )
  select jsonb_build_object('schemaVersion',1,'businessKey',v_business.business_key,
    'readOnly',true,'reportingCurrencyCode',v_business.currency_code,'periodLimit',50,
    'truncated',(select count(*)>50 from candidates),
    'statements',coalesce((select jsonb_agg(s.statement order by s.period_number desc)
      from (select * from candidates order by period_number desc limit 50) s),'[]'::jsonb),
    'legacyPeriodsUnavailable',exists(select 1 from public.business_operating_period_close_receipts r
      where r.game_session_id=p_game and r.business_id=p_business
        and not exists(select 1 from public.business_financial_statements s where s.close_receipt_id=r.id))
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function economy_private.read_business_financial_statements_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
create function public.read_owned_business_financial_statements_v1(p_game_session_id uuid,p_player_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_business record;
begin
  select * into v_business from public.resolve_player_business_v2(p_game_session_id,p_player_id);
  return economy_private.read_business_financial_statements_v1(p_game_session_id,v_business.business_id);
end;
$function$;
revoke all on function public.read_owned_business_financial_statements_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_owned_business_financial_statements_v1(uuid,uuid) to service_role;
commit;
