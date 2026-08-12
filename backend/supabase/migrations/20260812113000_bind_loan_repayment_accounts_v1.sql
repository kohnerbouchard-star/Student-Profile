-- Bind loan applications and repayments to authoritative player-owned accounts.
--
-- Existing loan applications used a free-text repayment_source field. This
-- migration preserves the column for compatibility but canonicalizes its value
-- to an account identifier: checking, savings, or business:<public business key>.
-- The approved loan stores the selected account and repayments debit it.

begin;

alter table public.player_loans
  add column if not exists repayment_account_type text;

comment on column public.loan_applications.repayment_source is
  'Canonical repayment account identifier: checking, savings, or business:<public business key>. Legacy free text is normalized during application insert.';

comment on column public.player_loans.repayment_account_type is
  'Authoritative account type debited for repayments: checking, savings, or business:<public business key>.';

update public.loan_applications as application_row
set repayment_source = case
  when product_row.borrower_type = 'business' then coalesce(
    (
      select public.business_account_type_v1(business_row.public_key)
      from public.business_entities as business_row
      where business_row.id = application_row.business_id
        and business_row.game_session_id = application_row.game_session_id
        and business_row.owner_player_id = application_row.player_id
    ),
    'checking'
  )
  when lower(btrim(coalesce(application_row.repayment_source, ''))) in ('checking', 'savings')
    then lower(btrim(application_row.repayment_source))
  else 'checking'
end
from public.loan_products as product_row
where product_row.id = application_row.loan_product_id;

update public.player_loans as loan_row
set repayment_account_type = coalesce(
  (
    select application_row.repayment_source
    from public.loan_applications as application_row
    where application_row.id = loan_row.application_id
      and application_row.game_session_id = loan_row.game_session_id
      and application_row.player_id = loan_row.player_id
  ),
  (
    select public.business_account_type_v1(business_row.public_key)
    from public.business_entities as business_row
    where business_row.id = loan_row.business_id
      and business_row.game_session_id = loan_row.game_session_id
      and business_row.owner_player_id = loan_row.player_id
  ),
  'checking'
)
where loan_row.repayment_account_type is null
   or btrim(loan_row.repayment_account_type) = '';

alter table public.player_loans
  alter column repayment_account_type set default 'checking',
  alter column repayment_account_type set not null;

alter table public.loan_applications
  drop constraint if exists loan_applications_repayment_account_check;
alter table public.loan_applications
  add constraint loan_applications_repayment_account_check check (
    repayment_source in ('checking', 'savings')
    or repayment_source ~ '^business:biz_[0-9a-f]{32}$'
  );

alter table public.player_loans
  drop constraint if exists player_loans_repayment_account_check;
alter table public.player_loans
  add constraint player_loans_repayment_account_check check (
    repayment_account_type in ('checking', 'savings')
    or repayment_account_type ~ '^business:biz_[0-9a-f]{32}$'
  );

create or replace function public.normalize_loan_application_repayment_account_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_product public.loan_products%rowtype;
  v_business public.business_entities%rowtype;
  v_account text := lower(btrim(coalesce(new.repayment_source, '')));
  v_expected_business_account text;
begin
  select product_row.*
  into v_product
  from public.loan_products as product_row
  where product_row.id = new.loan_product_id
    and product_row.game_session_id = new.game_session_id;
  if not found then
    raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_product.borrower_type = 'business' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.id = new.business_id
      and business_row.game_session_id = new.game_session_id
      and business_row.owner_player_id = new.player_id
      and business_row.status in ('active', 'restructuring');
    if not found then
      raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode = 'P0001';
    end if;

    v_expected_business_account := public.business_account_type_v1(v_business.public_key);
    if v_account = v_expected_business_account then
      null;
    elsif v_account ~ '^business:biz_[0-9a-f]{32}$' then
      raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
    else
      -- Compatibility for the previously deployed free-text Player form.
      v_account := v_expected_business_account;
    end if;
  else
    if new.business_id is not null then
      raise exception 'BUSINESS_NOT_ALLOWED_FOR_PRODUCT' using errcode = 'P0001';
    end if;
    if v_account not in ('checking', 'savings') then
      if v_account ~ '^business:biz_[0-9a-f]{32}$' then
        raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
      end if;
      -- Compatibility for the previously deployed free-text Player form.
      v_account := 'checking';
    end if;
  end if;

  perform 1
  from public.account_balances as balance_row
  where balance_row.game_session_id = new.game_session_id
    and balance_row.player_id = new.player_id
    and balance_row.account_type = v_account
    and balance_row.currency_code = v_product.currency_code;
  if not found then
    raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  new.repayment_source := v_account;
  return new;
end;
$function$;

drop trigger if exists normalize_loan_application_repayment_account
  on public.loan_applications;
create trigger normalize_loan_application_repayment_account
before insert or update of repayment_source, business_id, loan_product_id,
  player_id, game_session_id
on public.loan_applications
for each row execute function public.normalize_loan_application_repayment_account_v1();

create or replace function public.bind_player_loan_repayment_account_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_product public.loan_products%rowtype;
  v_account text := lower(btrim(coalesce(new.repayment_account_type, '')));
  v_expected_business_account text;
begin
  select product_row.*
  into v_product
  from public.loan_products as product_row
  where product_row.id = new.loan_product_id
    and product_row.game_session_id = new.game_session_id;
  if not found then
    raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if new.application_id is not null then
    select application_row.repayment_source
    into v_account
    from public.loan_applications as application_row
    where application_row.id = new.application_id
      and application_row.game_session_id = new.game_session_id
      and application_row.player_id = new.player_id;
    if not found then
      raise exception 'LOAN_APPLICATION_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  if v_product.borrower_type = 'business' then
    select public.business_account_type_v1(business_row.public_key)
    into v_expected_business_account
    from public.business_entities as business_row
    where business_row.id = new.business_id
      and business_row.game_session_id = new.game_session_id
      and business_row.owner_player_id = new.player_id
      and business_row.status in ('active', 'restructuring');
    if not found then
      raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode = 'P0001';
    end if;
    if v_account is distinct from v_expected_business_account then
      raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
    end if;
  elsif v_account not in ('checking', 'savings') then
    raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.account_balances as balance_row
  where balance_row.game_session_id = new.game_session_id
    and balance_row.player_id = new.player_id
    and balance_row.account_type = v_account
    and balance_row.currency_code = new.currency_code;
  if not found then
    raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  new.repayment_account_type := v_account;
  return new;
end;
$function$;

drop trigger if exists bind_player_loan_repayment_account
  on public.player_loans;
create trigger bind_player_loan_repayment_account
before insert or update of repayment_account_type, application_id, business_id,
  loan_product_id, player_id, game_session_id, currency_code
on public.player_loans
for each row execute function public.bind_player_loan_repayment_account_v1();

create or replace function public.repay_player_loan_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_loan_key text,
  p_amount numeric,
  p_idempotency_key text
)
returns table (
  payment_key text,
  loan_key text,
  status text,
  principal_balance numeric,
  accrued_interest numeric,
  next_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_loan public.player_loans%rowtype;
  v_product public.loan_products%rowtype;
  v_payment public.loan_payments%rowtype;
  v_requested_amount numeric := round(coalesce(p_amount, 0), 2);
  v_hash text;
  v_days numeric;
  v_interest_accrual numeric;
  v_total_due numeric;
  v_pay numeric;
  v_interest_paid numeric;
  v_principal_paid numeric;
  v_balance numeric := 0;
  v_entry uuid;
  v_account text;
  v_expected_business_account text;
  v_new_principal numeric;
  v_new_interest numeric;
  v_is_paid boolean;
  v_frequency_days integer;
  v_period_paid numeric := 0;
  v_due_satisfied boolean := false;
  v_next_due timestamptz;
  v_new_status text;
begin
  if v_requested_amount <= 0 or v_requested_amount > 10000000 then
    raise exception 'PAYMENT_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select loan_row.*
  into v_loan
  from public.player_loans as loan_row
  where loan_row.game_session_id = p_game_session_id
    and loan_row.player_id = p_player_id
    and loan_row.public_key = lower(btrim(p_loan_key))
  for update;
  if not found then
    raise exception 'LOAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_loan.status not in ('active', 'delinquent', 'restructured') then
    raise exception 'LOAN_NOT_PAYABLE' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.loan_products as product_row
  where product_row.id = v_loan.loan_product_id;
  if not found then
    raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws(
    '|', p_game_session_id, p_player_id, v_loan.id, v_requested_amount
  ), 'sha256'), 'hex');

  select payment_row.*
  into v_payment
  from public.loan_payments as payment_row
  where payment_row.game_session_id = p_game_session_id
    and payment_row.player_id = p_player_id
    and payment_row.loan_id = v_loan.id
    and payment_row.idempotency_key = p_idempotency_key;
  if found then
    if v_payment.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_payment.public_key,
      v_loan.public_key,
      v_loan.status,
      v_loan.principal_balance,
      v_loan.accrued_interest,
      v_loan.next_due_at,
      true;
    return;
  end if;

  v_days := greatest(
    0,
    extract(epoch from (now() - v_loan.last_accrued_at)) / 86400
  );
  v_interest_accrual := round(
    v_loan.principal_balance * v_loan.annual_rate * v_days / 365,
    2
  );
  v_loan.accrued_interest := v_loan.accrued_interest + v_interest_accrual;
  v_total_due := v_loan.principal_balance + v_loan.accrued_interest;
  v_pay := least(v_requested_amount, v_total_due);

  v_account := lower(btrim(coalesce(v_loan.repayment_account_type, '')));
  if v_loan.business_id is not null then
    select public.business_account_type_v1(business_row.public_key)
    into v_expected_business_account
    from public.business_entities as business_row
    where business_row.id = v_loan.business_id
      and business_row.game_session_id = p_game_session_id
      and business_row.owner_player_id = p_player_id;
    if not found then
      raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode = 'P0001';
    end if;
    if v_account is distinct from v_expected_business_account then
      raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
    end if;
  elsif v_account not in ('checking', 'savings') then
    raise exception 'LOAN_REPAYMENT_ACCOUNT_INVALID' using errcode = 'P0001';
  end if;

  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = v_account
    and balance_row.currency_code = v_loan.currency_code
  for update;
  if not found then
    raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if coalesce(v_balance, 0) < v_pay then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  v_interest_paid := least(v_pay, v_loan.accrued_interest);
  v_principal_paid := v_pay - v_interest_paid;
  v_new_principal := greatest(0, v_loan.principal_balance - v_principal_paid);
  v_new_interest := greatest(0, v_loan.accrued_interest - v_interest_paid);
  v_is_paid := v_new_principal <= 0.005 and v_new_interest <= 0.005;

  select ledger_entry_id
  into v_entry
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    v_account,
    -v_pay,
    v_loan.currency_code,
    'debit',
    'loans',
    'loan_payment',
    v_loan.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'loan_key', v_loan.public_key,
      'repayment_account_type', v_account,
      'interest_paid', v_interest_paid,
      'principal_paid', v_principal_paid
    )
  );

  insert into public.loan_payments (
    game_session_id, player_id, loan_id, amount, principal_amount,
    interest_amount, idempotency_key, request_hash, ledger_entry_id, status,
    applied_due_at
  ) values (
    p_game_session_id, p_player_id, v_loan.id, v_pay, v_principal_paid,
    v_interest_paid, p_idempotency_key, v_hash, v_entry, 'posted',
    v_loan.next_due_at
  )
  returning * into v_payment;

  v_frequency_days := greatest(v_product.payment_frequency_cycles, 1) * 7;
  select coalesce(sum(payment_row.amount), 0)
  into v_period_paid
  from public.loan_payments as payment_row
  where payment_row.game_session_id = p_game_session_id
    and payment_row.loan_id = v_loan.id
    and payment_row.status = 'posted'
    and payment_row.applied_due_at = v_loan.next_due_at;

  v_due_satisfied := v_period_paid + 0.005 >= v_loan.scheduled_payment;
  v_next_due := case
    when v_is_paid then v_loan.next_due_at
    when v_due_satisfied then v_loan.next_due_at
      + make_interval(days => v_frequency_days)
    else v_loan.next_due_at
  end;

  v_new_status := case
    when v_is_paid then 'paid'
    when v_next_due
      + make_interval(days => greatest(v_product.delinquency_grace_days, 0))
      < now()
    then 'delinquent'
    when v_loan.status = 'restructured' then 'restructured'
    else 'active'
  end;

  update public.player_loans as loan_row
  set principal_balance = v_new_principal,
      accrued_interest = v_new_interest,
      last_accrued_at = now(),
      status = v_new_status,
      next_due_at = v_next_due,
      closed_at = case when v_is_paid then now() else null end,
      delinquent_at = case
        when v_new_status = 'delinquent'
        then coalesce(loan_row.delinquent_at, now())
        else null
      end
  where loan_row.id = v_loan.id
  returning loan_row.* into v_loan;

  perform public.recalculate_player_credit_v1(
    p_game_session_id,
    p_player_id
  );

  return query select
    v_payment.public_key,
    v_loan.public_key,
    v_loan.status,
    v_loan.principal_balance,
    v_loan.accrued_interest,
    v_loan.next_due_at,
    false;
end;
$function$;

revoke all on function public.repay_player_loan_v1(uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.repay_player_loan_v1(uuid, uuid, text, numeric, text)
  to service_role;

commit;
