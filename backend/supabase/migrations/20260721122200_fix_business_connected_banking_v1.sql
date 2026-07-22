-- Forward-only connected Business/Banking corrections V1.
-- Qualifies RETURNS TABLE column collisions and pins pgcrypto resolution.

begin;

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
  if length(btrim(coalesce(p_idempotency_key, ''))) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001'; end if;
  if p_capitalization is null or p_capitalization < 0 or p_capitalization > 10000000 then raise exception 'CAPITALIZATION_INVALID' using errcode = 'P0001'; end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then raise exception 'BUSINESS_CURRENCY_INVALID' using errcode = 'P0001'; end if;

  select be.* into v_existing
  from public.business_entities be
  join public.audit_log al on al.game_session_id = be.game_session_id and al.target_id = be.id and al.action = 'business.create_or_acquire'
  where be.game_session_id = p_game_session_id and be.owner_player_id = p_player_id
    and al.metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1;
  if found then
    return query select v_existing.public_key, v_existing.status, v_existing.owner_player_id,
      v_existing.capitalization, v_existing.valuation, true;
    return;
  end if;

  perform 1 from public.players player_row
  where player_row.game_session_id = p_game_session_id and player_row.id = p_player_id and player_row.status = 'active'
  for update;
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001'; end if;

  select ab.balance into v_buyer_cash
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id and ab.player_id = p_player_id
    and ab.account_type = 'cash' and ab.currency_code = v_currency
  for update;
  if coalesce(v_buyer_cash, 0) < p_capitalization then raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001'; end if;

  if not v_is_acquisition then
    insert into public.business_entities (
      game_session_id, owner_player_id, legal_name, entity_type, industry_code,
      country_code, currency_code, status, capitalization, valuation
    ) values (
      p_game_session_id, p_player_id, btrim(p_legal_name), p_entity_type,
      btrim(p_industry_code), upper(btrim(p_country_code)), v_currency, 'active',
      round(p_capitalization, 2), round(p_capitalization, 2)
    ) returning * into v_business;

    if p_capitalization > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id, p_player_id, 'cash', -round(p_capitalization, 2), v_currency,
        'debit', 'business', 'capitalization_out', v_business.id, 'player', p_player_id,
        jsonb_build_object('business_key', v_business.public_key)
      );
      perform public.record_player_ledger_entry(
        p_game_session_id, p_player_id, public.business_account_type_v1(v_business.public_key),
        round(p_capitalization, 2), v_currency, 'credit', 'business', 'capitalization_in',
        v_business.id, 'player', p_player_id, jsonb_build_object('business_key', v_business.public_key)
      );
    end if;
  else
    select be.* into v_business
    from public.business_entities be
    where be.game_session_id = p_game_session_id
      and be.public_key = lower(btrim(p_acquire_business_key))
      and be.status in ('active', 'distressed', 'restructuring')
    for update;
    if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001'; end if;
    if v_business.owner_player_id = p_player_id then raise exception 'BUSINESS_ALREADY_OWNED' using errcode = 'P0001'; end if;
    if v_business.currency_code <> v_currency then raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001'; end if;

    v_seller_player_id := v_business.owner_player_id;
    perform 1 from public.players player_row
    where player_row.game_session_id = p_game_session_id and player_row.id in (p_player_id, v_seller_player_id)
    order by player_row.id for update;

    v_seller_business_account := public.business_account_type_v1(v_business.public_key);
    v_buyer_business_account := public.business_account_type_v1(v_business.public_key);
    select ab.balance into v_business_cash
    from public.account_balances ab
    where ab.game_session_id = p_game_session_id and ab.player_id = v_seller_player_id
      and ab.account_type = v_seller_business_account and ab.currency_code = v_currency
    for update;

    if p_capitalization > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id, p_player_id, 'cash', -round(p_capitalization, 2), v_currency,
        'debit', 'business', 'business_acquisition_payment', v_business.id, 'player', p_player_id,
        jsonb_build_object('business_key', v_business.public_key, 'seller', 'pseudonymous')
      );
      perform public.record_player_ledger_entry(
        p_game_session_id, v_seller_player_id, 'cash', round(p_capitalization, 2), v_currency,
        'credit', 'business', 'business_sale_proceeds', v_business.id, 'player', p_player_id,
        jsonb_build_object('business_key', v_business.public_key, 'buyer', 'pseudonymous')
      );
    end if;

    if coalesce(v_business_cash, 0) <> 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id, v_seller_player_id, v_seller_business_account, -v_business_cash,
        v_currency, 'debit', 'business', 'ownership_cash_transfer_out', v_business.id,
        'player', p_player_id, jsonb_build_object('business_key', v_business.public_key)
      );
      perform public.record_player_ledger_entry(
        p_game_session_id, p_player_id, v_buyer_business_account, v_business_cash,
        v_currency, 'credit', 'business', 'ownership_cash_transfer_in', v_business.id,
        'player', p_player_id, jsonb_build_object('business_key', v_business.public_key)
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

  insert into public.audit_log (game_session_id, actor_type, actor_id, action, target_type, target_id, metadata)
  values (
    p_game_session_id, 'player', p_player_id, 'business.create_or_acquire', 'business', v_business.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key, 'business_key', v_business.public_key,
      'acquisition', v_is_acquisition, 'purchase_or_capital_amount', round(p_capitalization, 2),
      'transferred_business_cash', round(coalesce(v_business_cash, 0), 2)
    )
  );
  return query select v_business.public_key, v_business.status, v_business.owner_player_id,
    v_business.capitalization, v_business.valuation, false;
end;
$$;

create or replace function public.execute_player_account_transfer_v1(
  p_game_session_id uuid, p_player_id uuid, p_from_account_type text, p_to_account_type text,
  p_amount numeric, p_currency_code text, p_note text, p_idempotency_key text
) returns table (
  transfer_key text, status text, from_account_type text, to_account_type text,
  amount numeric, currency_code text, from_balance numeric, to_balance numeric,
  posted_at timestamptz, replayed boolean
)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_from text := lower(btrim(coalesce(p_from_account_type, '')));
  v_to text := lower(btrim(coalesce(p_to_account_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, 'ECO')));
  v_hash text; v_existing public.banking_transfer_requests%rowtype;
  v_transfer public.banking_transfer_requests%rowtype; v_from_balance numeric := 0;
  v_to_balance numeric := 0; v_debit uuid; v_credit uuid;
begin
  if v_from not in ('cash','savings') or v_to not in ('cash','savings') or v_from = v_to then raise exception 'ACCOUNT_TRANSFER_INVALID' using errcode='P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'TRANSFER_AMOUNT_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  v_hash := encode(extensions.digest(concat_ws('|',p_game_session_id,p_player_id,v_from,v_to,p_amount,v_currency,coalesce(p_note,'')),'sha256'),'hex');

  select tr.* into v_existing from public.banking_transfer_requests tr
  where tr.game_session_id = p_game_session_id and tr.sender_player_id = p_player_id and tr.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select ab.balance into v_from_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_from and ab.currency_code=v_currency;
    select ab.balance into v_to_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_to and ab.currency_code=v_currency;
    return query select v_existing.public_key,v_existing.status,v_from,v_to,v_existing.amount,v_currency,coalesce(v_from_balance,0),coalesce(v_to_balance,0),v_existing.posted_at,true;
    return;
  end if;

  perform 1 from public.players p where p.game_session_id=p_game_session_id and p.id=p_player_id and p.status='active' for update;
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode='P0001'; end if;
  select ab.balance into v_from_balance from public.account_balances ab
  where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_from and ab.currency_code=v_currency for update;
  if coalesce(v_from_balance,0) < p_amount then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;

  insert into public.banking_transfer_requests (
    game_session_id,sender_player_id,recipient_player_id,transfer_kind,from_account_type,to_account_type,
    amount,currency_code,memo,idempotency_key,request_hash,status
  ) values (
    p_game_session_id,p_player_id,p_player_id,'internal_account',v_from,v_to,round(p_amount,2),v_currency,
    nullif(left(btrim(coalesce(p_note,'')),120),''),p_idempotency_key,v_hash,'pending'
  ) returning * into v_transfer;
  select ledger_entry_id into v_debit from public.record_player_ledger_entry(
    p_game_session_id,p_player_id,v_from,-round(p_amount,2),v_currency,'debit','banking','account_transfer_out',v_transfer.id,'player',p_player_id,jsonb_build_object('transfer_key',v_transfer.public_key));
  select ledger_entry_id into v_credit from public.record_player_ledger_entry(
    p_game_session_id,p_player_id,v_to,round(p_amount,2),v_currency,'credit','banking','account_transfer_in',v_transfer.id,'player',p_player_id,jsonb_build_object('transfer_key',v_transfer.public_key));
  update public.banking_transfer_requests tr set status='posted',sender_ledger_entry_id=v_debit,recipient_ledger_entry_id=v_credit,posted_at=now()
  where tr.id=v_transfer.id returning tr.* into v_transfer;
  select ab.balance into v_from_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_from and ab.currency_code=v_currency;
  select ab.balance into v_to_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_to and ab.currency_code=v_currency;
  return query select v_transfer.public_key,v_transfer.status,v_from,v_to,v_transfer.amount,v_currency,coalesce(v_from_balance,0),coalesce(v_to_balance,0),v_transfer.posted_at,false;
end;
$$;

create or replace function public.execute_player_transfer_v1(
  p_game_session_id uuid, p_sender_player_id uuid, p_recipient_player_identifier text,
  p_amount numeric, p_currency_code text, p_memo text, p_idempotency_key text
) returns table (
  transfer_key text, status text, amount numeric, currency_code text,
  sender_balance numeric, recipient_player_identifier text, posted_at timestamptz, replayed boolean
)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_identifier text := upper(regexp_replace(btrim(coalesce(p_recipient_player_identifier,'')), '\s+', '', 'g'));
  v_currency text := upper(btrim(coalesce(p_currency_code,'ECO')));
  v_memo text := nullif(left(btrim(coalesce(p_memo,'')),120),'');
  v_hash text; v_existing public.banking_transfer_requests%rowtype; v_recipient public.players%rowtype;
  v_transfer public.banking_transfer_requests%rowtype; v_sender_balance numeric := 0;
  v_sender_post numeric; v_recipient_entry uuid; v_sender_entry uuid;
begin
  if p_game_session_id is null or p_sender_player_id is null then raise exception 'PLAYER_SCOPE_REQUIRED' using errcode='P0001'; end if;
  if v_identifier = '' then raise exception 'RECIPIENT_PLAYER_IDENTIFIER_REQUIRED' using errcode='P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'TRANSFER_AMOUNT_INVALID' using errcode='P0001'; end if;
  if length(v_currency) < 3 or length(v_currency) > 16 then raise exception 'TRANSFER_CURRENCY_INVALID' using errcode='P0001'; end if;
  if length(btrim(coalesce(p_idempotency_key,''))) < 8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;

  select p.* into v_recipient from public.players p
  where p.game_session_id=p_game_session_id and p.player_identifier_normalized=v_identifier and p.status='active';
  if not found then raise exception 'RECIPIENT_NOT_FOUND' using errcode='P0001'; end if;
  if v_recipient.id=p_sender_player_id then raise exception 'SELF_TRANSFER_NOT_ALLOWED' using errcode='P0001'; end if;

  v_hash := encode(extensions.digest(concat_ws('|',p_game_session_id,p_sender_player_id,v_recipient.id,p_amount,v_currency,coalesce(v_memo,'')),'sha256'),'hex');
  select tr.* into v_existing from public.banking_transfer_requests tr
  where tr.game_session_id=p_game_session_id and tr.sender_player_id=p_sender_player_id and tr.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select ab.balance into v_sender_post from public.account_balances ab
    where ab.game_session_id=p_game_session_id and ab.player_id=p_sender_player_id and ab.account_type='cash' and ab.currency_code=v_currency;
    return query select v_existing.public_key,v_existing.status,v_existing.amount,v_existing.currency_code,coalesce(v_sender_post,0),v_recipient.player_identifier,v_existing.posted_at,true;
    return;
  end if;

  perform 1 from public.players p
  where p.game_session_id=p_game_session_id and p.id in (p_sender_player_id,v_recipient.id) and p.status='active'
  order by p.id for update;
  select ab.balance into v_sender_balance from public.account_balances ab
  where ab.game_session_id=p_game_session_id and ab.player_id=p_sender_player_id and ab.account_type='cash' and ab.currency_code=v_currency for update;
  if coalesce(v_sender_balance,0)<p_amount then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;

  insert into public.banking_transfer_requests (
    game_session_id,sender_player_id,recipient_player_id,transfer_kind,from_account_type,to_account_type,
    amount,currency_code,memo,idempotency_key,request_hash,status
  ) values (
    p_game_session_id,p_sender_player_id,v_recipient.id,'player_to_player','cash','cash',
    round(p_amount,2),v_currency,v_memo,p_idempotency_key,v_hash,'pending'
  ) returning * into v_transfer;
  select ledger_entry_id into v_sender_entry from public.record_player_ledger_entry(
    p_game_session_id,p_sender_player_id,'cash',-round(p_amount,2),v_currency,'debit','banking','player_transfer_sent',v_transfer.id,'player',p_sender_player_id,jsonb_build_object('transfer_key',v_transfer.public_key,'counterparty','recipient'));
  select ledger_entry_id into v_recipient_entry from public.record_player_ledger_entry(
    p_game_session_id,v_recipient.id,'cash',round(p_amount,2),v_currency,'credit','banking','player_transfer_received',v_transfer.id,'player',p_sender_player_id,jsonb_build_object('transfer_key',v_transfer.public_key,'counterparty','sender'));
  update public.banking_transfer_requests tr set status='posted',sender_ledger_entry_id=v_sender_entry,recipient_ledger_entry_id=v_recipient_entry,posted_at=now()
  where tr.id=v_transfer.id returning tr.* into v_transfer;
  select ab.balance into v_sender_post from public.account_balances ab
  where ab.game_session_id=p_game_session_id and ab.player_id=p_sender_player_id and ab.account_type='cash' and ab.currency_code=v_currency;
  return query select v_transfer.public_key,v_transfer.status,v_transfer.amount,v_transfer.currency_code,coalesce(v_sender_post,0),v_recipient.player_identifier,v_transfer.posted_at,false;
end;
$$;

create or replace function public.apply_player_loan_v1(
  p_game_session_id uuid,p_player_id uuid,p_offer_key text,p_business_key text,
  p_amount numeric,p_purpose text,p_repayment_source text,p_idempotency_key text
) returns table (
  application_key text,status text,credit_score integer,projected_payment numeric,
  affordability_ratio numeric,replayed boolean
)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_product public.loan_products%rowtype; v_business public.business_entities%rowtype;
  v_profile record; v_application public.loan_applications%rowtype;
  v_hash text; v_income numeric:=0; v_payment numeric; v_ratio numeric;
begin
  select lp.* into v_product from public.loan_products lp
  where lp.game_session_id=p_game_session_id and lp.public_key=lower(btrim(p_offer_key)) and lp.status='active';
  if not found then raise exception 'LOAN_PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if p_amount<v_product.minimum_amount or p_amount>v_product.maximum_amount then raise exception 'LOAN_AMOUNT_OUT_OF_RANGE' using errcode='P0001'; end if;
  if v_product.borrower_type='business' then
    select be.* into v_business from public.business_entities be
    where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(coalesce(p_business_key,'')))
      and be.owner_player_id=p_player_id and be.status in ('active','restructuring');
    if not found then raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode='P0001'; end if;
  elsif nullif(btrim(coalesce(p_business_key,'')),'') is not null then
    raise exception 'BUSINESS_NOT_ALLOWED_FOR_PRODUCT' using errcode='P0001';
  end if;
  v_hash:=encode(extensions.digest(concat_ws('|',p_game_session_id,p_player_id,v_product.id,coalesce(v_business.id::text,''),p_amount,p_purpose,p_repayment_source),'sha256'),'hex');
  select la.* into v_application from public.loan_applications la
  where la.game_session_id=p_game_session_id and la.player_id=p_player_id and la.idempotency_key=p_idempotency_key;
  if found then
    if v_application.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    return query select v_application.public_key,v_application.status,v_application.credit_score,v_application.projected_payment,v_application.affordability_ratio,true;
    return;
  end if;
  select * into v_profile from public.recalculate_player_credit_v1(p_game_session_id,p_player_id);
  if v_profile.score<v_product.minimum_credit_score then raise exception 'CREDIT_SCORE_INELIGIBLE' using errcode='P0001'; end if;
  v_payment:=round((p_amount*(1+v_product.annual_rate*(v_product.term_cycles/12.0))+p_amount*v_product.origination_fee_rate)/v_product.term_cycles,2);
  select coalesce(sum(le.amount),0)/3 into v_income from public.ledger_entries le
  where le.game_session_id=p_game_session_id and le.player_id=p_player_id and le.amount>0 and le.created_at>=now()-interval '90 days';
  v_ratio:=case when v_income<=0 then 100 else v_payment/v_income end;
  if v_ratio>v_product.maximum_payment_to_income then raise exception 'LOAN_UNAFFORDABLE' using errcode='P0001'; end if;
  insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,purpose,repayment_source,credit_score,projected_payment,affordability_ratio,status,idempotency_key,request_hash)
  values(p_game_session_id,p_player_id,v_business.id,v_product.id,round(p_amount,2),left(btrim(p_purpose),240),left(btrim(p_repayment_source),1000),v_profile.score,v_payment,v_ratio,'pending_review',p_idempotency_key,v_hash)
  returning * into v_application;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'loan.application.submit','loan_application',v_application.id,jsonb_build_object('application_key',v_application.public_key,'offer_key',v_product.public_key,'amount',v_application.amount,'credit_model','economic-behavior-v1'));
  return query select v_application.public_key,v_application.status,v_application.credit_score,v_application.projected_payment,v_application.affordability_ratio,false;
end;
$$;

create or replace function public.repay_player_loan_v1(
  p_game_session_id uuid,p_player_id uuid,p_loan_key text,p_amount numeric,p_idempotency_key text
) returns table (
  payment_key text,loan_key text,status text,principal_balance numeric,
  accrued_interest numeric,next_due_at timestamptz,replayed boolean
)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_loan public.player_loans%rowtype; v_product public.loan_products%rowtype;
  v_payment public.loan_payments%rowtype; v_hash text; v_days numeric;
  v_interest_accrual numeric; v_total_due numeric; v_pay numeric;
  v_interest_paid numeric; v_principal_paid numeric; v_balance numeric:=0;
  v_entry uuid; v_account text:='cash'; v_new_principal numeric;
  v_new_interest numeric; v_is_paid boolean;
begin
  select pl.* into v_loan from public.player_loans pl
  where pl.game_session_id=p_game_session_id and pl.player_id=p_player_id and pl.public_key=lower(btrim(p_loan_key)) for update;
  if not found then raise exception 'LOAN_NOT_FOUND' using errcode='P0001'; end if;
  if v_loan.status not in ('active','delinquent','restructured') then raise exception 'LOAN_NOT_PAYABLE' using errcode='P0001'; end if;
  select lp.* into v_product from public.loan_products lp where lp.id=v_loan.loan_product_id;
  v_hash:=encode(extensions.digest(concat_ws('|',p_game_session_id,p_player_id,v_loan.id,p_amount),'sha256'),'hex');
  select pay.* into v_payment from public.loan_payments pay
  where pay.game_session_id=p_game_session_id and pay.player_id=p_player_id and pay.loan_id=v_loan.id and pay.idempotency_key=p_idempotency_key;
  if found then
    if v_payment.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    return query select v_payment.public_key,v_loan.public_key,v_loan.status,v_loan.principal_balance,v_loan.accrued_interest,v_loan.next_due_at,true;
    return;
  end if;
  v_days:=greatest(0,extract(epoch from(now()-v_loan.last_accrued_at))/86400);
  v_interest_accrual:=round(v_loan.principal_balance*v_loan.annual_rate*v_days/365,2);
  v_loan.accrued_interest:=v_loan.accrued_interest+v_interest_accrual;
  v_total_due:=v_loan.principal_balance+v_loan.accrued_interest;
  if p_amount is null or p_amount<=0 then raise exception 'PAYMENT_AMOUNT_INVALID' using errcode='P0001'; end if;
  v_pay:=least(round(p_amount,2),v_total_due);
  if v_loan.business_id is not null then
    select public.business_account_type_v1(be.public_key) into v_account from public.business_entities be where be.id=v_loan.business_id;
  end if;
  select ab.balance into v_balance from public.account_balances ab
  where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=v_account and ab.currency_code=v_loan.currency_code for update;
  if coalesce(v_balance,0)<v_pay then raise exception 'INSUFFICIENT_FUNDS' using errcode='P0001'; end if;
  v_interest_paid:=least(v_pay,v_loan.accrued_interest); v_principal_paid:=v_pay-v_interest_paid;
  v_new_principal:=greatest(0,v_loan.principal_balance-v_principal_paid);
  v_new_interest:=greatest(0,v_loan.accrued_interest-v_interest_paid);
  v_is_paid:=v_new_principal<=0.005 and v_new_interest<=0.005;
  select ledger_entry_id into v_entry from public.record_player_ledger_entry(
    p_game_session_id,p_player_id,v_account,-v_pay,v_loan.currency_code,'debit','loans','loan_payment',v_loan.id,'player',p_player_id,
    jsonb_build_object('loan_key',v_loan.public_key,'interest_paid',v_interest_paid,'principal_paid',v_principal_paid));
  insert into public.loan_payments(game_session_id,player_id,loan_id,amount,principal_amount,interest_amount,idempotency_key,request_hash,ledger_entry_id,status)
  values(p_game_session_id,p_player_id,v_loan.id,v_pay,v_principal_paid,v_interest_paid,p_idempotency_key,v_hash,v_entry,'posted') returning * into v_payment;
  update public.player_loans pl
  set principal_balance=v_new_principal,
      accrued_interest=v_new_interest,
      last_accrued_at=now(),
      status=case when v_is_paid then 'paid' else 'active' end,
      next_due_at=case when v_is_paid then pl.next_due_at else now()+make_interval(days=>greatest(v_product.payment_frequency_cycles,1)*7) end,
      closed_at=case when v_is_paid then now() else null end,
      delinquent_at=null
  where pl.id=v_loan.id returning pl.* into v_loan;
  perform public.recalculate_player_credit_v1(p_game_session_id,p_player_id);
  return query select v_payment.public_key,v_loan.public_key,v_loan.status,v_loan.principal_balance,v_loan.accrued_interest,v_loan.next_due_at,false;
end;
$$;

commit;
