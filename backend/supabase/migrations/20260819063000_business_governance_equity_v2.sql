-- Business governance + ownership transfer foundation V2.
--
-- Ownership is server-authoritative. Player commands create decisions/offers;
-- money and ownership settle in one database transaction.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Generic governance proposal/voter snapshot/votes
-- ---------------------------------------------------------------------------

create table if not exists public.business_governance_proposals (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bgp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  proposer_player_id uuid not null,
  proposal_type text not null,
  status text not null default 'open',
  approval_threshold_basis_points integer not null,
  snapshot_total_voting_units bigint not null,
  terms jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  expires_at timestamptz not null,
  resolved_at timestamptz null,
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_governance_proposals_public_key_check
    check (public_key ~ '^bgp_[0-9a-f]{32}$'),
  constraint business_governance_proposals_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_governance_proposals_proposer_scope_fk
    foreign key (game_session_id, proposer_player_id)
    references public.players(game_session_id, id),
  constraint business_governance_proposals_type_check check (
    proposal_type in (
      'capital_raise',
      'distribution',
      'acquisition',
      'dissolution',
      'entity_conversion',
      'new_member_admission'
    )
  ),
  constraint business_governance_proposals_status_check check (
    status in ('open', 'approved', 'rejected', 'executed', 'cancelled', 'expired')
  ),
  constraint business_governance_proposals_threshold_check
    check (approval_threshold_basis_points between 1 and 10000),
  constraint business_governance_proposals_voting_units_check
    check (snapshot_total_voting_units > 0),
  constraint business_governance_proposals_terms_check
    check (jsonb_typeof(terms) = 'object'),
  constraint business_governance_proposals_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_governance_proposals_resolved_check check (
    (status = 'open' and resolved_at is null)
    or (status <> 'open' and resolved_at is not null)
  ),
  constraint business_governance_proposals_executed_check check (
    (status = 'executed' and executed_at is not null)
    or status <> 'executed'
  ),
  constraint business_governance_proposals_idempotency_unique
    unique (game_session_id, business_id, proposer_player_id, idempotency_key),
  constraint business_governance_proposals_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_governance_proposals_open_idx
  on public.business_governance_proposals(game_session_id, business_id, proposal_type, created_at)
  where status in ('open', 'approved');

create trigger set_business_governance_proposals_updated_at
before update on public.business_governance_proposals
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_governance_proposals enable row level security;
revoke all on table public.business_governance_proposals from public, anon, authenticated;
grant select, insert, update on table public.business_governance_proposals to service_role;

create table if not exists public.business_governance_voter_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  player_id uuid not null,
  voting_units bigint not null,
  created_at timestamptz not null default now(),

  constraint business_governance_voter_snapshots_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_governance_voter_snapshots_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_governance_voter_snapshots_units_check check (voting_units > 0),
  constraint business_governance_voter_snapshots_unique
    unique (game_session_id, proposal_id, player_id)
);

create index if not exists business_governance_voter_snapshots_player_idx
  on public.business_governance_voter_snapshots(game_session_id, player_id, proposal_id);

alter table public.business_governance_voter_snapshots enable row level security;
revoke all on table public.business_governance_voter_snapshots from public, anon, authenticated;
grant select, insert on table public.business_governance_voter_snapshots to service_role;

create table if not exists public.business_governance_votes (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposal_id uuid not null,
  player_id uuid not null,
  decision text not null,
  voting_units bigint not null,
  idempotency_key text not null,
  cast_at timestamptz not null default now(),

  constraint business_governance_votes_proposal_scope_fk
    foreign key (game_session_id, proposal_id)
    references public.business_governance_proposals(game_session_id, id) on delete cascade,
  constraint business_governance_votes_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_governance_votes_decision_check check (decision in ('approve', 'reject')),
  constraint business_governance_votes_units_check check (voting_units > 0),
  constraint business_governance_votes_unique
    unique (game_session_id, proposal_id, player_id),
  constraint business_governance_votes_idempotency_unique
    unique (game_session_id, player_id, idempotency_key)
);

alter table public.business_governance_votes enable row level security;
revoke all on table public.business_governance_votes from public, anon, authenticated;
grant select, insert on table public.business_governance_votes to service_role;

create or replace function public.business_governance_threshold_v2(
  p_proposal_type text
)
returns integer
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case lower(btrim(p_proposal_type))
    when 'acquisition' then 7500
    when 'dissolution' then 7500
    when 'capital_raise' then 5001
    when 'distribution' then 5001
    when 'entity_conversion' then 5001
    when 'new_member_admission' then 5001
    else null
  end
$function$;

create or replace function public.create_business_governance_proposal_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_proposal_type text,
  p_terms jsonb,
  p_idempotency_key text,
  p_expires_at timestamptz default null
)
returns table (
  proposal_key text,
  status text,
  approval_threshold_basis_points integer,
  snapshot_total_voting_units bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_position public.business_ownership_positions%rowtype;
  v_proposal public.business_governance_proposals%rowtype;
  v_threshold integer;
  v_total bigint;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_terms, 'null'::jsonb)) <> 'object' then
    raise exception 'BUSINESS_GOVERNANCE_TERMS_INVALID' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.player_id = p_player_id
    and position_row.status = 'active'
    and position_row.voting_units > 0
  for share;
  if not found then
    raise exception 'BUSINESS_GOVERNANCE_AUTHORITY_REQUIRED' using errcode = 'P0001';
  end if;

  v_threshold := public.business_governance_threshold_v2(p_proposal_type);
  if v_threshold is null then
    raise exception 'BUSINESS_GOVERNANCE_PROPOSAL_TYPE_INVALID' using errcode = 'P0001';
  end if;

  select proposal_row.*
  into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.business_id = v_business.id
    and proposal_row.proposer_player_id = p_player_id
    and proposal_row.idempotency_key = p_idempotency_key;
  if found then
    if v_proposal.proposal_type <> lower(btrim(p_proposal_type))
      or v_proposal.terms <> p_terms
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select
      v_proposal.public_key,
      v_proposal.status,
      v_proposal.approval_threshold_basis_points,
      v_proposal.snapshot_total_voting_units,
      true;
    return;
  end if;

  if exists (
    select 1
    from public.business_governance_proposals as proposal_row
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.business_id = v_business.id
      and proposal_row.proposal_type = lower(btrim(p_proposal_type))
      and proposal_row.status in ('open', 'approved')
  ) then
    raise exception 'BUSINESS_GOVERNANCE_PROPOSAL_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  select coalesce(sum(position_row.voting_units), 0)
  into v_total
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
    and position_row.voting_units > 0;
  if v_total <= 0 then
    raise exception 'BUSINESS_GOVERNANCE_NO_VOTING_UNITS' using errcode = 'P0001';
  end if;

  insert into public.business_governance_proposals(
    game_session_id,
    business_id,
    proposer_player_id,
    proposal_type,
    status,
    approval_threshold_basis_points,
    snapshot_total_voting_units,
    terms,
    idempotency_key,
    expires_at
  ) values (
    p_game_session_id,
    v_business.id,
    p_player_id,
    lower(btrim(p_proposal_type)),
    'open',
    v_threshold,
    v_total,
    p_terms,
    p_idempotency_key,
    coalesce(p_expires_at, now() + interval '7 days')
  )
  returning * into v_proposal;

  insert into public.business_governance_voter_snapshots(
    game_session_id,
    proposal_id,
    player_id,
    voting_units
  )
  select
    p_game_session_id,
    v_proposal.id,
    position_row.player_id,
    position_row.voting_units
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.status = 'active'
    and position_row.voting_units > 0;

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
    'business.governance.proposed',
    v_proposal.id,
    'governance_proposal_created',
    jsonb_build_object(
      'proposalKey', v_proposal.public_key,
      'proposalType', v_proposal.proposal_type,
      'thresholdBasisPoints', v_threshold,
      'snapshotVotingUnits', v_total
    )
  );

  return query select
    v_proposal.public_key,
    v_proposal.status,
    v_proposal.approval_threshold_basis_points,
    v_proposal.snapshot_total_voting_units,
    false;
end
$function$;

create or replace function public.cast_business_governance_vote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_proposal_key text,
  p_decision text,
  p_idempotency_key text
)
returns table (
  proposal_key text,
  status text,
  approval_basis_points integer,
  rejection_basis_points integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_proposal public.business_governance_proposals%rowtype;
  v_voter public.business_governance_voter_snapshots%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_approve_units bigint;
  v_reject_units bigint;
  v_approve_bps integer;
  v_reject_bps integer;
  v_existing public.business_governance_votes%rowtype;
begin
  if v_decision not in ('approve', 'reject') then
    raise exception 'BUSINESS_GOVERNANCE_DECISION_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.*
  into v_proposal
  from public.business_governance_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_proposal_key))
  for update;
  if not found then
    raise exception 'BUSINESS_GOVERNANCE_PROPOSAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  select vote_row.*
  into v_existing
  from public.business_governance_votes as vote_row
  where vote_row.game_session_id = p_game_session_id
    and vote_row.player_id = p_player_id
    and vote_row.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.proposal_id <> v_proposal.id or v_existing.decision <> v_decision then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select
      coalesce(sum(voting_units) filter (where decision = 'approve'), 0),
      coalesce(sum(voting_units) filter (where decision = 'reject'), 0)
    into v_approve_units, v_reject_units
    from public.business_governance_votes
    where game_session_id = p_game_session_id
      and proposal_id = v_proposal.id;
    v_approve_bps := floor(v_approve_units * 10000.0 / v_proposal.snapshot_total_voting_units)::integer;
    v_reject_bps := floor(v_reject_units * 10000.0 / v_proposal.snapshot_total_voting_units)::integer;
    return query select v_proposal.public_key, v_proposal.status, v_approve_bps, v_reject_bps, true;
    return;
  end if;

  if v_proposal.status <> 'open' then
    raise exception 'BUSINESS_GOVERNANCE_PROPOSAL_NOT_OPEN' using errcode = 'P0001';
  end if;
  if v_proposal.expires_at <= now() then
    update public.business_governance_proposals
    set status = 'expired', resolved_at = now()
    where id = v_proposal.id;
    raise exception 'BUSINESS_GOVERNANCE_PROPOSAL_EXPIRED' using errcode = 'P0001';
  end if;

  select voter_row.*
  into v_voter
  from public.business_governance_voter_snapshots as voter_row
  where voter_row.game_session_id = p_game_session_id
    and voter_row.proposal_id = v_proposal.id
    and voter_row.player_id = p_player_id;
  if not found then
    raise exception 'BUSINESS_GOVERNANCE_VOTER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.business_governance_votes as vote_row
    where vote_row.game_session_id = p_game_session_id
      and vote_row.proposal_id = v_proposal.id
      and vote_row.player_id = p_player_id
  ) then
    raise exception 'BUSINESS_GOVERNANCE_VOTE_ALREADY_CAST' using errcode = 'P0001';
  end if;

  insert into public.business_governance_votes(
    game_session_id,
    proposal_id,
    player_id,
    decision,
    voting_units,
    idempotency_key
  ) values (
    p_game_session_id,
    v_proposal.id,
    p_player_id,
    v_decision,
    v_voter.voting_units,
    p_idempotency_key
  );

  select
    coalesce(sum(voting_units) filter (where decision = 'approve'), 0),
    coalesce(sum(voting_units) filter (where decision = 'reject'), 0)
  into v_approve_units, v_reject_units
  from public.business_governance_votes
  where game_session_id = p_game_session_id
    and proposal_id = v_proposal.id;

  v_approve_bps := floor(v_approve_units * 10000.0 / v_proposal.snapshot_total_voting_units)::integer;
  v_reject_bps := floor(v_reject_units * 10000.0 / v_proposal.snapshot_total_voting_units)::integer;

  if v_approve_bps >= v_proposal.approval_threshold_basis_points then
    update public.business_governance_proposals
    set status = 'approved', resolved_at = now()
    where id = v_proposal.id
    returning * into v_proposal;
  elsif 10000 - v_reject_bps < v_proposal.approval_threshold_basis_points then
    update public.business_governance_proposals
    set status = 'rejected', resolved_at = now()
    where id = v_proposal.id
    returning * into v_proposal;
  end if;

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
    v_proposal.business_id,
    'player',
    p_player_id,
    'business.governance.vote_cast',
    v_proposal.id,
    'governance_vote_cast',
    jsonb_build_object(
      'proposalKey', v_proposal.public_key,
      'decision', v_decision,
      'approvalBasisPoints', v_approve_bps,
      'rejectionBasisPoints', v_reject_bps,
      'proposalStatus', v_proposal.status
    )
  );

  return query select v_proposal.public_key, v_proposal.status, v_approve_bps, v_reject_bps, false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Individual ownership transfer offers
-- ---------------------------------------------------------------------------

create table if not exists public.business_ownership_transfer_offers (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bto_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  seller_player_id uuid not null,
  buyer_player_id uuid not null,
  ownership_kind text not null,
  units bigint not null,
  consideration_amount numeric(14,2) not null,
  currency_code text not null,
  status text not null default 'open',
  idempotency_key text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_ownership_transfer_offers_public_key_check
    check (public_key ~ '^bto_[0-9a-f]{32}$'),
  constraint business_ownership_transfer_offers_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id) on delete cascade,
  constraint business_ownership_transfer_offers_seller_scope_fk
    foreign key (game_session_id, seller_player_id)
    references public.players(game_session_id, id),
  constraint business_ownership_transfer_offers_buyer_scope_fk
    foreign key (game_session_id, buyer_player_id)
    references public.players(game_session_id, id),
  constraint business_ownership_transfer_offers_distinct_parties_check
    check (seller_player_id <> buyer_player_id),
  constraint business_ownership_transfer_offers_kind_check
    check (ownership_kind in ('partnership_interest', 'membership_interest', 'share')),
  constraint business_ownership_transfer_offers_units_check check (units > 0),
  constraint business_ownership_transfer_offers_consideration_check check (consideration_amount > 0),
  constraint business_ownership_transfer_offers_currency_check
    check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint business_ownership_transfer_offers_status_check
    check (status in ('open', 'accepted', 'cancelled', 'expired')),
  constraint business_ownership_transfer_offers_idempotency_unique
    unique (game_session_id, business_id, seller_player_id, idempotency_key),
  constraint business_ownership_transfer_offers_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_ownership_transfer_offers_buyer_idx
  on public.business_ownership_transfer_offers(game_session_id, buyer_player_id, status, created_at desc);
create index if not exists business_ownership_transfer_offers_seller_idx
  on public.business_ownership_transfer_offers(game_session_id, seller_player_id, status, created_at desc);

create trigger set_business_ownership_transfer_offers_updated_at
before update on public.business_ownership_transfer_offers
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_ownership_transfer_offers enable row level security;
revoke all on table public.business_ownership_transfer_offers from public, anon, authenticated;
grant select, insert, update on table public.business_ownership_transfer_offers to service_role;

create or replace function public.business_position_fair_value_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_units bigint
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_valuation numeric;
  v_total_units bigint;
begin
  if p_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_UNITS_INVALID' using errcode = 'P0001';
  end if;
  select greatest(0, business_row.valuation)
  into v_valuation
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;
  select coalesce(sum(position_row.units), 0)
  into v_total_units
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = p_business_id
    and position_row.status = 'active';
  if v_total_units <= 0 or p_units > v_total_units then
    raise exception 'BUSINESS_OWNERSHIP_UNITS_INVALID' using errcode = 'P0001';
  end if;
  return round(v_valuation * p_units / v_total_units, 2);
end
$function$;

create or replace function public.create_business_ownership_transfer_offer_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_business_key text,
  p_buyer_player_identifier text,
  p_units bigint,
  p_consideration_amount numeric,
  p_idempotency_key text
)
returns table (
  offer_key text,
  status text,
  ownership_kind text,
  units bigint,
  consideration_amount numeric,
  fair_value numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_position public.business_ownership_positions%rowtype;
  v_buyer uuid;
  v_offer public.business_ownership_transfer_offers%rowtype;
  v_fair numeric;
  v_config jsonb := '{}'::jsonb;
  v_min_multiple numeric := 0.25;
  v_max_multiple numeric := 2.00;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_UNITS_INVALID' using errcode = 'P0001';
  end if;
  if p_consideration_amount is null or p_consideration_amount <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_CONSIDERATION_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.public_key = lower(btrim(p_business_key))
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if v_business.entity_type = 'sole_proprietorship' then
    raise exception 'SOLE_PROPRIETORSHIP_PARTIAL_OWNERSHIP_PROHIBITED' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.player_id = p_player_id
    and position_row.status = 'active'
  for update;
  if not found then
    raise exception 'BUSINESS_OWNERSHIP_REQUIRED' using errcode = 'P0001';
  end if;
  if p_units > v_position.units then
    raise exception 'BUSINESS_OWNERSHIP_OVERSELL' using errcode = 'P0001';
  end if;

  select player_row.id
  into v_buyer
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.player_identifier_normalized = upper(regexp_replace(btrim(coalesce(p_buyer_player_identifier, '')), '\s+', '', 'g'))
    and player_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_OWNERSHIP_BUYER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_buyer = p_player_id then
    raise exception 'BUSINESS_OWNERSHIP_SELF_TRANSFER_INVALID' using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.business_ownership_transfer_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.business_id = v_business.id
    and offer_row.seller_player_id = p_player_id
    and offer_row.idempotency_key = p_idempotency_key;
  if found then
    if v_offer.buyer_player_id <> v_buyer
      or v_offer.units <> p_units
      or v_offer.consideration_amount <> round(p_consideration_amount, 2)
    then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    v_fair := public.business_position_fair_value_v2(p_game_session_id, v_business.id, p_units);
    return query select
      v_offer.public_key, v_offer.status, v_offer.ownership_kind,
      v_offer.units, v_offer.consideration_amount, v_fair, true;
    return;
  end if;

  if exists (
    select 1
    from public.business_ownership_transfer_offers as offer_row
    where offer_row.game_session_id = p_game_session_id
      and offer_row.business_id = v_business.id
      and offer_row.seller_player_id = p_player_id
      and offer_row.status = 'open'
  ) then
    raise exception 'BUSINESS_OWNERSHIP_TRANSFER_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  v_fair := public.business_position_fair_value_v2(p_game_session_id, v_business.id, p_units);
  select coalesce(settings_row.business_market_window -> 'ownershipTransferPricing', '{}'::jsonb)
  into v_config
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;
  if coalesce(v_config ->> 'minMultiple', '') ~ '^\d+(\.\d+)?$' then
    v_min_multiple := least(1.0, greatest(0.01, (v_config ->> 'minMultiple')::numeric));
  end if;
  if coalesce(v_config ->> 'maxMultiple', '') ~ '^\d+(\.\d+)?$' then
    v_max_multiple := least(10.0, greatest(1.0, (v_config ->> 'maxMultiple')::numeric));
  end if;
  if v_fair <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_FAIR_VALUE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_consideration_amount < round(v_fair * v_min_multiple, 2)
    or p_consideration_amount > round(v_fair * v_max_multiple, 2)
  then
    raise exception 'BUSINESS_OWNERSHIP_PRICE_OUT_OF_BOUNDS' using errcode = 'P0001';
  end if;

  insert into public.business_ownership_transfer_offers(
    game_session_id,
    business_id,
    seller_player_id,
    buyer_player_id,
    ownership_kind,
    units,
    consideration_amount,
    currency_code,
    status,
    idempotency_key,
    expires_at
  ) values (
    p_game_session_id,
    v_business.id,
    p_player_id,
    v_buyer,
    v_position.ownership_kind,
    p_units,
    round(p_consideration_amount, 2),
    v_business.currency_code,
    'open',
    p_idempotency_key,
    now() + interval '7 days'
  )
  returning * into v_offer;

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
    'business.ownership.transfer_offered',
    v_offer.id,
    'ownership_transfer_offered',
    jsonb_build_object(
      'offerKey', v_offer.public_key,
      'ownershipKind', v_offer.ownership_kind,
      'units', v_offer.units,
      'consideration', v_offer.consideration_amount,
      'fairValue', v_fair
    )
  );

  return query select
    v_offer.public_key, v_offer.status, v_offer.ownership_kind,
    v_offer.units, v_offer.consideration_amount, v_fair, false;
end
$function$;

create or replace function public.accept_business_ownership_transfer_offer_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_offer_key text,
  p_idempotency_key text
)
returns table (
  offer_key text,
  status text,
  units bigint,
  consideration_amount numeric,
  buyer_units bigint,
  seller_units bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_offer public.business_ownership_transfer_offers%rowtype;
  v_business public.business_entities%rowtype;
  v_seller public.business_ownership_positions%rowtype;
  v_buyer_position public.business_ownership_positions%rowtype;
  v_buyer_balance numeric;
  v_seller_units bigint := 0;
  v_buyer_units bigint := 0;
  v_transaction_key text;
  v_active_count integer;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select offer_row.*
  into v_offer
  from public.business_ownership_transfer_offers as offer_row
  where offer_row.game_session_id = p_game_session_id
    and offer_row.public_key = lower(btrim(p_offer_key))
  for update;
  if not found then
    raise exception 'BUSINESS_OWNERSHIP_TRANSFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_offer.buyer_player_id <> p_player_id then
    raise exception 'BUSINESS_OWNERSHIP_TRANSFER_BUYER_REQUIRED' using errcode = 'P0001';
  end if;

  v_transaction_key := 'transfer-settle:' || v_offer.public_key || ':' || p_idempotency_key;
  if v_offer.status = 'accepted' then
    if not exists (
      select 1
      from public.business_ownership_transactions as transaction_row
      where transaction_row.game_session_id = p_game_session_id
        and transaction_row.business_id = v_offer.business_id
        and transaction_row.idempotency_key = v_transaction_key
    ) then
      raise exception 'BUSINESS_OWNERSHIP_TRANSFER_ALREADY_ACCEPTED' using errcode = 'P0001';
    end if;
    select coalesce(units, 0) into v_buyer_units
    from public.business_ownership_positions
    where game_session_id = p_game_session_id and business_id = v_offer.business_id
      and player_id = v_offer.buyer_player_id and status = 'active';
    select coalesce(units, 0) into v_seller_units
    from public.business_ownership_positions
    where game_session_id = p_game_session_id and business_id = v_offer.business_id
      and player_id = v_offer.seller_player_id and status = 'active';
    return query select
      v_offer.public_key, v_offer.status, v_offer.units, v_offer.consideration_amount,
      coalesce(v_buyer_units, 0), coalesce(v_seller_units, 0), true;
    return;
  end if;
  if v_offer.status <> 'open' then
    raise exception 'BUSINESS_OWNERSHIP_TRANSFER_NOT_OPEN' using errcode = 'P0001';
  end if;
  if v_offer.expires_at <= now() then
    update public.business_ownership_transfer_offers
    set status = 'expired'
    where id = v_offer.id;
    raise exception 'BUSINESS_OWNERSHIP_TRANSFER_EXPIRED' using errcode = 'P0001';
  end if;

  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_offer.business_id
    and business_row.status <> 'closed'
    and business_row.formation_state = 'operational'
  for update;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND_OR_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_seller
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.player_id = v_offer.seller_player_id
    and position_row.status = 'active'
  for update;
  if not found or v_seller.units < v_offer.units then
    raise exception 'BUSINESS_OWNERSHIP_OVERSELL' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_buyer_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.id
    and position_row.player_id = v_offer.buyer_player_id
    and position_row.status = 'active'
  for update;

  select balance_row.balance
  into v_buyer_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.player_id = p_player_id
    and balance_row.account_type = 'checking'
    and balance_row.currency_code = v_business.currency_code
  for update;
  if coalesce(v_buyer_balance, 0) < v_offer.consideration_amount then
    raise exception 'BUSINESS_OWNERSHIP_BUYER_INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;

  perform public.record_player_ledger_entry(
    p_game_session_id,
    v_offer.buyer_player_id,
    'checking',
    -v_offer.consideration_amount,
    v_business.currency_code,
    'debit',
    'business',
    'ownership_purchase',
    v_offer.id,
    'player',
    p_player_id,
    jsonb_build_object('offer_key', v_offer.public_key, 'business_key', v_business.public_key)
  );
  perform public.record_player_ledger_entry(
    p_game_session_id,
    v_offer.seller_player_id,
    'checking',
    v_offer.consideration_amount,
    v_business.currency_code,
    'credit',
    'business',
    'ownership_sale',
    v_offer.id,
    'player',
    p_player_id,
    jsonb_build_object('offer_key', v_offer.public_key, 'business_key', v_business.public_key)
  );

  if v_seller.units = v_offer.units then
    update public.business_ownership_positions
    set status = 'exited', ended_at = now()
    where id = v_seller.id;
    v_seller_units := 0;
  else
    update public.business_ownership_positions
    set
      units = units - v_offer.units,
      voting_units = greatest(0, voting_units - least(voting_units, v_offer.units))
    where id = v_seller.id
    returning units into v_seller_units;
  end if;

  if found and v_buyer_position.id is not null then
    update public.business_ownership_positions
    set
      units = units + v_offer.units,
      voting_units = voting_units + v_offer.units
    where id = v_buyer_position.id
    returning units into v_buyer_units;
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
      v_offer.buyer_player_id,
      v_offer.ownership_kind,
      v_offer.units,
      v_offer.units,
      'active',
      now()
    ) returning units into v_buyer_units;
  end if;

  if v_business.entity_type = 'partnership' then
    select count(*)::integer into v_active_count
    from public.business_ownership_positions
    where game_session_id = p_game_session_id
      and business_id = v_business.id
      and status = 'active';
    if v_active_count < 2 then
      raise exception 'PARTNERSHIP_REQUIRES_MULTIPLE_OWNERS' using errcode = 'P0001';
    end if;
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
    'transfer',
    v_offer.ownership_kind,
    v_offer.seller_player_id,
    v_offer.buyer_player_id,
    v_offer.units,
    v_offer.units,
    v_offer.consideration_amount,
    v_business.currency_code,
    v_transaction_key,
    jsonb_build_object('offer_key', v_offer.public_key)
  );

  update public.business_ownership_transfer_offers
  set status = 'accepted', accepted_at = now()
  where id = v_offer.id
  returning * into v_offer;

  perform public.assert_business_ownership_invariants_v2(p_game_session_id, v_business.id);

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
    'business.ownership.transfer_completed',
    v_offer.id,
    'ownership_transfer_completed',
    jsonb_build_object(
      'offerKey', v_offer.public_key,
      'units', v_offer.units,
      'consideration', v_offer.consideration_amount
    )
  );

  return query select
    v_offer.public_key, v_offer.status, v_offer.units, v_offer.consideration_amount,
    coalesce(v_buyer_units, 0), coalesce(v_seller_units, 0), false;
end
$function$;

revoke all on function public.business_governance_threshold_v2(text)
  from public, anon, authenticated;
grant execute on function public.business_governance_threshold_v2(text) to service_role;
revoke all on function public.create_business_governance_proposal_v2(
  uuid, uuid, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_business_governance_proposal_v2(
  uuid, uuid, text, text, jsonb, text, timestamptz
) to service_role;
revoke all on function public.cast_business_governance_vote_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.cast_business_governance_vote_v2(
  uuid, uuid, text, text, text
) to service_role;
revoke all on function public.business_position_fair_value_v2(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.business_position_fair_value_v2(uuid, uuid, bigint) to service_role;
revoke all on function public.create_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text, bigint, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text, bigint, numeric, text
) to service_role;
revoke all on function public.accept_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.accept_business_ownership_transfer_offer_v2(
  uuid, uuid, text, text
) to service_role;

commit;
