-- Economic asset canonical constraints V2.
-- Ordered, forward-only domain migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Canonical foreign keys and constraints
-- ---------------------------------------------------------------------------

alter table public.store_items
  alter column game_item_id set not null,
  alter column inventory_account_id set not null;

alter table public.store_items
  add constraint store_items_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint store_items_inventory_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id);

alter table public.inventory_holdings
  alter column player_id drop not null,
  alter column store_item_id drop not null,
  alter column inventory_account_id set not null,
  alter column game_item_id set not null;

alter table public.inventory_holdings
  add constraint inventory_holdings_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint inventory_holdings_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint inventory_holdings_account_item_unique
    unique (game_session_id, inventory_account_id, game_item_id),
  add constraint inventory_holdings_average_cost_check check (average_unit_cost >= 0),
  add constraint inventory_holdings_cost_currency_check check (
    cost_currency_code is null or (
      cost_currency_code = upper(cost_currency_code)
      and length(cost_currency_code) between 3 and 16
    )
  ),
  add constraint inventory_holdings_version_check check (version > 0);

alter table public.inventory_events
  alter column player_id drop not null,
  alter column store_item_id drop not null,
  alter column inventory_account_id set not null,
  alter column game_item_id set not null;

alter table public.inventory_events
  add constraint inventory_events_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint inventory_events_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint inventory_events_transaction_scope_fk
    foreign key (game_session_id, inventory_transaction_id)
    references public.inventory_transactions(game_session_id, id);

alter table public.inventory_reservations
  alter column player_id drop not null,
  alter column store_item_id drop not null,
  alter column inventory_account_id set not null,
  alter column game_item_id set not null,
  alter column canonical_item_key set not null;

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_reason_type_check,
  drop constraint if exists inventory_reservations_item_key_check;

create unique index if not exists inventory_reservations_canonical_source_unique
  on public.inventory_reservations(
    game_session_id,
    inventory_account_id,
    game_item_id,
    reason_type,
    source_id
  )
  where status = 'active';

alter table public.inventory_reservations
  add constraint inventory_reservations_reason_type_check check (
    reason_type in (
      'crafting_input','equipment_action','business_production_input',
      'marketplace_listing','contract_delivery','redemption','maintenance',
      'salvage','transfer'
    )
  ),
  add constraint inventory_reservations_item_key_check check (
    item_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'
  ),
  add constraint inventory_reservations_canonical_item_key_check check (
    canonical_item_key ~ '^[a-z0-9][a-z0-9._-]{0,159}$'
  ),
  add constraint inventory_reservations_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint inventory_reservations_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint inventory_reservations_transaction_scope_fk
    foreign key (game_session_id, inventory_transaction_id)
    references public.inventory_transactions(game_session_id, id);

alter table public.crafting_job_outputs
  alter column game_item_id set not null,
  add constraint crafting_job_outputs_game_item_fk
    foreign key (game_item_id) references public.game_items(id);

-- Remove Store identity FKs from equipment/use records before canonical item keys
-- replace prefixed Store keys. Store item IDs remain nullable provenance.
do $block$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname, c.conrelid::regclass as relation_name
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.store_items'::regclass
      and c.conrelid in (
        'public.equipment_instances'::regclass,
        'public.item_use_requests'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', v_constraint.relation_name, v_constraint.conname);
  end loop;
end
$block$;

alter table public.equipment_instances
  alter column store_item_id drop not null,
  alter column inventory_account_id set not null,
  alter column game_item_id set not null,
  add constraint equipment_instances_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint equipment_instances_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint equipment_instances_store_item_provenance_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id);

alter table public.item_use_requests
  alter column store_item_id drop not null,
  alter column inventory_account_id set not null,
  alter column game_item_id set not null,
  add constraint item_use_requests_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint item_use_requests_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint item_use_requests_store_item_provenance_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id);

alter table public.game_session_item_supply
  alter column game_item_id set not null,
  add constraint game_session_item_supply_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id);

create unique index if not exists business_products_scope_id_unique
  on public.business_products(game_session_id, id);

alter table public.business_products
  add constraint business_products_product_kind_check check (
    product_kind in ('legacy_abstract','service','physical_good')
  ),
  add constraint business_products_output_game_item_fk
    foreign key (game_session_id, output_game_item_id)
    references public.game_items(game_session_id, id),
  add constraint business_products_output_kind_check check (
    (product_kind = 'physical_good' and output_game_item_id is not null)
    or (product_kind <> 'physical_good' and output_game_item_id is null)
  ) not valid;

alter table public.business_products
  validate constraint business_products_output_kind_check;

alter table public.business_inventory
  alter column inventory_account_id set not null,
  alter column game_item_id set not null;

create unique index if not exists business_inventory_canonical_kind_unique
  on public.business_inventory(game_session_id, business_id, game_item_id, inventory_kind);

alter table public.business_inventory
  add constraint business_inventory_account_scope_fk
    foreign key (game_session_id, inventory_account_id)
    references public.inventory_accounts(game_session_id, id),
  add constraint business_inventory_game_item_scope_fk
    foreign key (game_session_id, game_item_id)
    references public.game_items(game_session_id, id),
  add constraint business_inventory_total_cost_basis_check check (total_cost_basis >= 0);

create table if not exists public.business_product_inputs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_product_id uuid not null,
  input_game_item_id uuid not null,
  quantity_per_unit integer not null,
  waste_rate numeric(8,6) not null default 0,
  substitution_group text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_product_inputs_quantity_check check (quantity_per_unit > 0),
  constraint business_product_inputs_waste_rate_check check (waste_rate between 0 and 1),
  constraint business_product_inputs_substitution_check check (
    substitution_group is null or substitution_group ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ),
  constraint business_product_inputs_product_scope_fk
    foreign key (game_session_id, business_product_id)
    references public.business_products(game_session_id, id) on delete cascade,
  constraint business_product_inputs_item_scope_fk
    foreign key (game_session_id, input_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_product_inputs_scope_unique unique (
    game_session_id, business_product_id, input_game_item_id
  )
);

create trigger set_business_product_inputs_updated_at
before update on public.business_product_inputs
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_product_inputs enable row level security;
revoke all on table public.business_product_inputs from public, anon, authenticated;
grant select, insert, update, delete on table public.business_product_inputs to service_role;

create table if not exists public.business_product_outputs (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_product_id uuid not null,
  output_game_item_id uuid not null,
  quantity_per_unit integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_product_outputs_quantity_check check (quantity_per_unit > 0),
  constraint business_product_outputs_product_scope_fk
    foreign key (game_session_id, business_product_id)
    references public.business_products(game_session_id, id) on delete cascade,
  constraint business_product_outputs_item_scope_fk
    foreign key (game_session_id, output_game_item_id)
    references public.game_items(game_session_id, id) on delete restrict,
  constraint business_product_outputs_scope_unique unique (
    game_session_id, business_product_id, output_game_item_id
  )
);

create trigger set_business_product_outputs_updated_at
before update on public.business_product_outputs
for each row execute function public.set_current_timestamp_updated_at();

alter table public.business_product_outputs enable row level security;
revoke all on table public.business_product_outputs from public, anon, authenticated;
grant select, insert, update, delete on table public.business_product_outputs to service_role;

commit;
