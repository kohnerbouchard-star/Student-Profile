-- Phase 14C: explicit operation authority survives primary investment.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create table public.business_management_mandates (
  game_session_id uuid not null references public.game_sessions(id),
  business_id uuid not null,
  player_id uuid not null,
  source_proposal_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(game_session_id,business_id,player_id),
  constraint business_management_business_scope_fk foreign key(game_session_id,business_id)
    references public.business_entities(game_session_id,id),
  constraint business_management_player_scope_fk foreign key(game_session_id,player_id)
    references public.players(game_session_id,id),
  constraint business_management_proposal_scope_fk foreign key(game_session_id,source_proposal_id)
    references public.business_governance_proposals(game_session_id,id)
);
create index business_management_player_idx on public.business_management_mandates(game_session_id,player_id,business_id);
create index business_management_proposal_idx on public.business_management_mandates(game_session_id,source_proposal_id);
alter table public.business_management_mandates enable row level security;
alter table public.business_management_mandates force row level security;
revoke all on public.business_management_mandates from public,anon,authenticated,service_role;
grant select on public.business_management_mandates to service_role;
comment on table public.business_management_mandates is
  'Immutable operating-owner continuity at first primary IPO issuance. Investment shares confer votes, not treasury or operating control.';

create function economy_private.guard_business_governance_evidence_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $function$
begin
  if tg_op='DELETE' and private.is_game_data_purge_delete_authorized_v1(
    old.game_session_id,tg_table_schema,tg_table_name) then return old; end if;
  raise exception 'BUSINESS_GOVERNANCE_EVIDENCE_IMMUTABLE' using errcode='42501';
end;
$function$;
revoke all on function economy_private.guard_business_governance_evidence_v1()
  from public,anon,authenticated,service_role;
create trigger business_management_immutable before update or delete on public.business_management_mandates
  for each row execute function economy_private.guard_business_governance_evidence_v1();
create trigger business_governance_snapshot_immutable before update or delete on public.business_governance_voter_snapshots
  for each row execute function economy_private.guard_business_governance_evidence_v1();
create trigger business_governance_vote_immutable before update or delete on public.business_governance_votes
  for each row execute function economy_private.guard_business_governance_evidence_v1();
revoke insert,update,delete,truncate on public.business_governance_proposals,
  public.business_governance_voter_snapshots,public.business_governance_votes from service_role;

create or replace function private.business_controller_matches_request_v1(
  p_game_session_id uuid,p_business_id uuid,p_controller_player_id uuid
) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp
as $function$
  select exists(select 1 from public.business_entities b
    where b.game_session_id=p_game_session_id and b.id=p_business_id and b.status<>'closed'
      and case when exists(select 1 from public.business_management_mandates m
        where m.game_session_id=p_game_session_id and m.business_id=b.id)
      then exists(select 1 from public.business_management_mandates m
        where m.game_session_id=p_game_session_id and m.business_id=b.id and m.player_id=p_controller_player_id)
      else (b.ownership_model_version = 1 and b.owner_player_id=p_controller_player_id)
        or exists(select 1 from public.business_ownership_positions ownership
          where ownership.game_session_id=p_game_session_id and ownership.business_id=b.id
            and ownership.player_id=p_controller_player_id and ownership.status='active' and ownership.ended_at is null)
      end);
$function$;
revoke all on function private.business_controller_matches_request_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.resolve_player_business_v2(p_game_session_id uuid,p_player_id uuid)
returns table(business_id uuid,business_key text,country_code text,currency_code text)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp
as $function$
declare v_count integer;v_business public.business_entities%rowtype;
begin
  if p_game_session_id is null then raise exception 'GAME_SESSION_REQUIRED'; end if;
  if p_player_id is null then raise exception 'PLAYER_REQUIRED'; end if;
  select count(*) into v_count from public.business_entities b
    where b.game_session_id=p_game_session_id
      and private.business_controller_matches_request_v1(p_game_session_id,b.id,p_player_id);
  if v_count=0 then raise exception 'BUSINESS_NOT_FOUND'; end if;
  if v_count>1 then raise exception 'BUSINESS_OWNERSHIP_AMBIGUOUS'; end if;
  select * into v_business from public.business_entities b where b.game_session_id=p_game_session_id
    and private.business_controller_matches_request_v1(p_game_session_id,b.id,p_player_id);
  return query select v_business.id,v_business.public_key,v_business.country_code,v_business.currency_code;
end;
$function$;
revoke all on function public.resolve_player_business_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_player_business_v2(uuid,uuid) to service_role;

create function economy_private.assert_business_ipo_actor_v1(p_game uuid,p_player uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $function$
begin
  perform 1 from public.game_sessions where id=p_game and status='active' and lifecycle_state='active' for share;
  if not found then raise exception 'BUSINESS_IPO_GAME_UNAVAILABLE' using errcode='42501'; end if;
  perform 1 from public.players where game_session_id=p_game and id=p_player and status='active' for share;
  if not found then raise exception 'BUSINESS_IPO_PLAYER_UNAVAILABLE' using errcode='42501'; end if;
end;
$function$;
revoke all on function economy_private.assert_business_ipo_actor_v1(uuid,uuid) from public,anon,authenticated,service_role;



create or replace function public.propose_business_formation_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_legal_name text,
  p_entity_type text,
  p_industry_code text,
  p_owners jsonb,
  p_idempotency_key text
)
returns table (
  formation_key text,
  status text,
  entity_type text,
  tax_classification text,
  formation_fee numeric,
  owner_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_entity text := lower(btrim(coalesce(p_entity_type, '')));
  v_industry text := lower(btrim(coalesce(p_industry_code, '')));
  v_context record;
  v_request_hash text;
  v_existing public.business_formation_proposals%rowtype;
  v_formation public.business_formation_proposals%rowtype;
  v_owner jsonb;
  v_identifier text;
  v_owner_player_id uuid;
  v_basis_points integer;
  v_contribution numeric;
  v_owner_count integer;
  v_total_basis_points integer := 0;
  v_seen_players uuid[] := '{}'::uuid[];
  v_has_proposer boolean := false;
  v_tax_classification text;
  v_fee numeric;
  v_initial_status text := 'pending_approval';
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_legal_name, ''))) not between 2 and 160 then
    raise exception 'BUSINESS_NAME_INVALID' using errcode = 'P0001';
  end if;
  if v_entity not in ('sole_proprietorship', 'partnership', 'llc', 'c_corporation') then
    raise exception 'BUSINESS_ENTITY_TYPE_INVALID' using errcode = 'P0001';
  end if;
  if v_industry !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then
    raise exception 'BUSINESS_INDUSTRY_INVALID' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_owners, 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_owners) not between 1 and 16
  then
    raise exception 'BUSINESS_OWNERS_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  perform 1
  from public.players as player_row
  where player_row.game_session_id = p_game_session_id
    and player_row.id = p_player_id
    and player_row.status = 'active'
  for share;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A Player cannot silently open another operating Business through formation.
  if exists (
    select 1
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and private.business_controller_matches_request_v1(
        p_game_session_id, business_row.id, p_player_id)
  ) then
    raise exception 'BUSINESS_ALREADY_OWNED' using errcode = 'P0001';
  end if;

  v_request_hash := encode(extensions.digest(concat_ws(
    '|',
    p_game_session_id,
    p_player_id,
    btrim(p_legal_name),
    v_entity,
    v_industry,
    p_owners::text
  ), 'sha256'), 'hex');

  select proposal_row.*
  into v_existing
  from public.business_formation_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.proposer_player_id = p_player_id
    and proposal_row.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select count(*)::integer
    into v_owner_count
    from public.business_formation_owners as owner_row
    where owner_row.game_session_id = p_game_session_id
      and owner_row.formation_id = v_existing.id;
    return query select
      v_existing.public_key,
      v_existing.status,
      v_existing.entity_type,
      v_existing.tax_classification,
      v_existing.formation_fee,
      v_owner_count,
      true;
    return;
  end if;

  -- Only one unresolved formation per proposer keeps the workflow legible and
  -- prevents a Player from spamming mutually inconsistent ownership agreements.
  if exists (
    select 1
    from public.business_formation_proposals as proposal_row
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.proposer_player_id = p_player_id
      and proposal_row.status in ('pending_approval', 'pending_capitalization')
  ) then
    raise exception 'BUSINESS_FORMATION_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  select *
  into v_context
  from public.resolve_player_economic_context_v1(p_game_session_id, p_player_id);
  if not found
    or nullif(btrim(coalesce(v_context.country_code, '')), '') is null
    or nullif(btrim(coalesce(v_context.currency_code, '')), '') is null
  then
    raise exception 'PLAYER_ECONOMIC_CONTEXT_REQUIRED' using errcode = 'P0001';
  end if;

  v_owner_count := jsonb_array_length(p_owners);
  if v_entity = 'sole_proprietorship' and v_owner_count <> 1 then
    raise exception 'SOLE_PROPRIETOR_REQUIRES_ONE_OWNER' using errcode = 'P0001';
  end if;
  if v_entity = 'partnership' and v_owner_count < 2 then
    raise exception 'PARTNERSHIP_REQUIRES_MULTIPLE_OWNERS' using errcode = 'P0001';
  end if;

  v_tax_classification := public.business_default_tax_classification_v2(v_entity, v_owner_count);
  v_fee := public.business_formation_fee_v2(p_game_session_id, v_entity);

  insert into public.business_formation_proposals (
    game_session_id,
    proposer_player_id,
    legal_name,
    entity_type,
    tax_classification,
    industry_code,
    country_code,
    currency_code,
    status,
    formation_fee,
    total_initial_units,
    authorized_shares,
    idempotency_key,
    request_hash
  ) values (
    p_game_session_id,
    p_player_id,
    btrim(p_legal_name),
    v_entity,
    v_tax_classification,
    v_industry,
    upper(v_context.country_code),
    upper(v_context.currency_code),
    v_initial_status,
    v_fee,
    10000,
    case when v_entity = 'c_corporation' then 1000000 else null end,
    p_idempotency_key,
    v_request_hash
  )
  returning * into v_formation;

  for v_owner in
    select value from jsonb_array_elements(p_owners)
  loop
    v_identifier := upper(regexp_replace(btrim(coalesce(v_owner ->> 'playerIdentifier', '')), '\s+', '', 'g'));
    if v_identifier in ('SELF', 'ME') then
      v_owner_player_id := p_player_id;
    else
      select player_row.id
      into v_owner_player_id
      from public.players as player_row
      where player_row.game_session_id = p_game_session_id
        and player_row.player_identifier_normalized = v_identifier
        and player_row.status = 'active';
      if not found then
        raise exception 'BUSINESS_PROPOSED_OWNER_NOT_FOUND:%', v_identifier using errcode = 'P0001';
      end if;
    end if;

    if v_owner_player_id = any(v_seen_players) then
      raise exception 'BUSINESS_PROPOSED_OWNER_DUPLICATE' using errcode = 'P0001';
    end if;
    v_seen_players := array_append(v_seen_players, v_owner_player_id);
    v_has_proposer := v_has_proposer or v_owner_player_id = p_player_id;

    if coalesce(v_owner ->> 'ownershipBasisPoints', '') !~ '^\d{1,5}$' then
      raise exception 'BUSINESS_OWNERSHIP_BASIS_POINTS_INVALID' using errcode = 'P0001';
    end if;
    v_basis_points := (v_owner ->> 'ownershipBasisPoints')::integer;
    if v_basis_points not between 1 and 10000 then
      raise exception 'BUSINESS_OWNERSHIP_BASIS_POINTS_INVALID' using errcode = 'P0001';
    end if;

    if coalesce(v_owner ->> 'capitalContribution', '0') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'BUSINESS_CAPITAL_CONTRIBUTION_INVALID' using errcode = 'P0001';
    end if;
    v_contribution := round((v_owner ->> 'capitalContribution')::numeric, 2);
    if v_contribution < 0 or v_contribution > 10000000 then
      raise exception 'BUSINESS_CAPITAL_CONTRIBUTION_INVALID' using errcode = 'P0001';
    end if;

    v_total_basis_points := v_total_basis_points + v_basis_points;

    insert into public.business_formation_owners (
      game_session_id,
      formation_id,
      player_id,
      proposed_units,
      proposed_voting_units,
      capital_contribution,
      approval_status,
      responded_at
    ) values (
      p_game_session_id,
      v_formation.id,
      v_owner_player_id,
      v_basis_points,
      v_basis_points,
      v_contribution,
      case when v_entity = 'sole_proprietorship' then 'approved' else 'pending' end,
      case when v_entity = 'sole_proprietorship' then now() else null end
    );
  end loop;

  if not v_has_proposer then
    raise exception 'BUSINESS_PROPOSER_MUST_BE_OWNER' using errcode = 'P0001';
  end if;
  if v_total_basis_points <> 10000 then
    raise exception 'BUSINESS_INITIAL_OWNERSHIP_MUST_TOTAL_100_PERCENT' using errcode = 'P0001';
  end if;
  if v_entity = 'sole_proprietorship' and not exists (
    select 1
    from public.business_formation_owners as owner_row
    where owner_row.formation_id = v_formation.id
      and owner_row.player_id = p_player_id
      and owner_row.proposed_units = 10000
  ) then
    raise exception 'SOLE_PROPRIETOR_MUST_OWN_100_PERCENT' using errcode = 'P0001';
  end if;

  if v_entity = 'sole_proprietorship' then
    update public.business_formation_proposals
    set status = 'pending_capitalization'
    where id = v_formation.id
    returning * into v_formation;
  end if;

  insert into public.business_activity_events (
    game_session_id,
    formation_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_formation.id,
    'player',
    p_player_id,
    'business.formation.proposed',
    v_formation.id,
    'formation_proposed',
    jsonb_build_object(
      'entityType', v_entity,
      'taxClassification', v_tax_classification,
      'ownerCount', v_owner_count,
      'formationFee', v_fee
    )
  );

  insert into public.audit_log (
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
    'business.formation.propose',
    'business_formation',
    v_formation.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'formation_key', v_formation.public_key,
      'entity_type', v_entity,
      'owner_count', v_owner_count
    )
  );

  return query select
    v_formation.public_key,
    v_formation.status,
    v_formation.entity_type,
    v_formation.tax_classification,
    v_formation.formation_fee,
    v_owner_count,
    false;
end
$function$;

create or replace function public.activate_business_formation_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_formation_key text,
  p_idempotency_key text
)
returns table (
  formation_key text,
  business_key text,
  status text,
  capitalization numeric,
  business_balance numeric,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
declare
  v_formation public.business_formation_proposals%rowtype;
  v_existing_business public.business_entities%rowtype;
  v_business public.business_entities%rowtype;
  v_owner record;
  v_owner_count integer;
  v_approved_count integer;
  v_capitalization numeric := 0;
  v_balance numeric;
  v_personal_balance numeric;
  v_required numeric;
  v_ownership_kind text;
  v_entry record;
begin
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select proposal_row.*
  into v_formation
  from public.business_formation_proposals as proposal_row
  where proposal_row.game_session_id = p_game_session_id
    and proposal_row.public_key = lower(btrim(p_formation_key))
  for update;
  if not found then
    raise exception 'BUSINESS_FORMATION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_formation.proposer_player_id <> p_player_id then
    raise exception 'BUSINESS_FORMATION_PROPOSER_REQUIRED' using errcode = 'P0001';
  end if;

  if v_formation.status = 'activated' then
    select business_row.*
    into v_existing_business
    from public.business_entities as business_row
    where business_row.game_session_id = p_game_session_id
      and business_row.id = v_formation.activated_business_id;
    if not found then
      raise exception 'BUSINESS_FORMATION_ACTIVATION_CORRUPT' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.audit_log as audit_row
      where audit_row.game_session_id = p_game_session_id
        and audit_row.actor_id = p_player_id
        and audit_row.action = 'business.formation.activate'
        and audit_row.target_id = v_formation.id
        and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
    ) then
      raise exception 'BUSINESS_FORMATION_ALREADY_ACTIVATED' using errcode = 'P0001';
    end if;
    v_balance := public.read_business_balance_v2(
      p_game_session_id,
      v_existing_business.id,
      v_existing_business.currency_code
    );
    return query select
      v_formation.public_key,
      v_existing_business.public_key,
      v_existing_business.status,
      v_existing_business.capitalization,
      v_balance,
      true;
    return;
  end if;

  if v_formation.status <> 'pending_capitalization' then
    raise exception 'BUSINESS_FORMATION_NOT_READY_FOR_CAPITALIZATION' using errcode = 'P0001';
  end if;

  select
    count(*)::integer,
    count(*) filter (where approval_status = 'approved')::integer,
    coalesce(sum(capital_contribution), 0)
  into v_owner_count, v_approved_count, v_capitalization
  from public.business_formation_owners
  where game_session_id = p_game_session_id
    and formation_id = v_formation.id;

  if v_owner_count < 1 or v_approved_count <> v_owner_count then
    raise exception 'BUSINESS_FORMATION_UNANIMOUS_APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  -- Lock owner Player rows and their checking balances in deterministic UUID
  -- order before any money or ownership mutation is written.
  perform 1
  from public.players as player_row
  join public.business_formation_owners as owner_row
    on owner_row.game_session_id = player_row.game_session_id
   and owner_row.player_id = player_row.id
  where owner_row.game_session_id = p_game_session_id
    and owner_row.formation_id = v_formation.id
    and player_row.status = 'active'
  order by player_row.id
  for update of player_row;

  if (
    select count(*)
    from public.players as player_row
    join public.business_formation_owners as owner_row
      on owner_row.game_session_id = player_row.game_session_id
     and owner_row.player_id = player_row.id
    where owner_row.game_session_id = p_game_session_id
      and owner_row.formation_id = v_formation.id
      and player_row.status = 'active'
  ) <> v_owner_count then
    raise exception 'BUSINESS_FORMATION_OWNER_INACTIVE' using errcode = 'P0001';
  end if;

  -- The current Player UI still assumes one open Business per Player. Preserve
  -- that invariant until the Business workspace becomes a multi-company switcher.
  if exists (
    select 1
    from public.business_formation_owners as owner_row
    join public.business_entities as business_row
      on business_row.game_session_id = owner_row.game_session_id
     and private.business_controller_matches_request_v1(
       owner_row.game_session_id, business_row.id, owner_row.player_id)
    where owner_row.game_session_id = p_game_session_id
      and owner_row.formation_id = v_formation.id
      and business_row.status <> 'closed'
  ) then
    raise exception 'BUSINESS_FORMATION_OWNER_ALREADY_HAS_OPEN_BUSINESS' using errcode = 'P0001';
  end if;

  for v_owner in
    select owner_row.*
    from public.business_formation_owners as owner_row
    where owner_row.game_session_id = p_game_session_id
      and owner_row.formation_id = v_formation.id
    order by owner_row.player_id
  loop
    select balance_row.balance
    into v_personal_balance
    from public.account_balances as balance_row
    where balance_row.game_session_id = p_game_session_id
      and balance_row.player_id = v_owner.player_id
      and balance_row.account_type = 'checking'
      and balance_row.currency_code = v_formation.currency_code
    for update;

    v_required := v_owner.capital_contribution
      + case when v_owner.player_id = p_player_id then v_formation.formation_fee else 0 end;
    if coalesce(v_personal_balance, 0) < v_required then
      raise exception 'BUSINESS_FORMATION_INSUFFICIENT_OWNER_FUNDS' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.business_entities(
    game_session_id,
    owner_player_id,
    legal_name,
    entity_type,
    industry_code,
    country_code,
    currency_code,
    status,
    capitalization,
    valuation,
    tax_classification,
    formation_state,
    ownership_model_version
  ) values (
    p_game_session_id,
    p_player_id,
    v_formation.legal_name,
    v_formation.entity_type,
    v_formation.industry_code,
    v_formation.country_code,
    v_formation.currency_code,
    'active',
    round(v_capitalization, 2),
    round(v_capitalization, 2),
    v_formation.tax_classification,
    'operational',
    2
  )
  returning * into v_business;

  perform public.ensure_business_bank_account_v2(p_game_session_id, v_business.id);
  perform economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'warehouse'
  );
  perform economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'work_in_progress'
  );
  perform economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.id,
    'finished_goods'
  );

  v_ownership_kind := public.business_ownership_kind_v2(v_business.entity_type);

  for v_owner in
    select owner_row.*
    from public.business_formation_owners as owner_row
    where owner_row.game_session_id = p_game_session_id
      and owner_row.formation_id = v_formation.id
    order by owner_row.player_id
  loop
    if v_owner.capital_contribution > 0 then
      perform public.record_player_ledger_entry(
        p_game_session_id,
        v_owner.player_id,
        'checking',
        -v_owner.capital_contribution,
        v_business.currency_code,
        'debit',
        'business',
        'capital_contribution_out',
        v_business.id,
        'player',
        v_owner.player_id,
        jsonb_build_object(
          'business_key', v_business.public_key,
          'formation_key', v_formation.public_key
        )
      );

      select * into v_entry
      from public.record_business_ledger_entry_v2(
        p_game_session_id,
        v_business.id,
        v_owner.capital_contribution,
        v_business.currency_code,
        'credit',
        'business',
        'capital_contribution_in',
        v_business.id,
        'player',
        v_owner.player_id,
        jsonb_build_object(
          'formation_key', v_formation.public_key,
          'contributing_player', 'server_resolved'
        )
      );
    end if;

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
      v_owner.player_id,
      v_ownership_kind,
      v_owner.proposed_units,
      v_owner.proposed_voting_units,
      'active',
      now()
    );

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
      'formation',
      v_ownership_kind,
      null,
      v_owner.player_id,
      v_owner.proposed_units,
      v_owner.proposed_voting_units,
      v_owner.capital_contribution,
      v_business.currency_code,
      'formation:' || v_formation.public_key || ':' || v_owner.id::text,
      jsonb_build_object(
        'formation_key', v_formation.public_key,
        'ownership_basis_points', v_owner.proposed_units
      )
    );
  end loop;

  if v_business.entity_type = 'c_corporation' then
    insert into public.business_corporate_share_structures(
      game_session_id,
      business_id,
      authorized_shares,
      issued_shares,
      treasury_shares,
      outstanding_shares
    ) values (
      p_game_session_id,
      v_business.id,
      v_formation.authorized_shares,
      10000,
      0,
      10000
    );
  end if;

  perform public.assert_business_ownership_invariants_v2(p_game_session_id, v_business.id);

  if v_formation.formation_fee > 0 then
    perform public.record_player_ledger_entry(
      p_game_session_id,
      p_player_id,
      'checking',
      -v_formation.formation_fee,
      v_business.currency_code,
      'debit',
      'business',
      'formation_fee',
      v_business.id,
      'player',
      p_player_id,
      jsonb_build_object(
        'business_key', v_business.public_key,
        'formation_key', v_formation.public_key,
        'entity_type', v_business.entity_type
      )
    );
  end if;

  update public.business_formation_proposals
  set
    status = 'activated',
    activated_business_id = v_business.id,
    activated_at = now()
  where id = v_formation.id
  returning * into v_formation;

  insert into public.business_activity_events(
    game_session_id,
    business_id,
    formation_id,
    actor_type,
    actor_player_id,
    event_type,
    source_id,
    reason_code,
    metadata
  ) values (
    p_game_session_id,
    v_business.id,
    v_formation.id,
    'player',
    p_player_id,
    'business.formation.activated',
    v_business.id,
    'formation_activated',
    jsonb_build_object(
      'entityType', v_business.entity_type,
      'taxClassification', v_business.tax_classification,
      'ownerCount', v_owner_count,
      'capitalization', round(v_capitalization, 2),
      'formationFee', v_formation.formation_fee
    )
  );

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
    'business.formation.activate',
    'business_formation',
    v_formation.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'formation_key', v_formation.public_key,
      'business_key', v_business.public_key,
      'capitalization', round(v_capitalization, 2)
    )
  );

  v_balance := public.read_business_balance_v2(
    p_game_session_id,
    v_business.id,
    v_business.currency_code
  );

  return query select
    v_formation.public_key,
    v_business.public_key,
    v_business.status,
    v_business.capitalization,
    v_balance,
    false;
end
$function$;

create or replace function economy_private.guard_business_manufacturing_job_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, economy_private, extensions, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_product public.business_products%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_output public.game_items%rowtype;
  v_duration integer;
  v_expected_hash text;
begin
  if tg_op = 'INSERT' then
    select business_row.*
    into v_business
    from public.business_entities as business_row
    where business_row.game_session_id = new.game_session_id
      and business_row.id = new.business_id
      and business_row.status = 'active'
      and private.business_controller_matches_request_v1(
        new.game_session_id, business_row.id, new.requested_by_player_id);
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_OWNERSHIP_INVALID'
        using errcode = 'P0001';
    end if;

    select product_row.*
    into v_product
    from public.business_products as product_row
    where product_row.game_session_id = new.game_session_id
      and product_row.id = new.product_id
      and product_row.business_id = new.business_id
      and product_row.product_kind = 'physical_good'
      and product_row.output_game_item_id = new.output_game_item_id
      and product_row.status = 'active';
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_PRODUCT_INVALID'
        using errcode = 'P0001';
    end if;

    select recipe_row.*
    into v_recipe
    from public.physical_economy_recipe_definitions as recipe_row
    where recipe_row.id = new.recipe_definition_id
      and recipe_row.status = 'active';
    if not found then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.business_recipe_access as access_row
      where access_row.game_session_id = new.game_session_id
        and access_row.business_id = new.business_id
        and access_row.recipe_id = new.recipe_definition_id
        and access_row.revoked_at is null
    ) then
      raise exception 'BUSINESS_MANUFACTURING_RECIPE_NOT_OWNED'
        using errcode = 'P0001';
    end if;

    select item_row.*
    into v_output
    from public.game_items as item_row
    where item_row.game_session_id = new.game_session_id
      and item_row.id = new.output_game_item_id
      and item_row.status = 'active';
    if not found
      or not exists (
        select 1
        from public.physical_economy_recipe_outputs as recipe_output
        where recipe_output.recipe_id = new.recipe_definition_id
          and recipe_output.item_key = v_output.canonical_key
      )
    then
      raise exception 'BUSINESS_MANUFACTURING_OUTPUT_INVALID'
        using errcode = 'P0001';
    end if;

    if new.status <> 'queued'
      or new.resource_state <> 'reserved'
      or new.started_at is not null
      or new.completes_at is not null
      or new.completed_at is not null
      or new.cancelled_at is not null
      or new.failed_at is not null
      or new.completion_lease_token is not null
      or new.completion_lease_expires_at is not null
    then
      raise exception 'BUSINESS_MANUFACTURING_INITIAL_STATE_INVALID'
        using errcode = 'P0001';
    end if;

    v_duration := public.derive_business_manufacturing_duration_seconds_v2(
      new.game_session_id,
      new.business_id,
      new.recipe_definition_id,
      new.quantity,
      new.priority
    );
    new.duration_seconds := v_duration;
    new.recipe_snapshot := jsonb_build_object(
      'recipeKey', v_recipe.recipe_key,
      'recipePackId', v_recipe.pack_id,
      'outputItemKey', v_output.public_key,
      'outputCanonicalKey', v_output.canonical_key,
      'businessCountryCode', v_business.country_code,
      'businessCurrencyCode', v_business.currency_code,
      'quantity', new.quantity,
      'priority', new.priority,
      'durationSeconds', v_duration,
      'timingAuthority', 'server_v2',
      'resourceAuthority', 'canonical_reserved_v2',
      'durabilityEnabled', false,
      'repairEnabled', false
    );

    v_expected_hash := encode(
      extensions.digest(
        concat_ws(
          '|',
          new.game_session_id,
          new.requested_by_player_id,
          new.business_id,
          new.product_id,
          new.recipe_definition_id,
          new.output_game_item_id,
          new.quantity,
          new.priority
        ),
        'sha256'
      ),
      'hex'
    );
    if new.request_hash is distinct from v_expected_hash then
      raise exception 'BUSINESS_MANUFACTURING_REQUEST_HASH_INVALID'
        using errcode = 'P0001';
    end if;
  else
    if new.game_session_id is distinct from old.game_session_id
      or new.business_id is distinct from old.business_id
      or new.product_id is distinct from old.product_id
      or new.recipe_definition_id is distinct from old.recipe_definition_id
      or new.output_game_item_id is distinct from old.output_game_item_id
      or new.requested_by_player_id is distinct from old.requested_by_player_id
      or new.idempotency_key is distinct from old.idempotency_key
      or new.request_hash is distinct from old.request_hash
      or new.quantity is distinct from old.quantity
      or new.priority is distinct from old.priority
      or new.duration_seconds is distinct from old.duration_seconds
      or new.recipe_snapshot is distinct from old.recipe_snapshot
      or new.queue_available_at is distinct from old.queue_available_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'BUSINESS_MANUFACTURING_IDENTITY_IMMUTABLE'
        using errcode = '42501';
    end if;

    if old.status = 'queued'
      and new.status not in ('queued','in_progress','cancelled','failed')
    then
      raise exception 'BUSINESS_MANUFACTURING_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status = 'in_progress'
      and new.status not in ('in_progress','completed','cancelled','failed')
    then
      raise exception 'BUSINESS_MANUFACTURING_TRANSITION_INVALID'
        using errcode = 'P0001';
    elsif old.status in ('completed','cancelled','failed')
      and new.status <> old.status
    then
      raise exception 'BUSINESS_MANUFACTURING_TERMINAL'
        using errcode = 'P0001';
    end if;

    new.version := old.version + 1;
  end if;

  return new;
end
$function$;

create or replace function public.read_owned_business_governance_v2(
  p_game_session_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_business record;
  v_business_row public.business_entities%rowtype;
  v_position public.business_ownership_positions%rowtype;
  v_total_units numeric := 0;
  v_total_voting_units numeric := 0;
  v_owner_count integer := 0;
  v_ownership_bps integer := 0;
  v_voting_bps integer := 0;
  v_share_structure jsonb := null;
  v_proposals jsonb := '[]'::jsonb;
begin
  select *
  into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select business_row.*
  into v_business_row
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = v_business.business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select position_row.*
  into v_position
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.player_id = p_player_id
    and position_row.status = 'active'
  order by position_row.effective_at, position_row.public_key
  limit 1;
  -- An explicit operating mandate survives sale of the last investment share.

  select
    coalesce(sum(position_row.units), 0)::numeric,
    coalesce(sum(position_row.voting_units), 0)::numeric,
    count(*)::integer
  into v_total_units, v_total_voting_units, v_owner_count
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = p_game_session_id
    and position_row.business_id = v_business.business_id
    and position_row.status = 'active';

  if v_total_units <= 0 then
    raise exception 'BUSINESS_OWNERSHIP_STATE_INVALID' using errcode = 'P0001';
  end if;

  v_ownership_bps := least(
    10000,
    greatest(0, floor(coalesce(v_position.units,0) * 10000.0 / v_total_units)::integer)
  );
  if v_total_voting_units > 0 then
    v_voting_bps := least(
      10000,
      greatest(
        0,
        floor(coalesce(v_position.voting_units,0) * 10000.0 / v_total_voting_units)::integer
      )
    );
  end if;

  select jsonb_build_object(
    'authorizedShares', structure.authorized_shares::text,
    'issuedShares', structure.issued_shares::text,
    'treasuryShares', structure.treasury_shares::text,
    'outstandingShares', structure.outstanding_shares::text
  )
  into v_share_structure
  from public.business_corporate_share_structures as structure
  where structure.game_session_id = p_game_session_id
    and structure.business_id = v_business.business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'proposalKey', proposal.public_key,
    'proposalType', proposal.proposal_type,
    'status', proposal.status,
    'approvalThresholdBasisPoints', proposal.approval_threshold_basis_points,
    'snapshotTotalVotingUnits', proposal.snapshot_total_voting_units::text,
    'expiresAt', proposal.expires_at,
    'resolvedAt', proposal.resolved_at,
    'executedAt', proposal.executed_at
  ) order by proposal.created_at desc, proposal.public_key), '[]'::jsonb)
  into v_proposals
  from public.business_governance_proposals as proposal
  where proposal.game_session_id = p_game_session_id
    and proposal.business_id = v_business.business_id
    and proposal.status in ('open','approved');

  return jsonb_build_object(
    'businessKey', v_business.business_key,
    'entityType', v_business_row.entity_type,
    'taxClassification', v_business_row.tax_classification,
    'formationState', v_business_row.formation_state,
    'ownershipModelVersion', v_business_row.ownership_model_version,
    'ownerCount', v_owner_count,
    'totalUnits', v_total_units::text,
    'totalVotingUnits', v_total_voting_units::text,
    'managementAuthority', true,
    'currentPosition', case when v_position.id is null then null else jsonb_build_object(
      'positionKey', v_position.public_key,
      'ownershipKind', v_position.ownership_kind,
      'units', v_position.units::text,
      'votingUnits', v_position.voting_units::text,
      'ownershipBasisPoints', v_ownership_bps,
      'votingBasisPoints', v_voting_bps,
      'effectiveAt', v_position.effective_at
    ) end,
    'corporateShareStructure', v_share_structure,
    'openProposals', v_proposals,
    'readOnly', true
  );
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
  if coalesce(p_terms->>'schema','') like 'business.primary_ipo.%' then
    raise exception 'BUSINESS_IPO_COMMAND_REQUIRED' using errcode='42501';
  end if;
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
  if coalesce(v_proposal.terms->>'schema','') like 'business.primary_ipo.%' then
    raise exception 'BUSINESS_IPO_COMMAND_REQUIRED' using errcode='42501';
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

create or replace function private.bank_compatibility_gateway_allowed_v1(
  p_gateway text,
  p_source_domain text,
  p_source_action text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $function$
  select (p_gateway, p_source_domain, p_source_action) in (
    values
      ('record_player_ledger_entry', 'admin', 'business_banking_correction'),
      ('record_player_ledger_entry', 'arrival', 'arrival_package_grant'),
      ('record_player_ledger_entry', 'attendance', 'player_clock_in_reward'),
      ('record_player_ledger_entry', 'attendance', 'staff_scan_reward'),
      ('record_player_ledger_entry', 'attendance', 'staff_reward_adjustment'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_in'),
      ('record_player_ledger_entry', 'banking', 'account_transfer_out'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_received'),
      ('record_player_ledger_entry', 'banking', 'player_transfer_sent'),
      ('record_player_ledger_entry', 'banking', 'savings_interest'),
      ('record_player_ledger_entry', 'banking', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'business', 'business_acquisition_payment'),
      ('record_player_ledger_entry', 'business', 'business_sale_proceeds'),
      ('record_player_ledger_entry', 'business', 'capital_contribution_out'),
      ('record_player_ledger_entry', 'business', 'capitalization_in'),
      ('record_player_ledger_entry', 'business', 'capitalization_out'),
      ('record_player_ledger_entry', 'business', 'formation_fee'),
      ('record_player_ledger_entry', 'business', 'input_purchase'),
      ('record_player_ledger_entry', 'business', 'ipo_primary_subscription_out'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_in'),
      ('record_player_ledger_entry', 'business', 'ownership_cash_transfer_out'),
      ('record_player_ledger_entry', 'business', 'ownership_purchase'),
      ('record_player_ledger_entry', 'business', 'ownership_sale'),
      ('record_player_ledger_entry', 'business', 'payroll_employee_credit'),
      ('record_player_ledger_entry', 'business', 'payroll_recovery_credit'),
      ('record_player_ledger_entry', 'business', 'production_labor'),
      ('record_player_ledger_entry', 'business', 'sales_revenue'),
      ('record_player_ledger_entry', 'business', 'tax_expense'),
      ('record_player_ledger_entry', 'contracts', 'contract_reward_cash'),
      ('record_player_ledger_entry', 'ledger', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'loans', 'loan_disbursement'),
      ('record_player_ledger_entry', 'loans', 'loan_payment'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_purchase'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_credit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_refund_debit'),
      ('record_player_ledger_entry', 'marketplace', 'marketplace_sale'),
      ('record_player_ledger_entry', 'players', 'staff_player_balance_adjustment'),
      ('record_player_ledger_entry', 'setup', 'initial_balance_seed'),
      ('record_player_ledger_entry', 'stocks', 'stock_buy'),
      ('record_player_ledger_entry', 'stocks', 'stock_sell'),
      ('record_player_ledger_entry', 'store', 'business_offer_purchase_debit'),
      ('record_player_ledger_entry', 'store', 'store_purchase'),
      ('record_player_ledger_entry', 'storylines', 'cash_credit'),
      ('record_player_ledger_entry', 'storylines', 'cash_debit'),
      ('record_player_ledger_entry', 'travel', 'route_travel'),
      ('record_business_ledger_entry_v2', 'business', 'capital_contribution_in'),
      ('record_business_ledger_entry_v2', 'business', 'ipo_primary_subscription'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_period_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'payroll_recovery_settlement'),
      ('record_business_ledger_entry_v2', 'business', 'store_procurement_purchase'),
      ('record_business_ledger_entry_v2', 'store', 'business_offer_purchase_credit')
  );
$function$;

commit;
