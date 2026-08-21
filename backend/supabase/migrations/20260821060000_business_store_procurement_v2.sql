-- Business V2 Phase 3B: canonical Store procurement.
--
-- Business procurement reuses the canonical Store catalog, country snapshot
-- pricing policy, Store stock account, Business cash authority, and canonical
-- inventory journal. Quote and receipt tables are operation evidence only; they
-- are not a parallel catalog, inventory projection, money authority, or pricing
-- engine.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.business_store_purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default ('bsq_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null,
  business_id uuid not null,
  created_by_player_id uuid not null,
  store_item_id uuid not null,
  country_profile_id uuid not null references public.country_profiles(id),
  country_snapshot_id uuid not null references public.country_economic_snapshots(id),
  snapshot_sequence integer not null,
  quantity integer not null,
  item_currency_code text not null,
  settlement_currency_code text not null,
  base_unit_price numeric(14, 2) not null,
  inflation_multiplier numeric(10, 4) not null,
  location_multiplier numeric(10, 4) not null,
  scarcity_multiplier numeric(10, 4) not null,
  item_local_final_unit_price numeric(14, 2) not null,
  item_local_final_total_price numeric(14, 2) not null,
  exchange_rate numeric(18, 8) not null,
  final_unit_price numeric(14, 2) not null,
  final_total_price numeric(14, 2) not null,
  pricing_version text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'CREATED',
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz null,
  cancelled_at timestamptz null,

  constraint business_store_purchase_quotes_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_store_purchase_quotes_actor_scope_fk
    foreign key (game_session_id, created_by_player_id)
    references public.players(game_session_id, id),
  constraint business_store_purchase_quotes_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id),
  constraint business_store_purchase_quotes_public_key_format
    check (public_key ~ '^bsq_[0-9a-f]{32}$'),
  constraint business_store_purchase_quotes_public_key_unique unique (public_key),
  constraint business_store_purchase_quotes_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_store_purchase_quotes_quantity_positive
    check (quantity between 1 and 100000),
  constraint business_store_purchase_quotes_snapshot_sequence_valid
    check (snapshot_sequence >= 0),
  constraint business_store_purchase_quotes_currency_format
    check (
      item_currency_code ~ '^[A-Z0-9_]{3,16}$'
      and settlement_currency_code ~ '^[A-Z0-9_]{3,16}$'
    ),
  constraint business_store_purchase_quotes_prices_non_negative
    check (
      base_unit_price >= 0
      and item_local_final_unit_price >= 0
      and item_local_final_total_price >= 0
      and exchange_rate >= 0
      and final_unit_price >= 0
      and final_total_price >= 0
    ),
  constraint business_store_purchase_quotes_multipliers_non_negative
    check (
      inflation_multiplier >= 0
      and location_multiplier >= 0
      and scarcity_multiplier >= 0
    ),
  constraint business_store_purchase_quotes_pricing_version_not_blank
    check (length(btrim(pricing_version)) > 0),
  constraint business_store_purchase_quotes_idempotency_key_valid
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_store_purchase_quotes_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_store_purchase_quotes_status_valid
    check (status in ('CREATED', 'USED', 'EXPIRED', 'CANCELLED')),
  constraint business_store_purchase_quotes_expiry_valid
    check (expires_at > created_at),
  constraint business_store_purchase_quotes_used_state_valid
    check (
      (status = 'USED' and used_at is not null)
      or (status <> 'USED' and used_at is null)
    ),
  constraint business_store_purchase_quotes_cancelled_state_valid
    check (
      (status = 'CANCELLED' and cancelled_at is not null)
      or (status <> 'CANCELLED' and cancelled_at is null)
    )
);

create index business_store_purchase_quotes_business_status_expiry_idx
  on public.business_store_purchase_quotes(
    game_session_id,
    business_id,
    status,
    expires_at
  );
create index business_store_purchase_quotes_item_created_idx
  on public.business_store_purchase_quotes(
    game_session_id,
    store_item_id,
    created_at desc
  );

comment on table public.business_store_purchase_quotes is
  'Short-lived Business procurement quote evidence produced by the canonical Store pricing resolver.';
comment on column public.business_store_purchase_quotes.created_by_player_id is
  'Authenticated Business owner who requested the quote; never the monetary or inventory owner.';
comment on column public.business_store_purchase_quotes.country_snapshot_id is
  'Exact canonical country economic snapshot used by resolve_store_quote_pricing_v2.';

create table public.business_store_purchases (
  id uuid primary key default gen_random_uuid(),
  public_key text not null default ('bsr_' || encode(gen_random_bytes(16), 'hex')),
  game_session_id uuid not null,
  business_id uuid not null,
  purchased_by_player_id uuid not null,
  quote_id uuid not null references public.business_store_purchase_quotes(id),
  store_item_id uuid not null,
  quantity integer not null,
  currency_code text not null,
  final_unit_price numeric(14, 2) not null,
  final_total_price numeric(14, 2) not null,
  ledger_entry_id uuid null references public.ledger_entries(id),
  inventory_transaction_id uuid null references public.inventory_transactions(id),
  idempotency_key text not null,
  request_hash text not null,
  request_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'STARTED',
  client_submitted_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz null,

  constraint business_store_purchases_business_scope_fk
    foreign key (game_session_id, business_id)
    references public.business_entities(game_session_id, id),
  constraint business_store_purchases_actor_scope_fk
    foreign key (game_session_id, purchased_by_player_id)
    references public.players(game_session_id, id),
  constraint business_store_purchases_item_scope_fk
    foreign key (game_session_id, store_item_id)
    references public.store_items(game_session_id, id),
  constraint business_store_purchases_public_key_format
    check (public_key ~ '^bsr_[0-9a-f]{32}$'),
  constraint business_store_purchases_public_key_unique unique (public_key),
  constraint business_store_purchases_quote_unique unique (quote_id),
  constraint business_store_purchases_idempotency_unique
    unique (game_session_id, business_id, idempotency_key),
  constraint business_store_purchases_quantity_positive
    check (quantity between 1 and 100000),
  constraint business_store_purchases_currency_format
    check (currency_code ~ '^[A-Z0-9_]{3,16}$'),
  constraint business_store_purchases_prices_non_negative
    check (final_unit_price >= 0 and final_total_price >= 0),
  constraint business_store_purchases_idempotency_key_valid
    check (length(btrim(idempotency_key)) between 8 and 160),
  constraint business_store_purchases_request_hash_valid
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint business_store_purchases_request_metadata_object
    check (jsonb_typeof(request_metadata) = 'object'),
  constraint business_store_purchases_status_valid
    check (status in ('STARTED', 'COMPLETED')),
  constraint business_store_purchases_completed_state_valid
    check (
      (status = 'COMPLETED'
        and completed_at is not null
        and ledger_entry_id is not null
        and inventory_transaction_id is not null)
      or (status = 'STARTED'
        and completed_at is null
        and ledger_entry_id is null
        and inventory_transaction_id is null)
    )
);

create index business_store_purchases_business_created_idx
  on public.business_store_purchases(
    game_session_id,
    business_id,
    created_at desc
  );
create index business_store_purchases_item_created_idx
  on public.business_store_purchases(
    game_session_id,
    store_item_id,
    created_at desc
  );

comment on table public.business_store_purchases is
  'Immutable Business procurement receipt evidence. Business cash and warehouse holdings remain authoritative in the canonical ledger and inventory projections.';

alter table public.business_store_purchase_quotes enable row level security;
alter table public.business_store_purchases enable row level security;

create or replace function public.create_business_store_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_item_key text,
  p_quantity integer,
  p_idempotency_key text,
  p_effective_at timestamptz default statement_timestamp()
)
returns table (
  business_key text,
  quote_key text,
  item_key text,
  item_name text,
  quantity integer,
  country_code text,
  item_currency_code text,
  settlement_currency_code text,
  base_unit_price numeric,
  inflation_multiplier numeric,
  location_multiplier numeric,
  scarcity_multiplier numeric,
  item_local_final_unit_price numeric,
  item_local_final_total_price numeric,
  exchange_rate numeric,
  final_unit_price numeric,
  final_total_price numeric,
  pricing_version text,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_effective_at, statement_timestamp());
  v_item_key text := lower(btrim(coalesce(p_item_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_business record;
  v_item public.store_items%rowtype;
  v_country public.country_profiles%rowtype;
  v_pricing record;
  v_quote public.business_store_purchase_quotes%rowtype;
  v_game_status text;
  v_request_hash text;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_item_key !~ '^[a-z0-9_-]{1,64}$' then
    raise exception 'STORE_ITEM_KEY_INVALID' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'STORE_QUOTE_QUANTITY_INVALID' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.item_key = v_item_key;
  if not found then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'businessId', v_business.business_id,
        'storeItemId', v_item.id,
        'quantity', p_quantity,
        'routeKey', 'players.me.business.store.quotes.v2'
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':',
      'business-store-quote-v2',
      p_game_session_id::text,
      v_business.business_id::text,
      v_idempotency_key
    ),
    0
  ));

  select quote_row.*
  into v_quote
  from public.business_store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.business_id = v_business.business_id
    and quote_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_quote.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;

    return query
    select
      v_business.business_key,
      v_quote.public_key,
      item_row.item_key,
      item_row.name,
      v_quote.quantity,
      v_business.country_code,
      v_quote.item_currency_code,
      v_quote.settlement_currency_code,
      v_quote.base_unit_price,
      v_quote.inflation_multiplier,
      v_quote.location_multiplier,
      v_quote.scarcity_multiplier,
      v_quote.item_local_final_unit_price,
      v_quote.item_local_final_total_price,
      v_quote.exchange_rate,
      v_quote.final_unit_price,
      v_quote.final_total_price,
      v_quote.pricing_version,
      v_quote.expires_at,
      true
    from public.store_items as item_row
    where item_row.id = v_quote.store_item_id;
    return;
  end if;

  select session_row.status
  into v_game_status
  from public.game_sessions as session_row
  where session_row.id = p_game_session_id
  for share;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game_status = 'disabled' then
    raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
  end if;
  if v_game_status = 'archived' then
    raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_game_status <> 'active' then
    raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if v_item.status <> 'active' or v_item.visibility <> 'visible' then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select country_row.*
  into v_country
  from public.country_profiles as country_row
  where country_row.country_code = upper(btrim(v_business.country_code))
    and country_row.status = 'active';
  if not found then
    raise exception 'BUSINESS_COUNTRY_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if upper(btrim(v_business.currency_code)) !~ '^[A-Z0-9_]{3,16}$' then
    raise exception 'BUSINESS_CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  select * into v_pricing
  from public.resolve_store_quote_pricing_v2(
    p_game_session_id,
    v_item.id,
    v_country.id,
    upper(btrim(v_business.currency_code)),
    p_quantity,
    v_now
  );

  if v_pricing.stock_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  insert into public.business_store_purchase_quotes(
    game_session_id,
    business_id,
    created_by_player_id,
    store_item_id,
    country_profile_id,
    country_snapshot_id,
    snapshot_sequence,
    quantity,
    item_currency_code,
    settlement_currency_code,
    base_unit_price,
    inflation_multiplier,
    location_multiplier,
    scarcity_multiplier,
    item_local_final_unit_price,
    item_local_final_total_price,
    exchange_rate,
    final_unit_price,
    final_total_price,
    pricing_version,
    idempotency_key,
    request_hash,
    status,
    created_at,
    expires_at
  ) values (
    p_game_session_id,
    v_business.business_id,
    p_player_id,
    v_pricing.store_item_id,
    v_pricing.country_profile_id,
    v_pricing.country_snapshot_id,
    v_pricing.snapshot_sequence,
    p_quantity,
    v_pricing.item_currency_code,
    v_pricing.settlement_currency_code,
    v_pricing.base_unit_price,
    v_pricing.inflation_multiplier,
    v_pricing.location_multiplier,
    v_pricing.scarcity_multiplier,
    v_pricing.item_local_final_unit_price,
    v_pricing.item_local_final_total_price,
    v_pricing.exchange_rate,
    v_pricing.final_unit_price,
    v_pricing.final_total_price,
    v_pricing.pricing_version,
    v_idempotency_key,
    v_request_hash,
    'CREATED',
    v_now,
    v_pricing.expires_at
  ) returning * into v_quote;

  return query select
    v_business.business_key,
    v_quote.public_key,
    v_pricing.item_key,
    v_pricing.item_name,
    v_quote.quantity,
    v_business.country_code,
    v_quote.item_currency_code,
    v_quote.settlement_currency_code,
    v_quote.base_unit_price,
    v_quote.inflation_multiplier,
    v_quote.location_multiplier,
    v_quote.scarcity_multiplier,
    v_quote.item_local_final_unit_price,
    v_quote.item_local_final_total_price,
    v_quote.exchange_rate,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    v_quote.pricing_version,
    v_quote.expires_at,
    false;
end
$function$;

create or replace function public.purchase_business_store_quote_v2(
  p_game_session_id uuid,
  p_player_id uuid,
  p_quote_key text,
  p_idempotency_key text,
  p_client_submitted_at timestamptz default null,
  p_request_metadata jsonb default '{}'::jsonb
)
returns table (
  business_key text,
  receipt_key text,
  quote_key text,
  item_key text,
  item_name text,
  quantity integer,
  final_unit_price numeric,
  final_total_price numeric,
  currency_code text,
  warehouse_quantity_owned numeric,
  warehouse_average_unit_cost numeric,
  completed_at timestamptz,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public, economy_private, extensions, pg_temp
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_quote_key text := lower(btrim(coalesce(p_quote_key, '')));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_business record;
  v_quote public.business_store_purchase_quotes%rowtype;
  v_purchase public.business_store_purchases%rowtype;
  v_item public.store_items%rowtype;
  v_balance public.account_balances%rowtype;
  v_ledger record;
  v_inventory_transaction jsonb;
  v_warehouse_account_id uuid;
  v_holding public.inventory_holdings%rowtype;
  v_game_status text;
  v_request_hash text;
begin
  if p_game_session_id is null or p_player_id is null then
    raise exception 'PLAYER_SCOPE_REQUIRED' using errcode = 'P0001';
  end if;
  if v_quote_key !~ '^bsq_[0-9a-f]{32}$' then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if length(v_idempotency_key) not between 8 and 160 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_request_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'INVALID_REQUEST_METADATA' using errcode = 'P0001';
  end if;

  select * into v_business
  from public.resolve_player_business_v2(p_game_session_id, p_player_id);

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':',
      'business-store-purchase-v2',
      p_game_session_id::text,
      v_business.business_id::text,
      v_idempotency_key
    ),
    0
  ));

  select quote_row.*
  into v_quote
  from public.business_store_purchase_quotes as quote_row
  where quote_row.game_session_id = p_game_session_id
    and quote_row.business_id = v_business.business_id
    and quote_row.public_key = v_quote_key
  for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_request_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'gameSessionId', p_game_session_id,
        'businessId', v_business.business_id,
        'quoteId', v_quote.id,
        'routeKey', 'players.me.business.store.purchases.v2'
      )::text,
      'sha256'
    ),
    'hex'
  );

  select purchase_row.*
  into v_purchase
  from public.business_store_purchases as purchase_row
  where purchase_row.game_session_id = p_game_session_id
    and purchase_row.business_id = v_business.business_id
    and purchase_row.idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_purchase.request_hash <> v_request_hash then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_purchase.status <> 'COMPLETED' then
      raise exception 'IDEMPOTENCY_IN_PROGRESS' using errcode = 'P0001';
    end if;

    v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
      p_game_session_id,
      v_business.business_id,
      'warehouse'
    );

    select holding_row.*
    into v_holding
    from public.inventory_holdings as holding_row
    where holding_row.game_session_id = p_game_session_id
      and holding_row.inventory_account_id = v_warehouse_account_id
      and holding_row.game_item_id = (
        select item_row.game_item_id
        from public.store_items as item_row
        where item_row.id = v_purchase.store_item_id
      );

    return query
    select
      v_business.business_key,
      v_purchase.public_key,
      v_quote.public_key,
      item_row.item_key,
      item_row.name,
      v_purchase.quantity,
      v_purchase.final_unit_price,
      v_purchase.final_total_price,
      v_purchase.currency_code,
      coalesce(v_holding.quantity_owned, 0),
      coalesce(v_holding.average_unit_cost, 0),
      v_purchase.completed_at,
      true
    from public.store_items as item_row
    where item_row.id = v_purchase.store_item_id;
    return;
  end if;

  select session_row.status
  into v_game_status
  from public.game_sessions as session_row
  where session_row.id = p_game_session_id
  for share;
  if not found then
    raise exception 'GAME_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_game_status = 'disabled' then
    raise exception 'GAME_SESSION_DISABLED' using errcode = 'P0001';
  end if;
  if v_game_status = 'archived' then
    raise exception 'GAME_SESSION_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_game_status <> 'active' then
    raise exception 'GAME_SESSION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if v_quote.status <> 'CREATED' then
    raise exception 'QUOTE_NOT_USABLE' using errcode = 'P0001';
  end if;
  if v_quote.expires_at <= v_now then
    update public.business_store_purchase_quotes
    set status = 'EXPIRED'
    where id = v_quote.id;
    raise exception 'QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select item_row.*
  into v_item
  from public.store_items as item_row
  where item_row.game_session_id = p_game_session_id
    and item_row.id = v_quote.store_item_id
  for update;
  if not found then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_item.status <> 'active' or v_item.visibility <> 'visible' then
    raise exception 'STORE_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_item.game_item_id is null or v_item.inventory_account_id is null then
    raise exception 'ITEM_CANONICAL_CONTEXT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_item.stock_quantity < v_quote.quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  v_warehouse_account_id := economy_private.ensure_business_inventory_account_v2(
    p_game_session_id,
    v_business.business_id,
    'warehouse'
  );
  perform public.ensure_business_bank_account_v2(
    p_game_session_id,
    v_business.business_id
  );

  select balance_row.*
  into v_balance
  from public.account_balances as balance_row
  where balance_row.game_session_id = p_game_session_id
    and balance_row.business_id = v_business.business_id
    and balance_row.currency_code = v_quote.settlement_currency_code
  for update;
  if not found or v_balance.balance < v_quote.final_total_price then
    raise exception 'INSUFFICIENT_BUSINESS_BALANCE' using errcode = 'P0001';
  end if;

  insert into public.business_store_purchases(
    game_session_id,
    business_id,
    purchased_by_player_id,
    quote_id,
    store_item_id,
    quantity,
    currency_code,
    final_unit_price,
    final_total_price,
    idempotency_key,
    request_hash,
    request_metadata,
    status,
    client_submitted_at
  ) values (
    p_game_session_id,
    v_business.business_id,
    p_player_id,
    v_quote.id,
    v_quote.store_item_id,
    v_quote.quantity,
    v_quote.settlement_currency_code,
    v_quote.final_unit_price,
    v_quote.final_total_price,
    v_idempotency_key,
    v_request_hash,
    coalesce(p_request_metadata, '{}'::jsonb),
    'STARTED',
    p_client_submitted_at
  ) returning * into v_purchase;

  select * into v_ledger
  from public.record_business_ledger_entry_v2(
    p_game_session_id,
    v_business.business_id,
    -v_quote.final_total_price,
    v_quote.settlement_currency_code,
    'debit',
    'business',
    'store_procurement_purchase',
    v_purchase.id,
    'player',
    p_player_id,
    jsonb_build_object(
      'business_key', v_business.business_key,
      'quote_key', v_quote.public_key,
      'receipt_key', v_purchase.public_key,
      'store_item_key', v_item.item_key,
      'game_item_id', v_item.game_item_id,
      'quantity', v_quote.quantity,
      'pricing_version', v_quote.pricing_version,
      'country_snapshot_id', v_quote.country_snapshot_id,
      'final_unit_price', v_quote.final_unit_price,
      'final_total_price', v_quote.final_total_price,
      'currency_code', v_quote.settlement_currency_code
    ) || coalesce(p_request_metadata, '{}'::jsonb)
  );

  v_inventory_transaction := economy_private.post_inventory_transaction_v2(
    p_game_session_id,
    'purchase',
    'business',
    'store_procurement_purchase',
    v_purchase.id,
    concat('business-store:', v_idempotency_key),
    jsonb_build_object(
      'businessKey', v_business.business_key,
      'quoteKey', v_quote.public_key,
      'receiptKey', v_purchase.public_key,
      'storeItemKey', v_item.item_key,
      'pricingVersion', v_quote.pricing_version,
      'countrySnapshotId', v_quote.country_snapshot_id,
      'ledgerEntryId', v_ledger.ledger_entry_id,
      'purchasedByPlayerId', p_player_id
    ),
    jsonb_build_array(
      jsonb_build_object(
        'inventoryAccountId', v_item.inventory_account_id,
        'gameItemId', v_item.game_item_id,
        'storeItemId', v_item.id,
        'quantityDelta', -v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_item.price,
        'currencyCode', v_item.currency_code,
        'metadata', jsonb_build_object('side', 'store_stock')
      ),
      jsonb_build_object(
        'inventoryAccountId', v_warehouse_account_id,
        'gameItemId', v_item.game_item_id,
        'quantityDelta', v_quote.quantity,
        'reservationDelta', 0,
        'unitCost', v_quote.final_unit_price,
        'currencyCode', v_quote.settlement_currency_code,
        'metadata', jsonb_build_object(
          'side', 'business_warehouse',
          'businessKey', v_business.business_key,
          'settledAcquisitionPrice', v_quote.final_unit_price
        )
      )
    )
  );

  update public.store_items
  set stock_quantity = stock_quantity - v_quote.quantity
  where id = v_item.id
    and game_session_id = p_game_session_id;

  select holding_row.*
  into v_holding
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = p_game_session_id
    and holding_row.inventory_account_id = v_warehouse_account_id
    and holding_row.game_item_id = v_item.game_item_id;
  if not found then
    raise exception 'INVENTORY_POSTING_RESULT_MISSING' using errcode = 'P0001';
  end if;

  update public.business_store_purchase_quotes
  set status = 'USED', used_at = v_now
  where id = v_quote.id;

  update public.business_store_purchases
  set
    ledger_entry_id = v_ledger.ledger_entry_id,
    inventory_transaction_id = (v_inventory_transaction->>'transactionId')::uuid,
    status = 'COMPLETED',
    completed_at = v_now
  where id = v_purchase.id
  returning * into v_purchase;

  return query select
    v_business.business_key,
    v_purchase.public_key,
    v_quote.public_key,
    v_item.item_key,
    v_item.name,
    v_purchase.quantity,
    v_purchase.final_unit_price,
    v_purchase.final_total_price,
    v_purchase.currency_code,
    v_holding.quantity_owned,
    v_holding.average_unit_cost,
    v_purchase.completed_at,
    false;
end
$function$;

comment on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) is
  'Creates an idempotent short-lived Business procurement quote using Business country/currency context and the canonical Store pricing resolver.';
comment on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) is
  'Atomically debits first-class Business cash and posts canonical Store stock into the Business warehouse at the settled weighted-average acquisition cost.';

revoke all on table public.business_store_purchase_quotes
  from public, anon, authenticated;
revoke all on table public.business_store_purchases
  from public, anon, authenticated;

revoke all on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_business_store_quote_v2(
  uuid, uuid, text, integer, text, timestamptz
) to service_role;

revoke all on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_business_store_quote_v2(
  uuid, uuid, text, text, timestamptz, jsonb
) to service_role;

commit;
