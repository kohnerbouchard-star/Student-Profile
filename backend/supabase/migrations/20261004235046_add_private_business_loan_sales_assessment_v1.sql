-- REF025c2-2a: private assessment only; both creation gates remain installed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create function economy_private.assess_business_loan_application_v1(
  p_game_session_id uuid, p_business_id uuid, p_product_id uuid,
  p_amount numeric, p_as_of timestamptz
) returns table (
  qualifying_income numeric, income_per_payment numeric, projected_payment numeric,
  affordability_ratio numeric, maximum_payment_to_income numeric,
  minimum_credit_score integer, affordable boolean
)
language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $function$
declare
  product public.loan_products%rowtype;
  amount numeric := round(p_amount, 2);
begin
  if p_game_session_id is null or p_business_id is null or p_product_id is null
    or p_as_of is null or not isfinite(p_as_of) then
    raise exception 'BUSINESS_LOAN_ASSESSMENT_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if amount is null or amount <= 0 or amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'LOAN_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  select p.* into product from public.loan_products p
  join public.business_entities b on b.game_session_id = p.game_session_id
    and b.id = p_business_id and b.currency_code = p.currency_code
    and b.status in ('active','restructuring')
  where p.game_session_id = p_game_session_id and p.id = p_product_id
    and p.borrower_type = 'business' and p.status = 'active';
  if not found then
    raise exception 'BUSINESS_LOAN_ASSESSMENT_PRODUCT_INVALID' using errcode = 'P0001';
  end if;
  if amount < product.minimum_amount or amount > product.maximum_amount then
    raise exception 'LOAN_AMOUNT_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  -- Immutable receipts validate both retained ledger credits and C0-funded sales.
  -- No ledger/statement joins: one sale once, including periods not yet closed.
  select coalesce(sum(r.gross_revenue), 0) into qualifying_income
  from public.store_offer_purchase_receipts r
  where r.game_session_id = p_game_session_id and r.business_id = p_business_id
    and r.currency_code = product.currency_code and r.business_sales_authority_version = 1
    and r.business_sales_authority_committed_at >= p_as_of - interval '84 days'
    and r.business_sales_authority_committed_at <= p_as_of;
  income_per_payment := round(qualifying_income / 12 * greatest(product.payment_frequency_cycles, 1), 2);
  projected_payment := public.calculate_loan_installment_payment_v1(amount,
    product.annual_rate, product.term_cycles, product.payment_frequency_cycles);
  affordability_ratio := case when income_per_payment <= 0 then 100
    else least(100, round(projected_payment / income_per_payment, 6)) end;
  maximum_payment_to_income := product.maximum_payment_to_income;
  minimum_credit_score := product.minimum_credit_score;
  affordable := affordability_ratio <= maximum_payment_to_income;
  return next;
end;
$function$;
revoke all on function economy_private.assess_business_loan_application_v1(uuid,uuid,uuid,numeric,timestamptz)
  from public, anon, authenticated, service_role;
comment on function economy_private.assess_business_loan_application_v1(uuid,uuid,uuid,numeric,timestamptz) is
  'Private sales-only assessment. Caller owns authorization, locks and captured as-of snapshot; no credit-profile writes or lending activation.';
commit;
