-- Business authority foundation V2.
--
-- This is the first forward-only tranche of the Business redesign. It introduces
-- legal-entity policy, pending formation agreements, authoritative ownership
-- positions, corporation share structure, and immutable ownership/activity
-- journals. Existing live businesses are backfilled as compatibility positions;
-- no existing Business mutation route is changed by this migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Legal entity and tax-classification authority
-- ---------------------------------------------------------------------------

alter table public.business_entities
  add column if not exists tax_classification text,
  add column if not exists formation_state text not null default 'operational',
  add column if not exists ownership_model_version smallint not null default 1;

alter table public.business_entities
  drop constraint if exists business_entities_entity_type_check;

-- Legacy `corporation` and `cooperative` rows remain readable while all newly
-- formed V2 businesses are restricted by the formation command below to the
-- curriculum set: sole proprietorship, partnership, LLC, or C corporation.
alter table public.business_entities
  add constraint business_entities_entity_type_check check (
    entity_type in (
      'sole_proprietorship',
      'partnership',
      'llc',
      'c_corporation',
      'corporation',
      'cooperative'
    )
  );

update public.business_entities
set tax_classification = case entity_type
  when 'sole_proprietorship' then 'disregarded'
  when 'partnership' then 'partnership'
  when 'llc' then 'disregarded'
  when 'c_corporation' then 'c_corporation'
  when 'corporation' then 'c_corporation'
  when 'cooperative' then 'cooperative_legacy'
  else 'disregarded'
end
where tax_classification is null or btrim(tax_classification) = '';

alter table public.business_entities
  alter column tax_classification set not null;

alter table public.business_entities
  drop constraint if exists business_entities_tax_classification_check,
  drop constraint if exists business_entities_formation_state_check,
  drop constraint if exists business_entities_ownership_model_version_check;

alter table public.business_entities
  add constraint business_entities_tax_classification_check check (
    tax_classification in (
      'disregarded',
      'partnership',
      'c_corporation',
      'cooperative_legacy'
    )
  ),
  add constraint business_entities_formation_state_check check (
    formation_state in (
      'pending_ownership',
      'pending_capitalization',
      'operational',
      'converting',
      'winding_up',
      'liquidated'
    )
  ),
  add constraint business_entities_ownership_model_version_check check (
    ownership_model_version in (1, 2)
  );

comment on column public.business_entities.tax_classification is
  'Server-owned tax classification. Legal entity and tax classification are intentionally separate.';
comment on column public.business_entities.formation_state is
  'Authoritative formation/governance lifecycle state. Existing businesses are backfilled operational.';
comment on column public.business_entities.ownership_model_version is
  '1 identifies legacy single-controller compatibility businesses; 2 identifies the authoritative ownership-ledger model.';

create or replace function public.business_default_tax_classification_v2(
  p_entity_type text,
  p_owner_count integer
)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $function$
declare
  v_entity text := lower(btrim(p_entity_type));
begin
  if p_owner_count < 1 then
    raise exception 'BUSINESS_OWNER_COUNT_INVALID' using errcode = 'P0001';
  end if;

  return case v_entity
    when 'sole_proprietorship' then 'disregarded'
    when 'partnership' then 'partnership'
    when 'llc' then case when p_owner_count = 1 then 'disregarded' else 'partnership' end
    when 'c_corporation' then 'c_corporation'
    else null
  end;
end
$function$;

create or replace function public.business_ownership_kind_v2(p_entity_type text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $function$
  select case lower(btrim(p_entity_type))
    when 'sole_proprietorship' then 'owner'
    when 'partnership' then 'partnership_interest'
    when 'llc' then 'membership_interest'
    when 'c_corporation' then 'share'
    when 'corporation' then 'share'
    when 'cooperative' then 'membership_interest'
    else null
  end
$function$;

-- ---------------------------------------------------------------------------
-- Authoritative formation agreements
-- ---------------------------------------------------------------------------

create table if not exists public.business_formation_proposals (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bfp_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  proposer_player_id uuid not null,
  legal_name text not null,
  entity_type text not null,
  tax_classification text not null,
  industry_code text not null,
  country_code text not null,
  currency_code text not null,
  status text not null default 'pending_approval',
  formation_fee numeric(14,2) not null default 0,
  total_initial_units integer not null default 10000,
  authorized_shares integer null,
  idempotency_key text not null,
  request_hash text not null,
  activated_business_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz null,

  constraint business_formation_proposals_public_key_check
    check (public_key ~ '^bfp_[0-9a-f]{32}$'),
  constraint business_formation_proposals_player_scope_fk
    foreign key (game_session_id, proposer_player_id)
    references public.players(game_session_id, id),
  constraint business_formation_proposals_business_scope_fk
    foreign key (game_session_id, activated_business_id)
    references public.business_entities(game_session_id, id),
  constraint business_formation_proposals_entity_type_check
    check (entity_type in ('sole_proprietorship', 'partnership', 'llc', 'c_corporation')),
  constraint business_formation_proposals_tax_classification_check
    check (tax_classification in ('disregarded', 'partnership', 'c_corporation')),
  constraint business_formation_proposals_status_check
    check (status in (
      'pending_approval',
      'pending_capitalization',
      'activated',
      'rejected',
      'cancelled'
    )),
  constraint business_formation_proposals_legal_name_check
    check (length(btrim(legal_name)) between 2 and 160),
  constraint business_formation_proposals_industry_code_check
    check (industry_code ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  constraint business_formation_proposals_country_code_check
    check (country_code = upper(country_code) and length(country_code) between 2 and 16),
  constraint business_formation_proposals_currency_code_check
    check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint business_formation_proposals_fee_check check (formation_fee >= 0),
  constraint business_formation_proposals_initial_units_check check (total_initial_units = 10000),
  constraint business_formation_proposals_authorized_shares_check check (
    (entity_type = 'c_corporation' and authorized_shares is not null and authorized_shares >= total_initial_units)
    or (entity_type <> 'c_corporation' and authorized_shares is null)
  ),
  constraint business_formation_proposals_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_formation_proposals_request_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_formation_proposals_activation_check check (
    (status = 'activated' and activated_business_id is not null and activated_at is not null)
    or status <> 'activated'
  ),
  constraint business_formation_proposals_idempotency_unique
    unique (game_session_id, proposer_player_id, idempotency_key),
  constraint business_formation_proposals_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_formation_proposals_player_status_idx
  on public.business_formation_proposals(game_session_id, proposer_player_id, status, created_at desc);
create index if not exists business_formation_proposals_status_idx
  on public.business_formation_proposals(game_session_id, status, created_at);

create trigger set_business_formation_proposals_updated_at
before update on public.business_formation_proposals
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_formation_proposals enable row level security;
revoke all on table public.business_formation_proposals from public, anon, authenticated;
grant select, insert, update on table public.business_formation_proposals to service_role;

create table if not exists public.business_formation_owners (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  formation_id uuid not null,
  player_id uuid not null,
  proposed_units integer not null,
  proposed_voting_units integer not null,
  capital_contribution numeric(14,2) not null default 0,
  approval_status text not null default 'pending',
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_formation_owners_formation_scope_fk
    foreign key (game_session_id, formation_id)
    references public.business_formation_proposals(game_session_id, id)
    on delete cascade,
  constraint business_formation_owners_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_formation_owners_units_check
    check (proposed_units between 1 and 10000),
  constraint business_formation_owners_voting_units_check
    check (proposed_voting_units between 0 and 10000),
  constraint business_formation_owners_contribution_check
    check (capital_contribution >= 0 and capital_contribution <= 10000000),
  constraint business_formation_owners_approval_check
    check (approval_status in ('pending', 'approved', 'rejected')),
  constraint business_formation_owners_response_check check (
    (approval_status = 'pending' and responded_at is null)
    or (approval_status in ('approved', 'rejected') and responded_at is not null)
  ),
  constraint business_formation_owners_scope_unique
    unique (game_session_id, formation_id, player_id),
  constraint business_formation_owners_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_formation_owners_player_status_idx
  on public.business_formation_owners(game_session_id, player_id, approval_status, created_at desc);

create trigger set_business_formation_owners_updated_at
before update on public.business_formation_owners
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_formation_owners enable row level security;
revoke all on table public.business_formation_owners from public, anon, authenticated;
grant select, insert, update on table public.business_formation_owners to service_role;

-- ---------------------------------------------------------------------------
-- Current ownership positions and immutable ownership history
-- ---------------------------------------------------------------------------

create table if not exists public.business_ownership_positions (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('own_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  player_id uuid not null,
  ownership_kind text not null,
  units bigint not null,
  voting_units bigint not null,
  status text not null default 'active',
  effective_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_ownership_positions_public_key_check
    check (public_key ~ '^own_[0-9a-f]{32}$'),
  constraint business_ownership_positions_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id)
    on delete cascade,
  constraint business_ownership_positions_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint business_ownership_positions_kind_check
    check (ownership_kind in ('owner', 'partnership_interest', 'membership_interest', 'share')),
  constraint business_ownership_positions_units_check check (units > 0),
  constraint business_ownership_positions_voting_units_check check (voting_units >= 0),
  constraint business_ownership_positions_status_check check (status in ('active', 'exited')),
  constraint business_ownership_positions_end_check check (
    (status = 'active' and ended_at is null)
    or (status = 'exited' and ended_at is not null)
  ),
  constraint business_ownership_positions_scope_id_unique
    unique (game_session_id, id)
);

create unique index if not exists business_ownership_positions_active_owner_unique
  on public.business_ownership_positions(game_session_id, business_id, player_id)
  where status = 'active';
create index if not exists business_ownership_positions_player_idx
  on public.business_ownership_positions(game_session_id, player_id, status, business_id);
create index if not exists business_ownership_positions_business_idx
  on public.business_ownership_positions(game_session_id, business_id, status, player_id);

create trigger set_business_ownership_positions_updated_at
before update on public.business_ownership_positions
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_ownership_positions enable row level security;
revoke all on table public.business_ownership_positions from public, anon, authenticated;
grant select, insert, update on table public.business_ownership_positions to service_role;

create table if not exists public.business_ownership_transactions (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bot_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  transaction_kind text not null,
  ownership_kind text not null,
  from_player_id uuid null,
  to_player_id uuid null,
  units bigint not null,
  voting_units bigint not null,
  consideration_amount numeric(14,2) not null default 0,
  currency_code text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint business_ownership_transactions_public_key_check
    check (public_key ~ '^bot_[0-9a-f]{32}$'),
  constraint business_ownership_transactions_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id)
    on delete restrict,
  constraint business_ownership_transactions_from_scope_fk
    foreign key (game_session_id, from_player_id)
    references public.players(game_session_id, id),
  constraint business_ownership_transactions_to_scope_fk
    foreign key (game_session_id, to_player_id)
    references public.players(game_session_id, id),
  constraint business_ownership_transactions_kind_check check (
    transaction_kind in (
      'formation',
      'transfer',
      'issuance',
      'capital_raise',
      'acquisition',
      'conversion',
      'liquidation'
    )
  ),
  constraint business_ownership_transactions_ownership_kind_check
    check (ownership_kind in ('owner', 'partnership_interest', 'membership_interest', 'share')),
  constraint business_ownership_transactions_units_check check (units > 0),
  constraint business_ownership_transactions_voting_units_check check (voting_units >= 0),
  constraint business_ownership_transactions_consideration_check check (consideration_amount >= 0),
  constraint business_ownership_transactions_currency_check
    check (currency_code = upper(currency_code) and length(currency_code) between 3 and 16),
  constraint business_ownership_transactions_idempotency_check
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_ownership_transactions_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_ownership_transactions_party_check
    check (from_player_id is not null or to_player_id is not null),
  constraint business_ownership_transactions_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_ownership_transactions_scope_id_unique
    unique (game_session_id, id)
);

create index if not exists business_ownership_transactions_business_created_idx
  on public.business_ownership_transactions(game_session_id, business_id, created_at desc);
create index if not exists business_ownership_transactions_player_created_idx
  on public.business_ownership_transactions(game_session_id, to_player_id, created_at desc)
  where to_player_id is not null;

alter table public.business_ownership_transactions enable row level security;
revoke all on table public.business_ownership_transactions from public, anon, authenticated;
grant select, insert on table public.business_ownership_transactions to service_role;

create or replace function public.guard_business_ownership_transaction_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  raise exception 'BUSINESS_OWNERSHIP_TRANSACTION_IMMUTABLE' using errcode = '42501';
end
$function$;

create trigger guard_business_ownership_transaction
before update or delete on public.business_ownership_transactions
for each row execute function public.guard_business_ownership_transaction_v2();

-- Corporation-specific share structure. Percent ownership is never entered by
-- the browser after formation; it is derived from active shares/outstanding.
create table if not exists public.business_corporate_share_structures (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null,
  authorized_shares bigint not null,
  issued_shares bigint not null,
  treasury_shares bigint not null default 0,
  outstanding_shares bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_corporate_share_structures_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id)
    on delete cascade,
  constraint business_corporate_share_structures_share_check check (
    authorized_shares > 0
    and issued_shares >= 0
    and treasury_shares >= 0
    and outstanding_shares >= 0
    and issued_shares <= authorized_shares
    and treasury_shares <= issued_shares
    and outstanding_shares = issued_shares - treasury_shares
  ),
  constraint business_corporate_share_structures_scope_unique
    unique (game_session_id, business_id),
  constraint business_corporate_share_structures_scope_id_unique
    unique (game_session_id, id)
);

create trigger set_business_corporate_share_structures_updated_at
before update on public.business_corporate_share_structures
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_corporate_share_structures enable row level security;
revoke all on table public.business_corporate_share_structures from public, anon, authenticated;
grant select, insert, update on table public.business_corporate_share_structures to service_role;

-- ---------------------------------------------------------------------------
-- Durable Business activity history
-- ---------------------------------------------------------------------------

create table if not exists public.business_activity_events (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bae_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid null,
  formation_id uuid null,
  actor_type text not null,
  actor_player_id uuid null,
  event_type text not null,
  source_id uuid null,
  reason_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),

  constraint business_activity_events_public_key_check
    check (public_key ~ '^bae_[0-9a-f]{32}$'),
  constraint business_activity_events_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id)
    on delete restrict,
  constraint business_activity_events_formation_scope_fk
    foreign key (game_session_id, formation_id)
    references public.business_formation_proposals(game_session_id, id)
    on delete restrict,
  constraint business_activity_events_actor_scope_fk
    foreign key (game_session_id, actor_player_id)
    references public.players(game_session_id, id),
  constraint business_activity_events_actor_type_check
    check (actor_type in ('player', 'system', 'staff_user')),
  constraint business_activity_events_event_type_check
    check (event_type ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  constraint business_activity_events_reason_code_check
    check (reason_code ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  constraint business_activity_events_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint business_activity_events_target_check
    check (business_id is not null or formation_id is not null)
);

create index if not exists business_activity_events_business_idx
  on public.business_activity_events(game_session_id, business_id, occurred_at desc)
  where business_id is not null;
create index if not exists business_activity_events_formation_idx
  on public.business_activity_events(game_session_id, formation_id, occurred_at desc)
  where formation_id is not null;

alter table public.business_activity_events enable row level security;
revoke all on table public.business_activity_events from public, anon, authenticated;
grant select, insert on table public.business_activity_events to service_role;

create or replace function public.guard_business_activity_event_v2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  raise exception 'BUSINESS_ACTIVITY_EVENT_IMMUTABLE' using errcode = '42501';
end
$function$;

create trigger guard_business_activity_event
before update or delete on public.business_activity_events
for each row execute function public.guard_business_activity_event_v2();

-- ---------------------------------------------------------------------------
-- Existing live-business compatibility backfill
-- ---------------------------------------------------------------------------

insert into public.business_ownership_positions (
  game_session_id,
  business_id,
  player_id,
  ownership_kind,
  units,
  voting_units,
  status,
  effective_at
)
select
  business_row.game_session_id,
  business_row.id,
  business_row.owner_player_id,
  public.business_ownership_kind_v2(business_row.entity_type),
  10000,
  10000,
  'active',
  business_row.created_at
from public.business_entities as business_row
where not exists (
  select 1
  from public.business_ownership_positions as position_row
  where position_row.game_session_id = business_row.game_session_id
    and position_row.business_id = business_row.id
    and position_row.player_id = business_row.owner_player_id
    and position_row.status = 'active'
);

insert into public.business_ownership_transactions (
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
  metadata,
  created_at
)
select
  business_row.game_session_id,
  business_row.id,
  'formation',
  public.business_ownership_kind_v2(business_row.entity_type),
  null,
  business_row.owner_player_id,
  10000,
  10000,
  business_row.capitalization,
  business_row.currency_code,
  'legacy-backfill:' || business_row.public_key,
  jsonb_build_object(
    'legacyBackfill', true,
    'ownershipModelVersion', 1,
    'source', 'owner_player_id'
  ),
  business_row.created_at
from public.business_entities as business_row
where not exists (
  select 1
  from public.business_ownership_transactions as transaction_row
  where transaction_row.game_session_id = business_row.game_session_id
    and transaction_row.business_id = business_row.id
    and transaction_row.idempotency_key = 'legacy-backfill:' || business_row.public_key
);

insert into public.business_corporate_share_structures (
  game_session_id,
  business_id,
  authorized_shares,
  issued_shares,
  treasury_shares,
  outstanding_shares
)
select
  business_row.game_session_id,
  business_row.id,
  1000000,
  10000,
  0,
  10000
from public.business_entities as business_row
where business_row.entity_type in ('corporation', 'c_corporation')
on conflict (game_session_id, business_id) do nothing;

-- ---------------------------------------------------------------------------
-- Server-calculated formation fee and formation commands
-- ---------------------------------------------------------------------------

create or replace function public.business_formation_fee_v2(
  p_game_session_id uuid,
  p_entity_type text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_entity text := lower(btrim(coalesce(p_entity_type, '')));
  v_config jsonb := '{}'::jsonb;
  v_override text;
  v_default numeric;
begin
  select coalesce(settings_row.business_market_window -> 'entityFormationFees', '{}'::jsonb)
  into v_config
  from public.game_settings as settings_row
  where settings_row.game_session_id = p_game_session_id;

  v_default := case v_entity
    when 'sole_proprietorship' then 75
    when 'partnership' then 150
    when 'llc' then 250
    when 'c_corporation' then 400
    else null
  end;
  if v_default is null then
    raise exception 'BUSINESS_ENTITY_TYPE_INVALID' using errcode = 'P0001';
  end if;

  v_override := nullif(v_config ->> v_entity, '');
  if v_override is not null and v_override ~ '^\d+(\.\d{1,2})?$' then
    return least(1000000, greatest(0, round(v_override::numeric, 2)));
  end if;
  return v_default;
end
$function$;

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
    from public.business_ownership_positions as position_row
    join public.business_entities as business_row
      on business_row.game_session_id = position_row.game_session_id
     and business_row.id = position_row.business_id
    where position_row.game_session_id = p_game_session_id
      and position_row.player_id = p_player_id
      and position_row.status = 'active'
      and business_row.status <> 'closed'
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

create or replace function public.respond_business_formation_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_formation_key text,
  p_decision text,
  p_idempotency_key text
)
returns table (
  formation_key text,
  status text,
  player_decision text,
  approvals integer,
  owner_count integer,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_formation public.business_formation_proposals%rowtype;
  v_owner public.business_formation_owners%rowtype;
  v_approvals integer;
  v_owner_count integer;
  v_existing record;
begin
  if v_decision not in ('approve', 'reject') then
    raise exception 'BUSINESS_FORMATION_DECISION_INVALID' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select audit_row.metadata ->> 'decision' as decision
  into v_existing
  from public.audit_log as audit_row
  where audit_row.game_session_id = p_game_session_id
    and audit_row.actor_id = p_player_id
    and audit_row.action = 'business.formation.respond'
    and audit_row.metadata ->> 'idempotency_key' = p_idempotency_key
  limit 1;
  if found then
    select proposal_row.*
    into v_formation
    from public.business_formation_proposals as proposal_row
    join public.business_formation_owners as owner_row
      on owner_row.game_session_id = proposal_row.game_session_id
     and owner_row.formation_id = proposal_row.id
    where proposal_row.game_session_id = p_game_session_id
      and proposal_row.public_key = lower(btrim(p_formation_key))
      and owner_row.player_id = p_player_id;
    if not found then
      raise exception 'BUSINESS_FORMATION_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_existing.decision <> v_decision then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    select
      count(*) filter (where approval_status = 'approved')::integer,
      count(*)::integer
    into v_approvals, v_owner_count
    from public.business_formation_owners
    where game_session_id = p_game_session_id
      and formation_id = v_formation.id;
    return query select
      v_formation.public_key,
      v_formation.status,
      v_existing.decision,
      v_approvals,
      v_owner_count,
      true;
    return;
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
  if v_formation.status <> 'pending_approval' then
    raise exception 'BUSINESS_FORMATION_NOT_AWAITING_APPROVAL' using errcode = 'P0001';
  end if;

  select owner_row.*
  into v_owner
  from public.business_formation_owners as owner_row
  where owner_row.game_session_id = p_game_session_id
    and owner_row.formation_id = v_formation.id
    and owner_row.player_id = p_player_id
  for update;
  if not found then
    raise exception 'BUSINESS_FORMATION_OWNER_REQUIRED' using errcode = 'P0001';
  end if;
  if v_owner.approval_status <> 'pending' then
    raise exception 'BUSINESS_FORMATION_OWNER_ALREADY_RESPONDED' using errcode = 'P0001';
  end if;

  update public.business_formation_owners
  set
    approval_status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
    responded_at = now()
  where id = v_owner.id;

  if v_decision = 'reject' then
    update public.business_formation_proposals
    set status = 'rejected'
    where id = v_formation.id
    returning * into v_formation;
  else
    select
      count(*) filter (where approval_status = 'approved')::integer,
      count(*)::integer
    into v_approvals, v_owner_count
    from public.business_formation_owners
    where game_session_id = p_game_session_id
      and formation_id = v_formation.id;

    if v_approvals = v_owner_count then
      update public.business_formation_proposals
      set status = 'pending_capitalization'
      where id = v_formation.id
      returning * into v_formation;
    end if;
  end if;

  select
    count(*) filter (where approval_status = 'approved')::integer,
    count(*)::integer
  into v_approvals, v_owner_count
  from public.business_formation_owners
  where game_session_id = p_game_session_id
    and formation_id = v_formation.id;

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
    case when v_decision = 'approve'
      then 'business.formation.owner_approved'
      else 'business.formation.owner_rejected'
    end,
    v_owner.id,
    case when v_decision = 'approve' then 'owner_approved' else 'owner_rejected' end,
    jsonb_build_object(
      'decision', v_decision,
      'approvals', v_approvals,
      'ownerCount', v_owner_count,
      'formationStatus', v_formation.status
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
    'business.formation.respond',
    'business_formation',
    v_formation.id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'formation_key', v_formation.public_key,
      'decision', v_decision,
      'formation_status', v_formation.status
    )
  );

  return query select
    v_formation.public_key,
    v_formation.status,
    v_decision,
    v_approvals,
    v_owner_count,
    false;
end
$function$;

revoke all on function public.business_formation_fee_v2(uuid, text)
  from public, anon, authenticated;
grant execute on function public.business_formation_fee_v2(uuid, text) to service_role;

revoke all on function public.propose_business_formation_v2(
  uuid, uuid, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.propose_business_formation_v2(
  uuid, uuid, text, text, text, jsonb, text
) to service_role;

revoke all on function public.respond_business_formation_v2(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.respond_business_formation_v2(
  uuid, uuid, text, text, text
) to service_role;

commit;
