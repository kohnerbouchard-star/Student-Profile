-- REF025c2-2b: private submission; existing creation CHECK gates remain authoritative.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
create unique index loan_applications_business_request_unique_v1
  on public.loan_applications(game_session_id,borrower_business_id,idempotency_key)
  where liability_kind='business_v1';

create function economy_private.submit_business_loan_application_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_offer_key text,
  p_amount numeric,p_purpose text,p_idempotency_key text
) returns table(application_key text,status text,obligation_currency_code text,
  credit_score integer,projected_payment numeric,affordability_ratio numeric,replayed boolean)
language plpgsql volatile security invoker set search_path=pg_catalog,pg_temp
as $function$
declare
  business public.business_entities%rowtype; product public.loan_products%rowtype;
  application public.loan_applications%rowtype; assessment record; profile record;
  business_key text:=lower(btrim(p_business_key)); offer_key text:=lower(btrim(p_offer_key));
  amount numeric:=round(p_amount,2); purpose text:=btrim(p_purpose); key text:=btrim(p_idempotency_key);
  resolved uuid; party uuid; account text; currency text; request_hash text; is_replay boolean;
  assessed_at timestamptz;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'BUSINESS_LOAN_READ_COMMITTED_REQUIRED' using errcode='22023';
  end if;
  if p_game_session_id is null or p_player_id is null
    or business_key is null or business_key !~ '^biz_[0-9a-f]{32}$'
    or offer_key is null or offer_key !~ '^lop_[0-9a-f]{32}$'
    or purpose is null or length(purpose) not between 2 and 240
    or key is null or length(key) not between 8 and 160
    or amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'BUSINESS_LOAN_REQUEST_INVALID' using errcode='22023';
  end if;
  perform 1 from public.game_sessions g where g.id=p_game_session_id
    and g.status='active' and g.lifecycle_state='active' for share;
  if not found then raise exception 'BUSINESS_LOAN_GAME_UNAVAILABLE'; end if;
  perform 1 from public.players p where p.game_session_id=p_game_session_id
    and p.id=p_player_id and p.status='active' for share;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select b.* into business from public.business_entities b
    where b.game_session_id=p_game_session_id and b.public_key=business_key for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;
  -- Fresh READ COMMITTED statement after borrower lock; no global authority mutex.
  select r.business_id into resolved from public.resolve_player_business_v2(p_game_session_id,p_player_id) r;
  if resolved is distinct from business.id then raise exception 'BUSINESS_LOAN_OPERATOR_REQUIRED'; end if;
  select a.* into application from public.loan_applications a
    where a.game_session_id=p_game_session_id and a.borrower_business_id=business.id
      and a.liability_kind='business_v1' and a.idempotency_key=key;
  is_replay:=found;
  if is_replay then
    account:=application.repayment_source; currency:=application.obligation_currency_code;
  else
    if exists(select 1 from public.loan_applications a where a.game_session_id=p_game_session_id
      and a.player_id=p_player_id and a.idempotency_key=key) then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select p.* into product from public.loan_products p where p.game_session_id=p_game_session_id
      and p.public_key=offer_key and p.borrower_type='business' and p.status='active'
      and p.currency_code=business.currency_code for share;
    if not found then raise exception 'BUSINESS_LOAN_ASSESSMENT_PRODUCT_INVALID'; end if;
    select e.id into party from public.economic_parties e where e.game_session_id=p_game_session_id
      and e.business_id=business.id and e.party_kind='business' and e.status='active' for share;
    if not found then raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE'; end if;
    account:=public.business_account_type_v1(business.public_key); currency:=product.currency_code;
    perform 1 from public.bank_accounts a join public.account_balances balance
      on balance.game_session_id=a.game_session_id and balance.bank_account_id=a.id
      where a.game_session_id=p_game_session_id and a.party_id=party and a.account_kind='checking'
        and a.currency_code=currency and a.status='active' and balance.business_id=business.id
        and balance.currency_code=currency and balance.account_type=account for share of a;
    if not found then raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE'; end if;
  end if;
  request_hash:=private.fx_digest_jsonb_v1(jsonb_build_object('version','business.loan.application.v1',
    'game',p_game_session_id,'business',business.id,'offerKey',offer_key,'amount',amount,
    'purpose',purpose,'repaymentAccount',account,'currency',currency));
  if is_replay then
    if application.request_hash is distinct from request_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT'; end if;
  else
    assessed_at:=clock_timestamp();
    select * into assessment from economy_private.assess_business_loan_application_v1(
      p_game_session_id,business.id,product.id,amount,assessed_at);
    if not assessment.affordable then raise exception 'LOAN_UNAFFORDABLE'; end if;
    select * into profile from public.recalculate_player_credit_v1(p_game_session_id,p_player_id);
    if profile.score<assessment.minimum_credit_score then raise exception 'LOAN_CREDIT_SCORE_TOO_LOW'; end if;
    insert into public.loan_applications(game_session_id,player_id,business_id,loan_product_id,amount,
      purpose,repayment_source,credit_score,projected_payment,affordability_ratio,status,idempotency_key,request_hash,
      liability_kind,initiating_operator_player_id,borrower_business_id,obligation_currency_code)
    values(p_game_session_id,p_player_id,business.id,product.id,amount,purpose,account,profile.score,
      assessment.projected_payment,assessment.affordability_ratio,'pending_review',key,request_hash,
      'business_v1',p_player_id,business.id,currency) returning * into application;
    insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
    values(p_game_session_id,'player',p_player_id,'business.loan.application.submit','loan_application',application.id,
      jsonb_build_object('applicationKey',application.public_key,'assessment',to_jsonb(assessment),
        'productTerms',to_jsonb(product),'creditModel',profile.model_version));
  end if;
  return query select application.public_key,application.status,application.obligation_currency_code,
    application.credit_score,application.projected_payment,application.affordability_ratio,is_replay;
end;
$function$;
revoke all on function economy_private.submit_business_loan_application_v1(uuid,uuid,text,text,numeric,text,text)
  from public,anon,authenticated,service_role;
commit;
