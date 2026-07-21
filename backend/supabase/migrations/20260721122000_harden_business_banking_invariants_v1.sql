-- Harden Business and Banking Invariants V1.
-- Corrects acquisition ledger conservation, blocks bounded circular-transfer
-- abuse, and adds reviewed loan-product and recovery administration.

begin;

create or replace function public.guard_banking_transfer_request_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.transfer_kind <> 'player_to_player' then
    return new;
  end if;

  if exists (
    select 1
    from public.banking_transfer_requests prior
    where prior.game_session_id = new.game_session_id
      and prior.sender_player_id = new.recipient_player_id
      and prior.recipient_player_id = new.sender_player_id
      and prior.currency_code = new.currency_code
      and prior.amount = new.amount
      and prior.status = 'posted'
      and prior.posted_at >= now() - interval '10 minutes'
  ) then
    raise exception 'CIRCULAR_TRANSFER_BLOCKED' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from public.banking_transfer_requests prior
    where prior.game_session_id = new.game_session_id
      and prior.sender_player_id = new.sender_player_id
      and prior.status in ('pending', 'posted')
      and prior.created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'TRANSFER_VELOCITY_BLOCKED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger guard_banking_transfer_request
before insert on public.banking_transfer_requests
for each row execute function public.guard_banking_transfer_request_v1();

create or replace function public.create_or_acquire_player_business_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_legal_name text,
  p_entity_type text,
  p_industry_code text,
  p_country_code text,
  p_currency_code text,
  p_capitalization numeric,
  p_acquire_business_key text,
  p_idempotency_key text
) returns table (
  business_key text,
  status text,
  owner_player_id uuid,
  capitalization numeric,
  valuation numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_existing public.business_entities%rowtype;
  v_business public.business_entities%rowtype;
  v_seller_player_id uuid;
  v_buyer_cash numeric := 0;
  v_business_cash numeric := 0;
  v_seller_business_account text;
  v_buyer_business_account text;
  v_is_acquisition boolean := nullif(btrim(coalesce(p_acquire_business_key, '')), '') is not null;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if p_capitalization is null or p_capitalization < 0 or p_capitalization > 10000000 then
    raise exception 'CAPITALIZATION_INVALID' using errcode = 'P0001';
  end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then
    raise exception 'BUSINESS_CURRENCY_INVALID' using errcode = 'P0001';
  end if;

  select be.*
  into v_existing
  from public.business_entities be
  join public.audit_log al
    on al.game_session_id = be.game_session_id
   and al.target_id = be.id
   and al.action = 'business.create_or_acquire'
  where be.game_session_id = p_game_session_id
    and be.owner_player_id = p_player_id
    and al.metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1;

  if found then
    return query
    select v_existing.public_key, v_existing.status, v_existing.owner_player_id,
      v_existing.capitalization, v_existing.valuation, true;
    return;
  end if;

  perform 1
  from public.players
  where game_session_id = p_game_session_id
    and id = p_player_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select balance
  into v_buyer_cash
  from public.account_balances
  where game_session_id = p_game_session_id
    and player_id = p_player_id
    and account_type = 'cash'
    and currency_code = v_currency
  for update;

  if coalesce(v_buyer_cash, 0) < p_capitalization then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  if not v_is_acquisition then
    insert into public.business_entities (
      game_session_id,
      owner_player_id,
      legal_name,
      entity_type,
      industry_code,
      country_code,
      currency_code,
      status,
      capitalization,
      valuation
    ) values (
      p_game_session_id,
      p_player_id,
      btrim(p_legal_name),
      p_entity_type,
      btrim(p_industry_code),
      upper(btrim(p_country_code)),
      v_currency,
      'active',
      round(p_capitalization, 2),
      round(p_capitalization, 2)
    )
    returning * into v_business;

    if p_capitalization > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id,
        p_player_id,
        'cash',
        -round(p_capitalization, 2),
        v_currency,
        'debit',
        'business',
        'capitalization_out',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key)
      );
      perform public.record_player_ledger_entry(
        p_game_session_id,
        p_player_id,
        public.business_account_type_v1(v_business.public_key),
        round(p_capitalization, 2),
        v_currency,
        'credit',
        'business',
        'capitalization_in',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key)
      );
    end if;
  else
    select *
    into v_business
    from public.business_entities
    where game_session_id = p_game_session_id
      and public_key = lower(btrim(p_acquire_business_key))
      and status in ('active', 'distressed', 'restructuring')
    for update;

    if not found then
      raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_business.owner_player_id = p_player_id then
      raise exception 'BUSINESS_ALREADY_OWNED' using errcode = 'P0001';
    end if;
    if v_business.currency_code <> v_currency then
      raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
    end if;

    v_seller_player_id := v_business.owner_player_id;
    perform 1
    from public.players
    where game_session_id = p_game_session_id
      and id in (p_player_id, v_seller_player_id)
    order by id
    for update;

    v_seller_business_account := public.business_account_type_v1(v_business.public_key);
    v_buyer_business_account := public.business_account_type_v1(v_business.public_key);

    select balance
    into v_business_cash
    from public.account_balances
    where game_session_id = p_game_session_id
      and player_id = v_seller_player_id
      and account_type = v_seller_business_account
      and currency_code = v_currency
    for update;

    if p_capitalization > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id,
        p_player_id,
        'cash',
        -round(p_capitalization, 2),
        v_currency,
        'debit',
        'business',
        'business_acquisition_payment',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key, 'seller', 'pseudonymous')
      );
      perform public.record_player_ledger_entry(
        p_game_session_id,
        v_seller_player_id,
        'cash',
        round(p_capitalization, 2),
        v_currency,
        'credit',
        'business',
        'business_sale_proceeds',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key, 'buyer', 'pseudonymous')
      );
    end if;

    if coalesce(v_business_cash, 0) <> 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id,
        v_seller_player_id,
        v_seller_business_account,
        -v_business_cash,
        v_currency,
        'debit',
        'business',
        'ownership_cash_transfer_out',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key)
      );
      perform public.record_player_ledger_entry(
        p_game_session_id,
        p_player_id,
        v_buyer_business_account,
        v_business_cash,
        v_currency,
        'credit',
        'business',
        'ownership_cash_transfer_in',
        v_business.id,
        'player',
        p_player_id,
        jsonb_build_object('business_key', v_business.public_key)
      );
    end if;

    update public.business_entities
    set owner_player_id = p_player_id,
        status = 'active',
        valuation = greatest(valuation, round(p_capitalization, 2)),
        version = version + 1
    where id = v_business.id
    returning * into v_business;
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.create_or_acquire',
    'business',
    v_business.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'business_key', v_business.public_key,
      'acquisition', v_is_acquisition,
      'purchase_or_capital_amount', round(p_capitalization, 2),
      'transferred_business_cash', round(coalesce(v_business_cash, 0), 2)
    )
  );

  return query
  select v_business.public_key, v_business.status, v_business.owner_player_id,
    v_business.capitalization, v_business.valuation, false;
end;
$$;

create or replace function public.upsert_loan_product_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_product_key text,
  p_name text,
  p_borrower_type text,
  p_status text,
  p_currency_code text,
  p_minimum_amount numeric,
  p_maximum_amount numeric,
  p_annual_rate numeric,
  p_origination_fee_rate numeric,
  p_term_cycles integer,
  p_payment_frequency_cycles integer,
  p_minimum_credit_score integer,
  p_maximum_payment_to_income numeric,
  p_delinquency_grace_days integer,
  p_default_after_days integer,
  p_disclosure_text text,
  p_reason text,
  p_idempotency_key text
) returns table (
  product_key text,
  status text,
  borrower_type text,
  minimum_amount numeric,
  maximum_amount numeric,
  annual_rate numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.loan_products%rowtype;
  v_existing_key text;
begin
  if not exists (
    select 1 from public.game_sessions
    where id = p_game_session_id
      and owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  select metadata ->> 'product_key'
  into v_existing_key
  from public.audit_log
  where game_session_id = p_game_session_id
    and actor_id = p_staff_user_id
    and action = 'loan.product.upsert'
    and metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1;

  if v_existing_key is not null then
    select * into v_product
    from public.loan_products
    where public_key = v_existing_key;
    return query
    select v_product.public_key, v_product.status, v_product.borrower_type,
      v_product.minimum_amount, v_product.maximum_amount, v_product.annual_rate, true;
    return;
  end if;

  if nullif(btrim(coalesce(p_product_key, '')), '') is null then
    insert into public.loan_products (
      game_session_id,
      name,
      borrower_type,
      status,
      currency_code,
      minimum_amount,
      maximum_amount,
      annual_rate,
      origination_fee_rate,
      term_cycles,
      payment_frequency_cycles,
      minimum_credit_score,
      maximum_payment_to_income,
      delinquency_grace_days,
      default_after_days,
      disclosure_text
    ) values (
      p_game_session_id,
      btrim(p_name),
      p_borrower_type,
      p_status,
      upper(btrim(p_currency_code)),
      round(p_minimum_amount, 2),
      round(p_maximum_amount, 2),
      p_annual_rate,
      p_origination_fee_rate,
      p_term_cycles,
      p_payment_frequency_cycles,
      p_minimum_credit_score,
      p_maximum_payment_to_income,
      p_delinquency_grace_days,
      p_default_after_days,
      btrim(p_disclosure_text)
    ) returning * into v_product;
  else
    update public.loan_products
    set name = btrim(p_name),
        borrower_type = p_borrower_type,
        status = p_status,
        currency_code = upper(btrim(p_currency_code)),
        minimum_amount = round(p_minimum_amount, 2),
        maximum_amount = round(p_maximum_amount, 2),
        annual_rate = p_annual_rate,
        origination_fee_rate = p_origination_fee_rate,
        term_cycles = p_term_cycles,
        payment_frequency_cycles = p_payment_frequency_cycles,
        minimum_credit_score = p_minimum_credit_score,
        maximum_payment_to_income = p_maximum_payment_to_income,
        delinquency_grace_days = p_delinquency_grace_days,
        default_after_days = p_default_after_days,
        disclosure_text = btrim(p_disclosure_text)
    where game_session_id = p_game_session_id
      and public_key = lower(btrim(p_product_key))
    returning * into v_product;

    if not found then
      raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'staff_user',
    p_staff_user_id,
    'loan.product.upsert',
    'loan_product',
    v_product.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'product_key', v_product.public_key,
      'reason', left(btrim(coalesce(p_reason, '')), 1000)
    )
  );

  return query
  select v_product.public_key, v_product.status, v_product.borrower_type,
    v_product.minimum_amount, v_product.maximum_amount, v_product.annual_rate, false;
end;
$$;

create or replace function public.restructure_player_loan_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_loan_key text,
  p_scheduled_payment numeric,
  p_next_due_at timestamptz,
  p_reason text,
  p_idempotency_key text
) returns table (
  loan_key text,
  status text,
  scheduled_payment numeric,
  next_due_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loan public.player_loans%rowtype;
begin
  if not exists (
    select 1 from public.game_sessions
    where id = p_game_session_id
      and owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  select * into v_loan
  from public.player_loans
  where game_session_id = p_game_session_id
    and public_key = lower(btrim(p_loan_key))
  for update;

  if not found then
    raise exception 'LOAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.audit_log
    where game_session_id = p_game_session_id
      and actor_id = p_staff_user_id
      and action = 'loan.restructure'
      and target_id = v_loan.id
      and metadata ->> 'idempotency_key' = p_idempotency_key
  ) then
    return query
    select v_loan.public_key, v_loan.status, v_loan.scheduled_payment,
      v_loan.next_due_at, true;
    return;
  end if;

  if v_loan.status not in ('active', 'delinquent', 'defaulted') then
    raise exception 'LOAN_NOT_RESTRUCTURABLE' using errcode = 'P0001';
  end if;
  if p_scheduled_payment is null or p_scheduled_payment <= 0 then
    raise exception 'PAYMENT_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if p_next_due_at is null or p_next_due_at <= now() then
    raise exception 'NEXT_DUE_DATE_INVALID' using errcode = 'P0001';
  end if;

  update public.player_loans
  set status = 'restructured',
      scheduled_payment = round(p_scheduled_payment, 2),
      next_due_at = p_next_due_at,
      delinquent_at = null,
      defaulted_at = null,
      version = version
  where id = v_loan.id
  returning * into v_loan;

  insert into public.audit_log (
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'staff_user',
    p_staff_user_id,
    'loan.restructure',
    'loan',
    v_loan.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'loan_key', v_loan.public_key,
      'reason', left(btrim(coalesce(p_reason, '')), 1000),
      'scheduled_payment', v_loan.scheduled_payment,
      'next_due_at', v_loan.next_due_at
    )
  );

  perform public.recalculate_player_credit_v1(p_game_session_id, v_loan.player_id);

  return query
  select v_loan.public_key, v_loan.status, v_loan.scheduled_payment,
    v_loan.next_due_at, false;
end;
$$;

revoke all on function public.guard_banking_transfer_request_v1() from public, anon, authenticated;
revoke all on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) to service_role;
revoke all on function public.upsert_loan_product_v1(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,integer,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.upsert_loan_product_v1(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,integer,integer,text,text,text) to service_role;
revoke all on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text) to service_role;

comment on function public.guard_banking_transfer_request_v1() is
  'Blocks exact rapid round-trip transfers and excessive sender velocity before any ledger mutation.';
comment on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) is
  'Creates a capitalized business or acquires one while conserving buyer, seller, and business-account ledger balances.';
comment on function public.upsert_loan_product_v1(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,integer,integer,text,text,text) is
  'Staff-owned runtime loan product administration with disclosures, affordability terms, and audit.';
comment on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text) is
  'Staff-reviewed recovery path for active, delinquent, or defaulted loans.';

commit;
