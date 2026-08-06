-- Economic asset identity, parties, accounts, and journal foundation V2.
-- Part 1 of 5 from the reviewed domain migration; ordered and forward-only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Economic Asset and Ownership Core V2.
--
-- Additive migration only. Existing public HTTP routes and RPC signatures remain
-- unchanged. The migration establishes canonical game-item identity, first-class
-- economic parties, inventory accounts, transaction history, and compatibility
-- projections for Store, Crafting, Marketplace, redemption, equipment, and
-- Business. Domain cutovers are performed by later forward-only migrations.



create schema if not exists economy_private;
revoke all on schema economy_private from public, anon, authenticated;
grant usage on schema economy_private to service_role;

-- ---------------------------------------------------------------------------
-- Canonical item identity
-- ---------------------------------------------------------------------------

create table if not exists public.game_items (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('itm_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  canonical_key text not null,
  source_kind text not null,
  physical_item_definition_id uuid null references public.physical_economy_item_definitions(id) on delete restrict,
  name text not null,
  description text null,
  item_class text not null,
  subtype text not null default 'general',
  stackable boolean not null default true,
  serialized boolean not null default false,
  transferable boolean not null default true,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_items_public_key_check check (public_key ~ '^itm_[0-9a-f]{32}$'),
  constraint game_items_canonical_key_check check (canonical_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'),
  constraint game_items_source_kind_check check (
    source_kind in ('physical_pack','business_product','store_created','admin_created','system','legacy')
  ),
  constraint game_items_name_check check (length(btrim(name)) between 1 and 160),
  constraint game_items_item_class_check check (
    item_class in (
      'material','component','equipment','consumable','blueprint','authorization',
      'finished_good','service','entitlement','cosmetic','legacy'
    )
  ),
  constraint game_items_subtype_check check (subtype ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint game_items_status_check check (status in ('active','disabled','retired')),
  constraint game_items_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint game_items_version_check check (version > 0),
  constraint game_items_serialization_check check (not serialized or not stackable),
  constraint game_items_scope_unique unique (game_session_id, canonical_key),
  constraint game_items_scope_id_unique unique (game_session_id, id)
);

create unique index if not exists game_items_physical_definition_scope_unique
  on public.game_items(game_session_id, physical_item_definition_id)
  where physical_item_definition_id is not null;

create index if not exists game_items_game_class_status_idx
  on public.game_items(game_session_id, item_class, status, canonical_key);

create trigger set_game_items_updated_at
before update on public.game_items
for each row execute function public.set_current_timestamp_updated_at();

alter table public.game_items enable row level security;
revoke all on table public.game_items from public, anon, authenticated;
grant select, insert, update, delete on table public.game_items to service_role;

-- ---------------------------------------------------------------------------
-- First-class economic parties and inventory accounts
-- ---------------------------------------------------------------------------

create unique index if not exists business_entities_scope_id_unique
  on public.business_entities(game_session_id, id);

create table if not exists public.economic_parties (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('pty_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  party_kind text not null,
  player_id uuid null,
  business_id uuid null,
  system_key text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint economic_parties_public_key_check check (public_key ~ '^pty_[0-9a-f]{32}$'),
  constraint economic_parties_kind_check check (
    party_kind in ('player','business','store','escrow','country','system')
  ),
  constraint economic_parties_status_check check (status in ('active','disabled','closed')),
  constraint economic_parties_system_key_check check (
    system_key is null or system_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  ),
  constraint economic_parties_identity_check check (
    (party_kind = 'player' and player_id is not null and business_id is null and system_key is null)
    or (party_kind = 'business' and business_id is not null and player_id is null and system_key is null)
    or (party_kind in ('store','escrow','country','system') and system_key is not null and player_id is null and business_id is null)
  ),
  constraint economic_parties_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players(game_session_id, id),
  constraint economic_parties_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint economic_parties_scope_id_unique unique (game_session_id, id)
);

create unique index if not exists economic_parties_player_scope_unique
  on public.economic_parties(game_session_id, player_id)
  where player_id is not null;

create unique index if not exists economic_parties_business_scope_unique
  on public.economic_parties(game_session_id, business_id)
  where business_id is not null;

create unique index if not exists economic_parties_system_scope_unique
  on public.economic_parties(game_session_id, party_kind, system_key)
  where system_key is not null;

create trigger set_economic_parties_updated_at
before update on public.economic_parties
for each row execute function public.set_current_timestamp_updated_at();

alter table public.economic_parties enable row level security;
revoke all on table public.economic_parties from public, anon, authenticated;
grant select, insert, update, delete on table public.economic_parties to service_role;

create table if not exists public.inventory_accounts (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('iac_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  party_id uuid not null,
  account_kind text not null,
  location_key text null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_accounts_public_key_check check (public_key ~ '^iac_[0-9a-f]{32}$'),
  constraint inventory_accounts_kind_check check (
    account_kind in (
      'personal','warehouse','work_in_progress','finished_goods','escrow',
      'store_stock','in_transit','system_source','system_sink'
    )
  ),
  constraint inventory_accounts_location_key_check check (
    location_key is null or length(btrim(location_key)) between 1 and 160
  ),
  constraint inventory_accounts_status_check check (status in ('active','disabled','closed')),
  constraint inventory_accounts_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_accounts_party_scope_fk
    foreign key (game_session_id, party_id)
    references public.economic_parties(game_session_id, id),
  constraint inventory_accounts_scope_id_unique unique (game_session_id, id)
);

create unique index if not exists inventory_accounts_party_kind_location_unique
  on public.inventory_accounts(
    game_session_id,
    party_id,
    account_kind,
    coalesce(location_key, '')
  );

create index if not exists inventory_accounts_game_kind_status_idx
  on public.inventory_accounts(game_session_id, account_kind, status);

create trigger set_inventory_accounts_updated_at
before update on public.inventory_accounts
for each row execute function public.set_current_timestamp_updated_at();

alter table public.inventory_accounts enable row level security;
revoke all on table public.inventory_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_accounts to service_role;

-- ---------------------------------------------------------------------------
-- Append-only inventory movement journal
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('itx_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  transaction_type text not null,
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz null,
  constraint inventory_transactions_public_key_check check (public_key ~ '^itx_[0-9a-f]{32}$'),
  constraint inventory_transactions_type_check check (
    transaction_type in (
      'purchase','transfer','reservation','release','consumption','production',
      'grant','adjustment','reversal','sale','redemption','salvage'
    )
  ),
  constraint inventory_transactions_source_domain_check check (length(btrim(source_domain)) between 1 and 80),
  constraint inventory_transactions_source_action_check check (length(btrim(source_action)) between 1 and 120),
  constraint inventory_transactions_idempotency_check check (length(btrim(idempotency_key)) between 1 and 160),
  constraint inventory_transactions_request_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint inventory_transactions_status_check check (status in ('pending','committed','reversed')),
  constraint inventory_transactions_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_transactions_committed_at_check check (
    (status = 'committed' and committed_at is not null)
    or (status in ('pending','reversed'))
  ),
  constraint inventory_transactions_idempotency_unique unique (
    game_session_id, source_domain, source_action, idempotency_key
  ),
  constraint inventory_transactions_scope_id_unique unique (game_session_id, id)
);

create index if not exists inventory_transactions_source_idx
  on public.inventory_transactions(game_session_id, source_domain, source_action, source_id, created_at desc);

alter table public.inventory_transactions enable row level security;
revoke all on table public.inventory_transactions from public, anon, authenticated;
grant select, insert, update on table public.inventory_transactions to service_role;

create table if not exists public.inventory_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  transaction_id uuid not null,
  inventory_account_id uuid not null,
  game_item_id uuid not null,
  quantity_delta numeric(18,3) not null,
  reservation_delta numeric(18,3) not null default 0,
  unit_cost numeric(18,4) null,
  currency_code text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_transaction_lines_quantity_check check (
    quantity_delta <> 0 or reservation_delta <> 0
  ),
  constraint inventory_transaction_lines_unit_cost_check check (unit_cost is null or unit_cost >= 0),
  constraint inventory_transaction_lines_currency_check check (
    currency_code is null or (
      currency_code = upper(currency_code)
      and length(currency_code) between 3 and 16
    )
  ),
  constraint inventory_transaction_lines_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint inventory_transaction_lines_transaction_scope_fk
    foreign key (game_session_id, transaction_id)
    references public.inventory_transactions(game_session_id, id),
  constraint inventory_transaction_lines_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  constraint inventory_transaction_lines_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id)
);

create index if not exists inventory_transaction_lines_account_created_idx
  on public.inventory_transaction_lines(game_session_id, inventory_account_id, created_at desc);
create index if not exists inventory_transaction_lines_item_created_idx
  on public.inventory_transaction_lines(game_session_id, game_item_id, created_at desc);

alter table public.inventory_transaction_lines enable row level security;
revoke all on table public.inventory_transaction_lines from public, anon, authenticated;
grant select, insert on table public.inventory_transaction_lines to service_role;

-- Enforce the journal's append-only contract in the database. A transaction may
-- move from pending to a terminal state, but its economic identity and lines are
-- immutable once inserted. Corrections are represented by a new reversal entry.
create or replace function economy_private.guard_inventory_transaction_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'INVENTORY_TRANSACTION_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  if old.status <> 'pending'
    or new.status not in ('committed','reversed')
    or new.id is distinct from old.id
    or new.public_key is distinct from old.public_key
    or new.game_session_id is distinct from old.game_session_id
    or new.transaction_type is distinct from old.transaction_type
    or new.source_domain is distinct from old.source_domain
    or new.source_action is distinct from old.source_action
    or new.source_id is distinct from old.source_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.metadata is distinct from old.metadata
    or new.created_at is distinct from old.created_at
  then
    raise exception 'INVENTORY_TRANSACTION_IMMUTABLE' using errcode = '42501';
  end if;

  if new.status = 'committed' and new.committed_at is null then
    raise exception 'INVENTORY_TRANSACTION_COMMITTED_AT_REQUIRED' using errcode = 'P0001';
  end if;

  return new;
end
$function$;

create trigger guard_inventory_transaction_mutation_v2
before update or delete on public.inventory_transactions
for each row execute function economy_private.guard_inventory_transaction_mutation_v2();

create or replace function economy_private.guard_inventory_transaction_line_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = public, economy_private, pg_temp
as $function$
begin
  raise exception 'INVENTORY_TRANSACTION_LINE_IMMUTABLE' using errcode = '42501';
end
$function$;

create trigger guard_inventory_transaction_line_mutation_v2
before update or delete on public.inventory_transaction_lines
for each row execute function economy_private.guard_inventory_transaction_line_mutation_v2();

-- ---------------------------------------------------------------------------
-- Add canonical references to existing projections without changing public IDs.
-- ---------------------------------------------------------------------------

alter table public.store_items
  add column if not exists game_item_id uuid,
  add column if not exists source_item_stable_id text,
  add column if not exists inventory_account_id uuid;

alter table public.inventory_holdings
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists average_unit_cost numeric(18,4) not null default 0,
  add column if not exists cost_currency_code text,
  add column if not exists version bigint not null default 1;

-- Canonical stock and Business accounts are not players, and crafted outputs may
-- have no Store offer. Legacy provenance columns therefore become nullable while
-- canonical account/item columns become mandatory later in this migration.
alter table public.inventory_holdings
  alter column player_id drop not null,
  alter column store_item_id drop not null;

alter table public.inventory_events
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists inventory_transaction_id uuid;

alter table public.inventory_reservations
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists canonical_item_key text,
  add column if not exists inventory_transaction_id uuid;

alter table public.crafting_job_outputs
  add column if not exists game_item_id uuid;

alter table public.equipment_instances
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid;

alter table public.item_use_requests
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid;

alter table public.game_session_item_supply
  add column if not exists game_item_id uuid;

alter table public.business_products
  add column if not exists product_kind text not null default 'legacy_abstract',
  add column if not exists output_game_item_id uuid;

alter table public.business_inventory
  add column if not exists inventory_account_id uuid,
  add column if not exists game_item_id uuid,
  add column if not exists total_cost_basis numeric(18,4) not null default 0;


commit;
