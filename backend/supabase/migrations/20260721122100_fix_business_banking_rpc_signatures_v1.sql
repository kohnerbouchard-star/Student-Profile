-- Correct Business/Banking RPC Signatures V1.
-- Keeps the Player handler parameter contract exact, replaces the loan
-- restructuring body without a nonexistent version column reference, and
-- qualifies Business creation columns that collide with RETURNS TABLE names.

begin;

create or replace function public.execute_player_transfer_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_sender_player_id uuid,
  p_recipient_player_identifier text,
  p_amount numeric,
  p_currency_code text,
  p_memo text,
  p_idempotency_key text
) returns table (
  transfer_key text,
  status text,
  amount numeric,
  currency_code text,
  sender_balance numeric,
  recipient_player_identifier text,
  posted_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_player_id is distinct from p_sender_player_id then
    raise exception 'PLAYER_TRANSFER_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  return query
  select *
  from public.execute_player_transfer_v1(
    p_game_session_id,
    p_sender_player_id,
    p_recipient_player_identifier,
    p_amount,
    p_currency_code,
    p_memo,
    p_idempotency_key
  );
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
    select 1
    from public.game_sessions gs
    where gs.id = p_game_session_id
      and gs.owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  select pl.*
  into v_loan
  from public.player_loans pl
  where pl.game_session_id = p_game_session_id
    and pl.public_key = lower(btrim(p_loan_key))
  for update;

  if not found then
    raise exception 'LOAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.audit_log al
    where al.game_session_id = p_game_session_id
      and al.actor_id = p_staff_user_id
      and al.action = 'loan.restructure'
      and al.target_id = v_loan.id
      and al.metadata ->> 'idempotency_key' = p_idempotency_key
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
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'RESTRUCTURE_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  update public.player_loans pl
  set status = 'restructured',
      scheduled_payment = round(p_scheduled_payment, 2),
      next_due_at = p_next_due_at,
      delinquent_at = null,
      defaulted_at = null
  where pl.id = v_loan.id
  returning pl.* into v_loan;

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
      'reason', left(btrim(p_reason), 1000),
      'scheduled_payment', v_loan.scheduled_payment,
      'next_due_at', v_loan.next_due_at
    )
  );

  perform public.recalculate_player_credit_v1(
    p_game_session_id,
    v_loan.player_id
  );

  return query
  select v_loan.public_key, v_loan.status, v_loan.scheduled_payment,
    v_loan.next_due_at, false;
end;
$$;

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
  from public.players player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  select ab.balance
  into v_buyer_cash
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = p_player_id
    and ab.account_type = 'cash'
    and ab.currency_code = v_currency
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
    select be.*
    into v_business
    from public.business_entities be
    where be.game_session_id = p_game_session_id
      and be.public_key = lower(btrim(p_acquire_business_key))
      and be.status in ('active', 'distressed', 'restructuring')
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
    from public.players player_row
    where player_row.game_session_id = p_game_session_id
      and player_row.id in (p_player_id, v_seller_player_id)
    order by player_row.id
    for update;

    v_seller_business_account := public.business_account_type_v1(v_business.public_key);
    v_buyer_business_account := public.business_account_type_v1(v_business.public_key);

    select ab.balance
    into v_business_cash
    from public.account_balances ab
    where ab.game_session_id = p_game_session_id
      and ab.player_id = v_seller_player_id
      and ab.account_type = v_seller_business_account
      and ab.currency_code = v_currency
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

    update public.business_entities be
    set owner_player_id = p_player_id,
        status = 'active',
        valuation = greatest(be.valuation, round(p_capitalization, 2)),
        version = be.version + 1
    where be.id = v_business.id
    returning be.* into v_business;
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

revoke all on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text)
from public, anon, authenticated;
grant execute on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text)
to service_role;

revoke all on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text)
from public, anon, authenticated;
grant execute on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text)
to service_role;

revoke all on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text)
from public, anon, authenticated;
grant execute on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text)
to service_role;

comment on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text) is
  'Session-derived Player scope wrapper. Rejects any sender mismatch before delegating to atomic ledger transfer.';
comment on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text) is
  'Staff-reviewed loan recovery without changing principal authority or append-only payment history.';
comment on function public.create_or_acquire_player_business_v1(uuid,uuid,text,text,text,text,text,numeric,text,text) is
  'Creates or acquires a Business using qualified ledger and ownership scope references safe for RETURNS TABLE output names.';

commit;
