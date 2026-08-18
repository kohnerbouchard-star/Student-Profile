-- Harden V2 governance settlement locking.
-- Aggregate SELECTs cannot carry FOR UPDATE. Lock the participating ownership
-- rows first, then aggregate the stable locked set.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.execute_business_capital_raise_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  issued_units bigint,
  actual_post_money_basis_points integer,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_capital_raise_terms%rowtype;
  v_business public.business_entities%rowtype;
  v_investor_position public.business_ownership_positions%rowtype;
  v_total_units bigint;
  v_new_units bigint;
  v_actual_bps integer;
  v_balance numeric;
  v_investor_balance numeric;
  v_kind text;
  v_tx_key text;
  v_share public.business_corporate_share_structures%rowtype;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'capital_raise'
  for update;
  if not found then
    raise exception 'BUSINESS_CAPITAL_RAISE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_tx_key := 'capital-raise:' || v_proposal.public_key || ':' || p_idempotency_key;
  if v_proposal.status = 'executed' then
    select transaction_row.units
    into v_new_units
    from public.business_ownership_transactions as transaction_row
    where transaction_row.game_session_id = p_game_session_id
      and transaction_row.business_id = v_proposal.business_id
      and transaction_row.idempotency_key = v_tx_key;
    if not found then
      raise exception 'BUSINESS_CAPITAL_RAISE_ALREADY_EXECUTED' using errcode = 'P0001';
    end if;
    select coalesce(sum(units), 0)
    into v_total_units
    from public.business_ownership_positions
    where game_session_id = p_game_session_id
      and business_id = v_proposal.business_id
      and status = 'active';
    v_actual_bps := floor(v_new_units * 10000.0 / nullif(v_total_units, 0))::integer;
    select business_row.* into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = v_proposal.business_id;
    v_balance := public.read_business_balance_v2(
      p_game_session_id,
      v_proposal.business_id,
      v_business.currency_code
    );
    return query select
      v_proposal.public_key,
      v_proposal.status,
      v_new_units,
      v_actual_bps,
      v_balance,
      true;
    return;
  end if;

  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_CAPITAL_RAISE_GOVERNANCE_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;
  if v_proposal.proposer_player_id <> p_player_id then
    raise exception 'BUSINESS_CAPITAL_RAISE_PROPOSER_REQUIRED' using errcode = 'P0001';
  end if;

  select term_row.* into v_term
  from public.business_capital_raise_terms as term_row
  where term_row.game_session_id = p_game_session_id
    and term_row.proposal_id = v_proposal.id
  for update;
  if not found or v_term.investor_accepted_at is null then
    raise exception 'BUSINESS_CAPITAL_RAISE_INVESTOR_ACCEPTANCE_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if v_business.entity_type = 'sole_proprietorship' then
    raise exception 'SOLE_PROPRIETORSHIP_EQUITY_ISSUANCE_PROHIBITED' using errcode = 'P0001';
  end if;

  -- Lock all active positions in deterministic Player order before deriving the
  -- dilution denominator. No ownership mutation can race this settlement.
  perform 1
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
  order by position_row.player_id
  for update;

  select coalesce(sum(position_row.units), 0)
  into v_total_units
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active';
  if v_total_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
  end if;

  v_new_units := ceil(
    v_total_units::numeric * v_term.target_post_money_basis_points
      / (10000 - v_term.target_post_money_basis_points)
  )::bigint;
  if v_new_units <= 0 then
    raise exception 'BUSINESS_CAPITAL_RAISE_DILUTION_INVALID' using errcode = 'P0001';
  end if;
  v_actual_bps := floor(
    v_new_units * 10000.0 / (v_total_units + v_new_units)
  )::integer;

  if v_business.entity_type = 'c_corporation' then
    select share_row.* into v_share
    from public.business_corporate_share_structures as share_row
    where share_row.game_session_id = p_game_session_id
      and share_row.business_id = v_business.id
    for update;
    if not found then
      raise exception 'CORPORATION_SHARE_LEDGER_INVALID' using errcode = 'P0001';
    end if;
    if v_share.issued_shares + v_new_units > v_share.authorized_shares then
      raise exception 'CORPORATION_AUTHORIZED_SHARES_INSUFFICIENT' using errcode = 'P0001';
    end if;
  end if;

  select balance_row.balance into v_investor_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = v_term.investor_player_id
    and balance_row.account_type = 'checking'
    and balance_row.currency_code = v_business.currency_code
  for update;
  if coalesce(v_investor_balance, 0) < v_term.investment_amount then
    raise exception 'BUSINESS_CAPITAL_RAISE_INVESTOR_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  perform public.record_player_ledger_entry(
    p_game_session_id,
    v_term.investor_player_id,
    'checking',
    -v_term.investment_amount,
    v_business.currency_code,
    'debit',
    'business',
    'capital_raise_investment',
    v_proposal.id,
    'player',
    v_term.investor_player_id,
    jsonb_build_object(
      'proposal_key', v_proposal.public_key,
      'business_key', v_business.public_key
    )
  );
  perform public.record_business_ledger_entry_v2(
    p_game_session_id,
    v_business.id,
    v_term.investment_amount,
    v_business.currency_code,
    'credit',
    'business',
    'capital_raise_proceeds',
    v_proposal.id,
    'player',
    v_term.investor_player_id,
    jsonb_build_object('proposal_key', v_proposal.public_key)
  );

  v_kind := public.business_ownership_kind_v2(v_business.entity_type);
  select position_row.* into v_investor_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.player_id = v_term.investor_player_id
    and position_row.status = 'active'
  for update;

  if found then
    update public.business_ownership_positions
    set units = units + v_new_units,
        voting_units = voting_units + v_new_units
    where id = v_investor_position.id;
  else
    insert into public.business_ownership_positions(
      game_session_id,
      business_id,
      player_id,
      ownership_kind,
      units,
      voting_units,
      status,
      effective_at
    ) values (
      p_game_session_id,
      v_business.id,
      v_term.investor_player_id,
      v_kind,
      v_new_units,
      v_new_units,
      'active',
      now()
    );
  end if;

  if v_business.entity_type = 'c_corporation' then
    update public.business_corporate_share_structures
    set issued_shares = issued_shares + v_new_units,
        outstanding_shares = outstanding_shares + v_new_units
    where id = v_share.id;
  end if;

  insert into public.business_ownership_transactions(
    game_session_id,
    business_id,
    transaction_kind,
    ownership_kind,
    from_player_id,
    to_player_id,
    units,
    voting_units,
    consideration_amount,
    currency_code,
    idempotency_key,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    'capital_raise',
    v_kind,
    null,
    v_term.investor_player_id,
    v_new_units,
    v_new_units,
    v_term.investment_amount,
    v_business.currency_code,
    v_tx_key,
    jsonb_build_object(
      'proposal_key', v_proposal.public_key,
      'target_post_money_basis_points', v_term.target_post_money_basis_points,
      'actual_post_money_basis_points', v_actual_bps
    )
  );

  perform public.assert_business_ownership_invariants_v2(
    p_game_session_id,
    v_business.id
  );

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

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
    'business.capital_raise.completed',
    v_proposal.id,
    'capital_raise_completed',
    jsonb_build_object(
      'proposalKey', v_proposal.public_key,
      'investmentAmount', v_term.investment_amount,
      'issuedUnits', v_new_units,
      'actualPostMoneyBasisPoints', v_actual_bps
    )
  );

  v_balance := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );
  return query select
    v_proposal.public_key,
    v_proposal.status,
    v_new_units,
    v_actual_bps,
    v_balance,
    false;
end
$function$;

create or replace function public.execute_business_acquisition_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  offer_amount numeric,
  acquired_business_key text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_acquisition_terms%rowtype;
  v_business public.business_entities%rowtype;
  v_buyer_balance numeric;
  v_total_units bigint;
  v_owner_count integer;
  v_index integer := 0;
  v_remaining numeric;
  v_payout numeric;
  v_owner record;
  v_kind text;
  v_transaction_key text;
  v_new_entity text;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'acquisition'
  for update;
  if not found then
    raise exception 'BUSINESS_ACQUISITION_NOT_FOUND' using errcode = 'P0001';
  end if;

  select term_row.* into v_term
  from public.business_acquisition_terms as term_row
  where term_row.game_session_id = p_game_session_id
    and term_row.proposal_id = v_proposal.id;
  if not found then
    raise exception 'BUSINESS_ACQUISITION_TERMS_MISSING' using errcode = 'P0001';
  end if;
  if v_term.buyer_player_id <> p_player_id then
    raise exception 'BUSINESS_ACQUISITION_BUYER_REQUIRED' using errcode = 'P0001';
  end if;

  if v_proposal.status = 'executed' then
    select business_row.* into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = v_proposal.business_id;
    if not exists (
      select 1
      from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.acquisition.execute'
        and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_ACQUISITION_ALREADY_EXECUTED' using errcode = 'P0001';
    end if;
    return query select
      v_proposal.public_key,
      v_proposal.status,
      v_term.offer_amount,
      v_business.public_key,
      true;
    return;
  end if;

  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_ACQUISITION_75_PERCENT_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  if v_term.offer_amount < round(v_term.valuation_at_offer * 0.70, 2)
    or v_term.offer_amount > round(v_term.valuation_at_offer * 1.30, 2)
  then
    raise exception 'BUSINESS_ACQUISITION_OFFER_OUT_OF_RANGE' using errcode = 'P0001';
  end if;

  select balance_row.balance into v_buyer_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = 'checking'
    and balance_row.currency_code = v_business.currency_code
  for update;
  if coalesce(v_buyer_balance, 0) < v_term.offer_amount then
    raise exception 'BUSINESS_ACQUISITION_BUYER_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  -- Lock all sellers before computing the acquisition denominator.
  perform 1
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
  order by position_row.player_id
  for update;

  select coalesce(sum(units), 0), count(*)::integer
  into v_total_units, v_owner_count
  from public.business_ownership_positions
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status = 'active';
  if v_total_units <= 0 or v_owner_count <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
  end if;

  perform public.record_player_ledger_entry(
    p_game_session_id,
    p_player_id,
    'checking',
    -v_term.offer_amount,
    v_business.currency_code,
    'debit',
    'business',
    'acquisition_purchase',
    v_proposal.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'proposal_key', v_proposal.public_key,
      'business_key', v_business.public_key
    )
  );

  v_remaining := v_term.offer_amount;
  for v_owner in
    select
      position_row.player_id,
      position_row.units,
      position_row.voting_units,
      position_row.ownership_kind
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id
      and position_row.status = 'active'
    order by position_row.player_id
  loop
    v_index := v_index + 1;
    v_payout := case
      when v_index = v_owner_count then v_remaining
      else round(v_term.offer_amount * v_owner.units / v_total_units, 2)
    end;
    v_remaining := round(v_remaining - v_payout, 2);

    perform public.record_player_ledger_entry(
      p_game_session_id,
      v_owner.player_id,
      'checking',
      v_payout,
      v_business.currency_code,
      'credit',
      'business',
      'acquisition_proceeds',
      v_proposal.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'proposal_key', v_proposal.public_key,
        'business_key', v_business.public_key
      )
    );

    v_transaction_key := 'acquisition:' || v_proposal.public_key || ':' || v_owner.player_id::text;
    insert into public.business_ownership_transactions(
      game_session_id,
      business_id,
      transaction_kind,
      ownership_kind,
      from_player_id,
      to_player_id,
      units,
      voting_units,
      consideration_amount,
      currency_code,
      idempotency_key,
      metadata
    ) values (
      p_game_session_id,
      v_business.id,
      'acquisition',
      v_owner.ownership_kind,
      v_owner.player_id,
      p_player_id,
      v_owner.units,
      v_owner.voting_units,
      v_payout,
      v_business.currency_code,
      v_transaction_key,
      jsonb_build_object('proposal_key', v_proposal.public_key)
    );
  end loop;

  update public.business_ownership_positions
  set status = 'exited', ended_at = now()
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status = 'active';

  -- Partnership -> one owner is invalid. Preserve the Business and all of its
  -- state, but convert its legal shell to a single-member LLC at settlement.
  v_new_entity := case
    when v_business.entity_type = 'partnership' then 'llc'
    else v_business.entity_type
  end;
  v_kind := public.business_ownership_kind_v2(v_new_entity);

  insert into public.business_ownership_positions(
    game_session_id,
    business_id,
    player_id,
    ownership_kind,
    units,
    voting_units,
    status,
    effective_at
  ) values (
    p_game_session_id,
    v_business.id,
    p_player_id,
    v_kind,
    v_total_units,
    v_total_units,
    'active',
    now()
  );

  update public.business_entities
  set owner_player_id = p_player_id,
      entity_type = v_new_entity,
      tax_classification = case
        when v_new_entity = 'llc' then 'disregarded'
        else tax_classification
      end,
      version = version + 1
  where id = v_business.id
  returning * into v_business;

  -- Compatibility metadata follows the new controller. business_id remains the
  -- stable monetary owner, so acquisition never empties the company bank account.
  update public.account_balances
  set player_id = p_player_id
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and currency_code = v_business.currency_code;

  update public.player_loans
  set player_id = p_player_id,
      repayment_account_player_id = p_player_id,
      updated_at = now()
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status in ('active', 'delinquent', 'defaulted', 'restructured');

  perform public.assert_business_ownership_invariants_v2(
    p_game_session_id,
    v_business.id
  );

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
    'business.acquisition.execute',
    'business_governance_proposal',
    v_proposal.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'offer_amount', v_term.offer_amount
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
    'business.acquisition.completed',
    v_proposal.id,
    'acquisition_completed',
    jsonb_build_object(
      'offerAmount', v_term.offer_amount,
      'sellerCount', v_owner_count,
      'postAcquisitionEntityType', v_business.entity_type
    )
  );

  return query select
    v_proposal.public_key,
    v_proposal.status,
    v_term.offer_amount,
    v_business.public_key,
    false;
end
$function$;

revoke all on function public.execute_business_capital_raise_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.execute_business_capital_raise_v2(
  uuid, uuid, text, text
) to service_role;

revoke all on function public.execute_business_acquisition_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.execute_business_acquisition_v2(
  uuid, uuid, text, text
) to service_role;

commit;
