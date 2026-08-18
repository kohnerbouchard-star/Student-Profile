-- Business tax, valuation and distress engine V2.
--
-- Tax policy is game/country configured rather than hard-coded to a real
-- jurisdiction. Valuation is server-calculated with an explainable breakdown.
-- Distress is deterministic and debt/payroll aware.

begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create table if not exists public.business_tax_policies_v2(
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default('txp_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  country_code text not null,
  effective_from date not null,
  corporate_income_tax_basis_points integer not null default 2000,
  pass_through_income_tax_basis_points integer not null default 1500,
  distribution_tax_basis_points integer not null default 500,
  deductible_loss_carryforward boolean not null default true,
  small_business_relief_basis_points integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default'{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_tax_policies_v2_public_key_check check(public_key~'^txp_[0-9a-f]{32}$'),
  constraint business_tax_policies_v2_country_check check(country_code=upper(country_code) and length(country_code) between 2 and 16),
  constraint business_tax_policies_v2_rates_check check(
    corporate_income_tax_basis_points between 0 and 7500
    and pass_through_income_tax_basis_points between 0 and 7500
    and distribution_tax_basis_points between 0 and 7500
    and small_business_relief_basis_points between 0 and 5000
  ),
  constraint business_tax_policies_v2_status_check check(status in('active','superseded','draft')),
  constraint business_tax_policies_v2_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint business_tax_policies_v2_scope_unique unique(game_session_id,country_code,effective_from),
  constraint business_tax_policies_v2_scope_id_unique unique(game_session_id,id)
);
create index if not exists business_tax_policies_v2_effective_idx
on public.business_tax_policies_v2(game_session_id,country_code,effective_from desc) where status='active';
create trigger set_business_tax_policies_v2_updated_at before update on public.business_tax_policies_v2
for each row execute function public.set_current_timestamp_updated_at();
alter table public.business_tax_policies_v2 enable row level security;
revoke all on table public.business_tax_policies_v2 from public,anon,authenticated;
grant select,insert,update on table public.business_tax_policies_v2 to service_role;

create or replace function public.business_tax_policy_for_date_v2(p_game_session_id uuid,p_country_code text,p_date date)
returns public.business_tax_policies_v2 language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_policy public.business_tax_policies_v2%rowtype;
begin
  select * into v_policy from public.business_tax_policies_v2
  where game_session_id=p_game_session_id and country_code=upper(btrim(p_country_code)) and status='active' and effective_from<=p_date
  order by effective_from desc limit 1;
  if not found then raise exception 'BUSINESS_TAX_POLICY_NOT_CONFIGURED' using errcode='P0001'; end if;
  return v_policy;
end
$function$;

-- Flexible reader over the canonical Business ledger. The V2 Business money
-- identity is business_id; action/delta are read via JSON so this remains
-- compatible with the ledger's existing column naming without a parallel cash
-- ledger.
create or replace function public.business_ledger_action_total_v2(
  p_game_session_id uuid,p_business_id uuid,p_action text,p_start timestamptz,p_end timestamptz
)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_total numeric;
begin
  select coalesce(sum(
    coalesce(
      nullif(to_jsonb(entry_row)->>'delta','')::numeric,
      nullif(to_jsonb(entry_row)->>'amount_delta','')::numeric,
      case
        when coalesce(to_jsonb(entry_row)->>'entry_type','')='debit' then -abs(coalesce(nullif(to_jsonb(entry_row)->>'amount','')::numeric,0))
        when coalesce(to_jsonb(entry_row)->>'entry_type','')='credit' then abs(coalesce(nullif(to_jsonb(entry_row)->>'amount','')::numeric,0))
        else coalesce(nullif(to_jsonb(entry_row)->>'amount','')::numeric,0)
      end
    )
  ),0)
  into v_total
  from public.ledger_entries as entry_row
  where entry_row.game_session_id=p_game_session_id
    and entry_row.business_id=p_business_id
    and entry_row.created_at>=p_start and entry_row.created_at<p_end
    and lower(coalesce(to_jsonb(entry_row)->>'source_action',to_jsonb(entry_row)->>'action',''))=lower(p_action);
  return round(v_total,2);
end
$function$;

create or replace function public.business_period_financials_v2(
  p_game_session_id uuid,p_business_id uuid,p_start timestamptz,p_end timestamptz
)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_revenue numeric; v_inputs numeric; v_wages numeric; v_maintenance numeric; v_research numeric; v_interest numeric; v_other numeric; v_profit numeric;
begin
  if p_end<=p_start then raise exception 'BUSINESS_FINANCIAL_PERIOD_INVALID' using errcode='P0001'; end if;
  v_revenue:=greatest(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'market_sale',p_start,p_end))
    +greatest(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'contract_revenue',p_start,p_end));
  v_inputs:=abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'wholesale_procurement',p_start,p_end)));
  v_wages:=abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'payroll',p_start,p_end)));
  v_maintenance:=abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'equipment_service',p_start,p_end)));
  v_research:=abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'research_start',p_start,p_end)));
  v_interest:=abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'loan_interest',p_start,p_end)))
    +abs(least(0,public.business_ledger_action_total_v2(p_game_session_id,p_business_id,'debt_interest',p_start,p_end)));
  v_other:=0;
  v_profit:=round(v_revenue-v_inputs-v_wages-v_maintenance-v_research-v_interest-v_other,2);
  return jsonb_build_object(
    'revenue',v_revenue,'cogsAndInputs',v_inputs,'wages',v_wages,'maintenance',v_maintenance,
    'research',v_research,'eligibleInterest',v_interest,'otherEligibleOperatingExpenses',v_other,
    'operatingProfit',v_profit,'cashBasisSimplification',true
  );
end
$function$;

create table if not exists public.business_tax_assessments_v2(
  id uuid primary key default gen_random_uuid(),public_key text not null unique default('tax_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,business_id uuid not null,policy_id uuid not null,
  period_start timestamptz not null,period_end timestamptz not null,tax_classification text not null,
  revenue numeric(14,2) not null,eligible_expenses numeric(14,2) not null,taxable_income numeric(14,2) not null,
  entity_tax numeric(14,2) not null,pass_through_tax_pool numeric(14,2) not null,status text not null default'assessed',
  assessed_at timestamptz not null default now(),paid_at timestamptz null,metadata jsonb not null default'{}'::jsonb,
  constraint business_tax_assessments_v2_business_scope_fk foreign key(game_session_id,business_id) references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_tax_assessments_v2_policy_scope_fk foreign key(game_session_id,policy_id) references public.business_tax_policies_v2(game_session_id,id) on delete restrict,
  constraint business_tax_assessments_v2_period_check check(period_end>period_start),
  constraint business_tax_assessments_v2_classification_check check(tax_classification in('disregarded','partnership_pass_through','corporate')),
  constraint business_tax_assessments_v2_money_check check(revenue>=0 and eligible_expenses>=0 and entity_tax>=0 and pass_through_tax_pool>=0),
  constraint business_tax_assessments_v2_status_check check(status in('assessed','paid','partially_paid','loss_no_tax')),
  constraint business_tax_assessments_v2_paid_state_check check((status='paid' and paid_at is not null) or status<>'paid'),
  constraint business_tax_assessments_v2_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint business_tax_assessments_v2_unique unique(game_session_id,business_id,period_start,period_end),
  constraint business_tax_assessments_v2_scope_id_unique unique(game_session_id,id)
);
alter table public.business_tax_assessments_v2 enable row level security;
revoke all on table public.business_tax_assessments_v2 from public,anon,authenticated;
grant select,insert,update on table public.business_tax_assessments_v2 to service_role;

create table if not exists public.business_owner_tax_allocations_v2(
  id uuid primary key default gen_random_uuid(),game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  assessment_id uuid not null,business_id uuid not null,player_id uuid not null,ownership_units bigint not null,
  taxable_income_allocated numeric(14,2) not null,tax_amount numeric(14,2) not null,status text not null default'due',paid_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint business_owner_tax_allocations_v2_assessment_scope_fk foreign key(game_session_id,assessment_id) references public.business_tax_assessments_v2(game_session_id,id) on delete restrict,
  constraint business_owner_tax_allocations_v2_business_scope_fk foreign key(game_session_id,business_id) references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_owner_tax_allocations_v2_player_scope_fk foreign key(game_session_id,player_id) references public.players(game_session_id,id),
  constraint business_owner_tax_allocations_v2_units_check check(ownership_units>0),
  constraint business_owner_tax_allocations_v2_money_check check(taxable_income_allocated>=0 and tax_amount>=0),
  constraint business_owner_tax_allocations_v2_status_check check(status in('due','paid')),
  constraint business_owner_tax_allocations_v2_paid_check check((status='paid' and paid_at is not null) or(status='due' and paid_at is null)),
  constraint business_owner_tax_allocations_v2_unique unique(game_session_id,assessment_id,player_id)
);
alter table public.business_owner_tax_allocations_v2 enable row level security;
revoke all on table public.business_owner_tax_allocations_v2 from public,anon,authenticated;
grant select,insert,update on table public.business_owner_tax_allocations_v2 to service_role;

create or replace function public.assess_business_tax_v2(
  p_game_session_id uuid,p_business_id uuid,p_period_start timestamptz,p_period_end timestamptz
)
returns text language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_policy public.business_tax_policies_v2%rowtype; v_fin jsonb; v_revenue numeric; v_expenses numeric; v_taxable numeric; v_entity_tax numeric:=0; v_pass_tax numeric:=0; v_assessment public.business_tax_assessments_v2%rowtype; v_total_units bigint; v_owner record; v_income numeric; v_tax numeric;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and id=p_business_id and status<>'closed';
  if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  select * into v_assessment from public.business_tax_assessments_v2 where game_session_id=p_game_session_id and business_id=p_business_id and period_start=p_period_start and period_end=p_period_end;
  if found then return v_assessment.public_key; end if;
  v_policy:=public.business_tax_policy_for_date_v2(p_game_session_id,v_business.country_code,(p_period_end-interval'1 second')::date);
  v_fin:=public.business_period_financials_v2(p_game_session_id,p_business_id,p_period_start,p_period_end);
  v_revenue:=(v_fin->>'revenue')::numeric;
  v_expenses:=(v_fin->>'cogsAndInputs')::numeric+(v_fin->>'wages')::numeric+(v_fin->>'maintenance')::numeric+(v_fin->>'research')::numeric+(v_fin->>'eligibleInterest')::numeric+(v_fin->>'otherEligibleOperatingExpenses')::numeric;
  v_taxable:=round(v_revenue-v_expenses,2);
  if v_taxable>0 then
    if v_business.tax_classification='corporate' then
      v_entity_tax:=round(v_taxable*greatest(0,v_policy.corporate_income_tax_basis_points-v_policy.small_business_relief_basis_points)/10000.0,2);
    else
      v_pass_tax:=round(v_taxable*greatest(0,v_policy.pass_through_income_tax_basis_points-v_policy.small_business_relief_basis_points)/10000.0,2);
    end if;
  end if;
  insert into public.business_tax_assessments_v2(game_session_id,business_id,policy_id,period_start,period_end,tax_classification,revenue,eligible_expenses,taxable_income,entity_tax,pass_through_tax_pool,status,metadata)
  values(p_game_session_id,p_business_id,v_policy.id,p_period_start,p_period_end,v_business.tax_classification,v_revenue,v_expenses,v_taxable,v_entity_tax,v_pass_tax,
    case when v_taxable<=0 then'loss_no_tax' else'assessed' end,v_fin) returning * into v_assessment;
  if v_entity_tax>0 then
    if public.read_business_balance_v2(p_game_session_id,p_business_id,v_business.currency_code)>=v_entity_tax then
      perform public.record_business_ledger_entry_v2(p_game_session_id,p_business_id,-v_entity_tax,v_business.currency_code,'debit','business','entity_tax',v_assessment.id,'system',null,jsonb_build_object('assessment_key',v_assessment.public_key));
      update public.business_tax_assessments_v2 set status='paid',paid_at=now() where id=v_assessment.id;
    end if;
  elsif v_pass_tax>0 then
    select coalesce(sum(units),0) into v_total_units from public.business_ownership_positions where game_session_id=p_game_session_id and business_id=p_business_id and status='active';
    for v_owner in select player_id,units from public.business_ownership_positions where game_session_id=p_game_session_id and business_id=p_business_id and status='active' order by player_id loop
      v_income:=round(v_taxable*v_owner.units/v_total_units,2); v_tax:=round(v_pass_tax*v_owner.units/v_total_units,2);
      insert into public.business_owner_tax_allocations_v2(game_session_id,assessment_id,business_id,player_id,ownership_units,taxable_income_allocated,tax_amount,status)
      values(p_game_session_id,v_assessment.id,p_business_id,v_owner.player_id,v_owner.units,v_income,v_tax,'due');
    end loop;
  end if;
  insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
  values(p_game_session_id,p_business_id,'system','business.tax.assessed',v_assessment.id,'tax_assessed',jsonb_build_object('assessmentKey',v_assessment.public_key,'taxableIncome',v_taxable,'entityTax',v_entity_tax,'passThroughTax',v_pass_tax));
  return v_assessment.public_key;
end
$function$;

create or replace function public.pay_business_owner_tax_v2(p_game_session_id uuid,p_player_id uuid,p_allocation_id uuid,p_idempotency_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_allocation public.business_owner_tax_allocations_v2%rowtype; v_business public.business_entities%rowtype; v_balance numeric;
begin
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  select * into v_allocation from public.business_owner_tax_allocations_v2 where game_session_id=p_game_session_id and id=p_allocation_id and player_id=p_player_id for update;
  if not found then raise exception 'BUSINESS_OWNER_TAX_NOT_FOUND' using errcode='P0001'; end if;
  if v_allocation.status='paid' then return true; end if;
  select * into v_business from public.business_entities where id=v_allocation.business_id;
  select balance into v_balance from public.account_balances where game_session_id=p_game_session_id and player_id=p_player_id and account_type='checking' and currency_code=v_business.currency_code for update;
  if coalesce(v_balance,0)<v_allocation.tax_amount then raise exception 'BUSINESS_OWNER_TAX_INSUFFICIENT_FUNDS' using errcode='P0001'; end if;
  perform public.record_player_ledger_entry(p_game_session_id,p_player_id,'checking',-v_allocation.tax_amount,v_business.currency_code,'debit','business','pass_through_tax',v_allocation.id,'player',p_player_id,jsonb_build_object('allocation_id',v_allocation.id,'idempotency_key',p_idempotency_key));
  update public.business_owner_tax_allocations_v2 set status='paid',paid_at=now() where id=v_allocation.id;
  return true;
end
$function$;

-- ---------------------------------------------------------------------------
-- Explainable valuation
-- ---------------------------------------------------------------------------

create table if not exists public.business_valuation_snapshots_v2(
  id uuid primary key default gen_random_uuid(),public_key text not null unique default('val_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,business_id uuid not null,as_of timestamptz not null,
  valuation numeric(14,2) not null,change_amount numeric(14,2) not null default 0,breakdown jsonb not null,reasons jsonb not null default'[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint business_valuation_snapshots_v2_business_scope_fk foreign key(game_session_id,business_id) references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_valuation_snapshots_v2_value_check check(valuation>=0),
  constraint business_valuation_snapshots_v2_breakdown_check check(jsonb_typeof(breakdown)='object'),
  constraint business_valuation_snapshots_v2_reasons_check check(jsonb_typeof(reasons)='array'),
  constraint business_valuation_snapshots_v2_unique unique(game_session_id,business_id,as_of),
  constraint business_valuation_snapshots_v2_scope_id_unique unique(game_session_id,id)
);
create index if not exists business_valuation_snapshots_v2_business_idx on public.business_valuation_snapshots_v2(game_session_id,business_id,as_of desc);
alter table public.business_valuation_snapshots_v2 enable row level security;
revoke all on table public.business_valuation_snapshots_v2 from public,anon,authenticated;
grant select,insert on table public.business_valuation_snapshots_v2 to service_role;

create or replace function public.business_outstanding_debt_v2(p_game_session_id uuid,p_business_id uuid)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_total numeric;
begin
  select coalesce(sum(greatest(0,coalesce(
    nullif(to_jsonb(loan_row)->>'remaining_balance','')::numeric,
    nullif(to_jsonb(loan_row)->>'outstanding_balance','')::numeric,
    nullif(to_jsonb(loan_row)->>'balance','')::numeric,
    nullif(to_jsonb(loan_row)->>'principal_remaining','')::numeric,
    nullif(to_jsonb(loan_row)->>'principal_amount','')::numeric,
    0
  ))),0) into v_total
  from public.player_loans as loan_row
  where loan_row.game_session_id=p_game_session_id and loan_row.business_id=p_business_id and loan_row.status in('active','delinquent','defaulted','restructured');
  return round(v_total,2);
end
$function$;

create or replace function public.calculate_business_valuation_v2(p_game_session_id uuid,p_business_id uuid,p_as_of timestamptz default now())
returns text language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_fin jsonb; v_cash numeric; v_profit numeric; v_revenue numeric; v_debt numeric; v_inventory numeric:=0; v_equipment numeric:=0; v_capability numeric:=0; v_rep numeric; v_rep_mult numeric; v_macro numeric; v_earnings_multiple numeric:=3; v_policy jsonb; v_base numeric; v_value numeric; v_previous numeric:=0; v_change numeric; v_reasons jsonb:='[]'::jsonb; v_snapshot public.business_valuation_snapshots_v2%rowtype;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and id=p_business_id and status<>'closed'; if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  v_fin:=public.business_period_financials_v2(p_game_session_id,p_business_id,p_as_of-interval'30 days',p_as_of); v_profit:=(v_fin->>'operatingProfit')::numeric; v_revenue:=(v_fin->>'revenue')::numeric;
  v_cash:=public.read_business_balance_v2(p_game_session_id,p_business_id,v_business.currency_code); v_debt:=public.business_outstanding_debt_v2(p_game_session_id,p_business_id);
  select coalesce(sum(public.business_derived_finished_availability_v2(p_game_session_id,p_business_id,profile_row.game_item_id)*profile_row.reference_price*0.40),0) into v_inventory
  from public.business_market_product_profiles_v2 as profile_row where profile_row.game_session_id=p_game_session_id and profile_row.status='active';
  select coalesce(sum(coalesce((profile_row.metadata->>'replacementValue')::numeric,supplier_price.normal_price,0)*public.business_equipment_effective_condition_v2(asset_row.id,p_as_of)/100.0*0.60),0)
  into v_equipment
  from public.business_equipment_assets as asset_row join public.business_equipment_profiles as profile_row on profile_row.id=asset_row.equipment_profile_id
  left join lateral(select min(normal_unit_price) normal_price from public.business_wholesale_supplier_items where game_session_id=p_game_session_id and game_item_id=profile_row.game_item_id) supplier_price on true
  where asset_row.game_session_id=p_game_session_id and asset_row.business_id=p_business_id and asset_row.status<>'retired';
  select coalesce(sum(recipe_row.research_fee*0.35),0) into v_capability from public.business_recipe_unlocks as unlock_row join public.business_recipe_definitions as recipe_row on recipe_row.id=unlock_row.recipe_id
  where unlock_row.game_session_id=p_game_session_id and unlock_row.business_id=p_business_id and recipe_row.is_starter=false;
  v_rep:=public.business_reputation_score_v2(p_game_session_id,p_business_id); v_rep_mult:=0.75+v_rep/200.0;
  v_policy:=public.business_demand_policy_v2(p_game_session_id); v_macro:=least(1.30,greatest(0.70,(v_policy->>'consumerDemandMultiplier')::numeric));
  select coalesce((business_market_window->'valuation'->>'earningsMultiple')::numeric,3) into v_earnings_multiple from public.game_settings where game_session_id=p_game_session_id;
  v_earnings_multiple:=least(8,greatest(1,coalesce(v_earnings_multiple,3)));
  v_base:=greatest(0,v_cash+v_inventory+v_equipment+v_capability+greatest(0,v_profit)*v_earnings_multiple-v_debt);
  v_value:=round(v_base*v_rep_mult*v_macro,2);
  select valuation into v_previous from public.business_valuation_snapshots_v2 where game_session_id=p_game_session_id and business_id=p_business_id order by as_of desc limit 1;
  v_change:=round(v_value-coalesce(v_previous,0),2);
  if v_profit>0 then v_reasons:=v_reasons||jsonb_build_array('Strong recent profitability'); elsif v_profit<0 then v_reasons:=v_reasons||jsonb_build_array('Recent operating losses'); end if;
  if v_capability>0 then v_reasons:=v_reasons||jsonb_build_array('Unlocked productive capability'); end if;
  if v_debt>0 then v_reasons:=v_reasons||jsonb_build_array('Outstanding debt reduces equity value'); end if;
  if v_rep>=65 then v_reasons:=v_reasons||jsonb_build_array('Strong operating reputation'); elsif v_rep<40 then v_reasons:=v_reasons||jsonb_build_array('Weak operating reputation'); end if;
  if v_macro<0.95 then v_reasons:=v_reasons||jsonb_build_array('Recessionary demand outlook'); elsif v_macro>1.05 then v_reasons:=v_reasons||jsonb_build_array('Expansionary demand outlook'); end if;
  insert into public.business_valuation_snapshots_v2(game_session_id,business_id,as_of,valuation,change_amount,breakdown,reasons)
  values(p_game_session_id,p_business_id,p_as_of,v_value,v_change,jsonb_build_object('cash',v_cash,'recentRevenue',v_revenue,'recentOperatingProfit',v_profit,'earningsMultiple',v_earnings_multiple,'finishedInventoryValue',round(v_inventory,2),'equipmentValue',round(v_equipment,2),'capabilityValue',round(v_capability,2),'debt',v_debt,'reputationScore',v_rep,'reputationMultiplier',v_rep_mult,'macroMultiplier',v_macro),v_reasons)
  returning * into v_snapshot;
  update public.business_entities set valuation=v_value,version=version+1 where id=p_business_id;
  return v_snapshot.public_key;
end
$function$;

create or replace function public.business_corporate_share_value_v2(p_game_session_id uuid,p_business_id uuid)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_shares bigint;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and id=p_business_id and entity_type='c_corporation'; if not found then raise exception 'CORPORATION_NOT_FOUND' using errcode='P0001'; end if;
  select outstanding_shares into v_shares from public.business_corporate_share_structures where game_session_id=p_game_session_id and business_id=p_business_id;
  if coalesce(v_shares,0)<=0 then raise exception 'CORPORATION_OUTSTANDING_SHARES_INVALID' using errcode='P0001'; end if;
  return round(v_business.valuation/v_shares,4);
end
$function$;

-- ---------------------------------------------------------------------------
-- Distress state machine
-- ---------------------------------------------------------------------------

alter table public.business_entities add column if not exists financial_health_state text not null default'healthy';
alter table public.business_entities add column if not exists distress_started_at timestamptz null;
alter table public.business_entities drop constraint if exists business_entities_financial_health_state_check;
alter table public.business_entities add constraint business_entities_financial_health_state_check check(financial_health_state in('healthy','cash_warning','distressed','insolvent','restructuring','liquidating'));

create table if not exists public.business_distress_events_v2(
  id uuid primary key default gen_random_uuid(),game_session_id uuid not null references public.game_sessions(id) on delete cascade,business_id uuid not null,
  prior_state text not null,new_state text not null,cash numeric(14,2) not null,protected_obligations numeric(14,2) not null,outstanding_debt numeric(14,2) not null,reason_code text not null,created_at timestamptz not null default now(),
  constraint business_distress_events_v2_business_scope_fk foreign key(game_session_id,business_id) references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_distress_events_v2_state_check check(prior_state in('healthy','cash_warning','distressed','insolvent','restructuring','liquidating') and new_state in('healthy','cash_warning','distressed','insolvent','restructuring','liquidating')),
  constraint business_distress_events_v2_money_check check(cash>=0 and protected_obligations>=0 and outstanding_debt>=0)
);
alter table public.business_distress_events_v2 enable row level security;
revoke all on table public.business_distress_events_v2 from public,anon,authenticated;
grant select,insert on table public.business_distress_events_v2 to service_role;

create or replace function public.evaluate_business_financial_health_v2(p_game_session_id uuid,p_business_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_cash numeric; v_protected numeric; v_debt numeric; v_missed integer; v_defaulted boolean; v_new text; v_old text;
begin
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and id=p_business_id and status<>'closed' for update; if not found then raise exception 'BUSINESS_NOT_FOUND' using errcode='P0001'; end if;
  v_cash:=public.read_business_balance_v2(p_game_session_id,p_business_id,v_business.currency_code); v_protected:=public.business_protected_obligations_v2(p_game_session_id,p_business_id); v_debt:=public.business_outstanding_debt_v2(p_game_session_id,p_business_id);
  select coalesce(sum(missed_payroll_cycles),0) into v_missed from public.business_employments_v2 where game_session_id=p_game_session_id and business_id=p_business_id and status in('active','unpaid');
  select exists(select 1 from public.player_loans where game_session_id=p_game_session_id and business_id=p_business_id and status='defaulted') into v_defaulted;
  v_old:=v_business.financial_health_state;
  v_new:=case
    when v_business.formation_state='winding_up' then'liquidating'
    when v_defaulted or v_missed>=2 or(v_cash<=0 and(v_protected>0 or v_debt>0)) then'insolvent'
    when v_cash<v_protected and v_protected>0 then'distressed'
    when v_cash<2*v_protected and v_protected>0 then'cash_warning'
    else'healthy' end;
  if v_new<>v_old then
    update public.business_entities set financial_health_state=v_new,distress_started_at=case when v_new in('distressed','insolvent') then coalesce(distress_started_at,now()) else null end,version=version+1 where id=p_business_id;
    insert into public.business_distress_events_v2(game_session_id,business_id,prior_state,new_state,cash,protected_obligations,outstanding_debt,reason_code)
    values(p_game_session_id,p_business_id,v_old,v_new,v_cash,v_protected,v_debt,case when v_new='insolvent' then'protected_obligations_unpayable' when v_new='distressed' then'cash_below_protected_obligations' when v_new='cash_warning' then'cash_buffer_low' else'financial_health_recovered' end);
    insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
    values(p_game_session_id,p_business_id,'system','business.financial_health.changed',null,'financial_health_changed',jsonb_build_object('priorState',v_old,'newState',v_new,'cash',v_cash,'protectedObligations',v_protected,'outstandingDebt',v_debt));
  end if;
  return v_new;
end
$function$;

create or replace function public.evaluate_business_financial_health_batch_v2(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row record; v_count integer:=0;
begin
  for v_row in select game_session_id,id from public.business_entities where status<>'closed' and formation_state in('operational','winding_up') order by updated_at,id limit least(5000,greatest(1,coalesce(p_limit,500)))
  loop perform public.evaluate_business_financial_health_v2(v_row.game_session_id,v_row.id); v_count:=v_count+1; end loop;
  return v_count;
end
$function$;

-- Forced liquidation starts only after a sustained insolvent condition. It does
-- not invent a fake owner vote. Residual distributions remain prohibited until
-- canonical debt/contract obligations are actually cleared.
alter table public.business_liquidations alter column proposal_id drop not null;

create or replace function public.begin_forced_business_liquidations_v2(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_count integer:=0;
begin
  for v_business in select * from public.business_entities where status<>'closed' and formation_state='operational' and financial_health_state='insolvent' and distress_started_at<=now()-interval'7 days'
    order by distress_started_at,id limit least(1000,greatest(1,coalesce(p_limit,100))) for update skip locked
  loop
    if not exists(select 1 from public.business_liquidations where game_session_id=v_business.game_session_id and business_id=v_business.id and status<>'completed') then
      insert into public.business_liquidations(game_session_id,proposal_id,business_id,liquidation_type,status,metadata)
      values(v_business.game_session_id,null,v_business.id,'forced','approved_to_wind_up',jsonb_build_object('cashAtStart',public.read_business_balance_v2(v_business.game_session_id,v_business.id,v_business.currency_code),'outstandingDebtAtStart',public.business_outstanding_debt_v2(v_business.game_session_id,v_business.id)));
      update public.business_entities set formation_state='winding_up',status='restructuring',financial_health_state='liquidating',version=version+1 where id=v_business.id;
      insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,reason_code,metadata)
      values(v_business.game_session_id,v_business.id,'system','business.liquidation.forced', 'sustained_insolvency',jsonb_build_object('distressStartedAt',v_business.distress_started_at));
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end
$function$;

revoke all on function public.business_tax_policy_for_date_v2(uuid,text,date) from public,anon,authenticated; grant execute on function public.business_tax_policy_for_date_v2(uuid,text,date) to service_role;
revoke all on function public.business_ledger_action_total_v2(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated; grant execute on function public.business_ledger_action_total_v2(uuid,uuid,text,timestamptz,timestamptz) to service_role;
revoke all on function public.business_period_financials_v2(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated; grant execute on function public.business_period_financials_v2(uuid,uuid,timestamptz,timestamptz) to service_role;
revoke all on function public.assess_business_tax_v2(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated; grant execute on function public.assess_business_tax_v2(uuid,uuid,timestamptz,timestamptz) to service_role;
revoke all on function public.pay_business_owner_tax_v2(uuid,uuid,uuid,text) from public,anon,authenticated; grant execute on function public.pay_business_owner_tax_v2(uuid,uuid,uuid,text) to service_role;
revoke all on function public.business_outstanding_debt_v2(uuid,uuid) from public,anon,authenticated; grant execute on function public.business_outstanding_debt_v2(uuid,uuid) to service_role;
revoke all on function public.calculate_business_valuation_v2(uuid,uuid,timestamptz) from public,anon,authenticated; grant execute on function public.calculate_business_valuation_v2(uuid,uuid,timestamptz) to service_role;
revoke all on function public.business_corporate_share_value_v2(uuid,uuid) from public,anon,authenticated; grant execute on function public.business_corporate_share_value_v2(uuid,uuid) to service_role;
revoke all on function public.evaluate_business_financial_health_v2(uuid,uuid) from public,anon,authenticated; grant execute on function public.evaluate_business_financial_health_v2(uuid,uuid) to service_role;
revoke all on function public.evaluate_business_financial_health_batch_v2(integer) from public,anon,authenticated; grant execute on function public.evaluate_business_financial_health_batch_v2(integer) to service_role;
revoke all on function public.begin_forced_business_liquidations_v2(integer) from public,anon,authenticated; grant execute on function public.begin_forced_business_liquidations_v2(integer) to service_role;

commit;
