begin;

create table public.marketplace_policies (
  game_session_id uuid primary key references public.game_sessions (id) on delete cascade,
  marketplace_enabled boolean not null default true,
  cross_country_trading_enabled boolean not null default true,
  moderation_required boolean not null default false,
  fee_rate numeric(8,6) not null default 0.025000,
  tax_rate numeric(8,6) not null default 0.000000,
  listing_duration_hours integer not null default 168,
  purchase_reservation_minutes integer not null default 5,
  dispute_window_days integer not null default 7,
  disputes_enabled boolean not null default true,
  country_fee_overrides jsonb not null default '{}'::jsonb,
  blocked_country_codes text[] not null default '{}'::text[],
  updated_by_staff_user_id uuid null references public.staff_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_policies_fee_rate_valid check (fee_rate between 0 and 0.250000),
  constraint marketplace_policies_tax_rate_valid check (tax_rate between 0 and 0.250000),
  constraint marketplace_policies_duration_valid check (listing_duration_hours between 1 and 720),
  constraint marketplace_policies_reservation_valid check (purchase_reservation_minutes between 1 and 60),
  constraint marketplace_policies_dispute_window_valid check (dispute_window_days between 1 and 30),
  constraint marketplace_policies_country_overrides_object check (jsonb_typeof(country_fee_overrides) = 'object'),
  constraint marketplace_policies_blocked_codes_valid check (
    array_position(blocked_country_codes, null) is null
  )
);

create trigger set_marketplace_policies_updated_at
before update on public.marketplace_policies
for each row execute function public.set_current_timestamp_updated_at();

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('lst_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  seller_player_id uuid not null,
  seller_country_code text not null,
  inventory_holding_id uuid not null,
  store_item_id uuid not null,
  item_key text not null,
  quantity_initial integer not null,
  quantity_available integer not null,
  unit_price numeric(18,4) not null,
  currency_code text not null,
  condition_label text not null default 'Used',
  status text not null default 'draft',
  version bigint not null default 1,
  seller_idempotency_key text not null,
  request_fingerprint text not null,
  expires_at timestamptz not null,
  moderation_reason text null,
  moderated_by_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  moderated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_listings_game_id_unique unique (game_session_id, id),
  constraint marketplace_listings_public_id_unique unique (public_id),
  constraint marketplace_listings_seller_scope_fk foreign key (game_session_id, seller_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_listings_holding_scope_fk foreign key (
    game_session_id, seller_player_id, inventory_holding_id, store_item_id
  ) references public.inventory_holdings (
    game_session_id, player_id, id, store_item_id
  ),
  constraint marketplace_listings_item_scope_fk foreign key (game_session_id, store_item_id, item_key)
    references public.store_items (game_session_id, id, item_key),
  constraint marketplace_listings_idempotency_unique unique (
    game_session_id, seller_player_id, seller_idempotency_key
  ),
  constraint marketplace_listings_public_id_valid check (public_id ~ '^lst_[0-9a-f]{32}$'),
  constraint marketplace_listings_country_valid check (seller_country_code ~ '^[A-Z][A-Z0-9_]{2,31}$'),
  constraint marketplace_listings_item_key_valid check (item_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint marketplace_listings_quantity_valid check (
    quantity_initial between 1 and 1000000
    and quantity_available between 0 and quantity_initial
  ),
  constraint marketplace_listings_price_valid check (unit_price > 0 and unit_price <= 1000000000000),
  constraint marketplace_listings_currency_valid check (currency_code ~ '^[A-Z0-9]{3,12}$'),
  constraint marketplace_listings_condition_valid check (
    condition_label in ('New', 'Like New', 'Used', 'Damaged')
  ),
  constraint marketplace_listings_status_valid check (
    status in ('draft', 'active', 'moderation_hold', 'sold_out', 'cancelled', 'expired', 'rejected')
  ),
  constraint marketplace_listings_version_valid check (version >= 1),
  constraint marketplace_listings_idempotency_valid check (
    length(seller_idempotency_key) between 8 and 160
    and seller_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint marketplace_listings_fingerprint_valid check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marketplace_listings_expiry_valid check (expires_at > created_at),
  constraint marketplace_listings_moderation_reason_valid check (
    moderation_reason is null or (length(moderation_reason) between 1 and 1000 and moderation_reason = btrim(moderation_reason))
  )
);

create trigger set_marketplace_listings_updated_at
before update on public.marketplace_listings
for each row execute function public.set_current_timestamp_updated_at();

create index marketplace_listings_game_status_created_idx
  on public.marketplace_listings (game_session_id, status, created_at desc, public_id desc);
create index marketplace_listings_game_item_status_idx
  on public.marketplace_listings (game_session_id, item_key, status, unit_price asc);
create index marketplace_listings_seller_status_idx
  on public.marketplace_listings (game_session_id, seller_player_id, status, created_at desc);
create index marketplace_listings_expiry_idx
  on public.marketplace_listings (expires_at)
  where status in ('draft', 'active', 'moderation_hold');

create table public.marketplace_purchase_reservations (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('mpr_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  listing_id uuid not null,
  buyer_player_id uuid not null,
  seller_player_id uuid not null,
  quantity integer not null,
  unit_price numeric(18,4) not null,
  subtotal numeric(18,4) not null,
  fee_rate numeric(8,6) not null,
  tax_rate numeric(8,6) not null,
  fee_amount numeric(18,4) not null,
  tax_amount numeric(18,4) not null,
  buyer_total numeric(18,4) not null,
  seller_proceeds numeric(18,4) not null,
  currency_code text not null,
  status text not null default 'reserved',
  version bigint not null default 1,
  buyer_idempotency_key text not null,
  request_fingerprint text not null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  settling_at timestamptz null,
  settled_at timestamptz null,
  released_at timestamptz null,
  release_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_reservations_game_id_unique unique (game_session_id, id),
  constraint marketplace_reservations_public_id_unique unique (public_id),
  constraint marketplace_reservations_listing_scope_fk foreign key (game_session_id, listing_id)
    references public.marketplace_listings (game_session_id, id),
  constraint marketplace_reservations_buyer_scope_fk foreign key (game_session_id, buyer_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_reservations_seller_scope_fk foreign key (game_session_id, seller_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_reservations_idempotency_unique unique (
    game_session_id, buyer_player_id, buyer_idempotency_key
  ),
  constraint marketplace_reservations_public_id_valid check (public_id ~ '^mpr_[0-9a-f]{32}$'),
  constraint marketplace_reservations_party_valid check (buyer_player_id <> seller_player_id),
  constraint marketplace_reservations_quantity_valid check (quantity between 1 and 1000000),
  constraint marketplace_reservations_amounts_valid check (
    unit_price > 0 and subtotal >= 0 and fee_rate between 0 and 0.25 and tax_rate between 0 and 0.25
    and fee_amount >= 0 and tax_amount >= 0
    and buyer_total = subtotal + fee_amount + tax_amount
    and seller_proceeds = subtotal
  ),
  constraint marketplace_reservations_currency_valid check (currency_code ~ '^[A-Z0-9]{3,12}$'),
  constraint marketplace_reservations_status_valid check (
    status in ('reserved', 'settling', 'settled', 'released', 'expired')
  ),
  constraint marketplace_reservations_version_valid check (version >= 1),
  constraint marketplace_reservations_idempotency_valid check (
    length(buyer_idempotency_key) between 8 and 160
    and buyer_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint marketplace_reservations_fingerprint_valid check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marketplace_reservations_expiry_valid check (expires_at > reserved_at),
  constraint marketplace_reservations_terminal_valid check (
    (status = 'reserved' and settling_at is null and settled_at is null and released_at is null)
    or (status = 'settling' and settling_at is not null and settled_at is null and released_at is null)
    or (status = 'settled' and settling_at is not null and settled_at is not null and released_at is null)
    or (status in ('released', 'expired') and settled_at is null and released_at is not null and release_reason is not null)
  )
);

create trigger set_marketplace_purchase_reservations_updated_at
before update on public.marketplace_purchase_reservations
for each row execute function public.set_current_timestamp_updated_at();

create index marketplace_reservations_listing_status_idx
  on public.marketplace_purchase_reservations (game_session_id, listing_id, status, expires_at);
create index marketplace_reservations_buyer_created_idx
  on public.marketplace_purchase_reservations (game_session_id, buyer_player_id, created_at desc);
create index marketplace_reservations_expiry_idx
  on public.marketplace_purchase_reservations (expires_at)
  where status in ('reserved', 'settling');

create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('ord_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  reservation_id uuid not null,
  listing_id uuid not null,
  buyer_player_id uuid not null,
  seller_player_id uuid not null,
  store_item_id uuid not null,
  item_key text not null,
  quantity integer not null,
  unit_price numeric(18,4) not null,
  subtotal numeric(18,4) not null,
  fee_amount numeric(18,4) not null,
  tax_amount numeric(18,4) not null,
  buyer_total numeric(18,4) not null,
  seller_proceeds numeric(18,4) not null,
  currency_code text not null,
  status text not null default 'settling',
  version bigint not null default 1,
  buyer_ledger_entry_id uuid null references public.ledger_entries (id) on delete restrict,
  seller_ledger_entry_id uuid null references public.ledger_entries (id) on delete restrict,
  completed_at timestamptz null,
  refunded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_orders_game_id_unique unique (game_session_id, id),
  constraint marketplace_orders_public_id_unique unique (public_id),
  constraint marketplace_orders_reservation_unique unique (reservation_id),
  constraint marketplace_orders_reservation_scope_fk foreign key (game_session_id, reservation_id)
    references public.marketplace_purchase_reservations (game_session_id, id),
  constraint marketplace_orders_listing_scope_fk foreign key (game_session_id, listing_id)
    references public.marketplace_listings (game_session_id, id),
  constraint marketplace_orders_buyer_scope_fk foreign key (game_session_id, buyer_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_orders_seller_scope_fk foreign key (game_session_id, seller_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_orders_item_scope_fk foreign key (game_session_id, store_item_id, item_key)
    references public.store_items (game_session_id, id, item_key),
  constraint marketplace_orders_public_id_valid check (public_id ~ '^ord_[0-9a-f]{32}$'),
  constraint marketplace_orders_party_valid check (buyer_player_id <> seller_player_id),
  constraint marketplace_orders_quantity_valid check (quantity between 1 and 1000000),
  constraint marketplace_orders_amounts_valid check (
    unit_price > 0 and subtotal >= 0 and fee_amount >= 0 and tax_amount >= 0
    and buyer_total = subtotal + fee_amount + tax_amount
    and seller_proceeds = subtotal
  ),
  constraint marketplace_orders_currency_valid check (currency_code ~ '^[A-Z0-9]{3,12}$'),
  constraint marketplace_orders_status_valid check (
    status in ('settling', 'completed', 'disputed', 'refunded')
  ),
  constraint marketplace_orders_version_valid check (version >= 1),
  constraint marketplace_orders_ledger_state_valid check (
    (status = 'settling' and buyer_ledger_entry_id is null and seller_ledger_entry_id is null and completed_at is null)
    or (status in ('completed', 'disputed', 'refunded') and buyer_ledger_entry_id is not null and seller_ledger_entry_id is not null and completed_at is not null)
  )
);

create trigger set_marketplace_orders_updated_at
before update on public.marketplace_orders
for each row execute function public.set_current_timestamp_updated_at();

create index marketplace_orders_buyer_created_idx
  on public.marketplace_orders (game_session_id, buyer_player_id, created_at desc);
create index marketplace_orders_seller_created_idx
  on public.marketplace_orders (game_session_id, seller_player_id, created_at desc);
create index marketplace_orders_listing_created_idx
  on public.marketplace_orders (game_session_id, listing_id, created_at desc);

create table public.marketplace_disputes (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('dsp_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  order_id uuid not null,
  opened_by_player_id uuid not null,
  reason text not null,
  status text not null default 'open',
  version bigint not null default 1,
  resolution_note text null,
  resolved_by_staff_user_id uuid null references public.staff_users (id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_disputes_game_id_unique unique (game_session_id, id),
  constraint marketplace_disputes_public_id_unique unique (public_id),
  constraint marketplace_disputes_order_scope_fk foreign key (game_session_id, order_id)
    references public.marketplace_orders (game_session_id, id),
  constraint marketplace_disputes_player_scope_fk foreign key (game_session_id, opened_by_player_id)
    references public.players (game_session_id, id),
  constraint marketplace_disputes_one_per_order unique (order_id),
  constraint marketplace_disputes_idempotency_unique unique (
    game_session_id, opened_by_player_id, idempotency_key
  ),
  constraint marketplace_disputes_public_id_valid check (public_id ~ '^dsp_[0-9a-f]{32}$'),
  constraint marketplace_disputes_reason_valid check (
    length(reason) between 10 and 1000 and reason = btrim(reason)
  ),
  constraint marketplace_disputes_status_valid check (
    status in ('open', 'resolved_buyer', 'resolved_seller', 'rejected')
  ),
  constraint marketplace_disputes_version_valid check (version >= 1),
  constraint marketplace_disputes_resolution_valid check (
    (status = 'open' and resolution_note is null and resolved_by_staff_user_id is null and resolved_at is null)
    or (status <> 'open' and resolution_note is not null and resolved_by_staff_user_id is not null and resolved_at is not null)
  ),
  constraint marketplace_disputes_idempotency_valid check (
    length(idempotency_key) between 8 and 160
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint marketplace_disputes_fingerprint_valid check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

create trigger set_marketplace_disputes_updated_at
before update on public.marketplace_disputes
for each row execute function public.set_current_timestamp_updated_at();

create index marketplace_disputes_game_status_opened_idx
  on public.marketplace_disputes (game_session_id, status, opened_at desc);

create table public.marketplace_treasury_balances (
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  currency_code text not null,
  fee_balance numeric(18,4) not null default 0,
  tax_balance numeric(18,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_session_id, currency_code),
  constraint marketplace_treasury_currency_valid check (currency_code ~ '^[A-Z0-9]{3,12}$'),
  constraint marketplace_treasury_nonnegative check (fee_balance >= 0 and tax_balance >= 0)
);

create table public.marketplace_financial_postings (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('mfp_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete restrict,
  order_id uuid not null,
  posting_group text not null,
  posting_type text not null,
  player_id uuid null,
  amount numeric(18,4) not null,
  currency_code text not null,
  created_at timestamptz not null default now(),
  constraint marketplace_postings_public_id_unique unique (public_id),
  constraint marketplace_postings_order_scope_fk foreign key (game_session_id, order_id)
    references public.marketplace_orders (game_session_id, id) on delete restrict,
  constraint marketplace_postings_player_scope_fk foreign key (game_session_id, player_id)
    references public.players (game_session_id, id) on delete restrict,
  constraint marketplace_postings_public_id_valid check (public_id ~ '^mfp_[0-9a-f]{32}$'),
  constraint marketplace_postings_group_valid check (posting_group in ('settlement', 'refund')),
  constraint marketplace_postings_type_valid check (
    posting_type in ('buyer_debit', 'seller_credit', 'fee_credit', 'tax_credit',
      'buyer_refund_credit', 'seller_refund_debit', 'fee_refund_debit', 'tax_refund_debit')
  ),
  constraint marketplace_postings_amount_nonzero check (amount <> 0),
  constraint marketplace_postings_currency_valid check (currency_code ~ '^[A-Z0-9]{3,12}$'),
  constraint marketplace_postings_unique unique (order_id, posting_group, posting_type)
);

create index marketplace_postings_game_order_idx
  on public.marketplace_financial_postings (game_session_id, order_id, created_at, id);

create table public.marketplace_action_receipts (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete restrict,
  actor_type text not null,
  actor_id uuid not null,
  action text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  target_public_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint marketplace_receipts_actor_type_valid check (actor_type in ('player', 'staff_user')),
  constraint marketplace_receipts_action_valid check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint marketplace_receipts_idempotency_valid check (
    length(idempotency_key) between 8 and 160
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  ),
  constraint marketplace_receipts_fingerprint_valid check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint marketplace_receipts_target_valid check (target_public_id ~ '^[a-z]{3}_[0-9a-f]{32}$'),
  constraint marketplace_receipts_result_object check (jsonb_typeof(result) = 'object'),
  constraint marketplace_receipts_unique unique (
    game_session_id, actor_type, actor_id, action, idempotency_key
  )
);

create table public.marketplace_audit_events (
  id uuid primary key default gen_random_uuid(),
  public_id text not null default ('mae_' || replace(gen_random_uuid()::text, '-', '')),
  game_session_id uuid not null references public.game_sessions (id) on delete restrict,
  listing_id uuid null,
  reservation_id uuid null,
  order_id uuid null,
  dispute_id uuid null,
  actor_type text not null,
  actor_id uuid null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketplace_audit_public_id_unique unique (public_id),
  constraint marketplace_audit_listing_scope_fk foreign key (game_session_id, listing_id)
    references public.marketplace_listings (game_session_id, id) on delete restrict,
  constraint marketplace_audit_reservation_scope_fk foreign key (game_session_id, reservation_id)
    references public.marketplace_purchase_reservations (game_session_id, id) on delete restrict,
  constraint marketplace_audit_order_scope_fk foreign key (game_session_id, order_id)
    references public.marketplace_orders (game_session_id, id) on delete restrict,
  constraint marketplace_audit_dispute_scope_fk foreign key (game_session_id, dispute_id)
    references public.marketplace_disputes (game_session_id, id) on delete restrict,
  constraint marketplace_audit_public_id_valid check (public_id ~ '^mae_[0-9a-f]{32}$'),
  constraint marketplace_audit_actor_type_valid check (actor_type in ('player', 'staff_user', 'system')),
  constraint marketplace_audit_action_valid check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint marketplace_audit_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint marketplace_audit_target_valid check (
    listing_id is not null or reservation_id is not null or order_id is not null or dispute_id is not null
  )
);

create index marketplace_audit_game_created_idx
  on public.marketplace_audit_events (game_session_id, created_at desc, id desc);

create or replace function public.reject_marketplace_immutable_mutation_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'MARKETPLACE_IMMUTABLE_RECORD' using errcode = 'P0001';
end;
$$;

create trigger marketplace_audit_immutable
before update or delete on public.marketplace_audit_events
for each row execute function public.reject_marketplace_immutable_mutation_v1();
create trigger marketplace_postings_immutable
before update or delete on public.marketplace_financial_postings
for each row execute function public.reject_marketplace_immutable_mutation_v1();
create trigger marketplace_receipts_immutable
before update or delete on public.marketplace_action_receipts
for each row execute function public.reject_marketplace_immutable_mutation_v1();

create or replace function public.marketplace_request_fingerprint_v1(p_value jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(digest(coalesce(p_value, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;

create or replace function public.marketplace_player_country_v1(
  p_game_session_id uuid,
  p_player_id uuid
)
returns table (country_code text, currency_code text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cp.country_code, cp.currency_code
  from public.player_country_assignments pca
  join public.country_profiles cp on cp.id = pca.country_profile_id
  where pca.game_session_id = p_game_session_id
    and pca.player_id = p_player_id
    and pca.status = 'active'
    and cp.status = 'active'
  order by pca.assigned_at desc
  limit 1;
$$;

create or replace function public.expire_marketplace_purchase_reservations_v1(
  p_game_session_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_count integer := 0;
begin
  for v_reservation in
    select * from public.marketplace_purchase_reservations
    where game_session_id = p_game_session_id
      and status in ('reserved', 'settling')
      and expires_at <= p_now
    for update skip locked
  loop
    select * into v_listing from public.marketplace_listings
    where id = v_reservation.listing_id for update;

    if found and v_listing.status = 'active' and v_listing.expires_at > p_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active', version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id;
    else
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where game_session_id = v_reservation.game_session_id
        and player_id = v_reservation.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_reservation.quantity;
      if not found then
        raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001';
      end if;
    end if;

    update public.marketplace_purchase_reservations
    set status = 'expired', version = version + 1,
        released_at = p_now, release_reason = 'reservation_expired',
        updated_at = statement_timestamp()
    where id = v_reservation.id;

    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, action, metadata
    ) values (
      v_reservation.game_session_id, v_reservation.listing_id, v_reservation.id,
      'system', 'purchase_reservation_expired',
      jsonb_build_object('quantity', v_reservation.quantity)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.expire_marketplace_listings_v1(
  p_game_session_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.marketplace_listings%rowtype;
  v_count integer := 0;
begin
  perform public.expire_marketplace_purchase_reservations_v1(p_game_session_id, p_now);
  for v_listing in
    select * from public.marketplace_listings
    where game_session_id = p_game_session_id
      and status in ('draft', 'active', 'moderation_hold')
      and expires_at <= p_now
    for update skip locked
  loop
    if v_listing.quantity_available > 0 then
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_listing.quantity_available,
          updated_at = statement_timestamp()
      where game_session_id = v_listing.game_session_id
        and player_id = v_listing.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_listing.quantity_available;
      if not found then
        raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001';
      end if;
    end if;

    update public.marketplace_listings
    set status = 'expired', quantity_available = 0,
        version = version + 1, updated_at = statement_timestamp()
    where id = v_listing.id;

    insert into public.marketplace_audit_events (
      game_session_id, listing_id, actor_type, action, metadata
    ) values (
      v_listing.game_session_id, v_listing.id, 'system', 'listing_expired',
      jsonb_build_object('releasedQuantity', v_listing.quantity_available)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.create_marketplace_listing_public_v2(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_unit_price numeric,
  p_currency_code text,
  p_condition_label text,
  p_duration_hours integer,
  p_idempotency_key text
)
returns table (
  outcome text, listing_key text, item_key text, quantity_available integer,
  unit_price numeric, currency_code text, status text, version bigint,
  expires_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_currency text := upper(btrim(coalesce(p_currency_code, '')));
  v_condition text := btrim(coalesce(p_condition_label, 'Used'));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_duration integer;
  v_fingerprint text;
  v_country record;
  v_item public.store_items%rowtype;
  v_holding public.inventory_holdings%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_policy public.marketplace_policies%rowtype;
begin
  if p_game_session_id is null or p_seller_player_id is null
    or v_item_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_unit_price is null or p_unit_price <= 0 or p_unit_price > 1000000000000
    or v_currency !~ '^[A-Z0-9]{3,12}$'
    or v_condition not in ('New', 'Like New', 'Used', 'Damaged')
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_LISTING_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_seller_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  insert into public.marketplace_policies (game_session_id)
  values (p_game_session_id) on conflict do nothing;
  select * into v_policy from public.marketplace_policies
  where game_session_id = p_game_session_id for share;
  if not v_policy.marketplace_enabled then
    raise exception 'MARKETPLACE_DISABLED' using errcode = 'P0001';
  end if;

  select * into v_country from public.marketplace_player_country_v1(
    p_game_session_id, p_seller_player_id
  );
  if not found or v_country.country_code = any(v_policy.blocked_country_codes) then
    raise exception 'MARKETPLACE_COUNTRY_BLOCKED' using errcode = 'P0001';
  end if;
  if v_currency <> v_country.currency_code then
    raise exception 'MARKETPLACE_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  v_duration := coalesce(p_duration_hours, v_policy.listing_duration_hours);
  if v_duration not between 1 and 720 then
    raise exception 'MARKETPLACE_LISTING_DURATION_INVALID' using errcode = 'P0001';
  end if;
  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'itemKey', v_item_key, 'quantity', p_quantity, 'unitPrice', p_unit_price,
    'currencyCode', v_currency, 'condition', v_condition, 'durationHours', v_duration
  ));

  select * into v_listing from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and seller_idempotency_key = v_key
  for update;
  if found then
    if v_listing.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_listing.public_id, v_listing.item_key,
      v_listing.quantity_available, v_listing.unit_price, v_listing.currency_code,
      v_listing.status, v_listing.version, v_listing.expires_at, v_listing.created_at;
    return;
  end if;

  perform 1 from public.account_balances
  where game_session_id = p_game_session_id and player_id = p_seller_player_id
    and account_type = 'cash' and currency_code = v_currency;
  if not found then raise exception 'MARKETPLACE_CURRENCY_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;

  select * into v_item from public.store_items
  where game_session_id = p_game_session_id and item_key = v_item_key
  for share;
  if not found then raise exception 'MARKETPLACE_ITEM_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_holding from public.inventory_holdings
  where game_session_id = p_game_session_id and player_id = p_seller_player_id
    and store_item_id = v_item.id
  for update;
  if not found or v_holding.quantity_owned - v_holding.quantity_reserved < p_quantity then
    raise exception 'MARKETPLACE_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.inventory_holdings
  set quantity_reserved = quantity_reserved + p_quantity,
      updated_at = statement_timestamp()
  where id = v_holding.id;

  insert into public.marketplace_listings (
    game_session_id, seller_player_id, seller_country_code,
    inventory_holding_id, store_item_id, item_key,
    quantity_initial, quantity_available, unit_price, currency_code,
    condition_label, seller_idempotency_key, request_fingerprint, expires_at
  ) values (
    p_game_session_id, p_seller_player_id, v_country.country_code,
    v_holding.id, v_item.id, v_item.item_key,
    p_quantity, p_quantity, p_unit_price, v_currency,
    v_condition, v_key, v_fingerprint, v_now + make_interval(hours => v_duration)
  ) returning * into v_listing;

  insert into public.marketplace_audit_events (
    game_session_id, listing_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, 'player', p_seller_player_id, 'listing_drafted',
    jsonb_build_object('quantity', p_quantity, 'unitPrice', p_unit_price,
      'currencyCode', v_currency, 'countryCode', v_country.country_code)
  );

  return query select 'applied', v_listing.public_id, v_listing.item_key,
    v_listing.quantity_available, v_listing.unit_price, v_listing.currency_code,
    v_listing.status, v_listing.version, v_listing.expires_at, v_listing.created_at;
end;
$$;

create or replace function public.activate_marketplace_listing_public_v1(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_key text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (outcome text, listing_key text, status text, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_listing public.marketplace_listings%rowtype;
  v_policy public.marketplace_policies%rowtype;
  v_receipt public.marketplace_action_receipts%rowtype;
  v_fingerprint text;
  v_status text;
begin
  if p_game_session_id is null or p_seller_player_id is null
    or lower(btrim(coalesce(p_listing_key, ''))) !~ '^lst_[0-9a-f]{32}$'
    or p_expected_version is null or p_expected_version < 1
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_ACTIVATION_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_seller_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'listingKey', lower(btrim(p_listing_key)), 'expectedVersion', p_expected_version
  ));
  select * into v_receipt from public.marketplace_action_receipts
  where game_session_id = p_game_session_id and actor_type = 'player'
    and actor_id = p_seller_player_id and action = 'listing_activate'
    and idempotency_key = v_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_receipt.target_public_id,
      v_receipt.result->>'status', (v_receipt.result->>'version')::bigint,
      (v_receipt.result->>'updatedAt')::timestamptz;
    return;
  end if;

  select * into v_listing from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and public_id = lower(btrim(p_listing_key)) for update;
  if not found then raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_listing.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_listing.status <> 'draft' then
    raise exception 'MARKETPLACE_LISTING_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  if v_listing.expires_at <= now() then
    perform public.expire_marketplace_listings_v1(p_game_session_id, now());
    return query select 'expired', v_listing.public_id, 'expired', v_listing.version + 1, now();
    return;
  end if;

  select * into v_policy from public.marketplace_policies
  where game_session_id = p_game_session_id for share;
  if not found or not v_policy.marketplace_enabled then
    raise exception 'MARKETPLACE_DISABLED' using errcode = 'P0001';
  end if;
  v_status := case when v_policy.moderation_required then 'moderation_hold' else 'active' end;

  update public.marketplace_listings
  set status = v_status, version = version + 1,
      updated_at = statement_timestamp()
  where id = v_listing.id returning * into v_listing;

  insert into public.marketplace_action_receipts (
    game_session_id, actor_type, actor_id, action, idempotency_key,
    request_fingerprint, target_public_id, result
  ) values (
    p_game_session_id, 'player', p_seller_player_id, 'listing_activate', v_key,
    v_fingerprint, v_listing.public_id,
    jsonb_build_object('status', v_listing.status, 'version', v_listing.version,
      'updatedAt', v_listing.updated_at)
  );
  insert into public.marketplace_audit_events (
    game_session_id, listing_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, 'player', p_seller_player_id,
    case when v_status = 'active' then 'listing_activated' else 'listing_submitted_for_moderation' end,
    jsonb_build_object('version', v_listing.version)
  );
  return query select 'applied', v_listing.public_id, v_listing.status,
    v_listing.version, v_listing.updated_at;
end;
$$;

create or replace function public.reserve_marketplace_purchase_public_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_listing_key text,
  p_quantity integer,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (
  outcome text, reservation_key text, listing_key text, quantity integer,
  buyer_total numeric, currency_code text, status text, version bigint, expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_listing_key text := lower(btrim(coalesce(p_listing_key, '')));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_listing public.marketplace_listings%rowtype;
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_policy public.marketplace_policies%rowtype;
  v_buyer_country record;
  v_fee_rate numeric;
  v_tax_rate numeric;
  v_subtotal numeric;
  v_fee numeric;
  v_tax numeric;
  v_total numeric;
  v_fingerprint text;
  v_override jsonb;
begin
  if p_game_session_id is null or p_buyer_player_id is null
    or v_listing_key !~ '^lst_[0-9a-f]{32}$'
    or p_quantity is null or p_quantity not between 1 and 1000000
    or p_expected_version is null or p_expected_version < 1
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_PURCHASE_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_buyer_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'listingKey', v_listing_key, 'quantity', p_quantity,
    'expectedVersion', p_expected_version
  ));
  select * into v_reservation from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id and buyer_player_id = p_buyer_player_id
    and buyer_idempotency_key = v_key for update;
  if found then
    if v_reservation.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_reservation.public_id, v_listing_key,
      v_reservation.quantity, v_reservation.buyer_total, v_reservation.currency_code,
      v_reservation.status, v_reservation.version, v_reservation.expires_at;
    return;
  end if;

  select * into v_listing from public.marketplace_listings
  where game_session_id = p_game_session_id and public_id = v_listing_key for update;
  if not found then raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_listing.seller_player_id = p_buyer_player_id then
    raise exception 'MARKETPLACE_SELF_PURCHASE' using errcode = 'P0001';
  end if;
  if v_listing.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_listing.status = 'active' and v_listing.expires_at <= v_now then
    perform public.expire_marketplace_listings_v1(p_game_session_id, v_now);
    return query select 'expired', null::text, v_listing.public_id, p_quantity,
      null::numeric, v_listing.currency_code, 'expired', v_listing.version + 1,
      v_listing.expires_at;
    return;
  end if;
  if v_listing.status <> 'active' then
    raise exception 'MARKETPLACE_LISTING_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_listing.quantity_available < p_quantity then
    raise exception 'MARKETPLACE_QUANTITY_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_policy from public.marketplace_policies
  where game_session_id = p_game_session_id for share;
  if not found or not v_policy.marketplace_enabled then
    raise exception 'MARKETPLACE_DISABLED' using errcode = 'P0001';
  end if;
  select * into v_buyer_country from public.marketplace_player_country_v1(
    p_game_session_id, p_buyer_player_id
  );
  if not found or v_buyer_country.country_code = any(v_policy.blocked_country_codes) then
    raise exception 'MARKETPLACE_COUNTRY_BLOCKED' using errcode = 'P0001';
  end if;
  if not v_policy.cross_country_trading_enabled
    and v_buyer_country.country_code <> v_listing.seller_country_code
  then raise exception 'MARKETPLACE_CROSS_COUNTRY_BLOCKED' using errcode = 'P0001'; end if;
  if v_buyer_country.currency_code <> v_listing.currency_code then
    raise exception 'MARKETPLACE_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  v_override := v_policy.country_fee_overrides -> v_buyer_country.country_code;
  v_fee_rate := case
    when jsonb_typeof(v_override->'feeRate') = 'number'
      then least(0.25, greatest(0, (v_override->>'feeRate')::numeric))
    else v_policy.fee_rate end;
  v_tax_rate := case
    when jsonb_typeof(v_override->'taxRate') = 'number'
      then least(0.25, greatest(0, (v_override->>'taxRate')::numeric))
    else v_policy.tax_rate end;
  v_subtotal := round(v_listing.unit_price * p_quantity, 4);
  v_fee := round(v_subtotal * v_fee_rate, 4);
  v_tax := round(v_subtotal * v_tax_rate, 4);
  v_total := v_subtotal + v_fee + v_tax;

  update public.marketplace_listings
  set quantity_available = quantity_available - p_quantity,
      status = case when quantity_available - p_quantity = 0 then 'sold_out' else status end,
      version = version + 1, updated_at = statement_timestamp()
  where id = v_listing.id returning * into v_listing;

  insert into public.marketplace_purchase_reservations (
    game_session_id, listing_id, buyer_player_id, seller_player_id,
    quantity, unit_price, subtotal, fee_rate, tax_rate, fee_amount, tax_amount,
    buyer_total, seller_proceeds, currency_code, buyer_idempotency_key,
    request_fingerprint, expires_at
  ) values (
    p_game_session_id, v_listing.id, p_buyer_player_id, v_listing.seller_player_id,
    p_quantity, v_listing.unit_price, v_subtotal, v_fee_rate, v_tax_rate, v_fee, v_tax,
    v_total, v_subtotal, v_listing.currency_code, v_key, v_fingerprint,
    v_now + make_interval(mins => v_policy.purchase_reservation_minutes)
  ) returning * into v_reservation;

  insert into public.marketplace_audit_events (
    game_session_id, listing_id, reservation_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, v_reservation.id, 'player', p_buyer_player_id,
    'purchase_reserved', jsonb_build_object('quantity', p_quantity,
      'buyerTotal', v_total, 'listingVersion', v_listing.version)
  );

  return query select 'applied', v_reservation.public_id, v_listing.public_id,
    v_reservation.quantity, v_reservation.buyer_total, v_reservation.currency_code,
    v_reservation.status, v_reservation.version, v_reservation.expires_at;
end;
$$;

create or replace function public.settle_marketplace_purchase_public_v1(
  p_game_session_id uuid,
  p_buyer_player_id uuid,
  p_reservation_key text
)
returns table (
  outcome text, order_key text, reservation_key text, listing_key text,
  item_key text, quantity integer, buyer_total numeric, seller_proceeds numeric,
  fee_amount numeric, tax_amount numeric, currency_code text, status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_reservation_key text := lower(btrim(coalesce(p_reservation_key, '')));
  v_reservation public.marketplace_purchase_reservations%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer_balance public.account_balances%rowtype;
  v_seller_holding public.inventory_holdings%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_buyer_ledger record;
  v_seller_ledger record;
begin
  if p_game_session_id is null or p_buyer_player_id is null
    or v_reservation_key !~ '^mpr_[0-9a-f]{32}$'
  then raise exception 'MARKETPLACE_SETTLEMENT_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_buyer_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  select * into v_reservation from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id and buyer_player_id = p_buyer_player_id
    and public_id = v_reservation_key for update;
  if not found then raise exception 'MARKETPLACE_RESERVATION_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_order from public.marketplace_orders
  where game_session_id = p_game_session_id and reservation_id = v_reservation.id for update;
  if found and v_order.status in ('completed', 'disputed', 'refunded') then
    return query select 'replayed', v_order.public_id, v_reservation.public_id,
      (select public_id from public.marketplace_listings where id = v_order.listing_id),
      v_order.item_key, v_order.quantity, v_order.buyer_total, v_order.seller_proceeds,
      v_order.fee_amount, v_order.tax_amount, v_order.currency_code,
      v_order.status, v_order.completed_at;
    return;
  end if;

  select * into v_listing from public.marketplace_listings
  where id = v_reservation.listing_id for update;

  if v_reservation.status in ('released', 'expired') then
    return query select 'released', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  if v_reservation.expires_at <= v_now then
    if v_listing.status = 'active' and v_listing.expires_at > v_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active', version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    else
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where game_session_id = p_game_session_id
        and player_id = v_reservation.seller_player_id
        and id = v_listing.inventory_holding_id
        and quantity_reserved >= v_reservation.quantity;
      if not found then raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001'; end if;
    end if;
    update public.marketplace_purchase_reservations
    set status = 'expired', version = version + 1,
        released_at = v_now, release_reason = 'reservation_expired'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'system',
      'purchase_reservation_expired', jsonb_build_object('quantity', v_reservation.quantity)
    );
    return query select 'released', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  select * into v_seller_holding from public.inventory_holdings
  where game_session_id = p_game_session_id
    and player_id = v_reservation.seller_player_id
    and id = v_listing.inventory_holding_id
    and store_item_id = v_listing.store_item_id for update;
  if not found or v_seller_holding.quantity_owned < v_reservation.quantity
    or v_seller_holding.quantity_reserved < v_reservation.quantity
  then
    update public.marketplace_listings
    set status = 'moderation_hold', quantity_available = 0,
        version = version + 1, moderation_reason = 'Inventory reservation lost during settlement',
        updated_at = statement_timestamp()
    where id = v_listing.id returning * into v_listing;
    update public.marketplace_purchase_reservations
    set status = 'released', version = version + 1,
        released_at = v_now, release_reason = 'reservation_lost'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'system',
      'purchase_reservation_lost', jsonb_build_object('quantity', v_reservation.quantity)
    );
    return query select 'reservation_lost', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  select * into v_buyer_balance from public.account_balances
  where game_session_id = p_game_session_id and player_id = p_buyer_player_id
    and account_type = 'cash' and currency_code = v_reservation.currency_code
  for update;
  if not found or v_buyer_balance.balance < v_reservation.buyer_total then
    if v_listing.status = 'active' and v_listing.expires_at > v_now then
      update public.marketplace_listings
      set quantity_available = quantity_available + v_reservation.quantity,
          status = 'active', version = version + 1,
          updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    else
      update public.inventory_holdings
      set quantity_reserved = quantity_reserved - v_reservation.quantity,
          updated_at = statement_timestamp()
      where id = v_seller_holding.id and quantity_reserved >= v_reservation.quantity;
    end if;
    update public.marketplace_purchase_reservations
    set status = 'released', version = version + 1,
        released_at = v_now, release_reason = 'insufficient_funds'
    where id = v_reservation.id returning * into v_reservation;
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, reservation_id, actor_type, actor_id, action, metadata
    ) values (
      p_game_session_id, v_listing.id, v_reservation.id, 'player', p_buyer_player_id,
      'purchase_reservation_released', jsonb_build_object('reason', 'insufficient_funds')
    );
    return query select 'insufficient_funds', null::text, v_reservation.public_id,
      v_listing.public_id, v_listing.item_key, v_reservation.quantity,
      v_reservation.buyer_total, v_reservation.seller_proceeds,
      v_reservation.fee_amount, v_reservation.tax_amount,
      v_reservation.currency_code, v_reservation.status, null::timestamptz;
    return;
  end if;

  update public.marketplace_purchase_reservations
  set status = 'settling', version = version + 1, settling_at = v_now
  where id = v_reservation.id returning * into v_reservation;

  insert into public.marketplace_orders (
    game_session_id, reservation_id, listing_id, buyer_player_id, seller_player_id,
    store_item_id, item_key, quantity, unit_price, subtotal, fee_amount, tax_amount,
    buyer_total, seller_proceeds, currency_code
  ) values (
    p_game_session_id, v_reservation.id, v_listing.id, p_buyer_player_id,
    v_reservation.seller_player_id, v_listing.store_item_id, v_listing.item_key,
    v_reservation.quantity, v_reservation.unit_price, v_reservation.subtotal,
    v_reservation.fee_amount, v_reservation.tax_amount, v_reservation.buyer_total,
    v_reservation.seller_proceeds, v_reservation.currency_code
  ) returning * into v_order;

  select * into v_buyer_ledger from public.record_player_ledger_entry(
    p_game_session_id, p_buyer_player_id, 'cash', -v_reservation.buyer_total,
    v_reservation.currency_code, 'debit', 'marketplace', 'marketplace_purchase',
    v_order.id, 'player', p_buyer_player_id,
    jsonb_build_object('listingKey', v_listing.public_id, 'orderKey', v_order.public_id,
      'reservationKey', v_reservation.public_id)
  );
  select * into v_seller_ledger from public.record_player_ledger_entry(
    p_game_session_id, v_reservation.seller_player_id, 'cash', v_reservation.seller_proceeds,
    v_reservation.currency_code, 'credit', 'marketplace', 'marketplace_sale',
    v_order.id, 'player', p_buyer_player_id,
    jsonb_build_object('listingKey', v_listing.public_id, 'orderKey', v_order.public_id,
      'reservationKey', v_reservation.public_id)
  );

  insert into public.marketplace_treasury_balances (
    game_session_id, currency_code, fee_balance, tax_balance
  ) values (
    p_game_session_id, v_reservation.currency_code,
    v_reservation.fee_amount, v_reservation.tax_amount
  ) on conflict (game_session_id, currency_code) do update set
    fee_balance = public.marketplace_treasury_balances.fee_balance + excluded.fee_balance,
    tax_balance = public.marketplace_treasury_balances.tax_balance + excluded.tax_balance,
    updated_at = statement_timestamp();

  insert into public.marketplace_financial_postings (
    game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
  ) values
    (p_game_session_id, v_order.id, 'settlement', 'buyer_debit', p_buyer_player_id,
      -v_reservation.buyer_total, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'seller_credit', v_reservation.seller_player_id,
      v_reservation.seller_proceeds, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'fee_credit', null,
      v_reservation.fee_amount, v_reservation.currency_code),
    (p_game_session_id, v_order.id, 'settlement', 'tax_credit', null,
      v_reservation.tax_amount, v_reservation.currency_code);

  if (
    select round(sum(amount), 4) from public.marketplace_financial_postings
    where order_id = v_order.id and posting_group = 'settlement'
  ) <> 0 then
    raise exception 'MARKETPLACE_POSTING_IMBALANCE' using errcode = 'P0001';
  end if;

  update public.inventory_holdings
  set quantity_owned = quantity_owned - v_reservation.quantity,
      quantity_reserved = quantity_reserved - v_reservation.quantity,
      updated_at = statement_timestamp()
  where id = v_seller_holding.id;

  insert into public.inventory_holdings (
    game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
  ) values (
    p_game_session_id, p_buyer_player_id, v_listing.store_item_id,
    v_reservation.quantity, 0
  ) on conflict on constraint inventory_holdings_scope_unique do update
    set quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned,
        updated_at = statement_timestamp()
  returning * into v_buyer_holding;

  insert into public.inventory_events (
    game_session_id, player_id, store_item_id, quantity_delta, event_type,
    source_domain, source_action, source_id, metadata
  ) values
    (p_game_session_id, v_reservation.seller_player_id, v_listing.store_item_id,
      -v_reservation.quantity, 'MARKETPLACE_SOLD', 'marketplace', 'marketplace_sale',
      v_order.id, jsonb_build_object('listingKey', v_listing.public_id,
        'orderKey', v_order.public_id, 'reservationKey', v_reservation.public_id)),
    (p_game_session_id, p_buyer_player_id, v_listing.store_item_id,
      v_reservation.quantity, 'MARKETPLACE_PURCHASED', 'marketplace', 'marketplace_purchase',
      v_order.id, jsonb_build_object('listingKey', v_listing.public_id,
        'orderKey', v_order.public_id, 'reservationKey', v_reservation.public_id));

  update public.marketplace_orders
  set status = 'completed', version = version + 1,
      buyer_ledger_entry_id = v_buyer_ledger.ledger_entry_id,
      seller_ledger_entry_id = v_seller_ledger.ledger_entry_id,
      completed_at = v_now, updated_at = statement_timestamp()
  where id = v_order.id returning * into v_order;
  update public.marketplace_purchase_reservations
  set status = 'settled', version = version + 1, settled_at = v_now,
      updated_at = statement_timestamp()
  where id = v_reservation.id returning * into v_reservation;

  insert into public.marketplace_audit_events (
    game_session_id, listing_id, reservation_id, order_id,
    actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, v_reservation.id, v_order.id,
    'player', p_buyer_player_id, 'order_settled',
    jsonb_build_object('quantity', v_order.quantity, 'buyerTotal', v_order.buyer_total,
      'sellerProceeds', v_order.seller_proceeds, 'feeAmount', v_order.fee_amount,
      'taxAmount', v_order.tax_amount)
  );

  return query select 'applied', v_order.public_id, v_reservation.public_id,
    v_listing.public_id, v_order.item_key, v_order.quantity, v_order.buyer_total,
    v_order.seller_proceeds, v_order.fee_amount, v_order.tax_amount,
    v_order.currency_code, v_order.status, v_order.completed_at;
end;
$$;

create or replace function public.cancel_marketplace_listing_public_v2(
  p_game_session_id uuid,
  p_seller_player_id uuid,
  p_listing_key text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (outcome text, listing_key text, status text, version bigint, released_quantity integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_listing public.marketplace_listings%rowtype;
  v_receipt public.marketplace_action_receipts%rowtype;
  v_release integer;
  v_fingerprint text;
begin
  if p_game_session_id is null or p_seller_player_id is null
    or lower(btrim(coalesce(p_listing_key, ''))) !~ '^lst_[0-9a-f]{32}$'
    or p_expected_version is null or p_expected_version < 1
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_CANCELLATION_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_seller_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'listingKey', lower(btrim(p_listing_key)), 'expectedVersion', p_expected_version
  ));
  select * into v_receipt from public.marketplace_action_receipts
  where game_session_id = p_game_session_id and actor_type = 'player'
    and actor_id = p_seller_player_id and action = 'listing_cancel'
    and idempotency_key = v_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_receipt.target_public_id,
      v_receipt.result->>'status', (v_receipt.result->>'version')::bigint,
      (v_receipt.result->>'releasedQuantity')::integer,
      (v_receipt.result->>'updatedAt')::timestamptz;
    return;
  end if;

  select * into v_listing from public.marketplace_listings
  where game_session_id = p_game_session_id
    and seller_player_id = p_seller_player_id
    and public_id = lower(btrim(p_listing_key)) for update;
  if not found then raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_listing.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_listing.status = 'cancelled' then
    return query select 'replayed', v_listing.public_id, v_listing.status,
      v_listing.version, 0, v_listing.updated_at;
    return;
  end if;
  if v_listing.status not in ('draft', 'active', 'moderation_hold') then
    raise exception 'MARKETPLACE_LISTING_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  perform 1 from public.marketplace_purchase_reservations
  where game_session_id = p_game_session_id and listing_id = v_listing.id
    and status in ('reserved', 'settling') limit 1;
  if found then raise exception 'MARKETPLACE_PURCHASE_RESERVATION_ACTIVE' using errcode = 'P0001'; end if;

  v_release := v_listing.quantity_available;
  if v_release > 0 then
    update public.inventory_holdings
    set quantity_reserved = quantity_reserved - v_release,
        updated_at = statement_timestamp()
    where id = v_listing.inventory_holding_id and quantity_reserved >= v_release;
    if not found then raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001'; end if;
  end if;
  update public.marketplace_listings
  set status = 'cancelled', quantity_available = 0,
      version = version + 1, updated_at = statement_timestamp()
  where id = v_listing.id returning * into v_listing;

  insert into public.marketplace_action_receipts (
    game_session_id, actor_type, actor_id, action, idempotency_key,
    request_fingerprint, target_public_id, result
  ) values (
    p_game_session_id, 'player', p_seller_player_id, 'listing_cancel', v_key,
    v_fingerprint, v_listing.public_id,
    jsonb_build_object('status', v_listing.status, 'version', v_listing.version,
      'releasedQuantity', v_release, 'updatedAt', v_listing.updated_at)
  );
  insert into public.marketplace_audit_events (
    game_session_id, listing_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_listing.id, 'player', p_seller_player_id,
    'listing_cancelled', jsonb_build_object('releasedQuantity', v_release)
  );
  return query select 'applied', v_listing.public_id, v_listing.status,
    v_listing.version, v_release, v_listing.updated_at;
end;
$$;

create or replace function public.open_marketplace_dispute_public_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_order_key text,
  p_reason text,
  p_idempotency_key text
)
returns table (outcome text, dispute_key text, order_key text, status text, version bigint, opened_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_order public.marketplace_orders%rowtype;
  v_dispute public.marketplace_disputes%rowtype;
  v_policy public.marketplace_policies%rowtype;
  v_fingerprint text;
begin
  if p_game_session_id is null or p_player_id is null
    or lower(btrim(coalesce(p_order_key, ''))) !~ '^ord_[0-9a-f]{32}$'
    or length(v_reason) not between 10 and 1000
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
  then raise exception 'MARKETPLACE_DISPUTE_INVALID' using errcode = 'P0001'; end if;

  perform 1 from public.players p join public.game_sessions g on g.id = p.game_session_id
  where p.game_session_id = p_game_session_id and p.id = p_player_id
    and p.status = 'active' and g.status = 'active';
  if not found then raise exception 'MARKETPLACE_PLAYER_SCOPE_INACTIVE' using errcode = 'P0001'; end if;

  select * into v_policy from public.marketplace_policies
  where game_session_id = p_game_session_id for share;
  if found and not v_policy.disputes_enabled then
    raise exception 'MARKETPLACE_DISPUTES_DISABLED' using errcode = 'P0001';
  end if;
  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'orderKey', lower(btrim(p_order_key)), 'reason', v_reason
  ));

  select * into v_dispute from public.marketplace_disputes
  where game_session_id = p_game_session_id and opened_by_player_id = p_player_id
    and idempotency_key = v_key for update;
  if found then
    if v_dispute.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_dispute.public_id,
      (select public_id from public.marketplace_orders where id = v_dispute.order_id),
      v_dispute.status, v_dispute.version, v_dispute.opened_at;
    return;
  end if;

  select * into v_order from public.marketplace_orders
  where game_session_id = p_game_session_id and public_id = lower(btrim(p_order_key)) for update;
  if not found then raise exception 'MARKETPLACE_ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_player_id not in (v_order.buyer_player_id, v_order.seller_player_id) then
    raise exception 'MARKETPLACE_ORDER_NOT_OWNED' using errcode = 'P0001';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'MARKETPLACE_ORDER_NOT_DISPUTABLE' using errcode = 'P0001';
  end if;
  if v_order.completed_at < now() - make_interval(days => coalesce(v_policy.dispute_window_days, 7)) then
    raise exception 'MARKETPLACE_DISPUTE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.marketplace_disputes (
    game_session_id, order_id, opened_by_player_id, reason,
    idempotency_key, request_fingerprint
  ) values (
    p_game_session_id, v_order.id, p_player_id, v_reason, v_key, v_fingerprint
  ) returning * into v_dispute;
  update public.marketplace_orders
  set status = 'disputed', version = version + 1,
      updated_at = statement_timestamp()
  where id = v_order.id;
  insert into public.marketplace_audit_events (
    game_session_id, order_id, dispute_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_order.id, v_dispute.id, 'player', p_player_id,
    'dispute_opened', jsonb_build_object('reason', v_reason)
  );
  return query select 'applied', v_dispute.public_id, v_order.public_id,
    v_dispute.status, v_dispute.version, v_dispute.opened_at;
end;
$$;

create or replace function public.review_marketplace_admin_v2(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_target_key text,
  p_action text,
  p_reason text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns table (outcome text, target_key text, target_type text, status text, version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_receipt public.marketplace_action_receipts%rowtype;
  v_listing public.marketplace_listings%rowtype;
  v_dispute public.marketplace_disputes%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_buyer_holding public.inventory_holdings%rowtype;
  v_seller_balance public.account_balances%rowtype;
  v_ledger record;
  v_release integer;
begin
  if p_game_session_id is null or p_staff_user_id is null
    or p_expected_version is null or p_expected_version < 1
    or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'
    or length(v_reason) not between 1 and 1000
  then raise exception 'MARKETPLACE_ADMIN_REVIEW_INVALID' using errcode = 'P0001'; end if;
  perform 1 from public.staff_users where id = p_staff_user_id;
  if not found then raise exception 'MARKETPLACE_STAFF_NOT_FOUND' using errcode = 'P0001'; end if;

  v_fingerprint := public.marketplace_request_fingerprint_v1(jsonb_build_object(
    'targetKey', lower(btrim(p_target_key)), 'action', v_action,
    'reason', v_reason, 'expectedVersion', p_expected_version
  ));
  select * into v_receipt from public.marketplace_action_receipts
  where game_session_id = p_game_session_id and actor_type = 'staff_user'
    and actor_id = p_staff_user_id and action = 'admin_' || v_action
    and idempotency_key = v_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'MARKETPLACE_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return query select 'replayed', v_receipt.target_public_id,
      v_receipt.result->>'targetType', v_receipt.result->>'status',
      (v_receipt.result->>'version')::bigint,
      (v_receipt.result->>'updatedAt')::timestamptz;
    return;
  end if;

  if lower(btrim(p_target_key)) ~ '^lst_[0-9a-f]{32}$' then
    if v_action not in ('hold', 'approve', 'reject') then
      raise exception 'MARKETPLACE_ADMIN_ACTION_INVALID' using errcode = 'P0001';
    end if;
    select * into v_listing from public.marketplace_listings
    where game_session_id = p_game_session_id
      and public_id = lower(btrim(p_target_key)) for update;
    if not found then raise exception 'MARKETPLACE_LISTING_NOT_FOUND' using errcode = 'P0001'; end if;
    if v_listing.version <> p_expected_version then
      raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
    end if;
    if v_listing.expires_at <= now() and v_listing.status in ('draft', 'active', 'moderation_hold') then
      perform public.expire_marketplace_listings_v1(p_game_session_id, now());
      return query select 'expired', v_listing.public_id, 'listing', 'expired',
        v_listing.version + 1, now();
      return;
    end if;

    if v_action = 'hold' then
      if v_listing.status = 'moderation_hold' then
        return query select 'replayed', v_listing.public_id, 'listing',
          v_listing.status, v_listing.version, v_listing.updated_at;
        return;
      end if;
      if v_listing.status not in ('draft', 'active') then
        raise exception 'MARKETPLACE_LISTING_TRANSITION_INVALID' using errcode = 'P0001';
      end if;
      update public.marketplace_listings
      set status = 'moderation_hold', version = version + 1,
          moderation_reason = v_reason, moderated_by_staff_user_id = p_staff_user_id,
          moderated_at = now(), updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    elsif v_action = 'approve' then
      if v_listing.status = 'active' then
        return query select 'replayed', v_listing.public_id, 'listing',
          v_listing.status, v_listing.version, v_listing.updated_at;
        return;
      end if;
      if v_listing.status not in ('draft', 'moderation_hold') then
        raise exception 'MARKETPLACE_LISTING_TRANSITION_INVALID' using errcode = 'P0001';
      end if;
      update public.marketplace_listings
      set status = 'active', version = version + 1,
          moderation_reason = v_reason, moderated_by_staff_user_id = p_staff_user_id,
          moderated_at = now(), updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    else
      if v_listing.status = 'rejected' then
        return query select 'replayed', v_listing.public_id, 'listing',
          v_listing.status, v_listing.version, v_listing.updated_at;
        return;
      end if;
      if v_listing.status not in ('draft', 'active', 'moderation_hold') then
        raise exception 'MARKETPLACE_LISTING_TRANSITION_INVALID' using errcode = 'P0001';
      end if;
      perform 1 from public.marketplace_purchase_reservations
      where game_session_id = p_game_session_id and listing_id = v_listing.id
        and status in ('reserved', 'settling') limit 1;
      if found then raise exception 'MARKETPLACE_PURCHASE_RESERVATION_ACTIVE' using errcode = 'P0001'; end if;
      v_release := v_listing.quantity_available;
      if v_release > 0 then
        update public.inventory_holdings
        set quantity_reserved = quantity_reserved - v_release,
            updated_at = statement_timestamp()
        where id = v_listing.inventory_holding_id and quantity_reserved >= v_release;
        if not found then raise exception 'MARKETPLACE_RESERVATION_DRIFT' using errcode = 'P0001'; end if;
      end if;
      update public.marketplace_listings
      set status = 'rejected', quantity_available = 0, version = version + 1,
          moderation_reason = v_reason, moderated_by_staff_user_id = p_staff_user_id,
          moderated_at = now(), updated_at = statement_timestamp()
      where id = v_listing.id returning * into v_listing;
    end if;

    insert into public.marketplace_action_receipts (
      game_session_id, actor_type, actor_id, action, idempotency_key,
      request_fingerprint, target_public_id, result
    ) values (
      p_game_session_id, 'staff_user', p_staff_user_id, 'admin_' || v_action, v_key,
      v_fingerprint, v_listing.public_id,
      jsonb_build_object('targetType', 'listing', 'status', v_listing.status,
        'version', v_listing.version, 'updatedAt', v_listing.updated_at)
    );
    insert into public.marketplace_audit_events (
      game_session_id, listing_id, actor_type, actor_id, action, metadata
    ) values (
      p_game_session_id, v_listing.id, 'staff_user', p_staff_user_id,
      'listing_' || v_action, jsonb_build_object('reason', v_reason,
        'version', v_listing.version)
    );
    return query select 'applied', v_listing.public_id, 'listing',
      v_listing.status, v_listing.version, v_listing.updated_at;
    return;
  end if;

  if lower(btrim(p_target_key)) !~ '^dsp_[0-9a-f]{32}$'
    or v_action not in ('refund_buyer', 'resolve_seller', 'reject')
  then raise exception 'MARKETPLACE_ADMIN_ACTION_INVALID' using errcode = 'P0001'; end if;

  select * into v_dispute from public.marketplace_disputes
  where game_session_id = p_game_session_id
    and public_id = lower(btrim(p_target_key)) for update;
  if not found then raise exception 'MARKETPLACE_DISPUTE_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_dispute.version <> p_expected_version then
    raise exception 'MARKETPLACE_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_dispute.status <> 'open' then
    return query select 'replayed', v_dispute.public_id, 'dispute',
      v_dispute.status, v_dispute.version, v_dispute.updated_at;
    return;
  end if;
  select * into v_order from public.marketplace_orders
  where id = v_dispute.order_id for update;

  if v_action = 'refund_buyer' then
    select * into v_buyer_holding from public.inventory_holdings
    where game_session_id = p_game_session_id and player_id = v_order.buyer_player_id
      and store_item_id = v_order.store_item_id for update;
    if not found or v_buyer_holding.quantity_owned - v_buyer_holding.quantity_reserved < v_order.quantity then
      raise exception 'MARKETPLACE_REFUND_ITEM_UNAVAILABLE' using errcode = 'P0001';
    end if;
    select * into v_seller_balance from public.account_balances
    where game_session_id = p_game_session_id and player_id = v_order.seller_player_id
      and account_type = 'cash' and currency_code = v_order.currency_code for update;
    if not found or v_seller_balance.balance < v_order.seller_proceeds then
      raise exception 'MARKETPLACE_REFUND_SELLER_BALANCE_INSUFFICIENT' using errcode = 'P0001';
    end if;
    perform 1 from public.marketplace_treasury_balances
    where game_session_id = p_game_session_id and currency_code = v_order.currency_code
      and fee_balance >= v_order.fee_amount and tax_balance >= v_order.tax_amount
    for update;
    if not found then raise exception 'MARKETPLACE_REFUND_TREASURY_INSUFFICIENT' using errcode = 'P0001'; end if;

    select * into v_ledger from public.record_player_ledger_entry(
      p_game_session_id, v_order.seller_player_id, 'cash', -v_order.seller_proceeds,
      v_order.currency_code, 'debit', 'marketplace', 'marketplace_refund_debit',
      v_order.id, 'staff_user', p_staff_user_id,
      jsonb_build_object('disputeKey', v_dispute.public_id)
    );
    select * into v_ledger from public.record_player_ledger_entry(
      p_game_session_id, v_order.buyer_player_id, 'cash', v_order.buyer_total,
      v_order.currency_code, 'credit', 'marketplace', 'marketplace_refund_credit',
      v_order.id, 'staff_user', p_staff_user_id,
      jsonb_build_object('disputeKey', v_dispute.public_id)
    );
    update public.marketplace_treasury_balances
    set fee_balance = fee_balance - v_order.fee_amount,
        tax_balance = tax_balance - v_order.tax_amount,
        updated_at = statement_timestamp()
    where game_session_id = p_game_session_id and currency_code = v_order.currency_code;

    insert into public.marketplace_financial_postings (
      game_session_id, order_id, posting_group, posting_type, player_id, amount, currency_code
    ) values
      (p_game_session_id, v_order.id, 'refund', 'buyer_refund_credit', v_order.buyer_player_id,
        v_order.buyer_total, v_order.currency_code),
      (p_game_session_id, v_order.id, 'refund', 'seller_refund_debit', v_order.seller_player_id,
        -v_order.seller_proceeds, v_order.currency_code),
      (p_game_session_id, v_order.id, 'refund', 'fee_refund_debit', null,
        -v_order.fee_amount, v_order.currency_code),
      (p_game_session_id, v_order.id, 'refund', 'tax_refund_debit', null,
        -v_order.tax_amount, v_order.currency_code);
    if (
      select round(sum(amount), 4) from public.marketplace_financial_postings
      where order_id = v_order.id and posting_group = 'refund'
    ) <> 0 then raise exception 'MARKETPLACE_POSTING_IMBALANCE' using errcode = 'P0001'; end if;

    update public.inventory_holdings
    set quantity_owned = quantity_owned - v_order.quantity,
        updated_at = statement_timestamp()
    where id = v_buyer_holding.id;
    insert into public.inventory_holdings (
      game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
    ) values (
      p_game_session_id, v_order.seller_player_id, v_order.store_item_id,
      v_order.quantity, 0
    ) on conflict on constraint inventory_holdings_scope_unique do update
      set quantity_owned = public.inventory_holdings.quantity_owned + excluded.quantity_owned,
          updated_at = statement_timestamp();
    insert into public.inventory_events (
      game_session_id, player_id, store_item_id, quantity_delta, event_type,
      source_domain, source_action, source_id, metadata
    ) values
      (p_game_session_id, v_order.buyer_player_id, v_order.store_item_id,
        -v_order.quantity, 'MARKETPLACE_REFUNDED', 'marketplace', 'marketplace_refund',
        v_order.id, jsonb_build_object('disputeKey', v_dispute.public_id)),
      (p_game_session_id, v_order.seller_player_id, v_order.store_item_id,
        v_order.quantity, 'MARKETPLACE_RETURNED', 'marketplace', 'marketplace_refund',
        v_order.id, jsonb_build_object('disputeKey', v_dispute.public_id));
    update public.marketplace_orders
    set status = 'refunded', version = version + 1, refunded_at = now(),
        updated_at = statement_timestamp()
    where id = v_order.id;
    update public.marketplace_disputes
    set status = 'resolved_buyer', version = version + 1,
        resolution_note = v_reason, resolved_by_staff_user_id = p_staff_user_id,
        resolved_at = now(), updated_at = statement_timestamp()
    where id = v_dispute.id returning * into v_dispute;
  elsif v_action = 'resolve_seller' then
    update public.marketplace_orders
    set status = 'completed', version = version + 1,
        updated_at = statement_timestamp()
    where id = v_order.id;
    update public.marketplace_disputes
    set status = 'resolved_seller', version = version + 1,
        resolution_note = v_reason, resolved_by_staff_user_id = p_staff_user_id,
        resolved_at = now(), updated_at = statement_timestamp()
    where id = v_dispute.id returning * into v_dispute;
  else
    update public.marketplace_orders
    set status = 'completed', version = version + 1,
        updated_at = statement_timestamp()
    where id = v_order.id;
    update public.marketplace_disputes
    set status = 'rejected', version = version + 1,
        resolution_note = v_reason, resolved_by_staff_user_id = p_staff_user_id,
        resolved_at = now(), updated_at = statement_timestamp()
    where id = v_dispute.id returning * into v_dispute;
  end if;

  insert into public.marketplace_action_receipts (
    game_session_id, actor_type, actor_id, action, idempotency_key,
    request_fingerprint, target_public_id, result
  ) values (
    p_game_session_id, 'staff_user', p_staff_user_id, 'admin_' || v_action, v_key,
    v_fingerprint, v_dispute.public_id,
    jsonb_build_object('targetType', 'dispute', 'status', v_dispute.status,
      'version', v_dispute.version, 'updatedAt', v_dispute.updated_at)
  );
  insert into public.marketplace_audit_events (
    game_session_id, order_id, dispute_id, actor_type, actor_id, action, metadata
  ) values (
    p_game_session_id, v_order.id, v_dispute.id, 'staff_user', p_staff_user_id,
    'dispute_' || v_action, jsonb_build_object('reason', v_reason,
      'version', v_dispute.version)
  );
  return query select 'applied', v_dispute.public_id, 'dispute',
    v_dispute.status, v_dispute.version, v_dispute.updated_at;
end;
$$;

create or replace function public.set_marketplace_policy_admin_v2(
  p_game_session_id uuid,
  p_staff_user_id uuid,
  p_marketplace_enabled boolean,
  p_cross_country_trading_enabled boolean,
  p_moderation_required boolean,
  p_fee_rate numeric,
  p_tax_rate numeric,
  p_listing_duration_hours integer,
  p_purchase_reservation_minutes integer,
  p_dispute_window_days integer,
  p_disputes_enabled boolean,
  p_country_fee_overrides jsonb,
  p_blocked_country_codes text[]
)
returns public.marketplace_policies
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_policy public.marketplace_policies%rowtype;
begin
  if p_game_session_id is null or p_staff_user_id is null
    or p_marketplace_enabled is null or p_cross_country_trading_enabled is null
    or p_moderation_required is null or p_disputes_enabled is null
    or p_fee_rate not between 0 and 0.25 or p_tax_rate not between 0 and 0.25
    or p_listing_duration_hours not between 1 and 720
    or p_purchase_reservation_minutes not between 1 and 60
    or p_dispute_window_days not between 1 and 30
    or p_country_fee_overrides is null or jsonb_typeof(p_country_fee_overrides) <> 'object'
    or p_blocked_country_codes is null
  then raise exception 'MARKETPLACE_POLICY_INVALID' using errcode = 'P0001'; end if;
  perform 1 from public.staff_users where id = p_staff_user_id;
  if not found then raise exception 'MARKETPLACE_STAFF_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.marketplace_policies (
    game_session_id, marketplace_enabled, cross_country_trading_enabled,
    moderation_required, fee_rate, tax_rate, listing_duration_hours,
    purchase_reservation_minutes, dispute_window_days, disputes_enabled,
    country_fee_overrides, blocked_country_codes, updated_by_staff_user_id
  ) values (
    p_game_session_id, p_marketplace_enabled, p_cross_country_trading_enabled,
    p_moderation_required, p_fee_rate, p_tax_rate, p_listing_duration_hours,
    p_purchase_reservation_minutes, p_dispute_window_days, p_disputes_enabled,
    p_country_fee_overrides, p_blocked_country_codes, p_staff_user_id
  ) on conflict (game_session_id) do update set
    marketplace_enabled = excluded.marketplace_enabled,
    cross_country_trading_enabled = excluded.cross_country_trading_enabled,
    moderation_required = excluded.moderation_required,
    fee_rate = excluded.fee_rate,
    tax_rate = excluded.tax_rate,
    listing_duration_hours = excluded.listing_duration_hours,
    purchase_reservation_minutes = excluded.purchase_reservation_minutes,
    dispute_window_days = excluded.dispute_window_days,
    disputes_enabled = excluded.disputes_enabled,
    country_fee_overrides = excluded.country_fee_overrides,
    blocked_country_codes = excluded.blocked_country_codes,
    updated_by_staff_user_id = excluded.updated_by_staff_user_id
  returning * into v_policy;
  return v_policy;
end;
$$;

alter table public.marketplace_policies enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_purchase_reservations enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_disputes enable row level security;
alter table public.marketplace_treasury_balances enable row level security;
alter table public.marketplace_financial_postings enable row level security;
alter table public.marketplace_action_receipts enable row level security;
alter table public.marketplace_audit_events enable row level security;

revoke all on table public.marketplace_policies from public, anon, authenticated, service_role;
revoke all on table public.marketplace_listings from public, anon, authenticated, service_role;
revoke all on table public.marketplace_purchase_reservations from public, anon, authenticated, service_role;
revoke all on table public.marketplace_orders from public, anon, authenticated, service_role;
revoke all on table public.marketplace_disputes from public, anon, authenticated, service_role;
revoke all on table public.marketplace_treasury_balances from public, anon, authenticated, service_role;
revoke all on table public.marketplace_financial_postings from public, anon, authenticated, service_role;
revoke all on table public.marketplace_action_receipts from public, anon, authenticated, service_role;
revoke all on table public.marketplace_audit_events from public, anon, authenticated, service_role;

grant select on table public.marketplace_policies to service_role;
grant select on table public.marketplace_listings to service_role;
grant select on table public.marketplace_purchase_reservations to service_role;
grant select on table public.marketplace_orders to service_role;
grant select on table public.marketplace_disputes to service_role;
grant select on table public.marketplace_treasury_balances to service_role;
grant select on table public.marketplace_financial_postings to service_role;
grant select on table public.marketplace_action_receipts to service_role;
grant select on table public.marketplace_audit_events to service_role;

revoke all on function public.reject_marketplace_immutable_mutation_v1() from public, anon, authenticated, service_role;
revoke all on function public.marketplace_request_fingerprint_v1(jsonb) from public, anon, authenticated;
revoke all on function public.marketplace_player_country_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_marketplace_purchase_reservations_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.expire_marketplace_listings_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.create_marketplace_listing_public_v2(uuid, uuid, text, integer, numeric, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.activate_marketplace_listing_public_v1(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.reserve_marketplace_purchase_public_v1(uuid, uuid, text, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.settle_marketplace_purchase_public_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_marketplace_listing_public_v2(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.open_marketplace_dispute_public_v2(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_marketplace_admin_v2(uuid, uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.set_marketplace_policy_admin_v2(uuid, uuid, boolean, boolean, boolean, numeric, numeric, integer, integer, integer, boolean, jsonb, text[]) from public, anon, authenticated;

grant execute on function public.marketplace_request_fingerprint_v1(jsonb) to service_role;
grant execute on function public.marketplace_player_country_v1(uuid, uuid) to service_role;
grant execute on function public.expire_marketplace_purchase_reservations_v1(uuid, timestamptz) to service_role;
grant execute on function public.expire_marketplace_listings_v1(uuid, timestamptz) to service_role;
grant execute on function public.create_marketplace_listing_public_v2(uuid, uuid, text, integer, numeric, text, text, integer, text) to service_role;
grant execute on function public.activate_marketplace_listing_public_v1(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.reserve_marketplace_purchase_public_v1(uuid, uuid, text, integer, bigint, text) to service_role;
grant execute on function public.settle_marketplace_purchase_public_v1(uuid, uuid, text) to service_role;
grant execute on function public.cancel_marketplace_listing_public_v2(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.open_marketplace_dispute_public_v2(uuid, uuid, text, text, text) to service_role;
grant execute on function public.review_marketplace_admin_v2(uuid, uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.set_marketplace_policy_admin_v2(uuid, uuid, boolean, boolean, boolean, numeric, numeric, integer, integer, integer, boolean, jsonb, text[]) to service_role;

commit;
