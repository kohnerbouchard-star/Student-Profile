-- Business demand, competition, sales and reputation V2.
--
-- Players choose a bounded selling price. Econovaria calculates demand and
-- competition, consumes actual canonical finished inventory, and only then
-- credits Business cash. Reputation is explainable and event-derived.

begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create table if not exists public.business_market_product_profiles_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('mpp_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  game_item_id uuid not null,
  substitution_group text not null,
  base_daily_demand integer not null,
  reference_price numeric(14,2) not null,
  price_elasticity numeric(10,4) not null default 1,
  cycle_sensitivity numeric(10,4) not null default 1,
  scarcity_sensitivity numeric(10,4) not null default 0.25,
  minimum_price_multiple numeric(10,4) not null default 0.30,
  maximum_price_multiple numeric(10,4) not null default 3.00,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_market_product_profiles_v2_public_key_check check(public_key~'^mpp_[0-9a-f]{32}$'),
  constraint business_market_product_profiles_v2_item_scope_fk foreign key(game_session_id,game_item_id)
    references public.game_items(game_session_id,id) on delete restrict,
  constraint business_market_product_profiles_v2_group_check check(substitution_group~'^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_market_product_profiles_v2_demand_check check(base_daily_demand between 0 and 1000000),
  constraint business_market_product_profiles_v2_reference_price_check check(reference_price>0 and reference_price<=10000000),
  constraint business_market_product_profiles_v2_elasticity_check check(price_elasticity between 0.05 and 5),
  constraint business_market_product_profiles_v2_cycle_check check(cycle_sensitivity between 0 and 3),
  constraint business_market_product_profiles_v2_scarcity_check check(scarcity_sensitivity between 0 and 3),
  constraint business_market_product_profiles_v2_price_multiple_check check(
    minimum_price_multiple between 0.05 and 1 and maximum_price_multiple between 1 and 10 and minimum_price_multiple<maximum_price_multiple
  ),
  constraint business_market_product_profiles_v2_status_check check(status in('active','disabled','retired')),
  constraint business_market_product_profiles_v2_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint business_market_product_profiles_v2_item_unique unique(game_session_id,game_item_id),
  constraint business_market_product_profiles_v2_scope_id_unique unique(game_session_id,id)
);

create trigger set_business_market_product_profiles_v2_updated_at
before update on public.business_market_product_profiles_v2
for each row execute function public.set_current_timestamp_updated_at();
alter table public.business_market_product_profiles_v2 enable row level security;
revoke all on table public.business_market_product_profiles_v2 from public,anon,authenticated;
grant select,insert,update on table public.business_market_product_profiles_v2 to service_role;

create or replace function public.guard_business_market_product_profile_v2()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_item public.game_items%rowtype;
begin
  select * into v_item from public.game_items where game_session_id=new.game_session_id and id=new.game_item_id and status='active';
  if not found then raise exception 'BUSINESS_MARKET_CANONICAL_ITEM_REQUIRED' using errcode='P0001'; end if;
  if v_item.source_kind='business_product' then raise exception 'BUSINESS_MARKET_PLAYER_AUTHORED_ITEM_PROHIBITED' using errcode='P0001'; end if;
  return new;
end
$function$;
drop trigger if exists guard_business_market_product_profile on public.business_market_product_profiles_v2;
create trigger guard_business_market_product_profile before insert or update of game_session_id,game_item_id
on public.business_market_product_profiles_v2 for each row execute function public.guard_business_market_product_profile_v2();

create table if not exists public.business_sales_prices_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bsp_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  market_profile_id uuid not null,
  game_item_id uuid not null,
  selling_price numeric(14,2) not null,
  version bigint not null default 1,
  status text not null default 'active',
  set_by_player_id uuid not null,
  last_price_change_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_sales_prices_v2_public_key_check check(public_key~'^bsp_[0-9a-f]{32}$'),
  constraint business_sales_prices_v2_business_scope_fk foreign key(game_session_id,business_id)
    references public.business_entities(game_session_id,id) on delete cascade,
  constraint business_sales_prices_v2_profile_scope_fk foreign key(game_session_id,market_profile_id)
    references public.business_market_product_profiles_v2(game_session_id,id) on delete restrict,
  constraint business_sales_prices_v2_item_scope_fk foreign key(game_session_id,game_item_id)
    references public.game_items(game_session_id,id) on delete restrict,
  constraint business_sales_prices_v2_player_scope_fk foreign key(game_session_id,set_by_player_id)
    references public.players(game_session_id,id),
  constraint business_sales_prices_v2_price_check check(selling_price>0),
  constraint business_sales_prices_v2_version_check check(version>0),
  constraint business_sales_prices_v2_status_check check(status in('active','paused')),
  constraint business_sales_prices_v2_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint business_sales_prices_v2_unique unique(game_session_id,business_id,game_item_id),
  constraint business_sales_prices_v2_scope_id_unique unique(game_session_id,id)
);

create index if not exists business_sales_prices_v2_market_idx
on public.business_sales_prices_v2(game_session_id,market_profile_id,status,selling_price);
create trigger set_business_sales_prices_v2_updated_at before update on public.business_sales_prices_v2
for each row execute function public.set_current_timestamp_updated_at();
alter table public.business_sales_prices_v2 enable row level security;
revoke all on table public.business_sales_prices_v2 from public,anon,authenticated;
grant select,insert,update on table public.business_sales_prices_v2 to service_role;

create table if not exists public.business_reputation_events_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('rep_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  delta numeric(10,4) not null,
  reason_code text not null,
  source_type text not null,
  source_id uuid null,
  explanation text not null,
  created_at timestamptz not null default now(),
  constraint business_reputation_events_v2_public_key_check check(public_key~'^rep_[0-9a-f]{32}$'),
  constraint business_reputation_events_v2_business_scope_fk foreign key(game_session_id,business_id)
    references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_reputation_events_v2_delta_check check(delta between -25 and 25 and delta<>0),
  constraint business_reputation_events_v2_reason_check check(reason_code~'^[a-z0-9][a-z0-9._-]{0,119}$'),
  constraint business_reputation_events_v2_source_check check(source_type in('sales','contract','operations','payroll','system')),
  constraint business_reputation_events_v2_explanation_check check(length(btrim(explanation)) between 2 and 500),
  constraint business_reputation_events_v2_scope_id_unique unique(game_session_id,id)
);
create index if not exists business_reputation_events_v2_business_idx
on public.business_reputation_events_v2(game_session_id,business_id,created_at desc);
alter table public.business_reputation_events_v2 enable row level security;
revoke all on table public.business_reputation_events_v2 from public,anon,authenticated;
grant select,insert on table public.business_reputation_events_v2 to service_role;

create or replace function public.business_reputation_score_v2(p_game_session_id uuid,p_business_id uuid)
returns numeric language sql stable security definer set search_path=public,pg_temp as $function$
  select least(100,greatest(0,50+coalesce(sum(delta),0)))
  from public.business_reputation_events_v2
  where game_session_id=p_game_session_id and business_id=p_business_id
$function$;

create or replace function public.record_business_reputation_event_v2(
  p_game_session_id uuid,p_business_id uuid,p_delta numeric,p_reason_code text,p_source_type text,p_source_id uuid,p_explanation text
)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_score numeric;
begin
  if p_delta=0 or p_delta not between -25 and 25 then raise exception 'BUSINESS_REPUTATION_DELTA_INVALID' using errcode='P0001'; end if;
  insert into public.business_reputation_events_v2(game_session_id,business_id,delta,reason_code,source_type,source_id,explanation)
  values(p_game_session_id,p_business_id,p_delta,lower(btrim(p_reason_code)),lower(btrim(p_source_type)),p_source_id,btrim(p_explanation));
  v_score:=public.business_reputation_score_v2(p_game_session_id,p_business_id);
  update public.business_entities set reputation=round(v_score)::integer,version=version+1 where game_session_id=p_game_session_id and id=p_business_id;
  return v_score;
end
$function$;

create or replace function public.business_demand_policy_v2(p_game_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v jsonb:='{}'::jsonb;
begin
  select coalesce(business_market_window->'demand','{}'::jsonb) into v from public.game_settings where game_session_id=p_game_session_id;
  return jsonb_build_object(
    'consumerDemandMultiplier',case when coalesce(v->>'consumerDemandMultiplier','')~'^\d+(\.\d+)?$' then least(2,greatest(0.4,(v->>'consumerDemandMultiplier')::numeric)) else 1 end,
    'incomeMultiplier',case when coalesce(v->>'incomeMultiplier','')~'^\d+(\.\d+)?$' then least(1.5,greatest(0.5,(v->>'incomeMultiplier')::numeric)) else 1 end,
    'scarcityMultiplier',case when coalesce(v->>'scarcityMultiplier','')~'^\d+(\.\d+)?$' then least(2,greatest(0.5,(v->>'scarcityMultiplier')::numeric)) else 1 end
  );
end
$function$;

create or replace function public.set_business_selling_price_v2(
  p_game_session_id uuid,p_player_id uuid,p_business_key text,p_item_key text,p_price numeric,p_expected_version bigint,p_idempotency_key text
)
returns table(price_key text,selling_price numeric,reference_price numeric,minimum_price numeric,maximum_price numeric,version bigint,replayed boolean)
language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_business public.business_entities%rowtype; v_item public.game_items%rowtype; v_profile public.business_market_product_profiles_v2%rowtype; v_price public.business_sales_prices_v2%rowtype; v_min numeric; v_max numeric;
begin
  if length(btrim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='P0001'; end if;
  select * into v_business from public.business_entities where game_session_id=p_game_session_id and public_key=lower(btrim(p_business_key)) and status<>'closed' and formation_state='operational';
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode='P0001'; end if;
  if not exists(select 1 from public.business_ownership_positions where game_session_id=p_game_session_id and business_id=v_business.id and player_id=p_player_id and status='active') then raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode='P0001'; end if;
  select * into v_item from public.game_items where game_session_id=p_game_session_id and public_key=lower(btrim(p_item_key)) and status='active';
  if not found or v_item.source_kind='business_product' then raise exception 'BUSINESS_MARKET_CANONICAL_ITEM_REQUIRED' using errcode='P0001'; end if;
  select * into v_profile from public.business_market_product_profiles_v2 where game_session_id=p_game_session_id and game_item_id=v_item.id and status='active';
  if not found then raise exception 'BUSINESS_MARKET_PROFILE_REQUIRED' using errcode='P0001'; end if;
  if not exists(select 1 from public.business_recipe_unlocks where game_session_id=p_game_session_id and business_id=v_business.id and recipe_id in(select id from public.business_recipe_definitions where game_session_id=p_game_session_id and output_game_item_id=v_item.id)) then raise exception 'BUSINESS_RECIPE_UNLOCK_REQUIRED' using errcode='P0001'; end if;
  v_min:=round(v_profile.reference_price*v_profile.minimum_price_multiple,2); v_max:=round(v_profile.reference_price*v_profile.maximum_price_multiple,2);
  if p_price<v_min or p_price>v_max then raise exception 'BUSINESS_SELLING_PRICE_OUT_OF_BOUNDS' using errcode='P0001'; end if;
  if exists(select 1 from public.audit_log where game_session_id=p_game_session_id and actor_id=p_player_id and action='business.sales.price' and metadata->>'idempotency_key'=p_idempotency_key) then
    select * into v_price from public.business_sales_prices_v2 where game_session_id=p_game_session_id and business_id=v_business.id and game_item_id=v_item.id;
    return query select v_price.public_key,v_price.selling_price,v_profile.reference_price,v_min,v_max,v_price.version,true; return;
  end if;
  select * into v_price from public.business_sales_prices_v2 where game_session_id=p_game_session_id and business_id=v_business.id and game_item_id=v_item.id for update;
  if found and p_expected_version is not null and v_price.version<>p_expected_version then raise exception 'BUSINESS_PRICE_VERSION_CONFLICT' using errcode='P0001'; end if;
  insert into public.business_sales_prices_v2(game_session_id,business_id,market_profile_id,game_item_id,selling_price,version,status,set_by_player_id,last_price_change_at)
  values(p_game_session_id,v_business.id,v_profile.id,v_item.id,round(p_price,2),1,'active',p_player_id,now())
  on conflict(game_session_id,business_id,game_item_id) do update set selling_price=excluded.selling_price,version=public.business_sales_prices_v2.version+1,status='active',set_by_player_id=p_player_id,last_price_change_at=now()
  returning * into v_price;
  insert into public.audit_log(game_session_id,actor_type,actor_id,action,target_type,target_id,metadata)
  values(p_game_session_id,'player',p_player_id,'business.sales.price','business_sales_price',v_price.id,jsonb_build_object('idempotency_key',p_idempotency_key,'price',v_price.selling_price));
  return query select v_price.public_key,v_price.selling_price,v_profile.reference_price,v_min,v_max,v_price.version,false;
end
$function$;

create or replace function public.business_price_response_v2(p_reference_price numeric,p_selling_price numeric,p_elasticity numeric)
returns numeric language sql immutable strict set search_path=public,pg_temp as $function$
  select least(2.5,greatest(0.10,power(p_reference_price/p_selling_price,p_elasticity)))
$function$;

create or replace function public.business_sales_attractiveness_v2(p_game_session_id uuid,p_business_id uuid,p_profile_id uuid,p_selling_price numeric)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_profile public.business_market_product_profiles_v2%rowtype; v_rep numeric; v_price numeric; v_sales numeric;
begin
  select * into v_profile from public.business_market_product_profiles_v2 where id=p_profile_id;
  v_rep:=public.business_reputation_score_v2(p_game_session_id,p_business_id);
  v_price:=public.business_price_response_v2(v_profile.reference_price,p_selling_price,v_profile.price_elasticity);
  v_sales:=public.business_sales_workforce_multiplier_v2(p_game_session_id,p_business_id);
  return greatest(0.01,v_price*(0.75+v_rep/200.0)*v_sales);
end
$function$;

create or replace function public.business_realized_demand_v2(p_price_id uuid,p_settlement_date date)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_price public.business_sales_prices_v2%rowtype; v_profile public.business_market_product_profiles_v2%rowtype; v_policy jsonb; v_attract numeric; v_total numeric; v_share numeric; v_cycle numeric; v_rep numeric; v_demand numeric;
begin
  select * into v_price from public.business_sales_prices_v2 where id=p_price_id and status='active';
  if not found then return 0; end if;
  select * into v_profile from public.business_market_product_profiles_v2 where id=v_price.market_profile_id and status='active';
  if not found then return 0; end if;
  v_policy:=public.business_demand_policy_v2(v_price.game_session_id);
  v_attract:=public.business_sales_attractiveness_v2(v_price.game_session_id,v_price.business_id,v_profile.id,v_price.selling_price);
  select coalesce(sum(public.business_sales_attractiveness_v2(price_row.game_session_id,price_row.business_id,price_row.market_profile_id,price_row.selling_price)),0)
  into v_total from public.business_sales_prices_v2 as price_row join public.business_market_product_profiles_v2 as profile_row on profile_row.id=price_row.market_profile_id
  where price_row.game_session_id=v_price.game_session_id and price_row.status='active' and profile_row.status='active' and profile_row.substitution_group=v_profile.substitution_group;
  v_share:=case when v_total<=0 then 1 else v_attract/v_total end;
  v_cycle:=power((v_policy->>'consumerDemandMultiplier')::numeric,v_profile.cycle_sensitivity)*(v_policy->>'incomeMultiplier')::numeric;
  v_rep:=0.75+public.business_reputation_score_v2(v_price.game_session_id,v_price.business_id)/200.0;
  v_demand:=v_profile.base_daily_demand*v_cycle*v_share*v_rep*public.business_sales_workforce_multiplier_v2(v_price.game_session_id,v_price.business_id);
  return greatest(0,floor(v_demand)::integer);
end
$function$;

create table if not exists public.business_sales_settlements_v2 (
  id uuid primary key default gen_random_uuid(),public_key text not null unique default('sal_'||encode(gen_random_bytes(16),'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,business_id uuid not null,price_id uuid not null,game_item_id uuid not null,
  settlement_date date not null,demand_units integer not null,available_units integer not null,units_sold integer not null,selling_price numeric(14,2) not null,revenue numeric(14,2) not null,
  inventory_transaction_id uuid null,created_at timestamptz not null default now(),metadata jsonb not null default'{}'::jsonb,
  constraint business_sales_settlements_v2_public_key_check check(public_key~'^sal_[0-9a-f]{32}$'),
  constraint business_sales_settlements_v2_business_scope_fk foreign key(game_session_id,business_id) references public.business_entities(game_session_id,id) on delete restrict,
  constraint business_sales_settlements_v2_price_scope_fk foreign key(game_session_id,price_id) references public.business_sales_prices_v2(game_session_id,id) on delete restrict,
  constraint business_sales_settlements_v2_item_scope_fk foreign key(game_session_id,game_item_id) references public.game_items(game_session_id,id) on delete restrict,
  constraint business_sales_settlements_v2_units_check check(demand_units>=0 and available_units>=0 and units_sold>=0 and units_sold<=demand_units and units_sold<=available_units),
  constraint business_sales_settlements_v2_money_check check(selling_price>0 and revenue=round(selling_price*units_sold,2)),
  constraint business_sales_settlements_v2_inventory_check check((units_sold=0 and inventory_transaction_id is null) or(units_sold>0 and inventory_transaction_id is not null)),
  constraint business_sales_settlements_v2_metadata_check check(jsonb_typeof(metadata)='object'),
  constraint business_sales_settlements_v2_unique unique(game_session_id,business_id,game_item_id,settlement_date),
  constraint business_sales_settlements_v2_scope_id_unique unique(game_session_id,id)
);
create index if not exists business_sales_settlements_v2_business_idx on public.business_sales_settlements_v2(game_session_id,business_id,settlement_date desc);
alter table public.business_sales_settlements_v2 enable row level security;
revoke all on table public.business_sales_settlements_v2 from public,anon,authenticated;
grant select,insert on table public.business_sales_settlements_v2 to service_role;

-- Conservative derived availability: completed V2 production minus V2 sales.
-- Canonical Inventory remains the enforcement boundary at settlement, so this
-- cannot mint or oversell goods even if another domain consumed stock first.
create or replace function public.business_derived_finished_availability_v2(p_game_session_id uuid,p_business_id uuid,p_game_item_id uuid)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_produced bigint:=0; v_sold bigint:=0;
begin
  select coalesce(sum(job_row.requested_output_quantity),0) into v_produced
  from public.business_production_jobs_v2 as job_row join public.business_recipe_definitions as recipe_row on recipe_row.id=job_row.recipe_id
  where job_row.game_session_id=p_game_session_id and job_row.business_id=p_business_id and job_row.status='completed' and recipe_row.output_game_item_id=p_game_item_id;
  select coalesce(sum(units_sold),0) into v_sold from public.business_sales_settlements_v2
  where game_session_id=p_game_session_id and business_id=p_business_id and game_item_id=p_game_item_id;
  return greatest(0,least(2147483647,v_produced-v_sold))::integer;
end
$function$;

create or replace function public.settle_business_sales_v2(p_settlement_date date default current_date,p_limit integer default 500)
returns table(processed integer,settled integer,units_sold bigint,revenue numeric)
language plpgsql security definer set search_path=public,economy_private,pg_temp as $function$
declare v_limit integer:=least(5000,greatest(1,coalesce(p_limit,500))); v_price public.business_sales_prices_v2%rowtype; v_business public.business_entities%rowtype; v_demand integer; v_available integer; v_units integer; v_revenue numeric; v_finished uuid; v_tx uuid; v_processed integer:=0; v_settled integer:=0; v_total_units bigint:=0; v_total_revenue numeric:=0;
begin
  for v_price in select price_row.* from public.business_sales_prices_v2 as price_row join public.business_entities as business_row on business_row.game_session_id=price_row.game_session_id and business_row.id=price_row.business_id
    where price_row.status='active' and business_row.status<>'closed' and business_row.formation_state='operational'
      and not exists(select 1 from public.business_sales_settlements_v2 s where s.game_session_id=price_row.game_session_id and s.business_id=price_row.business_id and s.game_item_id=price_row.game_item_id and s.settlement_date=p_settlement_date)
    order by price_row.game_session_id,price_row.business_id,price_row.game_item_id limit v_limit for update of price_row skip locked
  loop
    v_processed:=v_processed+1;
    select * into v_business from public.business_entities where id=v_price.business_id;
    v_demand:=public.business_realized_demand_v2(v_price.id,p_settlement_date);
    v_available:=public.business_derived_finished_availability_v2(v_price.game_session_id,v_price.business_id,v_price.game_item_id);
    v_units:=least(v_demand,v_available);
    v_tx:=null;
    if v_units>0 then
      v_finished:=economy_private.ensure_business_inventory_account_v2(v_price.game_session_id,v_price.business_id,'finished_goods');
      begin
        select transaction_id into v_tx from economy_private.post_inventory_transaction_v2(
          p_game_session_id=>v_price.game_session_id,p_game_item_id=>v_price.game_item_id,p_from_account_id=>v_finished,p_to_account_id=>null,p_quantity=>v_units,
          p_unit_cost=>null,p_transaction_kind=>'sale',p_source_domain=>'business',p_source_action=>'market_sale',p_source_id=>v_price.id,
          p_idempotency_key=>'sales:'||v_price.public_key||':'||p_settlement_date::text,
          p_metadata=>jsonb_build_object('business_id',v_price.business_id,'settlement_date',p_settlement_date)
        );
      exception when others then
        -- Inventory is final authority. If another canonical domain consumed the
        -- stock after this conservative availability estimate, record a stockout
        -- rather than manufacturing revenue.
        v_units:=0; v_tx:=null;
      end;
    end if;
    v_revenue:=round(v_price.selling_price*v_units,2);
    if v_revenue>0 then
      perform public.record_business_ledger_entry_v2(v_price.game_session_id,v_price.business_id,v_revenue,v_business.currency_code,'credit','business','market_sale',v_price.id,'system',null,
        jsonb_build_object('price_key',v_price.public_key,'settlement_date',p_settlement_date,'units',v_units));
    end if;
    insert into public.business_sales_settlements_v2(game_session_id,business_id,price_id,game_item_id,settlement_date,demand_units,available_units,units_sold,selling_price,revenue,inventory_transaction_id,metadata)
    values(v_price.game_session_id,v_price.business_id,v_price.id,v_price.game_item_id,p_settlement_date,v_demand,v_available,v_units,v_price.selling_price,v_revenue,v_tx,
      jsonb_build_object('priceResponse',public.business_price_response_v2((select reference_price from public.business_market_product_profiles_v2 where id=v_price.market_profile_id),v_price.selling_price,(select price_elasticity from public.business_market_product_profiles_v2 where id=v_price.market_profile_id))))
    returning id into v_tx;
    if v_units>0 then
      perform public.record_business_reputation_event_v2(v_price.game_session_id,v_price.business_id,least(0.5,v_units::numeric/100),'sales_fulfilled','sales',v_tx,'Sales demand was fulfilled with available finished inventory.');
    elsif v_demand>0 then
      perform public.record_business_reputation_event_v2(v_price.game_session_id,v_price.business_id,-0.5,'sales_stockout','sales',v_tx,'Customer demand could not be fulfilled because finished inventory was unavailable.');
    end if;
    insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,source_id,reason_code,metadata)
    values(v_price.game_session_id,v_price.business_id,'system','business.sales.settled',v_tx,'market_demand_settled',jsonb_build_object('demandUnits',v_demand,'availableUnits',v_available,'unitsSold',v_units,'revenue',v_revenue));
    v_settled:=v_settled+1; v_total_units:=v_total_units+v_units; v_total_revenue:=v_total_revenue+v_revenue;
  end loop;
  return query select v_processed,v_settled,v_total_units,round(v_total_revenue,2);
end
$function$;

revoke all on function public.business_reputation_score_v2(uuid,uuid) from public,anon,authenticated; grant execute on function public.business_reputation_score_v2(uuid,uuid) to service_role;
revoke all on function public.record_business_reputation_event_v2(uuid,uuid,numeric,text,text,uuid,text) from public,anon,authenticated; grant execute on function public.record_business_reputation_event_v2(uuid,uuid,numeric,text,text,uuid,text) to service_role;
revoke all on function public.business_demand_policy_v2(uuid) from public,anon,authenticated; grant execute on function public.business_demand_policy_v2(uuid) to service_role;
revoke all on function public.set_business_selling_price_v2(uuid,uuid,text,text,numeric,bigint,text) from public,anon,authenticated; grant execute on function public.set_business_selling_price_v2(uuid,uuid,text,text,numeric,bigint,text) to service_role;
revoke all on function public.business_price_response_v2(numeric,numeric,numeric) from public,anon,authenticated; grant execute on function public.business_price_response_v2(numeric,numeric,numeric) to service_role;
revoke all on function public.business_sales_attractiveness_v2(uuid,uuid,uuid,numeric) from public,anon,authenticated; grant execute on function public.business_sales_attractiveness_v2(uuid,uuid,uuid,numeric) to service_role;
revoke all on function public.business_realized_demand_v2(uuid,date) from public,anon,authenticated; grant execute on function public.business_realized_demand_v2(uuid,date) to service_role;
revoke all on function public.business_derived_finished_availability_v2(uuid,uuid,uuid) from public,anon,authenticated; grant execute on function public.business_derived_finished_availability_v2(uuid,uuid,uuid) to service_role;
revoke all on function public.settle_business_sales_v2(date,integer) from public,anon,authenticated; grant execute on function public.settle_business_sales_v2(date,integer) to service_role;

commit;
