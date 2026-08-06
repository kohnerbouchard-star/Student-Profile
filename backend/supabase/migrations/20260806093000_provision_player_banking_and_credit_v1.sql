-- Make Player banking operable as one local-currency, ledger-authoritative system.
-- Zero-balance account projections are provisioned without fabricating money;
-- every non-zero movement still flows through public.record_player_ledger_entry.

begin;

alter table public.loan_payments
  add column if not exists applied_due_at timestamptz null;

create index if not exists loan_payments_due_allocation_idx
  on public.loan_payments (game_session_id, loan_id, applied_due_at, created_at);

comment on column public.loan_payments.applied_due_at is
  'The scheduled due timestamp this payment satisfies. Partial payments accumulate only within the same installment.';

create or replace function public.calculate_loan_installment_payment_v1(
  p_principal numeric,
  p_annual_rate numeric,
  p_term_cycles integer,
  p_payment_frequency_cycles integer
)
returns numeric
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $function$
declare
  v_payment_count integer;
  v_periodic_rate numeric;
  v_growth_factor numeric;
  v_payment numeric;
begin
  if p_principal <= 0
    or p_annual_rate < 0
    or p_annual_rate > 1
    or p_term_cycles < 1
    or p_payment_frequency_cycles < 1
    or p_payment_frequency_cycles > p_term_cycles
  then
    raise exception 'LOAN_PAYMENT_TERMS_INVALID' using errcode = 'P0001';
  end if;

  v_payment_count := ceil(
    p_term_cycles::numeric / p_payment_frequency_cycles::numeric
  )::integer;
  v_periodic_rate := p_annual_rate
    * ((p_payment_frequency_cycles * 7)::numeric / 365::numeric);

  if v_periodic_rate = 0 then
    v_payment := p_principal / v_payment_count;
  else
    v_growth_factor := power(1 + v_periodic_rate, v_payment_count);
    v_payment := p_principal * v_periodic_rate * v_growth_factor
      / nullif(v_growth_factor - 1, 0);
  end if;

  return greatest(round(v_payment, 2), 0.01);
end;
$function$;

create or replace function public.ensure_game_loan_products_for_currency_v1(
  p_game_session_id uuid,
  p_currency_code text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_starting_balance numeric;
  v_policy_rate numeric := 0.03;
  v_credit_difficulty numeric := 1;
  v_starter_rate numeric;
  v_growth_rate numeric;
  v_business_rate numeric;
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_game_session_id is null or v_currency !~ '^[A-Z]{3,16}$' then
    raise exception 'BANKING_CATALOG_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.game_sessions as game_row
    where game_row.id = p_game_session_id
  ) then
    raise exception 'BANKING_CATALOG_GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select package_row.approved_starting_balance
  into v_starting_balance
  from public.arrival_package_runtime_definitions as package_row
  where package_row.currency_code = v_currency
    and package_row.status = 'active'
  order by package_row.arrival_package_definition_id
  limit 1;

  if not found then
    return 0;
  end if;

  select
    coalesce(snapshot_row.interest_rate, 0.03),
    coalesce(snapshot_row.credit_difficulty_modifier, 1)
  into v_policy_rate, v_credit_difficulty
  from public.country_profiles as profile_row
  left join lateral (
    select
      economic_row.interest_rate,
      economic_row.credit_difficulty_modifier
    from public.country_economic_snapshots as economic_row
    where economic_row.game_session_id = p_game_session_id
      and economic_row.country_profile_id = profile_row.id
      and economic_row.effective_at <= now()
    order by economic_row.snapshot_sequence desc, economic_row.effective_at desc
    limit 1
  ) as snapshot_row on true
  where profile_row.currency_code = v_currency
    and profile_row.status = 'active'
  order by profile_row.country_code
  limit 1;

  v_policy_rate := least(0.25, greatest(coalesce(v_policy_rate, 0.03), 0));
  v_credit_difficulty := least(2, greatest(coalesce(v_credit_difficulty, 1), 0.5));
  v_starter_rate := least(0.35, v_policy_rate + (0.06 * v_credit_difficulty));
  v_growth_rate := least(0.40, v_policy_rate + (0.09 * v_credit_difficulty));
  v_business_rate := least(0.38, v_policy_rate + (0.075 * v_credit_difficulty));

  insert into public.loan_products (
    public_key, game_session_id, name, borrower_type, status, currency_code,
    minimum_amount, maximum_amount, annual_rate, origination_fee_rate,
    term_cycles, payment_frequency_cycles, minimum_credit_score,
    maximum_payment_to_income, delinquency_grace_days, default_after_days,
    disclosure_text
  ) values (
    'lop_' || md5(p_game_session_id::text || '|' || v_currency || '|starter-credit-v1'),
    p_game_session_id,
    'Starter Credit',
    'player',
    'active',
    v_currency,
    round(v_starting_balance * 0.10, 2),
    round(v_starting_balance * 0.50, 2),
    round(v_starter_rate, 6),
    0.010000,
    12,
    1,
    500,
    0.550000,
    7,
    28,
    'Twelve weekly payment cycles. A 1% origination fee is withheld from proceeds; scheduled payments amortize principal and interest.'
  )
  on conflict (public_key) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.loan_products (
    public_key, game_session_id, name, borrower_type, status, currency_code,
    minimum_amount, maximum_amount, annual_rate, origination_fee_rate,
    term_cycles, payment_frequency_cycles, minimum_credit_score,
    maximum_payment_to_income, delinquency_grace_days, default_after_days,
    disclosure_text
  ) values (
    'lop_' || md5(p_game_session_id::text || '|' || v_currency || '|growth-credit-v1'),
    p_game_session_id,
    'Growth Installment Loan',
    'player',
    'active',
    v_currency,
    round(v_starting_balance * 0.50, 2),
    round(v_starting_balance * 2.00, 2),
    round(v_growth_rate, 6),
    0.020000,
    24,
    1,
    625,
    0.400000,
    7,
    28,
    'Twenty-four weekly payment cycles. A 2% origination fee is withheld from proceeds; eligibility rewards stable income, savings, and repayment behavior.'
  )
  on conflict (public_key) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.loan_products (
    public_key, game_session_id, name, borrower_type, status, currency_code,
    minimum_amount, maximum_amount, annual_rate, origination_fee_rate,
    term_cycles, payment_frequency_cycles, minimum_credit_score,
    maximum_payment_to_income, delinquency_grace_days, default_after_days,
    disclosure_text
  ) values (
    'lop_' || md5(p_game_session_id::text || '|' || v_currency || '|working-capital-v1'),
    p_game_session_id,
    'Working Capital Facility',
    'business',
    'active',
    v_currency,
    round(v_starting_balance * 1.00, 2),
    round(v_starting_balance * 5.00, 2),
    round(v_business_rate, 6),
    0.015000,
    36,
    1,
    600,
    0.450000,
    7,
    28,
    'Thirty-six weekly payment cycles for an active player-owned business. A 1.5% origination fee is withheld and proceeds settle only to that business account.'
  )
  on conflict (public_key) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  return v_inserted;
end;
$function$;

create or replace function public.ensure_game_banking_catalog_v1(
  p_game_session_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_currency record;
  v_inserted integer := 0;
begin
  if p_game_session_id is null then
    raise exception 'BANKING_CATALOG_GAME_REQUIRED' using errcode = 'P0001';
  end if;

  for v_currency in
    select distinct package_row.currency_code
    from public.arrival_package_runtime_definitions as package_row
    where package_row.status = 'active'
    order by package_row.currency_code
  loop
    v_inserted := v_inserted
      + public.ensure_game_loan_products_for_currency_v1(
        p_game_session_id,
        v_currency.currency_code
      );
  end loop;

  return v_inserted;
end;
$function$;

create or replace function public.ensure_player_banking_accounts_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_currency_code text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_game_session_id is null
    or p_player_id is null
    or v_currency !~ '^[A-Z]{3,16}$'
  then
    raise exception 'PLAYER_BANKING_PROVISION_REQUEST_INVALID' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active';
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.account_balances (
    game_session_id, player_id, account_type, balance, currency_code,
    last_ledger_entry_id
  ) values (
    p_game_session_id, p_player_id, 'cash', 0, v_currency, null
  )
  on conflict on constraint account_balances_scope_unique do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  insert into public.account_balances (
    game_session_id, player_id, account_type, balance, currency_code,
    last_ledger_entry_id
  ) values (
    p_game_session_id, p_player_id, 'savings', 0, v_currency, null
  )
  on conflict on constraint account_balances_scope_unique do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  perform public.ensure_game_loan_products_for_currency_v1(
    p_game_session_id,
    v_currency
  );

  if v_inserted > 0 then
    insert into public.audit_log (
      game_session_id, actor_type, actor_id, action, target_type, target_id,
      metadata
    ) values (
      p_game_session_id,
      'system',
      null,
      'banking.accounts.provision',
      'player',
      p_player_id,
      jsonb_build_object(
        'currency_code', v_currency,
        'account_types', jsonb_build_array('cash', 'savings'),
        'balance_effect', 0
      )
    );
  end if;

  return v_inserted;
end;
$function$;

create or replace function public.ensure_player_banking_after_country_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_currency text;
begin
  if new.status = 'active' and exists (
    select 1
    from public.players as player_row
    where player_row.game_session_id = new.game_session_id
      and player_row.id = new.player_id
      and player_row.status = 'active'
  ) then
    select profile_row.currency_code
    into v_currency
    from public.country_profiles as profile_row
    where profile_row.id = new.country_profile_id
      and profile_row.status = 'active';

    if v_currency is not null then
      perform public.ensure_player_banking_accounts_v1(
        new.game_session_id,
        new.player_id,
        v_currency
      );
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.ensure_player_banking_after_residency_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if exists (
    select 1
    from public.players as player_row
    where player_row.game_session_id = new.game_session_id
      and player_row.id = new.player_id
      and player_row.status = 'active'
  ) then
    perform public.ensure_player_banking_accounts_v1(
      new.game_session_id,
      new.player_id,
      new.currency_code
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists ensure_player_banking_after_country_assignment
  on public.player_country_assignments;
create trigger ensure_player_banking_after_country_assignment
after insert or update of status, country_profile_id
on public.player_country_assignments
for each row execute function public.ensure_player_banking_after_country_assignment_v1();

drop trigger if exists ensure_player_banking_after_residency
  on public.player_residency_states;
create trigger ensure_player_banking_after_residency
after insert or update of currency_code, current_country_id
on public.player_residency_states
for each row execute function public.ensure_player_banking_after_residency_v1();

create or replace function public.execute_player_account_transfer_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_from_account_type text,
  p_to_account_type text,
  p_amount numeric,
  p_currency_code text,
  p_note text,
  p_idempotency_key text
)
returns table (
  transfer_key text,
  status text,
  from_account_type text,
  to_account_type text,
  amount numeric,
  currency_code text,
  from_balance numeric,
  to_balance numeric,
  posted_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_from text := case lower(btrim(coalesce(p_from_account_type, '')))
    when 'checking' then 'cash'
    else lower(btrim(coalesce(p_from_account_type, '')))
  end;
  v_to text := case lower(btrim(coalesce(p_to_account_type, '')))
    when 'checking' then 'cash'
    else lower(btrim(coalesce(p_to_account_type, '')))
  end;
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 120), '');
  v_context record;
  v_hash text;
  v_existing public.banking_transfer_requests%rowtype;
  v_transfer public.banking_transfer_requests%rowtype;
  v_from_balance numeric := 0;
  v_to_balance numeric := 0;
  v_debit uuid;
  v_credit uuid;
begin
  if v_from not in ('cash', 'savings')
    or v_to not in ('cash', 'savings')
    or v_from = v_to
  then
    raise exception 'ACCOUNT_TRANSFER_INVALID' using errcode = 'P0001';
  end if;
  if v_amount <= 0 or v_amount > 1000000 then
    raise exception 'TRANSFER_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if v_currency !~ '^[A-Z]{3,16}$' then
    raise exception 'TRANSFER_CURRENCY_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select *
  into v_context
  from public.resolve_player_economic_context_v1(
    p_game_session_id,
    p_player_id
  );
  if not found then
    raise exception 'PLAYER_ECONOMIC_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;
  if v_context.currency_code <> v_currency then
    raise exception 'ACCOUNT_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  perform public.ensure_player_banking_accounts_v1(
    p_game_session_id,
    p_player_id,
    v_currency
  );

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws(
    '|', p_game_session_id, p_player_id, v_from, v_to, v_amount,
    v_currency, coalesce(v_note, '')
  ), 'sha256'), 'hex');

  select transfer_row.*
  into v_existing
  from public.banking_transfer_requests as transfer_row
  where transfer_row.game_session_id = p_game_session_id
    and transfer_row.sender_player_id = p_player_id
    and transfer_row.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select balance_row.balance
    into v_from_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.player_id = p_player_id
      and balance_row.account_type = v_from
      and balance_row.currency_code = v_currency;
    select balance_row.balance
    into v_to_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.player_id = p_player_id
      and balance_row.account_type = v_to
      and balance_row.currency_code = v_currency;
    return query select
      v_existing.public_key,
      v_existing.status,
      v_from,
      v_to,
      v_existing.amount,
      v_currency,
      coalesce(v_from_balance, 0),
      coalesce(v_to_balance, 0),
      v_existing.posted_at,
      true;
    return;
  end if;

  perform 1
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.currency_code = v_currency
    and balance_row.account_type in (v_from, v_to)
  order by balance_row.account_type
  for update;

  select balance_row.balance
  into v_from_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = v_from
    and balance_row.currency_code = v_currency;
  if coalesce(v_from_balance, 0) < v_amount then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  insert into public.banking_transfer_requests (
    game_session_id, sender_player_id, recipient_player_id, transfer_kind,
    from_account_type, to_account_type, amount, currency_code, memo,
    idempotency_key, request_hash, status
  ) values (
    p_game_session_id, p_player_id, p_player_id, 'internal_account',
    v_from, v_to, v_amount, v_currency, v_note,
    p_idempotency_key, v_hash, 'pending'
  )
  returning * into v_transfer;

  select ledger_entry_id
  into v_debit
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    v_from,
    -v_amount,
    v_currency,
    'debit',
    'banking',
    'account_transfer_out',
    v_transfer.id,
    'player',
    p_player_id,
    jsonb_build_object('transfer_key', v_transfer.public_key)
  );

  select ledger_entry_id
  into v_credit
  from public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    v_to,
    v_amount,
    v_currency,
    'credit',
    'banking',
    'account_transfer_in',
    v_transfer.id,
    'player',
    p_player_id,
    jsonb_build_object('transfer_key', v_transfer.public_key)
  );

  update public.banking_transfer_requests as transfer_row
  set status = 'posted',
      sender_ledger_entry_id = v_debit,
      recipient_ledger_entry_id = v_credit,
      posted_at = now()
  where transfer_row.id = v_transfer.id
  returning transfer_row.* into v_transfer;

  select balance_row.balance
  into v_from_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = v_from
    and balance_row.currency_code = v_currency;
  select balance_row.balance
  into v_to_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = v_to
    and balance_row.currency_code = v_currency;

  return query select
    v_transfer.public_key,
    v_transfer.status,
    v_from,
    v_to,
    v_transfer.amount,
    v_currency,
    coalesce(v_from_balance, 0),
    coalesce(v_to_balance, 0),
    v_transfer.posted_at,
    false;
end;
$function$;

create or replace function public.apply_player_loan_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_offer_key text,
  p_business_key text,
  p_amount numeric,
  p_purpose text,
  p_repayment_source text,
  p_idempotency_key text
)
returns table (
  application_key text,
  status text,
  credit_score integer,
  projected_payment numeric,
  affordability_ratio numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_product public.loan_products%rowtype;
  v_business public.business_entities%rowtype;
  v_profile record;
  v_context record;
  v_application public.loan_applications%rowtype;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_purpose text := left(btrim(coalesce(p_purpose, '')), 240);
  v_repayment_source text := left(btrim(coalesce(p_repayment_source, '')), 1000);
  v_hash text;
  v_qualifying_inflows numeric := 0;
  v_income_per_payment numeric := 0;
  v_payment numeric;
  v_ratio numeric;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_amount <= 0 then
    raise exception 'LOAN_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if length(v_purpose) < 2 or length(v_repayment_source) < 5 then
    raise exception 'LOAN_APPLICATION_TEXT_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into v_context
  from public.resolve_player_economic_context_v1(
    p_game_session_id,
    p_player_id
  );
  if not found then
    raise exception 'PLAYER_ECONOMIC_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;

  select product_row.*
  into v_product
  from public.loan_products as product_row
  where product_row.game_session_id = p_game_session_id
    and product_row.public_key = lower(btrim(p_offer_key))
    and product_row.status = 'active'
  for share;
  if not found then
    raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_product.currency_code <> v_context.currency_code then
    raise exception 'LOAN_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;
  if v_amount < v_product.minimum_amount
    or v_amount > v_product.maximum_amount
  then
    raise exception 'LOAN_AMOUNT_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  if v_product.borrower_type = 'business' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.public_key = lower(btrim(coalesce(p_business_key, '')))
      and business_row.owner_player_id = p_player_id
      and business_row.status in ('active', 'restructuring')
    for update;
    if not found then
      raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode = 'P0001';
    end if;
    if v_business.currency_code <> v_context.currency_code then
      raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
    end if;
  elsif nullif(btrim(coalesce(p_business_key, '')), '') is not null then
    raise exception 'BUSINESS_NOT_ALLOWED_FOR_PRODUCT' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(concat_ws(
    '|', p_game_session_id, p_player_id, v_product.id,
    coalesce(v_business.id::text, ''), v_amount, v_purpose,
    v_repayment_source
  ), 'sha256'), 'hex');

  select application_row.*
  into v_application
  from public.loan_applications as application_row
  where application_row.game_session_id = p_game_session_id
    and application_row.player_id = p_player_id
    and application_row.idempotency_key = p_idempotency_key;
  if found then
    if v_application.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_application.public_key,
      v_application.status,
      v_application.credit_score,
      v_application.projected_payment,
      v_application.affordability_ratio,
      true;
    return;
  end if;

  select *
  into v_profile
  from public.recalculate_player_credit_v1(
    p_game_session_id,
    p_player_id
  );
  if v_profile.score < v_product.minimum_credit_score then
    raise exception 'CREDIT_SCORE_INELIGIBLE' using errcode = 'P0001';
  end if;

  v_payment := public.calculate_loan_installment_payment_v1(
    v_amount,
    v_product.annual_rate,
    v_product.term_cycles,
    v_product.payment_frequency_cycles
  );

  select coalesce(sum(entry_row.amount), 0)
  into v_qualifying_inflows
  from public.ledger_entries as entry_row
  where entry_row.game_session_id = p_game_session_id
    and entry_row.player_id = p_player_id
    and entry_row.currency_code = v_context.currency_code
    and entry_row.amount > 0
    and entry_row.created_at >= now() - interval '84 days'
    and entry_row.source_domain not in ('banking', 'loans')
    and entry_row.source_action not in (
      'capitalization_in',
      'ownership_cash_transfer_in'
    )
    and (
      (
        v_product.borrower_type = 'player'
        and entry_row.account_type in ('cash', 'savings')
      )
      or (
        v_product.borrower_type = 'business'
        and entry_row.account_type in (
          'cash',
          public.business_account_type_v1(v_business.public_key)
        )
      )
    );

  v_income_per_payment := round(
    (v_qualifying_inflows / 12)
      * greatest(v_product.payment_frequency_cycles, 1),
    2
  );
  v_ratio := case
    when v_income_per_payment <= 0 then 100
    else least(100, round(v_payment / v_income_per_payment, 6))
  end;
  if v_ratio > v_product.maximum_payment_to_income then
    raise exception 'LOAN_UNAFFORDABLE' using errcode = 'P0001';
  end if;

  insert into public.loan_applications (
    game_session_id, player_id, business_id, loan_product_id, amount,
    purpose, repayment_source, credit_score, projected_payment,
    affordability_ratio, status, idempotency_key, request_hash
  ) values (
    p_game_session_id, p_player_id, v_business.id, v_product.id, v_amount,
    v_purpose, v_repayment_source, v_profile.score, v_payment,
    v_ratio, 'pending_review', p_idempotency_key, v_hash
  )
  returning * into v_application;

  insert into public.audit_log (
    game_session_id, actor_type, actor_id, action, target_type, target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'loan.application.submit',
    'loan_application',
    v_application.id,
    jsonb_build_object(
      'application_key', v_application.public_key,
      'offer_key', v_product.public_key,
      'amount', v_application.amount,
      'currency_code', v_product.currency_code,
      'term_cycles', v_product.term_cycles,
      'payment_frequency_cycles', v_product.payment_frequency_cycles,
      'qualifying_income_per_payment', v_income_per_payment,
      'credit_model', 'economic-behavior-v1'
    )
  );

  return query select
    v_application.public_key,
    v_application.status,
    v_application.credit_score,
    v_application.projected_payment,
    v_application.affordability_ratio,
    false;
end;
$function$;

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
  v_account text := 'cash';
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

  if v_loan.business_id is not null then
    select public.business_account_type_v1(business_row.public_key)
    into v_account
    from public.business_entities as business_row
    where business_row.id = v_loan.business_id
      and business_row.game_session_id = p_game_session_id
      and business_row.owner_player_id = p_player_id;
    if not found then
      raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = v_account
    and balance_row.currency_code = v_loan.currency_code
  for update;
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

-- Existing games and players are reconciled without changing any non-zero
-- balance. Catalog inserts are deterministic and account inserts are zero-only.
do $backfill$
declare
  v_game record;
  v_player record;
begin
  for v_game in
    select game_row.id
    from public.game_sessions as game_row
    order by game_row.id
  loop
    perform public.ensure_game_banking_catalog_v1(v_game.id);
  end loop;

  for v_player in
    select
      assignment_row.game_session_id,
      assignment_row.player_id,
      profile_row.currency_code
    from public.player_country_assignments as assignment_row
    join public.country_profiles as profile_row
      on profile_row.id = assignment_row.country_profile_id
      and profile_row.status = 'active'
    join public.players as player_row
      on player_row.game_session_id = assignment_row.game_session_id
      and player_row.id = assignment_row.player_id
      and player_row.status = 'active'
    where assignment_row.status = 'active'
    order by assignment_row.game_session_id, assignment_row.player_id
  loop
    perform public.ensure_player_banking_accounts_v1(
      v_player.game_session_id,
      v_player.player_id,
      v_player.currency_code
    );
  end loop;

  for v_player in
    select
      state_row.game_session_id,
      state_row.player_id,
      state_row.currency_code
    from public.player_residency_states as state_row
    join public.players as player_row
      on player_row.game_session_id = state_row.game_session_id
      and player_row.id = state_row.player_id
      and player_row.status = 'active'
    order by state_row.game_session_id, state_row.player_id
  loop
    perform public.ensure_player_banking_accounts_v1(
      v_player.game_session_id,
      v_player.player_id,
      v_player.currency_code
    );
  end loop;
end;
$backfill$;

do $verify$
begin
  if exists (
    select 1
    from public.player_country_assignments as assignment_row
    join public.country_profiles as profile_row
      on profile_row.id = assignment_row.country_profile_id
      and profile_row.status = 'active'
    join public.players as player_row
      on player_row.game_session_id = assignment_row.game_session_id
      and player_row.id = assignment_row.player_id
      and player_row.status = 'active'
    where assignment_row.status = 'active'
      and (
        not exists (
          select 1
          from public.account_balances as balance_row
          where balance_row.game_session_id = assignment_row.game_session_id
            and balance_row.player_id = assignment_row.player_id
            and balance_row.currency_code = profile_row.currency_code
            and balance_row.account_type = 'cash'
        )
        or not exists (
          select 1
          from public.account_balances as balance_row
          where balance_row.game_session_id = assignment_row.game_session_id
            and balance_row.player_id = assignment_row.player_id
            and balance_row.currency_code = profile_row.currency_code
            and balance_row.account_type = 'savings'
        )
      )
  ) then
    raise exception 'player banking account provisioning verification failed';
  end if;

  if exists (
    select 1
    from public.game_sessions as game_row
    cross join (
      select distinct package_row.currency_code
      from public.arrival_package_runtime_definitions as package_row
      where package_row.status = 'active'
    ) as currency_row
    where not exists (
      select 1
      from public.loan_products as product_row
      where product_row.game_session_id = game_row.id
        and product_row.currency_code = currency_row.currency_code
        and product_row.public_key in (
          'lop_' || md5(game_row.id::text || '|' || currency_row.currency_code || '|starter-credit-v1'),
          'lop_' || md5(game_row.id::text || '|' || currency_row.currency_code || '|growth-credit-v1'),
          'lop_' || md5(game_row.id::text || '|' || currency_row.currency_code || '|working-capital-v1')
        )
      group by product_row.game_session_id, product_row.currency_code
      having count(*) = 3
    )
  ) then
    raise exception 'game loan product catalog verification failed';
  end if;
end;
$verify$;

comment on function public.calculate_loan_installment_payment_v1(
  numeric, numeric, integer, integer
) is
  'Calculates one amortizing payment using seven-day game cycles and the configured payment frequency. Origination fees are excluded because they are withheld from proceeds.';
comment on function public.ensure_game_loan_products_for_currency_v1(uuid, text) is
  'Idempotently provisions the default player and business loan catalog for one game currency, scaled from that currency arrival package and policy rate.';
comment on function public.ensure_game_banking_catalog_v1(uuid) is
  'Idempotently provisions all official local-currency loan products for one game.';
comment on function public.ensure_player_banking_accounts_v1(uuid, uuid, text) is
  'Creates zero-balance cash and savings projections for one active player and local currency without creating a ledger entry.';
comment on function public.execute_player_account_transfer_v1(
  uuid, uuid, text, text, numeric, text, text, text
) is
  'Atomically transfers one player local currency between canonical cash/checking and savings projections with server-derived scope and idempotency.';
comment on function public.apply_player_loan_v1(
  uuid, uuid, text, text, numeric, text, text, text
) is
  'Submits a local-currency loan application using weekly-cycle amortization and qualifying non-transfer inflows for affordability.';
comment on function public.repay_player_loan_v1(uuid, uuid, text, numeric, text) is
  'Posts an idempotent ledger-backed loan payment and advances the due date only after the scheduled installment has been satisfied.';

revoke all on function public.calculate_loan_installment_payment_v1(
  numeric, numeric, integer, integer
) from public, anon, authenticated;
revoke all on function public.ensure_game_loan_products_for_currency_v1(
  uuid, text
) from public, anon, authenticated;
revoke all on function public.ensure_game_banking_catalog_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_player_banking_accounts_v1(
  uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.ensure_player_banking_after_country_assignment_v1()
  from public, anon, authenticated;
revoke all on function public.ensure_player_banking_after_residency_v1()
  from public, anon, authenticated;
revoke all on function public.execute_player_account_transfer_v1(
  uuid, uuid, text, text, numeric, text, text, text
) from public, anon, authenticated;
revoke all on function public.apply_player_loan_v1(
  uuid, uuid, text, text, numeric, text, text, text
) from public, anon, authenticated;
revoke all on function public.repay_player_loan_v1(
  uuid, uuid, text, numeric, text
) from public, anon, authenticated;

grant execute on function public.calculate_loan_installment_payment_v1(
  numeric, numeric, integer, integer
) to service_role;
grant execute on function public.ensure_game_loan_products_for_currency_v1(
  uuid, text
) to service_role;
grant execute on function public.ensure_game_banking_catalog_v1(uuid)
  to service_role;
grant execute on function public.ensure_player_banking_accounts_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.execute_player_account_transfer_v1(
  uuid, uuid, text, text, numeric, text, text, text
) to service_role;
grant execute on function public.apply_player_loan_v1(
  uuid, uuid, text, text, numeric, text, text, text
) to service_role;
grant execute on function public.repay_player_loan_v1(
  uuid, uuid, text, numeric, text
) to service_role;

notify pgrst, 'reload schema';

commit;
