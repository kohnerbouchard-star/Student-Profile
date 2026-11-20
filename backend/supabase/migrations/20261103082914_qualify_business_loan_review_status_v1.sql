-- Disambiguate the existing business status predicate from the status OUT parameter.
begin;

create or replace function public.review_player_loan_application_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_application_key text,p_decision text,p_reason text,p_idempotency_key text
) returns table(application_key text,status text,loan_key text,principal numeric,scheduled_payment numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_application public.loan_applications%rowtype; v_product public.loan_products%rowtype; v_loan public.player_loans%rowtype; v_fee numeric; v_disbursement numeric; v_entry uuid; v_account text:='cash';
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  select * into v_application from public.loan_applications where game_session_id=p_game_session_id and public_key=lower(btrim(p_application_key)) for update;
  if not found then raise exception 'LOAN_APPLICATION_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_product from public.loan_products where id=v_application.loan_product_id;
  if v_application.status in ('approved','declined') then
    select * into v_loan from public.player_loans where application_id=v_application.id;
    return query select v_application.public_key,v_application.status,v_loan.public_key,v_loan.original_principal,v_loan.scheduled_payment,true; return;
  end if;
  if lower(btrim(p_decision))='decline' then
    update public.loan_applications set status='declined',reviewed_by_staff_user_id=p_staff_user_id,reviewed_at=now(),review_reason=left(btrim(coalesce(p_reason,'')),1000) where id=v_application.id returning * into v_application;
    insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata) values(p_game_session_id,'staff_user',p_staff_user_id,'loan.application.decline','loan_application',v_application.id,jsonb_build_object('idempotency_key',p_idempotency_key,'reason',v_application.review_reason));
    return query select v_application.public_key,v_application.status,null::text,null::numeric,null::numeric,false; return;
  elsif lower(btrim(p_decision))<>'approve' then raise exception 'LOAN_REVIEW_DECISION_INVALID' using errcode='P0001'; end if;
  if v_product.borrower_type='business' then
    if not exists(select 1 from public.business_entities as business_row where id=v_application.business_id and game_session_id=p_game_session_id and owner_player_id=v_application.player_id and business_row.status in ('active','restructuring')) then raise exception 'AUTHORITATIVE_BUSINESS_BORROWER_REQUIRED' using errcode='P0001'; end if;
    select public.business_account_type_v1(public_key) into v_account from public.business_entities where id=v_application.business_id;
  end if;
  v_fee:=round(v_application.amount*v_product.origination_fee_rate,2); v_disbursement:=v_application.amount-v_fee;
  insert into public.player_loans(game_session_id,player_id,business_id,loan_product_id,application_id,currency_code,original_principal,principal_balance,annual_rate,origination_fee,scheduled_payment,status,next_due_at)
  values(p_game_session_id,v_application.player_id,v_application.business_id,v_product.id,v_application.id,v_product.currency_code,v_application.amount,v_application.amount,v_product.annual_rate,v_fee,v_application.projected_payment,'active',now()+make_interval(days=>greatest(v_product.payment_frequency_cycles,1)*7))
  returning * into v_loan;
  select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,v_application.player_id,v_account,v_disbursement,v_product.currency_code,'credit','loans','loan_disbursement',v_loan.id,'staff_user',p_staff_user_id,jsonb_build_object('loan_key',v_loan.public_key,'application_key',v_application.public_key,'origination_fee',v_fee));
  update public.player_loans set disbursement_ledger_entry_id=v_entry where id=v_loan.id returning * into v_loan;
  update public.loan_applications set status='approved',reviewed_by_staff_user_id=p_staff_user_id,reviewed_at=now(),review_reason=left(btrim(coalesce(p_reason,'Approved')),1000) where id=v_application.id returning * into v_application;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata) values(p_game_session_id,'staff_user',p_staff_user_id,'loan.application.approve','loan',v_loan.id,jsonb_build_object('idempotency_key',p_idempotency_key,'loan_key',v_loan.public_key,'application_key',v_application.public_key,'principal',v_loan.original_principal));
  return query select v_application.public_key,v_application.status,v_loan.public_key,v_loan.original_principal,v_loan.scheduled_payment,false;
end;
$$;

revoke all on function public.review_player_loan_application_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_player_loan_application_v1(uuid,uuid,text,text,text,text) to service_role;

commit;
