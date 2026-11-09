-- REF025c2-1: gated bindings only; retain both c1 creation CHECK constraints.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create function economy_private.guard_business_loan_identity_v1()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp
as $function$
declare a jsonb:=to_jsonb(old); b jsonb:=to_jsonb(new); field text;
begin
  if a->>'liability_kind'='business_v1' or b->>'liability_kind'='business_v1' then
    foreach field in array array['liability_kind','game_session_id','player_id','business_id',
      'initiating_operator_player_id','borrower_business_id','obligation_currency_code',
      'currency_code','loan_product_id','application_id','repayment_source','repayment_account_type'] loop
      if a->field is distinct from b->field then
        raise exception 'BUSINESS_LOAN_IDENTITY_IMMUTABLE' using errcode='23514';
      end if;
    end loop;
  end if;
  return new;
end;
$function$;
revoke all on function economy_private.guard_business_loan_identity_v1() from public,anon,authenticated,service_role;
create trigger a_business_loan_identity before update on public.loan_applications
  for each row execute function economy_private.guard_business_loan_identity_v1();
create trigger a_business_loan_identity before update on public.player_loans
  for each row execute function economy_private.guard_business_loan_identity_v1();

-- Splice one explicit branch; the complete effective legacy bodies/ACLs survive.
do $migration$
declare routine text; definition text; branch text; table_name text; currency_field text; account_field text;
begin
  foreach routine in array array['normalize_loan_application_repayment_account_v1','bind_player_loan_repayment_account_v1'] loop
    table_name:=case when routine like 'normalize_%' then 'loan_applications' else 'player_loans' end;
    currency_field:=case when table_name='loan_applications' then 'obligation_currency_code' else 'currency_code' end;
    account_field:=case when table_name='loan_applications' then 'repayment_source' else 'repayment_account_type' end;
    definition:=pg_get_functiondef(format('public.%I()',routine)::regprocedure);
    if length(definition)-length(replace(definition,E'begin\n',''))<>6 then
      raise exception 'BUSINESS_LOAN_BINDING_SOURCE_DRIFT:%',routine;
    end if;
    branch:=format($branch$
  if to_jsonb(new)->>'liability_kind'='business_v1' then
    -- Enforced CHECK is still the authority while c2-c4 prepare the inert path.
    if exists(select 1 from pg_catalog.pg_constraint where conrelid=tg_relid
      and conname=tg_table_name||'_business_liability_disabled_v1' and convalidated) then
      return new;
    end if;
    if new.initiating_operator_player_id is distinct from new.player_id
      or new.borrower_business_id is distinct from new.business_id then
      raise exception 'BUSINESS_LOAN_IDENTITY_INVALID' using errcode='23514';
    end if;
    perform 1 from public.business_entities b join public.loan_products p
      on p.id=new.loan_product_id and p.game_session_id=b.game_session_id
      where b.id=new.borrower_business_id and b.game_session_id=new.game_session_id
        and b.status in ('active','restructuring') and p.borrower_type='business'
        and b.currency_code=new.%1$I and p.currency_code=new.%1$I
      for share of b,p;
    if not found then raise exception 'BUSINESS_LOAN_SCOPE_OR_CURRENCY_INVALID'; end if;
    perform 1 from public.business_entities b join public.account_balances a
      on a.business_id=b.id and a.game_session_id=b.game_session_id
      join public.bank_accounts ba on ba.id=a.bank_account_id and ba.game_session_id=a.game_session_id
      join public.economic_parties ep on ep.id=ba.party_id and ep.game_session_id=ba.game_session_id
      where b.id=new.borrower_business_id and b.game_session_id=new.game_session_id
        and a.currency_code=new.%1$I and ba.currency_code=new.%1$I and ep.business_id=b.id
        and ep.party_kind='business' and ep.status='active' and ba.account_kind='checking' and ba.status='active'
        and a.account_type=public.business_account_type_v1(b.public_key)
        and new.%2$I=a.account_type;
    if not found then raise exception 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE'; end if;
$branch$,currency_field,account_field);
    if table_name='loan_applications' then
      branch:=branch||$branch$
    if tg_op='INSERT' and not exists(select 1 from public.resolve_player_business_v2(
      new.game_session_id,new.initiating_operator_player_id) r where r.business_id=new.borrower_business_id) then
      raise exception 'BUSINESS_LOAN_OPERATOR_REQUIRED';
    end if;
$branch$;
    else
      branch:=branch||$branch$
    perform 1 from public.loan_applications a where a.id=new.application_id
      and a.liability_kind='business_v1' and a.game_session_id=new.game_session_id
      and a.player_id=new.player_id and a.initiating_operator_player_id=new.initiating_operator_player_id
      and a.business_id=new.business_id and a.borrower_business_id=new.borrower_business_id
      and a.loan_product_id=new.loan_product_id and a.obligation_currency_code=new.currency_code
      and a.repayment_source=new.repayment_account_type for share;
    if not found then raise exception 'BUSINESS_LOAN_APPLICATION_BINDING_INVALID'; end if;
$branch$;
    end if;
    branch:=branch||E'    return new;\n  end if;\n';
    execute replace(definition,E'begin\n',E'begin\n'||branch);
  end loop;
end;
$migration$;
commit;
