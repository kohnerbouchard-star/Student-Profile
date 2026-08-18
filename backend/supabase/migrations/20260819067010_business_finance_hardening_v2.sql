-- Harden V2 Business finance edge cases.
-- - distress records allow negative cash
-- - malformed valuation policy fails closed to bounded defaults
-- - distributions settle configured owner-level distribution tax atomically

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.business_distress_events_v2
  drop constraint if exists business_distress_events_v2_money_check;
alter table public.business_distress_events_v2
  add constraint business_distress_events_v2_money_check
  check (protected_obligations >= 0 and outstanding_debt >= 0);

create or replace function public.business_valuation_policy_v2(
  p_game_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v jsonb := '{}'::jsonb;
  v_multiple numeric := 3;
begin
  select coalesce(settings_row.business_market_window -> 'valuation', '{}'::jsonb)
  into v
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;

  if coalesce(v ->> 'earningsMultiple', '') ~ '^\d+(\.\d+)?$' then
    v_multiple := least(8, greatest(1, (v ->> 'earningsMultiple')::numeric));
  end if;

  return jsonb_build_object('earningsMultiple', v_multiple);
end
$function$;

create or replace function public.business_distribution_tax_basis_points_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_effective_date date default current_date
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_country text;
  v_rate integer := 0;
begin
  select business_row.country_code
  into v_country
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select policy_row.distribution_tax_basis_points
  into v_rate
  from public.business_tax_policies_v2 as policy_row
  where policy_row.game_session_id = p_game_session_id
    and policy_row.country_code = v_country
    and policy_row.status = 'active'
    and policy_row.effective_from <= p_effective_date
  order by policy_row.effective_from desc
  limit 1;

  return coalesce(v_rate, 0);
end
$function$;

alter table public.business_distribution_payments
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists net_amount numeric(14,2) not null default 0;

update public.business_distribution_payments
set net_amount = gross_amount - tax_amount
where net_amount = 0 and gross_amount > 0;

alter table public.business_distribution_payments
  drop constraint if exists business_distribution_payments_tax_check;
alter table public.business_distribution_payments
  add constraint business_distribution_payments_tax_check
  check (
    tax_amount >= 0
    and tax_amount <= gross_amount
    and net_amount = round(gross_amount - tax_amount, 2)
  );

create or replace function public.execute_business_distribution_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  distributed_amount numeric,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_distribution_terms%rowtype;
  v_business public.business_entities%rowtype;
  v_cash numeric;
  v_protected numeric;
  v_total_units bigint;
  v_owner_count integer;
  v_index integer := 0;
  v_remaining numeric;
  v_gross numeric;
  v_tax numeric;
  v_net numeric;
  v_tax_bps integer;
  v_owner record;
  v_ledger record;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.*
  into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'distribution'
  for update;
  if not found then
    raise exception 'BUSINESS_DISTRIBUTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select term_row.*
  into v_term
  from public.business_distribution_terms as term_row
  where term_row.game_session_id = p_game_session_id
    and term_row.proposal_id = v_proposal.id;
  if not found then
    raise exception 'BUSINESS_DISTRIBUTION_TERMS_MISSING' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_proposal.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_proposal.status = 'executed' then
    if not exists (
      select 1
      from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.distribution.execute'
        and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_DISTRIBUTION_ALREADY_EXECUTED' using errcode = 'P0001';
    end if;
    v_cash := public.read_business_balance_v2(
      p_game_session_id,
      v_business.id,
      v_business.currency_code
    );
    return query select
      v_proposal.public_key,
      v_proposal.status,
      v_term.gross_amount,
      v_cash,
      true;
    return;
  end if;

  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_DISTRIBUTION_GOVERNANCE_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.business_governance_voter_snapshots as voter_row
    where voter_row.game_session_id = p_game_session_id
      and voter_row.proposal_id = v_proposal.id
      and voter_row.player_id = p_player_id
  ) then
    raise exception 'BUSINESS_GOVERNANCE_AUTHORITY_REQUIRED' using errcode = 'P0001';
  end if;
  if v_business.status = 'closed' or v_business.formation_state <> 'operational' then
    raise exception 'BUSINESS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  v_protected := public.business_protected_obligations_v2(
    p_game_session_id,
    v_business.id
  );
  if v_cash - v_term.gross_amount < v_protected then
    raise exception 'BUSINESS_DISTRIBUTION_SOLVENCY_CHECK_FAILED' using errcode = 'P0001';
  end if;

  perform 1
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
  order by position_row.player_id
  for share;

  select coalesce(sum(position_row.units), 0), count(*)::integer
  into v_total_units, v_owner_count
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active';
  if v_total_units <= 0 or v_owner_count <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
  end if;

  v_tax_bps := public.business_distribution_tax_basis_points_v2(
    p_game_session_id,
    v_business.id,
    current_date
  );

  perform public.record_business_ledger_entry_v2(
    p_game_session_id,
    v_business.id,
    -v_term.gross_amount,
    v_business.currency_code,
    'debit',
    'business',
    'owner_distribution',
    v_proposal.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'proposal_key', v_proposal.public_key,
      'distribution_tax_basis_points', v_tax_bps
    )
  );

  v_remaining := v_term.gross_amount;
  for v_owner in
    select position_row.player_id, position_row.units
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.status = 'active'
    order by position_row.player_id
  loop
    v_index := v_index + 1;
    v_gross := case
      when v_index = v_owner_count then v_remaining
      else round(v_term.gross_amount * v_owner.units / v_total_units, 2)
    end;
    v_remaining := round(v_remaining - v_gross, 2);
    v_tax := round(v_gross * v_tax_bps / 10000.0, 2);
    v_net := round(v_gross - v_tax, 2);

    select * into v_ledger
    from public.record_player_ledger_entry(
      p_game_session_id,
      v_owner.player_id,
      'checking',
      v_gross,
      v_business.currency_code,
      'credit',
      'business',
      'owner_distribution',
      v_proposal.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'proposal_key', v_proposal.public_key,
        'business_key', v_business.public_key,
        'gross_amount', v_gross
      )
    );

    if v_tax > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id,
        v_owner.player_id,
        'checking',
        -v_tax,
        v_business.currency_code,
        'debit',
        'business',
        'distribution_tax',
        v_proposal.id,
        'system',
        null,
        jsonb_build_object(
          'proposal_key', v_proposal.public_key,
          'tax_basis_points', v_tax_bps,
          'gross_distribution', v_gross
        )
      );
    end if;

    insert into public.business_distribution_payments(
      game_session_id,
      proposal_id,
      business_id,
      player_id,
      ownership_units,
      gross_amount,
      tax_amount,
      net_amount,
      ledger_entry_id
    ) values (
      p_game_session_id,
      v_proposal.id,
      v_business.id,
      v_owner.player_id,
      v_owner.units,
      v_gross,
      v_tax,
      v_net,
      v_ledger.ledger_entry_id
    );
  end loop;

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.audit_log(
    game_session_id,
    actor_type,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_game_session_id,
    'player',
    p_player_id,
    'business.distribution.execute',
    'business_governance_proposal',
    v_proposal.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'amount', v_term.gross_amount,
      'distribution_tax_basis_points', v_tax_bps
    )
  );

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'player',
    p_player_id,
    'business.distribution.completed',
    v_proposal.id,
    'distribution_completed',
    jsonb_build_object(
      'grossAmount', v_term.gross_amount,
      'ownerCount', v_owner_count,
      'distributionTaxBasisPoints', v_tax_bps
    )
  );

  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  return query select
    v_proposal.public_key,
    v_proposal.status,
    v_term.gross_amount,
    v_cash,
    false;
end
$function$;

-- Replace valuation calculation only to source its multiple through the safe
-- policy parser. The remainder stays deliberately explainable and bounded.
create or replace function public.calculate_business_valuation_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_as_of timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_fin jsonb;
  v_cash numeric;
  v_profit numeric;
  v_revenue numeric;
  v_debt numeric;
  v_inventory numeric := 0;
  v_equipment numeric := 0;
  v_capability numeric := 0;
  v_rep numeric;
  v_rep_mult numeric;
  v_macro numeric;
  v_earnings_multiple numeric := 3;
  v_policy jsonb;
  v_base numeric;
  v_value numeric;
  v_previous numeric := 0;
  v_change numeric;
  v_reasons jsonb := '[]'::jsonb;
  v_snapshot public.business_valuation_snapshots_v2%rowtype;
begin
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status <> 'closed';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_fin := public.business_period_financials_v2(
    p_game_session_id,
    p_business_id,
    p_as_of - interval '30 days',
    p_as_of
  );
  v_profit := (v_fin ->> 'operatingProfit')::numeric;
  v_revenue := (v_fin ->> 'revenue')::numeric;
  v_cash := public.read_business_balance_v2(
    p_game_session_id,
    p_business_id,
    v_business.currency_code
  );
  v_debt := public.business_outstanding_debt_v2(
    p_game_session_id,
    p_business_id
  );

  select coalesce(sum(
    public.business_derived_finished_availability_v2(
      p_game_session_id,
      p_business_id,
      profile_row.game_item_id
    ) * profile_row.reference_price * 0.40
  ), 0)
  into v_inventory
  from public.business_market_product_profiles_v2 as profile_row
  where profile_row.game_session_id = p_game_session_id
    and profile_row.status = 'active';

  select coalesce(sum(
    coalesce(
      case
        when coalesce(profile_row.metadata ->> 'replacementValue', '') ~ '^\d+(\.\d+)?$'
          then (profile_row.metadata ->> 'replacementValue')::numeric
        else null
      end,
      supplier_price.normal_price,
      0
    )
    * public.business_equipment_effective_condition_v2(asset_row.id, p_as_of) / 100.0
    * 0.60
  ), 0)
  into v_equipment
  from public.business_equipment_assets as asset_row
  join public.business_equipment_profiles as profile_row
    on profile_row.id = asset_row.equipment_profile_id
  left join lateral (
    select min(supplier_row.normal_unit_price) as normal_price
    from public.business_wholesale_supplier_items as supplier_row
    where supplier_row.game_session_id = p_game_session_id
      and supplier_row.game_item_id = profile_row.game_item_id
  ) as supplier_price on true
  where asset_row.game_session_id = p_game_session_id
    and asset_row.business_id = p_business_id
    and asset_row.status <> 'retired';

  select coalesce(sum(recipe_row.research_fee * 0.35), 0)
  into v_capability
  from public.business_recipe_unlocks as unlock_row
  join public.business_recipe_definitions as recipe_row
    on recipe_row.id = unlock_row.recipe_id
  where unlock_row.game_session_id = p_game_session_id
    and unlock_row.business_id = p_business_id
    and recipe_row.is_starter = false;

  v_rep := public.business_reputation_score_v2(
    p_game_session_id,
    p_business_id
  );
  v_rep_mult := 0.75 + v_rep / 200.0;
  v_policy := public.business_demand_policy_v2(p_game_session_id);
  v_macro := least(
    1.30,
    greatest(0.70, (v_policy ->> 'consumerDemandMultiplier')::numeric)
  );
  v_earnings_multiple := (
    public.business_valuation_policy_v2(p_game_session_id) ->> 'earningsMultiple'
  )::numeric;

  v_base := greatest(
    0,
    v_cash
      + v_inventory
      + v_equipment
      + v_capability
      + greatest(0, v_profit) * v_earnings_multiple
      - v_debt
  );
  v_value := round(v_base * v_rep_mult * v_macro, 2);

  select snapshot_row.valuation
  into v_previous
  from public.business_valuation_snapshots_v2 as snapshot_row
  where snapshot_row.game_session_id = p_game_session_id
    and snapshot_row.business_id = p_business_id
  order by snapshot_row.as_of desc
  limit 1;
  v_change := round(v_value - coalesce(v_previous, 0), 2);

  if v_profit > 0 then
    v_reasons := v_reasons || jsonb_build_array('Strong recent profitability');
  elsif v_profit < 0 then
    v_reasons := v_reasons || jsonb_build_array('Recent operating losses');
  end if;
  if v_capability > 0 then
    v_reasons := v_reasons || jsonb_build_array('Unlocked productive capability');
  end if;
  if v_debt > 0 then
    v_reasons := v_reasons || jsonb_build_array('Outstanding debt reduces equity value');
  end if;
  if v_rep >= 65 then
    v_reasons := v_reasons || jsonb_build_array('Strong operating reputation');
  elsif v_rep < 40 then
    v_reasons := v_reasons || jsonb_build_array('Weak operating reputation');
  end if;
  if v_macro < 0.95 then
    v_reasons := v_reasons || jsonb_build_array('Recessionary demand outlook');
  elsif v_macro > 1.05 then
    v_reasons := v_reasons || jsonb_build_array('Expansionary demand outlook');
  end if;

  insert into public.business_valuation_snapshots_v2(
    game_session_id,
    business_id,
    as_of,
    valuation,
    change_amount,
    breakdown,
    reasons
  ) values (
    p_game_session_id,
    p_business_id,
    p_as_of,
    v_value,
    v_change,
    jsonb_build_object(
      'cash', v_cash,
      'recentRevenue', v_revenue,
      'recentOperatingProfit', v_profit,
      'earningsMultiple', v_earnings_multiple,
      'finishedInventoryValue', round(v_inventory, 2),
      'equipmentValue', round(v_equipment, 2),
      'capabilityValue', round(v_capability, 2),
      'debt', v_debt,
      'reputationScore', v_rep,
      'reputationMultiplier', v_rep_mult,
      'macroMultiplier', v_macro
    ),
    v_reasons
  ) returning * into v_snapshot;

  update public.business_entities
  set valuation = v_value, version = version + 1
  where id = p_business_id;

  return v_snapshot.public_key;
end
$function$;

revoke all on function public.business_valuation_policy_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.business_valuation_policy_v2(uuid) to service_role;
revoke all on function public.business_distribution_tax_basis_points_v2(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.business_distribution_tax_basis_points_v2(uuid, uuid, date) to service_role;
revoke all on function public.execute_business_distribution_v2(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.execute_business_distribution_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.calculate_business_valuation_v2(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.calculate_business_valuation_v2(uuid, uuid, timestamptz) to service_role;

commit;
