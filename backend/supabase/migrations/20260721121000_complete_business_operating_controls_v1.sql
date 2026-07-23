-- Complete Business Operating Controls V1.
-- Adds explicit product/input lifecycle, country context, and staff-reviewed
-- license/tax/regulatory compliance without changing Marketplace or Crafting.

begin;

create table public.business_compliance_records (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('cmp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions (id),
  business_id uuid not null references public.business_entities (id),
  country_code text not null,
  requirement_key text not null,
  requirement_type text not null,
  status text not null default 'pending',
  fee_amount numeric(14,2) not null default 0,
  policy_effects jsonb not null default '{}'::jsonb,
  reviewed_by_staff_user_id uuid null references public.staff_users (id),
  reviewed_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_compliance_public_key_check check (public_key ~ '^cmp_[0-9a-f]{32}$'),
  constraint business_compliance_country_check check (country_code = upper(country_code) and length(country_code) between 2 and 16),
  constraint business_compliance_requirement_check check (length(btrim(requirement_key)) between 2 and 120),
  constraint business_compliance_type_check check (requirement_type in ('license','tax','regulation')),
  constraint business_compliance_status_check check (status in ('pending','approved','suspended','expired','waived')),
  constraint business_compliance_fee_check check (fee_amount >= 0),
  constraint business_compliance_policy_object check (jsonb_typeof(policy_effects) = 'object'),
  constraint business_compliance_scope_unique unique (game_session_id, business_id, requirement_key)
);
create trigger set_business_compliance_records_updated_at before update on public.business_compliance_records
for each row execute function public.set_current_timestamp_updated_at();
create index business_compliance_business_status_idx
on public.business_compliance_records (game_session_id, business_id, status);

create or replace function public.resolve_player_economic_context_v1(
  p_game_session_id uuid,
  p_player_id uuid
) returns table (
  country_code text,
  currency_code text,
  inflation_rate numeric,
  exchange_rate_index numeric,
  interest_rate numeric,
  tax_rate numeric,
  business_confidence_index numeric,
  supply_constraint_index numeric,
  income_difficulty_modifier numeric,
  credit_difficulty_modifier numeric
) language sql security definer set search_path=public,pg_temp stable as $$
  select
    cp.country_code,
    cp.currency_code,
    coalesce(ces.inflation_rate,0),
    coalesce(ces.exchange_rate_index,1),
    coalesce(ces.interest_rate,0),
    coalesce(ces.tax_rate,0.08),
    coalesce(ces.business_confidence_index,100),
    coalesce(ces.supply_constraint_index,1),
    coalesce(ces.income_difficulty_modifier,1),
    coalesce(ces.credit_difficulty_modifier,1)
  from public.player_country_assignments pca
  join public.country_profiles cp on cp.id=pca.country_profile_id and cp.status='active'
  left join lateral (
    select s.* from public.country_economic_snapshots s
    where s.game_session_id=pca.game_session_id
      and s.country_profile_id=pca.country_profile_id
      and s.effective_at<=now()
    order by s.snapshot_sequence desc limit 1
  ) ces on true
  where pca.game_session_id=p_game_session_id
    and pca.player_id=p_player_id
    and pca.status='active'
  limit 1;
$$;

create or replace function public.submit_business_product_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_name text,
  p_category text,
  p_unit_price numeric,
  p_unit_input_cost numeric,
  p_unit_labor_cost numeric,
  p_capacity_units integer,
  p_base_demand_units integer,
  p_quality_score integer,
  p_idempotency_key text
) returns table (
  product_key text,
  status text,
  unit_price numeric,
  version integer,
  replayed boolean
) language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_existing_key text;
begin
  if length(btrim(coalesce(p_idempotency_key,'')))<8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  select * into v_business from public.business_entities
  where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key))
    and owner_player_id=p_player_id and status in ('active','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select metadata->>'product_key' into v_existing_key from public.audit_log
  where game_session_id=p_game_session_id and actor_id=p_player_id
    and action='business.product.submit' and target_id=v_business.id
    and metadata->>'idempotency_key'=p_idempotency_key limit 1;
  if v_existing_key is not null then
    select * into v_product from public.business_products where public_key=v_existing_key;
    return query select v_product.public_key,v_product.status,v_product.unit_price,v_product.version,true;
    return;
  end if;
  if length(btrim(coalesce(p_name,'')))<2 then raise exception 'PRODUCT_NAME_INVALID' using errcode='P0001'; end if;
  if p_unit_price<=0 or p_unit_price>1000000 or p_unit_input_cost<0 or p_unit_labor_cost<0 then raise exception 'PRODUCT_COST_INVALID' using errcode='P0001'; end if;
  if p_capacity_units<1 or p_capacity_units>100000 or p_base_demand_units<0 or p_base_demand_units>100000 then raise exception 'PRODUCT_CAPACITY_INVALID' using errcode='P0001'; end if;
  if p_quality_score<0 or p_quality_score>100 then raise exception 'PRODUCT_QUALITY_INVALID' using errcode='P0001'; end if;
  insert into public.business_products(
    game_session_id,business_id,name,category,status,unit_price,reference_price,
    unit_input_cost,unit_labor_cost,capacity_units,base_demand_units,quality_score
  ) values (
    p_game_session_id,v_business.id,left(btrim(p_name),120),left(btrim(coalesce(p_category,'general')),80),'paused',
    round(p_unit_price,2),round(p_unit_price,2),round(p_unit_input_cost,2),round(p_unit_labor_cost,2),
    p_capacity_units,p_base_demand_units,p_quality_score
  ) returning * into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.product.submit','business',v_business.id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'status','paused'));
  return query select v_product.public_key,v_product.status,v_product.unit_price,v_product.version,false;
end;
$$;

create or replace function public.review_business_product_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_product_key text,
  p_decision text,
  p_reason text,
  p_idempotency_key text
) returns table(product_key text,status text,version integer,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_product public.business_products%rowtype; v_status text;
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  select * into v_product from public.business_products where game_session_id=p_game_session_id and public_key=lower(btrim(p_product_key)) for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log where game_session_id=p_game_session_id and actor_id=p_staff_user_id and action='business.product.review' and target_id=v_product.id and metadata->>'idempotency_key'=p_idempotency_key) then
    return query select v_product.public_key,v_product.status,v_product.version,true; return;
  end if;
  v_status:=case lower(btrim(p_decision)) when 'approve' then 'active' when 'pause' then 'paused' when 'retire' then 'retired' else null end;
  if v_status is null then raise exception 'PRODUCT_REVIEW_DECISION_INVALID' using errcode='P0001'; end if;
  update public.business_products set status=v_status,version=version+1 where id=v_product.id returning * into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'staff_user',p_staff_user_id,'business.product.review','business_product',v_product.id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'decision',p_decision,'reason',left(btrim(coalesce(p_reason,'')),1000)));
  return query select v_product.public_key,v_product.status,v_product.version,false;
end;
$$;

create or replace function public.purchase_business_input_v1(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_product_key text,
  p_quantity integer,
  p_idempotency_key text
) returns table(item_key text,quantity numeric,total_cost numeric,business_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_context record;
  v_item public.business_inventory%rowtype;
  v_cost numeric;
  v_balance numeric:=0;
  v_entry uuid;
  v_existing public.audit_log%rowtype;
begin
  if p_quantity is null or p_quantity<1 or p_quantity>100000 then raise exception 'INPUT_QUANTITY_INVALID' using errcode='P0001'; end if;
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and owner_player_id=p_player_id and status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_product from public.business_products where game_session_id=p_game_session_id and business_id=v_business.id and public_key=lower(btrim(p_product_key)) and status='active';
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_existing from public.audit_log where game_session_id=p_game_session_id and actor_id=p_player_id and action='business.input.purchase' and target_id=v_business.id and metadata->>'idempotency_key'=p_idempotency_key;
  if found then
    select * into v_item from public.business_inventory where game_session_id=p_game_session_id and business_id=v_business.id and item_key='input:'||v_product.public_key;
    select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
    return query select v_item.item_key,v_item.quantity,(v_existing.metadata->>'total_cost')::numeric,coalesce(v_balance,0),true; return;
  end if;
  select * into v_context from public.resolve_player_economic_context_v1(p_game_session_id,p_player_id);
  v_cost:=round(v_product.unit_input_cost*p_quantity*greatest(coalesce(v_context.supply_constraint_index,1),0.1)*(1+greatest(coalesce(v_context.inflation_rate,0),-0.05)),2);
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<v_cost then raise exception 'INPUT_PURCHASE_UNAFFORDABLE' using errcode='P0001'; end if;
  if v_cost>0 then select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,public.business_account_type_v1(v_business.public_key),-v_cost,v_business.currency_code,'debit','business','input_purchase',v_business.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key,'product_key',v_product.public_key,'quantity',p_quantity)); end if;
  insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost)
  values(p_game_session_id,v_business.id,'input:'||v_product.public_key,'input',p_quantity,case when p_quantity>0 then v_cost/p_quantity else 0 end)
  on conflict on constraint business_inventory_scope_unique do update set quantity=public.business_inventory.quantity+excluded.quantity,unit_cost=excluded.unit_cost,version=public.business_inventory.version+1
  returning * into v_item;
  update public.business_entities set expense_total=expense_total+v_cost,profit_total=profit_total-v_cost,version=version+1 where id=v_business.id;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.input.purchase','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'quantity',p_quantity,'total_cost',v_cost,'ledger_entry_id',v_entry));
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type=public.business_account_type_v1(v_business.public_key) and currency_code=v_business.currency_code;
  return query select v_item.item_key,v_item.quantity,v_cost,coalesce(v_balance,0),false;
end;
$$;

create or replace function public.set_business_compliance_v1(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_business_key text,
  p_requirement_key text,
  p_requirement_type text,
  p_status text,
  p_fee_amount numeric,
  p_policy_effects jsonb,
  p_expires_at timestamptz,
  p_reason text,
  p_idempotency_key text
) returns table(compliance_key text,status text,fee_amount numeric,expires_at timestamptz,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_record public.business_compliance_records%rowtype; v_existing public.audit_log%rowtype;
begin
  if not exists(select 1 from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_existing from public.audit_log where game_session_id=p_game_session_id and actor_id=p_staff_user_id and action='business.compliance.set' and target_id=v_business.id and metadata->>'idempotency_key'=p_idempotency_key;
  if found then
    select * into v_record from public.business_compliance_records where game_session_id=p_game_session_id and business_id=v_business.id and requirement_key=btrim(p_requirement_key);
    return query select v_record.public_key,v_record.status,v_record.fee_amount,v_record.expires_at,true; return;
  end if;
  if p_requirement_type not in ('license','tax','regulation') or p_status not in ('pending','approved','suspended','expired','waived') then raise exception 'COMPLIANCE_STATE_INVALID' using errcode='P0001'; end if;
  insert into public.business_compliance_records(game_session_id,business_id,country_code,requirement_key,requirement_type,status,fee_amount,policy_effects,reviewed_by_staff_user_id,reviewed_at,expires_at)
  values(p_game_session_id,v_business.id,v_business.country_code,btrim(p_requirement_key),p_requirement_type,p_status,greatest(round(coalesce(p_fee_amount,0),2),0),coalesce(p_policy_effects,'{}'::jsonb),p_staff_user_id,now(),p_expires_at)
  on conflict on constraint business_compliance_scope_unique do update set requirement_type=excluded.requirement_type,status=excluded.status,fee_amount=excluded.fee_amount,policy_effects=excluded.policy_effects,reviewed_by_staff_user_id=excluded.reviewed_by_staff_user_id,reviewed_at=excluded.reviewed_at,expires_at=excluded.expires_at
  returning * into v_record;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'staff_user',p_staff_user_id,'business.compliance.set','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'compliance_key',v_record.public_key,'requirement_key',v_record.requirement_key,'status',v_record.status,'reason',left(btrim(coalesce(p_reason,'')),1000)));
  return query select v_record.public_key,v_record.status,v_record.fee_amount,v_record.expires_at,false;
end;
$$;

create or replace function public.enforce_business_compliance_v1()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_business_id uuid; begin
  v_business_id:=new.business_id;
  if exists(
    select 1 from public.business_compliance_records r
    where r.game_session_id=new.game_session_id and r.business_id=v_business_id
      and r.status in ('pending','suspended','expired')
      and (r.expires_at is null or r.expires_at<=now() or r.status<>'approved')
  ) then raise exception 'BUSINESS_COMPLIANCE_BLOCKED' using errcode='P0001'; end if;
  return new;
end;
$$;
create trigger enforce_business_production_compliance before insert on public.business_production_runs
for each row execute function public.enforce_business_compliance_v1();
create trigger enforce_business_sales_compliance before insert on public.business_sales
for each row execute function public.enforce_business_compliance_v1();

alter table public.business_compliance_records enable row level security;
alter table public.business_compliance_records force row level security;
revoke all on table public.business_compliance_records from public,anon,authenticated;
grant select,insert,update,delete on table public.business_compliance_records to service_role;

revoke all on function public.resolve_player_economic_context_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_player_economic_context_v1(uuid,uuid) to service_role;
revoke all on function public.submit_business_product_v1(uuid,uuid,text,text,text,numeric,numeric,numeric,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.submit_business_product_v1(uuid,uuid,text,text,text,numeric,numeric,numeric,integer,integer,integer,text) to service_role;
revoke all on function public.review_business_product_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.review_business_product_v1(uuid,uuid,text,text,text,text) to service_role;
revoke all on function public.purchase_business_input_v1(uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.purchase_business_input_v1(uuid,uuid,text,text,integer,text) to service_role;
revoke all on function public.set_business_compliance_v1(uuid,uuid,text,text,text,text,numeric,jsonb,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.set_business_compliance_v1(uuid,uuid,text,text,text,text,numeric,jsonb,timestamptz,text,text) to service_role;

comment on table public.business_compliance_records is 'Staff-reviewed business licenses, taxes, and regulations. Pending or adverse records block new production and sales.';
comment on function public.resolve_player_economic_context_v1(uuid,uuid) is 'Resolves server-owned player country, currency, macroeconomic, and difficulty context without accepting client scope.';

commit;
