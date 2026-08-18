-- Business governance settlements V2.
--
-- Implements governed dilution, distributions, whole-company acquisitions and
-- entity conversions on top of the V2 ownership ledger. All money + ownership
-- settlements are atomic and server calculated.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Protected obligations / solvency reserve
-- ---------------------------------------------------------------------------

create or replace function public.business_protected_obligations_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payroll numeric := 0;
  v_debt_payment numeric := 0;
begin
  select coalesce(sum(employee_row.wage_per_cycle), 0)
  into v_payroll
  from public.business_employees as employee_row
  where employee_row.game_session_id = p_game_session_id
    and employee_row.business_id = p_business_id
    and employee_row.status = 'active';

  select coalesce(sum(loan_row.scheduled_payment), 0)
  into v_debt_payment
  from public.player_loans as loan_row
  where loan_row.game_session_id = p_game_session_id
    and loan_row.business_id = p_business_id
    and loan_row.status in ('active', 'delinquent', 'defaulted', 'restructured');

  return round(greatest(0, v_payroll + v_debt_payment), 2);
end
$function$;

-- ---------------------------------------------------------------------------
-- Capital raises
-- ---------------------------------------------------------------------------

create table if not exists public.business_capital_raise_terms (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  investor_player_id uuid not null,
  investment_amount numeric(14,2) not null,
  target_post_money_basis_points integer not null,
  investor_accepted_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint business_capital_raise_terms_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_capital_raise_terms_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_capital_raise_terms_investor_scope_fk
    foreign key (game_session_id, investor_player_id)
    references public.players(game_session_id, id),
  constraint business_capital_raise_terms_amount_check check (investment_amount > 0),
  constraint business_capital_raise_terms_basis_points_check
    check (target_post_money_basis_points between 1 and 9000),
  constraint business_capital_raise_terms_proposal_unique
    unique (game_session_id, proposal_id),
  constraint business_capital_raise_terms_scope_id_unique
    unique (game_session_id, id)
);

alter table public.business_capital_raise_terms enable row level security;
revoke all on table public.business_capital_raise_terms from public, anon, authenticated;
grant select, insert, update on table public.business_capital_raise_terms to service_role;

create or replace function public.propose_business_capital_raise_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_investor_player_identifier text,
  p_investment_amount numeric,
  p_target_post_money_basis_points integer,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  investment_amount numeric,
  target_post_money_basis_points integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_investor uuid;
  v_result record;
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_capital_raise_terms%rowtype;
  v_terms jsonb;
begin
  if p_investment_amount is null or p_investment_amount <= 0 or p_investment_amount > 10000000 then
    raise exception 'BUSINESS_CAPITAL_RAISE_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  if p_target_post_money_basis_points not between 1 and 9000 then
    raise exception 'BUSINESS_CAPITAL_RAISE_DILUTION_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if v_business.entity_type = 'sole_proprietorship' then
    raise exception 'SOLE_PROPRIETORSHIP_EQUITY_ISSUANCE_PROHIBITED' using errcode = 'P0001';
  end if;

  select player_row.id
  into v_investor
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.player_identifier_normalized = upper(regexp_replace(btrim(coalesce(p_investor_player_identifier, '')), '\s+', '', 'g'))
    and player_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_CAPITAL_RAISE_INVESTOR_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_terms := jsonb_build_object(
    'investmentAmount', round(p_investment_amount, 2),
    'targetPostMoneyBasisPoints', p_target_post_money_basis_points,
    'investorIdentifier', upper(regexp_replace(btrim(p_investor_player_identifier), '\s+', '', 'g'))
  );

  select * into v_result
  from public.create_business_governance_proposal_v2(
    p_game_session_id,
    p_player_id,
    v_business.public_key,
    'capital_raise',
    v_terms,
    p_idempotency_key,
    null
  );

  select proposal_row.*
  into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = v_result.proposal_key;

  select term_row.*
  into v_term
  from public.business_capital_raise_terms as term_row
  where term_row.game_session_id = p_game_session_id
    and term_row.proposal_id = v_proposal.id;
  if not found then
    insert into public.business_capital_raise_terms(
      game_session_id,
      proposal_id,
      business_id,
      investor_player_id,
      investment_amount,
      target_post_money_basis_points
    ) values (
      p_game_session_id,
      v_proposal.id,
      v_business.id,
      v_investor,
      round(p_investment_amount, 2),
      p_target_post_money_basis_points
    ) returning * into v_term;
  elsif v_term.investor_player_id <> v_investor
    or v_term.investment_amount <> round(p_investment_amount, 2)
    or v_term.target_post_money_basis_points <> p_target_post_money_basis_points
  then
    raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
  end if;

  return query select
    v_proposal.public_key,
    v_proposal.status,
    v_term.investment_amount,
    v_term.target_post_money_basis_points,
    v_result.replayed;
end
$function$;

create or replace function public.accept_business_capital_raise_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  accepted boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_capital_raise_terms%rowtype;
  v_replay boolean := false;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.*
  into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'capital_raise'
  for share;
  if not found then
    raise exception 'BUSINESS_CAPITAL_RAISE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_proposal.status not in ('open', 'approved') then
    raise exception 'BUSINESS_CAPITAL_RAISE_NOT_ACCEPTABLE' using errcode = 'P0001';
  end if;

  select term_row.*
  into v_term
  from public.business_capital_raise_terms as term_row
  where term_row.game_session_id = p_game_session_id
    and term_row.proposal_id = v_proposal.id
  for update;
  if not found or v_term.investor_player_id <> p_player_id then
    raise exception 'BUSINESS_CAPITAL_RAISE_INVESTOR_REQUIRED' using errcode = 'P0001';
  end if;

  if v_term.investor_accepted_at is not null then
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.capital_raise.accept'
        and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_CAPITAL_RAISE_ALREADY_ACCEPTED' using errcode = 'P0001';
    end if;
    v_replay := true;
  else
    update public.business_capital_raise_terms
    set investor_accepted_at = now()
    where id = v_term.id;

    insert into public.audit_log(
      game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
    ) values (
      p_game_session_id, 'player', p_player_id,
      'business.capital_raise.accept', 'business_governance_proposal', v_proposal.id,
      jsonb_build_object('idempotency_key', p_idempotency_key, 'proposal_key', v_proposal.public_key)
    );
  end if;

  return query select v_proposal.public_key, true, v_replay;
end
$function$;

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
    select coalesce(sum(units), 0) into v_total_units
    from public.business_ownership_positions
    where game_session_id = p_game_session_id and business_id = v_proposal.business_id and status = 'active';
    v_actual_bps := floor(v_new_units * 10000.0 / nullif(v_total_units, 0))::integer;
    select currency_code into v_business.currency_code
    from public.business_entities where id = v_proposal.business_id;
    v_balance := public.read_business_balance_v2(p_game_session_id, v_proposal.business_id, v_business.currency_code);
    return query select v_proposal.public_key, v_proposal.status, v_new_units, v_actual_bps, v_balance, true;
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
  where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id
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

  select coalesce(sum(position_row.units), 0)
  into v_total_units
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
  for update;
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
  v_actual_bps := floor(v_new_units * 10000.0 / (v_total_units + v_new_units))::integer;

  if v_business.entity_type = 'c_corporation' then
    select share_row.* into v_share
    from public.business_corporate_share_structures as share_row
    where share_row.game_session_id = p_game_session_id and share_row.business_id = v_business.id
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
    p_game_session_id, v_term.investor_player_id, 'checking', -v_term.investment_amount,
    v_business.currency_code, 'debit', 'business', 'capital_raise_investment',
    v_proposal.id, 'player', v_term.investor_player_id,
    jsonb_build_object('proposal_key', v_proposal.public_key, 'business_key', v_business.public_key)
  );
  perform public.record_business_ledger_entry_v2(
    p_game_session_id, v_business.id, v_term.investment_amount,
    v_business.currency_code, 'credit', 'business', 'capital_raise_proceeds',
    v_proposal.id, 'player', v_term.investor_player_id,
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
    set units = units + v_new_units, voting_units = voting_units + v_new_units
    where id = v_investor_position.id;
  else
    insert into public.business_ownership_positions(
      game_session_id, business_id, player_id, ownership_kind,
      units, voting_units, status, effective_at
    ) values (
      p_game_session_id, v_business.id, v_term.investor_player_id, v_kind,
      v_new_units, v_new_units, 'active', now()
    );
  end if;

  if v_business.entity_type = 'c_corporation' then
    update public.business_corporate_share_structures
    set
      issued_shares = issued_shares + v_new_units,
      outstanding_shares = outstanding_shares + v_new_units
    where id = v_share.id;
  end if;

  insert into public.business_ownership_transactions(
    game_session_id, business_id, transaction_kind, ownership_kind,
    from_player_id, to_player_id, units, voting_units, consideration_amount,
    currency_code, idempotency_key, metadata
  ) values (
    p_game_session_id, v_business.id, 'capital_raise', v_kind,
    null, v_term.investor_player_id, v_new_units, v_new_units,
    v_term.investment_amount, v_business.currency_code, v_tx_key,
    jsonb_build_object(
      'proposal_key', v_proposal.public_key,
      'target_post_money_basis_points', v_term.target_post_money_basis_points,
      'actual_post_money_basis_points', v_actual_bps
    )
  );

  perform public.assert_business_ownership_invariants_v2(p_game_session_id, v_business.id);

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.capital_raise.completed', v_proposal.id, 'capital_raise_completed',
    jsonb_build_object(
      'proposalKey', v_proposal.public_key,
      'investmentAmount', v_term.investment_amount,
      'issuedUnits', v_new_units,
      'actualPostMoneyBasisPoints', v_actual_bps
    )
  );

  v_balance := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  return query select v_proposal.public_key, v_proposal.status, v_new_units, v_actual_bps, v_balance, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Owner distributions / dividends
-- ---------------------------------------------------------------------------

create table if not exists public.business_distribution_terms (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  gross_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint business_distribution_terms_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_distribution_terms_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_distribution_terms_amount_check check (gross_amount > 0),
  constraint business_distribution_terms_proposal_unique unique (game_session_id, proposal_id)
);

create table if not exists public.business_distribution_payments (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  player_id uuid not null,
  ownership_units bigint not null,
  gross_amount numeric(14,2) not null,
  ledger_entry_id uuid null references public.ledger_entries(id),
  created_at timestamptz not null default now(),
  constraint business_distribution_payments_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete restrict,
  constraint business_distribution_payments_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_distribution_payments_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_distribution_payments_units_check check (ownership_units > 0),
  constraint business_distribution_payments_amount_check check (gross_amount >= 0),
  constraint business_distribution_payments_unique unique (game_session_id, proposal_id, player_id)
);

alter table public.business_distribution_terms enable row level security;
alter table public.business_distribution_payments enable row level security;
revoke all on table public.business_distribution_terms from public, anon, authenticated;
revoke all on table public.business_distribution_payments from public, anon, authenticated;
grant select, insert on table public.business_distribution_terms to service_role;
grant select, insert on table public.business_distribution_payments to service_role;

create or replace function public.propose_business_distribution_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_amount numeric,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  amount numeric,
  protected_obligations numeric,
  cash_before numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_result record;
  v_proposal public.business_governance_proposals%rowtype;
  v_protected numeric;
  v_cash numeric;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'BUSINESS_DISTRIBUTION_AMOUNT_INVALID' using errcode = 'P0001';
  end if;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational';
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  v_protected := public.business_protected_obligations_v2(p_game_session_id, v_business.id);
  if v_cash - p_amount < v_protected then
    raise exception 'BUSINESS_DISTRIBUTION_SOLVENCY_CHECK_FAILED' using errcode = 'P0001';
  end if;

  select * into v_result
  from public.create_business_governance_proposal_v2(
    p_game_session_id, p_player_id, v_business.public_key, 'distribution',
    jsonb_build_object(
      'amount', round(p_amount, 2),
      'cashBefore', v_cash,
      'protectedObligations', v_protected,
      'cashAfterEstimated', round(v_cash - p_amount, 2)
    ),
    p_idempotency_key,
    null
  );
  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id and proposal_row.public_key = v_result.proposal_key;

  insert into public.business_distribution_terms(game_session_id, proposal_id, business_id, gross_amount)
  values (p_game_session_id, v_proposal.id, v_business.id, round(p_amount, 2))
  on conflict (game_session_id, proposal_id) do nothing;

  return query select v_proposal.public_key, v_proposal.status, round(p_amount, 2), v_protected, v_cash, v_result.replayed;
end
$function$;

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
  v_payout numeric;
  v_owner record;
  v_ledger record;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'distribution'
  for update;
  if not found then
    raise exception 'BUSINESS_DISTRIBUTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_proposal.status = 'executed' then
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.distribution.execute'
        and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_DISTRIBUTION_ALREADY_EXECUTED' using errcode = 'P0001';
    end if;
    select term_row.* into v_term from public.business_distribution_terms as term_row
    where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id;
    select business_row.* into v_business from public.business_entities as business_row
    where business_row.id = v_proposal.business_id;
    v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
    return query select v_proposal.public_key, v_proposal.status, v_term.gross_amount, v_cash, true;
    return;
  end if;
  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_DISTRIBUTION_GOVERNANCE_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_governance_voter_snapshots as voter_row
    where voter_row.game_session_id = p_game_session_id
      and voter_row.proposal_id = v_proposal.id
      and voter_row.player_id = p_player_id
  ) then
    raise exception 'BUSINESS_GOVERNANCE_AUTHORITY_REQUIRED' using errcode = 'P0001';
  end if;

  select term_row.* into v_term from public.business_distribution_terms as term_row
  where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id;
  if not found then raise exception 'BUSINESS_DISTRIBUTION_TERMS_MISSING' using errcode = 'P0001'; end if;
  select business_row.* into v_business from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed' and business_row.formation_state = 'operational'
  for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;

  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  v_protected := public.business_protected_obligations_v2(p_game_session_id, v_business.id);
  if v_cash - v_term.gross_amount < v_protected then
    raise exception 'BUSINESS_DISTRIBUTION_SOLVENCY_CHECK_FAILED' using errcode = 'P0001';
  end if;

  select coalesce(sum(units), 0), count(*)::integer into v_total_units, v_owner_count
  from public.business_ownership_positions
  where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';
  if v_total_units <= 0 or v_owner_count <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
  end if;

  perform public.record_business_ledger_entry_v2(
    p_game_session_id, v_business.id, -v_term.gross_amount, v_business.currency_code,
    'debit', 'business', 'owner_distribution', v_proposal.id,
    'player', p_player_id, jsonb_build_object('proposal_key', v_proposal.public_key)
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
    v_payout := case when v_index = v_owner_count
      then v_remaining
      else round(v_term.gross_amount * v_owner.units / v_total_units, 2)
    end;
    v_remaining := round(v_remaining - v_payout, 2);

    select * into v_ledger
    from public.record_player_ledger_entry(
      p_game_session_id, v_owner.player_id, 'checking', v_payout,
      v_business.currency_code, 'credit', 'business', 'owner_distribution',
      v_proposal.id, 'player', p_player_id,
      jsonb_build_object('proposal_key', v_proposal.public_key, 'business_key', v_business.public_key)
    );

    insert into public.business_distribution_payments(
      game_session_id, proposal_id, business_id, player_id,
      ownership_units, gross_amount, ledger_entry_id
    ) values (
      p_game_session_id, v_proposal.id, v_business.id, v_owner.player_id,
      v_owner.units, v_payout, v_ledger.ledger_entry_id
    );
  end loop;

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.audit_log(
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.distribution.execute',
    'business_governance_proposal', v_proposal.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'amount', v_term.gross_amount)
  );
  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.distribution.completed', v_proposal.id, 'distribution_completed',
    jsonb_build_object('amount', v_term.gross_amount, 'ownerCount', v_owner_count)
  );

  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  return query select v_proposal.public_key, v_proposal.status, v_term.gross_amount, v_cash, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Whole-company acquisition offers (70%-130% of server valuation, 75% vote)
-- ---------------------------------------------------------------------------

create table if not exists public.business_acquisition_terms (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  buyer_player_id uuid not null,
  valuation_at_offer numeric(14,2) not null,
  offer_amount numeric(14,2) not null,
  premium_discount_basis_points integer not null,
  created_at timestamptz not null default now(),
  constraint business_acquisition_terms_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_acquisition_terms_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_acquisition_terms_buyer_scope_fk
    foreign key (game_session_id, buyer_player_id)
    references public.players(game_session_id, id),
  constraint business_acquisition_terms_valuation_check check (valuation_at_offer >= 0),
  constraint business_acquisition_terms_offer_check check (offer_amount >= 0),
  constraint business_acquisition_terms_premium_check
    check (premium_discount_basis_points between -3000 and 3000),
  constraint business_acquisition_terms_proposal_unique unique (game_session_id, proposal_id)
);

alter table public.business_acquisition_terms enable row level security;
revoke all on table public.business_acquisition_terms from public, anon, authenticated;
grant select, insert on table public.business_acquisition_terms to service_role;

create or replace function public.create_business_acquisition_offer_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_offer_amount numeric,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  valuation numeric,
  offer_amount numeric,
  premium_discount_basis_points integer,
  approval_threshold_basis_points integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_proposal public.business_governance_proposals%rowtype;
  v_total_votes bigint;
  v_bps integer;
  v_existing public.business_acquisition_terms%rowtype;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;
  if v_business.valuation <= 0 then
    raise exception 'BUSINESS_ACQUISITION_VALUATION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_offer_amount < round(v_business.valuation * 0.70, 2)
    or p_offer_amount > round(v_business.valuation * 1.30, 2)
  then
    raise exception 'BUSINESS_ACQUISITION_OFFER_OUT_OF_RANGE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.business_ownership_positions
    where game_session_id = p_game_session_id and business_id = v_business.id
      and player_id = p_player_id and status = 'active'
  ) then
    raise exception 'BUSINESS_ACQUISITION_BUYER_ALREADY_OWNER' using errcode = 'P0001';
  end if;

  select term_row.* into v_existing
  from public.business_acquisition_terms as term_row
  join public.business_governance_proposals as proposal_row
    on proposal_row.game_session_id = term_row.game_session_id and proposal_row.id = term_row.proposal_id
  where term_row.game_session_id = p_game_session_id
    and term_row.business_id = v_business.id
    and term_row.buyer_player_id = p_player_id
    and proposal_row.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.offer_amount <> round(p_offer_amount, 2) then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select proposal_row.* into v_proposal from public.business_governance_proposals as proposal_row
    where proposal_row.id = v_existing.proposal_id;
    return query select
      v_proposal.public_key, v_proposal.status, v_existing.valuation_at_offer,
      v_existing.offer_amount, v_existing.premium_discount_basis_points,
      v_proposal.approval_threshold_basis_points, true;
    return;
  end if;

  if exists (
    select 1 from public.business_governance_proposals as proposal_row
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.business_id = v_business.id
      and proposal_row.proposal_type = 'acquisition'
      and proposal_row.status in ('open', 'approved')
  ) then
    raise exception 'BUSINESS_ACQUISITION_OFFER_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  select coalesce(sum(voting_units), 0) into v_total_votes
  from public.business_ownership_positions
  where game_session_id = p_game_session_id and business_id = v_business.id
    and status = 'active' and voting_units > 0;
  if v_total_votes <= 0 then raise exception 'BUSINESS_GOVERNANCE_NO_VOTING_UNITS' using errcode = 'P0001'; end if;
  v_bps := round((p_offer_amount / v_business.valuation - 1) * 10000)::integer;

  insert into public.business_governance_proposals(
    game_session_id, business_id, proposer_player_id, proposal_type, status,
    approval_threshold_basis_points, snapshot_total_voting_units,
    terms, idempotency_key, expires_at
  ) values (
    p_game_session_id, v_business.id, p_player_id, 'acquisition', 'open',
    7500, v_total_votes,
    jsonb_build_object(
      'valuation', v_business.valuation,
      'offerAmount', round(p_offer_amount, 2),
      'premiumDiscountBasisPoints', v_bps
    ),
    p_idempotency_key, now() + interval '7 days'
  ) returning * into v_proposal;

  insert into public.business_governance_voter_snapshots(game_session_id, proposal_id, player_id, voting_units)
  select p_game_session_id, v_proposal.id, position_row.player_id, position_row.voting_units
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active' and position_row.voting_units > 0;

  insert into public.business_acquisition_terms(
    game_session_id, proposal_id, business_id, buyer_player_id,
    valuation_at_offer, offer_amount, premium_discount_basis_points
  ) values (
    p_game_session_id, v_proposal.id, v_business.id, p_player_id,
    v_business.valuation, round(p_offer_amount, 2), v_bps
  );

  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.acquisition.offered', v_proposal.id, 'acquisition_offer_created',
    jsonb_build_object(
      'proposalKey', v_proposal.public_key,
      'valuation', v_business.valuation,
      'offerAmount', round(p_offer_amount, 2),
      'premiumDiscountBasisPoints', v_bps,
      'approvalThresholdBasisPoints', 7500
    )
  );

  return query select
    v_proposal.public_key, v_proposal.status, v_business.valuation,
    round(p_offer_amount, 2), v_bps, 7500, false;
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
  if not found then raise exception 'BUSINESS_ACQUISITION_NOT_FOUND' using errcode = 'P0001'; end if;
  select term_row.* into v_term
  from public.business_acquisition_terms as term_row
  where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id;
  if not found then raise exception 'BUSINESS_ACQUISITION_TERMS_MISSING' using errcode = 'P0001'; end if;
  if v_term.buyer_player_id <> p_player_id then
    raise exception 'BUSINESS_ACQUISITION_BUYER_REQUIRED' using errcode = 'P0001';
  end if;

  if v_proposal.status = 'executed' then
    select business_row.* into v_business from public.business_entities as business_row where business_row.id = v_proposal.business_id;
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.acquisition.execute' and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then raise exception 'BUSINESS_ACQUISITION_ALREADY_EXECUTED' using errcode = 'P0001'; end if;
    return query select v_proposal.public_key, v_proposal.status, v_term.offer_amount, v_business.public_key, true;
    return;
  end if;
  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_ACQUISITION_75_PERCENT_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed' and business_row.formation_state = 'operational'
  for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;

  -- Offer remains bounded to the valuation captured at offer creation. Repricing
  -- requires a new offer; owners never vote on a silently changed price.
  if v_term.offer_amount < round(v_term.valuation_at_offer * 0.70, 2)
    or v_term.offer_amount > round(v_term.valuation_at_offer * 1.30, 2)
  then raise exception 'BUSINESS_ACQUISITION_OFFER_OUT_OF_RANGE' using errcode = 'P0001'; end if;

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

  select coalesce(sum(units), 0), count(*)::integer into v_total_units, v_owner_count
  from public.business_ownership_positions
  where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active'
  for update;
  if v_total_units <= 0 or v_owner_count <= 0 then raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001'; end if;

  perform public.record_player_ledger_entry(
    p_game_session_id, p_player_id, 'checking', -v_term.offer_amount,
    v_business.currency_code, 'debit', 'business', 'acquisition_purchase',
    v_proposal.id, 'player', p_player_id,
    jsonb_build_object('proposal_key', v_proposal.public_key, 'business_key', v_business.public_key)
  );

  v_remaining := v_term.offer_amount;
  for v_owner in
    select position_row.player_id, position_row.units, position_row.voting_units, position_row.ownership_kind
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id and position_row.status = 'active'
    order by position_row.player_id
  loop
    v_index := v_index + 1;
    v_payout := case when v_index = v_owner_count
      then v_remaining
      else round(v_term.offer_amount * v_owner.units / v_total_units, 2)
    end;
    v_remaining := round(v_remaining - v_payout, 2);

    perform public.record_player_ledger_entry(
      p_game_session_id, v_owner.player_id, 'checking', v_payout,
      v_business.currency_code, 'credit', 'business', 'acquisition_proceeds',
      v_proposal.id, 'player', p_player_id,
      jsonb_build_object('proposal_key', v_proposal.public_key, 'business_key', v_business.public_key)
    );

    v_transaction_key := 'acquisition:' || v_proposal.public_key || ':' || v_owner.player_id::text;
    insert into public.business_ownership_transactions(
      game_session_id, business_id, transaction_kind, ownership_kind,
      from_player_id, to_player_id, units, voting_units, consideration_amount,
      currency_code, idempotency_key, metadata
    ) values (
      p_game_session_id, v_business.id, 'acquisition', v_owner.ownership_kind,
      v_owner.player_id, p_player_id, v_owner.units, v_owner.voting_units,
      v_payout, v_business.currency_code, v_transaction_key,
      jsonb_build_object('proposal_key', v_proposal.public_key)
    );
  end loop;

  update public.business_ownership_positions
  set status = 'exited', ended_at = now()
  where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';

  -- A partnership cannot continue with one partner. Whole-company acquisition
  -- therefore converts it to a single-member LLC atomically rather than leaving
  -- an invalid entity behind. The business itself and all assets/history persist.
  v_new_entity := case when v_business.entity_type = 'partnership' then 'llc' else v_business.entity_type end;
  v_kind := public.business_ownership_kind_v2(v_new_entity);

  insert into public.business_ownership_positions(
    game_session_id, business_id, player_id, ownership_kind, units, voting_units,
    status, effective_at
  ) values (
    p_game_session_id, v_business.id, p_player_id, v_kind,
    v_total_units, v_total_units, 'active', now()
  );

  update public.business_entities
  set
    owner_player_id = p_player_id,
    entity_type = v_new_entity,
    tax_classification = case when v_new_entity = 'llc' then 'disregarded' else tax_classification end,
    version = version + 1
  where id = v_business.id
  returning * into v_business;

  -- Keep legacy Player-scoped balance metadata aligned with the new controller;
  -- stable monetary ownership remains account_balances.business_id.
  update public.account_balances
  set player_id = p_player_id
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and currency_code = v_business.currency_code;

  update public.player_loans
  set
    player_id = p_player_id,
    repayment_account_player_id = p_player_id,
    updated_at = now()
  where game_session_id = p_game_session_id
    and business_id = v_business.id
    and status in ('active', 'delinquent', 'defaulted', 'restructured');

  if v_business.entity_type = 'c_corporation' then
    update public.business_ownership_positions
    set ownership_kind = 'share'
    where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';
  elsif v_business.entity_type = 'llc' then
    update public.business_ownership_positions
    set ownership_kind = 'membership_interest'
    where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';
  end if;

  perform public.assert_business_ownership_invariants_v2(p_game_session_id, v_business.id);

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.audit_log(
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.acquisition.execute',
    'business_governance_proposal', v_proposal.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'offer_amount', v_term.offer_amount)
  );
  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.acquisition.completed', v_proposal.id, 'acquisition_completed',
    jsonb_build_object(
      'offerAmount', v_term.offer_amount,
      'sellerCount', v_owner_count,
      'postAcquisitionEntityType', v_business.entity_type
    )
  );

  return query select v_proposal.public_key, v_proposal.status, v_term.offer_amount, v_business.public_key, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Entity conversions
-- ---------------------------------------------------------------------------

create table if not exists public.business_entity_conversion_terms (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  from_entity_type text not null,
  to_entity_type text not null,
  filing_fee numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint business_entity_conversion_terms_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_entity_conversion_terms_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_entity_conversion_terms_path_check check (
    (from_entity_type = 'sole_proprietorship' and to_entity_type = 'llc')
    or (from_entity_type = 'partnership' and to_entity_type = 'llc')
    or (from_entity_type = 'llc' and to_entity_type = 'c_corporation')
  ),
  constraint business_entity_conversion_terms_fee_check check (filing_fee >= 0),
  constraint business_entity_conversion_terms_proposal_unique unique (game_session_id, proposal_id)
);

alter table public.business_entity_conversion_terms enable row level security;
revoke all on table public.business_entity_conversion_terms from public, anon, authenticated;
grant select, insert on table public.business_entity_conversion_terms to service_role;

create or replace function public.propose_business_entity_conversion_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_target_entity_type text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  from_entity_type text,
  to_entity_type text,
  filing_fee numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_target text := lower(btrim(coalesce(p_target_entity_type, '')));
  v_fee numeric;
  v_result record;
  v_proposal public.business_governance_proposals%rowtype;
begin
  select business_row.* into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed' and business_row.formation_state = 'operational';
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;
  if not (
    (v_business.entity_type = 'sole_proprietorship' and v_target = 'llc')
    or (v_business.entity_type = 'partnership' and v_target = 'llc')
    or (v_business.entity_type = 'llc' and v_target = 'c_corporation')
  ) then raise exception 'BUSINESS_ENTITY_CONVERSION_PATH_INVALID' using errcode = 'P0001'; end if;

  v_fee := round(public.business_formation_fee_v2(p_game_session_id, v_target) * 0.75, 2);
  select * into v_result
  from public.create_business_governance_proposal_v2(
    p_game_session_id, p_player_id, v_business.public_key, 'entity_conversion',
    jsonb_build_object(
      'fromEntityType', v_business.entity_type,
      'toEntityType', v_target,
      'filingFee', v_fee
    ),
    p_idempotency_key,
    null
  );
  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id and proposal_row.public_key = v_result.proposal_key;

  insert into public.business_entity_conversion_terms(
    game_session_id, proposal_id, business_id, from_entity_type, to_entity_type, filing_fee
  ) values (
    p_game_session_id, v_proposal.id, v_business.id, v_business.entity_type, v_target, v_fee
  ) on conflict (game_session_id, proposal_id) do nothing;

  return query select
    v_proposal.public_key, v_proposal.status, v_business.entity_type, v_target, v_fee, v_result.replayed;
end
$function$;

create or replace function public.execute_business_entity_conversion_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  entity_type text,
  tax_classification text,
  filing_fee numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_term public.business_entity_conversion_terms%rowtype;
  v_business public.business_entities%rowtype;
  v_cash numeric;
  v_protected numeric;
  v_total_units bigint;
  v_owner_count integer;
  v_owner record;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'entity_conversion'
  for update;
  if not found then raise exception 'BUSINESS_ENTITY_CONVERSION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_proposal.status = 'executed' then
    select term_row.* into v_term from public.business_entity_conversion_terms as term_row
    where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id;
    select business_row.* into v_business from public.business_entities as business_row where business_row.id = v_proposal.business_id;
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.entity_conversion.execute' and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then raise exception 'BUSINESS_ENTITY_CONVERSION_ALREADY_EXECUTED' using errcode = 'P0001'; end if;
    return query select v_proposal.public_key, v_proposal.status, v_business.entity_type, v_business.tax_classification, v_term.filing_fee, true;
    return;
  end if;
  if v_proposal.status <> 'approved' then
    raise exception 'BUSINESS_ENTITY_CONVERSION_GOVERNANCE_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_governance_voter_snapshots as voter_row
    where voter_row.game_session_id = p_game_session_id and voter_row.proposal_id = v_proposal.id
      and voter_row.player_id = p_player_id
  ) then raise exception 'BUSINESS_GOVERNANCE_AUTHORITY_REQUIRED' using errcode = 'P0001'; end if;

  select term_row.* into v_term from public.business_entity_conversion_terms as term_row
  where term_row.game_session_id = p_game_session_id and term_row.proposal_id = v_proposal.id;
  select business_row.* into v_business from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed' and business_row.formation_state = 'operational'
  for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;
  if v_business.entity_type <> v_term.from_entity_type then
    raise exception 'BUSINESS_ENTITY_CONVERSION_SOURCE_CHANGED' using errcode = 'P0001';
  end if;

  v_cash := public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code);
  v_protected := public.business_protected_obligations_v2(p_game_session_id, v_business.id);
  if v_cash - v_term.filing_fee < v_protected then
    raise exception 'BUSINESS_ENTITY_CONVERSION_SOLVENCY_CHECK_FAILED' using errcode = 'P0001';
  end if;
  if v_term.filing_fee > 0 then
    perform public.record_business_ledger_entry_v2(
      p_game_session_id, v_business.id, -v_term.filing_fee, v_business.currency_code,
      'debit', 'business', 'entity_conversion_fee', v_proposal.id,
      'player', p_player_id, jsonb_build_object('proposal_key', v_proposal.public_key)
    );
  end if;

  select coalesce(sum(units), 0), count(*)::integer into v_total_units, v_owner_count
  from public.business_ownership_positions
  where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';

  if v_term.to_entity_type = 'llc' then
    update public.business_ownership_positions
    set ownership_kind = 'membership_interest'
    where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';
  elsif v_term.to_entity_type = 'c_corporation' then
    update public.business_ownership_positions
    set ownership_kind = 'share'
    where game_session_id = p_game_session_id and business_id = v_business.id and status = 'active';
    insert into public.business_corporate_share_structures(
      game_session_id, business_id, authorized_shares, issued_shares, treasury_shares, outstanding_shares
    ) values (
      p_game_session_id, v_business.id, greatest(1000000, v_total_units * 10),
      v_total_units, 0, v_total_units
    ) on conflict (game_session_id, business_id) do update set
      authorized_shares = greatest(public.business_corporate_share_structures.authorized_shares, excluded.authorized_shares),
      issued_shares = excluded.issued_shares,
      treasury_shares = 0,
      outstanding_shares = excluded.outstanding_shares;
  end if;

  for v_owner in
    select position_row.player_id, position_row.units, position_row.voting_units
    from public.business_ownership_positions as position_row
    where position_row.game_session_id = p_game_session_id
      and position_row.business_id = v_business.id and position_row.status = 'active'
  loop
    insert into public.business_ownership_transactions(
      game_session_id, business_id, transaction_kind, ownership_kind,
      from_player_id, to_player_id, units, voting_units, consideration_amount,
      currency_code, idempotency_key, metadata
    ) values (
      p_game_session_id, v_business.id, 'conversion', public.business_ownership_kind_v2(v_term.to_entity_type),
      v_owner.player_id, v_owner.player_id, v_owner.units, v_owner.voting_units, 0,
      v_business.currency_code,
      'conversion:' || v_proposal.public_key || ':' || v_owner.player_id::text,
      jsonb_build_object('from_entity_type', v_term.from_entity_type, 'to_entity_type', v_term.to_entity_type)
    );
  end loop;

  update public.business_entities
  set
    formation_state = 'converting',
    entity_type = v_term.to_entity_type,
    tax_classification = public.business_default_tax_classification_v2(v_term.to_entity_type, v_owner_count),
    version = version + 1
  where id = v_business.id
  returning * into v_business;

  update public.business_entities
  set formation_state = 'operational'
  where id = v_business.id
  returning * into v_business;

  perform public.assert_business_ownership_invariants_v2(p_game_session_id, v_business.id);

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.audit_log(
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.entity_conversion.execute',
    'business_governance_proposal', v_proposal.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'to_entity_type', v_business.entity_type)
  );
  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.entity_converted', v_proposal.id, 'entity_conversion_completed',
    jsonb_build_object(
      'fromEntityType', v_term.from_entity_type,
      'toEntityType', v_business.entity_type,
      'taxClassification', v_business.tax_classification,
      'filingFee', v_term.filing_fee
    )
  );

  return query select v_proposal.public_key, v_proposal.status, v_business.entity_type, v_business.tax_classification, v_term.filing_fee, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Dissolution initiation (liquidation settlement is completed in failure phase)
-- ---------------------------------------------------------------------------

create table if not exists public.business_liquidations (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('liq_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  business_id uuid not null,
  liquidation_type text not null,
  status text not null default 'approved_to_wind_up',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint business_liquidations_public_key_check check (public_key ~ '^liq_[0-9a-f]{32}$'),
  constraint business_liquidations_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete restrict,
  constraint business_liquidations_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete restrict,
  constraint business_liquidations_type_check check (liquidation_type in ('voluntary', 'forced')),
  constraint business_liquidations_status_check check (
    status in ('approved_to_wind_up', 'settling_obligations', 'liquidating_assets', 'distributing_residual', 'completed')
  ),
  constraint business_liquidations_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint business_liquidations_proposal_unique unique (game_session_id, proposal_id)
);

alter table public.business_liquidations enable row level security;
revoke all on table public.business_liquidations from public, anon, authenticated;
grant select, insert, update on table public.business_liquidations to service_role;

create or replace function public.propose_business_dissolution_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_reason text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  approval_threshold_basis_points integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result record;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'BUSINESS_DISSOLUTION_REASON_INVALID' using errcode = 'P0001';
  end if;
  select * into v_result
  from public.create_business_governance_proposal_v2(
    p_game_session_id, p_player_id, p_business_key, 'dissolution',
    jsonb_build_object('reason', btrim(p_reason)),
    p_idempotency_key, null
  );
  return query select v_result.proposal_key, v_result.status, v_result.approval_threshold_basis_points, v_result.replayed;
end
$function$;

create or replace function public.begin_business_dissolution_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  liquidation_key text,
  business_status text,
  formation_state text,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_business public.business_entities%rowtype;
  v_liquidation public.business_liquidations%rowtype;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select proposal_row.* into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
    and proposal_row.proposal_type = 'dissolution'
  for update;
  if not found then raise exception 'BUSINESS_DISSOLUTION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_proposal.status = 'executed' then
    select liquidation_row.* into v_liquidation
    from public.business_liquidations as liquidation_row
    where liquidation_row.game_session_id = p_game_session_id and liquidation_row.proposal_id = v_proposal.id;
    select business_row.* into v_business from public.business_entities as business_row where business_row.id = v_proposal.business_id;
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.dissolution.begin' and audit_row.target_id = v_proposal.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then raise exception 'BUSINESS_DISSOLUTION_ALREADY_STARTED' using errcode = 'P0001'; end if;
    return query select v_proposal.public_key, v_liquidation.public_key, v_business.status, v_business.formation_state, true;
    return;
  end if;
  if v_proposal.status <> 'approved' or v_proposal.approval_threshold_basis_points <> 7500 then
    raise exception 'BUSINESS_DISSOLUTION_75_PERCENT_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_governance_voter_snapshots as voter_row
    where voter_row.game_session_id = p_game_session_id and voter_row.proposal_id = v_proposal.id
      and voter_row.player_id = p_player_id
  ) then raise exception 'BUSINESS_GOVERNANCE_AUTHORITY_REQUIRED' using errcode = 'P0001'; end if;

  select business_row.* into v_business from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id and business_row.id = v_proposal.business_id
    and business_row.status <> 'closed' and business_row.formation_state = 'operational'
  for update;
  if not found then raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001'; end if;

  update public.business_entities
  set formation_state = 'winding_up', status = 'restructuring', version = version + 1
  where id = v_business.id
  returning * into v_business;

  insert into public.business_liquidations(
    game_session_id, proposal_id, business_id, liquidation_type, status,
    metadata
  ) values (
    p_game_session_id, v_proposal.id, v_business.id, 'voluntary', 'approved_to_wind_up',
    jsonb_build_object(
      'reason', v_proposal.terms ->> 'reason',
      'protectedObligationsAtStart', public.business_protected_obligations_v2(p_game_session_id, v_business.id),
      'cashAtStart', public.read_business_balance_v2(p_game_session_id, v_business.id, v_business.currency_code)
    )
  ) returning * into v_liquidation;

  update public.business_governance_proposals
  set status = 'executed', executed_at = now()
  where id = v_proposal.id
  returning * into v_proposal;

  insert into public.audit_log(
    game_session_id, actor_type, actor_id, action, target_type, target_id, metadata
  ) values (
    p_game_session_id, 'player', p_player_id, 'business.dissolution.begin',
    'business_governance_proposal', v_proposal.id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'liquidation_key', v_liquidation.public_key)
  );
  insert into public.business_activity_events(
    game_session_id, business_id, actor_type, actor_player_id,
    event_type, source_id, reason_code, metadata
  ) values (
    p_game_session_id, v_business.id, 'player', p_player_id,
    'business.dissolution.started', v_liquidation.id, 'voluntary_dissolution_started',
    jsonb_build_object('liquidationKey', v_liquidation.public_key)
  );

  return query select v_proposal.public_key, v_liquidation.public_key, v_business.status, v_business.formation_state, false;
end
$function$;

-- Grants
revoke all on function public.business_protected_obligations_v2(uuid, uuid) from public, anon, authenticated;
grant execute on function public.business_protected_obligations_v2(uuid, uuid) to service_role;
revoke all on function public.propose_business_capital_raise_v2(uuid, uuid, text, text, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.propose_business_capital_raise_v2(uuid, uuid, text, text, numeric, integer, text) to service_role;
revoke all on function public.accept_business_capital_raise_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.accept_business_capital_raise_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.execute_business_capital_raise_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.execute_business_capital_raise_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.propose_business_distribution_v2(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.propose_business_distribution_v2(uuid, uuid, text, numeric, text) to service_role;
revoke all on function public.execute_business_distribution_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.execute_business_distribution_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.create_business_acquisition_offer_v2(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.create_business_acquisition_offer_v2(uuid, uuid, text, numeric, text) to service_role;
revoke all on function public.execute_business_acquisition_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.execute_business_acquisition_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.propose_business_entity_conversion_v2(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.propose_business_entity_conversion_v2(uuid, uuid, text, text, text) to service_role;
revoke all on function public.execute_business_entity_conversion_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.execute_business_entity_conversion_v2(uuid, uuid, text, text) to service_role;
revoke all on function public.propose_business_dissolution_v2(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.propose_business_dissolution_v2(uuid, uuid, text, text, text) to service_role;
revoke all on function public.begin_business_dissolution_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_business_dissolution_v2(uuid, uuid, text, text) to service_role;

commit;
