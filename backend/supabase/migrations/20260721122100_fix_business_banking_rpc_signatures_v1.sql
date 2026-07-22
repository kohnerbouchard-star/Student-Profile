-- Correct Business/Banking RPC Signatures V1.
-- Keeps the Player handler parameter contract exact and replaces the loan
-- restructuring body without a nonexistent version column reference.

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
    from public.game_sessions
    where id = p_game_session_id
      and owner_staff_user_id = p_staff_user_id
  ) then
    raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  select *
  into v_loan
  from public.player_loans
  where game_session_id = p_game_session_id
    and public_key = lower(btrim(p_loan_key))
  for update;

  if not found then
    raise exception 'LOAN_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.audit_log
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
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'RESTRUCTURE_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  update public.player_loans
  set status = 'restructured',
      scheduled_payment = round(p_scheduled_payment, 2),
      next_due_at = p_next_due_at,
      delinquent_at = null,
      defaulted_at = null
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

revoke all on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text)
from public, anon, authenticated;
grant execute on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text)
to service_role;

revoke all on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text)
from public, anon, authenticated;
grant execute on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text)
to service_role;

comment on function public.execute_player_transfer_v1(uuid,uuid,uuid,text,numeric,text,text,text) is
  'Session-derived Player scope wrapper. Rejects any sender mismatch before delegating to atomic ledger transfer.';
comment on function public.restructure_player_loan_v1(uuid,uuid,text,numeric,timestamptz,text,text) is
  'Staff-reviewed loan recovery without changing principal authority or append-only payment history.';

commit;
