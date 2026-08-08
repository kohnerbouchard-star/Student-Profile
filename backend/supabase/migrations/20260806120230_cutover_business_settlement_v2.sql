-- Business cycle settlement with canonical COGS recognition V2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.settle_business_cycle_v1(
  p_game_session_id uuid,
  p_business_key text,
  p_settlement_key text,
  p_inflation_index numeric,
  p_exchange_index numeric,
  p_interest_index numeric,
  p_difficulty_multiplier numeric
)
returns table (
  business_key text,
  units_sold integer,
  gross_revenue numeric,
  total_expense numeric,
  net_income numeric,
  ending_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_inventory_quantity integer;
  v_units integer;
  v_total_units integer := 0;
  v_gross numeric := 0;
  v_wages numeric := 0;
  v_tax numeric := 0;
  v_cogs numeric := 0;
  v_total_cogs numeric := 0;
  v_total_expense numeric := 0;
  v_net numeric := 0;
  v_balance numeric := 0;
  v_revenue_entry uuid;
  v_wage_entry uuid;
  v_tax_entry uuid;
  v_tax_rate numeric := 0.08;
  v_price_factor numeric;
  v_demand numeric;
  v_demand_index numeric;
begin
  if length(btrim(coalesce(p_settlement_key, ''))) not between 1 and 160 then
    raise exception 'BUSINESS_SETTLEMENT_KEY_INVALID' using errcode = 'P0001';
  end if;

  select be.* into v_business
  from public.business_entities be
  where be.game_session_id = p_game_session_id
    and be.public_key = lower(btrim(p_business_key))
    and be.status in ('active', 'distressed', 'restructuring')
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.business_sales bs
    where bs.game_session_id = p_game_session_id
      and bs.business_id = v_business.id
      and bs.settlement_key = p_settlement_key
  ) then
    select
      coalesce(sum(bs.quantity), 0),
      coalesce(sum(bs.gross_revenue), 0),
      coalesce(sum(bs.cost_of_goods_sold + bs.wage_expense + bs.tax_expense), 0),
      coalesce(sum(bs.net_income), 0)
    into v_total_units, v_gross, v_total_expense, v_net
    from public.business_sales bs
    where bs.game_session_id = p_game_session_id
      and bs.business_id = v_business.id
      and bs.settlement_key = p_settlement_key;

    select ab.balance into v_balance
    from public.account_balances ab
    where ab.game_session_id = p_game_session_id
      and ab.player_id = v_business.owner_player_id
      and ab.account_type = public.business_account_type_v1(v_business.public_key)
      and ab.currency_code = v_business.currency_code;

    return query select
      v_business.public_key,
      v_total_units,
      v_gross,
      v_total_expense,
      v_net,
      coalesce(v_balance, 0),
      true;
    return;
  end if;

  v_tax_rate := coalesce((
    select nullif(gs.business_market_window ->> 'businessTaxRate', '')::numeric
    from public.game_settings gs
    where gs.game_session_id = p_game_session_id
  ), 0.08);

  for v_product in
    select bp.*
    from public.business_products bp
    where bp.game_session_id = p_game_session_id
      and bp.business_id = v_business.id
      and bp.status = 'active'
    order by bp.id
  loop
    v_price_factor := greatest(
      0.1,
      2 - (
        v_product.unit_price
        / greatest(
          v_product.reference_price * greatest(coalesce(p_inflation_index, 1), 0.1),
          0.01
        )
      )
    );
    v_demand := v_product.base_demand_units
      * v_business.demand_index
      * v_price_factor
      * greatest(coalesce(p_exchange_index, 1), 0.1)
      / greatest(coalesce(p_difficulty_multiplier, 1), 0.1);
    v_demand_index := least(10, greatest(0.01, v_demand));

    if v_product.product_kind = 'service' then
      v_inventory_quantity := greatest(v_product.capacity_units, 0);
    elsif v_product.product_kind = 'physical_good' then
      select coalesce(floor(bi.quantity)::integer, 0)
      into v_inventory_quantity
      from public.business_inventory bi
      where bi.game_session_id = p_game_session_id
        and bi.business_id = v_business.id
        and bi.game_item_id = v_product.output_game_item_id
        and bi.inventory_kind = 'finished_good';
    else
      select coalesce(floor(bi.quantity)::integer, 0)
      into v_inventory_quantity
      from public.business_inventory bi
      where bi.game_session_id = p_game_session_id
        and bi.business_id = v_business.id
        and bi.item_key = 'finished:' || v_product.public_key
        and bi.inventory_kind = 'finished_good';
    end if;

    v_units := least(
      coalesce(v_inventory_quantity, 0),
      greatest(0, floor(v_demand)::integer)
    );
    if v_units <= 0 then
      continue;
    end if;

    v_cogs := economy_private.consume_business_finished_inventory_v2(
      p_game_session_id,
      v_business.id,
      v_product.id,
      v_units,
      p_settlement_key
    );

    insert into public.business_sales (
      game_session_id,
      business_id,
      product_id,
      settlement_key,
      quantity,
      unit_price,
      gross_revenue,
      cost_of_goods_sold,
      wage_expense,
      tax_expense,
      net_income,
      demand_index
    ) values (
      p_game_session_id,
      v_business.id,
      v_product.id,
      p_settlement_key,
      v_units,
      v_product.unit_price,
      round(v_units * v_product.unit_price, 2),
      v_cogs,
      0,
      0,
      round(v_units * v_product.unit_price, 2) - v_cogs,
      v_demand_index
    );

    v_total_units := v_total_units + v_units;
    v_gross := v_gross + round(v_units * v_product.unit_price, 2);
    v_total_cogs := v_total_cogs + v_cogs;
  end loop;

  select coalesce(sum(emp.wage_per_cycle), 0)
  into v_wages
  from public.business_employees emp
  where emp.game_session_id = p_game_session_id
    and emp.business_id = v_business.id
    and emp.status = 'active';

  v_tax := round(greatest(v_gross, 0) * greatest(v_tax_rate, 0), 2);

  if v_gross > 0 then
    select ledger_entry_id into v_revenue_entry
    from public.record_player_ledger_entry(
      p_game_session_id,
      v_business.owner_player_id,
      public.business_account_type_v1(v_business.public_key),
      v_gross,
      v_business.currency_code,
      'credit',
      'business',
      'sales_revenue',
      v_business.id,
      'system',
      null,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'settlement_key', p_settlement_key,
        'cost_of_goods_sold', v_total_cogs
      )
    );
  end if;

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = v_business.owner_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code
  for update;

  if v_wages + v_tax > coalesce(v_balance, 0) then
    update public.business_entities
    set
      status = 'distressed',
      failure_count = failure_count + 1,
      version = version + 1
    where id = v_business.id;
    raise exception 'BUSINESS_CYCLE_UNAFFORDABLE' using errcode = 'P0001';
  end if;

  if v_wages > 0 then
    select ledger_entry_id into v_wage_entry
    from public.record_player_ledger_entry(
      p_game_session_id,
      v_business.owner_player_id,
      public.business_account_type_v1(v_business.public_key),
      -v_wages,
      v_business.currency_code,
      'debit',
      'business',
      'wage_expense',
      v_business.id,
      'system',
      null,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'settlement_key', p_settlement_key
      )
    );
  end if;

  if v_tax > 0 then
    select ledger_entry_id into v_tax_entry
    from public.record_player_ledger_entry(
      p_game_session_id,
      v_business.owner_player_id,
      public.business_account_type_v1(v_business.public_key),
      -v_tax,
      v_business.currency_code,
      'debit',
      'business',
      'tax_expense',
      v_business.id,
      'system',
      null,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'settlement_key', p_settlement_key
      )
    );
  end if;

  update public.business_sales bs
  set
    wage_expense = case
      when v_total_units > 0 then round(v_wages * bs.quantity / v_total_units, 2)
      else 0
    end,
    tax_expense = case
      when v_total_units > 0 then round(v_tax * bs.quantity / v_total_units, 2)
      else 0
    end,
    net_income = bs.gross_revenue
      - bs.cost_of_goods_sold
      - case
          when v_total_units > 0 then round((v_wages + v_tax) * bs.quantity / v_total_units, 2)
          else 0
        end,
    revenue_ledger_entry_id = v_revenue_entry,
    wage_ledger_entry_id = v_wage_entry,
    tax_ledger_entry_id = v_tax_entry
  where bs.game_session_id = p_game_session_id
    and bs.business_id = v_business.id
    and bs.settlement_key = p_settlement_key;

  v_total_expense := v_total_cogs + v_wages + v_tax;
  v_net := v_gross - v_total_expense;

  update public.business_entities be
  set
    revenue_total = be.revenue_total + v_gross,
    expense_total = be.expense_total + v_total_expense,
    profit_total = be.profit_total + v_net,
    valuation = greatest(
      0,
      round(
        (be.revenue_total + v_gross) * 0.35
        + greatest(be.profit_total + v_net, 0) * 3,
        2
      )
    ),
    reputation_score = greatest(
      0,
      least(100, be.reputation_score + case when v_net >= 0 then 1 else -2 end)
    ),
    status = case
      when v_net < 0 and be.failure_count >= 2 then 'distressed'
      else be.status
    end,
    version = be.version + 1
  where be.id = v_business.id
  returning be.* into v_business;

  select ab.balance into v_balance
  from public.account_balances ab
  where ab.game_session_id = p_game_session_id
    and ab.player_id = v_business.owner_player_id
    and ab.account_type = public.business_account_type_v1(v_business.public_key)
    and ab.currency_code = v_business.currency_code;

  return query select
    v_business.public_key,
    v_total_units,
    v_gross,
    v_total_expense,
    v_net,
    coalesce(v_balance, 0),
    false;
end
$function$;

revoke all on function public.settle_business_cycle_v1(
  uuid, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.settle_business_cycle_v1(
  uuid, text, text, numeric, numeric, numeric, numeric
) to service_role;

commit;
