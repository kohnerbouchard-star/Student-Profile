-- Store purchase foundation V1.
-- Adds quote, purchase, inventory, and idempotency tables for the future
-- Supabase-backed STORE_PURCHASE replacement.
--
-- This migration intentionally adds schema only. It does not add routes, RPCs,
-- frontend calls, seed data, or Cloudflare changes.

alter table public.store_items
add constraint store_items_game_session_id_id_unique unique (game_session_id, id);

create table public.mutation_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  route_key text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'STARTED',
  result_type text null,
  result_id uuid null,
  response_body jsonb null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  expires_at timestamptz not null,

  constraint mutation_idempotency_keys_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint mutation_idempotency_keys_scope_unique unique (
    game_session_id,
    player_id,
    route_key,
    idempotency_key
  ),
  constraint mutation_idempotency_keys_route_key_not_blank check (length(btrim(route_key)) > 0),
  constraint mutation_idempotency_keys_idempotency_key_not_blank check (length(btrim(idempotency_key)) > 0),
  constraint mutation_idempotency_keys_request_hash_not_blank check (length(btrim(request_hash)) > 0),
  constraint mutation_idempotency_keys_status_check check (status in ('STARTED', 'COMPLETED', 'FAILED')),
  constraint mutation_idempotency_keys_completed_at_required check (
    status <> 'COMPLETED'
    or completed_at is not null
  ),
  constraint mutation_idempotency_keys_expires_after_created check (expires_at > created_at),
  constraint mutation_idempotency_keys_completed_after_created check (
    completed_at is null
    or completed_at >= created_at
  ),
  constraint mutation_idempotency_keys_result_id_requires_type check (
    result_id is null
    or result_type is not null
  ),
  constraint mutation_idempotency_keys_result_type_not_blank check (
    result_type is null
    or length(btrim(result_type)) > 0
  )
);

comment on table public.mutation_idempotency_keys is
  'Backend-only idempotency records for player mutation routes. Prevents duplicate purchases and supports safe retry behavior.';
comment on column public.mutation_idempotency_keys.route_key is
  'Stable route/action namespace, for example players.me.store.purchases.';
comment on column public.mutation_idempotency_keys.request_hash is
  'Server-generated hash of the meaningful request body for conflict detection.';
comment on column public.mutation_idempotency_keys.response_body is
  'Optional cached successful response body for exact duplicate retries.';

create index mutation_idempotency_keys_expires_at_idx
on public.mutation_idempotency_keys (expires_at);

create index mutation_idempotency_keys_player_created_at_idx
on public.mutation_idempotency_keys (game_session_id, player_id, created_at desc);

create table public.store_purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  store_item_id uuid not null,
  quantity integer not null,
  currency_code text not null default 'ECO',
  base_unit_price numeric(14, 2) not null,
  inflation_multiplier numeric(10, 4) not null default 1,
  location_multiplier numeric(10, 4) not null default 1,
  scarcity_multiplier numeric(10, 4) not null default 1,
  discount_amount numeric(14, 2) not null default 0,
  final_unit_price numeric(14, 2) not null,
  final_total_price numeric(14, 2) not null,
  pricing_version text not null default 'store-pricing-v1',
  status text not null default 'CREATED',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  cancelled_at timestamptz null,

  constraint store_purchase_quotes_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint store_purchase_quotes_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items (game_session_id, id),
  constraint store_purchase_quotes_quantity_positive check (quantity > 0),
  constraint store_purchase_quotes_currency_code_check check (
    currency_code = upper(currency_code)
    and length(currency_code) between 3 and 16
  ),
  constraint store_purchase_quotes_prices_non_negative check (
    base_unit_price >= 0
    and discount_amount >= 0
    and final_unit_price >= 0
    and final_total_price >= 0
  ),
  constraint store_purchase_quotes_multipliers_non_negative check (
    inflation_multiplier >= 0
    and location_multiplier >= 0
    and scarcity_multiplier >= 0
  ),
  constraint store_purchase_quotes_pricing_version_not_blank check (length(btrim(pricing_version)) > 0),
  constraint store_purchase_quotes_status_check check (status in ('CREATED', 'USED', 'EXPIRED', 'CANCELLED')),
  constraint store_purchase_quotes_expires_after_created check (expires_at > created_at),
  constraint store_purchase_quotes_used_at_status_check check (
    (status = 'USED' and used_at is not null)
    or (status <> 'USED' and used_at is null)
  ),
  constraint store_purchase_quotes_cancelled_at_status_check check (
    (status = 'CANCELLED' and cancelled_at is not null)
    or (status <> 'CANCELLED' and cancelled_at is null)
  )
);

comment on table public.store_purchase_quotes is
  'Short-lived server-owned store purchase quotes scoped to one player and one game session.';
comment on column public.store_purchase_quotes.base_unit_price is
  'Catalog base unit price captured at quote creation.';
comment on column public.store_purchase_quotes.final_total_price is
  'Authoritative quoted total the purchase route must verify before execution.';
comment on column public.store_purchase_quotes.pricing_version is
  'Server pricing policy version used to calculate the quote.';

create index store_purchase_quotes_player_status_expires_idx
on public.store_purchase_quotes (game_session_id, player_id, status, expires_at);

create index store_purchase_quotes_item_created_at_idx
on public.store_purchase_quotes (game_session_id, store_item_id, created_at desc);

create table public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  store_item_id uuid not null,
  quote_id uuid null references public.store_purchase_quotes (id),
  quantity integer not null,
  currency_code text not null default 'ECO',
  final_unit_price numeric(14, 2) not null,
  final_total_price numeric(14, 2) not null,
  ledger_entry_id uuid null references public.ledger_entries (id),
  idempotency_key text not null,
  status text not null default 'COMPLETED',
  client_submitted_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint store_purchases_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint store_purchases_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items (game_session_id, id),
  constraint store_purchases_idempotency_unique unique (game_session_id, player_id, idempotency_key),
  constraint store_purchases_quantity_positive check (quantity > 0),
  constraint store_purchases_currency_code_check check (
    currency_code = upper(currency_code)
    and length(currency_code) between 3 and 16
  ),
  constraint store_purchases_prices_non_negative check (
    final_unit_price >= 0
    and final_total_price >= 0
  ),
  constraint store_purchases_idempotency_key_not_blank check (length(btrim(idempotency_key)) > 0),
  constraint store_purchases_status_check check (status in ('COMPLETED', 'FAILED', 'REVERSED')),
  constraint store_purchases_completed_requires_ledger check (
    status <> 'COMPLETED'
    or ledger_entry_id is not null
  )
);

comment on table public.store_purchases is
  'Source records for completed, failed, or reversed player store purchases.';
comment on column public.store_purchases.quote_id is
  'Quote consumed by this purchase. Nullable only for later admin/import/reversal scenarios.';
comment on column public.store_purchases.ledger_entry_id is
  'Ledger debit created by the purchase transaction when completed.';

create index store_purchases_player_created_at_idx
on public.store_purchases (game_session_id, player_id, created_at desc);

create index store_purchases_item_created_at_idx
on public.store_purchases (game_session_id, store_item_id, created_at desc);

create index store_purchases_quote_id_idx
on public.store_purchases (quote_id);

create table public.inventory_holdings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  store_item_id uuid not null,
  quantity_owned integer not null default 0,
  quantity_reserved integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_holdings_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint inventory_holdings_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items (game_session_id, id),
  constraint inventory_holdings_scope_unique unique (game_session_id, player_id, store_item_id),
  constraint inventory_holdings_quantities_non_negative check (
    quantity_owned >= 0
    and quantity_reserved >= 0
  ),
  constraint inventory_holdings_reserved_not_greater_than_owned check (quantity_reserved <= quantity_owned)
);

create trigger set_inventory_holdings_updated_at
before update on public.inventory_holdings
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.inventory_holdings is
  'Current player-owned item quantities, projected from inventory events and purchase/use workflows.';
comment on column public.inventory_holdings.quantity_reserved is
  'Quantity reserved for pending use/approval workflows. V1 purchases should normally leave this at zero.';

create index inventory_holdings_player_idx
on public.inventory_holdings (game_session_id, player_id);

create index inventory_holdings_item_idx
on public.inventory_holdings (game_session_id, store_item_id);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  store_item_id uuid not null,
  quantity_delta integer not null,
  event_type text not null,
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint inventory_events_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint inventory_events_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items (game_session_id, id),
  constraint inventory_events_quantity_delta_not_zero check (quantity_delta <> 0),
  constraint inventory_events_event_type_check check (event_type in ('PURCHASED', 'USED', 'RESERVED', 'RELEASED', 'ADJUSTED', 'REVERSED')),
  constraint inventory_events_source_domain_not_blank check (length(btrim(source_domain)) > 0),
  constraint inventory_events_source_action_not_blank check (length(btrim(source_action)) > 0)
);

comment on table public.inventory_events is
  'Append-only inventory history for player item ownership changes.';
comment on column public.inventory_events.source_id is
  'Source record id from store purchases, item-use requests, staff adjustments, or reversal workflows.';

create index inventory_events_player_created_at_idx
on public.inventory_events (game_session_id, player_id, created_at desc);

create index inventory_events_source_idx
on public.inventory_events (source_domain, source_action, source_id);

create index inventory_events_item_created_at_idx
on public.inventory_events (game_session_id, store_item_id, created_at desc);

alter table public.mutation_idempotency_keys enable row level security;
alter table public.store_purchase_quotes enable row level security;
alter table public.store_purchases enable row level security;
alter table public.inventory_holdings enable row level security;
alter table public.inventory_events enable row level security;

-- No authenticated direct policies are added for these V1 tables.
-- Custom player sessions are not Supabase Auth identities, so trusted
-- service-role backend routes remain responsible for all sensitive reads/writes.
