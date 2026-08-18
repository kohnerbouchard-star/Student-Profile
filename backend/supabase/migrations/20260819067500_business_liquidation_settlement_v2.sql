-- Creditor-first Business liquidation settlement V2.
--
-- Voluntary and forced liquidation share the same deterministic settlement:
-- assets -> cash, payroll/debt/contract obligations -> creditors, then and only
-- then residual cash -> authoritative owners. Limited-liability entities do not
-- reach into personal funds. Sole/partnership exposure is bounded by game scale.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.business_liquidation_claims_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('clm_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  liquidation_id uuid not null,
  business_id uuid not null,
  claim_type text not null,
  priority_rank integer not null,
  source_id uuid null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'due',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_liquidation_claims_v2_liquidation_scope_fk
    foreign key (game_session_id, liquidation_id)
    references public.business_liquidations(game_session_id, id) on delete cascade,
  constraint business_liquidation_claims_v2_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_liquidation_claims_v2_type_check
    check (claim_type in ('payroll', 'secured_debt', 'unsecured_debt', 'contract', 'tax', 'liquidation_cost')),
  constraint business_liquidation_claims_v2_priority_check check (priority_rank between 1 and 100),
  constraint business_liquidation_claims_v2_amount_check check (
    amount_due >= 0 and amount_paid >= 0 and amount_paid <= amount_due
  ),
  constraint business_liquidation_claims_v2_status_check check (status in ('due', 'partial', 'paid', 'unrecoverable')),
  constraint business_liquidation_claims_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_liquidation_claims_v2_scope_id_unique unique (game_session_id, id)
);

create index if not exists business_liquidation_claims_v2_priority_idx
  on public.business_liquidation_claims_v2(game_session_id, liquidation_id, status, priority_rank, created_at);

create trigger set_business_liquidation_claims_v2_updated_at
before update on public.business_liquidation_claims_v2
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_liquidation_claims_v2 enable row level security;
revoke all on table public.business_liquidation_claims_v2 from public, anon, authenticated;
grant select, insert, update on table public.business_liquidation_claims_v2 to service_role;

create table if not exists public.business_liquidation_asset_sales_v2 (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('las_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  liquidation_id uuid not null,
  business_id uuid not null,
  asset_type text not null,
  source_id uuid not null,
  game_item_id uuid null,
  quantity numeric(14,4) not null,
  unit_recovery_value numeric(14,2) not null,
  proceeds numeric(14,2) not null,
  inventory_transaction_id uuid null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint business_liquidation_asset_sales_v2_liquidation_scope_fk
    foreign key (game_session_id, liquidation_id)
    references public.business_liquidations(game_session_id, id) on delete cascade,
  constraint business_liquidation_asset_sales_v2_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_liquidation_asset_sales_v2_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_liquidation_asset_sales_v2_type_check check (asset_type in ('inventory', 'equipment')),
  constraint business_liquidation_asset_sales_v2_quantity_check check (quantity > 0),
  constraint business_liquidation_asset_sales_v2_value_check check (
    unit_recovery_value >= 0 and proceeds = round(quantity * unit_recovery_value, 2)
  ),
  constraint business_liquidation_asset_sales_v2_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_liquidation_asset_sales_v2_source_unique
    unique (game_session_id, liquidation_id, asset_type, source_id),
  constraint business_liquidation_asset_sales_v2_scope_id_unique unique (game_session_id, id)
);

alter table public.business_liquidation_asset_sales_v2 enable row level security;
revoke all on table public.business_liquidation_asset_sales_v2 from public, anon, authenticated;
grant select, insert on table public.business_liquidation_asset_sales_v2 to service_role;

create table if not exists public.business_liquidation_owner_distributions_v2 (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  liquidation_id uuid not null,
  business_id uuid not null,
  player_id uuid not null,
  ownership_units bigint not null,
  residual_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint business_liquidation_owner_distributions_v2_liquidation_scope_fk
    foreign key (game_session_id, liquidation_id)
    references public.business_liquidations(game_session_id, id) on delete restrict,
  constraint business_liquidation_owner_distributions_v2_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_liquidation_owner_distributions_v2_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_liquidation_owner_distributions_v2_units_check check (ownership_units > 0),
  constraint business_liquidation_owner_distributions_v2_amount_check check (residual_amount >= 0),
  constraint business_liquidation_owner_distributions_v2_unique unique (game_session_id, liquidation_id, player_id)
);

alter table public.business_liquidation_owner_distributions_v2 enable row level security;
revoke all on table public.business_liquidation_owner_distributions_v2 from public, anon, authenticated;
grant select, insert on table public.business_liquidation_owner_distributions_v2 to service_role;

-- Narrow seam for the canonical Contracts domain. The Contracts integration
-- migration replaces this implementation; Business liquidation only consumes
-- the numeric obligation and never mutates Contract state itself.
create or replace function public.business_contract_outstanding_obligations_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select 0::numeric
$function$;

create or replace function public.business_item_liquidation_unit_value_v2(
  p_game_session_id uuid,
  p_game_item_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_value numeric := 0;
begin
  select max(candidate_value)
  into v_value
  from (
    select profile_row.reference_price * 0.35 as candidate_value
    from public.business_market_product_profiles_v2 as profile_row
    where profile_row.game_session_id = p_game_session_id
      and profile_row.game_item_id = p_game_item_id
      and profile_row.status = 'active'
    union all
    select supplier_row.normal_unit_price * 0.25
    from public.business_wholesale_supplier_items as supplier_row
    where supplier_row.game_session_id = p_game_session_id
      and supplier_row.game_item_id = p_game_item_id
      and supplier_row.status in ('active', 'constrained')
  ) as candidates;
  return round(greatest(0, coalesce(v_value, 0)), 2);
end
$function$;

create or replace function public.business_loan_balance_v2(
  p_loan public.player_loans
)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $function$
  select greatest(0, coalesce(
    nullif(to_jsonb(p_loan) ->> 'remaining_balance', '')::numeric,
    nullif(to_jsonb(p_loan) ->> 'outstanding_balance', '')::numeric,
    nullif(to_jsonb(p_loan) ->> 'balance', '')::numeric,
    nullif(to_jsonb(p_loan) ->> 'principal_remaining', '')::numeric,
    nullif(to_jsonb(p_loan) ->> 'principal_amount', '')::numeric,
    0
  ))
$function$;

create or replace function public.business_liability_exposure_cap_v2(
  p_game_session_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v jsonb := '{}'::jsonb;
  v_cap numeric;
begin
  select coalesce(settings_row.business_market_window -> 'liability', '{}'::jsonb)
  into v
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;
  if coalesce(v ->> 'ownerExposureCap', '') ~ '^\d+(\.\d+)?$' then
    v_cap := least(1000000, greatest(0, (v ->> 'ownerExposureCap')::numeric));
  else
    v_cap := 2 * (public.business_labor_policy_v2(p_game_session_id) ->> 'baseWage')::numeric;
  end if;
  return round(v_cap, 2);
end
$function$;

create or replace function public.seed_business_liquidation_claims_v2(
  p_game_session_id uuid,
  p_liquidation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_liquidation public.business_liquidations%rowtype;
  v_employee public.business_employments_v2%rowtype;
  v_loan public.player_loans%rowtype;
  v_due numeric;
  v_count integer := 0;
begin
  select liquidation_row.* into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.id = p_liquidation_id;
  if not found then
    raise exception 'BUSINESS_LIQUIDATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  for v_employee in
    select employee_row.*
    from public.business_employments_v2 as employee_row
    where employee_row.game_session_id = p_game_session_id
      and employee_row.business_id = v_liquidation.business_id
      and employee_row.status in ('active', 'unpaid')
    order by employee_row.id
  loop
    v_due := round(v_employee.wage_per_cycle * greatest(1, v_employee.missed_payroll_cycles), 2);
    insert into public.business_liquidation_claims_v2(
      game_session_id, liquidation_id, business_id, claim_type, priority_rank,
      source_id, amount_due, metadata
    ) values (
      p_game_session_id, p_liquidation_id, v_liquidation.business_id,
      'payroll', 10, v_employee.id, v_due,
      jsonb_build_object('employeeKey', v_employee.public_key)
    ) on conflict do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  for v_loan in
    select loan_row.*
    from public.player_loans as loan_row
    where loan_row.game_session_id = p_game_session_id
      and loan_row.business_id = v_liquidation.business_id
      and loan_row.status in ('active', 'delinquent', 'defaulted', 'restructured')
    order by loan_row.id
  loop
    v_due := round(public.business_loan_balance_v2(v_loan), 2);
    if v_due > 0 then
      insert into public.business_liquidation_claims_v2(
        game_session_id, liquidation_id, business_id, claim_type, priority_rank,
        source_id, amount_due, metadata
      ) values (
        p_game_session_id, p_liquidation_id, v_liquidation.business_id,
        'secured_debt', 20, v_loan.id, v_due,
        jsonb_build_object(
          'loanKey', coalesce(to_jsonb(v_loan) ->> 'public_key', to_jsonb(v_loan) ->> 'loan_key')
        )
      ) on conflict do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end
$function$;

-- Inventory holdings are read from the canonical Inventory domain and consumed
-- through its posting function. Business never edits holdings directly.
create or replace function public.liquidate_business_assets_v2(
  p_game_session_id uuid,
  p_liquidation_id uuid,
  p_limit integer default 250
)
returns table (
  assets_sold integer,
  proceeds numeric
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_liquidation public.business_liquidations%rowtype;
  v_business public.business_entities%rowtype;
  v_asset record;
  v_holding record;
  v_value numeric;
  v_proceeds numeric;
  v_tx uuid;
  v_count integer := 0;
  v_total numeric := 0;
  v_limit integer := least(2000, greatest(1, coalesce(p_limit, 250)));
begin
  select liquidation_row.* into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.id = p_liquidation_id
    and liquidation_row.status <> 'completed'
  for update;
  if not found then
    raise exception 'BUSINESS_LIQUIDATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_liquidation.business_id
  for update;

  for v_asset in
    select asset_row.id, asset_row.public_key, asset_row.equipment_profile_id,
           profile_row.game_item_id, profile_row.metadata
    from public.business_equipment_assets as asset_row
    join public.business_equipment_profiles as profile_row
      on profile_row.game_session_id = asset_row.game_session_id
     and profile_row.id = asset_row.equipment_profile_id
    where asset_row.game_session_id = p_game_session_id
      and asset_row.business_id = v_business.id
      and asset_row.status <> 'retired'
      and not exists (
        select 1
        from public.business_liquidation_asset_sales_v2 as sale_row
        where sale_row.game_session_id = p_game_session_id
          and sale_row.liquidation_id = p_liquidation_id
          and sale_row.asset_type = 'equipment'
          and sale_row.source_id = asset_row.id
      )
    order by asset_row.id
    limit v_limit
    for update of asset_row skip locked
  loop
    v_value := round(
      greatest(
        public.business_item_liquidation_unit_value_v2(p_game_session_id, v_asset.game_item_id),
        case
          when coalesce(v_asset.metadata ->> 'replacementValue', '') ~ '^\d+(\.\d+)?$'
            then (v_asset.metadata ->> 'replacementValue')::numeric * 0.30
          else 0
        end
      )
      * public.business_equipment_effective_condition_v2(v_asset.id, now()) / 100.0,
      2
    );
    v_proceeds := v_value;
    if v_proceeds > 0 then
      perform public.record_business_ledger_entry_v2(
        p_game_session_id, v_business.id, v_proceeds, v_business.currency_code,
        'credit', 'business', 'liquidation_asset_sale', v_asset.id,
        'system', null, jsonb_build_object('liquidation_key', v_liquidation.public_key)
      );
    end if;
    update public.business_equipment_assets
    set status = 'retired'
    where id = v_asset.id;
    insert into public.business_liquidation_asset_sales_v2(
      game_session_id, liquidation_id, business_id, asset_type, source_id,
      game_item_id, quantity, unit_recovery_value, proceeds, metadata
    ) values (
      p_game_session_id, p_liquidation_id, v_business.id, 'equipment', v_asset.id,
      v_asset.game_item_id, 1, v_value, v_proceeds,
      jsonb_build_object('assetKey', v_asset.public_key)
    );
    v_count := v_count + 1;
    v_total := v_total + v_proceeds;
  end loop;

  for v_holding in
    select holding_row.id,
           holding_row.game_item_id,
           holding_row.quantity,
           holding_row.inventory_account_id
    from public.inventory_holdings as holding_row
    join public.inventory_accounts as account_row
      on account_row.game_session_id = holding_row.game_session_id
     and account_row.id = holding_row.inventory_account_id
    where holding_row.game_session_id = p_game_session_id
      and account_row.business_id = v_business.id
      and holding_row.quantity > 0
      and not exists (
        select 1
        from public.business_liquidation_asset_sales_v2 as sale_row
        where sale_row.game_session_id = p_game_session_id
          and sale_row.liquidation_id = p_liquidation_id
          and sale_row.asset_type = 'inventory'
          and sale_row.source_id = holding_row.id
      )
    order by holding_row.id
    limit v_limit
    for update of holding_row skip locked
  loop
    v_value := public.business_item_liquidation_unit_value_v2(
      p_game_session_id,
      v_holding.game_item_id
    );
    v_proceeds := round(v_value * v_holding.quantity, 2);

    select transaction_id into v_tx
    from economy_private.post_inventory_transaction_v2(
      p_game_session_id => p_game_session_id,
      p_game_item_id => v_holding.game_item_id,
      p_from_account_id => v_holding.inventory_account_id,
      p_to_account_id => null,
      p_quantity => v_holding.quantity,
      p_unit_cost => v_value,
      p_transaction_kind => 'sale',
      p_source_domain => 'business',
      p_source_action => 'liquidation_inventory_sale',
      p_source_id => p_liquidation_id,
      p_idempotency_key => 'liquidation-inventory:' || v_liquidation.public_key || ':' || v_holding.id::text,
      p_metadata => jsonb_build_object('liquidation_key', v_liquidation.public_key)
    );

    if v_proceeds > 0 then
      perform public.record_business_ledger_entry_v2(
        p_game_session_id, v_business.id, v_proceeds, v_business.currency_code,
        'credit', 'business', 'liquidation_inventory_sale', v_holding.id,
        'system', null, jsonb_build_object('liquidation_key', v_liquidation.public_key)
      );
    end if;

    insert into public.business_liquidation_asset_sales_v2(
      game_session_id, liquidation_id, business_id, asset_type, source_id,
      game_item_id, quantity, unit_recovery_value, proceeds,
      inventory_transaction_id, metadata
    ) values (
      p_game_session_id, p_liquidation_id, v_business.id, 'inventory', v_holding.id,
      v_holding.game_item_id, v_holding.quantity, v_value, v_proceeds,
      v_tx, jsonb_build_object('inventoryAccountId', v_holding.inventory_account_id)
    );
    v_count := v_count + 1;
    v_total := v_total + v_proceeds;
  end loop;

  return query select v_count, round(v_total, 2);
end
$function$;

create or replace function public.pay_business_liquidation_claims_v2(
  p_game_session_id uuid,
  p_liquidation_id uuid,
  p_limit integer default 250
)
returns table (
  claims_processed integer,
  amount_paid numeric,
  cash_remaining numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_liquidation public.business_liquidations%rowtype;
  v_business public.business_entities%rowtype;
  v_claim public.business_liquidation_claims_v2%rowtype;
  v_employee public.business_employments_v2%rowtype;
  v_loan public.player_loans%rowtype;
  v_cash numeric;
  v_pay numeric;
  v_count integer := 0;
  v_total numeric := 0;
  v_limit integer := least(2000, greatest(1, coalesce(p_limit, 250)));
begin
  select liquidation_row.* into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.id = p_liquidation_id
    and liquidation_row.status <> 'completed'
  for update;
  if not found then
    raise exception 'BUSINESS_LIQUIDATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_liquidation.business_id
  for update;

  for v_claim in
    select claim_row.*
    from public.business_liquidation_claims_v2 as claim_row
    where claim_row.game_session_id = p_game_session_id
      and claim_row.liquidation_id = p_liquidation_id
      and claim_row.status in ('due', 'partial')
    order by claim_row.priority_rank, claim_row.created_at, claim_row.id
    limit v_limit
    for update skip locked
  loop
    v_cash := public.read_business_balance_v2(
      p_game_session_id,
      v_business.id,
      v_business.currency_code
    );
    if v_cash <= 0 then exit; end if;
    v_pay := least(v_cash, v_claim.amount_due - v_claim.amount_paid);
    if v_pay <= 0 then continue; end if;

    if v_claim.claim_type = 'payroll' then
      select employee_row.* into v_employee
      from public.business_employments_v2 as employee_row
      where employee_row.game_session_id = p_game_session_id
        and employee_row.id = v_claim.source_id;
      perform public.record_business_ledger_entry_v2(
        p_game_session_id, v_business.id, -v_pay, v_business.currency_code,
        'debit', 'business', 'liquidation_payroll', v_claim.id,
        'system', null, jsonb_build_object('liquidation_key', v_liquidation.public_key)
      );
      if v_pay >= v_claim.amount_due - v_claim.amount_paid then
        update public.business_employments_v2
        set status = 'terminated', departed_at = now(), departure_reason = 'business_liquidation'
        where id = v_employee.id and status in ('active', 'unpaid');
      end if;
    elsif v_claim.claim_type in ('secured_debt', 'unsecured_debt') then
      select loan_row.* into v_loan
      from public.player_loans as loan_row
      where loan_row.game_session_id = p_game_session_id
        and loan_row.id = v_claim.source_id
      for update;
      if not found then
        v_pay := 0;
      else
        perform public.repay_player_loan_v1(
          p_game_session_id,
          v_loan.player_id,
          coalesce(to_jsonb(v_loan) ->> 'public_key', to_jsonb(v_loan) ->> 'loan_key'),
          v_pay,
          'liquidation:' || v_liquidation.public_key || ':' || v_claim.public_key
        );
      end if;
    else
      -- Tax/contract claim settlement is supplied by its canonical domain adapter.
      -- Unsupported claims remain due rather than being silently erased.
      continue;
    end if;

    if v_pay > 0 then
      update public.business_liquidation_claims_v2
      set amount_paid = amount_paid + v_pay,
          status = case
            when amount_paid + v_pay >= amount_due then 'paid'
            else 'partial'
          end
      where id = v_claim.id;
      v_count := v_count + 1;
      v_total := v_total + v_pay;
    end if;
  end loop;

  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  return query select v_count, round(v_total, 2), v_cash;
end
$function$;

create or replace function public.apply_business_owner_liability_v2(
  p_game_session_id uuid,
  p_liquidation_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_liquidation public.business_liquidations%rowtype;
  v_business public.business_entities%rowtype;
  v_remaining numeric;
  v_cap numeric;
  v_owner record;
  v_owner_count integer;
  v_target numeric;
  v_balance numeric;
  v_paid numeric := 0;
begin
  select liquidation_row.* into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.id = p_liquidation_id
    and liquidation_row.status <> 'completed'
  for update;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_liquidation.business_id;

  if v_business.entity_type not in ('sole_proprietorship', 'partnership') then
    return 0;
  end if;

  select coalesce(sum(amount_due - amount_paid), 0)
  into v_remaining
  from public.business_liquidation_claims_v2
  where game_session_id = p_game_session_id
    and liquidation_id = p_liquidation_id
    and status in ('due', 'partial');
  v_remaining := v_remaining
    + public.business_contract_outstanding_obligations_v2(p_game_session_id, v_business.id);
  if v_remaining <= 0 then return 0; end if;

  v_cap := public.business_liability_exposure_cap_v2(p_game_session_id);
  select count(*)::integer into v_owner_count
  from public.business_ownership_positions
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status = 'active';

  for v_owner in
    select position_row.player_id, position_row.units,
           sum(position_row.units) over () as total_units
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.status = 'active'
    order by position_row.player_id
  loop
    exit when v_remaining <= 0;
    v_target := least(
      v_cap,
      v_remaining,
      round(v_remaining * v_owner.units / greatest(1, v_owner.total_units), 2)
    );
    select balance_row.balance into v_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.player_id = v_owner.player_id
      and balance_row.account_type = 'checking'
      and balance_row.currency_code = v_business.currency_code
    for update;
    v_target := least(coalesce(v_balance, 0), v_target);
    if v_target > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id, v_owner.player_id, 'checking', -v_target,
        v_business.currency_code, 'debit', 'business', 'owner_liability_contribution',
        v_liquidation.id, 'system', null,
        jsonb_build_object('liquidation_key', v_liquidation.public_key)
      );
      perform public.record_business_ledger_entry_v2(
        p_game_session_id, v_business.id, v_target, v_business.currency_code,
        'credit', 'business', 'owner_liability_contribution', v_liquidation.id,
        'system', null, jsonb_build_object('player_id', v_owner.player_id)
      );
      v_remaining := v_remaining - v_target;
      v_paid := v_paid + v_target;
    end if;
  end loop;
  return round(v_paid, 2);
end
$function$;

create or replace function public.finalize_business_liquidation_v2(
  p_game_session_id uuid,
  p_liquidation_key text,
  p_idempotency_key text
)
returns table (
  liquidation_key text,
  status text,
  residual_distributed numeric,
  unpaid_creditor_claims numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_liquidation public.business_liquidations%rowtype;
  v_business public.business_entities%rowtype;
  v_unpaid numeric;
  v_contract numeric;
  v_cash numeric;
  v_total_units bigint;
  v_owner_count integer;
  v_index integer := 0;
  v_remaining numeric;
  v_payout numeric;
  v_owner record;
  v_residual numeric := 0;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select liquidation_row.* into v_liquidation
  from public.business_liquidations as liquidation_row
  where liquidation_row.game_session_id = p_game_session_id
    and liquidation_row.public_key = lower(btrim(p_liquidation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_LIQUIDATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_liquidation.status = 'completed' then
    if not exists (
      select 1
      from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.action = 'business.liquidation.finalize'
        and audit_row.target_id = v_liquidation.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_LIQUIDATION_ALREADY_COMPLETED' using errcode = 'P0001';
    end if;
    select coalesce(sum(residual_amount), 0) into v_residual
    from public.business_liquidation_owner_distributions_v2
    where game_session_id = p_game_session_id and liquidation_id = v_liquidation.id;
    return query select v_liquidation.public_key, v_liquidation.status, v_residual, 0::numeric, true;
    return;
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_liquidation.business_id
  for update;

  perform public.seed_business_liquidation_claims_v2(p_game_session_id, v_liquidation.id);
  perform public.liquidate_business_assets_v2(p_game_session_id, v_liquidation.id, 1000);
  perform public.pay_business_liquidation_claims_v2(p_game_session_id, v_liquidation.id, 1000);

  select coalesce(sum(amount_due - amount_paid), 0)
  into v_unpaid
  from public.business_liquidation_claims_v2
  where game_session_id = p_game_session_id
    and liquidation_id = v_liquidation.id
    and status in ('due', 'partial');
  v_contract := public.business_contract_outstanding_obligations_v2(
    p_game_session_id,
    v_business.id
  );

  if v_unpaid + v_contract > 0
    and v_business.entity_type in ('sole_proprietorship', 'partnership')
  then
    perform public.apply_business_owner_liability_v2(p_game_session_id, v_liquidation.id);
    perform public.pay_business_liquidation_claims_v2(p_game_session_id, v_liquidation.id, 1000);
    select coalesce(sum(amount_due - amount_paid), 0)
    into v_unpaid
    from public.business_liquidation_claims_v2
    where game_session_id = p_game_session_id
      and liquidation_id = v_liquidation.id
      and status in ('due', 'partial');
  end if;

  if v_contract > 0 then
    raise exception 'BUSINESS_LIQUIDATION_CONTRACT_OBLIGATIONS_REMAIN' using errcode = 'P0001';
  end if;

  if v_unpaid > 0 then
    update public.business_liquidation_claims_v2
    set status = 'unrecoverable'
    where game_session_id = p_game_session_id
      and liquidation_id = v_liquidation.id
      and status in ('due', 'partial');
  end if;

  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );

  -- Creditors have been resolved or marked unrecoverable. Equity receives only
  -- the true remaining positive cash balance.
  if v_cash > 0 then
    perform 1
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.status = 'active'
    order by position_row.player_id
    for share;

    select coalesce(sum(units), 0), count(*)::integer
    into v_total_units, v_owner_count
    from public.business_ownership_positions
    where game_session_id = p_game_session_id
      and business_id = v_business.id
      and status = 'active';

    perform public.record_business_ledger_entry_v2(
      p_game_session_id, v_business.id, -v_cash, v_business.currency_code,
      'debit', 'business', 'liquidation_residual', v_liquidation.id,
      'system', null, jsonb_build_object('liquidation_key', v_liquidation.public_key)
    );

    v_remaining := v_cash;
    for v_owner in
      select position_row.player_id, position_row.units
      from public.business_ownership_positions as position_row
      where position_row.game_session_id = p_game_session_id
        and position_row.business_id = v_business.id
        and position_row.status = 'active'
      order by position_row.player_id
    loop
      v_index := v_index + 1;
      v_payout := case
        when v_index = v_owner_count then v_remaining
        else round(v_cash * v_owner.units / v_total_units, 2)
      end;
      v_remaining := round(v_remaining - v_payout, 2);
      if v_payout > 0 then
        perform public.record_player_ledger_entry(
          p_game_session_id, v_owner.player_id, 'checking', v_payout,
          v_business.currency_code, 'credit', 'business', 'liquidation_residual',
          v_liquidation.id, 'system', null,
          jsonb_build_object('liquidation_key', v_liquidation.public_key)
        );
      end if;
      insert into public.business_liquidation_owner_distributions_v2(
        game_session_id, liquidation_id, business_id, player_id,
        ownership_units, residual_amount
      ) values (
        p_game_session_id, v_liquidation.id, v_business.id, v_owner.player_id,
        v_owner.units, v_payout
      );
      v_residual := v_residual + v_payout;
    end loop;
  end if;

  update public.business_ownership_positions
  set status = 'exited', ended_at = now()
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status = 'active';

  update public.business_entities
  set status = 'closed', financial_health_state = 'liquidating', version = version + 1
  where id = v_business.id;

  update public.business_liquidations
  set status = 'completed', completed_at = now(),
      metadata = metadata || jsonb_build_object(
        'residualDistributed', round(v_residual, 2),
        'unpaidCreditorClaims', round(v_unpaid, 2)
      )
  where id = v_liquidation.id
  returning * into v_liquidation;

  insert into public.audit_log(
    game_session_id, actor_type, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'system', 'business.liquidation.finalize',
    'business_liquidation', v_liquidation.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'residual_distributed', round(v_residual, 2),
      'unpaid_creditor_claims', round(v_unpaid, 2)
    )
  );

  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, event_type, source_id,
    reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'system', 'business.liquidation.completed',
    v_liquidation.id, 'liquidation_completed',
    jsonb_build_object(
      'residualDistributed', round(v_residual, 2),
      'unpaidCreditorClaims', round(v_unpaid, 2)
    )
  );

  return query select
    v_liquidation.public_key,
    v_liquidation.status,
    round(v_residual, 2),
    round(v_unpaid, 2),
    false;
end
$function$;

revoke all on function public.business_contract_outstanding_obligations_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_contract_outstanding_obligations_v2(uuid, uuid) to service_role;
revoke all on function public.business_item_liquidation_unit_value_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.business_item_liquidation_unit_value_v2(uuid, uuid) to service_role;
revoke all on function public.business_liability_exposure_cap_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.business_liability_exposure_cap_v2(uuid) to service_role;
revoke all on function public.seed_business_liquidation_claims_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.seed_business_liquidation_claims_v2(uuid, uuid) to service_role;
revoke all on function public.liquidate_business_assets_v2(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.liquidate_business_assets_v2(uuid, uuid, integer) to service_role;
revoke all on function public.pay_business_liquidation_claims_v2(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.pay_business_liquidation_claims_v2(uuid, uuid, integer) to service_role;
revoke all on function public.apply_business_owner_liability_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_business_owner_liability_v2(uuid, uuid) to service_role;
revoke all on function public.finalize_business_liquidation_v2(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_business_liquidation_v2(uuid, text, text) to service_role;

commit;
