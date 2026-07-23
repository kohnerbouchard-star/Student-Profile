-- Forward-only connected Business settlement and state corrections V1.

begin;

create or replace function public.purchase_business_input_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_product_key text,p_quantity integer,p_idempotency_key text
) returns table(item_key text,quantity numeric,total_cost numeric,business_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_product public.business_products%rowtype;
  v_context record; v_item public.business_inventory%rowtype; v_cost numeric;
  v_balance numeric:=0; v_entry uuid; v_existing public.audit_log%rowtype;
begin
  if p_quantity is null or p_quantity<1 or p_quantity>100000 then raise exception 'INPUT_QUANTITY_INVALID' using errcode='P0001'; end if;
  select be.* into v_business from public.business_entities be where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.owner_player_id=p_player_id and be.status='active' for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select bp.* into v_product from public.business_products bp where bp.game_session_id=p_game_session_id and bp.business_id=v_business.id and bp.public_key=lower(btrim(p_product_key)) and bp.status='active';
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='P0001'; end if;
  select al.* into v_existing from public.audit_log al where al.game_session_id=p_game_session_id and al.actor_id=p_player_id and al.action='business.input.purchase' and al.target_id=v_business.id and al.metadata->>'idempotency_key'=p_idempotency_key;
  if found then
    select bi.* into v_item from public.business_inventory bi where bi.game_session_id=p_game_session_id and bi.business_id=v_business.id and bi.item_key='input:'||v_product.public_key;
    select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
    return query select v_item.item_key,v_item.quantity,(v_existing.metadata->>'total_cost')::numeric,coalesce(v_balance,0),true; return;
  end if;
  select * into v_context from public.resolve_player_economic_context_v1(p_game_session_id,p_player_id);
  v_cost:=round(v_product.unit_input_cost*p_quantity*greatest(coalesce(v_context.supply_constraint_index,1),0.1)*(1+greatest(coalesce(v_context.inflation_rate,0),-0.05)),2);
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<v_cost then raise exception 'INPUT_PURCHASE_UNAFFORDABLE' using errcode='P0001'; end if;
  if v_cost>0 then select ledger_entry_id into v_entry from public.record_player_ledger_entry(p_game_session_id,p_player_id,public.business_account_type_v1(v_business.public_key),-v_cost,v_business.currency_code,'debit','business','input_purchase',v_business.id,'player',p_player_id,jsonb_build_object('business_key',v_business.public_key,'product_key',v_product.public_key,'quantity',p_quantity)); end if;
  insert into public.business_inventory(game_session_id,business_id,item_key,inventory_kind,quantity,unit_cost)
  values(p_game_session_id,v_business.id,'input:'||v_product.public_key,'input',p_quantity,case when p_quantity>0 then v_cost/p_quantity else 0 end)
  on conflict on constraint business_inventory_scope_unique do update set quantity=public.business_inventory.quantity+excluded.quantity,unit_cost=excluded.unit_cost,version=public.business_inventory.version+1
  returning * into v_item;
  update public.business_entities be set expense_total=be.expense_total+v_cost,profit_total=be.profit_total-v_cost,version=be.version+1 where be.id=v_business.id;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.input.purchase','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'product_key',v_product.public_key,'quantity',p_quantity,'total_cost',v_cost,'ledger_entry_id',v_entry));
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=p_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
  return query select v_item.item_key,v_item.quantity,v_cost,coalesce(v_balance,0),false;
end;
$$;

create or replace function public.settle_business_cycle_v1(
  p_game_session_id uuid,p_business_key text,p_settlement_key text,p_inflation_index numeric,
  p_exchange_index numeric,p_interest_index numeric,p_difficulty_multiplier numeric
) returns table(business_key text,units_sold integer,gross_revenue numeric,total_expense numeric,net_income numeric,ending_balance numeric,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_business public.business_entities%rowtype; v_product public.business_products%rowtype;
  v_inventory public.business_inventory%rowtype; v_units integer:=0; v_total_units integer:=0;
  v_gross numeric:=0; v_wages numeric:=0; v_tax numeric:=0; v_net numeric:=0; v_balance numeric:=0;
  v_revenue_entry uuid; v_wage_entry uuid; v_tax_entry uuid; v_tax_rate numeric:=0.08;
  v_price_factor numeric; v_demand numeric; v_demand_index numeric;
begin
  select be.* into v_business from public.business_entities be
  where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.status in('active','distressed','restructuring') for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.business_sales bs where bs.game_session_id=p_game_session_id and bs.business_id=v_business.id and bs.settlement_key=p_settlement_key) then
    select coalesce(sum(bs.quantity),0),coalesce(sum(bs.gross_revenue),0),coalesce(sum(bs.wage_expense+bs.tax_expense),0),coalesce(sum(bs.net_income),0)
      into v_total_units,v_gross,v_wages,v_net from public.business_sales bs
      where bs.game_session_id=p_game_session_id and bs.business_id=v_business.id and bs.settlement_key=p_settlement_key;
    select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=v_business.owner_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
    return query select v_business.public_key,v_total_units,v_gross,v_wages,v_net,coalesce(v_balance,0),true; return;
  end if;
  v_tax_rate:=coalesce((select nullif(gs.business_market_window->>'businessTaxRate','')::numeric from public.game_settings gs where gs.game_session_id=p_game_session_id),0.08);
  for v_product in select bp.* from public.business_products bp where bp.game_session_id=p_game_session_id and bp.business_id=v_business.id and bp.status='active' order by bp.id
  loop
    select bi.* into v_inventory from public.business_inventory bi where bi.game_session_id=p_game_session_id and bi.business_id=v_business.id and bi.item_key='finished:'||v_product.public_key for update;
    if not found or v_inventory.quantity<=0 then continue; end if;
    v_price_factor:=greatest(0.1,2-(v_product.unit_price/greatest(v_product.reference_price*greatest(coalesce(p_inflation_index,1),0.1),0.01)));
    v_demand:=v_product.base_demand_units*v_business.demand_index*v_price_factor*greatest(coalesce(p_exchange_index,1),0.1)/greatest(coalesce(p_difficulty_multiplier,1),0.1);
    v_units:=least(floor(v_inventory.quantity)::integer,greatest(0,floor(v_demand)::integer));
    if v_units<=0 then continue; end if;
    v_demand_index:=least(10,greatest(0.01,v_demand));
    update public.business_inventory bi set quantity=bi.quantity-v_units,version=bi.version+1 where bi.id=v_inventory.id;
    insert into public.business_sales(game_session_id,business_id,product_id,settlement_key,quantity,unit_price,gross_revenue,wage_expense,tax_expense,net_income,demand_index)
    values(p_game_session_id,v_business.id,v_product.id,p_settlement_key,v_units,v_product.unit_price,round(v_units*v_product.unit_price,2),0,0,round(v_units*v_product.unit_price,2),v_demand_index);
    v_total_units:=v_total_units+v_units; v_gross:=v_gross+round(v_units*v_product.unit_price,2);
  end loop;
  select coalesce(sum(emp.wage_per_cycle),0) into v_wages from public.business_employees emp where emp.game_session_id=p_game_session_id and emp.business_id=v_business.id and emp.status='active';
  v_tax:=round(greatest(v_gross,0)*greatest(v_tax_rate,0),2); v_net:=v_gross-v_wages-v_tax;
  if v_gross>0 then select ledger_entry_id into v_revenue_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),v_gross,v_business.currency_code,'credit','business','sales_revenue',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=v_business.owner_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code for update;
  if v_wages+v_tax>coalesce(v_balance,0)+v_gross then
    update public.business_entities be set status='distressed',failure_count=be.failure_count+1,version=be.version+1 where be.id=v_business.id;
    raise exception 'BUSINESS_CYCLE_UNAFFORDABLE' using errcode='P0001';
  end if;
  if v_wages>0 then select ledger_entry_id into v_wage_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),-v_wages,v_business.currency_code,'debit','business','wage_expense',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  if v_tax>0 then select ledger_entry_id into v_tax_entry from public.record_player_ledger_entry(p_game_session_id,v_business.owner_player_id,public.business_account_type_v1(v_business.public_key),-v_tax,v_business.currency_code,'debit','business','tax_expense',v_business.id,'system',null,jsonb_build_object('business_key',v_business.public_key,'settlement_key',p_settlement_key)); end if;
  update public.business_sales bs set
    wage_expense=case when v_total_units>0 then round(v_wages*bs.quantity/v_total_units,2) else 0 end,
    tax_expense=case when v_total_units>0 then round(v_tax*bs.quantity/v_total_units,2) else 0 end,
    net_income=bs.gross_revenue-case when v_total_units>0 then round((v_wages+v_tax)*bs.quantity/v_total_units,2) else 0 end,
    revenue_ledger_entry_id=v_revenue_entry,wage_ledger_entry_id=v_wage_entry,tax_ledger_entry_id=v_tax_entry
  where bs.game_session_id=p_game_session_id and bs.business_id=v_business.id and bs.settlement_key=p_settlement_key;
  update public.business_entities be set
    revenue_total=be.revenue_total+v_gross,
    expense_total=be.expense_total+v_wages+v_tax,
    profit_total=be.profit_total+v_net,
    valuation=greatest(0,round((be.revenue_total+v_gross)*0.35+greatest(be.profit_total+v_net,0)*3,2)),
    reputation_score=greatest(0,least(100,be.reputation_score+case when v_net>=0 then 1 else -2 end)),
    status=case when v_net<0 and be.failure_count>=2 then 'distressed' else be.status end,
    version=be.version+1
  where be.id=v_business.id returning be.* into v_business;
  select ab.balance into v_balance from public.account_balances ab where ab.game_session_id=p_game_session_id and ab.player_id=v_business.owner_player_id and ab.account_type=public.business_account_type_v1(v_business.public_key) and ab.currency_code=v_business.currency_code;
  return query select v_business.public_key,v_total_units,v_gross,v_wages+v_tax,v_net,coalesce(v_balance,0),false;
end;
$$;

create or replace function public.transition_business_status_v1(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_transition text,p_reason text,p_idempotency_key text
) returns table(business_key text,status text,failure_count integer,closed_at timestamptz,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_business public.business_entities%rowtype; v_target text;
begin
  select be.* into v_business from public.business_entities be
  where be.game_session_id=p_game_session_id and be.public_key=lower(btrim(p_business_key)) and be.owner_player_id=p_player_id for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log al where al.game_session_id=p_game_session_id and al.action='business.status.transition' and al.target_id=v_business.id and al.metadata->>'idempotency_key'=p_idempotency_key) then
    return query select v_business.public_key,v_business.status,v_business.failure_count,v_business.closed_at,true; return;
  end if;
  v_target:=case lower(btrim(p_transition)) when 'restructure' then 'restructuring' when 'recover' then 'active' when 'close' then 'closed' else null end;
  if v_target is null then raise exception 'BUSINESS_TRANSITION_INVALID' using errcode='P0001'; end if;
  if v_business.status='closed' and v_target<>'closed' then raise exception 'CLOSED_BUSINESS_IMMUTABLE' using errcode='P0001'; end if;
  update public.business_entities be
  set status=v_target,
      closed_at=case when v_target='closed' then now() else null end,
      failure_count=case when v_target='active' then greatest(be.failure_count-1,0) else be.failure_count end,
      version=be.version+1
  where be.id=v_business.id returning be.* into v_business;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.status.transition','business',v_business.id,jsonb_build_object('idempotency_key',p_idempotency_key,'transition',p_transition,'reason',left(btrim(coalesce(p_reason,'')),500),'status',v_business.status));
  return query select v_business.public_key,v_business.status,v_business.failure_count,v_business.closed_at,false;
end;
$$;

commit;
