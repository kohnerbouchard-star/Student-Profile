-- Business party banking + formation activation V2.
--
-- Adds an explicit Business identity to the canonical money journal/projection
-- without breaking legacy owner-scoped callers. New Business commands can now
-- resolve money by business_id; compatibility callers continue to use the
-- existing business:<public_key> account name while triggers attach the Business
-- identity. Approved formations activate atomically with owner contributions.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- First-class Business identity in the money journal and balance projection
-- ---------------------------------------------------------------------------

alter table public.ledger_entries
  add column if not exists business_id uuid;

alter table public.account_balances
  add column if not exists business_id uuid;

alter table public.ledger_entries
  drop constraint if exists ledger_entries_business_scope_fk;
alter table public.ledger_entries
  add constraint ledger_entries_business_scope_fk
  foreign key (game_session_id, business_id)
  references public.business_entities(game_session_id, id);

alter table public.account_balances
  drop constraint if exists account_balances_business_scope_fk;
alter table public.account_balances
  add constraint account_balances_business_scope_fk
  foreign key (game_session_id, business_id)
  references public.business_entities(game_session_id, id);

create index if not exists ledger_entries_business_created_at_idx
  on public.ledger_entries(game_session_id, business_id, created_at desc)
  where business_id is not null;

-- Existing direct acquisitions can leave zero-balance historical owner rows for
-- the same business account. Only the current controller row is promoted into
-- the first-class Business balance projection during this compatibility tranche.
update public.account_balances as balance_row
set business_id = business_row.id
from public.business_entities as business_row
where balance_row.game_session_id = business_row.game_session_id
  and balance_row.player_id = business_row.owner_player_id
  and balance_row.account_type = public.business_account_type_v1(business_row.public_key)
  and balance_row.business_id is null;

update public.ledger_entries as ledger_row
set business_id = business_row.id
from public.business_entities as business_row
where ledger_row.game_session_id = business_row.game_session_id
  and ledger_row.account_type = public.business_account_type_v1(business_row.public_key)
  and ledger_row.business_id is null;

create unique index if not exists account_balances_business_currency_unique
  on public.account_balances(game_session_id, business_id, currency_code)
  where business_id is not null;

comment on column public.ledger_entries.business_id is
  'First-class Business monetary owner. Historical and compatibility entries may also retain the Player controller as actor/account metadata.';
comment on column public.account_balances.business_id is
  'Stable Business identity for Business cash. Browser authority must resolve by business_id/ownership, not by a typed owner UUID.';

create or replace function public.attach_business_money_identity_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_public_key text;
  v_business public.business_entities%rowtype;
begin
  if new.account_type !~ '^business:biz_[0-9a-f]{32}$' then
    if new.business_id is not null then
      raise exception 'BUSINESS_MONEY_ACCOUNT_TYPE_INVALID' using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_public_key := substring(new.account_type from '^business:(biz_[0-9a-f]{32})$');
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = new.game_session_id
    and business_row.public_key = v_public_key;
  if not found then
    raise exception 'BUSINESS_MONEY_OWNER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if new.business_id is not null and new.business_id <> v_business.id then
    raise exception 'BUSINESS_MONEY_OWNER_MISMATCH' using errcode = 'P0001';
  end if;

  -- On account_balances, promote only the controller-compatible row. Historical
  -- zero rows belonging to a prior controller stay unpromoted and are not an
  -- authoritative Business balance.
  if tg_table_name = 'account_balances'
    and new.player_id is not null
    and new.player_id <> v_business.owner_player_id
  then
    return new;
  end if;

  new.business_id := v_business.id;
  return new;
end
$function$;

create trigger attach_business_money_identity_ledger
before insert or update of game_session_id, account_type, business_id
on public.ledger_entries
for each row execute function public.attach_business_money_identity_v2();

create trigger attach_business_money_identity_balance
before insert or update of game_session_id, player_id, account_type, business_id
on public.account_balances
for each row execute function public.attach_business_money_identity_v2();

create or replace function public.ensure_business_bank_account_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_balance_id uuid;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select balance_row.id
  into v_balance_id
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = p_business_id
    and balance_row.currency_code = v_business.currency_code
  limit 1;
  if found then
    return v_balance_id;
  end if;

  insert into public.account_balances(
    game_session_id,
    player_id,
    business_id,
    account_type,
    balance,
    currency_code,
    last_ledger_entry_id
  ) values (
    p_game_session_id,
    v_business.owner_player_id,
    v_business.id,
    public.business_account_type_v1(v_business.public_key),
    0,
    v_business.currency_code,
    null
  )
  returning id into v_balance_id;

  return v_balance_id;
end
$function$;

create or replace function public.read_business_balance_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_currency_code text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_balance numeric;
begin
  select balance_row.balance
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = p_business_id
    and balance_row.currency_code = upper(btrim(p_currency_code))
  limit 1;
  return coalesce(v_balance, 0);
end
$function$;

create or replace function public.record_business_ledger_entry_v2(
  p_game_session_id uuid,
  p_business_id uuid,
  p_amount numeric,
  p_currency_code text,
  p_entry_type text,
  p_source_domain text,
  p_source_action text,
  p_source_id uuid,
  p_created_by_type text,
  p_created_by_id uuid,
  p_audit_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_entry_id uuid,
  account_balance_id uuid,
  account_type text,
  balance numeric,
  currency_code text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_result record;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id
    and business_row.status <> 'closed'
  for share;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;
  if upper(btrim(p_currency_code)) <> v_business.currency_code then
    raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  perform public.ensure_business_bank_account_v2(p_game_session_id, p_business_id);

  select *
  into v_result
  from public.record_player_ledger_entry(
    p_game_session_id,
    v_business.owner_player_id,
    public.business_account_type_v1(v_business.public_key),
    p_amount,
    v_business.currency_code,
    p_entry_type,
    p_source_domain,
    p_source_action,
    p_source_id,
    p_created_by_type,
    p_created_by_id,
    coalesce(p_audit_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'business_id', v_business.id,
        'business_key', v_business.public_key,
        'business_money_authority', 'v2'
      )
  );

  return query select
    v_result.ledger_entry_id,
    v_result.account_balance_id,
    v_result.account_type,
    v_result.balance,
    v_result.currency_code,
    v_result.created_at;
end
$function$;

revoke all on function public.ensure_business_bank_account_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_business_bank_account_v2(uuid, uuid) to service_role;
revoke all on function public.read_business_balance_v2(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_business_balance_v2(uuid, uuid, text) to service_role;
revoke all on function public.record_business_ledger_entry_v2(
  uuid, uuid, numeric, text, text, text, text, uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.record_business_ledger_entry_v2(
  uuid, uuid, numeric, text, text, text, text, uuid, text, uuid, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Ownership invariant verifier
-- ---------------------------------------------------------------------------

create or replace function public.assert_business_ownership_invariants_v2(
  p_game_session_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_business public.business_entities%rowtype;
  v_owner_count integer;
  v_units bigint;
  v_voting_units bigint;
  v_share_structure public.business_corporate_share_structures%rowtype;
begin
  select business_row.*
  into v_business
  from public.business_entities as business_row
  where business_row.game_session_id = p_game_session_id
    and business_row.id = p_business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer, coalesce(sum(units), 0), coalesce(sum(voting_units), 0)
  into v_owner_count, v_units, v_voting_units
  from public.business_ownership_positions
  where game_session_id = p_game_session_id
    and business_id = p_business_id
    and status = 'active';

  if v_business.ownership_model_version = 1 then
    if v_owner_count < 1 then
      raise exception 'BUSINESS_OWNERSHIP_EMPTY' using errcode = 'P0001';
    end if;
    return;
  end if;

  if v_business.entity_type = 'sole_proprietorship' then
    if v_owner_count <> 1 or v_units <> 10000 or v_voting_units <> 10000 then
      raise exception 'SOLE_PROPRIETORSHIP_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'partnership' then
    if v_owner_count < 2 then
      raise exception 'PARTNERSHIP_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'llc' then
    if v_owner_count < 1 then
      raise exception 'LLC_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif v_business.entity_type = 'c_corporation' then
    if v_owner_count < 1 then
      raise exception 'CORPORATION_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
    select share_row.*
    into v_share_structure
    from public.business_corporate_share_structures as share_row
    where share_row.game_session_id = p_game_session_id
      and share_row.business_id = p_business_id;
    if not found or v_share_structure.outstanding_shares <> v_units then
      raise exception 'CORPORATION_SHARE_LEDGER_INVALID' using errcode = 'P0001';
    end if;
  else
    raise exception 'BUSINESS_ENTITY_TYPE_INVALID' using errcode = 'P0001';
  end if;
end
$function$;

revoke all on function public.assert_business_ownership_invariants_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_business_ownership_invariants_v2(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Activate an unanimously approved formation atomically
-- ---------------------------------------------------------------------------

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
    join public.business_ownership_positions as position_row
      on position_row.game_session_id = owner_row.game_session_id
     and position_row.player_id = owner_row.player_id
     and position_row.status = 'active'
    join public.business_entities as business_row
      on business_row.game_session_id = position_row.game_session_id
     and business_row.id = position_row.business_id
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

revoke all on function public.activate_business_formation_v2(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.activate_business_formation_v2(
  uuid, uuid, text, text
) to service_role;

commit;
