-- Forward-only connected Business operating corrections V1.

begin;

create or replace function public.submit_business_product_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_name text,p_category text,
  p_unit_price numeric,p_unit_input_cost numeric,p_unit_labor_cost numeric,p_capacity_units integer,
  p_base_demand_units integer,p_quality_score integer,p_idempotency_key text
) returns table(product_key text,status text,unit_price numeric,version integer,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_product public.business_products%rowtype; v_existing_key text;
begin
  if length(btrim(coalesce(p_idempotency_key,'')))<8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  select be.* into v_business from public.business_entities be
  where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key))
    and be.owner_player_id=p_player_id and be.status in('active','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select al.metadata->>'product_key' into v_existing_key from public.audit_log al
  where al.game_session_id=p_game_session_id and al.actor_id=p_player_id
    and al.action='business.product.submit' and al.target_id=v_business.id
    and al.metadata->>'idempotency_key'=p_idempotency_key limit 1;
  if v_existing_key is not null then
    select bp.* into v_product from public.business_products bp where bp.public_key=v_existing_key;
    return query select v_product.public_key,v_product.status,v_product.unit_price,v_product.version,true; return;
  end if;
  if length(btrim(coalesce(p_name,'')))<2 then raise exception 'PRODUCT_NAME_INVALID' using errcode='P0001'; end if;
  if p_unit_price<=0 or p_unit_price>1000000 or p_unit_input_cost<0 or p_unit_labor_cost<0 then raise exception 'PRODUCT_COST_INVALID' using errcode='P0001'; end if;
  if p_capacity_units<1 or p_capacity_units>100000 or p_base_demand_units<0 or p_base_demand_units>100000 then raise exception 'PRODUCT_CAPACITY_INVALID' using errcode='P0001'; end if;
  if p_quality_score<0 or p_quality_score>100 then raise exception 'PRODUCT_QUALITY_INVALID' using errcode='P0001'; end if;
  insert into public.business_products(game_session_id,business_id,name,category,status,unit_price,reference_price,unit_input_cost,unit_labor_cost,capacity_units,base_demand_units,quality_score)
  values(p_game_session_id,v_business.id,left(btrim(p_name),120),left(btrim(coalesce(p_category,'general')),80),'paused',round(p_unit_price,2),round(p_unit_price,2),round(p_unit_input_cost,2),round(p_unit_labor_cost,2),p_capacity_units,p_base_demand_units,p_quality_score)
  returning * into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.product.submit','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'status','paused'));
  return query select v_product.public_key,v_product.status,v_product.unit_price,v_product.version,false;
end;
$$;

create or replace function public.review_business_product_v1(
  p_game_session_id uuid,p_staff_user_id uuid,p_product_key text,p_decision text,p_reason text,p_idempotency_key text
) returns table(product_key text,status text,version integer,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_product public.business_products%rowtype; v_status text;
begin
  if not exists(select 1 from public.game_sessions gs where gs.id=p_game_session_id and gs.owner_staff_user_id=p_staff_user_id) then raise exception 'STAFF_GAME_ACCESS_DENIED' using errcode='P0001'; end if;
  select bp.* into v_product from public.business_products bp where bp.game_session_id=p_game_session_id and bp.public_key=lower(btrim(p_product_key)) for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log al where al.game_session_id=p_game_session_id and al.actor_id=p_staff_user_id and al.action='business.product.review' and al.target_id=v_product.id and al.metadata->>'idempotency_key'=p_idempotency_key) then
    return query select v_product.public_key,v_product.status,v_product.version,true; return;
  end if;
  v_status:=case lower(btrim(p_decision)) when 'approve' then 'active' when 'pause' then 'paused' when 'retire' then 'retired' else null end;
  if v_status is null then raise exception 'PRODUCT_REVIEW_DECISION_INVALID' using errcode='P0001'; end if;
  update public.business_products bp set status=v_status,version=bp.version+1 where bp.id=v_product.id returning bp.* into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'staff_user',p_staff_user_id,'business.product.review','business_product',v_product.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'decision',p_decision,'reason',left(btrim(coalesce(p_reason,'')),1000)));
  return query select v_product.public_key,v_product.status,v_product.version,false;
end;
$$;

create or replace function public.set_business_product_price_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_product_key text,p_price numeric,p_expected_version integer,p_idempotency_key text
) returns table(product_key text,unit_price numeric,version integer,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_product public.business_products%rowtype;
begin
  select be.* into v_business from public.business_entities be where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.owner_player_id=p_player_id and be.status in('active','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select bp.* into v_product from public.business_products bp where bp.game_session_id=p_game_session_id and bp.business_id=v_business.id and bp.public_key=lower(btrim(p_product_key)) for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  if p_price is null or p_price<=0 or p_price>1000000 then raise exception 'PRICE_INVALID' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log al where al.game_session_id=p_game_session_id and al.action='business.product.price' and al.metadata->>'idempotency_key'=p_idempotency_key and al.target_id=v_product.id) then
    return query select v_product.public_key,v_product.unit_price,v_product.version,true; return;
  end if;
  if p_expected_version is not null and v_product.version<>p_expected_version then raise exception 'STALE_PRODUCT_VERSION' using errcode='P0001'; end if;
  update public.business_products bp set unit_price=round(p_price,2),version=bp.version+1 where bp.id=v_product.id returning bp.* into v_product;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.product.price','business_product',v_product.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'price',v_product.unit_price));
  return query select v_product.public_key,v_product.unit_price,v_product.version,false;
end;
$$;

create or replace function public.hire_business_employee_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_employee_player_identifier text,
  p_role_name text,p_contract_type text,p_wage_per_cycle numeric,p_productivity_index numeric,p_idempotency_key text
) returns table(employee_key text,status text,wage_per_cycle numeric,productivity_index numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_employee public.business_employees%rowtype;
  v_employee_player uuid; v_balance numeric:=0; v_identifier text; v_existing_key text;
begin
  select be.* into v_business from public.business_entities be
  where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.owner_player_id=p_player_id and be.status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if p_wage_per_cycle is null or p_wage_per_cycle<=0 then raise exception 'WAGE_INVALID' using errcode='P0001'; end if;
  if p_productivity_index is null or p_productivity_index<0.25 or p_productivity_index>3 then raise exception 'PRODUCTIVITY_INVALID' using errcode='P0001'; end if;
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<p_wage_per_cycle then raise exception 'WAGE_UNAFFORDABLE' using errcode='P0001'; end if;
  select al.metadata->>'employee_key' into v_existing_key from public.audit_log al where al.game_session_id=p_game_session_id and al.action='business.employee.hire' and al.target_id=v_business.id and al.metadata->>'idempotency_key'=p_idempotency_key limit 1;
  if v_existing_key is not null then
    select emp.* into v_employee from public.business_employees emp where emp.business_id=v_business.id and emp.public_key=v_existing_key;
    return query select v_employee.public_key,v_employee.status,v_employee.wage_per_cycle,v_employee.productivity_index,true; return;
  end if;
  v_identifier:=upper(regexp_replace(btrim(coalesce(p_employee_player_identifier,'')),'\s+','','g'));
  if v_identifier<>'' then
    select p.id into v_employee_player from public.players p where p.game_session_id=p_game_session_id and p.player_identifier_normalized=v_identifier and p.status='active';
    if v_employee_player is null then raise exception 'EMPLOYEE_PLAYER_NOT_FOUND' using errcode='P0001'; end if;
    if v_employee_player=p_player_id then raise exception 'OWNER_CANNOT_BE_EMPLOYEE' using errcode='P0001'; end if;
  end if;
  insert into public.business_employees(game_session_id,business_id,employee_player_id,role_name,contract_type,wage_per_cycle,productivity_index,status)
  values(p_game_session_id,v_business.id,v_employee_player,btrim(p_role_name),p_contract_type,round(p_wage_per_cycle,2),p_productivity_index,'active') returning * into v_employee;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.employee.hire','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'employee_key',v_employee.public_key,'role',v_employee.role_name,'wage',v_employee.wage_per_cycle));
  return query select v_employee.public_key,v_employee.status,v_employee.wage_per_cycle,v_employee.productivity_index,false;
end;
$$;

create or replace function public.run_business_production_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_product_key text,p_quantity integer,p_priority text,p_idempotency_key text
) returns table(run_key text,status text,output_quantity integer,total_cost numeric,business_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_product public.business_products%rowtype;
  v_run public.business_production_runs%rowtype; v_hash text; v_input numeric;
  v_labor numeric; v_total numeric; v_balance numeric:=0; v_entry uuid; v_capacity numeric;
begin
  if p_quantity is null or p_quantity<=0 or p_quantity>10000 then raise exception 'PRODUCTION_QUANTITY_INVALID' using errcode='P0001'; end if;
  if p_priority not in('standard','expedite') then raise exception 'PRODUCTION_PRIORITY_INVALID' using errcode='P0001'; end if;
  select be.* into v_business from public.business_entities be where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.owner_player_id=p_player_id and be.status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select bp.* into v_product from public.business_products bp where bp.game_session_id=p_game_session_id and bp.business_id=v_business.id and bp.public_key=lower(btrim(p_product_key)) and bp.status='active' for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  select least(v_business.capacity_units,v_product.capacity_units)*coalesce(sum(emp.productivity_index),1) into v_capacity from public.business_employees emp where emp.business_id=v_business.id and emp.status='active';
  if p_quantity>floor(v_capacity) then raise exception 'CAPACITY_EXCEEDED' using errcode='P0001'; end if;
  v_hash:=encode(extensions.digest(concat_ws('|',p_game_session_id,p_player_id,v_business.id,v_product.id,p_quantity,p_priority),'sha256'),'hex');
  select run.* into v_run from public.business_production_runs run where run.game_session_id=p_game_session_id and run.requested_by_player_id=p_player_id and run.idempotency_key=p_idempotency_key;
  if found then
    if v_run.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode='P0001'; end if;
    select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
    return query select v_run.public_key,v_run.status,v_run.output_quantity,v_run.total_cost,coalesce(v_balance,0),true; return;
  end if;
  v_input:=round(v_product.unit_input_cost*p_quantity,2);
  v_labor:=round(v_product.unit_labor_cost*p_quantity*(case when p_priority='expedite' then 1.25 else 1 end),2);
  v_total:=v_input+v_labor;
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<v_total then raise exception 'PRODUCTION_UNAFFORDABLE' using errcode='P0001'; end if;
  if v_product.unit_input_cost>0 then
    update public.business_inventory bi set quantity=bi.quantity-p_quantity,version=bi.version+1
    where bi.game_session_id=p_game_session_id and bi.business_id=v_business.id and bi.item_key='input:'||v_product.public_key and bi.quantity>=p_quantity;
    if not found then raise exception 'INSUFFICIENT_INPUT_INVENTORY' using errcode='P0001'; end if;
  end if;
  insert into public.business_production_runs(game_session_id,business_id,product_id,requested_by_player_id,idempotency_key,request_hash,quantity,priority,status,input_cost,labor_cost,total_cost,output_quantity,completed_at)
  values(p_game_session_id,v_business.id,v_product.id,p_player_id,p_idempotency_key,v_hash,p_quantity,p_priority,'completed',v_input,v_labor,v_total,p_quantity,now()) returning * into v_run;
  if v_total>0 then select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,public.business_account_type_v1(v_business.public_key),-v_total,v_business.currency_code,'debit','business','production_cost',v_run.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key,'run_key',v_run.public_key)); end if;
  update public.business_production_runs run set ledger_entry_id=v_entry where run.id=v_run.id returning run.* into v_run;
  insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost)
  values(p_game_session_id,v_business.id,'finished:'||v_product.public_key,'finished_good',p_quantity,case when p_quantity>0 then v_total/p_quantity else 0 end)
  on conflict on constraint business_inventory_scope_unique do update set quantity=public.business_inventory.quantity+excluded.quantity,unit_cost=excluded.unit_cost,version=public.business_inventory.version+1;
  update public.business_entities be set expense_total=be.expense_total+v_total,profit_total=be.profit_total-v_total,version=be.version+1 where be.id=v_business.id;
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
  return query select v_run.public_key,v_run.status,v_run.output_quantity,v_run.total_cost,coalesce(v_balance,0),false;
end;
$$;

commit;
